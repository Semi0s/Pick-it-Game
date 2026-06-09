alter table public.app_settings
  add column if not exists text_value text;

alter table public.group_members
  drop constraint if exists group_members_join_source_check;

alter table public.group_members
  add constraint group_members_join_source_check
    check (
      join_source in (
        'direct',
        'public_signup',
        'access_code',
        'invite_link',
        'super_link',
        'manager_code',
        'manager_invite',
        'captain_pass',
        'captain_private_code',
        'captain_private_invite'
      )
    );

insert into public.app_settings (key, boolean_value, text_value)
values
  ('public_player_signup_enabled', true, null),
  ('public_signup_default_group_id', false, null),
  ('public_signup_default_tier', false, 'player')
on conflict (key) do update
set boolean_value = excluded.boolean_value,
    text_value = coalesce(public.app_settings.text_value, excluded.text_value),
    updated_at = now();

update public.app_settings
set text_value = (
      select groups.id::text
      from public.groups
      where groups.name = 'FIFA 2026 Predictions'
      order by groups.created_at asc
      limit 1
    ),
    updated_at = now()
where key = 'public_signup_default_group_id'
  and text_value is null;

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
  v_normalized_email text;
  v_access_code_row public.access_codes%rowtype;
  v_existing_redemption_id uuid;
  v_existing_member_id uuid;
  v_target_group record;
  v_target_group_kind text;
begin
  v_normalized_code := public.normalize_access_code(raw_code);
  v_normalized_email := lower(trim(auth_email));

  if auth_email is null or trim(auth_email) = '' or auth_user_id is null then
    raise exception 'ACCESS_CODE_REDEMPTION_FAILED';
  end if;

  insert into public.users (
    id,
    name,
    email,
    role,
    needs_profile_setup
  )
  values (
    auth_user_id,
    coalesce(nullif(split_part(v_normalized_email, '@', 1), ''), 'Player'),
    v_normalized_email,
    'player'::public.user_role,
    true
  )
  on conflict (id) do nothing;

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

  if v_access_code_row.group_id is not null and coalesce(v_access_code_row.grants_group_membership, true) then
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

    if coalesce(v_access_code_row.code_type, 'standard') <> 'super_link' then
      if v_target_group.access_mode = 'closed' then
        raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
      end if;

      if not public.group_allows_email(v_target_group.id, auth_email) then
        if v_target_group.access_mode = 'restricted_by_email' then
          raise exception 'ACCESS_CODE_GROUP_RESTRICTED';
        end if;

        raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
      end if;
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
      or access_code_redemptions.normalized_email = v_normalized_email
    )
  limit 1;

  if v_existing_redemption_id is null then
    if v_access_code_row.max_uses is not null and v_access_code_row.used_count >= v_access_code_row.max_uses then
      raise exception 'ACCESS_CODE_FULL';
    end if;

    if v_access_code_row.group_id is not null
      and coalesce(v_access_code_row.grants_group_membership, true)
      and v_existing_member_id is null
      and v_target_group.member_count >= v_target_group.effective_membership_limit then
      raise exception 'ACCESS_CODE_GROUP_FULL';
    end if;

    update public.access_codes
    set used_count = public.access_codes.used_count + 1,
        updated_at = now()
    where public.access_codes.id = v_access_code_row.id
    returning * into v_access_code_row;

    begin
      insert into public.access_code_redemptions (
        code_id,
        user_id,
        email,
        normalized_email,
        target_group_id,
        granted_plan_tier,
        redeemed_at,
        status
      )
      values (
        v_access_code_row.id,
        auth_user_id,
        auth_email,
        v_normalized_email,
        v_access_code_row.group_id,
        v_access_code_row.grants_plan_tier,
        now(),
        'redeemed'
      );
    exception
      when unique_violation then
        select access_code_redemptions.id
        into v_existing_redemption_id
        from public.access_code_redemptions
        where access_code_redemptions.code_id = v_access_code_row.id
          and (
            access_code_redemptions.user_id = auth_user_id
            or access_code_redemptions.normalized_email = v_normalized_email
          )
        limit 1;
    end;
  end if;

  if v_access_code_row.group_id is not null
    and coalesce(v_access_code_row.grants_group_membership, true)
    and v_existing_member_id is null then
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
        when coalesce(v_access_code_row.code_type, 'standard') = 'super_link' then 'super_link'
        when v_target_group_kind = 'captain_private' then 'captain_private_code'
        else 'access_code'
      end
    )
    on conflict (group_id, user_id) do nothing;
  end if;

  update public.users
  set plan_tier = v_access_code_row.grants_plan_tier,
      updated_at = now()
  where users.id = auth_user_id
    and public.commercial_tier_rank(users.plan_tier) < public.commercial_tier_rank(v_access_code_row.grants_plan_tier);

  return query
  select
    v_access_code_row.id,
    v_access_code_row.group_id,
    v_existing_redemption_id is not null,
    v_existing_member_id is not null;
