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
begin
  raw_access_code := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'access_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'accessCode'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'invite_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'share_code'), ''),
    null
  );

  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
    values (
      new.id,
      invite_row.display_name,
      new.email,
      coalesce(nullif(trim(invite_row.language), ''), 'en'),
      invite_row.role,
      true
    )
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
    values (
      new.id,
      derived_name,
      new.email,
      coalesce(nullif(trim(group_invite_row.language), ''), 'en'),
      'player'::public.user_role,
      true
    )
    on conflict (id) do nothing;

    return new;
  end if;

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

  insert into public.access_code_redemptions (code_id, user_id, email, normalized_email, redeemed_at, status)
  values (access_code_row.id, new.id, new.email, lower(new.email), now(), 'redeemed')
  on conflict (code_id, user_id) do nothing;

  if access_code_row.group_id is not null then
    insert into public.group_members (group_id, user_id, role)
    values (access_code_row.group_id, new.id, 'member'::public.group_member_role)
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
exception
  when raise_exception then
    raise;
  when others then
    if raw_access_code is not null and trim(raw_access_code) <> '' then
      raise exception 'ACCESS_CODE_REDEMPTION_FAILED';
    end if;
    raise exception 'EMAIL_NOT_INVITED';
end;
$f$;
