import "server-only";

import { appendMatchEvent } from "@/lib/match-events";
import {
  buildGroupStandingsByGroup,
  buildQualifiedTeamSeeds,
  getRequiredThirdPlaceQualifierCount,
  parseSeedSource,
  resolveRoundOf32SeedAssignments,
  summarizeKnockoutSeedState,
  type GroupStageMatchForSeeding,
  type KnockoutPlaceholderMatch
} from "@/lib/knockout-seeding";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchStage, MatchStatus, Team } from "@/lib/types";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type MatchRow = {
  id: string;
  stage: MatchStage;
  group_name?: string | null;
  status: MatchStatus;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  home_score?: number | null;
  away_score?: number | null;
};

type SeedSource = "manual" | "auto";

export const KNOCKOUT_EXPECTED_GROUP_MATCH_COUNT = 72;
export const KNOCKOUT_AUTO_SEED_ATTEMPTED_SETTING_KEY = "knockout_auto_seed_attempted";
export const KNOCKOUT_AUTO_SEEDED_SETTING_KEY = "knockout_auto_seeded";
export const KNOCKOUT_MANUAL_SEEDED_SETTING_KEY = "knockout_manual_seeded";

export type OfficialKnockoutSeedResult =
  | {
      ok: true;
      seededMatches: number;
      alreadySeeded: boolean;
      forced: boolean;
      message: string;
      source: SeedSource;
      migratedProjectedPicks: number;
    }
  | {
      ok: false;
      alreadySeeded?: boolean;
      message: string;
      source: SeedSource;
    };

export type KnockoutSeedingAdminStatus = {
  finalGroupMatchCount: number;
  expectedGroupMatchCount: number;
  roundOf32Count: number;
  seededRoundOf32Count: number;
  hasAnySeeds: boolean;
  hasKnockoutStarted: boolean;
  isReady: boolean;
  canSeed: boolean;
  autoSeedAttempted: boolean;
  autoSeeded: boolean;
  manualSeeded: boolean;
  state: "waiting" | "ready" | "auto_seeded" | "manual_seeded" | "failed";
  detail: string;
};

