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
  normalized_code text;
  access_code_row public.access_codes%rowtype;
  existing_redemption_id uuid;
  target_group record;
begin
  normalized_code := public.normalize_access_code(raw_code);
  raise log '[access-code] redeem_access_code_for_new_user start email=% has_code=%', lower(auth_email), normalized_code is not null;

  if normalized_code is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  select *
  into access_code_row
  from public.access_codes
  where public.access_codes.normalized_code = normalized_code
  for update;

  if access_code_row.id is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  if not access_code_row.active then
    raise exception 'ACCESS_CODE_INACTIVE';
  end if;

  if access_code_row.expires_at is not null and access_code_row.expires_at <= now() then
    raise exception 'ACCESS_CODE_EXPIRED';
  end if;

  if access_code_row.max_uses is not null and access_code_row.used_count >= access_code_row.max_uses then
    raise exception 'ACCESS_CODE_FULL';
  end if;

  if access_code_row.group_id is not null then
    select
      groups.id,
      groups.status,
      groups.membership_limit,
      (
        select count(*)
        from public.group_members
        where group_members.group_id = groups.id
      ) as member_count
    into target_group
    from public.groups
    where groups.id = access_code_row.group_id;

    if target_group.id is null or target_group.status <> 'active' then
      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    if target_group.member_count >= target_group.membership_limit then
      raise exception 'ACCESS_CODE_GROUP_FULL';
    end if;
  end if;

  select access_code_redemptions.id
  into existing_redemption_id
  from public.access_code_redemptions
  where access_code_redemptions.code_id = access_code_row.id
    and (
      access_code_redemptions.user_id = auth_user_id
      or access_code_redemptions.normalized_email = lower(auth_email)
    )
  limit 1;

  if existing_redemption_id is not null then
    return access_code_row;
  end if;

  update public.access_codes
  set used_count = public.access_codes.used_count + 1,
      updated_at = now()
  where public.access_codes.id = access_code_row.id
  returning * into access_code_row;

  raise log '[access-code] redeem_access_code_for_new_user counted usage email=% code_id=% group_id=%', lower(auth_email), access_code_row.id, access_code_row.group_id;

  return access_code_row;
end;
$access_code$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $handle_new_user$
declare
  invite_row public.invites%rowtype;
  group_invite_row public.group_invites%rowtype;
  access_code_row public.access_codes%rowtype;
  derived_name text;
  raw_access_code text;
begin
  raise log '[access-code] handle_new_user start email=% has_access_code=%', lower(new.email), nullif(trim(coalesce(new.raw_user_meta_data ->> 'access_code', '')), '') is not null;

  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
    values (new.id, invite_row.display_name, new.email, coalesce(nullif(trim(invite_row.language), ''), 'en'), invite_row.role, true)
    on conflict (id) do nothing;

    return new;
  end if;

  select *
  into group_invite_row
  from public.group_invites
  where normalized_email = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if group_invite_row.id is not null then
    derived_name := coalesce(nullif(trim(group_invite_row.suggested_display_name), ''), split_part(new.email, '@', 1));

    insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
    values (new.id, derived_name, new.email, coalesce(nullif(trim(group_invite_row.language), ''), 'en'), 'player', true)
    on conflict (id) do nothing;

    return new;
  end if;

  raw_access_code := coalesce(new.raw_user_meta_data ->> 'access_code', null);
  access_code_row := public.redeem_access_code_for_new_user(new.email, new.id, raw_access_code);

  derived_name := split_part(new.email, '@', 1);

  insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
  values (
    new.id,
    derived_name,
    new.email,
    coalesce(nullif(trim(access_code_row.default_language), ''), 'en'),
    access_code_row.default_role,
    true
  )
  on conflict (id) do nothing;

  insert into public.access_code_redemptions (
    code_id,
    user_id,
    email,
    normalized_email,
    redeemed_at,
    status
  )
  values (
    access_code_row.id,
    new.id,
    new.email,
    lower(new.email),
    now(),
    'redeemed'
  )
  on conflict (code_id, user_id) do nothing;

  if access_code_row.group_id is not null then
    insert into public.group_members (group_id, user_id, role)
    values (access_code_row.group_id, new.id, 'member')
    on conflict (group_id, user_id) do nothing;
  end if;

  raise log '[access-code] handle_new_user completed access-code signup email=% code_id=% group_id=%', lower(new.email), access_code_row.id, access_code_row.group_id;

  return new;
exception
  when raise_exception then
    if raw_access_code is not null and trim(raw_access_code) <> '' then
      raise log '[access-code] handle_new_user re-raising access-code exception email=% error=%', lower(new.email), sqlerrm;
    end if;
    raise;
  when others then
    if raw_access_code is not null and trim(raw_access_code) <> '' then
      raise log '[access-code] handle_new_user unexpected access-code failure email=% error=%', lower(new.email), sqlerrm;
      raise exception 'ACCESS_CODE_REDEMPTION_FAILED';
    end if;

    raise exception 'EMAIL_NOT_INVITED';
end;
$handle_new_user$;
