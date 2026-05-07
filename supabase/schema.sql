create extension if not exists "pgcrypto";

create type public.user_role as enum ('player', 'admin');
create type public.match_stage as enum (
  'group',
  'r32',
  'r16',
  'qf',
  'sf',
  'third',
  'round_of_32',
  'round_of_16',
  'quarterfinal',
  'semifinal',
  'final'
);
create type public.match_status as enum ('scheduled', 'locked', 'live', 'final');
create type public.invite_delivery_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired',
  'failed'
);
create type public.group_status as enum ('active', 'archived');
create type public.group_member_role as enum ('manager', 'member');
create type public.group_invite_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.email_job_kind as enum ('access_email', 'password_recovery', 'group_invite_email');
create type public.email_job_status as enum ('pending', 'processing', 'retrying', 'sent', 'failed');

create table public.invites (
  email text primary key,
  display_name text not null,
  language text not null default 'en',
  role public.user_role not null default 'player',
  accepted_at timestamptz,
  status public.invite_delivery_status not null default 'pending',
  last_sent_at timestamptz,
  send_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.teams (
  id text primary key,
  name text not null,
  short_name text not null,
  group_name text not null,
  fifa_rank integer,
  flag_emoji text not null default ''
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  username text,
  username_set_at timestamptz,
  needs_profile_setup boolean not null default false,
  avatar_url text,
  home_team_id text references public.teams(id),
  preferred_language text not null default 'en',
  role public.user_role not null default 'player',
  status text not null default 'active',
  total_points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_status_check check (status in ('active', 'inactive', 'suspended'))
);

create table public.matches (
  id text primary key,
  stage public.match_stage not null,
  group_name text,
  home_team_id text references public.teams(id),
  away_team_id text references public.teams(id),
  home_source text,
  away_source text,
  kickoff_time timestamptz not null,
  kickoff_at timestamptz,
  status public.match_status not null default 'scheduled',
  home_score integer,
  away_score integer,
  winner_team_id text references public.teams(id),
  finalized_at timestamptz,
  last_synced_at timestamptz,
  external_id text,
  is_manual_override boolean not null default false,
  sync_status text,
  sync_error text,
  next_match_id text references public.matches(id) on delete set null,
  next_match_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_has_teams_or_sources check (
    (home_team_id is not null or home_source is not null)
    and (away_team_id is not null or away_source is not null)
  ),
  constraint matches_next_match_slot_check check (
    next_match_slot is null or next_match_slot in ('home', 'away')
  )
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  event_type text not null check (event_type in ('sync', 'finalize', 'override', 'reopen', 'lock')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  predicted_winner_team_id text references public.teams(id),
  predicted_is_draw boolean not null default false,
  predicted_home_score integer,
  predicted_away_score integer,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id),
  constraint one_outcome_selected check (
    (predicted_is_draw = true and predicted_winner_team_id is null)
    or (predicted_is_draw = false)
  )
);

create table public.bracket_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  predicted_home_score integer,
  predicted_away_score integer,
  predicted_winner_team_id text not null references public.teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id),
  constraint bracket_predictions_home_score_nonnegative check (
    predicted_home_score is null or predicted_home_score >= 0
  ),
  constraint bracket_predictions_away_score_nonnegative check (
    predicted_away_score is null or predicted_away_score >= 0
  )
);

create table public.bracket_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  stage public.match_stage not null,
  predicted_winner_team_id text not null references public.teams(id),
  actual_winner_team_id text not null references public.teams(id),
  round_points integer not null default 0,
  champion_points integer not null default 0,
  points integer not null default 0,
  is_correct boolean not null default false,
  scored_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create table public.side_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade unique,
  tournament_winner_team_id text references public.teams(id),
  golden_boot_player_name text,
  mvp_player_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leaderboard_entries (
  user_id uuid primary key references public.users(id) on delete cascade,
  total_points integer not null default 0,
  rank integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  key text primary key,
  boolean_value boolean not null default false,
  integer_value integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  update_type text not null check (update_type in ('info', 'feature', 'warning', 'tournament', 'maintenance')),
  importance text not null default 'normal' check (importance in ('normal', 'important')),
  card_tone text not null default 'neutral' check (card_tone in ('neutral', 'sky', 'green', 'amber', 'rose')),
  link_label text,
  link_url text,
  published_at timestamptz not null,
  expires_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_probability_snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  source text not null check (source in ('manual', 'polymarket', 'ranking', 'neutral')),
  home_win_probability double precision not null,
  draw_probability double precision not null,
  away_win_probability double precision not null,
  over_2_5_probability double precision,
  confidence double precision,
  source_url text,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint match_probability_snapshots_probability_range_check check (
    home_win_probability >= 0 and home_win_probability <= 1
    and draw_probability >= 0 and draw_probability <= 1
    and away_win_probability >= 0 and away_win_probability <= 1
    and (over_2_5_probability is null or (over_2_5_probability >= 0 and over_2_5_probability <= 1))
    and (confidence is null or (confidence >= 0 and confidence <= 1))
  )
);

create table public.user_update_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  update_id uuid not null references public.app_updates(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (user_id, update_id)
);

create index app_updates_published_at_idx
  on public.app_updates (published_at desc);

create index matches_external_id_idx
  on public.matches (external_id)
  where external_id is not null;

create index matches_last_synced_at_idx
  on public.matches (last_synced_at desc)
  where last_synced_at is not null;

create index match_events_match_id_idx
  on public.match_events (match_id, created_at desc);

create index app_updates_expires_at_idx
  on public.app_updates (expires_at);

create index user_update_reads_user_id_idx
  on public.user_update_reads (user_id, read_at desc);

