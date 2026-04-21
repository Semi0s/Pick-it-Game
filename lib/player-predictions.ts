"use client";

import { getStoredPredictions, upsertStoredPrediction } from "@/lib/prediction-store";
import { saveGroupPredictionAction } from "@/app/groups/actions";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import type { Prediction } from "@/lib/types";

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  predicted_is_draw: boolean;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
  points_awarded?: number | null;
};

export async function fetchPlayerPredictions(userId: string): Promise<Prediction[]> {
  const localPredictions = getStoredPredictions(userId);

  if (!hasSupabaseConfig()) {
    return localPredictions;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("predictions")
    .select(
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded"
    )
    .eq("user_id", userId);

  if (error && localPredictions.length > 0) {
    return syncLocalPredictions(localPredictions);
  }

  if (error) {
    throw error;
  }

  let savedPredictions = (data as PredictionRow[]).map(mapPredictionRow);
  const savedMatchIds = new Set(savedPredictions.map((prediction) => prediction.matchId));
  const unsyncedLocalPredictions = localPredictions.filter(
    (prediction) => !savedMatchIds.has(prediction.matchId)
  );

  if (unsyncedLocalPredictions.length > 0) {
    const syncedPredictions = await syncLocalPredictions(unsyncedLocalPredictions);
    savedPredictions = [...savedPredictions, ...syncedPredictions];
  }

  if (savedPredictions.length > 0 || localPredictions.length === 0) {
    return savedPredictions;
  }

  return [];
}

export async function savePlayerPrediction(prediction: Prediction): Promise<Prediction> {
  if (!hasSupabaseConfig()) {
    upsertStoredPrediction(prediction);
    return prediction;
  }

  const result = await saveGroupPredictionAction({
    matchId: prediction.matchId,
    predictedHomeScore: prediction.predictedHomeScore,
    predictedAwayScore: prediction.predictedAwayScore
  });

  if (!result.ok) {
    throw new Error(result.message);
  }

  const savedPrediction = result.prediction;
  upsertStoredPrediction(savedPrediction);
  return savedPrediction;
}

async function syncLocalPredictions(predictions: Prediction[]) {
  const results = await Promise.all(
    predictions.map((prediction) =>
      saveGroupPredictionAction({
        matchId: prediction.matchId,
        predictedHomeScore: prediction.predictedHomeScore,
        predictedAwayScore: prediction.predictedAwayScore
      })
    )
  );

  return results
    .map((result) => (result.ok ? result.prediction : null))
    .filter(Boolean) as Prediction[];
}

function mapPredictionRow(row: PredictionRow): Prediction {
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    predictedWinnerTeamId: row.predicted_winner_team_id ?? undefined,
    predictedIsDraw: row.predicted_is_draw,
    predictedHomeScore: row.predicted_home_score ?? undefined,
    predictedAwayScore: row.predicted_away_score ?? undefined,
    pointsAwarded: row.points_awarded ?? 0
  };
}
