alter table public.groups
  add column if not exists avatar_url text,
  add column if not exists access_mode text,
  add column if not exists group_kind text,
  add column if not exists parent_group_id uuid references public.groups(id) on delete set null;

update public.groups
set
  access_mode = coalesce(nullif(trim(access_mode), ''), 'open_by_code'),
  group_kind = coalesce(nullif(trim(group_kind), ''), 'standard')
where access_mode is null
   or trim(access_mode) = ''
   or group_kind is null
   or trim(group_kind) = '';

alter table public.groups
  alter column access_mode set default 'open_by_code',
  alter column group_kind set default 'standard';

alter table public.groups
  alter column access_mode set not null,
  alter column group_kind set not null;

alter table public.groups
  drop constraint if exists groups_access_mode_check,
  drop constraint if exists groups_group_kind_check;

alter table public.groups
  add constraint groups_access_mode_check
    check (access_mode in ('open_by_code', 'restricted_by_email', 'closed')),
  add constraint groups_group_kind_check
    check (group_kind in ('standard', 'captain_private'));

create table if not exists public.group_allowed_emails (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email_normalized text not null,
  display_name text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, email_normalized)
);

create table if not exists public.group_focus_teams (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  team_id text not null references public.teams(id) on delete cascade,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, team_id)
);

create table if not exists public.captains_passes (
  id uuid primary key default gen_random_uuid(),
  manager_group_id uuid not null unique references public.groups(id) on delete cascade,
  captain_user_id uuid references public.users(id) on delete set null,
  captain_email_normalized text,
  issued_by_user_id uuid references public.users(id) on delete set null,
  status text not null default 'available',
  manager_group_invite_allowance integer not null default 1,
  manager_group_invites_used integer not null default 0,
  captain_private_group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  expires_at timestamptz
);

alter table public.group_members
  add column if not exists join_source text,
  add column if not exists joined_invite_id uuid;

update public.group_members
set join_source = coalesce(nullif(trim(join_source), ''), 'direct')
where join_source is null or trim(join_source) = '';

alter table public.group_members
  alter column join_source set default 'direct',
  alter column join_source set not null;

alter table public.group_members
  drop constraint if exists group_members_join_source_check;

alter table public.group_members
  add constraint group_members_join_source_check
    check (join_source in ('direct', 'manager_code', 'manager_invite', 'captain_pass', 'captain_private_code', 'captain_private_invite'));

alter table public.group_invites
  add column if not exists invite_source text,
  add column if not exists captains_pass_id uuid references public.captains_passes(id) on delete set null;

update public.group_invites
set invite_source = coalesce(nullif(trim(invite_source), ''), 'manager_invite')
where invite_source is null or trim(invite_source) = '';

alter table public.group_invites
  alter column invite_source set default 'manager_invite',
  alter column invite_source set not null;

alter table public.group_invites
  drop constraint if exists group_invites_invite_source_check;

alter table public.group_invites
  add constraint group_invites_invite_source_check
    check (invite_source in ('manager_invite', 'captain_pass', 'captain_private_invite'));

create index if not exists group_allowed_emails_group_id_idx
  on public.group_allowed_emails (group_id);

create index if not exists group_allowed_emails_email_idx
  on public.group_allowed_emails (email_normalized);

create index if not exists group_focus_teams_group_id_idx
  on public.group_focus_teams (group_id);

create index if not exists group_members_join_source_idx
  on public.group_members (group_id, join_source);

create index if not exists group_invites_captains_pass_idx
  on public.group_invites (captains_pass_id)
  where captains_pass_id is not null;

create unique index if not exists captains_passes_captain_private_group_unique_idx
  on public.captains_passes (captain_private_group_id)
  where captain_private_group_id is not null;

create unique index if not exists captains_passes_captain_user_claimed_unique_idx
  on public.captains_passes (captain_user_id)
  where captain_user_id is not null
    and status in ('claimed', 'exhausted');

create or replace function public.group_allows_email(target_group_id uuid, target_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access_mode text;
begin
  select groups.access_mode
  into v_access_mode
  from public.groups
  where groups.id = target_group_id;

  if not found then
    return false;
  end if;

  if v_access_mode = 'closed' then
    return false;
  end if;

  if v_access_mode <> 'restricted_by_email' then
    return true;
  end if;

  if target_email is null or trim(target_email) = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.group_allowed_emails
    where group_allowed_emails.group_id = target_group_id
      and group_allowed_emails.email_normalized = lower(trim(target_email))
  );
end;
$$;

