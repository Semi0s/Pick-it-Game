create table if not exists public.app_settings (
  key text primary key,
  boolean_value boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, boolean_value)
values
  ('daily_winner_enabled', false),
  ('perfect_pick_enabled', false),
  ('leaderboard_activity_enabled', false)
on conflict (key) do nothing;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "Authenticated users can read app settings" on public.app_settings;
create policy "Authenticated users can read app settings"
on public.app_settings for select
to authenticated
using (true);

drop policy if exists "Super admins manage app settings" on public.app_settings;
create policy "Super admins manage app settings"
on public.app_settings for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));
