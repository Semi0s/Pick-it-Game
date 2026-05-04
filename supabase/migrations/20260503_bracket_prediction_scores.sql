alter table public.bracket_predictions
  add column if not exists predicted_home_score integer,
  add column if not exists predicted_away_score integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bracket_predictions_home_score_nonnegative'
  ) then
    alter table public.bracket_predictions
      add constraint bracket_predictions_home_score_nonnegative
      check (predicted_home_score is null or predicted_home_score >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bracket_predictions_away_score_nonnegative'
  ) then
    alter table public.bracket_predictions
      add constraint bracket_predictions_away_score_nonnegative
      check (predicted_away_score is null or predicted_away_score >= 0);
  end if;
end
$$;
