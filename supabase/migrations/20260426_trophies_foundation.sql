create table if not exists public.trophies (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  icon text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  trophy_id uuid not null references public.trophies(id) on delete cascade,
  awarded_at timestamptz not null default now()
);

create unique index if not exists user_trophies_user_trophy_unique_idx
  on public.user_trophies (user_id, trophy_id);

insert into public.trophies (key, name, description, icon)
values
  (
    'perfect_pick_first',
    'First Perfect Pick',
    'Awarded for landing your first exact score.',
    '🎯'
  ),
  (
    'perfect_pick_3',
    'Perfect Pick Hat Trick',
    'Awarded for reaching three exact-score predictions.',
    '🎯'
  ),
  (
    'big_climb',
    'Big Climb',
    'Awarded for a major jump up the leaderboard.',
    '📈'
  ),
  (
    'daily_winner',
    'Daily Winner',
    'Awarded for finishing the day on top.',
    '🏆'
  ),
  (
    'first_reaction',
    'First Reaction',
    'Awarded for joining the social activity feed with your first reaction.',
    '🔥'
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon;
