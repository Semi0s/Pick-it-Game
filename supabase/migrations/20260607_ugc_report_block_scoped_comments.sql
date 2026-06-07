alter table public.groups
  add column if not exists comments_enabled boolean not null default false;

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  target_type text not null
    check (target_type in ('user', 'group', 'image_avatar', 'comment', 'reaction', 'other')),
  target_id text not null,
  group_id uuid references public.groups(id) on delete set null,
  reason text not null
    check (reason in (
      'abusive_or_harassing',
      'inappropriate_image_or_name',
      'spam_or_scam',
      'impersonation',
      'cheating_or_tampering',
      'other'
    )),
  details text,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed')),
  moderation_note text,
  context_url text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_reports_target_id_length_check check (char_length(trim(target_id)) between 1 and 120),
  constraint user_reports_details_length_check check (details is null or char_length(details) <= 1000),
  constraint user_reports_note_length_check check (moderation_note is null or char_length(moderation_note) <= 500),
  constraint user_reports_context_url_length_check check (context_url is null or char_length(context_url) <= 400)
);

create index if not exists user_reports_reporter_created_idx
  on public.user_reports (reporter_id, created_at desc);

create index if not exists user_reports_target_idx
  on public.user_reports (target_type, target_id);

create index if not exists user_reports_group_status_created_idx
  on public.user_reports (group_id, status, created_at desc);

create index if not exists user_reports_status_created_idx
  on public.user_reports (status, created_at desc);

drop trigger if exists set_user_reports_updated_at on public.user_reports;
create trigger set_user_reports_updated_at
before update on public.user_reports
for each row execute function public.set_updated_at();

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id),
  constraint user_blocks_no_self_block_check check (blocker_id <> blocked_user_id)
);

create index if not exists user_blocks_blocker_idx
  on public.user_blocks (blocker_id, created_at desc);

create index if not exists user_blocks_blocked_user_idx
  on public.user_blocks (blocked_user_id);

create table if not exists public.user_report_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.user_reports(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  action_type text not null,
  old_status text,
  new_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_report_actions_action_type_length_check check (char_length(trim(action_type)) between 1 and 80),
  constraint user_report_actions_note_length_check check (note is null or char_length(note) <= 500)
);

create index if not exists user_report_actions_report_created_idx
  on public.user_report_actions (report_id, created_at desc);

create index if not exists user_report_actions_actor_created_idx
  on public.user_report_actions (actor_user_id, created_at desc);

alter table public.user_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_report_actions enable row level security;

revoke all on public.user_reports from anon, authenticated, public;
revoke all on public.user_blocks from anon, authenticated, public;
revoke all on public.user_report_actions from anon, authenticated, public;

grant select, insert on public.user_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select on public.user_report_actions to authenticated;
grant select, insert, update, delete on public.user_reports to service_role;
grant select, insert, update, delete on public.user_blocks to service_role;
grant select, insert, update, delete on public.user_report_actions to service_role;

drop policy if exists "Reporters can create reports" on public.user_reports;
create policy "Reporters can create reports"
on public.user_reports
for insert
to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "Reporters can read own reports" on public.user_reports;
create policy "Reporters can read own reports"
on public.user_reports
for select
to authenticated
using (reporter_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists "Super admins update reports" on public.user_reports;
create policy "Super admins update reports"
on public.user_reports
for update
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

drop policy if exists "Super admins delete reports" on public.user_reports;
create policy "Super admins delete reports"
on public.user_reports
for delete
to authenticated
using (public.is_super_admin(auth.uid()));

drop policy if exists "Users can read own blocks" on public.user_blocks;
create policy "Users can read own blocks"
on public.user_blocks
for select
to authenticated
using (blocker_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists "Users can create own blocks" on public.user_blocks;
create policy "Users can create own blocks"
on public.user_blocks
for insert
to authenticated
with check (blocker_id = auth.uid() and blocked_user_id <> auth.uid());

drop policy if exists "Users can delete own blocks" on public.user_blocks;
create policy "Users can delete own blocks"
on public.user_blocks
for delete
to authenticated
using (blocker_id = auth.uid() or public.is_super_admin(auth.uid()));

drop policy if exists "Super admins read report actions" on public.user_report_actions;
create policy "Super admins read report actions"
on public.user_report_actions
for select
to authenticated
using (public.is_super_admin(auth.uid()));
