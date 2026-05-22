alter table public.user_settings
  add column if not exists group_strategy_adjustments jsonb,
  add column if not exists group_strategy_heart_pick_team_id text;
