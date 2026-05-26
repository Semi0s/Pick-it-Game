alter table public.user_settings
  add column if not exists dismissed_message_ids text[] not null default '{}';
