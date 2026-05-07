with ranked_active_group_codes as (
  select
    id,
    row_number() over (
      partition by group_id
      order by
        case
          when (expires_at is null or expires_at > now())
            and (max_uses is null or used_count < max_uses) then 0
          else 1
        end,
        updated_at desc nulls last,
        created_at desc nulls last,
        id desc
    ) as row_rank
  from public.access_codes
  where group_id is not null
    and active = true
)
update public.access_codes
set active = false,
    updated_at = now()
where id in (
  select id
  from ranked_active_group_codes
  where row_rank > 1
);

create unique index if not exists access_codes_one_active_group_code_idx
  on public.access_codes (group_id)
  where group_id is not null and active = true;
