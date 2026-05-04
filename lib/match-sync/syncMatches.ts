import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMatchesByDate, type NormalizedExternalMatch } from "@/lib/match-api/client";
import { appendMatchEvent } from "@/lib/match-events";
import { rebuildKnockoutAdvancementWithClient } from "@/lib/knockout-advancement";
import { scoreGroupStagePrediction } from "@/lib/group-scoring";
import { scoreFinalizedKnockoutMatchWithClient, resetKnockoutMatchScoring } from "@/lib/bracket-predictions";
import { resolveTeamIdByName } from "@/lib/match-sync/team-resolution";
import type { MatchStage, MatchStatus } from "@/lib/types";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type MatchSyncRow = {
  id: string;
  stage: MatchStage;
  home_team_id?: string | null;
  away_team_id?: string | null;
  kickoff_time: string;
  kickoff_at?: string | null;
  status: MatchStatus;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  finalized_at?: string | null;
  last_synced_at?: string | null;
  external_id?: string | null;
  is_manual_override?: boolean | null;
  sync_status?: "ok" | "skipped" | "error" | null;
  sync_error?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  predicted_is_draw: boolean;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
};

type LeaderboardTotal = {
  user_id: string;
  total_points: number;
};

export type SyncMatchesResult = {
  ok: true;
  lockedMatches: number;
  fetchedMatches: number;
  finalizedMatches: number;
  skippedManualOverride: number;
  skippedUnresolvedTeams: number;
  skippedUnmatched: number;
  errors: number;
  latestSyncedAt: string | null;
};

export async function lockMatchesByKickoff() {
  const adminSupabase = createAdminClient();
  return lockMatchesByKickoffWithClient(adminSupabase);
}

export async function syncMatches(): Promise<SyncMatchesResult> {
  const adminSupabase = createAdminClient();
  const lockSummary = await lockMatchesByKickoffWithClient(adminSupabase);
  const today = new Date();
  const startDate = shiftDate(today, -1);
  const endDate = shiftDate(today, 1);
  const externalMatches = await fetchMatchesByDate({ startDate, endDate });
  const latestSyncedAt = new Date().toISOString();

  const [{ data: teams, error: teamsError }, { data: matches, error: matchesError }] = await Promise.all([
    adminSupabase.from("teams").select("id,name,short_name"),
    adminSupabase
      .from("matches")
      .select(
        "id,stage,home_team_id,away_team_id,kickoff_time,kickoff_at,status,home_score,away_score,winner_team_id,finalized_at,last_synced_at,external_id,is_manual_override,sync_status,sync_error"
      )
      .gte("kickoff_time", `${startDate}T00:00:00.000Z`)
      .lte("kickoff_time", `${endDate}T23:59:59.999Z`)
  ]);

  if (teamsError) {
    throw teamsError;
  }

  if (matchesError) {
    throw matchesError;
  }

  const teamRows = (teams ?? []) as TeamRow[];
  const internalMatches = (matches ?? []) as MatchSyncRow[];

  let finalizedMatches = 0;
  let skippedManualOverride = 0;
  let skippedUnresolvedTeams = 0;
  let skippedUnmatched = 0;
  let errors = 0;

  for (const externalMatch of externalMatches) {
    try {
      const homeTeamId = resolveTeamIdByName(externalMatch.home_team_name, teamRows);
      const awayTeamId = resolveTeamIdByName(externalMatch.away_team_name, teamRows);

      if (!homeTeamId || !awayTeamId) {
        skippedUnresolvedTeams += 1;
        continue;
      }

      const internalMatch = findInternalMatch({
        externalMatch,
        matches: internalMatches,
        homeTeamId,
        awayTeamId
      });

      if (!internalMatch) {
        skippedUnmatched += 1;
        continue;
      }

      if (internalMatch.is_manual_override) {
        skippedManualOverride += 1;
        await markSyncState(adminSupabase, internalMatch.id, {
          lastSyncedAt: latestSyncedAt,
          syncStatus: "skipped",
          syncError: null,
          externalId: internalMatch.external_id ?? externalMatch.external_id,
          kickoffAt: externalMatch.kickoff_at
        });
        await appendMatchEvent(adminSupabase, {
          matchId: internalMatch.id,
          eventType: "sync",
          payload: {
            source: "api",
            outcome: "skipped_manual_override",
            externalId: externalMatch.external_id
          }
        });
        continue;
      }

      if (externalMatch.status === "final") {
        const finalized = await finalizeMatchFromSync(adminSupabase, internalMatch, externalMatch, {
          latestSyncedAt,
          homeTeamId,
          awayTeamId
        });

        if (finalized) {
          finalizedMatches += 1;
        }
      } else {
        await markSyncState(adminSupabase, internalMatch.id, {
          lastSyncedAt: latestSyncedAt,
          syncStatus: "ok",
          syncError: null,
          externalId: internalMatch.external_id ?? externalMatch.external_id,
          kickoffAt: externalMatch.kickoff_at
        });
      }
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : "Unknown sync error.";
      const attemptedMatch = findInternalMatchByExternalId(externalMatch.external_id, internalMatches);

      if (attemptedMatch) {
        await markSyncState(adminSupabase, attemptedMatch.id, {
          lastSyncedAt: latestSyncedAt,
          syncStatus: "error",
          syncError: message,
          externalId: attemptedMatch.external_id ?? externalMatch.external_id,
          kickoffAt: externalMatch.kickoff_at
        });
        await appendMatchEvent(adminSupabase, {
          matchId: attemptedMatch.id,
          eventType: "sync",
          payload: {
            source: "api",
            outcome: "error",
            message
          }
        });
      }
    }
  }

  const summary: SyncMatchesResult = {
    ok: true,
    lockedMatches: lockSummary.lockedMatches,
    fetchedMatches: externalMatches.length,
    finalizedMatches,
    skippedManualOverride,
    skippedUnresolvedTeams,
    skippedUnmatched,
    errors,
    latestSyncedAt
  };

  console.info("[match-sync] Sync completed.", summary);

  return summary;
}

