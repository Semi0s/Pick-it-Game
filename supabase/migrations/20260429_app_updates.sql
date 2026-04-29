create table if not exists public.app_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  update_type text not null check (update_type in ('info', 'feature', 'warning', 'tournament', 'maintenance')),
  importance text not null default 'normal' check (importance in ('normal', 'important')),
  link_label text,
  link_url text,
  published_at timestamptz not null,
  expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_update_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  update_id uuid not null references public.app_updates(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (user_id, update_id)
);

create index if not exists app_updates_published_at_idx
  on public.app_updates (published_at desc);

create index if not exists app_updates_expires_at_idx
  on public.app_updates (expires_at);

create index if not exists user_update_reads_user_id_idx
  on public.user_update_reads (user_id, read_at desc);

drop trigger if exists set_app_updates_updated_at on public.app_updates;
create trigger set_app_updates_updated_at
before update on public.app_updates
for each row execute function public.set_updated_at();

alter table public.app_updates enable row level security;
alter table public.user_update_reads enable row level security;

drop policy if exists "Authenticated users can read active app updates" on public.app_updates;
create policy "Authenticated users can read active app updates"
on public.app_updates for select
to authenticated
using (
  published_at <= now()
  and (expires_at is null or expires_at > now())
);

drop policy if exists "Super admins manage app updates" on public.app_updates;
create policy "Super admins manage app updates"
on public.app_updates for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

drop policy if exists "Users can read own update reads" on public.user_update_reads;
create policy "Users can read own update reads"
on public.user_update_reads for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own update reads" on public.user_update_reads;
create policy "Users can insert own update reads"
on public.user_update_reads for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Super admins manage user update reads" on public.user_update_reads;
create policy "Super admins manage user update reads"
on public.user_update_reads for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));
