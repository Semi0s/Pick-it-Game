create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid references public.leaderboard_events(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists user_notifications_user_event_type_unique_idx
  on public.user_notifications (user_id, event_id, type);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

drop trigger if exists set_user_settings_updated_at on public.user_settings;
create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists "Users can read own settings" on public.user_settings;
create policy "Users can read own settings"
on public.user_settings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can manage own settings" on public.user_settings;
create policy "Users can manage own settings"
on public.user_settings for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can read own notifications" on public.user_notifications;
create policy "Users can read own notifications"
on public.user_notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on public.user_notifications;
create policy "Users can update own notifications"
on public.user_notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
