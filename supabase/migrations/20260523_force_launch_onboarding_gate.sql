alter table public.user_settings
  add column if not exists onboarding_version_seen integer;