create index match_probability_snapshots_match_id_fetched_at_idx
  on public.match_probability_snapshots (match_id, fetched_at desc);

create table public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  kind public.email_job_kind not null,
  email text not null,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  status public.email_job_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  requested_by_admin_id uuid references public.users(id) on delete set null,
  provider_response_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create table public.manager_limits (
  user_id uuid primary key references public.users(id) on delete cascade,
  max_groups integer not null default 3,
  max_members_per_group integer not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_limits_max_groups_positive check (max_groups > 0),
  constraint manager_limits_max_members_per_group_positive check (max_members_per_group > 0)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references public.users(id) on delete set null,
  created_by_user_id uuid references public.users(id) on delete set null,
  membership_limit integer not null default 15,
  status public.group_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_membership_limit_positive check (membership_limit > 0)
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null,
  normalized_email text not null,
  invited_by_user_id uuid references public.users(id) on delete set null,
  suggested_display_name text,
  custom_message text,
  language text not null default 'en',
  helper_language text not null default 'en',
  status public.group_invite_status not null default 'pending',
  token_hash text not null unique,
  expires_at timestamptz,
  accepted_by_user_id uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  last_sent_at timestamptz,
  send_attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_invites_normalized_email_check check (normalized_email = lower(email))
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  normalized_code text not null unique,
  label text not null,
  notes text,
  active boolean not null default true,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  group_id uuid references public.groups(id) on delete set null,
  default_role public.user_role not null default 'player',
  default_language text not null default 'en',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_codes_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint access_codes_used_count_nonnegative check (used_count >= 0),
  constraint access_codes_usage_within_limit check (max_uses is null or used_count <= max_uses)
);

create table public.access_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.access_codes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  normalized_email text not null,
  redeemed_at timestamptz not null default now(),
  status text not null default 'redeemed',
  unique (code_id, user_id),
  unique (code_id, normalized_email),
  constraint access_code_redemptions_status_check check (status in ('redeemed'))
);

create table public.prediction_scores (
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  points integer not null default 0,
  outcome_points integer not null default 0,
  exact_score_points integer not null default 0,
  goal_difference_points integer not null default 0,
  scored_at timestamptz not null default now(),
  primary key (prediction_id, match_id)
);

create table public.leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('global', 'group')),
  group_id uuid references public.groups(id) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rank integer not null,
  total_points integer not null default 0,
  created_at timestamptz not null default now(),
  constraint leaderboard_snapshots_scope_group_chk check (
    (scope_type = 'global' and group_id is null)
    or (scope_type = 'group' and group_id is not null)
  )
);

create table public.leaderboard_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'points_awarded',
      'perfect_pick',
      'rank_moved_up',
      'rank_moved_down',
      'daily_winner',
      'trophy_awarded'
    )
  ),
  scope_type text not null check (scope_type in ('global', 'group')),
  group_id uuid references public.groups(id) on delete cascade,
  match_id text references public.matches(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  related_user_id uuid references public.users(id) on delete cascade,
  points_delta integer,
  rank_delta integer,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint leaderboard_events_scope_group_chk check (
    (scope_type = 'global' and group_id is null)
    or (scope_type = 'group' and group_id is not null)
  )
);

create table public.leaderboard_event_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.leaderboard_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint leaderboard_event_reactions_unique unique (event_id, user_id, emoji)
);

