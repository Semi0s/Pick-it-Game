"use server";

import { revalidatePath } from "next/cache";
import { acknowledgeMyPicksForEasyBracketPlayer } from "@/lib/easy-bracket-gate";
import { canActivateTournamentEntry } from "@/lib/play-mode";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeGroupKey } from "@/lib/group-standings";
import {
  fetchUserGroupProjectionSourceMap,
  fetchUserLightSeedBuilderSnapshot,
  type LightSeedBuilderSnapshot,
  type UserGroupProjectionSource
} from "@/lib/group-stage-modes";
import {
  completeRankingSlotsForProjection,
  normalizeRankingSlotsForPersistence
} from "@/lib/group-stage-ranking-slots";
import { getGroupTopTwoCompletionStatus } from "@/lib/group-stage-third-place-gate";
import {
  buildProjectedGroupStandings,
  buildProjectedGroupStandingsFromSeedRankings,
  buildQualifiedTeamSeeds,
  buildQualifiedTeamSeedsFromManualThirdPlaceRanking,
  getRequiredThirdPlaceQualifierCount,
  resolveRoundOf32SeedAssignments,
  type GroupSeedRankingInput,
  type ProjectedGroupStandings
} from "@/lib/knockout-seeding";
import { canEditPrediction, getPredictionStateLabel } from "@/lib/prediction-state";
import { fetchTournamentEntrySettings, saveTournamentEntrySettings } from "@/lib/tournament-entry";
import type { Prediction } from "@/lib/types";

type SavePredictionInput = {
  matchId: string;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
};

type MatchRow = {
  id: string;
  home_team_id?: string | null;
  away_team_id?: string | null;
  group_name?: string | null;
  kickoff_time?: string;
  status: "scheduled" | "locked" | "live" | "final";
  stage?: string;
  home_score?: number | null;
  away_score?: number | null;
  home_source?: string | null;
  away_source?: string | null;
};

type KnockoutPlaceholderRow = {
  id: string;
  stage: string;
  status: "scheduled" | "locked" | "live" | "final";
  home_source?: string | null;
  away_source?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  group_name: string;
  fifa_rank?: number | null;
  flag_emoji?: string | null;
};

type RankedThirdPlaceSlotInput = {
  teamId: string;
  rank: number;
};

export type SavePredictionResult =
  | {
      ok: true;
      prediction: Prediction;
    }
  | {
      ok: false;
      message: string;
    };

export type SaveLightSeedBuilderInput = {
  groupRankings: Array<{
    groupName: string;
    rankedTeamIds: string[];
  }>;
  rankedThirdPlaceTeamIds: string[];
  rankedThirdPlaceSlots?: Array<{
    teamId: string;
    rank: number;
  }>;
  commitThirdPlaceRankings?: boolean;
  finalizeTournamentEntry?: boolean;
};

export type SaveLightSeedBuilderResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

function normalizeThirdPlaceSlotInputs(input: SaveLightSeedBuilderInput): RankedThirdPlaceSlotInput[] {
  const sourceRows =
    input.rankedThirdPlaceSlots && input.rankedThirdPlaceSlots.length > 0
      ? input.rankedThirdPlaceSlots
      : input.rankedThirdPlaceTeamIds.map((teamId, index) => ({
          teamId,
          rank: index + 1
        }));

  return sourceRows
    .map((row) => ({
      teamId: row.teamId.trim(),
      rank: Math.trunc(row.rank)
    }))
    .filter((row) => row.teamId.length > 0 && Number.isFinite(row.rank));
}

