export type PredictedAdvancementGroupRanking = {
  groupName: string;
  rankedTeamIds: string[];
};

export type PredictedAdvancementThirdPlaceRanking = {
  teamId: string;
  rank: number;
};

export type PredictedAdvancementSnapshot = {
  groupRankings: PredictedAdvancementGroupRanking[];
  thirdPlaceRankings: PredictedAdvancementThirdPlaceRanking[];
};

export type PredictedAdvancementDecoration = {
  isPredictedToAdvance: boolean;
  predictedGroupId?: string;
  predictedGroupRank?: number;
  predictedThirdPlaceRank?: number;
};

export function buildPredictedAdvancementByTeamId(
  snapshot?: PredictedAdvancementSnapshot | null
): Map<string, PredictedAdvancementDecoration> {
  const predictedThirdPlaceRankByTeamId = new Map<string, number>();
  for (const ranking of snapshot?.thirdPlaceRankings ?? []) {
    const teamId = ranking.teamId?.trim();
    if (!teamId || ranking.rank < 1) {
      continue;
    }

    predictedThirdPlaceRankByTeamId.set(teamId, ranking.rank);
  }

  const predictedAdvancementByTeamId = new Map<string, PredictedAdvancementDecoration>();
  for (const groupRanking of snapshot?.groupRankings ?? []) {
    const predictedGroupId = normalizePredictedGroupId(groupRanking.groupName);

    groupRanking.rankedTeamIds.slice(0, 4).forEach((teamId, index) => {
      const normalizedTeamId = teamId?.trim();
      if (!normalizedTeamId) {
        return;
      }

      const predictedGroupRank = index + 1;
      const predictedThirdPlaceRank = predictedThirdPlaceRankByTeamId.get(normalizedTeamId);
      const isPredictedToAdvance =
        predictedGroupRank === 1 ||
        predictedGroupRank === 2 ||
        (predictedGroupRank === 3 && typeof predictedThirdPlaceRank === "number");

      predictedAdvancementByTeamId.set(normalizedTeamId, {
        isPredictedToAdvance,
        predictedGroupId,
        predictedGroupRank,
        predictedThirdPlaceRank
      });
    });
  }

  return predictedAdvancementByTeamId;
}

function normalizePredictedGroupId(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.startsWith("Group ") ? trimmed.replace(/^Group\s+/i, "").trim() : trimmed;
}
