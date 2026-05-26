alter table public.user_settings
  add column if not exists visual_theme_id text;

alter table public.user_settings
  drop constraint if exists user_settings_visual_theme_id_check;

alter table public.user_settings
  add constraint user_settings_visual_theme_id_check
  check (visual_theme_id is null or visual_theme_id in ('oranjekoorts'));
