"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { canScoreGroupMatch, scoreGroupStagePrediction } from "@/lib/group-scoring";

type MatchRow = {
  id: string;
  stage: "group" | "round_of_32" | "round_of_16" | "quarterfinal" | "semifinal" | "final";
  group_name?: string | null;
  status: "scheduled" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  updated_at?: string | null;
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

export type ScoreMatchResult =
  | {
      ok: true;
      scored: boolean;
      predictionsScored: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type UpdateMatchResultInput = {
  id: string;
  status: MatchRow["status"];
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string | null;
};

export type UpdateMatchResult =
  | {
      ok: true;
      match: ReturnType<typeof mapMatchRow>;
    }
  | {
      ok: false;
      message: string;
    };

export async function updateAdminMatchResultAction(input: UpdateMatchResultInput): Promise<UpdateMatchResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data: previousMatch, error: previousMatchError } = await adminSupabase
    .from("matches")
    .select("id,status,stage")
    .eq("id", input.id)
    .single();

  if (previousMatchError) {
    return { ok: false, message: previousMatchError.message };
  }

  const { data, error } = await adminSupabase
    .from("matches")
    .update({
      status: input.status,
      home_score: input.homeScore ?? null,
      away_score: input.awayScore ?? null,
      winner_team_id: input.winnerTeamId ?? null
    })
    .eq("id", input.id)
    .select(
      "id,stage,group_name,status,home_team_id,away_team_id,home_source,away_source,kickoff_time,home_score,away_score,winner_team_id,updated_at"
    )
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((previousMatch as MatchRow).status === "final" && input.status !== "final") {
    const resetResult = await resetGroupMatchScoring(adminSupabase, input.id);
    if (!resetResult.ok) {
      return resetResult;
    }
  }

  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath("/leaderboard");
  revalidatePath("/admin/matches");
  return { ok: true, match: mapMatchRow(data as MatchRow) };
}

export async function scoreFinalizedGroupMatch(matchId: string): Promise<ScoreMatchResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_team_id,away_team_id,home_score,away_score,winner_team_id")
    .eq("id", matchId)
    .single();

  if (matchError) {
    return { ok: false, message: matchError.message };
  }

  const mappedMatch = mapMatchRow(match as MatchRow);
  if (!canScoreGroupMatch(mappedMatch)) {
    return {
      ok: true,
      scored: false,
      predictionsScored: 0,
      message: "Match saved. Scoring skipped because this is not a finalized group-stage match with scores."
    };
  }

  const { data: predictions, error: predictionsError } = await adminSupabase
    .from("predictions")
    .select(
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score"
    )
    .eq("match_id", matchId);

  if (predictionsError) {
    return { ok: false, message: predictionsError.message };
  }

  const predictionRows = (predictions ?? []) as PredictionRow[];
  const predictionUpdates = predictionRows.map((prediction) =>
    adminSupabase
      .from("predictions")
      .update({
        points_awarded: scoreGroupStagePrediction(
          {
            predictedWinnerTeamId: prediction.predicted_winner_team_id,
            predictedIsDraw: prediction.predicted_is_draw,
            predictedHomeScore: prediction.predicted_home_score,
            predictedAwayScore: prediction.predicted_away_score
          },
          mappedMatch
        )
      })
      .eq("id", prediction.id)
  );

  const updateResults = await Promise.all(predictionUpdates);
  const failedPredictionUpdate = updateResults.find((result) => result.error);
  if (failedPredictionUpdate?.error) {
    return { ok: false, message: failedPredictionUpdate.error.message };
  }

  const leaderboardResult = await recalculateLeaderboard(adminSupabase);
  if (!leaderboardResult.ok) {
    return leaderboardResult;
  }

  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath("/predictions");
  revalidatePath("/admin/matches");

  return {
    ok: true,
    scored: true,
    predictionsScored: predictionRows.length,
    message:
      predictionRows.length === 0
        ? `Match saved as final, but no Supabase prediction rows were found for match ${matchId}.`
        : `Match saved and ${predictionRows.length} predictions scored.`
  };
}

async function assertCurrentUserIsAdmin(): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in as an admin to score matches." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false, message: "Only admins can score matches." };
  }

  return { ok: true };
}

async function recalculateLeaderboard(
  adminSupabase: ReturnType<typeof createAdminClient>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: predictionPoints, error: predictionPointsError } = await adminSupabase
    .from("predictions")
    .select("user_id,points_awarded");

  if (predictionPointsError) {
    return { ok: false, message: predictionPointsError.message };
  }

  const totalsByUser = new Map<string, number>();
  for (const row of predictionPoints as { user_id: string; points_awarded: number | null }[]) {
    totalsByUser.set(row.user_id, (totalsByUser.get(row.user_id) ?? 0) + (row.points_awarded ?? 0));
  }

  const { data: users, error: usersError } = await adminSupabase.from("users").select("id");
  if (usersError) {
    return { ok: false, message: usersError.message };
  }

  const totals = (users as { id: string }[])
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

  const userTotalUpdates = (users as { id: string }[]).map((user) =>
    adminSupabase
      .from("users")
      .update({ total_points: totalsByUser.get(user.id) ?? 0 })
      .eq("id", user.id)
  );

  const userUpdateResults = await Promise.all(userTotalUpdates);
  const failedUserUpdate = userUpdateResults.find((result) => result.error);
  if (failedUserUpdate?.error) {
    return { ok: false, message: failedUserUpdate.error.message };
  }

  return { ok: true };
}

async function resetGroupMatchScoring(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await adminSupabase
    .from("predictions")
    .update({ points_awarded: 0 })
    .eq("match_id", matchId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return recalculateLeaderboard(adminSupabase);
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

function mapMatchRow(row: MatchRow) {
  return {
    id: row.id,
    stage: row.stage,
    groupName: row.group_name ?? undefined,
    status: row.status,
    homeTeamId: row.home_team_id ?? undefined,
    awayTeamId: row.away_team_id ?? undefined,
    homeSource: row.home_source ?? undefined,
    awaySource: row.away_source ?? undefined,
    kickoffTime: row.kickoff_time ?? "",
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    winnerTeamId: row.winner_team_id ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}
