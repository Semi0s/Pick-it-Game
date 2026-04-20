"use client";

import type { Prediction } from "@/lib/types";

const PREDICTION_KEY = "wcbc-2026-predictions";

export function getStoredPredictions(userId: string): Prediction[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawPredictions = window.localStorage.getItem(PREDICTION_KEY);
  if (!rawPredictions) {
    return [];
  }

  try {
    const predictions = JSON.parse(rawPredictions) as Prediction[];
    return predictions.filter((prediction) => prediction.userId === userId);
  } catch {
    window.localStorage.removeItem(PREDICTION_KEY);
    return [];
  }
}

export function getAllStoredPredictions(): Prediction[] {
  if (typeof window === "undefined") {
    return [];
  }

  const rawPredictions = window.localStorage.getItem(PREDICTION_KEY);
  if (!rawPredictions) {
    return [];
  }

  try {
    return JSON.parse(rawPredictions) as Prediction[];
  } catch {
    window.localStorage.removeItem(PREDICTION_KEY);
    return [];
  }
}

export function upsertStoredPrediction(nextPrediction: Prediction) {
  const rawPredictions = window.localStorage.getItem(PREDICTION_KEY);
  let predictions: Prediction[] = [];

  if (rawPredictions) {
    try {
      predictions = JSON.parse(rawPredictions) as Prediction[];
    } catch {
      predictions = [];
    }
  }

  const existingIndex = predictions.findIndex(
    (prediction) =>
      prediction.userId === nextPrediction.userId && prediction.matchId === nextPrediction.matchId
  );

  if (existingIndex >= 0) {
    predictions[existingIndex] = nextPrediction;
  } else {
    predictions.push(nextPrediction);
  }

  window.localStorage.setItem(PREDICTION_KEY, JSON.stringify(predictions));
}
