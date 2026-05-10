create or replace function public.group_creation_limit_for_user(target_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select case
    when target_user_id is null then 0
    when public.is_super_admin(target_user_id) then null
    else greatest(
      coalesce(
        (select manager_limits.max_groups
         from public.manager_limits
         where manager_limits.user_id = target_user_id),
        (select case coalesce(nullif(trim(users.plan_tier), ''), 'player')
           when 'captain' then 1
           when 'manager' then 3
           when 'director' then 10
           when 'managing_director' then 25
           else 0
         end
         from public.users
         where users.id = target_user_id),
        0
      ),
      0
    )
  end;
$$;

create or replace function public.group_membership_limit_for_user(target_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select case
    when target_user_id is null then 0
    when public.is_super_admin(target_user_id) then null
    else greatest(
      coalesce(
        (select manager_limits.max_members_per_group
         from public.manager_limits
         where manager_limits.user_id = target_user_id),
        (select case coalesce(nullif(trim(users.plan_tier), ''), 'player')
           when 'captain' then 20
           when 'manager' then 30
           when 'director' then 100
           when 'managing_director' then 100
           else 0
         end
         from public.users
         where users.id = target_user_id),
        0
      ),
      0
    )
  end;
$$;

create or replace function public.effective_group_membership_limit(target_group_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select case
    when groups.owner_user_id is null then groups.membership_limit
    else least(
      groups.membership_limit,
      coalesce(public.group_membership_limit_for_user(groups.owner_user_id), groups.membership_limit)
    )
  end
  from public.groups
  where groups.id = target_group_id;
$$;
