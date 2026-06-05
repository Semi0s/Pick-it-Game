update public.groups
set access_mode = 'open_by_code',
    updated_at = now()
where access_mode is null
   or trim(access_mode) = '';

alter table public.groups
  alter column access_mode set default 'open_by_code';

create or replace function public.group_allows_email(target_group_id uuid, target_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access_mode text;
begin
  select coalesce(nullif(trim(groups.access_mode), ''), 'open_by_code')
  into v_access_mode
  from public.groups
  where groups.id = target_group_id;

  if not found then
    return false;
  end if;

  if v_access_mode = 'closed' then
    return false;
  end if;

  if v_access_mode <> 'restricted_by_email' then
    return true;
  end if;

  if target_email is null or trim(target_email) = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.group_allowed_emails
    where group_allowed_emails.group_id = target_group_id
      and group_allowed_emails.email_normalized = lower(trim(target_email))
  );
end;
$$;
