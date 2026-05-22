create table if not exists public.team_strength_ratings (
  id uuid primary key default gen_random_uuid(),
  tournament_id text,
  team_id text not null references public.teams(id) on delete cascade,
  rating numeric not null,
  source text,
  updated_at timestamptz not null default now()
);

create table if not exists public.team_stage_probabilities (
  id uuid primary key default gen_random_uuid(),
  tournament_id text,
  team_id text not null references public.teams(id) on delete cascade,
  stage text not null,
  baseline_probability numeric not null,
  source text,
  updated_at timestamptz not null default now()
);

alter table public.team_stage_probabilities
  drop constraint if exists team_stage_probabilities_stage_check;

alter table public.team_stage_probabilities
  add constraint team_stage_probabilities_stage_check
  check (stage in ('r32', 'r16', 'qf', 'sf', 'final', 'champion'));

create table if not exists public.probability_model_snapshots (
  id uuid primary key default gen_random_uuid(),
  tournament_id text,
  snapshot_kind text not null,
  source text,
  generated_at timestamptz not null default now(),
  metadata jsonb
);
