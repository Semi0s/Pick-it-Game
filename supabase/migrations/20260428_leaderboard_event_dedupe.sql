drop index if exists public.user_notifications_user_event_type_unique_idx;

create unique index if not exists user_notifications_user_event_type_unique_idx
  on public.user_notifications (user_id, event_id, type)
  where event_id is not null
    and type <> 'event_comment';

create unique index if not exists user_notifications_event_comment_unique_idx
  on public.user_notifications (
    user_id,
    type,
    (payload->>'commentId')
  )
  where type = 'event_comment'
    and payload ? 'commentId'
    and coalesce(payload->>'commentId', '') <> '';

create unique index if not exists leaderboard_events_scoring_global_unique_idx
  on public.leaderboard_events (event_type, match_id, user_id)
  where scope_type = 'global'
    and group_id is null
    and event_type in ('points_awarded', 'perfect_pick', 'rank_moved_up', 'rank_moved_down');

create unique index if not exists leaderboard_events_scoring_group_unique_idx
  on public.leaderboard_events (event_type, group_id, match_id, user_id)
  where scope_type = 'group'
    and group_id is not null
    and event_type in ('points_awarded', 'perfect_pick', 'rank_moved_up', 'rank_moved_down');

create unique index if not exists leaderboard_events_daily_winner_global_unique_idx
  on public.leaderboard_events (event_type, user_id, (metadata->>'date'))
  where event_type = 'daily_winner'
    and scope_type = 'global'
    and group_id is null
    and metadata ? 'date'
    and coalesce(metadata->>'date', '') <> '';

create unique index if not exists leaderboard_events_daily_winner_group_unique_idx
  on public.leaderboard_events (event_type, group_id, user_id, (metadata->>'date'))
  where event_type = 'daily_winner'
    and scope_type = 'group'
    and group_id is not null
    and metadata ? 'date'
    and coalesce(metadata->>'date', '') <> '';

create unique index if not exists leaderboard_events_trophy_awarded_global_unique_idx
  on public.leaderboard_events (
    event_type,
    user_id,
    related_user_id,
    (metadata->>'trophy_id'),
    coalesce(metadata->>'awarded_on', '')
  )
  where event_type = 'trophy_awarded'
    and scope_type = 'global'
    and group_id is null
    and metadata ? 'trophy_id'
    and coalesce(metadata->>'trophy_id', '') <> '';

create unique index if not exists leaderboard_events_trophy_awarded_group_unique_idx
  on public.leaderboard_events (
    event_type,
    group_id,
    user_id,
    related_user_id,
    (metadata->>'trophy_id'),
    coalesce(metadata->>'awarded_on', '')
  )
  where event_type = 'trophy_awarded'
    and scope_type = 'group'
    and group_id is not null
    and metadata ? 'trophy_id'
    and coalesce(metadata->>'trophy_id', '') <> '';
