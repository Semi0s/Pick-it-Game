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
  pacePoints: number | null;
  rank: number;
  pointsDelta: number | null;
  rankDelta: number | null;
  paceDelta: number | null;
};

export type DashboardScoringMovementSummary = {
  currentPoints: number | null;
  currentRank: number | null;
  currentPacePoints: number | null;
  previousPoints: number | null;
  previousRank: number | null;
  previousPacePoints: number | null;
  pointsChange: number | null;
  rankChange: number | null;
  deltaFromPace: number | null;
  latestSnapshotAt: string | null;
  previousSnapshotAt: string | null;
  comparisonMode: "previous_day" | "previous_snapshot" | "none";
  history: DashboardScoringHistoryPoint[];
};

export function createEmptyDashboardScoringMovementSummary(): DashboardScoringMovementSummary {
  return {
    currentPoints: null,
    currentRank: null,
    currentPacePoints: null,
    previousPoints: null,
    previousRank: null,
    previousPacePoints: null,
    pointsChange: null,
    rankChange: null,
    deltaFromPace: null,
    latestSnapshotAt: null,
    previousSnapshotAt: null,
    comparisonMode: "none",
    history: []
  };
}

export function normalizeLeaderboardSnapshotHistory(
  rows: LeaderboardSnapshotHistoryRow[],
  paceByMatchId?: ReadonlyMap<string, number>
): DashboardScoringHistoryPoint[] {
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
    const pacePoints = paceByMatchId?.get(row.match_id) ?? null;
    return {
      matchId: row.match_id,
      createdAt: row.created_at,
      totalPoints: row.total_points,
      pacePoints,
      rank: row.rank,
      pointsDelta: previousRow ? row.total_points - previousRow.total_points : null,
      rankDelta: previousRow ? previousRow.rank - row.rank : null,
      paceDelta: pacePoints === null ? null : row.total_points - pacePoints
    };
  });
}

export function buildDashboardScoringMovementSummary(
  rows: LeaderboardSnapshotHistoryRow[],
  paceByMatchId?: ReadonlyMap<string, number>
): DashboardScoringMovementSummary {
  const history = normalizeLeaderboardSnapshotHistory(rows, paceByMatchId);
  const latestPoint = history.at(-1) ?? null;
  if (!latestPoint) {
    return createEmptyDashboardScoringMovementSummary();
  }

  const previousPoint = getPreferredComparisonPoint(history);

  return {
    currentPoints: latestPoint.totalPoints,
    currentRank: latestPoint.rank,
    currentPacePoints: latestPoint.pacePoints,
    previousPoints: previousPoint?.totalPoints ?? null,
    previousRank: previousPoint?.rank ?? null,
    previousPacePoints: previousPoint?.pacePoints ?? null,
    pointsChange: previousPoint ? latestPoint.totalPoints - previousPoint.totalPoints : null,
    rankChange: previousPoint ? previousPoint.rank - latestPoint.rank : null,
    deltaFromPace: latestPoint.paceDelta,
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
