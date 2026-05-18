alter table public.group_invites
  add column if not exists claim_token text,
  add column if not exists email_status text not null default 'pending',
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_provider_message_id text,
  add column if not exists email_error text,
  add column if not exists email_attempt_count integer not null default 0,
  add column if not exists last_email_attempt_at timestamptz,
  add column if not exists last_resent_by_user_id uuid references public.users(id) on delete set null;

update public.group_invites
set
  email_status = case
    when status = 'accepted' then 'sent'
    when coalesce(last_error, '') <> '' then 'failed'
    when last_sent_at is not null then 'sent'
    else 'pending'
  end,
  email_sent_at = coalesce(email_sent_at, last_sent_at),
  email_error = coalesce(email_error, last_error),
  email_attempt_count = greatest(coalesce(email_attempt_count, 0), coalesce(send_attempts, 0))
where
  email_status is distinct from case
    when status = 'accepted' then 'sent'
    when coalesce(last_error, '') <> '' then 'failed'
    when last_sent_at is not null then 'sent'
    else 'pending'
  end
  or email_sent_at is null
  or email_error is null
  or email_attempt_count = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_invites_email_status_check'
      and conrelid = 'public.group_invites'::regclass
  ) then
    alter table public.group_invites
      add constraint group_invites_email_status_check
      check (email_status in ('pending', 'sent', 'failed'));
  end if;
end $$;
