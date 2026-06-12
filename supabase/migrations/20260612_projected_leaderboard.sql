create table if not exists public.projected_leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  projection_key text not null,
  scope_type text not null check (scope_type in ('global', 'group')),
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rank integer not null,
  projected_points double precision not null default 0,
  created_at timestamptz not null default now(),
  constraint projected_leaderboard_snapshots_scope_group_chk check (
    (scope_type = 'global' and group_id is null)
    or (scope_type = 'group' and group_id is not null)
  )
);

create index if not exists projected_leaderboard_snapshots_scope_group_created_idx
  on public.projected_leaderboard_snapshots (scope_type, group_id, created_at desc);

create unique index if not exists projected_leaderboard_snapshots_global_projection_user_unique_idx
  on public.projected_leaderboard_snapshots (projection_key, user_id)
  where scope_type = 'global' and group_id is null;

create unique index if not exists projected_leaderboard_snapshots_group_projection_user_unique_idx
  on public.projected_leaderboard_snapshots (group_id, projection_key, user_id)
  where scope_type = 'group';

insert into public.app_settings (key, boolean_value, integer_value, text_value)
values ('projected_leaderboard_enabled', true, null, null)
on conflict (key) do update
set boolean_value = coalesce(public.app_settings.boolean_value, excluded.boolean_value),
    integer_value = coalesce(public.app_settings.integer_value, excluded.integer_value),
    text_value = coalesce(public.app_settings.text_value, excluded.text_value),
    updated_at = now();

revoke all on public.projected_leaderboard_snapshots from anon, authenticated, public;
grant select, insert, update, delete on public.projected_leaderboard_snapshots to service_role;
