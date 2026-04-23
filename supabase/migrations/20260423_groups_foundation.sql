-- Adds the Phase 1 foundation for private groups/pools without changing prediction ownership.
-- Global predictions remain unchanged: there is still one prediction set per user across the app.
-- These new tables model social competition containers only:
-- - groups
-- - group_members
-- - group_invites
--
-- Important compatibility note:
-- this app's current profile table is public.users (keyed to auth.users.id),
-- so group foreign keys intentionally reference public.users.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'group_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.group_status as enum ('active', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'group_member_role'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.group_member_role as enum ('manager', 'member');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'group_invite_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.group_invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
  end if;
end
$$;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references public.users(id) on delete set null,
  created_by_user_id uuid references public.users(id) on delete set null,
  membership_limit integer not null default 15,
  status public.group_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manager_limits (
  user_id uuid primary key references public.users(id) on delete cascade,
  max_groups integer not null default 1,
  max_members_per_group integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.manager_limits
  add column if not exists max_groups integer not null default 1,
  add column if not exists max_members_per_group integer not null default 15,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manager_limits_max_groups_positive'
      and conrelid = 'public.manager_limits'::regclass
  ) then
    alter table public.manager_limits
      add constraint manager_limits_max_groups_positive
      check (max_groups > 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manager_limits_max_members_per_group_positive'
      and conrelid = 'public.manager_limits'::regclass
  ) then
    alter table public.manager_limits
      add constraint manager_limits_max_members_per_group_positive
      check (max_members_per_group > 0);
  end if;
end
$$;

alter table public.groups
  add column if not exists owner_user_id uuid references public.users(id) on delete set null,
  add column if not exists created_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists membership_limit integer not null default 15,
  add column if not exists status public.group_status not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'groups_membership_limit_positive'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_membership_limit_positive
      check (membership_limit > 0);
  end if;
end
$$;

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

alter table public.group_members
  add column if not exists group_id uuid references public.groups(id) on delete cascade,
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists role public.group_member_role not null default 'member',
  add column if not exists joined_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_members_group_id_user_id_key'
      and conrelid = 'public.group_members'::regclass
  ) then
    alter table public.group_members
      add constraint group_members_group_id_user_id_key unique (group_id, user_id);
  end if;
end
$$;

create table if not exists public.group_invites (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.group_invites
  add column if not exists group_id uuid references public.groups(id) on delete cascade,
  add column if not exists email text,
  add column if not exists normalized_email text,
  add column if not exists invited_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists suggested_display_name text,
  add column if not exists status public.group_invite_status not null default 'pending',
  add column if not exists token_hash text,
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.group_invites
set normalized_email = lower(email)
where normalized_email is null
  and email is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_invites_normalized_email_check'
      and conrelid = 'public.group_invites'::regclass
  ) then
    alter table public.group_invites
      add constraint group_invites_normalized_email_check
      check (normalized_email = lower(email));
  end if;
end
$$;

create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

create index if not exists group_members_group_id_idx
  on public.group_members (group_id);

create index if not exists group_invites_group_id_idx
  on public.group_invites (group_id);

create index if not exists group_invites_normalized_email_idx
  on public.group_invites (normalized_email);

create unique index if not exists group_invites_token_hash_unique_idx
  on public.group_invites (token_hash);

create unique index if not exists group_invites_active_group_email_idx
  on public.group_invites (group_id, normalized_email)
  where status = 'pending';

create index if not exists manager_limits_user_id_idx
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

insert into public.group_members (group_id, user_id, role)
select g.id, g.owner_user_id, 'manager'
from public.groups g
where g.owner_user_id is not null
on conflict (group_id, user_id) do update
  set role = 'manager';

drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists set_manager_limits_updated_at on public.manager_limits;
create trigger set_manager_limits_updated_at
before update on public.manager_limits
for each row execute function public.set_updated_at();

drop trigger if exists set_group_invites_updated_at on public.group_invites;
create trigger set_group_invites_updated_at
before update on public.group_invites
for each row execute function public.set_updated_at();

drop trigger if exists sync_group_invites_email_fields on public.group_invites;
create trigger sync_group_invites_email_fields
before insert or update on public.group_invites
for each row execute function public.sync_group_invite_email_fields();

drop trigger if exists on_group_created_add_manager_membership on public.groups;
create trigger on_group_created_add_manager_membership
after insert on public.groups
for each row execute function public.handle_group_owner_membership();

alter table public.groups enable row level security;
alter table public.manager_limits enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

drop policy if exists "Super admins manage manager limits" on public.manager_limits;
drop policy if exists "Users can read own manager limits" on public.manager_limits;
drop policy if exists "Super admins manage groups" on public.groups;
drop policy if exists "Authenticated users can create groups" on public.groups;
drop policy if exists "Group members can read their groups" on public.groups;
drop policy if exists "Group managers can update managed groups" on public.groups;

create policy "Super admins manage groups"
on public.groups for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Super admins manage manager limits"
on public.manager_limits for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Users can read own manager limits"
on public.manager_limits for select
to authenticated
using (user_id = auth.uid());

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
using (public.is_group_manager(groups.id, auth.uid()))
with check (
  public.is_group_manager(groups.id, auth.uid())
  and public.can_set_group_membership_limit(auth.uid(), membership_limit)
);

drop policy if exists "Super admins manage group members" on public.group_members;
drop policy if exists "Users can read own group memberships" on public.group_members;
drop policy if exists "Group managers can read group memberships" on public.group_members;

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

drop policy if exists "Super admins manage group invites" on public.group_invites;
drop policy if exists "Group managers can read group invites" on public.group_invites;
drop policy if exists "Group managers can create pending invites" on public.group_invites;

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
