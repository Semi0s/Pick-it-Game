alter type public.match_status add value if not exists 'locked';

alter table public.matches
  add column if not exists kickoff_at timestamptz,
  add column if not exists finalized_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists external_id text,
  add column if not exists is_manual_override boolean not null default false,
  add column if not exists sync_status text,
  add column if not exists sync_error text;

update public.matches
set kickoff_at = kickoff_time
where kickoff_at is null;

create index if not exists matches_external_id_idx
  on public.matches (external_id)
  where external_id is not null;

create index if not exists matches_last_synced_at_idx
  on public.matches (last_synced_at desc)
  where last_synced_at is not null;

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  event_type text not null check (event_type in ('sync', 'finalize', 'override', 'reopen', 'lock')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists match_events_match_id_idx
  on public.match_events (match_id, created_at desc);
