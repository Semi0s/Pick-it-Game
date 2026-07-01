create table if not exists public.prediction_lab_settings (
  user_id uuid not null references public.users(id) on delete cascade,
  tournament_id text not null default 'world_cup_2026',
  group_id uuid references public.groups(id) on delete set null,
  upset_level integer not null default 58 check (upset_level between 0 and 100),
  seed_strength integer not null default 64 check (seed_strength between 0 and 100),
  momentum integer not null default 57 check (momentum between 0 and 100),
  crowd_confidence integer not null default 42 check (crowd_confidence between 0 and 100),
  road_ahead integer not null default 55 check (road_ahead between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, tournament_id)
);

create index if not exists prediction_lab_settings_group_id_idx
  on public.prediction_lab_settings (group_id, tournament_id, updated_at desc);

create index if not exists prediction_lab_settings_tournament_id_idx
  on public.prediction_lab_settings (tournament_id, updated_at desc);

drop trigger if exists set_prediction_lab_settings_updated_at on public.prediction_lab_settings;
create trigger set_prediction_lab_settings_updated_at
before update on public.prediction_lab_settings
for each row execute function public.set_updated_at();

alter table public.prediction_lab_settings enable row level security;

drop policy if exists "Users can read own prediction lab settings" on public.prediction_lab_settings;
create policy "Users can read own prediction lab settings"
on public.prediction_lab_settings for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can manage own prediction lab settings" on public.prediction_lab_settings;
create policy "Users can manage own prediction lab settings"
on public.prediction_lab_settings for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
