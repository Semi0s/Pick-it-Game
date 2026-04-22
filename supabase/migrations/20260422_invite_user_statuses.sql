alter table public.invites
  alter column status drop default;

alter table public.invites
  alter column status type text
  using status::text;

update public.invites
set status = case
  when accepted_at is not null then 'accepted'
  else 'pending'
end;

alter table public.invites
  alter column status set default 'pending';

alter table public.invites
  drop constraint if exists invites_status_check;

alter table public.invites
  add constraint invites_status_check
  check (status in ('pending', 'accepted', 'revoked', 'expired', 'failed'));

do $$
begin
  if exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'invite_delivery_status'
  ) then
    drop type public.invite_delivery_status;
  end if;
end $$;

alter table public.users
  add column if not exists status text;

update public.users
set status = 'active'
where status is null;

alter table public.users
  alter column status set default 'active',
  alter column status set not null;

alter table public.users
  drop constraint if exists users_status_check;

alter table public.users
  add constraint users_status_check
  check (status in ('active', 'inactive', 'suspended'));
