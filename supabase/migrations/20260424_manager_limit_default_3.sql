-- Raises the default manager group allowance from 1 to 3.
-- This aligns new manager entitlements with the current product rule
-- and upgrades existing rows that still match the old default of 1.

alter table public.manager_limits
  alter column max_groups set default 3;

update public.manager_limits
set max_groups = 3,
    updated_at = now()
where max_groups = 1;
