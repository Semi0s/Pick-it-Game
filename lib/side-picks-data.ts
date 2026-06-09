import { createAdminClient } from "@/lib/supabase/admin";
import type { Team } from "@/lib/types";
import {
  LAST_CHANCE_FALLBACK_LOCK_AT,
  SIDE_PICK_DEFAULT_GROUP_NAME,
  SIDE_PICK_DEFINITION_KEYS,
  SIDE_PICK_PACKAGE_KEY,
  SIDE_PICK_PUBLIC_NAME,
  deriveLastChanceLockAtFromSchedule,
  getSidePicksCompletionCount,
  getDefaultDarkHorseEligibleTeamIds,
  getDefaultFavoriteFlopEligibleTeamIds,
  isSidePicksLocked,
  normalizeSidePicksSubmission,
  parseSemifinalistPickValue,
  scoreSidePicks,
  serializeSemifinalistPickValue,
  type SidePickDefinitionKey,
  type SidePickPlayerDefinitionKey,
  type SidePickScheduleMatch,
  type SidePickScoringMatch,
  type SidePicksSubmission
} from "@/lib/side-picks";
import { PUBLIC_SIGNUP_DEFAULT_GROUP_ID_KEY, fetchTextAppSetting } from "@/lib/app-settings";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type SidePickPackageRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  scoring_scope: "standard" | "group_custom";
  active: boolean;
  lock_at?: string | null;
};

export type SidePickDefinitionRow = {
  id: string;
  package_id: string;
  key: SidePickDefinitionKey;
  label: string;
  description: string;
  response_kind: "team" | "text" | "player";
  scoring_scope: "standard" | "group_custom";
  point_value: number;
  sort_order: number;
  active: boolean;
  eligible_team_ids?: string[] | null;
  metadata?: Record<string, unknown> | null;
  official_player_id?: string | null;
  official_result_source_url?: string | null;
  official_result_source_label?: string | null;
  official_result_confirmed_at?: string | null;
};

export type TournamentPlayerRow = {
  id: string;
  full_name: string;
  team_id: string | null;
  active: boolean;
  team?: {
    name: string;
    short_name: string | null;
    flag_emoji: string | null;
  } | null;
};

export type SidePickGroupContext = {
  id: string;
  name: string;
};

export type SidePickLeaderboardRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  totalPoints: number;
  rank: number;
};

export type SidePickAuditSummary = {
  usersScored: number;
  scoreRowsUpserted: number;
  warnings: string[];
};

export type SidePicksConfig = {
  package: SidePickPackageRow | null;
  definitions: SidePickDefinitionRow[];
  group: SidePickGroupContext | null;
  isEnabled: boolean;
  isLocked: boolean;
  lockAt: string | null;
  suggestedLockAt: string;
  suggestedLockSource: "official_schedule" | "manual_default";
};

export type SidePicksPageData = SidePicksConfig & {
  teams: Team[];
  tournamentPlayers: TournamentPlayerRow[];
  picks: SidePicksSubmission;
  scores: Record<SidePickDefinitionKey, { points: number; note: string } | null>;
  leaderboard: SidePickLeaderboardRow[];
};

export type SidePicksDashboardProgress = {
  isEnabled: boolean;
  isLocked: boolean;
  lockAt: string | null;
  completedPicks: number;
  totalPicks: number;
};

export async function fetchSidePicksPageData(userId: string): Promise<SidePicksPageData> {
  const adminSupabase = createAdminClient();
  const [config, teams, tournamentPlayers] = await Promise.all([
    fetchSidePicksConfig(adminSupabase),
    fetchSidePickTeams(adminSupabase),
    fetchTournamentPlayers(adminSupabase)
  ]);
  const picks = config.group && config.definitions.length > 0
    ? await fetchUserSidePicks(adminSupabase, {
        groupId: config.group.id,
        userId,
        definitions: config.definitions
      })
    : emptySidePicksSubmission();
  const scores = config.group && config.definitions.length > 0
    ? await fetchUserSidePickScores(adminSupabase, {
        groupId: config.group.id,
        userId,
        definitions: config.definitions
      })
    : emptySidePickScoreMap();
  const leaderboard = config.group ? await fetchSidePicksLeaderboard(adminSupabase, config.group.id) : [];

  return {
    ...config,
    teams,
    tournamentPlayers,
    picks,
    scores,
    leaderboard
  };
}

