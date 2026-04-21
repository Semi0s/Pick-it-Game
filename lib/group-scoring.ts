import type { MatchStage, MatchStatus } from "@/lib/types";

export type ScorableGroupMatch = {
  stage: MatchStage;
  status: MatchStatus;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  winnerTeamId?: string | null;
};

export type ScorablePrediction = {
  predictedWinnerTeamId?: string | null;
  predictedIsDraw: boolean;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
};

export function canScoreGroupMatch(match: ScorableGroupMatch) {
  return (
    match.stage === "group" &&
    match.status === "final" &&
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined
  );
}

export function scoreGroupStagePrediction(prediction: ScorablePrediction, match: ScorableGroupMatch) {
  if (!canScoreGroupMatch(match)) {
    return 0;
  }

  if (
    prediction.predictedHomeScore === null ||
    prediction.predictedHomeScore === undefined ||
    prediction.predictedAwayScore === null ||
    prediction.predictedAwayScore === undefined
  ) {
    return 0;
  }

  const actualOutcome = getOutcome(match);
  const predictedOutcome = prediction.predictedIsDraw ? "draw" : prediction.predictedWinnerTeamId ?? "none";
  const hasCorrectOutcome = actualOutcome === predictedOutcome;

  if (!hasCorrectOutcome) {
    return 0;
  }

  const hasExactScore =
    prediction.predictedHomeScore === match.homeScore && prediction.predictedAwayScore === match.awayScore;

  if (hasExactScore) {
    return 8;
  }

  const hasExactGoalDifference =
    prediction.predictedHomeScore - prediction.predictedAwayScore === match.homeScore! - match.awayScore!;

  return 3 + (hasExactGoalDifference ? 1 : 0);
}

function getOutcome(match: ScorableGroupMatch) {
  if (match.homeScore === match.awayScore) {
    return "draw";
  }

  if (match.homeScore! > match.awayScore!) {
    return match.homeTeamId ?? "none";
  }

  return match.awayTeamId ?? "none";
}