export async function seedOfficialKnockoutFromFinalGroupResults(
  adminSupabase: AdminSupabaseClient,
  input: {
    force?: boolean;
    source: SeedSource;
    actorUserId?: string | null;
  }
): Promise<OfficialKnockoutSeedResult> {
  const force = input.force ?? false;
  const [{ data: groupMatches, error: groupMatchesError }, { data: roundOf32Matches, error: roundOf32Error }, { data: teams, error: teamsError }] =
    await Promise.all([
      adminSupabase
        .from("matches")
        .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score")
        .eq("stage", "group")
        .order("kickoff_time", { ascending: true }),
      adminSupabase
        .from("matches")
        .select("id,stage,home_source,away_source,home_team_id,away_team_id,status")
        .in("stage", ["r32", "round_of_32"])
        .order("kickoff_time", { ascending: true }),
      adminSupabase
        .from("teams")
        .select("id,name,short_name,group_name,fifa_rank,flag_emoji")
        .order("group_name", { ascending: true })
        .order("name", { ascending: true })
    ]);

  if (groupMatchesError) {
    return { ok: false, message: groupMatchesError.message, source: input.source };
  }
  if (roundOf32Error) {
    return { ok: false, message: roundOf32Error.message, source: input.source };
  }
  if (teamsError) {
    return { ok: false, message: teamsError.message, source: input.source };
  }

  const mappedRoundOf32Matches = ((roundOf32Matches ?? []) as MatchRow[]).map((match) => ({
    id: match.id,
    stage: match.stage,
    homeSource: match.home_source ?? null,
    awaySource: match.away_source ?? null,
    homeTeamId: match.home_team_id ?? null,
    awayTeamId: match.away_team_id ?? null,
    status: match.status
  })) satisfies KnockoutPlaceholderMatch[];
  const seedState = summarizeKnockoutSeedState(mappedRoundOf32Matches);
  if (seedState.roundOf32MatchCount === 0) {
    return { ok: false, message: "Round of 32 placeholder matches are not available yet.", source: input.source };
  }
  if (seedState.hasKnockoutStarted) {
    return { ok: false, message: "Knockout seeding is locked because the Round of 32 has already started.", source: input.source };
  }

  const mappedGroupMatches = ((groupMatches ?? []) as MatchRow[]).map((match) => ({
    id: match.id,
    stage: match.stage,
    groupName: match.group_name ?? null,
    status: match.status,
    homeTeamId: match.home_team_id ?? null,
    awayTeamId: match.away_team_id ?? null,
    homeScore: match.home_score ?? null,
    awayScore: match.away_score ?? null
  })) satisfies GroupStageMatchForSeeding[];
  const finalGroupMatchCount = mappedGroupMatches.filter((match) => match.status === "final").length;
  if (finalGroupMatchCount < KNOCKOUT_EXPECTED_GROUP_MATCH_COUNT) {
    return {
      ok: false,
      message: `Knockout seeding not ready. Finalize all ${KNOCKOUT_EXPECTED_GROUP_MATCH_COUNT} group-stage matches before seeding the Round of 32.`,
      source: input.source
    };
  }
  if (seedState.hasAnySeeds && !force) {
    return {
      ok: false,
      alreadySeeded: true,
      message: "Group-stage results are complete and knockout matches already exist. Re-seeding may overwrite current Round of 32 team assignments.",
      source: input.source
    };
  }

  const mappedTeams: Team[] = ((teams ?? []) as Array<{
    id: string;
    name: string;
    short_name: string;
    group_name: string;
    fifa_rank: number | null;
    flag_emoji: string;
  }>).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    fifaRank: team.fifa_rank ?? 0,
    flagEmoji: team.flag_emoji
  }));

  if (input.source === "auto") {
    await setSeedingFlags(adminSupabase, {
      attempted: true,
      autoSeeded: false,
      manualSeeded: false
    });
  }

  try {
    const standingsByGroup = buildGroupStandingsByGroup(mappedGroupMatches, mappedTeams);
    const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(mappedRoundOf32Matches);
    const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(
      standingsByGroup,
      requiredThirdPlaceQualifierCount || 8
    );
    if (rankedThirdPlaceTeams.length < (requiredThirdPlaceQualifierCount || 8)) {
      throw new Error("Could not determine all required best third-place qualifiers.");
    }

    const slotDiagnostics = mappedRoundOf32Matches.flatMap((match) => [
      { matchId: match.id, side: "home" as const, rawSource: match.homeSource ?? null, parsedSource: parseSeedSource(match.homeSource) },
      { matchId: match.id, side: "away" as const, rawSource: match.awaySource ?? null, parsedSource: parseSeedSource(match.awaySource) }
    ]);
    const assignments = resolveRoundOf32SeedAssignments(
      mappedRoundOf32Matches,
      automaticQualifiers,
      rankedThirdPlaceTeams
    );

    if (assignments.length !== seedState.roundOf32MatchCount) {
      const totalSourceSlots = mappedRoundOf32Matches.length * 2;
      const parsedSourceSlots = slotDiagnostics.filter((slot) => slot.parsedSource !== null).length;
      const unresolvedSourceExamples = slotDiagnostics
        .filter((slot) => slot.parsedSource === null && slot.rawSource)
        .slice(0, 6)
        .map((slot) => slot.rawSource);
      throw new Error(
        `Could not seed Round of 32. Found ${seedState.roundOf32MatchCount} matches and ${totalSourceSlots} source slots, parsed ${parsedSourceSlots}, and resolved ${assignments.length} match assignments. Example unresolved sources: ${unresolvedSourceExamples.length > 0 ? unresolvedSourceExamples.join(", ") : "none"}.`
      );
    }

    const seededAt = new Date().toISOString();
    const writeResults = await Promise.all(
      assignments.map(async (assignment) => {
        const { error } = await adminSupabase
          .from("matches")
          .update({
            home_team_id: assignment.homeTeamId,
            away_team_id: assignment.awayTeamId,
            home_source: assignment.homeSource,
            away_source: assignment.awaySource,
            updated_at: seededAt
          })
          .eq("id", assignment.matchId);

        return { matchId: assignment.matchId, error };
      })
    );
    const failedWrite = writeResults.find((result) => result.error);
    if (failedWrite?.error) {
      throw failedWrite.error;
    }

    const migratedProjectedPicks = await migrateProjectedRoundOf32Picks(
      adminSupabase,
      assignments.map((assignment) => ({
        matchId: assignment.matchId,
        homeTeamId: assignment.homeTeamId,
        awayTeamId: assignment.awayTeamId
      }))
    );

    await setSeedingFlags(adminSupabase, {
      attempted: input.source === "auto",
      autoSeeded: input.source === "auto",
      manualSeeded: input.source === "manual"
    });
    await appendMatchEvent(adminSupabase, {
      matchId: assignments[0]?.matchId ?? mappedRoundOf32Matches[0]?.id ?? "r32",
      eventType: "seed",
      payload: {
        source: input.source,
        forced: force,
        actorUserId: input.actorUserId ?? null,
        seededMatches: assignments.length,
        migratedProjectedPicks: migratedProjectedPicks.migrated
      }
    });

    return {
      ok: true,
      seededMatches: assignments.length,
      alreadySeeded: seedState.hasAnySeeds,
      forced: force,
      source: input.source,
      migratedProjectedPicks: migratedProjectedPicks.migrated,
      message:
        input.source === "auto"
          ? `Knockout auto-seeded from final group results across ${assignments.length} Round of 32 matches${migratedProjectedPicks.migrated > 0 ? ` and retained ${migratedProjectedPicks.migrated} projected picks for comparison` : ""}.`
          : force
            ? `Knockout reseeded from final group results across ${assignments.length} Round of 32 matches${migratedProjectedPicks.migrated > 0 ? ` and retained ${migratedProjectedPicks.migrated} projected picks for comparison` : ""}.`
            : `Knockout seeded from final group results across ${assignments.length} Round of 32 matches${migratedProjectedPicks.migrated > 0 ? ` and retained ${migratedProjectedPicks.migrated} projected picks for comparison` : ""}.`
    };
  } catch (error) {
    if (input.source === "auto") {
      await setSeedingFlags(adminSupabase, {
        attempted: true,
        autoSeeded: false,
        manualSeeded: false
      });
    }

    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not seed the knockout bracket.",
      source: input.source
    };
  }
}