export async function saveGroupPredictionAction(input: SavePredictionInput): Promise<SavePredictionResult> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();
  const { data: existingPrediction, error: existingPredictionError } = await adminSupabase
    .from("predictions")
    .select("id,predicted_home_score,predicted_away_score,predicted_winner_team_id,predicted_is_draw,updated_at")
    .eq("user_id", userResult.userId)
    .eq("match_id", input.matchId)
    .maybeSingle();

  if (existingPredictionError) {
    console.warn("Could not load existing prediction before save.", {
      userId: userResult.userId,
      matchId: input.matchId,
      message: existingPredictionError.message
    });
  }

  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,home_team_id,away_team_id,group_name,kickoff_time,status")
    .eq("id", input.matchId)
    .single();

  if (matchError) {
    return { ok: false, message: matchError.message };
  }

  const matchRow = match as MatchRow;
  if (!canEditPrediction(matchRow.status)) {
    return {
      ok: false,
      message: `This pick is ${getPredictionStateLabel(matchRow.status).toLowerCase()} and can no longer be edited.`
    };
  }

  const derivedOutcome = deriveOutcome(matchRow, input.predictedHomeScore, input.predictedAwayScore);
  console.info("Group prediction save requested.", {
    userId: userResult.userId,
    matchId: matchRow.id,
    action: existingPrediction?.id ? "update" : "create",
    previousHomeScore: existingPrediction?.predicted_home_score ?? null,
    previousAwayScore: existingPrediction?.predicted_away_score ?? null,
    nextHomeScore: input.predictedHomeScore ?? null,
    nextAwayScore: input.predictedAwayScore ?? null,
    previousWinnerTeamId: existingPrediction?.predicted_winner_team_id ?? null,
    nextWinnerTeamId: derivedOutcome.predictedWinnerTeamId,
    previousIsDraw: existingPrediction?.predicted_is_draw ?? null,
    nextIsDraw: derivedOutcome.predictedIsDraw
  });

  const { data, error } = await adminSupabase
    .from("predictions")
    .upsert(
      {
        user_id: userResult.userId,
        match_id: matchRow.id,
        predicted_winner_team_id: derivedOutcome.predictedWinnerTeamId,
        predicted_is_draw: derivedOutcome.predictedIsDraw,
        predicted_home_score: input.predictedHomeScore ?? null,
        predicted_away_score: input.predictedAwayScore ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,match_id" }
    )
    .select(
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded,updated_at"
    )
    .single();

  if (error) {
    console.error("Group prediction save failed.", {
      userId: userResult.userId,
      matchId: matchRow.id,
      action: existingPrediction?.id ? "update" : "create",
      nextHomeScore: input.predictedHomeScore ?? null,
      nextAwayScore: input.predictedAwayScore ?? null,
      message: error.message
    });
    return { ok: false, message: error.message };
  }

  console.info("Group prediction save completed.", {
    userId: userResult.userId,
    matchId: data.match_id,
    action: existingPrediction?.id ? "update" : "create",
    predictionId: data.id,
    savedHomeScore: data.predicted_home_score ?? null,
    savedAwayScore: data.predicted_away_score ?? null,
    savedWinnerTeamId: data.predicted_winner_team_id ?? null,
    savedIsDraw: data.predicted_is_draw,
    previousUpdatedAt: existingPrediction?.updated_at ?? null,
    savedUpdatedAt: data.updated_at ?? null
  });

  return {
    ok: true,
    prediction: {
      id: data.id,
      userId: data.user_id,
      matchId: data.match_id,
      predictedWinnerTeamId: data.predicted_winner_team_id ?? undefined,
      predictedIsDraw: data.predicted_is_draw,
      predictedHomeScore: data.predicted_home_score ?? undefined,
      predictedAwayScore: data.predicted_away_score ?? undefined,
      pointsAwarded: data.points_awarded ?? 0,
      updatedAt: data.updated_at ?? undefined
    }
  };
}

