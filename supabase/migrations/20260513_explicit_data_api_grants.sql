-- Supabase no longer auto-exposes new public tables to the Data API.
-- Keep table grants explicit and least-privilege so PostgREST, GraphQL, and supabase-js
-- only see the tables each role is meant to access.

create or replace function pg_temp.apply_table_grants(
  target_table text,
  authenticated_grants text default null,
  service_role_grants text default 'select, insert, update, delete',
  enable_rls boolean default false
)
returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || target_table) is null then
    return;
  end if;

  if enable_rls then
    execute format('alter table public.%I enable row level security', target_table);
  end if;

  execute format('revoke all on public.%I from anon, authenticated, public', target_table);

  if authenticated_grants is not null then
    execute format('grant %s on public.%I to authenticated', authenticated_grants, target_table);
  end if;

  if service_role_grants is not null then
    execute format('grant %s on public.%I to service_role', service_role_grants, target_table);
  end if;
end;
$$;

do $$
begin
  perform pg_temp.apply_table_grants('email_jobs');
  perform pg_temp.apply_table_grants('match_events');
  perform pg_temp.apply_table_grants('leaderboard_events');
  perform pg_temp.apply_table_grants('leaderboard_event_reactions');
  perform pg_temp.apply_table_grants('leaderboard_event_comments');
  perform pg_temp.apply_table_grants('access_codes');
  perform pg_temp.apply_table_grants('access_code_redemptions');
  perform pg_temp.apply_table_grants('organization_branding_audit_log');
  perform pg_temp.apply_table_grants('admin_access_change_audit_log');
  perform pg_temp.apply_table_grants('admin_reset_audit_log');
  perform pg_temp.apply_table_grants('prediction_scores');
  perform pg_temp.apply_table_grants('leaderboard_snapshots');

  perform pg_temp.apply_table_grants('invites', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('teams', 'select');
  perform pg_temp.apply_table_grants('users', 'select, update');
  perform pg_temp.apply_table_grants('matches', 'select');
  perform pg_temp.apply_table_grants('predictions', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('side_picks', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('leaderboard_entries', 'select');
  perform pg_temp.apply_table_grants('push_tokens', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('app_settings', 'select');
  perform pg_temp.apply_table_grants('user_settings', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('user_notifications', 'select, update');
  perform pg_temp.apply_table_grants('groups', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('manager_limits', 'select');
  perform pg_temp.apply_table_grants('group_members', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('group_invites', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('bracket_predictions', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('bracket_scores', 'select');
  perform pg_temp.apply_table_grants('match_probability_snapshots', 'select');
  perform pg_temp.apply_table_grants('app_updates', 'select');
  perform pg_temp.apply_table_grants('user_update_reads', 'select, insert');
  perform pg_temp.apply_table_grants('legal_documents', 'select');
  perform pg_temp.apply_table_grants('user_legal_acceptances', 'select, insert');
  perform pg_temp.apply_table_grants('trophies', 'select', enable_rls => true);
  perform pg_temp.apply_table_grants('user_trophies', 'select', enable_rls => true);
  perform pg_temp.apply_table_grants('side_pick_packages', 'select');
  perform pg_temp.apply_table_grants('side_pick_definitions', 'select');
  perform pg_temp.apply_table_grants('group_rulesets', 'select');
  perform pg_temp.apply_table_grants('side_pick_entries', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('side_pick_scores', 'select');
  perform pg_temp.apply_table_grants('group_bonus_scores', 'select');
  perform pg_temp.apply_table_grants('organizations', 'select, insert, update, delete');
  perform pg_temp.apply_table_grants('organization_branding', 'select, insert, update, delete');

  if to_regclass('public.trophies') is not null then
    execute 'drop policy if exists "Authenticated users can read trophies" on public.trophies';
    execute $sql$
      create policy "Authenticated users can read trophies"
      on public.trophies for select
      to authenticated
      using (true)
    $sql$;
  end if;

  if to_regclass('public.user_trophies') is not null then
    execute 'drop policy if exists "Users can read own trophies" on public.user_trophies';
    execute $sql$
      create policy "Users can read own trophies"
      on public.user_trophies for select
      to authenticated
      using (user_id = auth.uid())
    $sql$;
  end if;
end
$$;
