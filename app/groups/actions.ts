"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { canEditPrediction, getPredictionStateLabel } from "@/lib/prediction-state";
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
  kickoff_time: string;
  status: "scheduled" | "locked" | "live" | "final";
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
    .select("id,home_team_id,away_team_id,kickoff_time,status")
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

async function getCurrentUserId(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
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
