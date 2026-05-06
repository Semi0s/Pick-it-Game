create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  normalized_code text not null unique,
  label text not null,
  notes text,
  active boolean not null default true,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  group_id uuid references public.groups(id) on delete set null,
  default_role public.user_role not null default 'player',
  default_language text not null default 'en',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_codes_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint access_codes_used_count_nonnegative check (used_count >= 0),
  constraint access_codes_usage_within_limit check (max_uses is null or used_count <= max_uses)
);

create table if not exists public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.access_codes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  normalized_email text not null,
  redeemed_at timestamptz not null default now(),
  status text not null default 'redeemed',
  unique (code_id, user_id),
  unique (code_id, normalized_email),
  constraint access_code_redemptions_status_check check (status in ('redeemed'))
);

create index if not exists access_codes_group_id_idx
  on public.access_codes (group_id);

create index if not exists access_codes_active_expires_idx
  on public.access_codes (active, expires_at);

create index if not exists access_code_redemptions_code_id_idx
  on public.access_code_redemptions (code_id, redeemed_at desc);

create index if not exists access_code_redemptions_user_id_idx
  on public.access_code_redemptions (user_id, redeemed_at desc);

create or replace function public.normalize_access_code(raw_code text)
returns text
language plpgsql
immutable
as $$
begin
  if raw_code is null then
    return null;
  end if;

  return nullif(lower(regexp_replace(trim(raw_code), '\s+', '', 'g')), '');
end;
$$;

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

alter table public.access_codes enable row level security;
alter table public.access_code_redemptions enable row level security;

drop policy if exists "Super admins manage access codes" on public.access_codes;
create policy "Super admins manage access codes"
on public.access_codes for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins manage access code redemptions" on public.access_code_redemptions;
create policy "Super admins manage access code redemptions"
on public.access_code_redemptions for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));
