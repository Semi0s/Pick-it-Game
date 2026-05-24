alter table public.user_settings
  add column if not exists followed_team_ids text[] not null default '{}';