export async function fetchKnockoutSeedingAdminStatus(
  adminSupabase: AdminSupabaseClient
): Promise<KnockoutSeedingAdminStatus> {
  const [{ data: groupMatches, error: groupMatchesError }, { data: roundOf32Matches, error: roundOf32Error }] = await Promise.all([
    adminSupabase.from("matches").select("id,status").eq("stage", "group"),
    adminSupabase
      .from("matches")
      .select("id,status,home_team_id,away_team_id")
      .in("stage", ["r32", "round_of_32"])
  ]);
  if (groupMatchesError) {
    throw groupMatchesError;
  }
  if (roundOf32Error) {
    throw roundOf32Error;
  }

  const flags = await fetchSeedingFlags(adminSupabase);
  const finalGroupMatchCount = ((groupMatches ?? []) as Array<{ status: MatchStatus }>).filter((match) => match.status === "final").length;
  const roundOf32Count = (roundOf32Matches ?? []).length;
  const seededRoundOf32Count = ((roundOf32Matches ?? []) as Array<{ home_team_id?: string | null; away_team_id?: string | null }>).filter(
    (match) => match.home_team_id && match.away_team_id
  ).length;
  const hasAnySeeds = ((roundOf32Matches ?? []) as Array<{ home_team_id?: string | null; away_team_id?: string | null }>).some(
    (match) => match.home_team_id || match.away_team_id
  );
  const hasKnockoutStarted = ((roundOf32Matches ?? []) as Array<{ status: MatchStatus }>).some(
    (match) => match.status !== "scheduled"
  );
  const isReady = finalGroupMatchCount >= KNOCKOUT_EXPECTED_GROUP_MATCH_COUNT;
  const canSeed = roundOf32Count > 0 && isReady && !hasKnockoutStarted;

  let state: KnockoutSeedingAdminStatus["state"] = "waiting";
  let detail = `Finalize all ${KNOCKOUT_EXPECTED_GROUP_MATCH_COUNT} group-stage matches before seeding the Round of 32.`;
  if (hasKnockoutStarted) {
    state = flags.autoSeeded ? "auto_seeded" : flags.manualSeeded || hasAnySeeds ? "manual_seeded" : "failed";
    detail = "Round of 32 matches have already started. Automatic seeding is locked.";
  } else if (flags.autoSeeded && hasAnySeeds) {
    state = "auto_seeded";
    detail = "Round of 32 was auto-seeded after the final group-stage results completed.";
  } else if ((flags.manualSeeded || hasAnySeeds) && !flags.autoSeeded) {
    state = "manual_seeded";
    detail = "Round of 32 was seeded manually. Admin reseed remains available if needed.";
  } else if (isReady && !hasAnySeeds && flags.attempted) {
    state = "failed";
    detail = "Automatic seeding tried to run but the Round of 32 still needs admin attention.";
  } else if (isReady && !hasAnySeeds) {
    state = "ready";
    detail = `All ${KNOCKOUT_EXPECTED_GROUP_MATCH_COUNT} group-stage matches are final. Round of 32 can now be seeded.`;
  }

  return {
    finalGroupMatchCount,
    expectedGroupMatchCount: KNOCKOUT_EXPECTED_GROUP_MATCH_COUNT,
    roundOf32Count,
    seededRoundOf32Count,
    hasAnySeeds,
    hasKnockoutStarted,
    isReady,
    canSeed,
    autoSeedAttempted: flags.attempted,
    autoSeeded: flags.autoSeeded,
    manualSeeded: flags.manualSeeded,
    state,
    detail
  };
}

