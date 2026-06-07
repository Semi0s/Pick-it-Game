create table if not exists public.media_moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_access_level text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  scope_type text,
  scope_id text,
  old_status text,
  new_status text,
  note text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint media_moderation_action_length check (char_length(trim(action)) between 1 and 80),
  constraint media_moderation_target_type_length check (char_length(trim(target_type)) between 1 and 80),
  constraint media_moderation_target_id_length check (char_length(trim(target_id)) between 1 and 120),
  constraint media_moderation_note_length check (char_length(coalesce(note, '')) <= 500)
);

create index if not exists media_moderation_audit_created_idx
on public.media_moderation_audit_log (created_at desc);

create index if not exists media_moderation_audit_target_idx
on public.media_moderation_audit_log (target_type, target_id, created_at desc);

alter table public.media_moderation_audit_log enable row level security;

revoke all on public.media_moderation_audit_log from anon, authenticated, public;
grant select, insert on public.media_moderation_audit_log to authenticated;
grant select, insert, update, delete on public.media_moderation_audit_log to service_role;

drop policy if exists "Super admins read media moderation audit log" on public.media_moderation_audit_log;
create policy "Super admins read media moderation audit log"
on public.media_moderation_audit_log for select
using (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins write media moderation audit log" on public.media_moderation_audit_log;
create policy "Super admins write media moderation audit log"
on public.media_moderation_audit_log for insert
with check (public.is_super_admin(auth.uid()));
