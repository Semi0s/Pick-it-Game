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

create table public.invites (
  email text primary key,
  display_name text not null,
  role public.user_role not null default 'player',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  avatar_url text,
  role public.user_role not null default 'player',
  total_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  set accepted_at = now()
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