alter table public.trophies
drop constraint if exists trophies_award_source_group_scope_chk;

alter table public.trophies
add constraint trophies_award_source_group_scope_chk
check (
  (award_source = 'system' and group_id is null)
  or award_source = 'manager'
);

update public.trophies
set award_source = 'manager'
where key in ('lucky_guess', 'heartbreaker', 'chaos_agent', 'the_oracle', 'against_the_grain');

insert into public.trophies (key, name, description, icon, tier, award_source, group_id, created_by)
values
  ('lucky_guess', 'Lucky Guess', 'Got it right... somehow.', '🎲', 'special', 'manager', null, null),
  ('heartbreaker', 'Heartbreaker', 'Always one goal off.', '💔', 'special', 'manager', null, null),
  ('chaos_agent', 'Chaos Agent', 'Wild, unpredictable picks.', '🤯', 'special', 'manager', null, null),
  ('the_oracle', 'The Oracle', 'Somehow always right.', '😎', 'special', 'manager', null, null),
  ('against_the_grain', 'Against the Grain', 'Picks against the crowd.', '🙃', 'special', 'manager', null, null)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  tier = excluded.tier,
  award_source = excluded.award_source,
  group_id = excluded.group_id;
