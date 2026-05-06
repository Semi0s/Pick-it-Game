create table if not exists public.leaderboard_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'points_awarded',
      'perfect_pick',
      'rank_moved_up',
      'rank_moved_down',
      'daily_winner',
      'trophy_awarded'
    )
  ),
  scope_type text not null check (scope_type in ('global', 'group')),
  group_id uuid references public.groups(id) on delete cascade,
  match_id text references public.matches(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  related_user_id uuid references public.users(id) on delete cascade,
  points_delta integer,
  rank_delta integer,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint leaderboard_events_scope_group_chk check (
    (scope_type = 'global' and group_id is null)
    or (scope_type = 'group' and group_id is not null)
  )
);

create index if not exists leaderboard_events_match_idx
  on public.leaderboard_events (match_id);

create index if not exists leaderboard_events_scope_created_idx
  on public.leaderboard_events (scope_type, created_at desc);

create index if not exists leaderboard_events_group_created_idx
  on public.leaderboard_events (group_id, created_at desc);

create index if not exists leaderboard_events_type_idx
  on public.leaderboard_events (event_type, created_at desc);

create index if not exists leaderboard_events_user_idx
  on public.leaderboard_events (user_id, created_at desc);