export async function saveLightSeedBuilderAction(
  input: SaveLightSeedBuilderInput
): Promise<SaveLightSeedBuilderResult> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();

  const [{ data: teamRows, error: teamError }, { data: roundOf32Rows, error: roundOf32Error }] = await Promise.all([
    adminSupabase.from("teams").select("id,name,short_name,group_name,fifa_rank,flag_emoji"),
    adminSupabase
      .from("matches")
      .select("id,stage,status,home_source,away_source")
      .in("stage", ["r32", "round_of_32"])
      .order("kickoff_time", { ascending: true })
  ]);

  if (teamError || roundOf32Error) {
    return {
      ok: false,
      message: teamError?.message ?? roundOf32Error?.message ?? "Could not load tournament seeding data."
    };
  }

  try {
    const [existingSnapshot, existingSourceMap] = await Promise.all([
      fetchUserLightSeedBuilderSnapshot(adminSupabase, userResult.userId).catch(
        () =>
          ({
            groupRankings: [],
            thirdPlaceRankings: []
          }) satisfies LightSeedBuilderSnapshot
      ),
      fetchUserGroupProjectionSourceMap(adminSupabase, userResult.userId).catch(() => new Map<string, UserGroupProjectionSource>())
    ]);
    const teams = ((teamRows ?? []) as TeamRow[]).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      groupName: team.group_name,
      fifaRank: team.fifa_rank ?? 0,
      flagEmoji: team.flag_emoji ?? ""
    }));
    const expectedGroupNames = Array.from(
      new Set(teams.map((team) => normalizeGroupKey(team.groupName) ?? team.groupName))
    ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const teamIdsByGroup = new Map<string, Set<string>>();
    for (const team of teams) {
      const groupName = normalizeGroupKey(team.groupName) ?? team.groupName;
      const current = teamIdsByGroup.get(groupName) ?? new Set<string>();
      current.add(team.id);
      teamIdsByGroup.set(groupName, current);
    }
    const incomingRankings: GroupSeedRankingInput[] = input.groupRankings.map((ranking) => ({
      groupName: normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
      rankedTeamIds: ranking.rankedTeamIds
    }));
    const mergedRankingsByGroup = new Map(
      existingSnapshot.groupRankings.map((ranking) => [
        normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
        ranking.rankedTeamIds
      ])
    );
    for (const ranking of incomingRankings) {
      const rankedTeamIds = normalizeRankingSlotsForPersistence(
        ranking.rankedTeamIds,
        teamIdsByGroup.get(ranking.groupName)
      );
      if (rankedTeamIds.length > 0) {
        mergedRankingsByGroup.set(ranking.groupName, rankedTeamIds);
      } else {
        mergedRankingsByGroup.delete(ranking.groupName);
      }
    }
    const defaultRankedTeamIdsByGroup = buildDefaultRankedTeamIdsByGroup(teams);
    const rankings: GroupSeedRankingInput[] = completeTopTwoRankingsForProjection(
      Array.from(mergedRankingsByGroup.entries())
        .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
        .map(([groupName, rankedTeamIds]) => ({ groupName, rankedTeamIds })),
      defaultRankedTeamIdsByGroup
    );
    const topTwoCompletionStatus = getGroupTopTwoCompletionStatus({
      groupNames: expectedGroupNames,
      rankings,
      teamIdsByGroup
    });
    if (input.commitThirdPlaceRankings && !topTwoCompletionStatus.isComplete) {
      return {
        ok: false,
        message: "Choose first and second place for every group before ranking third-place qualifiers."
      };
    }

    if (input.finalizeTournamentEntry && !topTwoCompletionStatus.isComplete) {
      return {
        ok: false,
        message: "Choose first and second place for every group before finishing your bracket."
      };
    }
    const requiredThirdPlaceCount = getRequiredThirdPlaceQualifierCount(
      ((roundOf32Rows ?? []) as KnockoutPlaceholderRow[]).map((match) => ({
        id: match.id,
        stage: match.stage,
        status: match.status,
        homeSource: match.home_source ?? null,
        awaySource: match.away_source ?? null,
        homeTeamId: null,
        awayTeamId: null
      }))
    );
    let requestedThirdPlaceRows: RankedThirdPlaceSlotInput[] = [];
    let availableThirdPlaceTeamIds = new Set<string>();
    let completeRowsByGroup = new Map<string, ProjectedGroupStandings["rows"]>();

    if (topTwoCompletionStatus.isComplete) {
      const standingsByGroup = buildProjectedGroupStandingsFromSeedRankings(teams, rankings);
      completeRowsByGroup = new Map(
        Array.from(standingsByGroup.entries())
          .filter(([, standings]) => standings.isComplete)
          .map(([groupId, standings]) => [groupId, standings.rows])
      );
      const availableThirdPlacePool = buildQualifiedTeamSeeds(completeRowsByGroup, completeRowsByGroup.size).rankedThirdPlaceTeams;
      availableThirdPlaceTeamIds = new Set(availableThirdPlacePool.map((team) => team.teamId));
      const baseThirdPlaceRows = input.commitThirdPlaceRankings
        ? normalizeThirdPlaceSlotInputs(input)
        : existingSnapshot.thirdPlaceRankings.map((row) => ({
            teamId: row.teamId,
            rank: row.rank
          }));
      requestedThirdPlaceRows = baseThirdPlaceRows
        .filter((row) => row.rank >= 1 && row.rank <= requiredThirdPlaceCount)
        .filter((row) => availableThirdPlaceTeamIds.has(row.teamId))
        .sort((left, right) => left.rank - right.rank);
    }

    const requestedThirdPlaceIds = requestedThirdPlaceRows.map((row) => row.teamId);
    const inputThirdPlaceRows = normalizeThirdPlaceSlotInputs(input);
    const inputThirdPlaceTeamIds = inputThirdPlaceRows.map((row) => row.teamId);
    const inputThirdPlaceRanks = inputThirdPlaceRows.map((row) => row.rank);

    if (
      input.commitThirdPlaceRankings &&
      (new Set(inputThirdPlaceTeamIds).size !== inputThirdPlaceTeamIds.length ||
        new Set(inputThirdPlaceRanks).size !== inputThirdPlaceRanks.length)
    ) {
      return { ok: false, message: "Each third-place qualifier can only be ranked once." };
    }

    if (
      input.commitThirdPlaceRankings &&
      (requestedThirdPlaceRows.length !== inputThirdPlaceRows.length ||
        inputThirdPlaceRows.some((row) => row.rank < 1 || row.rank > requiredThirdPlaceCount))
    ) {
      return { ok: false, message: "Only teams ranked 3rd in their group can be selected as third-place qualifiers." };
    }

    if (requestedThirdPlaceIds.length > requiredThirdPlaceCount) {
      return { ok: false, message: `Rank no more than ${requiredThirdPlaceCount} third-place qualifiers before saving.` };
    }

    if (requestedThirdPlaceIds.length === requiredThirdPlaceCount) {
      const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeedsFromManualThirdPlaceRanking(
        completeRowsByGroup,
        requestedThirdPlaceIds,
        requiredThirdPlaceCount
      );

      resolveRoundOf32SeedAssignments(
        ((roundOf32Rows ?? []) as KnockoutPlaceholderRow[]).map((match) => ({
          id: match.id,
          stage: match.stage,
          status: match.status,
          homeSource: match.home_source ?? null,
          awaySource: match.away_source ?? null,
          homeTeamId: null,
          awayTeamId: null
        })),
        automaticQualifiers,
        rankedThirdPlaceTeams
      );
    }

    await adminSupabase.from("user_group_seed_rankings").delete().eq("user_id", userResult.userId);
    await adminSupabase.from("user_best_third_rankings").delete().eq("user_id", userResult.userId);

    const rankingRows = rankings.flatMap((ranking) =>
      ranking.rankedTeamIds.flatMap((teamId, index) => {
        const normalizedTeamId = teamId?.trim();
        return normalizedTeamId
          ? [
              {
                user_id: userResult.userId,
                group_name: ranking.groupName,
                team_id: normalizedTeamId,
                rank_position: index + 1,
                updated_at: new Date().toISOString()
              }
            ]
          : [];
      })
    );
    const thirdPlaceRows = requestedThirdPlaceRows.map((row) => ({
      user_id: userResult.userId,
      team_id: row.teamId,
      rank_position: row.rank,
      updated_at: new Date().toISOString()
    }));

    if (rankingRows.length > 0) {
      const { error: insertRankingError } = await adminSupabase.from("user_group_seed_rankings").insert(rankingRows);
      if (insertRankingError) {
        return { ok: false, message: insertRankingError.message };
      }
    }

    if (thirdPlaceRows.length > 0) {
      const { error: insertThirdPlaceError } = await adminSupabase.from("user_best_third_rankings").insert(thirdPlaceRows);
      if (insertThirdPlaceError) {
        return { ok: false, message: insertThirdPlaceError.message };
      }
    }
    const touchedGroupNames = new Set(incomingRankings.map((ranking) => ranking.groupName));
    if (touchedGroupNames.size > 0) {
      const preservedScoreAppliedRows = Array.from(existingSourceMap.entries())
        .filter(([groupName, source]) => !touchedGroupNames.has(groupName) && source === "score_applied")
        .map(([groupName, source]) => ({
          user_id: userResult.userId,
          group_name: groupName,
          projection_source: source
        }));
      await adminSupabase.from("user_group_projection_sources").delete().eq("user_id", userResult.userId);
      if (preservedScoreAppliedRows.length > 0) {
        const { error: sourceError } = await adminSupabase.from("user_group_projection_sources").insert(preservedScoreAppliedRows);
        if (sourceError) {
          return { ok: false, message: sourceError.message };
        }
      }
    }

    const existingTournamentSettings = await fetchTournamentEntrySettings(adminSupabase, userResult.userId).catch(() => null);
    if (input.finalizeTournamentEntry && requestedThirdPlaceIds.length !== requiredThirdPlaceCount) {
      return {
        ok: false,
        message: `Choose ${requiredThirdPlaceCount} third-place qualifiers before finishing your bracket.`
      };
    }

    if (input.finalizeTournamentEntry) {
      if (!canActivateTournamentEntry()) {
        return { ok: false, message: "Tournament entries are locked. You can still preview this mode, but it will not count." };
      }

      await saveTournamentEntrySettings(adminSupabase, userResult.userId, {
        tournamentEntryMode: "easy_bracket",
        tournamentEntryState: "active",
        tournamentEntrySubmittedAt: new Date().toISOString()
      });
    } else if (!existingTournamentSettings?.tournamentEntryMode || existingTournamentSettings.tournamentEntryMode === "easy_bracket") {
      await saveTournamentEntrySettings(adminSupabase, userResult.userId, {
        tournamentEntryMode: "easy_bracket",
        tournamentEntryState: existingTournamentSettings?.tournamentEntryState === "active" ? "active" : "draft",
        tournamentEntrySubmittedAt:
          existingTournamentSettings?.tournamentEntryState === "active"
            ? existingTournamentSettings.tournamentEntrySubmittedAt
            : null
      });
    }

    revalidatePath("/groups");
    revalidatePath("/bracket-builder");
    revalidatePath("/dashboard");
    revalidatePath("/knockout");
    revalidatePath("/strategy");

    return {
      ok: true,
      message:
        input.finalizeTournamentEntry
          ? "Your Group Stage entry is active."
          : requestedThirdPlaceIds.length === requiredThirdPlaceCount
            ? "Your bracket build is saved."
            : "Your bracket build progress is saved."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save your Simple Results rankings."
    };
  }
}

