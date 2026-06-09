alter table public.side_pick_packages
  add column if not exists lock_at timestamptz;

alter table public.side_pick_definitions
  add column if not exists eligible_team_ids text[] not null default '{}',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists side_pick_packages_active_lock_idx
  on public.side_pick_packages (active, lock_at);
