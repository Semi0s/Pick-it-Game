alter table public.users
  add column if not exists plan_tier text not null default 'player';

alter table public.users
  drop constraint if exists users_plan_tier_check;

alter table public.users
  add constraint users_plan_tier_check
  check (plan_tier in ('player', 'captain', 'manager', 'director', 'managing_director'));

alter table public.manager_limits
  alter column max_members_per_group set default 30;

update public.manager_limits
set max_members_per_group = 30
where max_groups = 3
  and max_members_per_group = 4;

update public.users
set plan_tier = 'manager'
where role <> 'admin'
  and coalesce(plan_tier, 'player') = 'player'
  and exists (
    select 1
    from public.manager_limits
    where manager_limits.user_id = users.id
  );

update public.users
set plan_tier = 'manager'
where role <> 'admin'
  and coalesce(plan_tier, 'player') = 'player'
  and exists (
    select 1
    from public.group_members
    where group_members.user_id = users.id
      and group_members.role = 'manager'
  );

update public.users
set plan_tier = 'captain'
where role <> 'admin'
  and coalesce(plan_tier, 'player') = 'player'
  and exists (
    select 1
    from public.groups
    where groups.owner_user_id = users.id
  );

alter table public.groups
  add column if not exists description text;

alter table public.groups
  drop constraint if exists groups_description_length_check;

alter table public.groups
  add constraint groups_description_length_check
  check (description is null or char_length(description) <= 250);

create or replace function public.group_creation_limit_for_user(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_tier text;
  v_limit integer := 0;
  v_override integer;
begin
  if target_user_id is null then
    return 0;
  end if;

  if public.is_super_admin(target_user_id) then
    return null;
  end if;

  select coalesce(nullif(trim(users.plan_tier), ''), 'player')
  into v_plan_tier
  from public.users
  where users.id = target_user_id;

  if not found then
    return 0;
  end if;

  case v_plan_tier
    when 'captain' then v_limit := 1;
    when 'manager' then v_limit := 3;
    when 'director' then v_limit := 10;
    when 'managing_director' then v_limit := 25;
    else v_limit := 0;
  end case;

  select manager_limits.max_groups
  into v_override
  from public.manager_limits
  where manager_limits.user_id = target_user_id;

  if v_override is not null then
    v_limit := v_override;
  end if;

  return greatest(v_limit, 0);
end;
$$;

create or replace function public.group_membership_limit_for_user(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_tier text;
  v_limit integer := 0;
  v_override integer;
begin
  if target_user_id is null then
    return 0;
  end if;

  if public.is_super_admin(target_user_id) then
    return null;
  end if;

  select coalesce(nullif(trim(users.plan_tier), ''), 'player')
  into v_plan_tier
  from public.users
  where users.id = target_user_id;

  if not found then
    return 0;
  end if;

  case v_plan_tier
    when 'captain' then v_limit := 20;
    when 'manager' then v_limit := 30;
    when 'director' then v_limit := 100;
    when 'managing_director' then v_limit := 100;
    else v_limit := 0;
  end case;

  select manager_limits.max_members_per_group
  into v_override
  from public.manager_limits
  where manager_limits.user_id = target_user_id;

  if v_override is not null then
    v_limit := v_override;
  end if;

  return greatest(v_limit, 0);
end;
$$;

create or replace function public.effective_group_membership_limit(target_group_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_limit integer;
  v_owner_user_id uuid;
  v_owner_limit integer;
begin
  select groups.membership_limit, groups.owner_user_id
  into v_membership_limit, v_owner_user_id
  from public.groups
  where groups.id = target_group_id;

  if not found then
    return null;
  end if;

  if v_owner_user_id is null then
    return v_membership_limit;
  end if;

  v_owner_limit := public.group_membership_limit_for_user(v_owner_user_id);
  if v_owner_limit is null then
    return v_membership_limit;
  end if;

  return least(v_membership_limit, v_owner_limit);
end;
$$;

create or replace function public.can_create_group(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin(target_user_id) then true
    else
      coalesce(public.group_creation_limit_for_user(target_user_id), 0) > 0
      and public.active_owned_group_count(target_user_id) < coalesce(public.group_creation_limit_for_user(target_user_id), 0)
  end;
$$;

create or replace function public.can_set_group_membership_limit(target_user_id uuid, requested_limit integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin(target_user_id) then true
    else requested_limit <= coalesce(public.group_membership_limit_for_user(target_user_id), 0)
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
      and public.effective_group_membership_limit(target_group_id) > public.group_member_count(target_group_id)
  );
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
as $$
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
$$;
