create table if not exists public.leaderboard_event_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.leaderboard_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint leaderboard_event_reactions_unique unique (event_id, user_id, emoji)
);

create index if not exists leaderboard_event_reactions_event_id_idx
  on public.leaderboard_event_reactions (event_id);

create index if not exists leaderboard_event_reactions_user_id_idx
  on public.leaderboard_event_reactions (user_id);
