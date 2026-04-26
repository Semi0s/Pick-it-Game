alter table public.trophies
add column if not exists award_source text not null default 'system'
check (award_source in ('system', 'manager'));

update public.trophies
set award_source = case
  when group_id is null then 'system'
  else 'manager'
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trophies_award_source_group_scope_chk'
  ) then
    alter table public.trophies
    add constraint trophies_award_source_group_scope_chk
    check (
      (award_source = 'system' and group_id is null)
      or (award_source = 'manager' and group_id is not null)
    );
  end if;
end $$;
