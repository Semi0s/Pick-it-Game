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
  raw_access_code := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'access_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'accessCode'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'invite_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'share_code'), ''),
    null
  );

  raise log '[access-code] handle_new_user start email=% has_access_code=% metadata_keys=%',
    lower(new.email),
    raw_access_code is not null,
    (select string_agg(key, ',') from jsonb_object_keys(coalesce(new.raw_user_meta_data, '{}'::jsonb)) as key);

  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    begin
      insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
      values (new.id, invite_row.display_name, new.email, coalesce(nullif(trim(invite_row.language), ''), 'en'), invite_row.role, true)
      on conflict (id) do nothing;
    exception
      when others then
        raise log '[access-code] handle_new_user invite profile insert failed email=% error=%', lower(new.email), sqlerrm;
        raise exception 'INVITE_PROFILE_CREATE_FAILED';
    end;

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

    begin
      insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
      values (new.id, derived_name, new.email, coalesce(nullif(trim(group_invite_row.language), ''), 'en'), 'player', true)
      on conflict (id) do nothing;
    exception
      when others then
        raise log '[access-code] handle_new_user group-invite profile insert failed email=% error=%', lower(new.email), sqlerrm;
        raise exception 'GROUP_INVITE_PROFILE_CREATE_FAILED';
    end;

    return new;
  end if;

  begin
    access_code_row := public.redeem_access_code_for_new_user(new.email, new.id, raw_access_code);
  exception
    when raise_exception then
      raise;
    when others then
      raise log '[access-code] handle_new_user access-code lookup failed email=% error=%', lower(new.email), sqlerrm;
      raise exception 'ACCESS_CODE_LOOKUP_FAILED';
  end;

  derived_name := split_part(new.email, '@', 1);

  begin
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
  exception
    when others then
      raise log '[access-code] handle_new_user access-code profile insert failed email=% role=% group_id=% error=%', lower(new.email), access_code_row.default_role, access_code_row.group_id, sqlerrm;
      raise exception 'ACCESS_CODE_PROFILE_CREATE_FAILED';
  end;

  begin
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
  exception
    when others then
      raise log '[access-code] handle_new_user redemption insert failed email=% code_id=% error=%', lower(new.email), access_code_row.id, sqlerrm;
      raise exception 'ACCESS_CODE_REDEMPTION_INSERT_FAILED';
  end;

  if access_code_row.group_id is not null then
    begin
      insert into public.group_members (group_id, user_id, role)
      values (access_code_row.group_id, new.id, 'member')
      on conflict (group_id, user_id) do nothing;
    exception
      when others then
        raise log '[access-code] handle_new_user group-membership insert failed email=% code_id=% group_id=% error=%', lower(new.email), access_code_row.id, access_code_row.group_id, sqlerrm;
        raise exception 'ACCESS_CODE_GROUP_MEMBERSHIP_FAILED';
    end;
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
