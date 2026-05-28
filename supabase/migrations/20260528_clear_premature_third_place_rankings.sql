-- Clear stale/premature best-third rankings for players whose group seed
-- rankings do not yet have both 1st and 2nd place saved for every group.
-- This protects the FIFA 2026 third-place step from old partial ranking rows.

with expected_groups as (
  select distinct group_name
  from public.teams
  where group_name is not null
),
user_top_two_by_group as (
  select
    user_id,
    group_name,
    count(distinct rank_position) filter (where rank_position in (1, 2)) as top_two_position_count
  from public.user_group_seed_rankings
  group by user_id, group_name
),
users_with_premature_third_place as (
  select distinct third_place.user_id
  from public.user_best_third_rankings third_place
  where exists (
    select 1
    from expected_groups expected
    left join user_top_two_by_group top_two
      on top_two.user_id = third_place.user_id
     and top_two.group_name = expected.group_name
    where coalesce(top_two.top_two_position_count, 0) < 2
  )
)
delete from public.user_best_third_rankings third_place
using users_with_premature_third_place premature
where third_place.user_id = premature.user_id;
