alter table public.group_rulesets
  add column if not exists group_stage_mode text not null default 'full_scores'
  check (group_stage_mode in ('full_scores', 'light_seed_builder'));

create table if not exists public.user_group_seed_rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  group_name text not null,
  team_id text not null references public.teams(id) on delete cascade,
  rank_position integer not null check (rank_position between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_name, team_id),
  unique (user_id, group_name, rank_position)
);

create table if not exists public.user_best_third_rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  team_id text not null references public.teams(id) on delete cascade,
  rank_position integer not null check (rank_position >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, team_id),
  unique (user_id, rank_position)
);

create index if not exists user_group_seed_rankings_user_group_idx
  on public.user_group_seed_rankings (user_id, group_name, rank_position);

create index if not exists user_best_third_rankings_user_rank_idx
  on public.user_best_third_rankings (user_id, rank_position);

drop trigger if exists set_user_group_seed_rankings_updated_at on public.user_group_seed_rankings;
create trigger set_user_group_seed_rankings_updated_at
before update on public.user_group_seed_rankings
for each row execute function public.set_updated_at();

drop trigger if exists set_user_best_third_rankings_updated_at on public.user_best_third_rankings;
create trigger set_user_best_third_rankings_updated_at
before update on public.user_best_third_rankings
for each row execute function public.set_updated_at();

alter table public.user_group_seed_rankings enable row level security;
alter table public.user_best_third_rankings enable row level security;

revoke all on public.user_group_seed_rankings from anon, authenticated, public;
revoke all on public.user_best_third_rankings from anon, authenticated, public;

grant select, insert, update, delete on public.user_group_seed_rankings to service_role;
grant select, insert, update, delete on public.user_best_third_rankings to service_role;
