-- PICK-IT! leaderboard scoring integrity audit
-- Read-only audit script. This does not modify data.
--
-- What it checks:
-- 1. prediction_scores breakdown math
-- 2. predictions.points_awarded vs prediction_scores.points
-- 3. user totals vs leaderboard_entries vs users.total_points
-- 4. global rank correctness
-- 5. group snapshot membership integrity
-- 6. latest global snapshot vs current leaderboard state
-- 7. duplicate prediction_scores rows
-- 8. scored draws / partial predictions / no-prediction matches
--
-- Run each result set and inspect:
-- - summary counts first
-- - then the detailed mismatch sections below

-- 1. Summary counts
with
prediction_breakdown_mismatches as (
  select count(*) as mismatch_count
  from public.prediction_scores ps
  where ps.points <>
    (coalesce(ps.outcome_points, 0) + coalesce(ps.exact_score_points, 0) + coalesce(ps.goal_difference_points, 0))
),
prediction_vs_breakdown_mismatches as (
  select count(*) as mismatch_count
  from public.predictions p
  left join public.prediction_scores ps
    on ps.prediction_id = p.id
   and ps.match_id = p.match_id
  where coalesce(p.points_awarded, 0) <> coalesce(ps.points, 0)
),
user_total_mismatches as (
  with score_totals as (
    select u.id as user_id, coalesce(sum(ps.points), 0) as total_from_scores
    from public.users u
    left join public.prediction_scores ps on ps.user_id = u.id
    group by u.id
  )
  select count(*) as mismatch_count
  from public.users u
  left join score_totals st on st.user_id = u.id
  left join public.leaderboard_entries le on le.user_id = u.id
  where coalesce(st.total_from_scores, 0) <> coalesce(le.total_points, 0)
     or coalesce(st.total_from_scores, 0) <> coalesce(u.total_points, 0)
),
global_rank_mismatches as (
  with ranked as (
    select
      user_id,
      total_points,
      rank,
      rank() over (order by total_points desc, user_id asc) as expected_rank
    from public.leaderboard_entries
  )
  select count(*) as mismatch_count
  from ranked
  where rank <> expected_rank
),
group_snapshot_membership_mismatches as (
  select count(*) as mismatch_count
  from public.leaderboard_snapshots ls
  left join public.group_members gm
    on gm.group_id = ls.group_id
   and gm.user_id = ls.user_id
  where ls.scope_type = 'group'
    and gm.user_id is null
),
latest_global_snapshot_mismatches as (
  with latest_global_match as (
    select match_id
    from public.leaderboard_snapshots
    where scope_type = 'global' and group_id is null
    order by created_at desc
    limit 1
  )
  select count(*) as mismatch_count
  from public.leaderboard_snapshots ls
  join latest_global_match lgm on lgm.match_id = ls.match_id
  join public.leaderboard_entries le on le.user_id = ls.user_id
  where ls.scope_type = 'global'
    and ls.group_id is null
    and (ls.total_points <> le.total_points or ls.rank <> le.rank)
),
duplicate_prediction_scores as (
  select count(*) as mismatch_count
  from (
    select prediction_id, match_id
    from public.prediction_scores
    group by prediction_id, match_id
    having count(*) > 1
  ) duplicates
)
select 'prediction_breakdown_mismatches' as check_name, mismatch_count from prediction_breakdown_mismatches
union all
select 'prediction_vs_breakdown_mismatches', mismatch_count from prediction_vs_breakdown_mismatches
union all
select 'user_total_mismatches', mismatch_count from user_total_mismatches
union all
select 'global_rank_mismatches', mismatch_count from global_rank_mismatches
union all
select 'group_snapshot_membership_mismatches', mismatch_count from group_snapshot_membership_mismatches
union all
select 'latest_global_snapshot_mismatches', mismatch_count from latest_global_snapshot_mismatches
union all
select 'duplicate_prediction_scores', mismatch_count from duplicate_prediction_scores
order by check_name;