export async function fetchSidePicksDashboardProgress(
  adminSupabase: AdminSupabase,
  userId: string
): Promise<SidePicksDashboardProgress | null> {
  const config = await fetchSidePicksConfig(adminSupabase);
  if (!config.package || !config.group || !config.isEnabled || config.definitions.length === 0) {
    return null;
  }

  const picks = await fetchUserSidePicks(adminSupabase, {
    groupId: config.group.id,
    userId,
    definitions: config.definitions
  });

  return {
    isEnabled: config.isEnabled,
    isLocked: config.isLocked,
    lockAt: config.lockAt,
    completedPicks: getSidePicksCompletionCount(picks),
    totalPicks: SIDE_PICK_DEFINITION_KEYS.length
  };
}

export async function fetchSidePicksDashboardPreviewProgress(
  adminSupabase: AdminSupabase,
  userId: string
): Promise<SidePicksDashboardProgress | null> {
  const config = await fetchSidePicksConfig(adminSupabase);
  if (!config.package || !config.group || config.definitions.length === 0) {
    return null;
  }

  const picks = await fetchUserSidePicks(adminSupabase, {
    groupId: config.group.id,
    userId,
    definitions: config.definitions
  });

  return {
    isEnabled: config.isEnabled,
    isLocked: config.isLocked,
    lockAt: config.lockAt,
    completedPicks: getSidePicksCompletionCount(picks),
    totalPicks: SIDE_PICK_DEFINITION_KEYS.length
  };
}

export async function fetchSidePicksAdminData() {
  const adminSupabase = createAdminClient();
  const [config, teams, tournamentPlayers] = await Promise.all([
    ensureSidePicksV1Package(adminSupabase),
    fetchSidePickTeams(adminSupabase),
    fetchTournamentPlayers(adminSupabase, { includeInactive: true })
  ]);
  const leaderboard = config.group ? await fetchSidePicksLeaderboard(adminSupabase, config.group.id) : [];

  return {
    ...config,
    teams,
    tournamentPlayers,
    leaderboard
  };
}

export async function fetchSidePicksConfig(adminSupabase: AdminSupabase): Promise<SidePicksConfig> {
  const [packageResult, suggestedLock] = await Promise.all([
    adminSupabase
      .from("side_pick_packages")
      .select("id,key,name,description,scoring_scope,active,lock_at")
      .eq("key", SIDE_PICK_PACKAGE_KEY)
      .maybeSingle(),
    fetchSuggestedLastChanceLock(adminSupabase)
  ]);

  const packageRow = packageResult.error ? null : (packageResult.data as SidePickPackageRow | null);
  const definitions = packageRow ? await fetchSidePickDefinitions(adminSupabase, packageRow.id) : [];
  const group = await fetchDefaultSidePickGroup(adminSupabase);
  const lockAt = packageRow?.lock_at ?? null;

  return {
    package: packageRow,
    definitions,
    group,
    isEnabled: Boolean(packageRow?.active),
    isLocked: isSidePicksLocked(lockAt),
    lockAt,
    suggestedLockAt: suggestedLock.lockAt,
    suggestedLockSource: suggestedLock.source
  };
}

export async function ensureSidePicksV1Package(adminSupabase: AdminSupabase): Promise<SidePicksConfig> {
  const group = await fetchDefaultSidePickGroup(adminSupabase);
  const suggestedLock = await fetchSuggestedLastChanceLock(adminSupabase);
  let config = await fetchSidePicksConfig(adminSupabase);
  if (!config.package) {
    const { data, error } = await adminSupabase
      .from("side_pick_packages")
      .insert({
        key: SIDE_PICK_PACKAGE_KEY,
        name: SIDE_PICK_PUBLIC_NAME,
        description: "Late-entry tournament predictions scored on their own leaderboard.",
        scoring_scope: "standard",
        active: false,
        lock_at: suggestedLock.lockAt
      })
      .select("id,key,name,description,scoring_scope,active,lock_at")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    config = {
      package: data as SidePickPackageRow,
      definitions: [],
      group,
      isEnabled: false,
      isLocked: false,
      lockAt: suggestedLock.lockAt,
      suggestedLockAt: suggestedLock.lockAt,
      suggestedLockSource: suggestedLock.source
    };
  }

  if (!config.package) {
    throw new Error(`${SIDE_PICK_PUBLIC_NAME} package could not be created.`);
  }

  if (
    config.package.name !== SIDE_PICK_PUBLIC_NAME ||
    config.package.description !== "Late-entry tournament predictions scored on their own leaderboard." ||
    !config.package.lock_at
  ) {
    const { error } = await adminSupabase
      .from("side_pick_packages")
      .update({
        name: SIDE_PICK_PUBLIC_NAME,
        description: "Late-entry tournament predictions scored on their own leaderboard.",
        lock_at: config.package.lock_at ?? suggestedLock.lockAt,
        updated_at: new Date().toISOString()
      })
      .eq("id", config.package.id);

    if (error) {
      throw new Error(error.message);
    }

    config = await fetchSidePicksConfig(adminSupabase);
  }

  if (!config.package) {
    throw new Error(`${SIDE_PICK_PUBLIC_NAME} package could not be loaded.`);
  }

  const teams = await fetchSidePickTeams(adminSupabase);
  const existingKeys = new Set(config.definitions.map((definition) => definition.key));
  const definitionInserts = getDefaultSidePickDefinitionInputs(config.package.id, teams).filter(
    (definition) => !existingKeys.has(definition.key)
  );

  if (definitionInserts.length > 0) {
    const { error } = await adminSupabase.from("side_pick_definitions").insert(definitionInserts);
    if (error) {
      throw new Error(error.message);
    }
  }

  return fetchSidePicksConfig(adminSupabase);
}

