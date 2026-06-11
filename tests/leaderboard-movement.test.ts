import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardScoringMovementSummary,
  createEmptyDashboardScoringMovementSummary,
  normalizeLeaderboardSnapshotHistory
} from "../lib/leaderboard-movement-helpers.ts";

test("dashboard scoring movement returns an empty state without snapshots", () => {
  assert.deepEqual(buildDashboardScoringMovementSummary([]), createEmptyDashboardScoringMovementSummary());
});

test("dashboard scoring history normalizes rows into chart-ready points", () => {
  const history = normalizeLeaderboardSnapshotHistory([
    {
      match_id: "m2",
      user_id: "user-1",
      rank: 11,
      total_points: 21,
      created_at: "2026-06-12T20:00:00.000Z"
    },
    {
      match_id: "m1",
      user_id: "user-1",
      rank: 14,
      total_points: 12,
      created_at: "2026-06-11T20:00:00.000Z"
    }
  ]);

  assert.deepEqual(history, [
    {
      matchId: "m1",
      createdAt: "2026-06-11T20:00:00.000Z",
      totalPoints: 12,
      rank: 14,
      pointsDelta: null,
      rankDelta: null
    },
    {
      matchId: "m2",
      createdAt: "2026-06-12T20:00:00.000Z",
      totalPoints: 21,
      rank: 11,
      pointsDelta: 9,
      rankDelta: 3
    }
  ]);
});

test("dashboard scoring movement compares against the latest prior day when available", () => {
  const summary = buildDashboardScoringMovementSummary([
    {
      match_id: "m1",
      user_id: "user-1",
      rank: 18,
      total_points: 8,
      created_at: "2026-06-10T18:00:00.000Z"
    },
    {
      match_id: "m2",
      user_id: "user-1",
      rank: 16,
      total_points: 13,
      created_at: "2026-06-11T09:00:00.000Z"
    },
    {
      match_id: "m3",
      user_id: "user-1",
      rank: 15,
      total_points: 15,
      created_at: "2026-06-11T21:00:00.000Z"
    }
  ]);

  assert.equal(summary.currentPoints, 15);
  assert.equal(summary.currentRank, 15);
  assert.equal(summary.previousPoints, 8);
  assert.equal(summary.previousRank, 18);
  assert.equal(summary.pointsChange, 7);
  assert.equal(summary.rankChange, 3);
  assert.equal(summary.comparisonMode, "previous_day");
});

test("dashboard scoring movement falls back to the previous snapshot when all history is same-day", () => {
  const summary = buildDashboardScoringMovementSummary([
    {
      match_id: "m1",
      user_id: "user-1",
      rank: 18,
      total_points: 8,
      created_at: "2026-06-11T09:00:00.000Z"
    },
    {
      match_id: "m2",
      user_id: "user-1",
      rank: 15,
      total_points: 14,
      created_at: "2026-06-11T21:00:00.000Z"
    }
  ]);

  assert.equal(summary.previousPoints, 8);
  assert.equal(summary.previousRank, 18);
  assert.equal(summary.pointsChange, 6);
  assert.equal(summary.rankChange, 3);
  assert.equal(summary.comparisonMode, "previous_snapshot");
});

test("dashboard scoring history dedupes rerun snapshots for the same match id", () => {
  const history = normalizeLeaderboardSnapshotHistory([
    {
      match_id: "m1",
      user_id: "user-1",
      rank: 18,
      total_points: 8,
      created_at: "2026-06-11T09:00:00.000Z"
    },
    {
      match_id: "m1",
      user_id: "user-1",
      rank: 17,
      total_points: 10,
      created_at: "2026-06-11T09:05:00.000Z"
    },
    {
      match_id: "m2",
      user_id: "user-1",
      rank: 14,
      total_points: 16,
      created_at: "2026-06-12T21:00:00.000Z"
    }
  ]);

  assert.equal(history.length, 2);
  assert.equal(history[0]?.matchId, "m1");
  assert.equal(history[0]?.totalPoints, 10);
  assert.equal(history[0]?.rank, 17);
});
