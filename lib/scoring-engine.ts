import { scoreBracketPrediction, type ScorableKnockoutMatch } from "./bracket-scoring.ts";
import { scoreGroupPhaseSnapshot, type GroupPhaseActualOutcome } from "./group-phase-scoring.ts";
import { scoreGroupStagePrediction, type ScorableGroupMatch, type ScorablePrediction } from "./group-scoring.ts";
import type { LightSeedBuilderSnapshot } from "./group-stage-modes.ts";
import type { MatchStatus } from "./types.ts";

export type ScoreSource =
  | "group_match"
  | "group_phase"
  | "knockout_match"
  | "side_pick"
  | "group_custom";

export type ScoreLineItem = {
  userId: string;
  source: ScoreSource;
  points: number;
  reasonKey: string;
  matchId?: string;
  groupName?: string;
  details?: Record<string, unknown>;
};

export type UserScoreBreakdown = {
  userId: string;
  totalPoints: number;
  lineItems: ScoreLineItem[];
};

export type LeaderboardComparable = {
  user_id: string;
  total_points: number;
};

export function calculateGroupMatchScoreLineItem(input: {
  userId: string;
  matchId: string;
  prediction: ScorablePrediction;
  match: ScorableGroupMatch;
}): ScoreLineItem {
  const breakdown = scoreGroupStagePrediction(input.prediction, input.match);

  return {
    userId: input.userId,
    source: "group_match",
    matchId: input.matchId,
    points: breakdown.points,
    reasonKey: "scoring.groupMatch",
    details: breakdown
  };
}

export function calculateGroupPhaseScoreBreakdown(input: {
  userId: string;
  snapshot: LightSeedBuilderSnapshot | null;
  actualOutcomes: GroupPhaseActualOutcome[];
  requiredThirdPlaceQualifierCount: number;
}): UserScoreBreakdown {
  const summary = scoreGroupPhaseSnapshot({
    snapshot: input.snapshot,
    actualOutcomes: input.actualOutcomes,
    requiredThirdPlaceQualifierCount: input.requiredThirdPlaceQualifierCount
  });

  return calculateUserScoreBreakdown({
    userId: input.userId,
    lineItems: summary.groupBreakdowns.map((breakdown) => ({
      userId: input.userId,
      source: "group_phase",
      groupName: breakdown.groupName,
      points: breakdown.totalPoints,
      reasonKey: "scoring.groupPhaseGroup",
      details: breakdown
    }))
  });
}

export function calculateKnockoutMatchScoreLineItem(input: {
  userId: string;
  matchId: string;
  match: ScorableKnockoutMatch;
  prediction: {
    predictedWinnerTeamId: string | null | undefined;
    predictedHomeScore?: number | null;
    predictedAwayScore?: number | null;
  };
}): ScoreLineItem {
  const breakdown = scoreBracketPrediction(input.match, input.prediction);

  return {
    userId: input.userId,
    source: "knockout_match",
    matchId: input.matchId,
    points: breakdown.points,
    reasonKey: "scoring.knockoutMatch",
    details: breakdown
  };
}

export function calculateUserScoreBreakdown(input: {
  userId: string;
  lineItems: ScoreLineItem[];
}): UserScoreBreakdown {
  const lineItems = input.lineItems.map((lineItem) => ({
    ...lineItem,
    userId: lineItem.userId || input.userId,
    points: normalizeScorePoints(lineItem.points)
  }));
  const totalPoints = lineItems.reduce((sum, lineItem) => sum + lineItem.points, 0);

  return {
    userId: input.userId,
    totalPoints,
    lineItems
  };
}

export function assertScoreBreakdownInvariant(breakdown: UserScoreBreakdown) {
  const summedPoints = breakdown.lineItems.reduce((sum, lineItem) => sum + lineItem.points, 0);
  if (breakdown.totalPoints !== summedPoints) {
    throw new Error(
      `Score invariant failed for ${breakdown.userId}: total ${breakdown.totalPoints} does not equal line item sum ${summedPoints}.`
    );
  }
}

export function compareLeaderboardEntries<T extends LeaderboardComparable>(left: T, right: T) {
  return right.total_points - left.total_points || left.user_id.localeCompare(right.user_id);
}

export function sortLeaderboardEntries<T extends LeaderboardComparable>(entries: T[]) {
  return [...entries].sort(compareLeaderboardEntries);
}

export function assignDeterministicRanks<T extends LeaderboardComparable>(entries: T[]): Array<T & { rank: number }> {
  return assignDeterministicRanksWithComparator(entries, compareLeaderboardEntries);
}

export function assignDeterministicRanksWithComparator<T extends LeaderboardComparable>(
  entries: T[],
  comparator: (left: T, right: T) => number
): Array<T & { rank: number }> {
  const sortedEntries = [...entries].sort(comparator);
  let currentRank = 0;
  let previousPoints: number | null = null;

  return sortedEntries.map((entry, index) => {
    if (previousPoints === null || entry.total_points < previousPoints) {
      currentRank = index + 1;
      previousPoints = entry.total_points;
    }

    return {
      ...entry,
      rank: currentRank
    };
  });
}

export function isMatchLockedAt(
  match: {
    status: MatchStatus | string;
    kickoffTime?: string | null;
  },
  nowMs = Date.now()
) {
  if (match.status === "final" || match.status === "live" || match.status === "locked") {
    return true;
  }

  if (!match.kickoffTime) {
    return false;
  }

  const kickoffMs = new Date(match.kickoffTime).getTime();
  return Number.isFinite(kickoffMs) ? kickoffMs <= nowMs : false;
}

function normalizeScorePoints(points: number) {
  return Number.isFinite(points) ? Math.trunc(points) : 0;
}
