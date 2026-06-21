import {
  getAdvanceViaThirdProbability,
  resolveAdvanceViaThirdRankingIndex,
  type PickProbabilityTeam
} from "./group-pick-probability.ts";
import { assignDeterministicRanks } from "./scoring-engine.ts";

export type ProjectedRankingSummary = {
  rawProjectedPoints: number;
};

export function buildGlobalProjectedRankedEntries(
  userIds: string[],
  summaries: Map<string, ProjectedRankingSummary>
) {
  return assignDeterministicRanks(
    userIds.map((userId) => ({
      user_id: userId,
      total_points: summaries.get(userId)?.rawProjectedPoints ?? 0
    }))
  );
}

export function computeThirdPlaceQualificationExpectation(input: {
  predictedThird: PickProbabilityTeam | null;
  predictedThirdPlaceQualifiedIds: ReadonlySet<string>;
  thirdPlacePool: PickProbabilityTeam[];
}) {
  const rankingIndex =
    input.predictedThird
      ? resolveAdvanceViaThirdRankingIndex(input.predictedThird, input.thirdPlacePool)
      : null;

  const thirdQualificationProbability =
    input.predictedThird && rankingIndex !== null
      ? getAdvanceViaThirdProbability(input.predictedThird, rankingIndex, input.thirdPlacePool) / 100
      : 0;

  return {
    thirdQualificationProbability,
    thirdPlaceQualificationPoints:
      input.predictedThird
        ? (input.predictedThirdPlaceQualifiedIds.has(input.predictedThird.id)
            ? thirdQualificationProbability
            : 1 - thirdQualificationProbability)
        : 0
  };
}
