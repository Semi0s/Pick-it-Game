import type { Match, Prediction } from "@/lib/types";

export function isPredictionLocked(match: Match, now = new Date()) {
  return new Date(match.kickoffTime).getTime() <= now.getTime();
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
