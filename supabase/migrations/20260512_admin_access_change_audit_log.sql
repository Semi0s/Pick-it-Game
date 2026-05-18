create table if not exists public.admin_access_change_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  target_email text not null,
  action text not null,
  previous_role public.user_role not null,
  previous_plan_tier text,
  previous_access_level text not null,
  new_role public.user_role not null,
  new_plan_tier text not null,
  new_access_level text not null,
  impact_summary jsonb not null default '{}'::jsonb,
  cleanup_actions_taken jsonb not null default '[]'::jsonb,
  cleanup_counts jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint admin_access_change_audit_log_action_length check (char_length(trim(action)) between 1 and 80),
  constraint admin_access_change_audit_log_reason_length check (char_length(trim(reason)) between 1 and 500),
  constraint admin_access_change_audit_log_previous_plan_tier_check check (
    previous_plan_tier is null or previous_plan_tier in ('player', 'captain', 'manager', 'director', 'managing_director')
  ),
  constraint admin_access_change_audit_log_new_plan_tier_check check (
    new_plan_tier in ('player', 'captain', 'manager', 'director', 'managing_director')
  ),
  constraint admin_access_change_audit_log_previous_access_level_check check (
    previous_access_level in ('player', 'captain', 'manager', 'director', 'managing_director', 'super_admin')
  ),
  constraint admin_access_change_audit_log_new_access_level_check check (
    new_access_level in ('player', 'captain', 'manager', 'director', 'managing_director', 'super_admin')
  )
);

create index if not exists admin_access_change_audit_log_target_created_idx
  on public.admin_access_change_audit_log (target_user_id, created_at desc);

alter table public.admin_access_change_audit_log enable row level security;

drop policy if exists "Super admins read admin access change audit log" on public.admin_access_change_audit_log;
create policy "Super admins read admin access change audit log"
on public.admin_access_change_audit_log for select
using (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins manage admin access change audit log" on public.admin_access_change_audit_log;
create policy "Super admins manage admin access change audit log"
on public.admin_access_change_audit_log for all
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));