create or replace function public.redeem_access_code_for_new_user(
  auth_email text,
  auth_user_id uuid,
  raw_code text
)
returns public.access_codes
language plpgsql
security definer
set search_path = public
as $access_code$
declare
  v_normalized_code text;
  v_access_code_row public.access_codes%rowtype;
  v_existing_redemption_id uuid;
  v_target_group record;
begin
  v_normalized_code := public.normalize_access_code(raw_code);
  raise log '[access-code] redeem_access_code_for_new_user start email=% has_code=%', lower(auth_email), v_normalized_code is not null;

  if v_normalized_code is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  select *
  into v_access_code_row
  from public.access_codes
  where public.access_codes.normalized_code = v_normalized_code
  for update;

  if v_access_code_row.id is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  if not v_access_code_row.active then
    raise exception 'ACCESS_CODE_INACTIVE';
  end if;

  if v_access_code_row.expires_at is not null and v_access_code_row.expires_at <= now() then
    raise exception 'ACCESS_CODE_EXPIRED';
  end if;

  if v_access_code_row.max_uses is not null and v_access_code_row.used_count >= v_access_code_row.max_uses then
    raise exception 'ACCESS_CODE_FULL';
  end if;

  if v_access_code_row.group_id is not null then
    select
      groups.id,
      groups.status,
      groups.access_mode,
      groups.membership_limit,
      public.effective_group_membership_limit(groups.id) as effective_membership_limit,
      (
        select count(*)
        from public.group_members
        where group_members.group_id = groups.id
      ) as member_count
    into v_target_group
    from public.groups
    where groups.id = v_access_code_row.group_id;

    if v_target_group.id is null or v_target_group.status <> 'active' then
      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    if v_target_group.access_mode = 'closed' then
      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    if not public.group_allows_email(v_target_group.id, auth_email) then
      if v_target_group.access_mode = 'restricted_by_email' then
        raise exception 'ACCESS_CODE_GROUP_RESTRICTED';
      end if;

      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    if v_target_group.member_count >= v_target_group.effective_membership_limit then
      raise exception 'ACCESS_CODE_GROUP_FULL';
    end if;
  end if;

  select access_code_redemptions.id
  into v_existing_redemption_id
  from public.access_code_redemptions
  where access_code_redemptions.code_id = v_access_code_row.id
    and (
      access_code_redemptions.user_id = auth_user_id
      or access_code_redemptions.normalized_email = lower(auth_email)
    )
  limit 1;

  if v_existing_redemption_id is not null then
    return v_access_code_row;
  end if;

  update public.access_codes
  set used_count = public.access_codes.used_count + 1,
      updated_at = now()
  where public.access_codes.id = v_access_code_row.id
  returning * into v_access_code_row;

  raise log '[access-code] redeem_access_code_for_new_user counted usage email=% code_id=% group_id=%', lower(auth_email), v_access_code_row.id, v_access_code_row.group_id;

  return v_access_code_row;
end;
$access_code$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  invite_row public.invites%rowtype;
  group_invite_row public.group_invites%rowtype;
  access_code_row public.access_codes%rowtype;
  derived_name text;
  raw_access_code text;
  target_group_kind text;
  debug_step text := 'start';
