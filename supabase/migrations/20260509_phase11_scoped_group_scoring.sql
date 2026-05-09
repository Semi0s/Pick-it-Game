create table if not exists public.side_pick_packages (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  scoring_scope text not null check (scoring_scope in ('standard', 'group_custom')),
  active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.side_pick_definitions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.side_pick_packages(id) on delete cascade,
  key text not null,
  label text not null,
  description text not null default '',
  response_kind text not null check (response_kind in ('team', 'text')),
  scoring_scope text not null check (scoring_scope in ('standard', 'group_custom')),
  point_value integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, key)
);

create table if not exists public.group_rulesets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  version integer not null,
  status text not null default 'active' check (status in ('draft', 'active', 'locked', 'superseded', 'archived')),
  early_group_stage_completion_bonus integer not null default 0,
  knockout_completion_bonus integer not null default 0,
  final_matchup_bonus integer not null default 0,
  exact_final_score_bonus integer not null default 0,
  side_pick_package_id uuid references public.side_pick_packages(id) on delete set null,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, version),
  constraint group_rulesets_bonus_range_chk check (
    early_group_stage_completion_bonus >= 0 and early_group_stage_completion_bonus <= 10
    and knockout_completion_bonus >= 0 and knockout_completion_bonus <= 10
    and final_matchup_bonus >= 0 and final_matchup_bonus <= 15
    and exact_final_score_bonus >= 0 and exact_final_score_bonus <= 25
  )
);

create unique index if not exists group_rulesets_active_group_unique_idx
  on public.group_rulesets (group_id)
  where status = 'active';

create table if not exists public.side_pick_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  definition_id uuid not null references public.side_pick_definitions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  selected_team_id text references public.teams(id) on delete set null,
  selected_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, definition_id, user_id)
);

create table if not exists public.side_pick_scores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  definition_id uuid not null references public.side_pick_definitions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  scoring_scope text not null check (scoring_scope in ('standard', 'group_custom')),
  points integer not null default 0,
  note text,
  awarded_by_user_id uuid references public.users(id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (group_id, definition_id, user_id, scoring_scope)
);

create table if not exists public.group_bonus_scores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  ruleset_id uuid not null references public.group_rulesets(id) on delete cascade,
  bonus_type text not null check (bonus_type in ('early_group_stage_completion', 'knockout_completion', 'final_matchup', 'exact_final_score')),
  scoring_scope text not null default 'group_custom' check (scoring_scope in ('group_custom')),
  points integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now(),
  unique (group_id, user_id, ruleset_id, bonus_type)
);

create index if not exists side_pick_definitions_package_idx
  on public.side_pick_definitions (package_id, sort_order);

create index if not exists side_pick_entries_group_user_idx
  on public.side_pick_entries (group_id, user_id);

create index if not exists side_pick_scores_group_scope_idx
  on public.side_pick_scores (group_id, scoring_scope);

create index if not exists side_pick_scores_user_scope_idx
  on public.side_pick_scores (user_id, scoring_scope);

create index if not exists group_bonus_scores_group_scope_idx
  on public.group_bonus_scores (group_id, scoring_scope);

drop trigger if exists set_side_pick_packages_updated_at on public.side_pick_packages;
create trigger set_side_pick_packages_updated_at
before update on public.side_pick_packages
for each row execute function public.set_updated_at();

drop trigger if exists set_side_pick_definitions_updated_at on public.side_pick_definitions;
create trigger set_side_pick_definitions_updated_at
before update on public.side_pick_definitions
for each row execute function public.set_updated_at();

drop trigger if exists set_group_rulesets_updated_at on public.group_rulesets;
create trigger set_group_rulesets_updated_at
before update on public.group_rulesets
for each row execute function public.set_updated_at();

drop trigger if exists set_side_pick_entries_updated_at on public.side_pick_entries;
create trigger set_side_pick_entries_updated_at
before update on public.side_pick_entries
for each row execute function public.set_updated_at();

alter table public.side_pick_packages enable row level security;
alter table public.side_pick_definitions enable row level security;
alter table public.group_rulesets enable row level security;
alter table public.side_pick_entries enable row level security;
alter table public.side_pick_scores enable row level security;
alter table public.group_bonus_scores enable row level security;