create table public.leaderboard_event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.leaderboard_events(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid references public.leaderboard_events(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null,
  token text not null,
  created_at timestamptz not null default now(),
  constraint push_tokens_platform_check check (platform in ('ios', 'android', 'web'))
);

create index email_jobs_status_available_idx
  on public.email_jobs (status, available_at, created_at);

create index email_jobs_email_created_idx
  on public.email_jobs (email, created_at desc);

create index email_jobs_requested_by_created_idx
  on public.email_jobs (requested_by_admin_id, created_at desc);

create unique index email_jobs_active_dedupe_idx
  on public.email_jobs (dedupe_key)
  where status in ('pending', 'retrying', 'processing')
    and dedupe_key is not null;

create unique index users_username_lower_unique_idx
  on public.users (lower(username))
  where username is not null;

create index matches_next_match_id_idx
  on public.matches (next_match_id);

create index bracket_predictions_user_updated_idx
  on public.bracket_predictions (user_id, updated_at desc);

create index bracket_predictions_match_id_idx
  on public.bracket_predictions (match_id);

create index bracket_scores_user_scored_idx
  on public.bracket_scores (user_id, scored_at desc);

create index bracket_scores_match_id_idx
  on public.bracket_scores (match_id);

create unique index user_notifications_user_event_type_unique_idx
  on public.user_notifications (user_id, event_id, type)
  where event_id is not null
    and type <> 'event_comment';

create index user_notifications_user_created_idx
  on public.user_notifications (user_id, created_at desc);

create unique index user_notifications_event_comment_unique_idx
  on public.user_notifications (
    user_id,
    type,
    (payload->>'commentId')
  )
  where type = 'event_comment'
    and payload ? 'commentId'
    and coalesce(payload->>'commentId', '') <> '';

create unique index user_notifications_trophy_earned_unique_idx
  on public.user_notifications (
    user_id,
    type,
    (payload->>'trophyId')
  )
  where type = 'trophy_earned'
    and payload ? 'trophyId'
    and coalesce(payload->>'trophyId', '') <> '';

create unique index push_tokens_user_token_unique_idx
  on public.push_tokens (user_id, token);

create index group_members_user_id_idx
  on public.group_members (user_id);

create index group_members_group_id_idx
  on public.group_members (group_id);

create index group_invites_group_id_idx
  on public.group_invites (group_id);

create index group_invites_normalized_email_idx
  on public.group_invites (normalized_email);

create unique index group_invites_active_group_email_idx
  on public.group_invites (group_id, normalized_email)
  where status = 'pending';

create index access_codes_group_id_idx
  on public.access_codes (group_id);

create index access_codes_active_expires_idx
  on public.access_codes (active, expires_at);

create unique index access_codes_one_active_group_code_idx
  on public.access_codes (group_id)
  where group_id is not null and active = true;

create index access_code_redemptions_code_id_idx
  on public.access_code_redemptions (code_id, redeemed_at desc);

create index access_code_redemptions_user_id_idx
  on public.access_code_redemptions (user_id, redeemed_at desc);

create index manager_limits_user_id_idx
  on public.manager_limits (user_id);

create index prediction_scores_match_id_idx
  on public.prediction_scores (match_id);

create index prediction_scores_user_id_idx
  on public.prediction_scores (user_id);

create index prediction_scores_scored_at_idx
  on public.prediction_scores (scored_at desc);

create index leaderboard_snapshots_match_id_idx
  on public.leaderboard_snapshots (match_id);

create index leaderboard_snapshots_scope_group_created_idx
  on public.leaderboard_snapshots (scope_type, group_id, created_at desc);

create unique index leaderboard_snapshots_global_match_user_unique_idx
  on public.leaderboard_snapshots (match_id, user_id)
  where scope_type = 'global' and group_id is null;

create unique index leaderboard_snapshots_group_match_user_unique_idx
  on public.leaderboard_snapshots (group_id, match_id, user_id)
  where scope_type = 'group';

create index leaderboard_events_match_idx
  on public.leaderboard_events (match_id);

create index leaderboard_events_scope_created_idx
  on public.leaderboard_events (scope_type, created_at desc);

create index leaderboard_events_group_created_idx
  on public.leaderboard_events (group_id, created_at desc);

create index leaderboard_events_type_idx
  on public.leaderboard_events (event_type, created_at desc);

create index leaderboard_events_user_idx
  on public.leaderboard_events (user_id, created_at desc);

create unique index leaderboard_events_scoring_global_unique_idx
  on public.leaderboard_events (event_type, match_id, user_id)
  where scope_type = 'global'
    and group_id is null
    and event_type in ('points_awarded', 'perfect_pick', 'rank_moved_up', 'rank_moved_down');

create unique index leaderboard_events_scoring_group_unique_idx
  on public.leaderboard_events (event_type, group_id, match_id, user_id)
  where scope_type = 'group'
    and group_id is not null
    and event_type in ('points_awarded', 'perfect_pick', 'rank_moved_up', 'rank_moved_down');

create unique index leaderboard_events_daily_winner_global_unique_idx
  on public.leaderboard_events (event_type, user_id, (metadata->>'date'))
  where event_type = 'daily_winner'
    and scope_type = 'global'
    and group_id is null
    and metadata ? 'date'
    and coalesce(metadata->>'date', '') <> '';

create unique index leaderboard_events_daily_winner_group_unique_idx
  on public.leaderboard_events (event_type, group_id, user_id, (metadata->>'date'))
  where event_type = 'daily_winner'
    and scope_type = 'group'
    and group_id is not null
    and metadata ? 'date'
    and coalesce(metadata->>'date', '') <> '';

create unique index leaderboard_events_trophy_awarded_global_unique_idx
  on public.leaderboard_events (
    event_type,
    user_id,
    related_user_id,
    (metadata->>'trophy_id'),
    coalesce(metadata->>'awarded_on', '')
  )
  where event_type = 'trophy_awarded'
    and scope_type = 'global'
    and group_id is null
    and metadata ? 'trophy_id'
    and coalesce(metadata->>'trophy_id', '') <> '';

create unique index leaderboard_events_trophy_awarded_group_unique_idx
  on public.leaderboard_events (
    event_type,
    group_id,
    user_id,
    related_user_id,
    (metadata->>'trophy_id'),
    coalesce(metadata->>'awarded_on', '')
  )
  where event_type = 'trophy_awarded'
    and scope_type = 'group'
    and group_id is not null
    and metadata ? 'trophy_id'
    and coalesce(metadata->>'trophy_id', '') <> '';

create index leaderboard_event_reactions_event_id_idx
  on public.leaderboard_event_reactions (event_id);

create index leaderboard_event_reactions_user_id_idx
  on public.leaderboard_event_reactions (user_id);

create index leaderboard_event_comments_event_created_idx
  on public.leaderboard_event_comments (event_id, created_at);

create index leaderboard_event_comments_user_id_idx
  on public.leaderboard_event_comments (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sync_group_invite_email_fields()
returns trigger
language plpgsql
as $$
begin
  new.normalized_email = lower(new.email);
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_super_admin(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = target_user_id
      and role = 'admin'
  );
$$;

create or replace function public.reset_knockout_testing_data()
returns table (
  target_match_count integer,
  status_breakdown jsonb,
  reset_match_count integer,
  deleted_bracket_prediction_count integer,
  deleted_bracket_score_count integer,
  deleted_prediction_score_count integer,
  deleted_leaderboard_event_count integer,
  deleted_leaderboard_snapshot_count integer,
  deleted_user_notification_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  knockout_match_ids text[];
  unknown_non_group_match_count integer;
begin
  select count(*)
  into unknown_non_group_match_count
  from public.matches
  where stage <> 'group'
    and stage not in (
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

  if coalesce(unknown_non_group_match_count, 0) > 0 then
    raise exception 'Found non-group matches with unknown knockout stages. Aborting knockout reset.';
  end if;

  select array_agg(id order by kickoff_time, id)
  into knockout_match_ids
  from public.matches
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

  if knockout_match_ids is null or array_length(knockout_match_ids, 1) is null then
    raise exception 'No knockout matches were found. Aborting knockout reset.';
  end if;

  target_match_count := array_length(knockout_match_ids, 1);

  select coalesce(
    jsonb_object_agg(status, status_count),
    '{}'::jsonb
  )
  into status_breakdown
  from (
    select status::text as status, count(*)::integer as status_count
    from public.matches
    where id = any(knockout_match_ids)
    group by status
  ) status_counts;

  select count(*)::integer
  into deleted_bracket_prediction_count
  from public.bracket_predictions
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_bracket_score_count
  from public.bracket_scores
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_prediction_score_count
  from public.prediction_scores
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_leaderboard_event_count
  from public.leaderboard_events
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_leaderboard_snapshot_count
  from public.leaderboard_snapshots
  where match_id = any(knockout_match_ids);

  select count(*)::integer
  into deleted_user_notification_count
  from public.user_notifications
  where event_id in (
    select id
    from public.leaderboard_events
    where match_id = any(knockout_match_ids)
  );

  delete from public.bracket_predictions
  where match_id = any(knockout_match_ids);

  delete from public.bracket_scores
  where match_id = any(knockout_match_ids);

  delete from public.prediction_scores
  where match_id = any(knockout_match_ids);

  delete from public.leaderboard_snapshots
  where match_id = any(knockout_match_ids);

  delete from public.leaderboard_events
  where match_id = any(knockout_match_ids);

  update public.matches
  set
    home_team_id = null,
    away_team_id = null,
    home_score = null,
    away_score = null,
    status = 'scheduled',
    winner_team_id = null,
    updated_at = now()
  where id = any(knockout_match_ids);

  get diagnostics reset_match_count = row_count;

  return query
  select
    target_match_count,
    status_breakdown,
    reset_match_count,
    coalesce(deleted_bracket_prediction_count, 0),
    coalesce(deleted_bracket_score_count, 0),
    coalesce(deleted_prediction_score_count, 0),
    coalesce(deleted_leaderboard_event_count, 0),
    coalesce(deleted_leaderboard_snapshot_count, 0),
    coalesce(deleted_user_notification_count, 0);
end;
$$;

create or replace function public.group_member_count(target_group_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.group_members
  where group_id = target_group_id;
$$;

create or replace function public.active_owned_group_count(target_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.groups
  where owner_user_id = target_user_id
    and status = 'active';
$$;

create or replace function public.can_create_group(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.manager_limits ml
    where ml.user_id = target_user_id
      and public.active_owned_group_count(target_user_id) < ml.max_groups
  );
$$;

create or replace function public.can_set_group_membership_limit(target_user_id uuid, requested_limit integer)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin(target_user_id) then true
    else exists (
      select 1
      from public.manager_limits ml
      where ml.user_id = target_user_id
        and requested_limit <= ml.max_members_per_group
    )
  end;
$$;

create or replace function public.group_has_open_seat(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups
    where id = target_group_id
      and membership_limit > public.group_member_count(target_group_id)
  );
$$;

create or replace function public.is_group_manager(target_group_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    left join public.group_members gm
      on gm.group_id = g.id
     and gm.user_id = target_user_id
     and gm.role = 'manager'
    where g.id = target_group_id
      and (g.owner_user_id = target_user_id or gm.id is not null)
  );
$$;

create or replace function public.handle_group_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is not null then
    insert into public.group_members (group_id, user_id, role)
    values (new.id, new.owner_user_id, 'manager')
    on conflict (group_id, user_id) do update
      set role = 'manager';
  end if;

  return new;
end;
$$;

create or replace function public.claim_email_jobs(job_limit integer default 10)
returns setof public.email_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select email_jobs.id
    from public.email_jobs
    where email_jobs.status in ('pending', 'retrying')
      and email_jobs.available_at <= now()
      and email_jobs.attempts < email_jobs.max_attempts
    order by email_jobs.created_at
    for update skip locked
    limit job_limit
  ),
  claimed as (
    update public.email_jobs
    set status = 'processing',
        attempts = public.email_jobs.attempts + 1,
        locked_at = now(),
        updated_at = now()
    where public.email_jobs.id in (select candidates.id from candidates)
    returning public.email_jobs.*
  )
  select * from claimed;
end;
$$;

create or replace function public.normalize_access_code(raw_code text)
returns text
language plpgsql
immutable
as $$
begin
  if raw_code is null then
    return null;
  end if;

  return nullif(lower(regexp_replace(trim(raw_code), '\s+', '', 'g')), '');
end;
$$;

create or replace function public.redeem_access_code_for_new_user(
  auth_email text,
  auth_user_id uuid,
  raw_code text
)
returns public.access_codes
language plpgsql
security definer
set search_path = public
as $access_code$
declare
  v_normalized_code text;
  v_access_code_row public.access_codes%rowtype;
  v_existing_redemption_id uuid;
  v_target_group record;
begin
  v_normalized_code := public.normalize_access_code(raw_code);
  raise log '[access-code] redeem_access_code_for_new_user start email=% has_code=%', lower(auth_email), v_normalized_code is not null;

  if v_normalized_code is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  select *
  into v_access_code_row
  from public.access_codes
  where public.access_codes.normalized_code = v_normalized_code
  for update;

  if v_access_code_row.id is null then
    raise exception 'ACCESS_CODE_INVALID';
  end if;

  if not v_access_code_row.active then
    raise exception 'ACCESS_CODE_INACTIVE';
  end if;

  if v_access_code_row.expires_at is not null and v_access_code_row.expires_at <= now() then
    raise exception 'ACCESS_CODE_EXPIRED';
  end if;

  if v_access_code_row.max_uses is not null and v_access_code_row.used_count >= v_access_code_row.max_uses then
    raise exception 'ACCESS_CODE_FULL';
  end if;

  if v_access_code_row.group_id is not null then
    select
      groups.id,
      groups.status,
      groups.membership_limit,
      (
        select count(*)
        from public.group_members
        where group_members.group_id = groups.id
      ) as member_count
    into v_target_group
    from public.groups
    where groups.id = v_access_code_row.group_id;

    if v_target_group.id is null or v_target_group.status <> 'active' then
      raise exception 'ACCESS_CODE_GROUP_UNAVAILABLE';
    end if;

    if v_target_group.member_count >= v_target_group.membership_limit then
      raise exception 'ACCESS_CODE_GROUP_FULL';
    end if;
  end if;

  select access_code_redemptions.id
  into v_existing_redemption_id
  from public.access_code_redemptions
  where access_code_redemptions.code_id = v_access_code_row.id
    and (
      access_code_redemptions.user_id = auth_user_id
      or access_code_redemptions.normalized_email = lower(auth_email)
    )
  limit 1;

  if v_existing_redemption_id is not null then
    return v_access_code_row;
  end if;

  update public.access_codes
  set used_count = public.access_codes.used_count + 1,
      updated_at = now()
  where public.access_codes.id = v_access_code_row.id
  returning * into v_access_code_row;

  raise log '[access-code] redeem_access_code_for_new_user counted usage email=% code_id=% group_id=%', lower(auth_email), v_access_code_row.id, v_access_code_row.group_id;

  return v_access_code_row;
end;
$access_code$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  invite_row public.invites%rowtype;
  group_invite_row public.group_invites%rowtype;
  access_code_row public.access_codes%rowtype;
  derived_name text;
  raw_access_code text;
  debug_step text := 'start';
begin
  debug_step := 'read_access_code';
  raw_access_code := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'access_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'accessCode'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'invite_code'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'share_code'), ''),
    null
  );

  debug_step := 'direct_invite_lookup';
  select *
  into invite_row
  from public.invites
  where lower(email) = lower(new.email);

  if invite_row.email is not null then
    debug_step := 'insert_user_direct_invite';
    insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
    values (new.id, invite_row.display_name, new.email, coalesce(nullif(trim(invite_row.language), ''), 'en'), invite_row.role, true)
    on conflict (id) do nothing;
    return new;
  end if;

  debug_step := 'group_invite_lookup';
  select *
  into group_invite_row
  from public.group_invites
  where normalized_email = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if group_invite_row.id is not null then
    debug_step := 'derive_group_invite_name';
    derived_name := coalesce(nullif(trim(group_invite_row.suggested_display_name), ''), split_part(new.email, '@', 1));
    debug_step := 'insert_user_group_invite';
    insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
    values (new.id, derived_name, new.email, coalesce(nullif(trim(group_invite_row.language), ''), 'en'), 'player', true)
    on conflict (id) do nothing;
    return new;
  end if;

  debug_step := 'redeem_access_code_for_new_user';
  access_code_row := public.redeem_access_code_for_new_user(new.email, new.id, raw_access_code);
  debug_step := 'derive_access_code_name';
  derived_name := split_part(new.email, '@', 1);

  debug_step := 'insert_user_access_code';
  insert into public.users (id, name, email, preferred_language, role, needs_profile_setup)
  values (
    new.id,
    derived_name,
    new.email,
    coalesce(nullif(trim(access_code_row.default_language), ''), 'en'),
    access_code_row.default_role,
    true
  )
  on conflict (id) do nothing;

  debug_step := 'insert_access_code_redemption';
  insert into public.access_code_redemptions (
    code_id,
    user_id,
    email,
    normalized_email,
    redeemed_at,
    status
  )
  values (
    access_code_row.id,
    new.id,
    new.email,
    lower(new.email),
    now(),
    'redeemed'
  )
  on conflict (code_id, user_id) do nothing;

  if access_code_row.group_id is not null then
    debug_step := 'insert_group_member';
    insert into public.group_members (group_id, user_id, role)
    values (access_code_row.group_id, new.id, 'member'::public.group_member_role)
    on conflict (group_id, user_id) do nothing;
  end if;

  return new;
exception
  when others then
    raise exception 'HANDLE_NEW_USER_FAILED step=% sqlstate=% sqlerrm=%', debug_step, SQLSTATE, SQLERRM;
end;
$f$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger set_manager_limits_updated_at
before update on public.manager_limits
for each row execute function public.set_updated_at();

create trigger set_group_invites_updated_at
before update on public.group_invites
for each row execute function public.set_updated_at();

create trigger sync_group_invites_email_fields
before insert or update on public.group_invites
for each row execute function public.sync_group_invite_email_fields();

create trigger on_group_created_add_manager_membership
after insert on public.groups
for each row execute function public.handle_group_owner_membership();

create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create trigger set_app_updates_updated_at
before update on public.app_updates
for each row execute function public.set_updated_at();

create trigger set_user_settings_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

insert into public.app_settings (key, boolean_value, integer_value)
values
  ('daily_winner_enabled', false, null),
  ('perfect_pick_enabled', false, null),
  ('leaderboard_activity_enabled', false, null),
  ('max_joined_groups_per_player', false, 10)
on conflict (key) do nothing;

alter table public.invites enable row level security;
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.bracket_predictions enable row level security;
alter table public.bracket_scores enable row level security;
alter table public.side_picks enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.app_settings enable row level security;
alter table public.app_updates enable row level security;
alter table public.match_probability_snapshots enable row level security;
alter table public.user_update_reads enable row level security;
alter table public.user_settings enable row level security;
alter table public.email_jobs enable row level security;
alter table public.manager_limits enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.access_codes enable row level security;
alter table public.access_code_redemptions enable row level security;
alter table public.user_notifications enable row level security;
alter table public.push_tokens enable row level security;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Users manage own predictions before kickoff" on public.predictions;
drop policy if exists "Users can read own predictions" on public.predictions;
drop policy if exists "Admins can read all predictions" on public.predictions;
drop policy if exists "Authenticated users can read predictions after kickoff" on public.predictions;
drop policy if exists "Authenticated users can read predictions for live or final matches" on public.predictions;

create policy "Users can read own predictions"
on public.predictions for select
to authenticated
using (user_id = auth.uid());

create policy "Authenticated users can read predictions for live or final matches"
on public.predictions for select
to authenticated
using (
  auth.uid() is not null
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.status in ('live', 'final')
  )
);

create policy "Users can insert own predictions before kickoff"
on public.predictions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
);

create policy "Users can update own predictions before kickoff"
on public.predictions for update
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
);

create policy "Users can delete own predictions before kickoff"
on public.predictions for delete
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.matches
    where matches.id = predictions.match_id
      and matches.kickoff_time > now()
  )
);

