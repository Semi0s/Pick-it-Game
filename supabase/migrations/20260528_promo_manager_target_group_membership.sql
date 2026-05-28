create or replace function public.redeem_promo_manager_invite_code_for_user(
  p_auth_email text,
  p_auth_user_id uuid,
  p_raw_code text,
  p_utm jsonb default '{}'::jsonb
)
returns public.promo_manager_invite_codes
language plpgsql
security definer
set search_path = public
as $promo_manager_invite$
declare
  v_normalized_code text;
  v_code_row public.promo_manager_invite_codes%rowtype;
  v_existing_redemption_id uuid;
  v_user_role text;
  v_effective_membership_limit integer;
  v_group_member_count integer;
  v_target_group_kind text;
begin
  v_normalized_code := public.normalize_access_code(p_raw_code);

  if v_normalized_code is null or v_normalized_code = '' then
    raise exception 'PROMO_MANAGER_CODE_INVALID';
  end if;

  select *
  into v_code_row
  from public.promo_manager_invite_codes
  where normalized_code = v_normalized_code
  for update;

  if v_code_row.id is null then
    raise exception 'PROMO_MANAGER_CODE_INVALID';
  end if;

  select id
  into v_existing_redemption_id
  from public.promo_manager_invite_redemptions
  where invite_code_id = v_code_row.id
    and (user_id = p_auth_user_id or normalized_email = lower(p_auth_email))
  limit 1;

  if v_existing_redemption_id is not null then
    update public.users
    set plan_tier = 'manager',
        updated_at = now()
    where id = p_auth_user_id
      and role <> 'admin'
      and coalesce(nullif(trim(plan_tier), ''), 'player') in ('player', 'captain');

    if v_code_row.target_group_id is not null then
      select groups.group_kind
      into v_target_group_kind
      from public.groups
      where groups.id = v_code_row.target_group_id;

      insert into public.group_members (group_id, user_id, role, join_source)
      values (
        v_code_row.target_group_id,
        p_auth_user_id,
        'member'::public.group_member_role,
        case
          when v_target_group_kind = 'captain_private' then 'captain_private_code'
          else 'manager_code'
        end
      )
      on conflict (group_id, user_id) do nothing;
    end if;

    return v_code_row;
  end if;

  select role
  into v_user_role
  from public.users
  where id = p_auth_user_id;

  if v_user_role is null then
    raise exception 'PROMO_MANAGER_USER_UNAVAILABLE';
  end if;

  if v_user_role = 'admin' then
    raise exception 'PROMO_MANAGER_INELIGIBLE';
  end if;

  if v_code_row.status = 'archived' then
    raise exception 'PROMO_MANAGER_CODE_ARCHIVED';
  end if;

  if v_code_row.status = 'paused' then
    raise exception 'PROMO_MANAGER_CODE_PAUSED';
  end if;

  if v_code_row.starts_at is not null and v_code_row.starts_at > now() then
    raise exception 'PROMO_MANAGER_CODE_NOT_STARTED';
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= now() then
    update public.promo_manager_invite_codes
    set status = 'expired',
        updated_at = now()
    where id = v_code_row.id
    returning * into v_code_row;

    raise exception 'PROMO_MANAGER_CODE_EXPIRED';
  end if;

  if v_code_row.status = 'expired' then
    raise exception 'PROMO_MANAGER_CODE_EXPIRED';
  end if;

  if v_code_row.redemption_count >= v_code_row.max_redemptions or v_code_row.status = 'full' then
    update public.promo_manager_invite_codes
    set status = 'full',
        updated_at = now()
    where id = v_code_row.id
      and status <> 'full'
    returning * into v_code_row;

    raise exception 'PROMO_MANAGER_CODE_FULL';
  end if;

  if v_code_row.target_group_id is not null then
    select groups.group_kind
    into v_target_group_kind
    from public.groups
    where id = v_code_row.target_group_id
      and status = 'active'
    for update;

    if not found then
      update public.promo_manager_invite_codes
      set status = 'full',
          updated_at = now()
      where id = v_code_row.id
      returning * into v_code_row;

      raise exception 'PROMO_MANAGER_CODE_FULL';
    end if;

    select public.effective_group_membership_limit(v_code_row.target_group_id)
    into v_effective_membership_limit;

    select count(*)
    into v_group_member_count
    from public.group_members
    where group_id = v_code_row.target_group_id;

    if v_effective_membership_limit is not null and v_group_member_count >= v_effective_membership_limit then
      update public.promo_manager_invite_codes
      set status = 'full',
          updated_at = now()
      where id = v_code_row.id
      returning * into v_code_row;

      raise exception 'PROMO_MANAGER_CODE_FULL';
    end if;
  end if;

  update public.users
  set plan_tier = 'manager',
      updated_at = now()
  where id = p_auth_user_id
    and role <> 'admin'
    and coalesce(nullif(trim(plan_tier), ''), 'player') in ('player', 'captain');

  insert into public.promo_manager_invite_redemptions (
    invite_code_id,
    user_id,
    email,
    normalized_email,
    role_granted,
    target_group_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    redeemed_at
  )
  values (
    v_code_row.id,
    p_auth_user_id,
    p_auth_email,
    lower(p_auth_email),
    'manager',
    v_code_row.target_group_id,
    nullif(trim(coalesce(p_utm ->> 'utm_source', '')), ''),
    nullif(trim(coalesce(p_utm ->> 'utm_medium', '')), ''),
    nullif(trim(coalesce(p_utm ->> 'utm_campaign', '')), ''),
    nullif(trim(coalesce(p_utm ->> 'utm_content', '')), ''),
    now()
  );

  if v_code_row.target_group_id is not null then
    insert into public.group_members (group_id, user_id, role, join_source)
    values (
      v_code_row.target_group_id,
      p_auth_user_id,
      'member'::public.group_member_role,
      case
        when v_target_group_kind = 'captain_private' then 'captain_private_code'
        else 'manager_code'
      end
    )
    on conflict (group_id, user_id) do nothing;
  end if;

  update public.promo_manager_invite_codes
  set redemption_count = redemption_count + 1,
      status = case when redemption_count + 1 >= max_redemptions then 'full' else status end,
      updated_at = now()
  where id = v_code_row.id
  returning * into v_code_row;

  return v_code_row;
end;
$promo_manager_invite$;

insert into public.group_members (group_id, user_id, role, join_source, joined_at)
select
  redemptions.target_group_id,
  redemptions.user_id,
  'member'::public.group_member_role,
  case
    when groups.group_kind = 'captain_private' then 'captain_private_code'
    else 'manager_code'
  end,
  coalesce(redemptions.redeemed_at, now())
from public.promo_manager_invite_redemptions redemptions
join public.groups groups
  on groups.id = redemptions.target_group_id
where redemptions.target_group_id is not null
  and groups.status = 'active'
  and not exists (
    select 1
    from public.group_members members
    where members.group_id = redemptions.target_group_id
      and members.user_id = redemptions.user_id
  )
on conflict (group_id, user_id) do nothing;
