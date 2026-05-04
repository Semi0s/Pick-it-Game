create or replace function public.reset_knockout_testing_data()
returns table (
  target_match_count integer,
  status_breakdown jsonb,
  reset_match_count integer,
  deleted_bracket_prediction_count integer,
  deleted_bracket_score_count integer,
  deleted_prediction_score_count integer,
  deleted_leaderboard_event_count integer,
  deleted_leaderboard_snapshot_count integer,
  deleted_user_notification_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  knockout_match_ids text[];
  unknown_non_group_match_count integer;
begin
  select count(*)
  into unknown_non_group_match_count
  from public.matches
  where stage <> 'group'
    and stage not in (
      'r32',
      'round_of_32',
      'r16',
      'round_of_16',
      'qf',
      'quarterfinal',
      'sf',
      'semifinal',
      'third',
      'final'
    );

  if coalesce(unknown_non_group_match_count, 0) > 0 then
    raise exception 'Found non-group matches with unknown knockout stages. Aborting knockout reset.';
  end if;

  select array_agg(id order by kickoff_time, id)
  into knockout_match_ids
  from public.matches
  where stage in (
    'r32',
    'round_of_32',
    'r16',
    'round_of_16',
    'qf',
    'quarterfinal',
    'sf',
    'semifinal',
    'third',
    'final'
  );

  if knockout_match_ids is null or array_length(knockout_match_ids, 1) is null then
    raise exception 'No knockout matches were found. Aborting knockout reset.';
  end if;

  target_match_count := array_length(knockout_match_ids, 1);

  select coalesce(
    jsonb_object_agg(status, status_count),
    '{}'::jsonb
  )
  into status_breakdown
  from (
    select status::text as status, count(*)::integer as status_count
    from public.matches
    where id = any(knockout_match_ids)
    group by status
  ) status_counts;

  select count(*)::integer
  into deleted_bracket_prediction_count
  from public.bracket_predictions
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_bracket_score_count
  from public.bracket_scores
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_prediction_score_count
  from public.prediction_scores
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_leaderboard_event_count
  from public.leaderboard_events
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_leaderboard_snapshot_count
  from public.leaderboard_snapshots
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_user_notification_count
  from public.user_notifications
  where event_id in (
    select id
    from public.leaderboard_events
    where match_id = any(knockout_match_ids)
  );

  delete from public.bracket_predictions
  where match_id = any(knockout_match_ids);

  delete from public.bracket_scores
  where match_id = any(knockout_match_ids);

  delete from public.prediction_scores
  where match_id = any(knockout_match_ids);

  delete from public.leaderboard_snapshots
  where match_id = any(knockout_match_ids);

  delete from public.leaderboard_events
  where match_id = any(knockout_match_ids);

  update public.matches
  set
    home_team_id = null,
    away_team_id = null,
    home_score = null,
    away_score = null,
    status = 'scheduled',
    winner_team_id = null,
    updated_at = now()
  where id = any(knockout_match_ids);

  get diagnostics reset_match_count = row_count;

  return query
  select
    target_match_count,
    status_breakdown,
    reset_match_count,
    coalesce(deleted_bracket_prediction_count, 0),
    coalesce(deleted_bracket_score_count, 0),
    coalesce(deleted_prediction_score_count, 0),
    coalesce(deleted_leaderboard_event_count, 0),
    coalesce(deleted_leaderboard_snapshot_count, 0),
    coalesce(deleted_user_notification_count, 0);
end;
$$;