create policy "Admins can read all bracket predictions"
on public.bracket_predictions for select
to authenticated
using (public.is_admin());

create policy "Admins can read all bracket scores"
on public.bracket_scores for select
to authenticated
using (public.is_admin());

create policy "Admins can read all side picks"
on public.side_picks for select
to authenticated
using (public.is_admin());

create policy "Admins manage invites"
on public.invites for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users can read profiles"
on public.users for select
to authenticated
using (true);

create policy "Users can update own profile"
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Admins can update any profile"
on public.users for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read avatars" on storage.objects;
create policy "Public can read avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = split_part(name, '.', 1)
);

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = split_part(name, '.', 1)
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = split_part(name, '.', 1)
);

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = split_part(name, '.', 1)
);

create policy "Authenticated users can read teams"
on public.teams for select
to authenticated
using (true);

create policy "Authenticated users can read matches"
on public.matches for select
to authenticated
using (true);

create policy "Admins manage matches"
on public.matches for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Authenticated users can read match probability snapshots"
on public.match_probability_snapshots for select
to authenticated
using (true);

create policy "Admins manage match probability snapshots"
on public.match_probability_snapshots for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Users manage own bracket predictions"
on public.bracket_predictions for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can read own bracket scores"
on public.bracket_scores for select
to authenticated
using (user_id = auth.uid());

