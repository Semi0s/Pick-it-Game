alter table public.user_settings
  add column if not exists tournament_entry_mode text,
  add column if not exists tournament_entry_state text,
  add column if not exists tournament_entry_submitted_at timestamptz,
  add column if not exists strategy_mode_preset_key text,
  add column if not exists strategy_mode_levers jsonb;

alter table public.user_settings
  drop constraint if exists user_settings_prediction_start_mode_check;

alter table public.user_settings
  add constraint user_settings_prediction_start_mode_check
  check (prediction_start_mode in ('easy_bracket', 'full_scoring', 'strategy_mode', 'groups'));

alter table public.user_settings
  drop constraint if exists user_settings_tournament_entry_mode_check;

alter table public.user_settings
  add constraint user_settings_tournament_entry_mode_check
  check (tournament_entry_mode in ('easy_bracket', 'strategy_mode'));

alter table public.user_settings
  drop constraint if exists user_settings_tournament_entry_state_check;

alter table public.user_settings
  add constraint user_settings_tournament_entry_state_check
  check (tournament_entry_state in ('draft', 'active', 'locked', 'inactive', 'archived'));

alter table public.groups
  add column if not exists base_prediction_mode text not null default 'my_picks',
  add column if not exists home_team_advantage_enabled boolean not null default false;

alter table public.groups
  drop constraint if exists groups_base_prediction_mode_check;

alter table public.groups
  add constraint groups_base_prediction_mode_check
  check (base_prediction_mode in ('my_picks', 'easy_bracket', 'strategy_mode'));
