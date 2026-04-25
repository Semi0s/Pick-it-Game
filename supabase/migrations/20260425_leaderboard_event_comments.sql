create table if not exists public.leaderboard_event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.leaderboard_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists leaderboard_event_comments_event_created_idx
  on public.leaderboard_event_comments (event_id, created_at);

create index if not exists leaderboard_event_comments_user_id_idx
  on public.leaderboard_event_comments (user_id);