create policy "Users manage own side picks"
on public.side_picks for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Authenticated users can read leaderboard"
on public.leaderboard_entries for select
to authenticated
using (true);

create policy "Authenticated users can read app settings"
on public.app_settings for select
to authenticated
using (true);

create policy "Authenticated users can read active app updates"
on public.app_updates for select
to authenticated
using (
  published_at <= now()
  and (expires_at is null or expires_at > now())
);

create policy "Super admins manage app updates"
on public.app_updates for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Users can read own update reads"
on public.user_update_reads for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own update reads"
on public.user_update_reads for insert
to authenticated
with check (user_id = auth.uid());

create policy "Super admins manage user update reads"
on public.user_update_reads for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Super admins manage app settings"
on public.app_settings for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Users can read own settings"
on public.user_settings for select
to authenticated
using (user_id = auth.uid());

create policy "Users can manage own settings"
on public.user_settings for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Super admins manage manager limits"
on public.manager_limits for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Users can read own manager limits"
on public.manager_limits for select
to authenticated
using (user_id = auth.uid());

create policy "Super admins manage groups"
on public.groups for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Authenticated users can create groups"
on public.groups for insert
to authenticated
with check (
  (
    public.is_super_admin(auth.uid())
    or (
      owner_user_id = auth.uid()
      and created_by_user_id = auth.uid()
      and public.can_create_group(auth.uid())
      and public.can_set_group_membership_limit(auth.uid(), membership_limit)
    )
  )
  and status = 'active'
);

