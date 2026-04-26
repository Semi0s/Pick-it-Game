alter table public.trophies
  add column if not exists created_by uuid references public.users(id) on delete set null,
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists trophies_group_id_idx
  on public.trophies (group_id);

create index if not exists trophies_created_by_idx
  on public.trophies (created_by);
