create table if not exists public.user_group_projection_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  group_name text not null,
  projection_source text not null check (projection_source in ('builder_manual', 'score_applied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_name)
);

drop trigger if exists set_user_group_projection_sources_updated_at on public.user_group_projection_sources;
create trigger set_user_group_projection_sources_updated_at
before update on public.user_group_projection_sources
for each row execute function public.set_updated_at();

alter table public.user_group_projection_sources enable row level security;

revoke all on public.user_group_projection_sources from anon, authenticated, public;
grant select, insert, update, delete on public.user_group_projection_sources to service_role;
