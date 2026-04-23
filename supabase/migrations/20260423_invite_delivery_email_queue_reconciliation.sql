-- Reconciles invite delivery + email queue schema to the app's intended shape.
-- Why the app depends on this:
-- - admin invite flows read and write invite delivery metadata on public.invites
-- - queued email delivery depends on public.email_jobs and public.claim_email_jobs()
-- - auth onboarding updates public.invites via public.handle_new_user()
--
-- This migration is safe to run on an existing database:
-- - enums are created or extended only when needed
-- - columns are added only when missing
-- - existing invite status data is preserved and normalized
-- - email_jobs is created or amended in place
-- - no tables are dropped or recreated
--
-- Manual preflight query for duplicate active email jobs:
-- select
--   kind,
--   lower(email) as normalized_email,
--   count(*) as active_job_count,
--   array_agg(id order by created_at asc) as job_ids
-- from public.email_jobs
-- where status in ('pending', 'retrying', 'processing')
-- group by kind, lower(email)
-- having count(*) > 1;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'invite_delivery_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.invite_delivery_status as enum (
      'pending',
      'accepted',
      'revoked',
      'expired',
      'failed'
    );
  end if;
end
$$;

alter type public.invite_delivery_status add value if not exists 'pending';
alter type public.invite_delivery_status add value if not exists 'accepted';
alter type public.invite_delivery_status add value if not exists 'revoked';
alter type public.invite_delivery_status add value if not exists 'expired';
alter type public.invite_delivery_status add value if not exists 'failed';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'email_job_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.email_job_kind as enum ('access_email', 'password_recovery');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'email_job_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.email_job_status as enum ('pending', 'processing', 'retrying', 'sent', 'failed');
  end if;
end
$$;

alter table public.invites
  add column if not exists status public.invite_delivery_status,
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_attempts integer not null default 0,
  add column if not exists last_error text;

do $$
declare
  status_udt text;
begin
  select c.udt_name
  into status_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'invites'
    and c.column_name = 'status';

  if status_udt is null then
    alter table public.invites
      add column status public.invite_delivery_status;
  elsif status_udt <> 'invite_delivery_status' then
    alter table public.invites
      alter column status drop default;

    alter table public.invites
      drop constraint if exists invites_status_check;

    execute $sql$
      alter table public.invites
      alter column status type public.invite_delivery_status
      using (
        case
          when status is null then 'pending'::public.invite_delivery_status
          when status::text in ('accepted') then 'accepted'::public.invite_delivery_status
          when status::text in ('revoked') then 'revoked'::public.invite_delivery_status
          when status::text in ('expired') then 'expired'::public.invite_delivery_status
          when status::text in ('failed', 'rate_limited') then 'failed'::public.invite_delivery_status
          when status::text in ('queued', 'sent', 'pending') then 'pending'::public.invite_delivery_status
          else 'pending'::public.invite_delivery_status
        end
      )
    $sql$;
  end if;
end
$$;

update public.invites
set status = case
  when accepted_at is not null then 'accepted'::public.invite_delivery_status
  when status::text in ('rate_limited', 'failed') then 'failed'::public.invite_delivery_status
  when status::text in ('queued', 'sent') then 'pending'::public.invite_delivery_status
  when status is null then 'pending'::public.invite_delivery_status
  else status
end;

alter table public.invites
  alter column status set default 'pending'::public.invite_delivery_status,
  alter column status set not null;

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  kind public.email_job_kind not null,
  email text not null,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  status public.email_job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  requested_by_admin_id uuid references public.users(id) on delete set null,
  provider_response_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.email_jobs
  add column if not exists dedupe_key text,
  add column if not exists provider_response_id text;

create index if not exists email_jobs_status_available_idx
  on public.email_jobs (status, available_at, created_at);

create index if not exists email_jobs_email_created_idx
  on public.email_jobs (email, created_at desc);

create index if not exists email_jobs_requested_by_created_idx
  on public.email_jobs (requested_by_admin_id, created_at desc);

do $$
begin
  if exists (
    select 1
    from public.email_jobs
    where status in ('pending', 'retrying', 'processing')
    group by kind, lower(email)
    having count(*) > 1
  ) then
    raise exception using
      message = 'Cannot create email_jobs_active_kind_email_idx because duplicate active email jobs already exist.',
      hint = 'Run this query first: select kind, lower(email) as normalized_email, count(*) as active_job_count, array_agg(id order by created_at asc) as job_ids from public.email_jobs where status in (''pending'', ''retrying'', ''processing'') group by kind, lower(email) having count(*) > 1;';
  end if;
end
$$;

create unique index if not exists email_jobs_active_kind_email_idx
  on public.email_jobs (kind, lower(email))
  where status in ('pending', 'retrying', 'processing');

alter table public.email_jobs enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.invites%rowtype;
begin
  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is null then
    raise exception 'Email is not invited';
  end if;

  insert into public.users (id, name, email, role)
  values (new.id, invite_row.display_name, new.email, invite_row.role)
  on conflict (id) do nothing;

  update public.invites
  set accepted_at = now(),
      status = 'accepted',
      last_error = null
  where lower(email) = lower(new.email);

  return new;
end;
$$;

create or replace function public.claim_email_jobs(job_limit integer default 10)
returns setof public.email_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select email_jobs.id
    from public.email_jobs
    where email_jobs.status in ('pending', 'retrying')
      and email_jobs.available_at <= now()
    order by email_jobs.created_at
    for update skip locked
    limit job_limit
  ),
  claimed as (
    update public.email_jobs
    set status = 'processing',
        attempts = public.email_jobs.attempts + 1,
        locked_at = now(),
        updated_at = now()
    where public.email_jobs.id in (select candidates.id from candidates)
    returning public.email_jobs.*
  )
  select * from claimed;
end;
$$;
