create or replace function public.is_group_manager(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_super_admin(target_user_id)
    or exists (
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
