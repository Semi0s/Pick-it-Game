import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";

export type GroupPhaseActualOutcome = {
  groupName: string;
  rankedTeamIds: string[];
  thirdPlaceQualified: boolean | null;
};

export type GroupPhaseScoreBreakdown = {
  groupName: string;
  winnerPoints: number;
  runnerUpPoints: number;
  thirdPlacePoints: number;
  topTwoAnyOrderBonus: number;
  thirdPlaceQualificationPoints: number;
  completeLadderBonus: number;
  totalPoints: number;
  maxPoints: number;
};

export type GroupPhaseScoreSummary = {
  groupBreakdowns: GroupPhaseScoreBreakdown[];
  totalPoints: number;
  maxPoints: number;
};

export const GROUP_PHASE_GROUP_MAX_POINTS = 14;

/**
 * Launch scoring ladder for the Group Phase default path.
 *
 * Each group can earn up to 14 points:
 * - Correct winner: 5
 * - Correct runner-up: 3
 * - Correct third-place team: 2
 * - Correct top two teams in any order: 1
 * - Correct third-place qualification status: 1
 * - Correct complete ladder order: 2
 *
 * This is intentionally explicit so the ladder stays testable and easy to tune.
 */
export function scoreGroupPhaseGroupPrediction(params: {
  actual: GroupPhaseActualOutcome;
  predictedRankedTeamIds: string[];
  predictedThirdPlaceQualified: boolean | null;
}): GroupPhaseScoreBreakdown {
  const actual = params.actual.rankedTeamIds.slice(0, 4);
  const predicted = params.predictedRankedTeamIds.slice(0, 4);

  const actualWinner = actual[0] ?? null;
  const actualRunnerUp = actual[1] ?? null;
  const actualThird = actual[2] ?? null;
  const predictedWinner = predicted[0] ?? null;
  const predictedRunnerUp = predicted[1] ?? null;
  const predictedThird = predicted[2] ?? null;

  const winnerPoints = actualWinner && predictedWinner === actualWinner ? 5 : 0;
  const runnerUpPoints = actualRunnerUp && predictedRunnerUp === actualRunnerUp ? 3 : 0;
  const thirdPlacePoints = actualThird && predictedThird === actualThird ? 2 : 0;

  const actualTopTwo = new Set(actual.slice(0, 2));
  const predictedTopTwo = new Set(predicted.slice(0, 2));
  const topTwoAnyOrderBonus =
    actualTopTwo.size === 2 &&
    predictedTopTwo.size === 2 &&
    Array.from(actualTopTwo).every((teamId) => predictedTopTwo.has(teamId))
      ? 1
      : 0;

  const thirdPlaceQualificationPoints =
    actualThird && params.actual.thirdPlaceQualified !== null && params.predictedThirdPlaceQualified !== null
      ? params.actual.thirdPlaceQualified === params.predictedThirdPlaceQualified
        ? 1
        : 0
      : 0;

  const completeLadderBonus =
    actual.length === 4 && predicted.length === 4 && actual.every((teamId, index) => predicted[index] === teamId)
      ? 2
      : 0;

  const totalPoints =
    winnerPoints +
    runnerUpPoints +
    thirdPlacePoints +
    topTwoAnyOrderBonus +
    thirdPlaceQualificationPoints +
    completeLadderBonus;

  return {
    groupName: params.actual.groupName,
    winnerPoints,
    runnerUpPoints,
    thirdPlacePoints,
    topTwoAnyOrderBonus,
    thirdPlaceQualificationPoints,
    completeLadderBonus,
    totalPoints,
    maxPoints: GROUP_PHASE_GROUP_MAX_POINTS
  };
}

export function scoreGroupPhaseSnapshot(params: {
  snapshot: LightSeedBuilderSnapshot | null;
  actualOutcomes: GroupPhaseActualOutcome[];
  requiredThirdPlaceQualifierCount: number;
}): GroupPhaseScoreSummary {
  const rankingsByGroup = new Map(
    (params.snapshot?.groupRankings ?? []).map((ranking) => [ranking.groupName, ranking.rankedTeamIds])
  );
  const predictedQualifiedThirdPlaceIds = new Set(
    (params.snapshot?.thirdPlaceRankings ?? [])
      .sort((left, right) => left.rank - right.rank)
      .slice(0, params.requiredThirdPlaceQualifierCount)
      .map((row) => row.teamId)
  );

  const groupBreakdowns = params.actualOutcomes.map((actual) =>
    scoreGroupPhaseGroupPrediction({
      actual,
      predictedRankedTeamIds: rankingsByGroup.get(actual.groupName) ?? [],
      predictedThirdPlaceQualified:
        rankingsByGroup.get(actual.groupName)?.[2] !== undefined
          ? predictedQualifiedThirdPlaceIds.has(rankingsByGroup.get(actual.groupName)![2]!)
          : null
    })
  );

  return {
    groupBreakdowns,
    totalPoints: groupBreakdowns.reduce((sum, breakdown) => sum + breakdown.totalPoints, 0),
    maxPoints: groupBreakdowns.reduce((sum, breakdown) => sum + breakdown.maxPoints, 0)
  };
}
