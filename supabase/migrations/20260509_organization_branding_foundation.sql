create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_length check (char_length(trim(name)) between 1 and 120),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.organization_branding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'draft',
  review_note text,
  draft_logo_storage_path text,
  draft_background_storage_path text,
  draft_welcome_headline text,
  draft_welcome_message text,
  draft_sponsor_prize_message text,
  live_logo_storage_path text,
  live_background_storage_path text,
  live_welcome_headline text,
  live_welcome_message text,
  live_sponsor_prize_message text,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  disabled_by_user_id uuid references public.users(id) on delete set null,
  disabled_at timestamptz,
  live_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_branding_status_check check (status in ('draft', 'pending_review', 'approved', 'rejected', 'disabled')),
  constraint organization_branding_review_note_length check (char_length(coalesce(review_note, '')) <= 280),
  constraint organization_branding_draft_headline_length check (char_length(coalesce(draft_welcome_headline, '')) <= 80),
  constraint organization_branding_draft_message_length check (char_length(coalesce(draft_welcome_message, '')) <= 280),
  constraint organization_branding_draft_sponsor_length check (char_length(coalesce(draft_sponsor_prize_message, '')) <= 280),
  constraint organization_branding_live_headline_length check (char_length(coalesce(live_welcome_headline, '')) <= 80),
  constraint organization_branding_live_message_length check (char_length(coalesce(live_welcome_message, '')) <= 280),
  constraint organization_branding_live_sponsor_length check (char_length(coalesce(live_sponsor_prize_message, '')) <= 280)
);

create table if not exists public.organization_branding_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organization_branding_audit_action_length check (char_length(trim(action)) between 1 and 80)
);

create index if not exists organization_branding_status_idx
on public.organization_branding (status);

create index if not exists organization_branding_audit_log_org_created_idx
on public.organization_branding_audit_log (organization_id, created_at desc);

create or replace function public.initialize_organization_branding()
returns trigger
language plpgsql
as $$
begin
  insert into public.organization_branding (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

drop trigger if exists initialize_organization_branding on public.organizations;
create trigger initialize_organization_branding
after insert on public.organizations
for each row execute function public.initialize_organization_branding();

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists set_organization_branding_updated_at on public.organization_branding;
create trigger set_organization_branding_updated_at
before update on public.organization_branding
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('organization-branding', 'organization-branding', false)
on conflict (id) do nothing;

alter table public.organizations enable row level security;
alter table public.organization_branding enable row level security;
alter table public.organization_branding_audit_log enable row level security;

drop policy if exists "Users read own organizations" on public.organizations;
create policy "Users read own organizations"
on public.organizations for select
using (owner_user_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists "Users manage own organizations" on public.organizations;
create policy "Users manage own organizations"
on public.organizations for all
using (owner_user_id = auth.uid() or public.is_super_admin(auth.uid()))
with check (owner_user_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists "Users read own organization branding" on public.organization_branding;
create policy "Users read own organization branding"
on public.organization_branding for select
using (
  exists (
    select 1
    from public.organizations
    where public.organizations.id = public.organization_branding.organization_id
      and (public.organizations.owner_user_id = auth.uid() or public.is_super_admin(auth.uid()))
  )
);

drop policy if exists "Users manage own organization branding" on public.organization_branding;
create policy "Users manage own organization branding"
on public.organization_branding for all
using (
  exists (
    select 1
    from public.organizations
    where public.organizations.id = public.organization_branding.organization_id
      and (public.organizations.owner_user_id = auth.uid() or public.is_super_admin(auth.uid()))
  )
)
with check (
  exists (
    select 1
    from public.organizations
    where public.organizations.id = public.organization_branding.organization_id
      and (public.organizations.owner_user_id = auth.uid() or public.is_super_admin(auth.uid()))
  )
);

drop policy if exists "Super admins read organization branding audit log" on public.organization_branding_audit_log;
create policy "Super admins read organization branding audit log"
on public.organization_branding_audit_log for select
using (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins manage organization branding audit log" on public.organization_branding_audit_log;
create policy "Super admins manage organization branding audit log"
on public.organization_branding_audit_log for all
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));
