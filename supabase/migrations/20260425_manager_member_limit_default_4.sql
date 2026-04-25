-- Sets the default manager group member allowance to 4 for future managers only.

alter table public.manager_limits
  alter column max_members_per_group set default 4;
