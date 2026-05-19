alter table public.user_settings
  add column if not exists projected_knockout_source text not null default 'seed_builder';

alter table public.user_settings
  drop constraint if exists user_settings_projected_knockout_source_check;

alter table public.user_settings
  add constraint user_settings_projected_knockout_source_check
  check (projected_knockout_source in ('seed_builder', 'score_predictions'));