export async function saveUserSidePicks(input: {
  userId: string;
  picks: SidePicksSubmission;
}): Promise<{ ok: true; receipt: SidePicksSubmission } | { ok: false; message: string }> {
  const adminSupabase = createAdminClient();
  const config = await fetchSidePicksConfig(adminSupabase);

  if (!config.package || !config.group || config.definitions.length === 0) {
    return { ok: false, message: `${SIDE_PICK_PUBLIC_NAME} are not configured yet.` };
  }

  if (!config.isEnabled) {
    return { ok: false, message: `${SIDE_PICK_PUBLIC_NAME} are not open yet.` };
  }

  if (config.isLocked) {
    return { ok: false, message: `${SIDE_PICK_PUBLIC_NAME} are locked and can no longer be edited.` };
  }

  const teams = await fetchSidePickTeams(adminSupabase);
  const teamIds = new Set(teams.map((team) => team.id));
  const playerIds = new Set((await fetchTournamentPlayers(adminSupabase)).map((player) => player.id));
  const definitionsByKey = new Map(config.definitions.map((definition) => [definition.key, definition]));
  const picks = normalizeSidePicksSubmission(input.picks);
  const validationError = validateSidePicksSubmission({
    picks,
    teamIds,
    playerIds,
    definitionsByKey
  });

  if (validationError) {
    return { ok: false, message: validationError };
  }

  const rows = SIDE_PICK_DEFINITION_KEYS.flatMap((key) => {
    const definition = definitionsByKey.get(key);
    if (!definition) {
      return [];
    }

    const value = getPickValueForKey(picks, key);
    return [
      {
        group_id: config.group!.id,
        definition_id: definition.id,
        user_id: input.userId,
        selected_team_id: definition.response_kind === "team" && typeof value === "string" ? value : null,
        selected_player_id: definition.response_kind === "player" && typeof value === "string" ? value : null,
        selected_text: Array.isArray(value) ? serializeSemifinalistPickValue(value) : null,
        updated_at: new Date().toISOString()
      }
    ];
  });

  const { error } = await adminSupabase
    .from("side_pick_entries")
    .upsert(rows, { onConflict: "group_id,definition_id,user_id" });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, receipt: picks };
}

