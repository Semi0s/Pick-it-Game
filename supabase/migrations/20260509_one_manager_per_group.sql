update public.group_members gm
set role = 'member'
from public.groups g
where gm.group_id = g.id
  and gm.role = 'manager'
  and (g.owner_user_id is null or gm.user_id <> g.owner_user_id);

insert into public.group_members (group_id, user_id, role)
select g.id, g.owner_user_id, 'manager'
from public.groups g
where g.owner_user_id is not null
on conflict (group_id, user_id) do update
  set role = 'manager';

create unique index if not exists group_members_one_manager_per_group_idx
  on public.group_members (group_id)
  where role = 'manager';

create or replace function public.enforce_owner_only_group_manager_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  group_owner_id uuid;
begin
  if new.role <> 'manager' then
    return new;
  end if;

  select owner_user_id
  into group_owner_id
  from public.groups
  where id = new.group_id;

  if group_owner_id is null then
    raise exception 'Only groups with an owner can have a manager membership.'
      using errcode = '23514';
  end if;

  if new.user_id <> group_owner_id then
    raise exception 'Only the current group owner can hold manager access for this group. Transfer ownership first.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.handle_group_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.group_members
  set role = 'member'
  where group_id = new.id
    and role = 'manager'
    and (new.owner_user_id is null or user_id <> new.owner_user_id);

  if new.owner_user_id is null then
    return new;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_user_id, 'manager')
  on conflict (group_id, user_id) do update
    set role = 'manager';

  return new;
end;
$$;

drop trigger if exists enforce_owner_only_group_manager_membership on public.group_members;
create trigger enforce_owner_only_group_manager_membership
before insert or update on public.group_members
for each row execute function public.enforce_owner_only_group_manager_membership();

drop trigger if exists on_group_created_add_manager_membership on public.groups;
create trigger on_group_created_add_manager_membership
after insert or update of owner_user_id on public.groups
for each row execute function public.handle_group_owner_membership();
