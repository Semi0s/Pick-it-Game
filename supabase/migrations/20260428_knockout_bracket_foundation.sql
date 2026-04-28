alter type public.match_stage add value if not exists 'r32';
alter type public.match_stage add value if not exists 'r16';
alter type public.match_stage add value if not exists 'qf';
alter type public.match_stage add value if not exists 'sf';
alter type public.match_stage add value if not exists 'third';

alter table public.matches
add column if not exists next_match_id text references public.matches(id) on delete set null;

alter table public.matches
add column if not exists next_match_slot text;

alter table public.matches
drop constraint if exists matches_next_match_slot_check;

alter table public.matches
add constraint matches_next_match_slot_check
check (next_match_slot is null or next_match_slot in ('home', 'away'));

create table if not exists public.bracket_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  predicted_winner_team_id text not null references public.teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'bracket_picks'
  ) then
    insert into public.bracket_predictions (
      id,
      user_id,
      match_id,
      predicted_winner_team_id,
      created_at,
      updated_at
    )
    select
      id,
      user_id,
      match_id,
      predicted_winner_team_id,
      created_at,
      updated_at
    from public.bracket_picks
    on conflict (user_id, match_id) do nothing;
  end if;
end $$;

create index if not exists matches_next_match_id_idx
  on public.matches (next_match_id);

create index if not exists bracket_predictions_user_updated_idx
  on public.bracket_predictions (user_id, updated_at desc);

create index if not exists bracket_predictions_match_id_idx
  on public.bracket_predictions (match_id);

alter table public.bracket_predictions enable row level security;

drop policy if exists "Admins can read all bracket predictions" on public.bracket_predictions;
create policy "Admins can read all bracket predictions"
on public.bracket_predictions for select
to authenticated
using (public.is_admin());

drop policy if exists "Users manage own bracket predictions" on public.bracket_predictions;
create policy "Users manage own bracket predictions"
on public.bracket_predictions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