export async function updateSidePicksConfig(input: {
  active: boolean;
  lockAt: string | null;
  darkHorseEligibleTeamIds: string[];
  favoriteFlopEligibleTeamIds: string[];
}) {
  const adminSupabase = createAdminClient();
  const config = await ensureSidePicksV1Package(adminSupabase);
  if (!config.package) {
    throw new Error(`${SIDE_PICK_PUBLIC_NAME} package could not be created.`);
  }

  const nextLockAt = input.lockAt;
  const remainsLocked = isSidePicksLocked(config.lockAt) && isSidePicksLocked(nextLockAt);
  if (remainsLocked && hasEligibilityChanges(config.definitions, input)) {
    throw new Error(`Eligibility is locked after the ${SIDE_PICK_PUBLIC_NAME} deadline. Move the lock deadline forward before changing eligible teams.`);
  }

  if (config.isEnabled && hasEligibilityChanges(config.definitions, input)) {
    throw new Error(`Eligibility is frozen once ${SIDE_PICK_PUBLIC_NAME} open. Disable and create a new package if eligibility must change.`);
  }

  const { error: packageError } = await adminSupabase
    .from("side_pick_packages")
    .update({
      active: input.active,
      lock_at: nextLockAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", config.package.id);

  if (packageError) {
    throw new Error(packageError.message);
  }

  const definitionsByKey = new Map(config.definitions.map((definition) => [definition.key, definition]));
  await updateDefinitionEligibility(adminSupabase, definitionsByKey.get("dark_horse"), input.darkHorseEligibleTeamIds);
  await updateDefinitionEligibility(adminSupabase, definitionsByKey.get("favorite_flop"), input.favoriteFlopEligibleTeamIds);

  return fetchSidePicksAdminData();
}

export async function createTournamentPlayer(input: {
  fullName: string;
  teamId: string | null;
}) {
  const adminSupabase = createAdminClient();
  const fullName = input.fullName.trim();
  if (!fullName) {
    throw new Error("Enter a player name.");
  }

  const id = buildTournamentPlayerId(fullName, input.teamId);
  const { error } = await adminSupabase.from("tournament_players").upsert(
    {
      id,
      full_name: fullName,
      team_id: input.teamId?.trim() || null,
      active: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(error.message);
  }

  return fetchSidePicksAdminData();
}

export async function updateTournamentPlayerActive(input: {
  playerId: string;
  active: boolean;
}) {
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("tournament_players")
    .update({
      active: input.active,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.playerId);

  if (error) {
    throw new Error(error.message);
  }

  return fetchSidePicksAdminData();
}

export async function updateSidePickOfficialPlayerResult(input: {
  key: SidePickPlayerDefinitionKey;
  playerId: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  confirmedByUserId: string;
}) {
  const adminSupabase = createAdminClient();
  const config = await ensureSidePicksV1Package(adminSupabase);
  const definition = config.definitions.find((candidate) => candidate.key === input.key);
  if (!definition) {
    throw new Error("Side Pick definition was not found.");
  }

  const playerId = input.playerId?.trim() || null;
  if (playerId) {
    const { data, error } = await adminSupabase
      .from("tournament_players")
      .select("id")
      .eq("id", playerId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Choose a valid tournament player.");
    }
  }

  const { error } = await adminSupabase
    .from("side_pick_definitions")
    .update({
      official_player_id: playerId,
      official_result_source_url: input.sourceUrl?.trim() || null,
      official_result_source_label: input.sourceLabel?.trim() || null,
      official_result_confirmed_at: playerId ? new Date().toISOString() : null,
      official_result_confirmed_by_user_id: playerId ? input.confirmedByUserId : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", definition.id);

  if (error) {
    throw new Error(error.message);
  }

  return fetchSidePicksAdminData();
}

export async function recomputeSidePickScores(): Promise<SidePickAuditSummary> {
  const adminSupabase = createAdminClient();
  const config = await ensureSidePicksV1Package(adminSupabase);
  if (!config.package || !config.group) {
    throw new Error(`${SIDE_PICK_PUBLIC_NAME} are not configured yet.`);
  }

  const [entriesResult, matches] = await Promise.all([
    adminSupabase
      .from("side_pick_entries")
      .select("group_id,definition_id,user_id,selected_team_id,selected_player_id,selected_text")
      .eq("group_id", config.group.id),
    fetchSidePickScoringMatches(adminSupabase)
  ]);

  if (entriesResult.error) {
    throw new Error(entriesResult.error.message);
  }

  const definitionsById = new Map(config.definitions.map((definition) => [definition.id, definition]));
  const picksByUser = new Map<string, SidePicksSubmission>();
  for (const row of ((entriesResult.data as Array<{
    definition_id: string;
    user_id: string;
    selected_team_id?: string | null;
    selected_player_id?: string | null;
    selected_text?: string | null;
  }> | null) ?? [])) {
    const definition = definitionsById.get(row.definition_id);
    if (!definition) {
      continue;
    }

    const current = picksByUser.get(row.user_id) ?? emptySidePicksSubmission();
    setPickValueForKey(current, definition.key, definition.response_kind === "text"
      ? parseSemifinalistPickValue(row.selected_text)
      : definition.response_kind === "player"
        ? row.selected_player_id ?? null
        : row.selected_team_id ?? null);
    picksByUser.set(row.user_id, current);
  }

  const officialPlayerResults = getOfficialPlayerResults(config.definitions);
  const pointValues = getDefinitionPointValues(config.definitions);

  const scoreRows = Array.from(picksByUser.entries()).flatMap(([userId, picks]) =>
    scoreSidePicks({ picks, matches, officialPlayerResults, pointValues }).flatMap((score) => {
      const definition = config.definitions.find((candidate) => candidate.key === score.key);
      return definition
        ? [
            {
              group_id: config.group!.id,
              definition_id: definition.id,
              user_id: userId,
              scoring_scope: "standard",
              points: score.points,
              note: score.note,
              awarded_at: new Date().toISOString()
            }
          ]
        : [];
    })
  );

  if (scoreRows.length > 0) {
    const { error } = await adminSupabase
      .from("side_pick_scores")
      .upsert(scoreRows, { onConflict: "group_id,definition_id,user_id,scoring_scope" });

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    usersScored: picksByUser.size,
    scoreRowsUpserted: scoreRows.length,
    warnings: matches.length === 0 ? ["No finalized match data was available for scoring yet."] : []
  };
}

async function fetchSidePickDefinitions(adminSupabase: AdminSupabase, packageId: string) {
  const { data, error } = await adminSupabase
    .from("side_pick_definitions")
    .select("id,package_id,key,label,description,response_kind,scoring_scope,point_value,sort_order,active,eligible_team_ids,metadata,official_player_id,official_result_source_url,official_result_source_label,official_result_confirmed_at")
    .eq("package_id", packageId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as SidePickDefinitionRow[] | null) ?? []).filter((definition) =>
    SIDE_PICK_DEFINITION_KEYS.includes(definition.key)
  );
}

async function fetchDefaultSidePickGroup(adminSupabase: AdminSupabase): Promise<SidePickGroupContext | null> {
  const configuredGroupId = await fetchTextAppSetting(PUBLIC_SIGNUP_DEFAULT_GROUP_ID_KEY, null).catch(() => null);
  const query = adminSupabase.from("groups").select("id,name").limit(1);
  const result = configuredGroupId
    ? await query.eq("id", configuredGroupId).maybeSingle()
    : await adminSupabase
        .from("groups")
        .select("id,name")
        .eq("name", SIDE_PICK_DEFAULT_GROUP_NAME)
        .limit(1)
        .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (result.data) {
    return result.data as SidePickGroupContext;
  }

  const fallback = await adminSupabase.from("groups").select("id,name").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return (fallback.data as SidePickGroupContext | null) ?? null;
}

async function fetchSidePickTeams(adminSupabase: AdminSupabase): Promise<Team[]> {
  const { data, error } = await adminSupabase
    .from("teams")
    .select("id,name,short_name,group_name,fifa_rank,flag_emoji")
    .order("fifa_rank", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<{
    id: string;
    name: string;
    short_name: string;
    group_name: string;
    fifa_rank: number | null;
    flag_emoji: string | null;
  }> | null) ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    fifaRank: team.fifa_rank ?? 0,
    flagEmoji: team.flag_emoji ?? ""
  }));
}

async function fetchTournamentPlayers(
  adminSupabase: AdminSupabase,
  options: { includeInactive?: boolean } = {}
): Promise<TournamentPlayerRow[]> {
  const query = adminSupabase
    .from("tournament_players")
    .select("id,full_name,team_id,active,team:teams(name,short_name,flag_emoji)")
    .order("full_name", { ascending: true });

  const result = options.includeInactive ? await query : await query.eq("active", true);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data as unknown as Array<{
    id: string;
    full_name: string;
    team_id?: string | null;
    active?: boolean | null;
    team?: {
      name: string;
      short_name?: string | null;
      flag_emoji?: string | null;
    } | Array<{
      name: string;
      short_name?: string | null;
      flag_emoji?: string | null;
    }> | null;
  }> | null) ?? []).map((player) => {
    const team = Array.isArray(player.team) ? player.team[0] ?? null : player.team ?? null;
    return {
      id: player.id,
      full_name: player.full_name,
      team_id: player.team_id ?? null,
      active: player.active ?? true,
      team: team
        ? {
            name: team.name,
            short_name: team.short_name ?? null,
            flag_emoji: team.flag_emoji ?? null
          }
        : null
    };
  });
}

