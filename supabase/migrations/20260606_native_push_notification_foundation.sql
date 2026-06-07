alter table public.user_settings
  add column if not exists notify_picks_lock_reminders boolean not null default true,
  add column if not exists notify_match_finalized boolean not null default true,
  add column if not exists notify_leaderboard_updates boolean not null default true,
  add column if not exists notify_group_activity boolean not null default true,
  add column if not exists push_permission_state text not null default 'unknown',
  add column if not exists push_permission_updated_at timestamptz;

do $$
begin
  alter table public.user_settings
    add constraint user_settings_push_permission_state_check
    check (push_permission_state in ('prompt', 'prompt-with-rationale', 'granted', 'denied', 'unknown'));
exception
  when duplicate_object then null;
end $$;

alter table public.push_tokens
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists permission_state text not null default 'unknown';

do $$
begin
  alter table public.push_tokens
    add constraint push_tokens_permission_state_check
    check (permission_state in ('prompt', 'prompt-with-rationale', 'granted', 'denied', 'unknown'));
exception
  when duplicate_object then null;
end $$;

drop trigger if exists set_push_tokens_updated_at on public.push_tokens;
create trigger set_push_tokens_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();