export async function applyGroupBracketFromScoresAction(input: {
  groupName: string;
}): Promise<{ ok: true; message: string; invalidatedThirdPlaceCount: number } | { ok: false; message: string }> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();

  try {
    const normalizedGroupName = normalizeGroupKey(input.groupName) ?? input.groupName;
    const [{ data: teamRows, error: teamError }, { data: matchRows, error: matchError }, { data: predictionRows, error: predictionError }, existingSnapshot, existingSourceMap] =
      await Promise.all([
        adminSupabase.from("teams").select("id,name,short_name,group_name,fifa_rank,flag_emoji"),
        adminSupabase
          .from("matches")
          .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score,home_source,away_source"),
        adminSupabase
          .from("predictions")
          .select("match_id,predicted_home_score,predicted_away_score")
          .eq("user_id", userResult.userId),
        fetchUserLightSeedBuilderSnapshot(adminSupabase, userResult.userId).catch(
          () =>
            ({
              groupRankings: [],
              thirdPlaceRankings: []
            }) satisfies LightSeedBuilderSnapshot
        ),
        fetchUserGroupProjectionSourceMap(adminSupabase, userResult.userId).catch(() => new Map<string, UserGroupProjectionSource>())
      ]);

    if (teamError || matchError || predictionError) {
      return {
        ok: false,
        message: teamError?.message ?? matchError?.message ?? predictionError?.message ?? "Could not update this group from scores."
      };
    }

    const teams = ((teamRows ?? []) as TeamRow[]).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      groupName: team.group_name,
      fifaRank: team.fifa_rank ?? 0,
      flagEmoji: team.flag_emoji ?? ""
    }));
    const scoreStandingsByGroup = buildProjectedGroupStandings(
      ((matchRows ?? []) as MatchRow[])
        .filter((match) => match.stage === "group")
        .map((match) => ({
          id: match.id,
          stage: match.stage ?? "group",
          groupName: match.group_name ?? null,
          status: match.status,
          homeTeamId: match.home_team_id ?? null,
          awayTeamId: match.away_team_id ?? null,
          homeScore: match.home_score ?? null,
          awayScore: match.away_score ?? null
        })),
      teams,
      ((predictionRows ?? []) as Array<{ match_id: string; predicted_home_score?: number | null; predicted_away_score?: number | null }>).map((row) => ({
        matchId: row.match_id,
        predictedHomeScore: row.predicted_home_score ?? null,
        predictedAwayScore: row.predicted_away_score ?? null
      }))
    );
    const targetGroup = scoreStandingsByGroup.get(normalizedGroupName);
    if (!targetGroup || !targetGroup.isComplete) {
      return { ok: false, message: `Save enough scores in ${normalizedGroupName} before updating that group from scores.` };
    }

    const mergedRankingsByGroup = new Map(
      existingSnapshot.groupRankings.map((ranking) => [
        normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
        ranking.rankedTeamIds
      ])
    );
    mergedRankingsByGroup.set(
      normalizedGroupName,
      targetGroup.rows.slice().sort((left, right) => left.rank - right.rank).map((row) => row.teamId)
    );

    const defaultRankedTeamIdsByGroup = buildDefaultRankedTeamIdsByGroup(teams);
    const rankings: GroupSeedRankingInput[] = completeTopTwoRankingsForProjection(
      Array.from(mergedRankingsByGroup.entries())
        .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
        .map(([groupName, rankedTeamIds]) => ({ groupName, rankedTeamIds })),
      defaultRankedTeamIdsByGroup
    );
    const roundOf32Placeholders = ((matchRows ?? []) as MatchRow[])
      .filter((match) => match.stage === "r32" || match.stage === "round_of_32")
      .map((match) => ({
        id: match.id,
        stage: match.stage ?? "r32",
        status: match.status,
        homeSource: match.home_source ?? null,
        awaySource: match.away_source ?? null,
        homeTeamId: match.home_team_id ?? null,
        awayTeamId: match.away_team_id ?? null
      }));
    const snapshotStandingsByGroup = buildProjectedGroupStandingsFromSeedRankings(teams, rankings);
    const completeRowsByGroup = new Map(
      Array.from(snapshotStandingsByGroup.entries())
        .filter(([, standings]) => standings.isComplete)
        .map(([groupId, standings]) => [groupId, standings.rows])
    );
    const requiredThirdPlaceCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders);
    const availableThirdPlacePool = buildQualifiedTeamSeeds(completeRowsByGroup, completeRowsByGroup.size).rankedThirdPlaceTeams;
    const availableThirdPlaceTeamIds = new Set(availableThirdPlacePool.map((team) => team.teamId));
    const previousThirdPlaceRows = existingSnapshot.thirdPlaceRankings
      .slice()
      .sort((left, right) => left.rank - right.rank)
      .map((row) => ({
        teamId: row.teamId,
        rank: row.rank
      }))
      .filter((row) => row.rank >= 1 && row.rank <= requiredThirdPlaceCount);
    const preservedThirdPlaceRows = previousThirdPlaceRows.filter((row) => availableThirdPlaceTeamIds.has(row.teamId));
    const preservedThirdPlaceIds = preservedThirdPlaceRows.map((row) => row.teamId);
    const invalidatedThirdPlaceCount = previousThirdPlaceRows.length - preservedThirdPlaceRows.length;

    if (preservedThirdPlaceIds.length >= requiredThirdPlaceCount) {
      const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeedsFromManualThirdPlaceRanking(
        completeRowsByGroup,
        preservedThirdPlaceIds.slice(0, requiredThirdPlaceCount),
        requiredThirdPlaceCount
      );
      resolveRoundOf32SeedAssignments(roundOf32Placeholders, automaticQualifiers, rankedThirdPlaceTeams);
    }

    await adminSupabase.from("user_group_seed_rankings").delete().eq("user_id", userResult.userId);
    await adminSupabase.from("user_best_third_rankings").delete().eq("user_id", userResult.userId);

    const rankingRows = rankings.flatMap((ranking) =>
      ranking.rankedTeamIds.flatMap((teamId, index) => {
        const normalizedTeamId = teamId?.trim();
        return normalizedTeamId
          ? [
              {
                user_id: userResult.userId,
                group_name: ranking.groupName,
                team_id: normalizedTeamId,
                rank_position: index + 1,
                updated_at: new Date().toISOString()
              }
            ]
          : [];
      })
    );
    const thirdPlaceRows = preservedThirdPlaceRows.slice(0, requiredThirdPlaceCount).map((row) => ({
      user_id: userResult.userId,
      team_id: row.teamId,
      rank_position: row.rank,
      updated_at: new Date().toISOString()
    }));

    if (rankingRows.length > 0) {
      const { error: rankingError } = await adminSupabase.from("user_group_seed_rankings").insert(rankingRows);
      if (rankingError) {
        return { ok: false, message: rankingError.message };
      }
    }
    if (thirdPlaceRows.length > 0) {
      const { error: thirdPlaceError } = await adminSupabase.from("user_best_third_rankings").insert(thirdPlaceRows);
      if (thirdPlaceError) {
        return { ok: false, message: thirdPlaceError.message };
      }
    }

    const nextSourceMap = new Map(existingSourceMap);
    nextSourceMap.set(normalizedGroupName, "score_applied");
    const sourceRows = Array.from(nextSourceMap.entries())
      .filter(([, source]) => source === "score_applied")
      .map(([groupName, source]) => ({
        user_id: userResult.userId,
        group_name: groupName,
        projection_source: source
      }));
    await adminSupabase.from("user_group_projection_sources").delete().eq("user_id", userResult.userId);
    if (sourceRows.length > 0) {
      const { error: sourceError } = await adminSupabase.from("user_group_projection_sources").insert(sourceRows);
      if (sourceError) {
        return { ok: false, message: sourceError.message };
      }
    }

    revalidatePath("/groups");
    revalidatePath("/bracket-builder");
    revalidatePath("/knockout");
    return {
      ok: true,
      message:
        invalidatedThirdPlaceCount > 0
          ? `${normalizedGroupName} now follows your saved scores. Revisit third-place qualifiers to finish the bracket.`
          : `${normalizedGroupName} now follows your saved scores.`,
      invalidatedThirdPlaceCount
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update this group from scores right now."
    };
  }
}

