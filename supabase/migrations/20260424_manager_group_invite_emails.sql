-- Adds real queue-backed manager group invite email support.
-- - extends email_job_kind with group_invite_email
-- - stores delivery metadata on group_invites
-- - switches active email job uniqueness to dedupe_key-aware matching so
--   the same email can hold active jobs for different groups safely

alter table public.email_jobs
  add column if not exists dedupe_key text;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.email_job_kind'::regtype
      and enumlabel = 'group_invite_email'
  ) then
    alter type public.email_job_kind add value 'group_invite_email';
  end if;
end
$$;

alter table public.group_invites
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_attempts integer not null default 0,
  add column if not exists last_error text;

update public.email_jobs
set dedupe_key = case
  when kind::text = 'group_invite_email'
    and payload ? 'groupId'
    and nullif(payload->>'groupId', '') is not null
    then 'group_invite:' || (payload->>'groupId') || ':' || lower(email)
  else kind::text || ':' || lower(email)
end
where dedupe_key is null;

drop index if exists public.email_jobs_active_kind_email_idx;
drop index if exists public.email_jobs_active_dedupe_idx;

create unique index if not exists email_jobs_active_dedupe_idx
  on public.email_jobs (dedupe_key)
  where status in ('pending', 'retrying', 'processing')
    and dedupe_key is not null;
