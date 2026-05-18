create table if not exists public.admin_reset_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_email text,
  action_key text not null,
  scope text not null,
  target_ids jsonb not null default '[]'::jsonb,
  affected_counts jsonb not null default '{}'::jsonb,
  reason text not null,
  success boolean not null default true,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_reset_audit_log_action_key_length check (char_length(trim(action_key)) between 1 and 80),
  constraint admin_reset_audit_log_scope_check check (
    scope in ('user', 'group', 'match', 'group_stage', 'knockout', 'leaderboard', 'social', 'full_test', 'batch_finalize')
  ),
  constraint admin_reset_audit_log_reason_length check (char_length(trim(reason)) between 1 and 500)
);

create index if not exists admin_reset_audit_log_scope_created_idx
  on public.admin_reset_audit_log (scope, created_at desc);

create index if not exists admin_reset_audit_log_actor_created_idx
  on public.admin_reset_audit_log (actor_user_id, created_at desc);

alter table public.admin_reset_audit_log enable row level security;

drop policy if exists "Super admins read admin reset audit log" on public.admin_reset_audit_log;
create policy "Super admins read admin reset audit log"
on public.admin_reset_audit_log for select
using (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins manage admin reset audit log" on public.admin_reset_audit_log;
create policy "Super admins manage admin reset audit log"
on public.admin_reset_audit_log for all
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));
