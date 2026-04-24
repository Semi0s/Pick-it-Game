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
create type public.invite_delivery_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired',
  'failed'
);
create type public.group_status as enum ('active', 'archived');
create type public.group_member_role as enum ('manager', 'member');
create type public.group_invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.email_job_kind as enum ('access_email', 'password_recovery', 'group_invite_email');
create type public.email_job_status as enum ('pending', 'processing', 'retrying', 'sent', 'failed');

create table public.invites (
  email text primary key,
  display_name text not null,
  role public.user_role not null default 'player',
  accepted_at timestamptz,
  status public.invite_delivery_status not null default 'pending',
  last_sent_at timestamptz,
  send_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
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

create table public.manager_limits (
  user_id uuid primary key references public.users(id) on delete cascade,
  max_groups integer not null default 1,
  max_members_per_group integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_limits_max_groups_positive check (max_groups > 0),
  constraint manager_limits_max_members_per_group_positive check (max_members_per_group > 0)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references public.users(id) on delete set null,
  created_by_user_id uuid references public.users(id) on delete set null,
  membership_limit integer not null default 15,
  status public.group_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_membership_limit_positive check (membership_limit > 0)
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null,
  normalized_email text not null,
  invited_by_user_id uuid references public.users(id) on delete set null,
  suggested_display_name text,
  status public.group_invite_status not null default 'pending',
  token_hash text not null unique,
  expires_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  last_sent_at timestamptz,
  send_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_invites_normalized_email_check check (normalized_email = lower(email))
);

create index email_jobs_status_available_idx
  on public.email_jobs (status, available_at, created_at);

create index email_jobs_email_created_idx
  on public.email_jobs (email, created_at desc);

create index email_jobs_requested_by_created_idx
  on public.email_jobs (requested_by_admin_id, created_at desc);

create unique index email_jobs_active_dedupe_idx
  on public.email_jobs (dedupe_key)
  where status in ('pending', 'retrying', 'processing')
    and dedupe_key is not null;

create index group_members_user_id_idx
  on public.group_members (user_id);

create index group_members_group_id_idx
  on public.group_members (group_id);

create index group_invites_group_id_idx
  on public.group_invites (group_id);

create index group_invites_normalized_email_idx
  on public.group_invites (normalized_email);

create unique index group_invites_active_group_email_idx
  on public.group_invites (group_id, normalized_email)
  where status = 'pending';

create index manager_limits_user_id_idx
  on public.manager_limits (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_group_invite_email_fields()
returns trigger
language plpgsql
as $$
begin
  new.normalized_email = lower(new.email);
  return new;
end;
$$;

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

create or replace function public.is_super_admin(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = target_user_id
      and role = 'admin'
  );
$$;

create or replace function public.group_member_count(target_group_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.group_members
  where group_id = target_group_id;
$$;

create or replace function public.active_owned_group_count(target_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.groups
  where owner_user_id = target_user_id
    and status = 'active';
$$;

create or replace function public.can_create_group(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manager_limits ml
    where ml.user_id = target_user_id
      and public.active_owned_group_count(target_user_id) < ml.max_groups
  );
$$;

create or replace function public.can_set_group_membership_limit(target_user_id uuid, requested_limit integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin(target_user_id) then true
    else exists (
      select 1
      from public.manager_limits ml
      where ml.user_id = target_user_id
        and requested_limit <= ml.max_members_per_group
    )
  end;
$$;

create or replace function public.group_has_open_seat(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups
    where id = target_group_id
      and membership_limit > public.group_member_count(target_group_id)
  );
$$;

create or replace function public.is_group_manager(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    left join public.group_members gm
      on gm.group_id = g.id
     and gm.user_id = target_user_id
     and gm.role = 'manager'
    where g.id = target_group_id
      and (g.owner_user_id = target_user_id or gm.id is not null)
  );
$$;

create or replace function public.handle_group_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is not null then
    insert into public.group_members (group_id, user_id, role)
    values (new.id, new.owner_user_id, 'manager')
    on conflict (group_id, user_id) do update
      set role = 'manager';
  end if;

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
      and email_jobs.attempts < email_jobs.max_attempts
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
  group_invite_row public.group_invites%rowtype;
  derived_name text;
begin
  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    insert into public.users (id, name, email, role)
    values (new.id, invite_row.display_name, new.email, invite_row.role)
    on conflict (id) do nothing;

    return new;
  end if;

  select *
  into group_invite_row
  from public.group_invites
  where normalized_email = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if group_invite_row.id is null then
    raise exception 'Email is not invited';
  end if;

  derived_name := coalesce(nullif(trim(group_invite_row.suggested_display_name), ''), split_part(new.email, '@', 1));

  insert into public.users (id, name, email, role)
  values (new.id, derived_name, new.email, 'player')
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger set_manager_limits_updated_at
before update on public.manager_limits
for each row execute function public.set_updated_at();

create trigger set_group_invites_updated_at
before update on public.group_invites
for each row execute function public.set_updated_at();

create trigger sync_group_invites_email_fields
before insert or update on public.group_invites
for each row execute function public.sync_group_invite_email_fields();

create trigger on_group_created_add_manager_membership
after insert on public.groups
for each row execute function public.handle_group_owner_membership();

alter table public.invites enable row level security;
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.bracket_picks enable row level security;
alter table public.side_picks enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.email_jobs enable row level security;
alter table public.manager_limits enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

drop policy if exists "Users manage own predictions before kickoff" on public.predictions;
drop policy if exists "Users can read own predictions" on public.predictions;
drop policy if exists "Admins can read all predictions" on public.predictions;
drop policy if exists "Authenticated users can read predictions after kickoff" on public.predictions;
drop policy if exists "Authenticated users can read predictions for live or final matches" on public.predictions;

create policy "Authenticated users can read predictions for live or final matches"
on public.predictions for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.status in ('live', 'final')
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

create policy "Super admins manage manager limits"
on public.manager_limits for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Users can read own manager limits"
on public.manager_limits for select
to authenticated
using (user_id = auth.uid());

create policy "Super admins manage groups"
on public.groups for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Authenticated users can create groups"
on public.groups for insert
to authenticated
with check (
  (
    public.is_super_admin(auth.uid())
    or (
      owner_user_id = auth.uid()
      and created_by_user_id = auth.uid()
      and public.can_create_group(auth.uid())
      and public.can_set_group_membership_limit(auth.uid(), membership_limit)
    )
  )
  and status = 'active'
);

create policy "Group members can read their groups"
on public.groups for select
to authenticated
using (
  public.is_super_admin(auth.uid())
  or exists (
    select 1
    from public.group_members
    where group_members.group_id = groups.id
      and group_members.user_id = auth.uid()
  )
);

create policy "Group managers can update managed groups"
on public.groups for update
to authenticated
using (
  public.is_group_manager(groups.id, auth.uid())
)
with check (
  public.is_group_manager(groups.id, auth.uid())
  and public.can_set_group_membership_limit(auth.uid(), membership_limit)
);

create policy "Super admins manage group members"
on public.group_members for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Users can read own group memberships"
on public.group_members for select
to authenticated
using (user_id = auth.uid());

create policy "Group managers can read group memberships"
on public.group_members for select
to authenticated
using (public.is_group_manager(group_id, auth.uid()));

create policy "Super admins manage group invites"
on public.group_invites for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Group managers can read group invites"
on public.group_invites for select
to authenticated
using (public.is_group_manager(group_id, auth.uid()));

create policy "Group managers can create pending invites"
on public.group_invites for insert
to authenticated
with check (
  public.is_group_manager(group_id, auth.uid())
  and invited_by_user_id = auth.uid()
  and status = 'pending'
  and public.group_has_open_seat(group_id)
);
