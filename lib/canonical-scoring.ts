import { assignDeterministicRanks, type LeaderboardComparable } from "./scoring-engine.ts";

export type CanonicalScoreSource =
  | "group_phase_ladder"
  | "knockout"
  | "side_pick"
  | "group_bonus";

export type CanonicalScoreScope = "standard" | "group_custom";

export type CanonicalScoreLineItem = {
  userId: string;
  source: CanonicalScoreSource;
  scope: CanonicalScoreScope;
  points: number;
  reasonKey: string;
  matchId?: string | null;
  groupId?: string | null;
  details?: Record<string, unknown>;
};

export type CanonicalUserScoreBreakdown = {
  userId: string;
  totalPoints: number;
  lineItems: CanonicalScoreLineItem[];
};

export type CanonicalLeaderboardScoreInput = {
  users: string[];
  groupPhaseScores?: Map<string, number>;
  knockoutScores?: Map<string, number>;
  standardSidePickScores?: Map<string, number>;
  groupCustomScores?: Map<string, number>;
  groupId?: string | null;
  includeGroupCustom?: boolean;
};

export type CanonicalLeaderboardEntry = LeaderboardComparable & {
  rank: number;
  breakdown: CanonicalUserScoreBreakdown;
};

export function calculateCanonicalUserScoreBreakdown(input: {
  userId: string;
  lineItems: CanonicalScoreLineItem[];
}): CanonicalUserScoreBreakdown {
  const lineItems = input.lineItems.map((lineItem) => ({
    ...lineItem,
    userId: lineItem.userId || input.userId,
    points: normalizeCanonicalPoints(lineItem.points)
  }));

  return {
    userId: input.userId,
    totalPoints: lineItems.reduce((sum, lineItem) => sum + lineItem.points, 0),
    lineItems
  };
}

export function calculateCanonicalLeaderboardScores(input: CanonicalLeaderboardScoreInput): CanonicalLeaderboardEntry[] {
  const uniqueUsers = Array.from(new Set(input.users.filter(Boolean)));
  const entries = uniqueUsers.map((userId) => {
    const lineItems: CanonicalScoreLineItem[] = [
      {
        userId,
        source: "group_phase_ladder",
        scope: "standard",
        points: input.groupPhaseScores?.get(userId) ?? 0,
        reasonKey: "scoring.groupPhaseLadder"
      },
      {
        userId,
        source: "knockout",
        scope: "standard",
        points: input.knockoutScores?.get(userId) ?? 0,
        reasonKey: "scoring.knockout"
      },
      {
        userId,
        source: "side_pick",
        scope: "standard",
        points: input.standardSidePickScores?.get(userId) ?? 0,
        reasonKey: "scoring.standardSidePicks"
      }
    ];

    if (input.includeGroupCustom) {
      lineItems.push({
        userId,
        source: "group_bonus",
        scope: "group_custom",
        groupId: input.groupId ?? null,
        points: input.groupCustomScores?.get(userId) ?? 0,
        reasonKey: "scoring.groupCustom"
      });
    }

    return calculateCanonicalUserScoreBreakdown({ userId, lineItems });
  });

  return assignDeterministicRanks(
    entries.map((entry) => ({
      user_id: entry.userId,
      total_points: entry.totalPoints,
      breakdown: entry
    }))
  );
}

export function assertCanonicalScoreBreakdownInvariant(breakdown: CanonicalUserScoreBreakdown) {
  const lineItemTotal = breakdown.lineItems.reduce((sum, lineItem) => sum + lineItem.points, 0);
  if (breakdown.totalPoints !== lineItemTotal) {
    throw new Error(
      `Canonical score invariant failed for ${breakdown.userId}: total ${breakdown.totalPoints} does not equal line item sum ${lineItemTotal}.`
    );
  }
}

export function sumScoreRowsByUser(rows: Array<{ user_id: string; points: number | null | undefined }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + normalizeCanonicalPoints(row.points ?? 0));
  }
  return totals;
}

function normalizeCanonicalPoints(points: number) {
  return Number.isFinite(points) ? Math.trunc(points) : 0;
}
