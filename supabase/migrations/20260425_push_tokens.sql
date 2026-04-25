create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null,
  token text not null,
  created_at timestamptz not null default now(),
  constraint push_tokens_platform_check check (platform in ('ios', 'android', 'web'))
);

create unique index if not exists push_tokens_user_token_unique_idx
  on public.push_tokens (user_id, token);

alter table public.push_tokens enable row level security;

drop policy if exists "Users can read own push tokens" on public.push_tokens;
create policy "Users can read own push tokens"
on public.push_tokens for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can manage own push tokens" on public.push_tokens;
create policy "Users can manage own push tokens"
on public.push_tokens for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
