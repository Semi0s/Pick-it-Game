import {
  formatMatchStage,
  normalizeKnockoutStage,
  type CanonicalKnockoutStage
} from "@/lib/match-stage";
import type { MatchStage, MatchStatus } from "@/lib/types";

const BRACKET_ROUND_POINTS: Record<CanonicalKnockoutStage, number> = {
  r32: 0,
  r16: 5,
  qf: 10,
  sf: 15,
  third: 0,
  final: 20
};

const CHAMPION_BONUS_POINTS = 25;

export type ScorableKnockoutMatch = {
  stage: MatchStage;
  status: MatchStatus;
  winnerTeamId?: string | null;
};

export type BracketScoreBreakdown = {
  stage: CanonicalKnockoutStage;
  points: number;
  roundPoints: number;
  championPoints: number;
  isCorrect: boolean;
};

export function canScoreKnockoutMatch(match: ScorableKnockoutMatch) {
  return Boolean(normalizeKnockoutStage(match.stage) && match.stage !== "group" && match.status === "final" && match.winnerTeamId);
}

export function scoreBracketPrediction(
  match: ScorableKnockoutMatch,
  predictedWinnerTeamId: string | null | undefined
): BracketScoreBreakdown {
  const stage = normalizeKnockoutStage(match.stage);
  if (!stage) {
    throw new Error(`Cannot score non-knockout stage ${formatMatchStage(match.stage)}.`);
  }

  if (!canScoreKnockoutMatch(match) || !predictedWinnerTeamId || !match.winnerTeamId) {
    return {
      stage,
      points: 0,
      roundPoints: 0,
      championPoints: 0,
      isCorrect: false
    };
  }

  const isCorrect = predictedWinnerTeamId === match.winnerTeamId;
  const roundPoints = isCorrect ? BRACKET_ROUND_POINTS[stage] : 0;
  const championPoints = isCorrect && stage === "final" ? CHAMPION_BONUS_POINTS : 0;

  return {
    stage,
    points: roundPoints + championPoints,
    roundPoints,
    championPoints,
    isCorrect
  };
}
