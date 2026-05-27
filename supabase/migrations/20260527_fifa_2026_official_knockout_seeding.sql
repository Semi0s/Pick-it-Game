begin;

-- The earlier placeholder bracket used ranked third-place teams as direct R32 seeds.
-- FIFA 2026 assigns the eight best third-place teams through Annexe C instead, so
-- reset pre-launch knockout test picks/scores and replace the stored knockout skeleton.
update public.matches
set next_match_id = null,
    next_match_slot = null,
    updated_at = now()
where stage in (
  'r32',
  'round_of_32',
  'r16',
  'round_of_16',
  'qf',
  'quarterfinal',
  'sf',
  'semifinal',
  'third',
  'final'
);

delete from public.matches
where stage in (
  'r32',
  'round_of_32',
  'r16',
  'round_of_16',
  'qf',
  'quarterfinal',
  'sf',
  'semifinal',
  'third',
  'final'
);

insert into public.matches (
  id,
  stage,
  group_name,
  home_team_id,
  away_team_id,
  home_source,
  away_source,
  kickoff_time,
  status,
  next_match_id,
  next_match_slot
)
values
  ('M73', 'r32', null, null, null, '2A', '2B', '2026-06-28T12:00:00-07:00', 'scheduled', 'M90', 'home'),
  ('M74', 'r32', null, null, null, '1E', 'Best 3rd from A/B/C/D/F', '2026-06-29T16:30:00-04:00', 'scheduled', 'M89', 'home'),
  ('M75', 'r32', null, null, null, '1F', '2C', '2026-06-29T19:00:00-06:00', 'scheduled', 'M90', 'away'),
  ('M76', 'r32', null, null, null, '1C', '2F', '2026-06-29T12:00:00-05:00', 'scheduled', 'M91', 'home'),
  ('M77', 'r32', null, null, null, '1I', 'Best 3rd from C/D/F/G/H', '2026-06-30T17:00:00-04:00', 'scheduled', 'M89', 'away'),
  ('M78', 'r32', null, null, null, '2E', '2I', '2026-06-30T12:00:00-05:00', 'scheduled', 'M91', 'away'),
  ('M79', 'r32', null, null, null, '1A', 'Best 3rd from C/E/F/H/I', '2026-06-30T19:00:00-06:00', 'scheduled', 'M92', 'home'),
  ('M80', 'r32', null, null, null, '1L', 'Best 3rd from E/H/I/J/K', '2026-07-01T12:00:00-04:00', 'scheduled', 'M92', 'away'),
  ('M81', 'r32', null, null, null, '1D', 'Best 3rd from B/E/F/I/J', '2026-07-01T17:00:00-07:00', 'scheduled', 'M94', 'home'),
  ('M82', 'r32', null, null, null, '1G', 'Best 3rd from A/E/H/I/J', '2026-07-01T13:00:00-07:00', 'scheduled', 'M94', 'away'),
  ('M83', 'r32', null, null, null, '2K', '2L', '2026-07-02T19:00:00-04:00', 'scheduled', 'M93', 'home'),
  ('M84', 'r32', null, null, null, '1H', '2J', '2026-07-02T12:00:00-07:00', 'scheduled', 'M93', 'away'),
  ('M85', 'r32', null, null, null, '1B', 'Best 3rd from E/F/G/I/J', '2026-07-02T20:00:00-07:00', 'scheduled', 'M96', 'home'),
  ('M86', 'r32', null, null, null, '1J', '2H', '2026-07-03T18:00:00-04:00', 'scheduled', 'M95', 'home'),
  ('M87', 'r32', null, null, null, '1K', 'Best 3rd from D/E/I/J/L', '2026-07-03T20:30:00-05:00', 'scheduled', 'M96', 'away'),
  ('M88', 'r32', null, null, null, '2D', '2G', '2026-07-03T13:00:00-05:00', 'scheduled', 'M95', 'away'),
  ('M89', 'r16', null, null, null, 'Winner of M74', 'Winner of M77', '2026-07-04T17:00:00-04:00', 'scheduled', 'M97', 'home'),
  ('M90', 'r16', null, null, null, 'Winner of M73', 'Winner of M75', '2026-07-04T12:00:00-05:00', 'scheduled', 'M97', 'away'),
  ('M91', 'r16', null, null, null, 'Winner of M76', 'Winner of M78', '2026-07-05T16:00:00-04:00', 'scheduled', 'M99', 'home'),
  ('M92', 'r16', null, null, null, 'Winner of M79', 'Winner of M80', '2026-07-05T18:00:00-06:00', 'scheduled', 'M99', 'away'),
  ('M93', 'r16', null, null, null, 'Winner of M83', 'Winner of M84', '2026-07-06T14:00:00-05:00', 'scheduled', 'M98', 'home'),
  ('M94', 'r16', null, null, null, 'Winner of M81', 'Winner of M82', '2026-07-06T17:00:00-07:00', 'scheduled', 'M98', 'away'),
  ('M95', 'r16', null, null, null, 'Winner of M86', 'Winner of M88', '2026-07-07T12:00:00-04:00', 'scheduled', 'M100', 'home'),
  ('M96', 'r16', null, null, null, 'Winner of M85', 'Winner of M87', '2026-07-07T13:00:00-07:00', 'scheduled', 'M100', 'away'),
  ('M97', 'qf', null, null, null, 'Winner of M89', 'Winner of M90', '2026-07-09T16:00:00-04:00', 'scheduled', 'M101', 'home'),
  ('M98', 'qf', null, null, null, 'Winner of M93', 'Winner of M94', '2026-07-10T12:00:00-07:00', 'scheduled', 'M101', 'away'),
  ('M99', 'qf', null, null, null, 'Winner of M91', 'Winner of M92', '2026-07-11T17:00:00-04:00', 'scheduled', 'M102', 'home'),
  ('M100', 'qf', null, null, null, 'Winner of M95', 'Winner of M96', '2026-07-11T20:00:00-05:00', 'scheduled', 'M102', 'away'),
  ('M101', 'sf', null, null, null, 'Winner of M97', 'Winner of M98', '2026-07-14T14:00:00-05:00', 'scheduled', 'M104', 'home'),
  ('M102', 'sf', null, null, null, 'Winner of M99', 'Winner of M100', '2026-07-15T15:00:00-04:00', 'scheduled', 'M104', 'away'),
  ('M103', 'third', null, null, null, 'Loser of M101', 'Loser of M102', '2026-07-18T17:00:00-04:00', 'scheduled', null, null),
  ('M104', 'final', null, null, null, 'Winner of M101', 'Winner of M102', '2026-07-19T15:00:00-04:00', 'scheduled', null, null);

insert into public.app_settings (key, boolean_value, integer_value)
values
  ('knockout_auto_seed_attempted', false, null),
  ('knockout_auto_seeded', false, null),
  ('knockout_manual_seeded', false, null)
on conflict (key) do update set
  boolean_value = excluded.boolean_value,
  integer_value = excluded.integer_value,
  updated_at = now();

commit;