async function fetchUserSidePicks(adminSupabase: AdminSupabase, input: {
  groupId: string;
  userId: string;
  definitions: SidePickDefinitionRow[];
}) {
  const { data, error } = await adminSupabase
    .from("side_pick_entries")
    .select("definition_id,selected_team_id,selected_player_id,selected_text")
    .eq("group_id", input.groupId)
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(error.message);
  }

  const definitionsById = new Map(input.definitions.map((definition) => [definition.id, definition]));
  const picks = emptySidePicksSubmission();
  for (const row of ((data as Array<{
    definition_id: string;
    selected_team_id?: string | null;
    selected_player_id?: string | null;
    selected_text?: string | null;
  }> | null) ?? [])) {
    const definition = definitionsById.get(row.definition_id);
    if (!definition) {
      continue;
    }

    setPickValueForKey(picks, definition.key, definition.response_kind === "text"
      ? parseSemifinalistPickValue(row.selected_text)
      : definition.response_kind === "player"
        ? row.selected_player_id ?? null
        : row.selected_team_id ?? null);
  }

  return normalizeSidePicksSubmission(picks);
}

async function fetchUserSidePickScores(adminSupabase: AdminSupabase, input: {
  groupId: string;
  userId: string;
  definitions: SidePickDefinitionRow[];
}) {
  const { data, error } = await adminSupabase
    .from("side_pick_scores")
    .select("definition_id,points,note")
    .eq("group_id", input.groupId)
    .eq("user_id", input.userId)
    .eq("scoring_scope", "standard");

  if (error) {
    throw new Error(error.message);
  }

  const definitionsById = new Map(input.definitions.map((definition) => [definition.id, definition]));
  const scores = emptySidePickScoreMap();
  for (const row of ((data as Array<{
    definition_id: string;
    points: number;
    note?: string | null;
  }> | null) ?? [])) {
    const definition = definitionsById.get(row.definition_id);
    if (definition) {
      scores[definition.key] = { points: row.points ?? 0, note: row.note ?? "" };
    }
  }

  return scores;
}

