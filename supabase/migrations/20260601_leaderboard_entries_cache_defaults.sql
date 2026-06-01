-- Keep leaderboard cache rows initialized even before the canonical rebuild runs.
-- Canonical score rebuilds still own the real total/rank values.

update public.leaderboard_entries
set
  total_points = coalesce(total_points, 0),
  rank = coalesce(rank, 1),
  updated_at = now()
where total_points is null
   or rank is null;

alter table public.leaderboard_entries
  alter column total_points set default 0,
  alter column rank set default 1;

alter table public.leaderboard_entries
  alter column total_points set not null,
  alter column rank set not null;
