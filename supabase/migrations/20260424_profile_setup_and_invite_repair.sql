-- Adds lightweight profile setup support for newly invited users and
-- keeps the existing users.name column as the public display name.
-- Also makes new invite-created profiles require profile setup and
-- backfills that flag only for users who have never signed in.

alter table public.users
  add column if not exists username text,
  add column if not exists username_set_at timestamptz,
  add column if not exists needs_profile_setup boolean not null default false;

create unique index if not exists users_username_lower_unique_idx
  on public.users (lower(username))
  where username is not null;

update public.users as users
set needs_profile_setup = true,
    updated_at = now()
from auth.users as auth_users
where auth_users.id = users.id
  and users.role = 'player'
  and users.username_set_at is null
  and users.needs_profile_setup = false
  and auth_users.last_sign_in_at is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.invites%rowtype;
  group_invite_row public.group_invites%rowtype;
  derived_name text;
begin
  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    insert into public.users (id, name, email, role, needs_profile_setup)
    values (new.id, invite_row.display_name, new.email, invite_row.role, true)
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

  if group_invite_row.id is null then
    raise exception 'Email is not invited';
  end if;

  derived_name := coalesce(nullif(trim(group_invite_row.suggested_display_name), ''), split_part(new.email, '@', 1));

  insert into public.users (id, name, email, role, needs_profile_setup)
  values (new.id, derived_name, new.email, 'player', true)
  on conflict (id) do nothing;

  return new;
end;
$$;
