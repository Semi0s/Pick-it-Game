-- Allow signup for users who have a pending group invite, even if they are not
-- on the legacy platform-wide invite list. This preserves the existing app invite
-- flow while unblocking claim-based group invites.

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
    insert into public.users (id, name, email, role)
    values (new.id, invite_row.display_name, new.email, invite_row.role)
    on conflict (id) do nothing;

    update public.invites
    set accepted_at = now(),
        status = 'accepted',
        last_error = null
    where lower(email) = lower(new.email);

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

  insert into public.users (id, name, email, role)
  values (new.id, derived_name, new.email, 'player')
  on conflict (id) do nothing;

  return new;
end;
$$;
