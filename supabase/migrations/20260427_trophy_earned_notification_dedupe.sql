with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, type, payload->>'trophyId'
      order by created_at asc, id asc
    ) as row_num
  from public.user_notifications
  where type = 'trophy_earned'
    and payload ? 'trophyId'
    and coalesce(payload->>'trophyId', '') <> ''
)
delete from public.user_notifications
where id in (
  select id
  from ranked
  where row_num > 1
);

create unique index if not exists user_notifications_trophy_earned_unique_idx
  on public.user_notifications (
    user_id,
    type,
    (payload->>'trophyId')
  )
  where type = 'trophy_earned'
    and payload ? 'trophyId'
    and coalesce(payload->>'trophyId', '') <> '';