async function fetchSidePicksLeaderboard(adminSupabase: AdminSupabase, groupId: string): Promise<SidePickLeaderboardRow[]> {
  const { data, error } = await adminSupabase
    .from("side_pick_scores")
    .select("user_id,points")
    .eq("group_id", groupId)
    .eq("scoring_scope", "standard");

  if (error) {
    throw new Error(error.message);
  }

  const totalsByUserId = new Map<string, number>();
  for (const row of ((data as Array<{ user_id: string; points: number }> | null) ?? [])) {
    totalsByUserId.set(row.user_id, (totalsByUserId.get(row.user_id) ?? 0) + (row.points ?? 0));
  }

  if (totalsByUserId.size === 0) {
    return [];
  }

  const userIds = Array.from(totalsByUserId.keys());
  const usersResult = await adminSupabase
    .from("users")
    .select("id,name,avatar_url")
    .in("id", userIds);

  if (usersResult.error) {
    throw new Error(usersResult.error.message);
  }

  const usersById = new Map(
    (((usersResult.data as Array<{ id: string; name: string | null; avatar_url?: string | null }> | null) ?? [])
      .map((user) => [user.id, user] as const))
  );

  return userIds
    .map((userId) => ({
      userId,
      name: usersById.get(userId)?.name ?? "Player",
      avatarUrl: usersById.get(userId)?.avatar_url ?? null,
      totalPoints: totalsByUserId.get(userId) ?? 0,
      rank: 0
    }))
    .sort((left, right) => right.totalPoints - left.totalPoints || left.name.localeCompare(right.name))
    .map((row, index, rows) => ({
      ...row,
      rank: index > 0 && rows[index - 1]?.totalPoints === row.totalPoints ? rows[index - 1]!.rank : index + 1
    }));
}

async function fetchSidePickScoringMatches(adminSupabase: AdminSupabase): Promise<SidePickScoringMatch[]> {
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_team_id,away_team_id,home_score,away_score,winner_team_id");

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<{
    id: string;
    stage: string;
    status: string;
    home_team_id?: string | null;
    away_team_id?: string | null;
    home_score?: number | null;
    away_score?: number | null;
    winner_team_id?: string | null;
  }> | null) ?? []).map((match) => ({
    id: match.id,
    stage: match.stage,
    status: match.status,
    homeTeamId: match.home_team_id ?? null,
    awayTeamId: match.away_team_id ?? null,
    homeScore: match.home_score ?? null,
    awayScore: match.away_score ?? null,
    winnerTeamId: match.winner_team_id ?? null
  }));
}

async function fetchSuggestedLastChanceLock(adminSupabase: AdminSupabase): Promise<{
  lockAt: string;
  source: "official_schedule" | "manual_default";
}> {
  const scheduleMatches = await fetchSidePickScheduleMatches(adminSupabase).catch(() => []);
  const officialLockAt = deriveLastChanceLockAtFromSchedule(scheduleMatches);

  return {
    lockAt: officialLockAt ?? LAST_CHANCE_FALLBACK_LOCK_AT,
    source: officialLockAt ? "official_schedule" : "manual_default"
  };
}

