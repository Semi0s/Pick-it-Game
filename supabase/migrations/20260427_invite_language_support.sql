alter table public.invites
add column if not exists language text not null default 'en';

alter table public.group_invites
add column if not exists language text not null default 'en';

update public.invites
set language = 'en'
where language is null or language = '';

update public.group_invites
set language = 'en'
where language is null or language = '';

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

  if group_invite_row.id is null then
    raise exception 'Email is not invited';
  end if;

  derived_name := coalesce(nullif(trim(group_invite_row.suggested_display_name), ''), split_part(new.email, '@', 1));

  insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
  values (
    new.id,
    derived_name,
    new.email,
    coalesce(nullif(trim(group_invite_row.language), ''), 'en'),
    'player',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
