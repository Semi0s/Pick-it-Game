export type LeaderboardSnapshotHistoryRow = {
  match_id: string;
  user_id: string;
  scope_type?: "global" | "group";
  group_id?: string | null;
  rank: number;
  total_points: number;
  created_at: string;
};

export type DashboardScoringHistoryPoint = {
  matchId: string;
  createdAt: string;
  totalPoints: number;
  rank: number;
  pointsDelta: number | null;
  rankDelta: number | null;
};

export type DashboardScoringMovementSummary = {
  currentPoints: number | null;
  currentRank: number | null;
  previousPoints: number | null;
  previousRank: number | null;
  pointsChange: number | null;
  rankChange: number | null;
  latestSnapshotAt: string | null;
  previousSnapshotAt: string | null;
  comparisonMode: "previous_day" | "previous_snapshot" | "none";
  history: DashboardScoringHistoryPoint[];
};

export function createEmptyDashboardScoringMovementSummary(): DashboardScoringMovementSummary {
  return {
    currentPoints: null,
    currentRank: null,
    previousPoints: null,
    previousRank: null,
    pointsChange: null,
    rankChange: null,
    latestSnapshotAt: null,
    previousSnapshotAt: null,
    comparisonMode: "none",
    history: []
  };
}

export function normalizeLeaderboardSnapshotHistory(rows: LeaderboardSnapshotHistoryRow[]): DashboardScoringHistoryPoint[] {
  if (rows.length === 0) {
    return [];
  }

  const latestRowByMatchId = new Map<string, LeaderboardSnapshotHistoryRow>();
  for (const row of rows) {
    const existing = latestRowByMatchId.get(row.match_id);
    if (!existing || new Date(row.created_at).getTime() >= new Date(existing.created_at).getTime()) {
      latestRowByMatchId.set(row.match_id, row);
    }
  }

  const normalizedRows = Array.from(latestRowByMatchId.values()).sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  );

  return normalizedRows.map((row, index) => {
    const previousRow = normalizedRows[index - 1] ?? null;
    return {
      matchId: row.match_id,
      createdAt: row.created_at,
      totalPoints: row.total_points,
      rank: row.rank,
      pointsDelta: previousRow ? row.total_points - previousRow.total_points : null,
      rankDelta: previousRow ? previousRow.rank - row.rank : null
    };
  });
}

export function buildDashboardScoringMovementSummary(
  rows: LeaderboardSnapshotHistoryRow[]
): DashboardScoringMovementSummary {
  const history = normalizeLeaderboardSnapshotHistory(rows);
  const latestPoint = history.at(-1) ?? null;
  if (!latestPoint) {
    return createEmptyDashboardScoringMovementSummary();
  }

  const previousPoint = getPreferredComparisonPoint(history);

  return {
    currentPoints: latestPoint.totalPoints,
    currentRank: latestPoint.rank,
    previousPoints: previousPoint?.totalPoints ?? null,
    previousRank: previousPoint?.rank ?? null,
    pointsChange: previousPoint ? latestPoint.totalPoints - previousPoint.totalPoints : null,
    rankChange: previousPoint ? previousPoint.rank - latestPoint.rank : null,
    latestSnapshotAt: latestPoint.createdAt,
    previousSnapshotAt: previousPoint?.createdAt ?? null,
    comparisonMode: previousPoint ? getComparisonMode(latestPoint, previousPoint) : "none",
    history
  };
}

function getPreferredComparisonPoint(history: DashboardScoringHistoryPoint[]) {
  const latestPoint = history.at(-1) ?? null;
  if (!latestPoint) {
    return null;
  }

  const latestDayKey = latestPoint.createdAt.slice(0, 10);
  const previousDayPoints = history.filter((point) => point.createdAt.slice(0, 10) < latestDayKey);
  if (previousDayPoints.length > 0) {
    return previousDayPoints.at(-1) ?? null;
  }

  return history.length > 1 ? history.at(-2) ?? null : null;
}

function getComparisonMode(
  latestPoint: DashboardScoringHistoryPoint,
  previousPoint: DashboardScoringHistoryPoint
): DashboardScoringMovementSummary["comparisonMode"] {
  return latestPoint.createdAt.slice(0, 10) !== previousPoint.createdAt.slice(0, 10)
    ? "previous_day"
    : "previous_snapshot";
}
