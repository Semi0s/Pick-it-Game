create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null unique,
  required_version text not null,
  title text not null,
  body text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  accepted_ip text,
  accepted_user_agent text,
  created_at timestamptz not null default now()
);

create unique index if not exists user_legal_acceptances_user_doc_version_unique_idx
  on public.user_legal_acceptances (user_id, document_type, document_version);

create index if not exists user_legal_acceptances_user_doc_created_idx
  on public.user_legal_acceptances (user_id, document_type, created_at desc);

drop trigger if exists set_legal_documents_updated_at on public.legal_documents;
create trigger set_legal_documents_updated_at
before update on public.legal_documents
for each row execute function public.set_updated_at();

insert into public.legal_documents (
  document_type,
  required_version,
  title,
  body,
  is_active
)
values (
  'eula',
  '2026-04-26-v1',
  'PICK-IT! Terms of Use',
  $$Welcome to PICK-IT!

By using this app, you agree to participate respectfully, keep your account information accurate, and accept that predictions, scores, group standings, and app features may change as the tournament progresses.

This is a private game experience for invited users. Group admins and super admins may manage invites, access, and group membership to keep the competition running smoothly.

Use of the app may require email-based sign-in, profile setup, and acceptance of updated terms when the app owner publishes a new required version.

If you do not agree to these terms, do not continue using PICK-IT!.$$,
  true
)
on conflict (document_type) do nothing;

alter table public.legal_documents enable row level security;
alter table public.user_legal_acceptances enable row level security;

drop policy if exists "Users can read active legal documents" on public.legal_documents;
create policy "Users can read active legal documents"
on public.legal_documents for select
to authenticated
using (is_active = true);

drop policy if exists "Users can read own legal acceptances" on public.user_legal_acceptances;
create policy "Users can read own legal acceptances"
on public.user_legal_acceptances for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own legal acceptances" on public.user_legal_acceptances;
create policy "Users can insert own legal acceptances"
on public.user_legal_acceptances for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Super admins manage legal documents" on public.legal_documents;
create policy "Super admins manage legal documents"
on public.legal_documents for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins manage legal acceptances" on public.user_legal_acceptances;
create policy "Super admins manage legal acceptances"
on public.user_legal_acceptances for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));
