update public.trophies
set award_source = 'manager'
where key in (
  'chaos_agent',
  'the_loyalist',
  'hot_streak',
  'group_legend',
  'the_oracle',
  'against_the_grain',
  'lucky_guess',
  'heartbreaker'
);

insert into public.trophies (key, name, description, icon, tier, award_source, group_id, created_by)
values
  ('chaos_agent', 'Chaos Agent', 'Wild, unpredictable picks.', '🤯', 'special', 'manager', null, null),
  ('the_loyalist', 'The Loyalist', 'Backs their favorites no matter what.', '🫡', 'special', 'manager', null, null),
  ('hot_streak', 'Hot Streak', 'Making the right calls and making it look easy.', '🔥', 'special', 'manager', null, null),
  ('group_legend', 'Group Legend', 'The name this group keeps coming back to.', '🌟', 'special', 'manager', null, null),
  ('the_oracle', 'The Oracle', 'Somehow always right.', '😎', 'special', 'manager', null, null),
  ('against_the_grain', 'Against the Grain', 'Picks against the crowd.', '🙃', 'special', 'manager', null, null),
  ('lucky_guess', 'Lucky Guess', 'Got it right... somehow.', '🎲', 'special', 'manager', null, null),
  ('heartbreaker', 'Heartbreaker', 'Always one goal off.', '💔', 'special', 'manager', null, null)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  tier = excluded.tier,
  award_source = excluded.award_source,
  group_id = excluded.group_id,
  created_by = excluded.created_by;
