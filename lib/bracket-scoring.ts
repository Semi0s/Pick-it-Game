import {
  formatMatchStage,
  normalizeKnockoutStage,
  type CanonicalKnockoutStage
} from "@/lib/match-stage";
import type { MatchStage, MatchStatus } from "@/lib/types";

const BRACKET_WINNER_POINTS: Record<CanonicalKnockoutStage, number> = {
  r32: 3,
  r16: 5,
  qf: 8,
  sf: 10,
  third: 5,
  final: 15
};

const BRACKET_EXACT_SCORE_BONUS: Record<CanonicalKnockoutStage, number> = {
  r32: 5,
  r16: 5,
  qf: 5,
  sf: 5,
  third: 5,
  final: 10
};

export type ScorableKnockoutMatch = {
  stage: MatchStage;
  status: MatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  winnerTeamId?: string | null;
};

export type BracketScoreBreakdown = {
  stage: CanonicalKnockoutStage;
  points: number;
  roundPoints: number;
  exactScorePoints: number;
  isCorrect: boolean;
};

export function canScoreKnockoutMatch(match: ScorableKnockoutMatch) {
  return Boolean(normalizeKnockoutStage(match.stage) && match.stage !== "group" && match.status === "final" && match.winnerTeamId);
}

export function scoreBracketPrediction(
  match: ScorableKnockoutMatch,
  prediction: {
    predictedWinnerTeamId: string | null | undefined;
    predictedHomeScore?: number | null;
    predictedAwayScore?: number | null;
  }
): BracketScoreBreakdown {
  const stage = normalizeKnockoutStage(match.stage);
  if (!stage) {
    throw new Error(`Cannot score non-knockout stage ${formatMatchStage(match.stage)}.`);
  }

  if (!canScoreKnockoutMatch(match) || !prediction.predictedWinnerTeamId || !match.winnerTeamId) {
    return {
      stage,
      points: 0,
      roundPoints: 0,
      exactScorePoints: 0,
      isCorrect: false
    };
  }

  const isCorrect = prediction.predictedWinnerTeamId === match.winnerTeamId;
  const roundPoints = isCorrect ? BRACKET_WINNER_POINTS[stage] : 0;
  const hasExactScore =
    isCorrect &&
    prediction.predictedHomeScore !== null &&
    prediction.predictedHomeScore !== undefined &&
    prediction.predictedAwayScore !== null &&
    prediction.predictedAwayScore !== undefined &&
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined &&
    prediction.predictedHomeScore === match.homeScore &&
    prediction.predictedAwayScore === match.awayScore;
  const exactScorePoints = hasExactScore ? BRACKET_EXACT_SCORE_BONUS[stage] : 0;

  return {
    stage,
    points: roundPoints + exactScorePoints,
    roundPoints,
    exactScorePoints,
    isCorrect
  };
}