export async function clearKnockoutSeedingFlags(adminSupabase: AdminSupabaseClient) {
  await setSeedingFlags(adminSupabase, {
    attempted: false,
    autoSeeded: false,
    manualSeeded: false
  });
}

async function fetchSeedingFlags(adminSupabase: AdminSupabaseClient) {
  const { data, error } = await adminSupabase
    .from("app_settings")
    .select("key,boolean_value")
    .in("key", [
      KNOCKOUT_AUTO_SEED_ATTEMPTED_SETTING_KEY,
      KNOCKOUT_AUTO_SEEDED_SETTING_KEY,
      KNOCKOUT_MANUAL_SEEDED_SETTING_KEY
    ]);
  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{ key: string; boolean_value: boolean | null }>;
  const readFlag = (key: string) => rows.find((row) => row.key === key)?.boolean_value ?? false;

  return {
    attempted: readFlag(KNOCKOUT_AUTO_SEED_ATTEMPTED_SETTING_KEY),
    autoSeeded: readFlag(KNOCKOUT_AUTO_SEEDED_SETTING_KEY),
    manualSeeded: readFlag(KNOCKOUT_MANUAL_SEEDED_SETTING_KEY)
  };
}

async function setSeedingFlags(
  adminSupabase: AdminSupabaseClient,
  input: { attempted: boolean; autoSeeded: boolean; manualSeeded: boolean }
) {
  const { error } = await adminSupabase.from("app_settings").upsert(
    [
      { key: KNOCKOUT_AUTO_SEED_ATTEMPTED_SETTING_KEY, boolean_value: input.attempted },
      { key: KNOCKOUT_AUTO_SEEDED_SETTING_KEY, boolean_value: input.autoSeeded },
      { key: KNOCKOUT_MANUAL_SEEDED_SETTING_KEY, boolean_value: input.manualSeeded }
    ],
    { onConflict: "key" }
  );

  if (error) {
    throw error;
  }
}

type ProjectedBracketPickRow = {
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function migrateProjectedRoundOf32Picks(
  adminSupabase: AdminSupabaseClient,
  assignments: Array<{
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
  }>
) {
  const matchIds = assignments.map((assignment) => assignment.matchId);
  if (matchIds.length === 0) {
    return { migrated: 0, skippedExisting: 0, skippedUnsafe: 0, sourceRows: 0 };
  }

  const { data: projectedPredictions, error: projectedPredictionsError } = await adminSupabase
    .from("projected_bracket_predictions")
    .select("user_id,match_id,predicted_winner_team_id,created_at,updated_at")
    .in("match_id", matchIds);
  if (projectedPredictionsError) {
    throw projectedPredictionsError;
  }

  const officialTeamsByMatchId = new Map(
    assignments.map((assignment) => [assignment.matchId, new Set([assignment.homeTeamId, assignment.awayTeamId])])
  );
  const projectedPickRows = (projectedPredictions ?? []) as ProjectedBracketPickRow[];
  let skippedUnsafe = 0;
  let retained = 0;
  for (const projectedPick of projectedPickRows) {
    const pickedTeamId = projectedPick.predicted_winner_team_id ?? null;
    const officialTeams = officialTeamsByMatchId.get(projectedPick.match_id);
    if (!officialTeams || !pickedTeamId || !officialTeams.has(pickedTeamId)) {
      skippedUnsafe += 1;
      continue;
    }
    retained += 1;
  }

  return {
    migrated: retained,
    skippedExisting: 0,
    skippedUnsafe,
    sourceRows: projectedPickRows.length
  };
}