create policy "Group members can read their groups"
on public.groups for select
to authenticated
using (
  public.is_super_admin(auth.uid())
  or exists (
    select 1
    from public.group_members
    where group_members.group_id = groups.id
      and group_members.user_id = auth.uid()
  )
);

create policy "Group managers can update managed groups"
on public.groups for update
to authenticated
using (
  public.is_group_manager(groups.id, auth.uid())
)
with check (
  public.is_group_manager(groups.id, auth.uid())
  and public.can_set_group_membership_limit(auth.uid(), membership_limit)
);

create policy "Users can read own notifications"
on public.user_notifications for select
to authenticated
using (user_id = auth.uid());

create policy "Users can update own notifications"
on public.user_notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  language text not null default 'en',
  required_version text not null,
  title text not null,
  body text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  document_version text not null,
  language text not null default 'en',
  accepted_at timestamptz not null default now(),
  accepted_ip text,
  accepted_user_agent text,
  created_at timestamptz not null default now()
);

create unique index if not exists legal_documents_document_type_language_unique_idx
  on public.legal_documents (document_type, language);

create unique index if not exists user_legal_acceptances_user_doc_version_language_unique_idx
  on public.user_legal_acceptances (user_id, document_type, document_version, language);

create index if not exists user_legal_acceptances_user_doc_created_idx
  on public.user_legal_acceptances (user_id, document_type, created_at desc);