async function fetchSidePickScheduleMatches(adminSupabase: AdminSupabase): Promise<SidePickScheduleMatch[]> {
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,group_name,kickoff_time,kickoff_at,home_team_id,away_team_id")
    .order("kickoff_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<{
    id: string;
    stage: string;
    group_name?: string | null;
    kickoff_time?: string | null;
    kickoff_at?: string | null;
    home_team_id?: string | null;
    away_team_id?: string | null;
  }> | null) ?? []).map((match) => ({
    id: match.id,
    stage: match.stage,
    groupName: match.group_name ?? null,
    kickoffTime: match.kickoff_time ?? null,
    kickoffAt: match.kickoff_at ?? null,
    homeTeamId: match.home_team_id ?? null,
    awayTeamId: match.away_team_id ?? null
  }));
}

function getDefaultSidePickDefinitionInputs(packageId: string, teams: Team[]) {
  const darkHorseIds = getDefaultDarkHorseEligibleTeamIds(teams);
  const favoriteIds = getDefaultFavoriteFlopEligibleTeamIds(teams);

  return [
    definitionInput(packageId, "champion", "Champion", "Pick the team that wins it all.", "team", 18, 10),
    definitionInput(packageId, "runner_up", "Runner-up", "Pick the losing finalist.", "team", 12, 20),
    definitionInput(packageId, "semifinalists", "Top 4 teams", "Pick four semifinalists. Any order counts.", "text", 6, 30),
    definitionInput(packageId, "dark_horse", "Dark Horse", "Pick an eligible underdog to go far.", "team", 14, 40, darkHorseIds),
    definitionInput(packageId, "favorite_flop", "Favorite Flop", "Pick an eligible favorite to fall early.", "team", 10, 50, favoriteIds),
    definitionInput(packageId, "highest_scoring_team", "Highest-scoring team", "Pick the team with the most total goals.", "team", 8, 60),
    definitionInput(packageId, "golden_boot", "Golden Boot", "Pick the player who wins the Golden Boot.", "player", 10, 70),
    definitionInput(packageId, "golden_ball", "MVP / Golden Ball", "Pick the tournament MVP / Golden Ball winner.", "player", 10, 80)
  ];
}

function definitionInput(
  packageId: string,
  key: SidePickDefinitionKey,
  label: string,
  description: string,
  responseKind: "team" | "text" | "player",
  pointValue: number,
  sortOrder: number,
  eligibleTeamIds: string[] = []
) {
  return {
    package_id: packageId,
    key,
    label,
    description,
    response_kind: responseKind,
    scoring_scope: "standard",
    point_value: pointValue,
    sort_order: sortOrder,
    active: true,
    eligible_team_ids: eligibleTeamIds,
    metadata: {}
  };
}

async function updateDefinitionEligibility(
  adminSupabase: AdminSupabase,
  definition: SidePickDefinitionRow | undefined,
  teamIds: string[]
) {
  if (!definition) {
    return;
  }

  const { error } = await adminSupabase
    .from("side_pick_definitions")
    .update({
      eligible_team_ids: Array.from(new Set(teamIds)),
      updated_at: new Date().toISOString()
    })
    .eq("id", definition.id);

  if (error) {
    throw new Error(error.message);
  }
}

function validateSidePicksSubmission(input: {
  picks: SidePicksSubmission;
  teamIds: Set<string>;
  playerIds: Set<string>;
  definitionsByKey: Map<SidePickDefinitionKey, SidePickDefinitionRow>;
}) {
  const selectedSingleTeamIds = [
    input.picks.championTeamId,
    input.picks.runnerUpTeamId,
    input.picks.darkHorseTeamId,
    input.picks.favoriteFlopTeamId,
    input.picks.highestScoringTeamId
  ].filter((teamId): teamId is string => Boolean(teamId));

  if (selectedSingleTeamIds.some((teamId) => !input.teamIds.has(teamId))) {
    return `One of your ${SIDE_PICK_PUBLIC_NAME} uses an unknown team.`;
  }

  if (input.picks.semifinalistTeamIds.length !== 4) {
    return "Pick exactly four Top 4 teams.";
  }

  if (input.picks.semifinalistTeamIds.some((teamId) => !input.teamIds.has(teamId))) {
    return "One of your Top 4 teams is unknown.";
  }

  const selectedPlayerIds = [
    input.picks.goldenBootPlayerId,
    input.picks.goldenBallPlayerId
  ].filter((playerId): playerId is string => Boolean(playerId));

  if (selectedPlayerIds.some((playerId) => !input.playerIds.has(playerId))) {
    return `One of your ${SIDE_PICK_PUBLIC_NAME} uses an unknown player.`;
  }

  const darkHorseDefinition = input.definitionsByKey.get("dark_horse");
  const favoriteFlopDefinition = input.definitionsByKey.get("favorite_flop");
  if (input.picks.darkHorseTeamId && darkHorseDefinition?.eligible_team_ids?.length && !darkHorseDefinition.eligible_team_ids.includes(input.picks.darkHorseTeamId)) {
    return "Choose a Dark Horse from the eligible underdog list.";
  }

  if (input.picks.favoriteFlopTeamId && favoriteFlopDefinition?.eligible_team_ids?.length && !favoriteFlopDefinition.eligible_team_ids.includes(input.picks.favoriteFlopTeamId)) {
    return "Choose a Favorite Flop from the eligible favorite list.";
  }

  return null;
}