end;
$access_code$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  invite_row public.invites%rowtype;
  group_invite_row public.group_invites%rowtype;
  access_code_row public.access_codes%rowtype;
  derived_name text;
  raw_access_code text;
  public_signup_enabled boolean := false;
  public_signup_default_tier text := 'player';
  target_group_kind text;
  debug_step text := 'start';
begin
  debug_step := 'read_access_code';
  raw_access_code := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'access_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'accessCode'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'invite_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'share_code'), ''),
    null
  );

  debug_step := 'direct_invite_lookup';
  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    debug_step := 'insert_user_direct_invite';
    insert into public.users (id, name, email, preferred_language, role, plan_tier, needs_profile_setup)
    values (
      new.id,
      invite_row.display_name,
      new.email,
      coalesce(nullif(trim(invite_row.language), ''), 'en'),
      invite_row.role,
      coalesce(nullif(trim(invite_row.plan_tier), ''), 'player'),
      true
    )
    on conflict (id) do nothing;
    return new;
  end if;

  debug_step := 'group_invite_lookup';
  select *
  into group_invite_row
  from public.group_invites
  where normalized_email = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if group_invite_row.id is not null then
    debug_step := 'derive_group_invite_name';
    derived_name := coalesce(nullif(trim(group_invite_row.suggested_display_name), ''), split_part(new.email, '@', 1));
    debug_step := 'insert_user_group_invite';
    insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
    values (new.id, derived_name, new.email, coalesce(nullif(trim(group_invite_row.language), ''), 'en'), 'player', true)
    on conflict (id) do nothing;
    return new;
  end if;

  if raw_access_code is null then
    debug_step := 'public_signup_settings';
    select coalesce(app_settings.boolean_value, false)
    into public_signup_enabled
    from public.app_settings
    where app_settings.key = 'public_player_signup_enabled';

    if not coalesce(public_signup_enabled, false) then
      raise exception 'PUBLIC_SIGNUP_DISABLED';
    end if;

    select coalesce(nullif(trim(app_settings.text_value), ''), 'player')
    into public_signup_default_tier
    from public.app_settings
    where app_settings.key = 'public_signup_default_tier';

    if public_signup_default_tier <> 'player' then
      public_signup_default_tier := 'player';
    end if;

    debug_step := 'derive_public_signup_name';
    derived_name := split_part(new.email, '@', 1);

    debug_step := 'insert_user_public_signup';
    insert into public.users (id, name, email, preferred_language, role, plan_tier, needs_profile_setup)
    values (
      new.id,
      derived_name,
      new.email,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'language'), ''), 'en'),
      'player'::public.user_role,
      public_signup_default_tier,
      true
    )
    on conflict (id) do nothing;

    return new;
  end if;

  debug_step := 'redeem_access_code_for_new_user';
  access_code_row := public.redeem_access_code_for_new_user(new.email, new.id, raw_access_code);
  debug_step := 'derive_access_code_name';
  derived_name := split_part(new.email, '@', 1);

  debug_step := 'insert_user_access_code';
  insert into public.users (id, name, email, preferred_language, role, plan_tier, needs_profile_setup)
  values (
    new.id,
    derived_name,
    new.email,
    coalesce(nullif(trim(access_code_row.default_language), ''), 'en'),
    access_code_row.default_role,
    coalesce(nullif(trim(access_code_row.grants_plan_tier), ''), 'player'),
    true
  )
  on conflict (id) do nothing;

  debug_step := 'insert_access_code_redemption';
  insert into public.access_code_redemptions (
    code_id,
    user_id,
    email,
    normalized_email,
    target_group_id,
    granted_plan_tier,
    redeemed_at,
    status
  )
  values (
    access_code_row.id,
    new.id,
    new.email,
    lower(new.email),
    access_code_row.group_id,
    access_code_row.grants_plan_tier,
    now(),
    'redeemed'
  )
  on conflict (code_id, user_id) do nothing;

  if access_code_row.group_id is not null and coalesce(access_code_row.grants_group_membership, true) then
    debug_step := 'read_access_code_group_kind';
    select groups.group_kind
    into target_group_kind
    from public.groups
    where groups.id = access_code_row.group_id;

    debug_step := 'insert_group_member';
    insert into public.group_members (group_id, user_id, role, join_source)
    values (
      access_code_row.group_id,
      new.id,
      'member'::public.group_member_role,
      case
        when coalesce(access_code_row.code_type, 'standard') = 'super_link' then 'super_link'
        when target_group_kind = 'captain_private' then 'captain_private_code'
        else 'access_code'
      end
    )
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
exception
  when others then
    raise exception 'HANDLE_NEW_USER_FAILED step=% sqlstate=% sqlerrm=%', debug_step, SQLSTATE, SQLERRM;
end;
$f$;
