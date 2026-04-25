import type { Match, Prediction } from "@/lib/types";
import { isPredictionLockedStatus } from "@/lib/prediction-state";

export function isPredictionLocked(match: Match) {
  return isPredictionLockedStatus(match.status);
}

export function getPredictedOutcome(prediction: Prediction) {
  if (prediction.predictedIsDraw) {
    return "draw";
  }

  return prediction.predictedWinnerTeamId ?? "none";
}

export function getScoreLabel(homeScore?: number, awayScore?: number) {
  if (homeScore === undefined || awayScore === undefined) {
    return "No score";
  }

  return `${homeScore}-${awayScore}`;
}
