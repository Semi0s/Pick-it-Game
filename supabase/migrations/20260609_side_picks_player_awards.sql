create table if not exists public.tournament_players (
  id text primary key,
  full_name text not null,
  team_id text references public.teams(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_players_full_name_nonempty_chk check (length(trim(full_name)) > 0)
);

alter table public.side_pick_definitions
  drop constraint if exists side_pick_definitions_response_kind_check;

alter table public.side_pick_definitions
  add constraint side_pick_definitions_response_kind_check
  check (response_kind in ('team', 'text', 'player'));

alter table public.side_pick_definitions
  add column if not exists official_player_id text references public.tournament_players(id) on delete set null,
  add column if not exists official_result_source_url text,
  add column if not exists official_result_source_label text,
  add column if not exists official_result_confirmed_at timestamptz,
  add column if not exists official_result_confirmed_by_user_id uuid references public.users(id) on delete set null;

alter table public.side_pick_entries
  add column if not exists selected_player_id text references public.tournament_players(id) on delete set null;

create index if not exists tournament_players_team_idx
  on public.tournament_players (team_id, active);

create index if not exists side_pick_entries_selected_player_idx
  on public.side_pick_entries (selected_player_id);

create index if not exists side_pick_definitions_official_player_idx
  on public.side_pick_definitions (official_player_id);

drop trigger if exists set_tournament_players_updated_at on public.tournament_players;
create trigger set_tournament_players_updated_at
before update on public.tournament_players
for each row execute function public.set_updated_at();

alter table public.tournament_players enable row level security;

drop policy if exists "Authenticated users can read tournament players" on public.tournament_players;
create policy "Authenticated users can read tournament players"
on public.tournament_players for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "Admins manage tournament players" on public.tournament_players;
create policy "Admins manage tournament players"
on public.tournament_players for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke all on public.tournament_players from anon, authenticated, public;
grant select on public.tournament_players to authenticated;
grant select, insert, update, delete on public.tournament_players to service_role;