-- 2. prediction_scores breakdown rows where points != outcome + exact + goal_difference
select
  ps.prediction_id,
  ps.match_id,
  ps.user_id,
  ps.points,
  ps.outcome_points,
  ps.exact_score_points,
  ps.goal_difference_points,
  (coalesce(ps.outcome_points, 0) + coalesce(ps.exact_score_points, 0) + coalesce(ps.goal_difference_points, 0)) as recomputed_points
from public.prediction_scores ps
where ps.points <>
  (coalesce(ps.outcome_points, 0) + coalesce(ps.exact_score_points, 0) + coalesce(ps.goal_difference_points, 0))
order by ps.match_id, ps.user_id;

-- 3. predictions.points_awarded vs prediction_scores.points
select
  p.id as prediction_id,
  p.match_id,
  p.user_id,
  p.points_awarded,
  ps.points as score_points,
  ps.outcome_points,
  ps.exact_score_points,
  ps.goal_difference_points
from public.predictions p
left join public.prediction_scores ps
  on ps.prediction_id = p.id
 and ps.match_id = p.match_id
where coalesce(p.points_awarded, 0) <> coalesce(ps.points, 0)
order by p.match_id, p.user_id;

-- 4. Exact-score / outcome-only / goal-difference examples that violate expected totals
select
  ps.prediction_id,
  ps.match_id,
  ps.user_id,
  ps.points,
  ps.outcome_points,
  ps.exact_score_points,
  ps.goal_difference_points,
  case
    when coalesce(ps.exact_score_points, 0) > 0 and ps.points <> 8 then 'exact_score_not_8'
    when coalesce(ps.exact_score_points, 0) = 0
      and coalesce(ps.goal_difference_points, 0) > 0
      and ps.points <> 4 then 'goal_difference_not_4'
    when coalesce(ps.exact_score_points, 0) = 0
      and coalesce(ps.goal_difference_points, 0) = 0
      and coalesce(ps.outcome_points, 0) > 0
      and ps.points <> 3 then 'outcome_only_not_3'
    else null
  end as rule_violation
from public.prediction_scores ps
where
  (coalesce(ps.exact_score_points, 0) > 0 and ps.points <> 8)
  or (
    coalesce(ps.exact_score_points, 0) = 0
    and coalesce(ps.goal_difference_points, 0) > 0
    and ps.points <> 4
  )
  or (
    coalesce(ps.exact_score_points, 0) = 0
    and coalesce(ps.goal_difference_points, 0) = 0
    and coalesce(ps.outcome_points, 0) > 0
    and ps.points <> 3
  )
order by ps.match_id, ps.user_id;

-- 5. User totals from prediction_scores vs leaderboard_entries vs users.total_points
with score_totals as (
  select u.id as user_id, coalesce(sum(ps.points), 0) as total_from_scores
  from public.users u
  left join public.prediction_scores ps on ps.user_id = u.id
  group by u.id
)
select
  u.id as user_id,
  u.name,
  coalesce(st.total_from_scores, 0) as total_from_scores,
  coalesce(le.total_points, 0) as leaderboard_total,
  coalesce(u.total_points, 0) as user_total
from public.users u
left join score_totals st on st.user_id = u.id
left join public.leaderboard_entries le on le.user_id = u.id
where coalesce(st.total_from_scores, 0) <> coalesce(le.total_points, 0)
   or coalesce(st.total_from_scores, 0) <> coalesce(u.total_points, 0)
order by u.name;

-- 6. Global leaderboard rank correctness
with ranked as (
  select
    le.user_id,
    u.name,
    le.total_points,
    le.rank,
    rank() over (order by le.total_points desc, le.user_id asc) as expected_rank
  from public.leaderboard_entries le
  join public.users u on u.id = le.user_id
)
select *
from ranked
where rank <> expected_rank
order by total_points desc, user_id asc;

-- 7. Group snapshot membership integrity
select
  ls.group_id,
  g.name as group_name,
  ls.user_id,
  u.name as user_name,
  ls.match_id,
  ls.rank,
  ls.total_points
from public.leaderboard_snapshots ls
left join public.group_members gm
  on gm.group_id = ls.group_id
 and gm.user_id = ls.user_id
left join public.groups g on g.id = ls.group_id
left join public.users u on u.id = ls.user_id
where ls.scope_type = 'group'
  and gm.user_id is null
