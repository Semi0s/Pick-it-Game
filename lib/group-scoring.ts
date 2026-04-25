import type { MatchStage, MatchStatus } from "@/lib/types";

const CORRECT_OUTCOME_POINTS = 3;
const EXACT_GOAL_DIFFERENCE_BONUS = 1;
const EXACT_SCORE_BONUS = 5;

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

export type GroupStageScoreBreakdown = {
  points: number;
  outcome_points: number;
  exact_score_points: number;
  goal_difference_points: number;
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
    return createEmptyScoreBreakdown();
  }

  if (
    prediction.predictedHomeScore === null ||
    prediction.predictedHomeScore === undefined ||
    prediction.predictedAwayScore === null ||
    prediction.predictedAwayScore === undefined
  ) {
    return createEmptyScoreBreakdown();
  }

  const actualOutcome = getOutcome(match);
  const predictedOutcome = prediction.predictedIsDraw ? "draw" : prediction.predictedWinnerTeamId ?? "none";
  const hasCorrectOutcome = actualOutcome === predictedOutcome;

  if (!hasCorrectOutcome) {
    return createEmptyScoreBreakdown();
  }

  const hasExactScore =
    prediction.predictedHomeScore === match.homeScore && prediction.predictedAwayScore === match.awayScore;

  if (hasExactScore) {
    return {
      points: CORRECT_OUTCOME_POINTS + EXACT_SCORE_BONUS,
      outcome_points: CORRECT_OUTCOME_POINTS,
      exact_score_points: EXACT_SCORE_BONUS,
      goal_difference_points: 0
    };
  }

  const hasExactGoalDifference =
    prediction.predictedHomeScore - prediction.predictedAwayScore === match.homeScore! - match.awayScore!;

  return {
    points: CORRECT_OUTCOME_POINTS + (hasExactGoalDifference ? EXACT_GOAL_DIFFERENCE_BONUS : 0),
    outcome_points: CORRECT_OUTCOME_POINTS,
    exact_score_points: 0,
    goal_difference_points: hasExactGoalDifference ? EXACT_GOAL_DIFFERENCE_BONUS : 0
  };
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

function createEmptyScoreBreakdown(): GroupStageScoreBreakdown {
  return {
    points: 0,
    outcome_points: 0,
    exact_score_points: 0,
    goal_difference_points: 0
  };
}