export async function acknowledgeEasyBracketMyPicksGateAction(): Promise<
  | { ok: true }
  | { ok: false; message: string }
> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  try {
    await acknowledgeMyPicksForEasyBracketPlayer(createAdminClient(), userResult.userId);
    revalidatePath("/groups");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not unlock My Picks right now."
    };
  }
}

export async function getCurrentUserId(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in to save picks." };
  }

  return { ok: true, userId: user.id };
}

function buildDefaultRankedTeamIdsByGroup(
  teams: Array<{
    id: string;
    name: string;
    groupName: string;
    fifaRank?: number | null;
  }>
) {
  const teamsByGroup = new Map<string, typeof teams>();

  for (const team of teams) {
    const groupName = normalizeGroupKey(team.groupName) ?? team.groupName;
    const current = teamsByGroup.get(groupName) ?? [];
    current.push(team);
    teamsByGroup.set(groupName, current);
  }

  return new Map(
    Array.from(teamsByGroup.entries()).map(([groupName, groupTeams]) => [
      groupName,
      groupTeams
        .slice()
        .sort((left, right) => {
          const rankDelta = (left.fifaRank ?? Number.MAX_SAFE_INTEGER) - (right.fifaRank ?? Number.MAX_SAFE_INTEGER);
          return rankDelta || left.name.localeCompare(right.name);
        })
        .map((team) => team.id)
    ])
  );
}

function completeTopTwoRankingsForProjection(
  rankings: GroupSeedRankingInput[],
  defaultRankedTeamIdsByGroup: ReadonlyMap<string, readonly string[]>
) {
  return rankings.map((ranking) => {
    const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
    const defaultTeamIds = defaultRankedTeamIdsByGroup.get(groupName) ?? [];

    return {
      groupName,
      rankedTeamIds: completeRankingSlotsForProjection(ranking.rankedTeamIds, defaultTeamIds)
    };
  });
}

function deriveOutcome(
  match: MatchRow,
  predictedHomeScore: number | undefined,
  predictedAwayScore: number | undefined
) {
  if (predictedHomeScore === undefined || predictedAwayScore === undefined) {
    return {
      predictedWinnerTeamId: null,
      predictedIsDraw: false
    };
  }

  if (predictedHomeScore === predictedAwayScore) {
    return {
      predictedWinnerTeamId: null,
      predictedIsDraw: true
    };
  }

  return {
    predictedWinnerTeamId:
      predictedHomeScore > predictedAwayScore ? match.home_team_id ?? null : match.away_team_id ?? null,
    predictedIsDraw: false
  };
}
