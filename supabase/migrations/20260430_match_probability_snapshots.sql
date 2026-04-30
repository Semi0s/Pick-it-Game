create table if not exists public.match_probability_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  source text not null check (source in ('manual', 'polymarket', 'ranking', 'neutral')),
  home_win_probability double precision not null,
  draw_probability double precision not null,
  away_win_probability double precision not null,
  over_2_5_probability double precision,
  confidence double precision,
  source_url text,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint match_probability_snapshots_probability_range_check check (
    home_win_probability >= 0 and home_win_probability <= 1
    and draw_probability >= 0 and draw_probability <= 1
    and away_win_probability >= 0 and away_win_probability <= 1
    and (over_2_5_probability is null or (over_2_5_probability >= 0 and over_2_5_probability <= 1))
    and (confidence is null or (confidence >= 0 and confidence <= 1))
  )
);

create index if not exists match_probability_snapshots_match_id_fetched_at_idx
  on public.match_probability_snapshots (match_id, fetched_at desc);

alter table public.match_probability_snapshots enable row level security;

drop policy if exists "Authenticated users can read match probability snapshots" on public.match_probability_snapshots;
create policy "Authenticated users can read match probability snapshots"
on public.match_probability_snapshots for select
to authenticated
using (true);

drop policy if exists "Admins manage match probability snapshots" on public.match_probability_snapshots;
create policy "Admins manage match probability snapshots"
on public.match_probability_snapshots for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
