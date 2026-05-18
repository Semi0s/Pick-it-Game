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
    where groups.id = target_group_id
      and public.effective_group_membership_limit(target_group_id) > public.group_member_count(target_group_id)
  );
$$;
