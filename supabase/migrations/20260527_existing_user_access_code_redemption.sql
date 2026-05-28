create or replace function public.redeem_access_code_for_existing_user(
  auth_email text,
  auth_user_id uuid,
  raw_code text
)
returns table (
  code_id uuid,
  group_id uuid,
  already_redeemed boolean,
  already_member boolean
)
language plpgsql
security definer
set search_path = public
as $access_code$
declare
  v_normalized_code text;
  v_access_code_row public.access_codes%rowtype;
  v_existing_redemption_id uuid;
  v_existing_member_id uuid;
  v_target_group record;
  v_target_group_kind text;
begin
  v_normalized_code := public.normalize_access_code(raw_code);

  if auth_email is null or trim(auth_email) = '' or auth_user_id is null then
    raise exception 'ACCESS_CODE_REDEMPTION_FAILED';
  end if;

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

  if v_access_code_row.group_id is not null then
    select
      groups.id,
      groups.status,
      groups.access_mode,
      groups.group_kind,
      public.effective_group_membership_limit(groups.id) as effective_membership_limit,
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

    if v_target_group.access_mode = 'closed' then
      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    if not public.group_allows_email(v_target_group.id, auth_email) then
      if v_target_group.access_mode = 'restricted_by_email' then
        raise exception 'ACCESS_CODE_GROUP_RESTRICTED';
      end if;

      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    select group_members.id
    into v_existing_member_id
    from public.group_members
    where group_members.group_id = v_access_code_row.group_id
      and group_members.user_id = auth_user_id
    limit 1;
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

  if v_existing_redemption_id is null and v_existing_member_id is null then
    if v_access_code_row.max_uses is not null and v_access_code_row.used_count >= v_access_code_row.max_uses then
      raise exception 'ACCESS_CODE_FULL';
    end if;

    if v_access_code_row.group_id is not null and v_target_group.member_count >= v_target_group.effective_membership_limit then
      raise exception 'ACCESS_CODE_GROUP_FULL';
    end if;

    update public.access_codes
    set used_count = public.access_codes.used_count + 1,
        updated_at = now()
    where public.access_codes.id = v_access_code_row.id
    returning * into v_access_code_row;

    insert into public.access_code_redemptions (
      code_id,
      user_id,
      email,
      normalized_email,
      redeemed_at,
      status
    )
    values (
      v_access_code_row.id,
      auth_user_id,
      auth_email,
      lower(auth_email),
      now(),
      'redeemed'
    )
    on conflict (code_id, user_id) do nothing;
  end if;

  if v_access_code_row.group_id is not null and v_existing_member_id is null then
    select groups.group_kind
    into v_target_group_kind
    from public.groups
    where groups.id = v_access_code_row.group_id;

    insert into public.group_members (group_id, user_id, role, join_source)
    values (
      v_access_code_row.group_id,
      auth_user_id,
      'member'::public.group_member_role,
      case
        when v_target_group_kind = 'captain_private' then 'captain_private_code'
        else 'manager_code'
      end
    )
    on conflict (group_id, user_id) do nothing;
  end if;

  return query
  select
    v_access_code_row.id,
    v_access_code_row.group_id,
    v_existing_redemption_id is not null,
    v_existing_member_id is not null;
end;
$access_code$;

grant execute on function public.redeem_access_code_for_existing_user(text, uuid, text) to service_role;
