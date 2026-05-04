import type { MatchStatus } from "@/lib/types";

export type PredictionStateStatus = MatchStatus | "in_progress";
export type PredictionStateLabel = "Open" | "Locked" | "Final";

export function normalizePredictionStatus(status: PredictionStateStatus): MatchStatus {
  if (status === "in_progress") {
    return "locked";
  }

  return status;
}

export function getPredictionStateLabel(status: PredictionStateStatus): PredictionStateLabel {
  const normalizedStatus = normalizePredictionStatus(status);

  if (normalizedStatus === "scheduled") {
    return "Open";
  }

  if (normalizedStatus === "final") {
    return "Final";
  }

  return "Locked";
}

export function canEditPrediction(status: PredictionStateStatus) {
  return normalizePredictionStatus(status) === "scheduled";
}

export function isPredictionLockedStatus(status: PredictionStateStatus) {
  return !canEditPrediction(status);
}