drop trigger if exists set_legal_documents_updated_at on public.legal_documents;
create trigger set_legal_documents_updated_at
before update on public.legal_documents
for each row execute function public.set_updated_at();

insert into public.legal_documents (
  document_type,
  language,
  required_version,
  title,
  body,
  is_active
)
values (
  'eula',
  'en',
  '2026-04-26-v2-en',
  'PICK-IT! Terms of Use',
  $$PICK-IT! Terms of Use

Last updated: April 26, 2026

Welcome to PICK-IT! This game is built to be fun, social, and fair. By creating an account or using the app, you agree to these Terms of Use.

1. About the Game

PICK-IT! is a prediction game for the 2026 World Cup. Players make match predictions, join groups, compare scores, and appear on leaderboards.

The game is for entertainment purposes only.

2. Accounts

You are responsible for the accuracy of your account information and for keeping your login secure.

You may not impersonate another person, create disruptive accounts, or interfere with other players' ability to enjoy the game.

3. Predictions and Scoring

Players are responsible for making their own picks before the applicable deadline.

Picks may lock before or at match kickoff.

Scoring is based on the rules displayed in the app. PICK-IT! may correct scores, standings, match data, or leaderboard results if errors are found.

Final scoring decisions are made by the app administrator.

4. Groups and Leaderboards

Players may join private groups by invitation or approval.

Group managers may invite players, manage group participation, and view group activity according to the permissions provided in the app.

Leaderboards are provided for fun and may change as scores are updated, corrected, or finalized.

5. Fair Play

You agree not to abuse the app, attempt to manipulate scoring, access another user's account, interfere with the system, or use the app in a way that harms other players or the service.

We may suspend or remove accounts that violate these terms or disrupt the game.

6. No Gambling

PICK-IT! is not intended to be a gambling platform.

Unless clearly stated otherwise in official rules, no purchase, wager, or paid entry is required to participate.

Do not use PICK-IT! for unauthorized betting, gambling, or paid pools.

7. App Availability

We do our best to keep PICK-IT! running smoothly, but the app may occasionally be unavailable, delayed, inaccurate, or interrupted.

We are not responsible for missed picks, lost data, delayed updates, scoring delays, or technical issues beyond our reasonable control.

8. Changes to the Game

We may update the app, scoring system, rules, features, or these Terms as the game grows.

If a new version of these Terms is required, you may need to accept it before continuing to use the app.

9. Privacy

Your use of PICK-IT! is also subject to our Privacy Policy.

We collect and use information needed to operate the game, manage accounts, send invitations, display leaderboards, and improve the experience.

10. Limitation of Liability

PICK-IT! is provided "as is" and "as available."

To the fullest extent allowed by law, we are not liable for indirect, incidental, special, consequential, or punitive damages related to your use of the app.

11. Contact

For questions about these Terms, contact the PICK-IT! administrator.

Acceptance

By checking the box and continuing, you confirm that you have read and agree to these Terms of Use.$$,
  true
),
(
  'eula',
  'es',
  '2026-04-26-v2-es',
  'Términos de Uso de PICK-IT!',
  $$Términos de Uso de PICK-IT!

Última actualización: 26 de abril de 2026

Bienvenido a PICK-IT! Este juego está hecho para ser divertido, social y justo. Al crear una cuenta o usar la aplicación, aceptas estos Términos de Uso.

1. Sobre el Juego

PICK-IT! es un juego de predicciones para la Copa Mundial 2026. Los jugadores hacen predicciones de partidos, se unen a grupos, comparan puntajes y aparecen en tablas de posiciones.

El juego es solo para fines de entretenimiento.

2. Cuentas

Eres responsable de la exactitud de la información de tu cuenta y de mantener tu acceso seguro.

No puedes hacerte pasar por otra persona, crear cuentas disruptivas ni interferir con la capacidad de otros jugadores para disfrutar del juego.

3. Predicciones y Puntuación

Los jugadores son responsables de hacer sus propias predicciones antes de la fecha límite correspondiente.

Las predicciones pueden bloquearse antes o en el momento en que comience el partido.

La puntuación se basa en las reglas que se muestran en la aplicación. PICK-IT! puede corregir puntajes, clasificaciones, datos de partidos o resultados de tablas si se encuentran errores.

Las decisiones finales de puntuación las toma el administrador de la aplicación.

4. Grupos y Tablas de Posiciones

Los jugadores pueden unirse a grupos privados por invitación o aprobación.

Los administradores de grupo pueden invitar jugadores, gestionar la participación del grupo y ver la actividad del grupo según los permisos disponibles en la aplicación.

Las tablas de posiciones se ofrecen para divertirse y pueden cambiar a medida que los puntajes se actualicen, corrijan o finalicen.

5. Juego Limpio

Aceptas no abusar de la aplicación, intentar manipular la puntuación, acceder a la cuenta de otro usuario, interferir con el sistema ni usar la aplicación de una manera que perjudique a otros jugadores o al servicio.

Podemos suspender o eliminar cuentas que violen estos términos o alteren el juego.

6. No es Apuestas

PICK-IT! no está diseñado para ser una plataforma de apuestas.

A menos que se indique claramente lo contrario en reglas oficiales, no se requiere compra, apuesta ni pago para participar.

No uses PICK-IT! para apuestas no autorizadas, juegos de azar ni pozos pagados.

7. Disponibilidad de la Aplicación

Hacemos todo lo posible para que PICK-IT! funcione sin problemas, pero la aplicación puede estar ocasionalmente no disponible, retrasada, inexacta o interrumpida.

No somos responsables por predicciones perdidas, datos perdidos, actualizaciones tardías, retrasos en la puntuación ni problemas técnicos fuera de nuestro control razonable.

8. Cambios en el Juego

Podemos actualizar la aplicación, el sistema de puntuación, las reglas, las funciones o estos Términos a medida que el juego crece.

Si se requiere una nueva versión de estos Términos, es posible que debas aceptarla antes de continuar usando la aplicación.

9. Privacidad

Tu uso de PICK-IT! también está sujeto a nuestra Política de Privacidad.

Recopilamos y usamos la información necesaria para operar el juego, gestionar cuentas, enviar invitaciones, mostrar tablas de posiciones y mejorar la experiencia.

10. Limitación de Responsabilidad

PICK-IT! se ofrece "tal cual" y "según disponibilidad".

En la máxima medida permitida por la ley, no somos responsables por daños indirectos, incidentales, especiales, consecuentes o punitivos relacionados con tu uso de la aplicación.

11. Contacto

Si tienes preguntas sobre estos Términos, comunícate con el administrador de PICK-IT!.

Aceptación

Al marcar la casilla y continuar, confirmas que has leído y aceptas estos Términos de Uso.$$,
  true
)
on conflict (document_type, language) do nothing;

