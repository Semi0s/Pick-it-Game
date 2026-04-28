-- Run this before applying 20260428_leaderboard_event_dedupe.sql.
-- Any non-zero result set below means a unique index would fail and needs manual cleanup first.

-- 1. Scoring events duplicated in global scope for the same match/user/type
select
  event_type,
  match_id,
  user_id,
  count(*) as duplicate_count
from public.leaderboard_events
where scope_type = 'global'
  and group_id is null
  and event_type in ('points_awarded', 'perfect_pick', 'rank_moved_up', 'rank_moved_down')
group by event_type, match_id, user_id
having count(*) > 1
order by duplicate_count desc, event_type, match_id, user_id;

-- 2. Scoring events duplicated in group scope for the same group/match/user/type
select
  event_type,
  group_id,
  match_id,
  user_id,
  count(*) as duplicate_count
from public.leaderboard_events
where scope_type = 'group'
  and group_id is not null
  and event_type in ('points_awarded', 'perfect_pick', 'rank_moved_up', 'rank_moved_down')
group by event_type, group_id, match_id, user_id
having count(*) > 1
order by duplicate_count desc, event_type, group_id, match_id, user_id;

-- 3. Daily winner duplicates in global scope by date
select
  user_id,
  metadata->>'date' as activity_date,
  count(*) as duplicate_count
from public.leaderboard_events
where event_type = 'daily_winner'
  and scope_type = 'global'
  and group_id is null
  and metadata ? 'date'
group by user_id, metadata->>'date'
having count(*) > 1
order by duplicate_count desc, user_id, activity_date;

-- 4. Daily winner duplicates in group scope by date
select
  group_id,
  user_id,
  metadata->>'date' as activity_date,
  count(*) as duplicate_count
from public.leaderboard_events
where event_type = 'daily_winner'
  and scope_type = 'group'
  and group_id is not null
  and metadata ? 'date'
group by group_id, user_id, metadata->>'date'
having count(*) > 1
order by duplicate_count desc, group_id, user_id, activity_date;

-- 5. Trophy-awarded duplicates in global scope
select
  user_id,
  related_user_id,
  metadata->>'trophy_id' as trophy_id,
  coalesce(metadata->>'awarded_on', '') as awarded_on,
  count(*) as duplicate_count
from public.leaderboard_events
where event_type = 'trophy_awarded'
  and scope_type = 'global'
  and group_id is null
  and metadata ? 'trophy_id'
group by user_id, related_user_id, metadata->>'trophy_id', coalesce(metadata->>'awarded_on', '')
having count(*) > 1
order by duplicate_count desc, user_id, related_user_id, trophy_id, awarded_on;

-- 6. Trophy-awarded duplicates in group scope
select
  group_id,
  user_id,
  related_user_id,
  metadata->>'trophy_id' as trophy_id,
  coalesce(metadata->>'awarded_on', '') as awarded_on,
  count(*) as duplicate_count
from public.leaderboard_events
where event_type = 'trophy_awarded'
  and scope_type = 'group'
  and group_id is not null
  and metadata ? 'trophy_id'
group by group_id, user_id, related_user_id, metadata->>'trophy_id', coalesce(metadata->>'awarded_on', '')
having count(*) > 1
order by duplicate_count desc, group_id, user_id, related_user_id, trophy_id, awarded_on;

-- 7. Comment notification duplicates by recipient/comment id
select
  user_id,
  type,
  payload->>'commentId' as comment_id,
  count(*) as duplicate_count
from public.user_notifications
where type = 'event_comment'
  and payload ? 'commentId'
group by user_id, type, payload->>'commentId'
having count(*) > 1
order by duplicate_count desc, user_id, comment_id;

-- 8. Event-backed notification duplicates after excluding comments
select
  user_id,
  event_id,
  type,
  count(*) as duplicate_count
from public.user_notifications
where event_id is not null
  and type <> 'event_comment'
group by user_id, event_id, type
having count(*) > 1
order by duplicate_count desc, user_id, event_id, type;

-- 9. Trophy-earned notification duplicates by recipient/trophy id
select
  user_id,
  type,
  payload->>'trophyId' as trophy_id,
  count(*) as duplicate_count
from public.user_notifications
where type = 'trophy_earned'
  and payload ? 'trophyId'
group by user_id, type, payload->>'trophyId'
having count(*) > 1
order by duplicate_count desc, user_id, trophy_id;
