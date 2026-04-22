create extension if not exists "pgcrypto";

create type public.user_role as enum ('player', 'admin');
create type public.match_stage as enum (
  'group',
  'round_of_32',
  'round_of_16',
  'quarterfinal',
  'semifinal',
  'final'
);
create type public.match_status as enum ('scheduled', 'live', 'final');
create type public.email_job_kind as enum ('access_email', 'password_recovery');
create type public.email_job_status as enum ('pending', 'processing', 'retrying', 'sent', 'failed');

create table public.invites (
  email text primary key,
  display_name text not null,
  role public.user_role not null default 'player',
  accepted_at timestamptz,
  status text not null default 'pending',
  last_sent_at timestamptz,
  send_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  constraint invites_status_check check (status in ('pending', 'accepted', 'revoked', 'expired', 'failed'))
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  avatar_url text,
  role public.user_role not null default 'player',
  status text not null default 'active',
  total_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_check check (status in ('active', 'inactive', 'suspended'))
);

create table public.teams (
  id text primary key,
  name text not null,
  short_name text not null,
  group_name text not null,
  fifa_rank integer,
  flag_emoji text not null default ''
);

create table public.matches (
  id text primary key,
  stage public.match_stage not null,
  group_name text,
  home_team_id text references public.teams(id),
  away_team_id text references public.teams(id),
  home_source text,
  away_source text,
  kickoff_time timestamptz not null,
  status public.match_status not null default 'scheduled',
  home_score integer,
  away_score integer,
  winner_team_id text references public.teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_has_teams_or_sources check (
    (home_team_id is not null or home_source is not null)
    and (away_team_id is not null or away_source is not null)
  )
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  predicted_winner_team_id text references public.teams(id),
  predicted_is_draw boolean not null default false,
  predicted_home_score integer,
  predicted_away_score integer,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id),
  constraint one_outcome_selected check (
    (predicted_is_draw = true and predicted_winner_team_id is null)
    or (predicted_is_draw = false)
  )
);

create table public.bracket_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  predicted_winner_team_id text not null references public.teams(id),
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create table public.side_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade unique,
  tournament_winner_team_id text references public.teams(id),
  golden_boot_player_name text,
  mvp_player_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leaderboard_entries (
  user_id uuid primary key references public.users(id) on delete cascade,
  total_points integer not null default 0,
  rank integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.email_jobs (
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

create index email_jobs_status_available_idx
  on public.email_jobs (status, available_at, created_at);

create index email_jobs_email_created_idx
  on public.email_jobs (email, created_at desc);

create index email_jobs_requested_by_created_idx
  on public.email_jobs (requested_by_admin_id, created_at desc);

create unique index email_jobs_active_kind_email_idx
  on public.email_jobs (kind, lower(email))
  where status in ('pending', 'retrying', 'processing');

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  );
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

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.invites enable row level security;
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.bracket_picks enable row level security;
alter table public.side_picks enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.email_jobs enable row level security;

drop policy if exists "Users manage own predictions before kickoff" on public.predictions;
drop policy if exists "Users can read own predictions" on public.predictions;
drop policy if exists "Admins can read all predictions" on public.predictions;
drop policy if exists "Authenticated users can read predictions after kickoff" on public.predictions;

create policy "Authenticated users can read predictions after kickoff"
on public.predictions for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time <= now()
  )
);

create policy "Users can insert own predictions before kickoff"
on public.predictions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
);

create policy "Users can update own predictions before kickoff"
on public.predictions for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
);

create policy "Users can delete own predictions before kickoff"
on public.predictions for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
);

create policy "Admins can read all bracket picks"
on public.bracket_picks for select
to authenticated
using (public.is_admin());

create policy "Admins can read all side picks"
on public.side_picks for select
to authenticated
using (public.is_admin());

create policy "Admins manage invites"
on public.invites for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read profiles"
on public.users for select
to authenticated
using (true);

create policy "Users can update own profile"
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Admins can update any profile"
on public.users for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Authenticated users can read teams"
on public.teams for select
to authenticated
using (true);

create policy "Authenticated users can read matches"
on public.matches for select
to authenticated
using (true);

create policy "Admins manage matches"
on public.matches for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Users manage own bracket picks"
on public.bracket_picks for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users manage own side picks"
on public.side_picks for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Authenticated users can read leaderboard"
on public.leaderboard_entries for select
to authenticated
using (true);
