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