export async function lockMatchesByKickoffWithClient(adminSupabase: AdminSupabaseClient) {
  const lockCutoff = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data, error } = await adminSupabase
    .from("matches")
    .update({
      status: "locked",
      updated_at: new Date().toISOString()
    })
    .eq("status", "scheduled")
    .lte("kickoff_at", lockCutoff)
    .select("id");

  if (error) {
    throw error;
  }

  return {
    lockedMatches: (data ?? []).length
  };
}

async function finalizeMatchFromSync(
  adminSupabase: AdminSupabaseClient,
  internalMatch: MatchSyncRow,
  externalMatch: NormalizedExternalMatch,
  input: {
    latestSyncedAt: string;
    homeTeamId: string;
    awayTeamId: string;
  }
) {
  const { latestSyncedAt, homeTeamId, awayTeamId } = input;
  const nextWinnerTeamId = deriveWinnerTeamId(internalMatch.stage, externalMatch, homeTeamId, awayTeamId);

  if (
    internalMatch.status === "final" &&
    internalMatch.home_score === externalMatch.home_score &&
    internalMatch.away_score === externalMatch.away_score &&
    (internalMatch.winner_team_id ?? null) === nextWinnerTeamId
  ) {
    await markSyncState(adminSupabase, internalMatch.id, {
      lastSyncedAt: latestSyncedAt,
      syncStatus: "ok",
      syncError: null,
      externalId: internalMatch.external_id ?? externalMatch.external_id,
      kickoffAt: externalMatch.kickoff_at
    });
    await appendMatchEvent(adminSupabase, {
      matchId: internalMatch.id,
      eventType: "sync",
      payload: {
        source: "api",
        outcome: "final_unchanged",
        homeScore: externalMatch.home_score,
        awayScore: externalMatch.away_score
      }
    });
    return false;
  }

  if (internalMatch.stage === "group") {
    if (internalMatch.status === "final") {
      await resetGroupMatchScoringWithClient(adminSupabase, internalMatch.id);
    }

    await adminSupabase
      .from("matches")
      .update({
        status: "final",
        home_score: externalMatch.home_score,
        away_score: externalMatch.away_score,
        winner_team_id: nextWinnerTeamId,
        finalized_at: new Date().toISOString(),
        last_synced_at: latestSyncedAt,
        external_id: internalMatch.external_id ?? externalMatch.external_id,
        kickoff_at: externalMatch.kickoff_at,
        sync_status: "ok",
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", internalMatch.id);

    await scoreGroupMatchWithClient(adminSupabase, internalMatch.id, {
      stage: internalMatch.stage,
      status: "final",
      homeTeamId,
      awayTeamId,
      homeScore: externalMatch.home_score,
      awayScore: externalMatch.away_score,
      winnerTeamId: nextWinnerTeamId
    });
  } else {
    if (internalMatch.status === "final") {
      await resetKnockoutMatchScoring(internalMatch.id);
    }

    await adminSupabase
      .from("matches")
      .update({
        status: "final",
        home_score: externalMatch.home_score,
        away_score: externalMatch.away_score,
        winner_team_id: nextWinnerTeamId,
        finalized_at: new Date().toISOString(),
        last_synced_at: latestSyncedAt,
        external_id: internalMatch.external_id ?? externalMatch.external_id,
        kickoff_at: externalMatch.kickoff_at,
        sync_status: "ok",
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", internalMatch.id);

    await scoreFinalizedKnockoutMatchWithClient(adminSupabase, internalMatch.id);
    await rebuildKnockoutAdvancementWithClient(adminSupabase);
    const leaderboardResult = await recalculateLeaderboardWithClient(adminSupabase);
    if (!leaderboardResult.ok) {
      throw new Error(leaderboardResult.message);
    }
  }

  await appendMatchEvent(adminSupabase, {
    matchId: internalMatch.id,
    eventType: "finalize",
    payload: {
      source: "api",
      homeScore: externalMatch.home_score,
      awayScore: externalMatch.away_score,
      winnerTeamId: nextWinnerTeamId
    }
  });

  return true;
}

function deriveWinnerTeamId(
  stage: MatchStage,
  externalMatch: NormalizedExternalMatch,
  homeTeamId: string,
  awayTeamId: string
) {
  if (externalMatch.home_score == null || externalMatch.away_score == null) {
    return null;
  }

  if (externalMatch.home_score === externalMatch.away_score) {
    if (stage === "group") {
      return null;
    }

    throw new Error("Final knockout tie requires a manual winner override.");
  }

  return externalMatch.home_score > externalMatch.away_score ? homeTeamId : awayTeamId;
}

function findInternalMatch({
  externalMatch,
  matches,
  homeTeamId,
  awayTeamId
}: {
  externalMatch: NormalizedExternalMatch;
  matches: MatchSyncRow[];
  homeTeamId: string;
  awayTeamId: string;
}) {
  const exactExternalIdMatch = findInternalMatchByExternalId(externalMatch.external_id, matches);
  if (exactExternalIdMatch) {
    return exactExternalIdMatch;
  }

  const kickoffMillis = new Date(externalMatch.kickoff_at).getTime();
  const candidates = matches.filter((match) => {
    if (match.home_team_id !== homeTeamId || match.away_team_id !== awayTeamId) {
      return false;
    }

    const internalKickoffMillis = new Date(match.kickoff_at ?? match.kickoff_time).getTime();
    return Math.abs(internalKickoffMillis - kickoffMillis) <= 60 * 60 * 1000;
  });

  if (candidates.length !== 1) {
    return null;
  }

  return candidates[0];
}

function findInternalMatchByExternalId(externalId: string, matches: MatchSyncRow[]) {
  return matches.find((match) => match.external_id === externalId) ?? null;
}

async function markSyncState(
  adminSupabase: AdminSupabaseClient,
  matchId: string,
  input: {
    lastSyncedAt: string;
    syncStatus: "ok" | "skipped" | "error";
    syncError: string | null;
    externalId: string;
    kickoffAt: string;
  }
) {
  const { error } = await adminSupabase
    .from("matches")
    .update({
      last_synced_at: input.lastSyncedAt,
      sync_status: input.syncStatus,
      sync_error: input.syncError,
      external_id: input.externalId,
      kickoff_at: input.kickoffAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", matchId);

  if (error) {
    throw error;
  }
}

async function scoreGroupMatchWithClient(
  adminSupabase: AdminSupabaseClient,
  matchId: string,
  input: {
    stage: MatchStage;
    status: MatchStatus;
    homeTeamId: string | null;
    awayTeamId: string | null;
    homeScore: number | null;
    awayScore: number | null;
    winnerTeamId: string | null;
  }
) {
  const { data: predictions, error: predictionsError } = await adminSupabase
    .from("predictions")
    .select("id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score")
    .eq("match_id", matchId);

  if (predictionsError) {
    throw predictionsError;
  }

  const rows = (predictions ?? []) as PredictionRow[];
  const scoredPredictions = rows.map((prediction) => {
    const scoreBreakdown = scoreGroupStagePrediction(
      {
        predictedWinnerTeamId: prediction.predicted_winner_team_id,
        predictedIsDraw: prediction.predicted_is_draw,
        predictedHomeScore: prediction.predicted_home_score,
        predictedAwayScore: prediction.predicted_away_score
      },
      {
        stage: input.stage,
        status: input.status,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        homeScore: input.homeScore ?? undefined,
        awayScore: input.awayScore ?? undefined,
        winnerTeamId: input.winnerTeamId ?? undefined
      }
    );

    return {
      predictionId: prediction.id,
      userId: prediction.user_id,
      matchId: prediction.match_id,
      scoreBreakdown
    };
  });

  const predictionUpdates = scoredPredictions.map((prediction) =>
    adminSupabase
      .from("predictions")
      .update({
        points_awarded: prediction.scoreBreakdown.points
      })
      .eq("id", prediction.predictionId)
  );

  const updateResults = await Promise.all(predictionUpdates);
  const failedPredictionUpdate = updateResults.find((result) => result.error);
  if (failedPredictionUpdate?.error) {
    throw failedPredictionUpdate.error;
  }

  await adminSupabase.from("prediction_scores").delete().eq("match_id", matchId);

  if (scoredPredictions.length > 0) {
    const { error: predictionScoresError } = await adminSupabase.from("prediction_scores").insert(
      scoredPredictions.map((prediction) => ({
        prediction_id: prediction.predictionId,
        match_id: prediction.matchId,
        user_id: prediction.userId,
        points: prediction.scoreBreakdown.points,
        outcome_points: prediction.scoreBreakdown.outcome_points,
        exact_score_points: prediction.scoreBreakdown.exact_score_points,
        goal_difference_points: prediction.scoreBreakdown.goal_difference_points,
        scored_at: new Date().toISOString()
      }))
    );

    if (predictionScoresError) {
      throw predictionScoresError;
    }
  }

  const leaderboardResult = await recalculateLeaderboardWithClient(adminSupabase);
  if (!leaderboardResult.ok) {
    throw new Error(leaderboardResult.message);
  }
}

async function resetGroupMatchScoringWithClient(adminSupabase: AdminSupabaseClient, matchId: string) {
  const [predictionResetResult, predictionScoresDeleteResult, snapshotsDeleteResult, eventsDeleteResult] = await Promise.all([
    adminSupabase.from("predictions").update({ points_awarded: 0 }).eq("match_id", matchId),
    adminSupabase.from("prediction_scores").delete().eq("match_id", matchId),
    adminSupabase.from("leaderboard_snapshots").delete().eq("match_id", matchId),
    adminSupabase.from("leaderboard_events").delete().eq("match_id", matchId)
  ]);

  if (predictionResetResult.error) {
    throw predictionResetResult.error;
  }
  if (predictionScoresDeleteResult.error) {
    throw predictionScoresDeleteResult.error;
  }
  if (snapshotsDeleteResult.error) {
    throw snapshotsDeleteResult.error;
  }
  if (eventsDeleteResult.error) {
    throw eventsDeleteResult.error;
  }
}

async function recalculateLeaderboardWithClient(
  adminSupabase: AdminSupabaseClient
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [{ data: predictionPoints, error: predictionPointsError }, { data: bracketPoints, error: bracketPointsError }] =
    await Promise.all([
      adminSupabase.from("predictions").select("user_id,points_awarded"),
      adminSupabase.from("bracket_scores").select("user_id,points")
    ]);

  if (predictionPointsError) {
    return { ok: false, message: predictionPointsError.message };
  }
  if (bracketPointsError) {
    return { ok: false, message: bracketPointsError.message };
  }

  const totalsByUser = new Map<string, number>();
  for (const row of (predictionPoints ?? []) as Array<{ user_id: string; points_awarded: number | null }>) {
    totalsByUser.set(row.user_id, (totalsByUser.get(row.user_id) ?? 0) + (row.points_awarded ?? 0));
  }
  for (const row of (bracketPoints ?? []) as Array<{ user_id: string; points: number | null }>) {
    totalsByUser.set(row.user_id, (totalsByUser.get(row.user_id) ?? 0) + (row.points ?? 0));
  }

  const { data: users, error: usersError } = await adminSupabase.from("users").select("id");
  if (usersError) {
    return { ok: false, message: usersError.message };
  }

  const totals = ((users ?? []) as Array<{ id: string }>)
    .map((user) => ({ user_id: user.id, total_points: totalsByUser.get(user.id) ?? 0 }))
    .sort((a, b) => b.total_points - a.total_points || a.user_id.localeCompare(b.user_id));

  const rankedEntries = assignRanks(totals).map((entry) => ({
    ...entry,
    updated_at: new Date().toISOString()
  }));

  if (rankedEntries.length > 0) {
    const { error: leaderboardError } = await adminSupabase
      .from("leaderboard_entries")
      .upsert(rankedEntries, { onConflict: "user_id" });
    if (leaderboardError) {
      return { ok: false, message: leaderboardError.message };
    }
  }

  const userUpdateResults = await Promise.all(
    ((users ?? []) as Array<{ id: string }>).map((user) =>
      adminSupabase.from("users").update({ total_points: totalsByUser.get(user.id) ?? 0 }).eq("id", user.id)
    )
  );
  const failedUserUpdate = userUpdateResults.find((result) => result.error);
  if (failedUserUpdate?.error) {
    return { ok: false, message: failedUserUpdate.error.message };
  }

  return { ok: true };
}

function assignRanks(totals: LeaderboardTotal[]) {
  let previousPoints: number | null = null;
  let previousRank = 0;

  return totals.map((entry, index) => {
    const rank = previousPoints === entry.total_points ? previousRank : index + 1;
    previousPoints = entry.total_points;
    previousRank = rank;
    return { ...entry, rank };
  });
}

function shiftDate(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