order by g.name, u.name, ls.match_id;

-- 8. Latest global snapshot vs current leaderboard state
with latest_global_match as (
  select match_id
  from public.leaderboard_snapshots
  where scope_type = 'global' and group_id is null
  order by created_at desc
  limit 1
)
select
  ls.user_id,
  u.name,
  ls.match_id,
  ls.total_points as snapshot_total,
  le.total_points as current_total,
  ls.rank as snapshot_rank,
  le.rank as current_rank
from public.leaderboard_snapshots ls
join latest_global_match lgm on lgm.match_id = ls.match_id
join public.leaderboard_entries le on le.user_id = ls.user_id
join public.users u on u.id = ls.user_id
where ls.scope_type = 'global'
  and ls.group_id is null
  and (ls.total_points <> le.total_points or ls.rank <> le.rank)
order by u.name;

-- 9. Duplicate prediction_scores rows
select
  prediction_id,
  match_id,
  count(*) as row_count
from public.prediction_scores
group by prediction_id, match_id
having count(*) > 1
order by row_count desc, match_id;

-- 10. Group rank correctness for current membership-scoped leaderboards
with group_current as (
  select
    gm.group_id,
    gm.user_id,
    coalesce(le.total_points, 0) as total_points
  from public.group_members gm
  left join public.leaderboard_entries le on le.user_id = gm.user_id
),
group_ranked as (
  select
    gc.group_id,
    gc.user_id,
    gc.total_points,
    rank() over (
      partition by gc.group_id
      order by gc.total_points desc, gc.user_id asc
    ) as expected_group_rank
  from group_current gc
)
select
  gr.group_id,
  g.name as group_name,
  gr.user_id,
  u.name as user_name,
  gr.total_points,
  gr.expected_group_rank
from group_ranked gr
join public.groups g on g.id = gr.group_id
join public.users u on u.id = gr.user_id
order by g.name, gr.expected_group_rank, u.name;

-- 11. Draw predictions audit sample
select
  p.id as prediction_id,
  p.match_id,
  u.name as user_name,
  p.predicted_is_draw,
  p.predicted_home_score,
  p.predicted_away_score,
  m.home_score,
  m.away_score,
  p.points_awarded,
  ps.points,
  ps.outcome_points,
  ps.exact_score_points,
  ps.goal_difference_points
from public.predictions p
join public.matches m on m.id = p.match_id
join public.users u on u.id = p.user_id
left join public.prediction_scores ps
  on ps.prediction_id = p.id
 and ps.match_id = p.match_id
where p.predicted_is_draw = true
order by p.match_id, u.name
limit 50;

-- 12. Partial predictions that somehow received points
select
  p.id as prediction_id,
  p.match_id,
  u.name as user_name,
  p.predicted_home_score,
  p.predicted_away_score,
  p.points_awarded,
  ps.points
from public.predictions p
join public.users u on u.id = p.user_id
left join public.prediction_scores ps
  on ps.prediction_id = p.id
 and ps.match_id = p.match_id
where (p.predicted_home_score is null or p.predicted_away_score is null)
  and (coalesce(p.points_awarded, 0) <> 0 or coalesce(ps.points, 0) <> 0)
order by p.match_id, u.name;

-- 13. Finalized matches with no predictions
select
  m.id as match_id,
  m.kickoff_time,
  m.home_score,
  m.away_score
from public.matches m
left join public.predictions p on p.match_id = m.id
where m.stage = 'group'
  and m.status = 'final'
group by m.id, m.kickoff_time, m.home_score, m.away_score
having count(p.id) = 0
order by m.kickoff_time desc;

-- 14. Users with no picks but non-zero totals
select
  u.id as user_id,
  u.name,
  coalesce(le.total_points, 0) as leaderboard_total,
  coalesce(u.total_points, 0) as user_total,
  count(p.id) as prediction_count
from public.users u
left join public.predictions p on p.user_id = u.id
left join public.leaderboard_entries le on le.user_id = u.id
group by u.id, u.name, le.total_points, u.total_points
having count(p.id) = 0
   and (coalesce(le.total_points, 0) <> 0 or coalesce(u.total_points, 0) <> 0)
order by u.name;
