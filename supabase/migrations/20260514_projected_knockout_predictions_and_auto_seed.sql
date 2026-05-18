-- Explicit grants below are intentional because Supabase no longer auto-exposes new public tables to the Data API.

create table if not exists public.projected_bracket_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  predicted_home_score integer,
  predicted_away_score integer,
  predicted_winner_team_id text not null references public.teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id),
  constraint projected_bracket_predictions_home_score_nonnegative check (
    predicted_home_score is null or predicted_home_score >= 0
  ),
  constraint projected_bracket_predictions_away_score_nonnegative check (
    predicted_away_score is null or predicted_away_score >= 0
  )
);

create index if not exists projected_bracket_predictions_user_updated_idx
  on public.projected_bracket_predictions (user_id, updated_at desc);

create index if not exists projected_bracket_predictions_match_id_idx
  on public.projected_bracket_predictions (match_id);

alter table public.projected_bracket_predictions enable row level security;

drop policy if exists "Admins can read all projected bracket predictions" on public.projected_bracket_predictions;
create policy "Admins can read all projected bracket predictions"
on public.projected_bracket_predictions for select
to authenticated
using (public.is_admin());

drop policy if exists "Users manage own projected bracket predictions" on public.projected_bracket_predictions;
create policy "Users manage own projected bracket predictions"
on public.projected_bracket_predictions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into public.app_settings (key, boolean_value, integer_value)
values
  ('knockout_auto_seed_attempted', false, null),
  ('knockout_auto_seeded', false, null),
  ('knockout_manual_seeded', false, null)
on conflict (key) do nothing;

alter table public.match_events
drop constraint if exists match_events_event_type_check;

alter table public.match_events
add constraint match_events_event_type_check
check (event_type in ('sync', 'finalize', 'override', 'reopen', 'lock', 'batch_test_finalize', 'seed'));

revoke all on public.projected_bracket_predictions from anon, authenticated, public;

grant select, insert, update, delete on public.projected_bracket_predictions to authenticated;
grant select, insert, update, delete on public.projected_bracket_predictions to service_role;
