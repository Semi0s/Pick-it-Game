"use client";

import { getStoredPredictions, upsertStoredPrediction } from "@/lib/prediction-store";
import { saveGroupPredictionAction } from "@/app/groups/actions";
import { parseJsonResponse } from "@/lib/fetch-json";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { Prediction } from "@/lib/types";

export async function fetchPlayerPredictions(userId: string): Promise<Prediction[]> {
  const localPredictions = getStoredPredictions(userId);

  if (!hasSupabaseConfig()) {
    return localPredictions;
  }

  try {
    const response = await fetch("/api/predictions", { cache: "no-store" });
    const result = await parseJsonResponse<
      | { ok: true; predictions: Prediction[] }
      | { ok: false; message?: string }
    >(response, "Could not load predictions.", "predictions");

    if (!response.ok || !result.ok) {
      if (response.status === 401) {
        return localPredictions;
      }

      console.error("Failed to fetch player predictions via API route.", {
        userId,
        status: response.status,
        message: "message" in result ? result.message : null
      });
      return localPredictions;
    }

    return result.predictions;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected client error";
    console.warn("Falling back to stored predictions after predictions fetch failed.", {
      userId,
      message
    });
    return localPredictions;
  }
}

export async function savePlayerPrediction(prediction: Prediction): Promise<Prediction> {
  if (!hasSupabaseConfig()) {
    const localPrediction = { ...prediction, updatedAt: new Date().toISOString() };
    upsertStoredPrediction(localPrediction);
    return localPrediction;
  }

  const result = await saveGroupPredictionAction({
    matchId: prediction.matchId,
    predictedHomeScore: prediction.predictedHomeScore,
    predictedAwayScore: prediction.predictedAwayScore
  });

  if (!result.ok) {
    console.error("Failed to save prediction.", {
      matchId: prediction.matchId,
      userId: prediction.userId,
      message: result.message
    });
    throw new Error(result.message);
  }

  const savedPrediction = result.prediction;
  upsertStoredPrediction(savedPrediction);
  return savedPrediction;
}
