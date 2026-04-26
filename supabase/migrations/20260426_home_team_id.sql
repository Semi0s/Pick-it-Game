alter table public.users
  add column if not exists home_team_id text references public.teams(id);
