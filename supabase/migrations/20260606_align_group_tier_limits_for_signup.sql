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