drop policy if exists "Authenticated users can read side pick packages" on public.side_pick_packages;
create policy "Authenticated users can read side pick packages"
on public.side_pick_packages for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read side pick definitions" on public.side_pick_definitions;
create policy "Authenticated users can read side pick definitions"
on public.side_pick_definitions for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read group rulesets" on public.group_rulesets;
create policy "Authenticated users can read group rulesets"
on public.group_rulesets for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read own side pick entries" on public.side_pick_entries;
create policy "Authenticated users can read own side pick entries"
on public.side_pick_entries for select
using (auth.uid() = user_id or public.is_super_admin(auth.uid()));

drop policy if exists "Authenticated users manage own side pick entries" on public.side_pick_entries;
create policy "Authenticated users manage own side pick entries"
on public.side_pick_entries for all
using (auth.uid() = user_id or public.is_super_admin(auth.uid()))
with check (auth.uid() = user_id or public.is_super_admin(auth.uid()));

drop policy if exists "Authenticated users can read side pick scores" on public.side_pick_scores;
create policy "Authenticated users can read side pick scores"
on public.side_pick_scores for select
using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read group bonus scores" on public.group_bonus_scores;
create policy "Authenticated users can read group bonus scores"
on public.group_bonus_scores for select
using (auth.role() = 'authenticated');

insert into public.side_pick_packages (key, name, description, scoring_scope, active)
values
  ('standard-world-cup-core', 'Standard World Cup Core', 'Core tournament side picks that can count toward standard scoring when enabled.', 'standard', true),
  ('group-local-underdogs', 'Group Local Underdogs', 'Group-local side picks for local bragging rights and custom rules.', 'group_custom', true)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  scoring_scope = excluded.scoring_scope,
  active = excluded.active,
  updated_at = now();

with standard_package as (
  select id from public.side_pick_packages where key = 'standard-world-cup-core'
), local_package as (
  select id from public.side_pick_packages where key = 'group-local-underdogs'
)
insert into public.side_pick_definitions (
  package_id,
  key,
  label,
  description,
  response_kind,
  scoring_scope,
  point_value,
  sort_order,
  active
)
select pkg.id, defs.key, defs.label, defs.description, defs.response_kind, defs.scoring_scope, defs.point_value, defs.sort_order, true
from (
  select id from standard_package
  union all
  select id from local_package
) as pkg
join lateral (
  values
    (
      case when pkg.id = (select id from standard_package) then 'champion' else 'local_champion' end,
      'Champion',
      'Pick the team you think will win it all.',
      'team',
      case when pkg.id = (select id from standard_package) then 'standard' else 'group_custom' end,
      case when pkg.id = (select id from standard_package) then 25 else 12 end,
      10
    ),
    (
      case when pkg.id = (select id from standard_package) then 'runner_up' else 'local_runner_up' end,
      'Runner-up',
      'Pick the team you think will finish second.',
      'team',
      case when pkg.id = (select id from standard_package) then 'standard' else 'group_custom' end,
      case when pkg.id = (select id from standard_package) then 12 else 6 end,
      20
    ),
    (
      case when pkg.id = (select id from standard_package) then 'golden_boot' else 'local_golden_boot' end,
      'Golden Boot',
      'Name the top scorer of the tournament.',
      'text',
      case when pkg.id = (select id from standard_package) then 'standard' else 'group_custom' end,
      case when pkg.id = (select id from standard_package) then 10 else 5 end,
      30
    ),
    (
      case when pkg.id = (select id from standard_package) then 'best_underdog' else 'local_best_underdog' end,
      'Best Underdog Run',
      'Choose the team that will make the most surprising run.',
      'team',
      case when pkg.id = (select id from standard_package) then 'standard' else 'group_custom' end,
      case when pkg.id = (select id from standard_package) then 8 else 4 end,
      40
    )
) as defs(key, label, description, response_kind, scoring_scope, point_value, sort_order) on true
on conflict (package_id, key) do update
set
  label = excluded.label,
  description = excluded.description,
  response_kind = excluded.response_kind,
  scoring_scope = excluded.scoring_scope,
  point_value = excluded.point_value,
  sort_order = excluded.sort_order,
  active = excluded.active,
  updated_at = now();
