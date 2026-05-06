create or replace function public.redeem_access_code_for_new_user(
  auth_email text,
  auth_user_id uuid,
  raw_code text
)
returns public.access_codes
language plpgsql
security definer
set search_path = public
as $access_code$
declare
  v_normalized_code text;
  v_access_code_row public.access_codes%rowtype;
  v_existing_redemption_id uuid;
  v_target_group record;
begin
  v_normalized_code := public.normalize_access_code(raw_code);

  if v_normalized_code is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  select *
  into v_access_code_row
  from public.access_codes
  where public.access_codes.normalized_code = v_normalized_code
  for update;

  if v_access_code_row.id is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  if not v_access_code_row.active then
    raise exception 'ACCESS_CODE_INACTIVE';
  end if;

  if v_access_code_row.expires_at is not null and v_access_code_row.expires_at <= now() then
    raise exception 'ACCESS_CODE_EXPIRED';
  end if;

  if v_access_code_row.max_uses is not null and v_access_code_row.used_count >= v_access_code_row.max_uses then
    raise exception 'ACCESS_CODE_FULL';
  end if;

  if v_access_code_row.group_id is not null then
    select
      groups.id,
      groups.status,
      groups.membership_limit,
      (
        select count(*)
        from public.group_members
        where group_members.group_id = groups.id
      ) as member_count
    into v_target_group
    from public.groups
    where groups.id = v_access_code_row.group_id;

    if v_target_group.id is null or v_target_group.status <> 'active' then
      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    if v_target_group.member_count >= v_target_group.membership_limit then
      raise exception 'ACCESS_CODE_GROUP_FULL';
    end if;
  end if;

  select access_code_redemptions.id
  into v_existing_redemption_id
  from public.access_code_redemptions
  where access_code_redemptions.code_id = v_access_code_row.id
    and (
      access_code_redemptions.user_id = auth_user_id
      or access_code_redemptions.normalized_email = lower(auth_email)
    )
  limit 1;

  if v_existing_redemption_id is not null then
    return v_access_code_row;
  end if;

  update public.access_codes
  set used_count = public.access_codes.used_count + 1,
      updated_at = now()
  where public.access_codes.id = v_access_code_row.id
  returning * into v_access_code_row;

  return v_access_code_row;
end;
$access_code$;
