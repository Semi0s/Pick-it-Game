create table if not exists public.promo_manager_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  normalized_code text not null unique,
  campaign_name text not null,
  public_title text,
  public_description text,
  status text not null default 'active',
  max_redemptions integer not null,
  redemption_count integer not null default 0,
  target_group_id uuid references public.groups(id) on delete set null,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by_super_admin_id uuid references public.users(id) on delete set null,
  notes text,
  source_campaign text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_manager_invite_codes_status_check check (status in ('active', 'paused', 'full', 'expired', 'archived')),
  constraint promo_manager_invite_codes_capacity_positive check (max_redemptions > 0),
  constraint promo_manager_invite_codes_redemption_count_nonnegative check (redemption_count >= 0),
  constraint promo_manager_invite_codes_redemption_count_within_capacity check (redemption_count <= max_redemptions)
);

create table if not exists public.promo_manager_invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid not null references public.promo_manager_invite_codes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  normalized_email text not null,
  role_granted text not null default 'manager',
  target_group_id uuid references public.groups(id) on delete set null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint promo_manager_invite_redemptions_role_granted_check check (role_granted = 'manager'),
  constraint promo_manager_invite_redemptions_unique_user unique (invite_code_id, user_id),
  constraint promo_manager_invite_redemptions_unique_email unique (invite_code_id, normalized_email)
);

create index if not exists promo_manager_invite_codes_status_idx
  on public.promo_manager_invite_codes (status, starts_at, expires_at);

create index if not exists promo_manager_invite_codes_target_group_id_idx
  on public.promo_manager_invite_codes (target_group_id);

create index if not exists promo_manager_invite_redemptions_invite_code_id_idx
  on public.promo_manager_invite_redemptions (invite_code_id, redeemed_at desc);

create index if not exists promo_manager_invite_redemptions_user_id_idx
  on public.promo_manager_invite_redemptions (user_id, redeemed_at desc);

drop trigger if exists set_promo_manager_invite_codes_updated_at on public.promo_manager_invite_codes;
create trigger set_promo_manager_invite_codes_updated_at
before update on public.promo_manager_invite_codes
for each row execute function public.set_updated_at();

alter table public.promo_manager_invite_codes enable row level security;
alter table public.promo_manager_invite_redemptions enable row level security;

drop policy if exists "Super admins can manage promo manager invite codes" on public.promo_manager_invite_codes;
create policy "Super admins can manage promo manager invite codes"
on public.promo_manager_invite_codes for all
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins can manage promo manager invite redemptions" on public.promo_manager_invite_redemptions;
create policy "Super admins can manage promo manager invite redemptions"
on public.promo_manager_invite_redemptions for all
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

revoke all on public.promo_manager_invite_codes from anon, authenticated, public;
revoke all on public.promo_manager_invite_redemptions from anon, authenticated, public;
grant select, insert, update, delete on public.promo_manager_invite_codes to service_role;
grant select, insert, update, delete on public.promo_manager_invite_redemptions to service_role;

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
    if not exists (
      select 1
      from public.groups
      where id = v_code_row.target_group_id
        and status = 'active'
    ) then
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

  update public.promo_manager_invite_codes
  set redemption_count = redemption_count + 1,
      status = case when redemption_count + 1 >= max_redemptions then 'full' else status end,
      updated_at = now()
  where id = v_code_row.id
  returning * into v_code_row;

  return v_code_row;
end;
$promo_manager_invite$;

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
  promo_manager_code_row public.promo_manager_invite_codes%rowtype;
  derived_name text;
  raw_access_code text;
  raw_promo_manager_code text;
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

  debug_step := 'read_promo_manager_code';
  raw_promo_manager_code := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'promo_manager_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'promoManagerCode'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'promo_code'), ''),
    null
  );

  if raw_promo_manager_code is not null then
    debug_step := 'insert_user_promo_manager_code';
    derived_name := split_part(new.email, '@', 1);
    insert into public.users (id, name, email, preferred_language, role, plan_tier, needs_profile_setup)
    values (
      new.id,
      derived_name,
      new.email,
      coalesce(nullif(trim(new.raw_user_meta_data ->> 'language'), ''), 'en'),
      'player',
      'manager',
      true
    )
    on conflict (id) do nothing;

    debug_step := 'redeem_promo_manager_invite_code_for_user';
    promo_manager_code_row := public.redeem_promo_manager_invite_code_for_user(new.email, new.id, raw_promo_manager_code, '{}'::jsonb);
    return new;
  end if;

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

  debug_step := 'redeem_access_code_for_new_user';
  access_code_row := public.redeem_access_code_for_new_user(new.email, new.id, raw_access_code);
  debug_step := 'derive_access_code_name';
  derived_name := split_part(new.email, '@', 1);

  debug_step := 'insert_user_access_code';
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

  debug_step := 'insert_access_code_redemption';
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
        when target_group_kind = 'captain_private' then 'captain_private_code'
        else 'manager_code'
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
