alter table public.user_settings
  add column if not exists prediction_start_mode text;

alter table public.user_settings
  add column if not exists my_picks_acknowledged_at timestamptz;

alter table public.user_settings
  drop constraint if exists user_settings_prediction_start_mode_check;

alter table public.user_settings
  add constraint user_settings_prediction_start_mode_check
  check (prediction_start_mode in ('easy_bracket', 'full_scoring'));
