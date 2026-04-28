create table if not exists public.bracket_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  stage public.match_stage not null,
  predicted_winner_team_id text not null references public.teams(id),
  actual_winner_team_id text not null references public.teams(id),
  round_points integer not null default 0,
  champion_points integer not null default 0,
  points integer not null default 0,
  is_correct boolean not null default false,
  scored_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index if not exists bracket_scores_user_scored_idx
  on public.bracket_scores (user_id, scored_at desc);

create index if not exists bracket_scores_match_id_idx
  on public.bracket_scores (match_id);

alter table public.bracket_scores enable row level security;

drop policy if exists "Admins can read all bracket scores" on public.bracket_scores;
create policy "Admins can read all bracket scores"
on public.bracket_scores for select
to authenticated
using (public.is_admin());

drop policy if exists "Users can read own bracket scores" on public.bracket_scores;
create policy "Users can read own bracket scores"
on public.bracket_scores for select
to authenticated
using (user_id = auth.uid());
