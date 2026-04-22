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
      'queued',
      'sent',
      'failed',
      'rate_limited',
      'accepted'
    );
  end if;
end
$$;

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
  add column if not exists status public.invite_delivery_status not null default 'pending',
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_attempts integer not null default 0,
  add column if not exists last_error text;

update public.invites
set status = case
  when accepted_at is not null then 'accepted'::public.invite_delivery_status
  else status
end;

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  kind public.email_job_kind not null,
  email text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.email_job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  requested_by_admin_id uuid references public.users(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_jobs_status_available_idx
  on public.email_jobs (status, available_at, created_at);

create index if not exists email_jobs_email_created_idx
  on public.email_jobs (email, created_at desc);

create index if not exists email_jobs_requested_by_created_idx
  on public.email_jobs (requested_by_admin_id, created_at desc);

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
  values (new.id, invite_row.display_name, new.email, invite_row.role);

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
