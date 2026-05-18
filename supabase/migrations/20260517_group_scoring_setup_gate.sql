alter table public.group_rulesets
  add column if not exists group_stage_prediction_depth text,
  add column if not exists full_match_scoring_variant text,
  add column if not exists group_bonus_mode text,
  add column if not exists group_stage_picks_due_at timestamptz,
  add column if not exists knockout_picks_due_at timestamptz,
  add column if not exists scoring_settings_locked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_rulesets_group_stage_prediction_depth_check'
      and conrelid = 'public.group_rulesets'::regclass
  ) then
    alter table public.group_rulesets
      add constraint group_rulesets_group_stage_prediction_depth_check
      check (group_stage_prediction_depth in ('simple_results', 'full_match_scores'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_rulesets_full_match_scoring_variant_check'
      and conrelid = 'public.group_rulesets'::regclass
  ) then
    alter table public.group_rulesets
      add constraint group_rulesets_full_match_scoring_variant_check
      check (full_match_scoring_variant in ('classic', 'goal_difference_bonus'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'group_rulesets_group_bonus_mode_check'
      and conrelid = 'public.group_rulesets'::regclass
  ) then
    alter table public.group_rulesets
      add constraint group_rulesets_group_bonus_mode_check
      check (group_bonus_mode in ('classic', 'early_bird', 'high_stakes', 'all_in'));
  end if;
end $$;

create unique index if not exists group_rulesets_locked_group_unique_idx
  on public.group_rulesets (group_id)
  where scoring_settings_locked_at is not null;