begin
  debug_step := 'read_access_code';
  raw_access_code := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'access_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'accessCode'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'invite_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'share_code'), ''),
    null
  );

  debug_step := 'direct_invite_lookup';
  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    debug_step := 'insert_user_direct_invite';
    insert into public.users (id, name, email, preferred_language, role, plan_tier, needs_profile_setup)
    values (
      new.id,
      invite_row.display_name,
      new.email,
      coalesce(nullif(trim(invite_row.language), ''), 'en'),
      invite_row.role,
      coalesce(nullif(trim(invite_row.plan_tier), ''), 'player'),
      true
    )
    on conflict (id) do nothing;
    return new;
  end if;

  debug_step := 'group_invite_lookup';
  select *
  into group_invite_row
  from public.group_invites
  where normalized_email = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if group_invite_row.id is not null then
    debug_step := 'derive_group_invite_name';
    derived_name := coalesce(nullif(trim(group_invite_row.suggested_display_name), ''), split_part(new.email, '@', 1));
    debug_step := 'insert_user_group_invite';
    insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
    values (new.id, derived_name, new.email, coalesce(nullif(trim(group_invite_row.language), ''), 'en'), 'player', true)
    on conflict (id) do nothing;
    return new;
  end if;

  debug_step := 'redeem_access_code_for_new_user';
  access_code_row := public.redeem_access_code_for_new_user(new.email, new.id, raw_access_code);
  debug_step := 'derive_access_code_name';
  derived_name := split_part(new.email, '@', 1);

  debug_step := 'insert_user_access_code';
  insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
  values (
    new.id,
    derived_name,
    new.email,
    coalesce(nullif(trim(access_code_row.default_language), ''), 'en'),
    access_code_row.default_role,
    true
  )
  on conflict (id) do nothing;

  debug_step := 'insert_access_code_redemption';
  insert into public.access_code_redemptions (
    code_id,
    user_id,
    email,
    normalized_email,
    redeemed_at,
    status
  )
  values (
    access_code_row.id,
    new.id,
    new.email,
    lower(new.email),
    now(),
    'redeemed'
  )
  on conflict (code_id, user_id) do nothing;

  if access_code_row.group_id is not null then
    debug_step := 'read_access_code_group_kind';
    select groups.group_kind
    into target_group_kind
    from public.groups
    where groups.id = access_code_row.group_id;

    debug_step := 'insert_group_member';
    insert into public.group_members (group_id, user_id, role, join_source)
    values (
      access_code_row.group_id,
      new.id,
      'member'::public.group_member_role,
      case
        when target_group_kind = 'captain_private' then 'captain_private_code'
        else 'manager_code'
      end
    )
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
exception
  when others then
    raise exception 'HANDLE_NEW_USER_FAILED step=% sqlstate=% sqlerrm=%', debug_step, SQLSTATE, SQLERRM;
end;
$f$;

alter table public.group_allowed_emails enable row level security;
alter table public.group_focus_teams enable row level security;
alter table public.captains_passes enable row level security;

drop policy if exists "Group managers can read allowed group emails" on public.group_allowed_emails;
create policy "Group managers can read allowed group emails"
on public.group_allowed_emails for select
to authenticated
using (public.is_group_manager(group_id, auth.uid()));

drop policy if exists "Group managers manage allowed group emails" on public.group_allowed_emails;
create policy "Group managers manage allowed group emails"
on public.group_allowed_emails for all
to authenticated
using (public.is_group_manager(group_id, auth.uid()))
with check (public.is_group_manager(group_id, auth.uid()));

drop policy if exists "Group members can read focused teams" on public.group_focus_teams;
create policy "Group members can read focused teams"
on public.group_focus_teams for select
to authenticated
using (
  public.is_group_manager(group_id, auth.uid())
  or exists (
    select 1
    from public.group_members
    where group_members.group_id = group_focus_teams.group_id
      and group_members.user_id = auth.uid()
  )
);

drop policy if exists "Group managers manage focused teams" on public.group_focus_teams;
create policy "Group managers manage focused teams"
on public.group_focus_teams for all
to authenticated
using (public.is_group_manager(group_id, auth.uid()))
with check (public.is_group_manager(group_id, auth.uid()));

drop policy if exists "Managers and captains can read Captain's Passes" on public.captains_passes;
create policy "Managers and captains can read Captain's Passes"
on public.captains_passes for select
to authenticated
using (
  public.is_group_manager(manager_group_id, auth.uid())
  or captain_user_id = auth.uid()
);

drop policy if exists "Group managers manage Captain's Passes" on public.captains_passes;
create policy "Group managers manage Captain's Passes"
on public.captains_passes for all
to authenticated
using (public.is_group_manager(manager_group_id, auth.uid()))
with check (public.is_group_manager(manager_group_id, auth.uid()));

drop policy if exists "Group managers can create pending invites" on public.group_invites;
create policy "Group managers can create pending invites"
on public.group_invites for insert
to authenticated
with check (
  public.is_group_manager(group_id, auth.uid())
  and invited_by_user_id = auth.uid()
  and status = 'pending'
  and public.group_has_open_seat(group_id)
  and public.group_allows_email(group_id, email)
);

revoke all on public.group_allowed_emails from anon, authenticated, public;
revoke all on public.group_focus_teams from anon, authenticated, public;
revoke all on public.captains_passes from anon, authenticated, public;

grant select, insert, update, delete on public.group_allowed_emails to authenticated;
grant select, insert, update, delete on public.group_focus_teams to authenticated;
grant select, insert, update, delete on public.captains_passes to authenticated;

grant select, insert, update, delete on public.group_allowed_emails to service_role;
grant select, insert, update, delete on public.group_focus_teams to service_role;
grant select, insert, update, delete on public.captains_passes to service_role;
