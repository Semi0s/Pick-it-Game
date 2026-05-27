import { scoreGroupPhaseSnapshot, type GroupPhaseActualOutcome, type GroupPhaseScoreSummary } from "./group-phase-scoring.ts";
import type { LightSeedBuilderSnapshot } from "./group-stage-modes.ts";

export type GroupPhaseSeedRankingInput = {
  user_id: string;
  group_name: string;
  rank_position: number;
  team_id: string;
};

export type GroupPhaseThirdPlaceRankingInput = {
  user_id: string;
  team_id: string;
  rank_position: number;
};

export type CanonicalGroupPhaseLadderScore = {
  userId: string;
  snapshot: LightSeedBuilderSnapshot | null;
  points: number;
  maxPoints: number;
  hasSnapshot: boolean;
  breakdown: GroupPhaseScoreSummary;
};

/**
 * Canonical Group Phase leaderboard scoring.
 *
 * This is the server-safe recompute path for the visible Group Phase ladder
 * scoring model. Do not replace it with legacy full-match score prediction
 * totals unless the product scoring rules intentionally change.
 */
export function recomputeGroupPhaseLadderScores(input: {
  userIds: string[];
  actualOutcomes: GroupPhaseActualOutcome[];
  requiredThirdPlaceQualifierCount: number;
  groupSeedRankings: GroupPhaseSeedRankingInput[];
  thirdPlaceRankings: GroupPhaseThirdPlaceRankingInput[];
  isScorable?: boolean;
}): Map<string, CanonicalGroupPhaseLadderScore> {
  const uniqueUserIds = Array.from(new Set(input.userIds.filter(Boolean)));
  const groupedRankings = groupSeedRankingsByUser(input.groupSeedRankings);
  const groupedThirdPlaceRankings = thirdPlaceRankingsByUser(input.thirdPlaceRankings);
  const isScorable = input.isScorable ?? true;
  const scores = new Map<string, CanonicalGroupPhaseLadderScore>();

  for (const userId of uniqueUserIds) {
    const snapshot = buildGroupPhaseSnapshot({
      userId,
      groupedRankings,
      groupedThirdPlaceRankings
    });
    const breakdown = scoreGroupPhaseSnapshot({
      snapshot,
      actualOutcomes: input.actualOutcomes,
      requiredThirdPlaceQualifierCount: input.requiredThirdPlaceQualifierCount
    });

    scores.set(userId, {
      userId,
      snapshot,
      points: isScorable ? breakdown.totalPoints : 0,
      maxPoints: breakdown.maxPoints,
      hasSnapshot: Boolean(snapshot?.groupRankings.length || snapshot?.thirdPlaceRankings.length),
      breakdown
    });
  }

  return scores;
}

function buildGroupPhaseSnapshot(input: {
  userId: string;
  groupedRankings: Map<string, Map<string, string[]>>;
  groupedThirdPlaceRankings: Map<string, Array<{ teamId: string; rank: number }>>;
}): LightSeedBuilderSnapshot | null {
  const rankingMap = input.groupedRankings.get(input.userId) ?? null;
  const thirdPlaceRankings = input.groupedThirdPlaceRankings.get(input.userId) ?? [];
  if (!rankingMap && thirdPlaceRankings.length === 0) {
    return null;
  }

  return {
    groupRankings: Array.from((rankingMap ?? new Map()).entries())
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([groupName, rankedTeamIds]) => ({ groupName, rankedTeamIds })),
    thirdPlaceRankings: thirdPlaceRankings.slice().sort((left, right) => left.rank - right.rank)
  };
}

function groupSeedRankingsByUser(rows: GroupPhaseSeedRankingInput[]) {
  const groupedRankings = new Map<string, Map<string, string[]>>();
  const sortedRows = rows
    .slice()
    .sort(
      (left, right) =>
        left.user_id.localeCompare(right.user_id) ||
        left.group_name.localeCompare(right.group_name, undefined, { numeric: true }) ||
        left.rank_position - right.rank_position
    );

  for (const row of sortedRows) {
    const byGroup = groupedRankings.get(row.user_id) ?? new Map<string, string[]>();
    const ranked = byGroup.get(row.group_name) ?? [];
    ranked.push(row.team_id);
    byGroup.set(row.group_name, ranked);
    groupedRankings.set(row.user_id, byGroup);
  }

  return groupedRankings;
}

function thirdPlaceRankingsByUser(rows: GroupPhaseThirdPlaceRankingInput[]) {
  const groupedThirdPlaceRankings = new Map<string, Array<{ teamId: string; rank: number }>>();
  for (const row of rows) {
    const current = groupedThirdPlaceRankings.get(row.user_id) ?? [];
    current.push({ teamId: row.team_id, rank: row.rank_position });
    groupedThirdPlaceRankings.set(row.user_id, current);
  }

  return groupedThirdPlaceRankings;
}