function hasEligibilityChanges(
  definitions: SidePickDefinitionRow[],
  input: {
    darkHorseEligibleTeamIds: string[];
    favoriteFlopEligibleTeamIds: string[];
  }
) {
  const darkHorse = definitions.find((definition) => definition.key === "dark_horse")?.eligible_team_ids ?? [];
  const favoriteFlop = definitions.find((definition) => definition.key === "favorite_flop")?.eligible_team_ids ?? [];

  return (
    !haveSameIds(darkHorse, input.darkHorseEligibleTeamIds) ||
    !haveSameIds(favoriteFlop, input.favoriteFlopEligibleTeamIds)
  );
}

function haveSameIds(left: string[], right: string[]) {
  const normalizedLeft = Array.from(new Set(left)).sort();
  const normalizedRight = Array.from(new Set(right)).sort();
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function getDefinitionPointValues(definitions: SidePickDefinitionRow[]) {
  return definitions.reduce<Partial<Record<SidePickDefinitionKey, number>>>((values, definition) => {
    values[definition.key] = definition.point_value;
    return values;
  }, {});
}

function getOfficialPlayerResults(definitions: SidePickDefinitionRow[]) {
  return definitions.reduce<Partial<Record<SidePickPlayerDefinitionKey, string | null>>>((results, definition) => {
    if (definition.key === "golden_boot" || definition.key === "golden_ball") {
      results[definition.key] = definition.official_result_confirmed_at ? definition.official_player_id ?? null : null;
    }

    return results;
  }, {});
}

function buildTournamentPlayerId(fullName: string, teamId: string | null) {
  const normalizedName = fullName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const normalizedTeamId = teamId
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return [normalizedTeamId, normalizedName || "player"].filter(Boolean).join("-").slice(0, 120);
}

function getPickValueForKey(picks: SidePicksSubmission, key: SidePickDefinitionKey) {
  switch (key) {
    case "champion":
      return picks.championTeamId;
    case "runner_up":
      return picks.runnerUpTeamId;
    case "semifinalists":
      return picks.semifinalistTeamIds;
    case "dark_horse":
      return picks.darkHorseTeamId;
    case "favorite_flop":
      return picks.favoriteFlopTeamId;
    case "highest_scoring_team":
      return picks.highestScoringTeamId;
    case "golden_boot":
      return picks.goldenBootPlayerId;
    case "golden_ball":
      return picks.goldenBallPlayerId;
  }
}

function setPickValueForKey(picks: SidePicksSubmission, key: SidePickDefinitionKey, value: string | string[] | null) {
  switch (key) {
    case "champion":
      picks.championTeamId = typeof value === "string" ? value : null;
      break;
    case "runner_up":
      picks.runnerUpTeamId = typeof value === "string" ? value : null;
      break;
    case "semifinalists":
      picks.semifinalistTeamIds = Array.isArray(value) ? value : [];
      break;
    case "dark_horse":
      picks.darkHorseTeamId = typeof value === "string" ? value : null;
      break;
    case "favorite_flop":
      picks.favoriteFlopTeamId = typeof value === "string" ? value : null;
      break;
    case "highest_scoring_team":
      picks.highestScoringTeamId = typeof value === "string" ? value : null;
      break;
    case "golden_boot":
      picks.goldenBootPlayerId = typeof value === "string" ? value : null;
      break;
    case "golden_ball":
      picks.goldenBallPlayerId = typeof value === "string" ? value : null;
      break;
  }
}

function emptySidePicksSubmission(): SidePicksSubmission {
  return {
    championTeamId: null,
    runnerUpTeamId: null,
    semifinalistTeamIds: [],
    darkHorseTeamId: null,
    favoriteFlopTeamId: null,
    highestScoringTeamId: null,
    goldenBootPlayerId: null,
    goldenBallPlayerId: null
  };
}

function emptySidePickScoreMap(): Record<SidePickDefinitionKey, { points: number; note: string } | null> {
  return {
    champion: null,
    runner_up: null,
    semifinalists: null,
    dark_horse: null,
    favorite_flop: null,
    highest_scoring_team: null,
    golden_boot: null,
    golden_ball: null
  };
}