alter table public.legal_documents enable row level security;
alter table public.user_legal_acceptances enable row level security;

create policy "Users can read active legal documents"
on public.legal_documents for select
to authenticated
using (is_active = true);

create policy "Users can read own legal acceptances"
on public.user_legal_acceptances for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own legal acceptances"
on public.user_legal_acceptances for insert
to authenticated
with check (user_id = auth.uid());

create policy "Super admins manage legal documents"
on public.legal_documents for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Super admins manage legal acceptances"
on public.user_legal_acceptances for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create table if not exists public.trophies (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  icon text not null,
  tier text not null default 'special' check (tier in ('bronze', 'silver', 'gold', 'special')),
  award_source text not null default 'system' check (award_source in ('system', 'manager')),
  created_by uuid references public.users(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  constraint trophies_award_source_group_scope_chk check (
    (award_source = 'system' and group_id is null)
    or award_source = 'manager'
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.user_trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  trophy_id uuid not null references public.trophies(id) on delete cascade,
  awarded_at timestamptz not null default now()
);

create unique index if not exists user_trophies_user_trophy_unique_idx
  on public.user_trophies (user_id, trophy_id);

create index if not exists trophies_group_id_idx
  on public.trophies (group_id);

create index if not exists trophies_created_by_idx
  on public.trophies (created_by);

insert into public.trophies (key, name, description, icon, tier, award_source)
values
  (
    'perfect_pick_first',
    'First Perfect Pick',
    'Awarded for landing your first exact score.',
    '🎯',
    'bronze',
    'system'
  ),
  (
    'perfect_pick_3',
    'Perfect Pick Hat Trick',
    'Awarded for reaching three exact-score predictions.',
    '🎯',
    'gold',
    'system'
  ),
  (
    'big_climb',
    'Big Climb',
    'Awarded for a major jump up the leaderboard.',
    '📈',
    'silver',
    'system'
  ),
  (
    'daily_winner',
    'Daily Winner',
    'Awarded for finishing the day on top.',
    '🏆',
    'gold',
    'system'
  ),
  (
    'first_reaction',
    'First Reaction',
    'Awarded for joining the social activity feed with your first reaction.',
    '🔥',
    'special',
    'system'
  ),
  (
    'lucky_guess',
    'Lucky Guess',
    'Got it right... somehow.',
    '🎲',
    'special',
    'manager'
  ),
  (
    'heartbreaker',
    'Heartbreaker',
    'Always one goal off.',
    '💔',
    'special',
    'manager'
  ),
  (
    'chaos_agent',
    'Chaos Agent',
    'Wild, unpredictable picks.',
    '🤯',
    'special',
    'manager'
  ),
  (
    'the_loyalist',
    'The Loyalist',
    'Backs their favorites no matter what.',
    '🫡',
    'special',
    'manager'
  ),
  (
    'hot_streak',
    'Hot Streak',
    'Making the right calls and making it look easy.',
    '🔥',
    'special',
    'manager'
  ),
  (
    'group_legend',
    'Group Legend',
    'The name this group keeps coming back to.',
    '🌟',
    'special',
    'manager'
  ),
  (
    'the_oracle',
    'The Oracle',
    'Somehow always right.',
    '😎',
    'special',
    'manager'
  ),
  (
    'against_the_grain',
    'Against the Grain',
    'Picks against the crowd.',
    '🙃',
    'special',
    'manager'
  )
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  tier = excluded.tier,
  award_source = excluded.award_source,
  group_id = excluded.group_id,
  created_by = excluded.created_by;

create policy "Users can read own push tokens"
on public.push_tokens for select
to authenticated
using (user_id = auth.uid());

create policy "Users can manage own push tokens"
on public.push_tokens for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Super admins manage group members"
on public.group_members for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Users can read own group memberships"
on public.group_members for select
to authenticated
using (user_id = auth.uid());

create policy "Group managers can read group memberships"
on public.group_members for select
to authenticated
using (public.is_group_manager(group_id, auth.uid()));

create policy "Super admins manage group invites"
on public.group_invites for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Super admins manage access codes"
on public.access_codes for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Super admins manage access code redemptions"
on public.access_code_redemptions for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

create policy "Group managers can read group invites"
on public.group_invites for select
to authenticated
using (public.is_group_manager(group_id, auth.uid()));

create policy "Group managers can create pending invites"
on public.group_invites for insert
to authenticated
with check (
  public.is_group_manager(group_id, auth.uid())
  and invited_by_user_id = auth.uid()
  and status = 'pending'
  and public.group_has_open_seat(group_id)
);
