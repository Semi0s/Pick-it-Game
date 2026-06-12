import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyDashboardScoringMovementSummary } from "../lib/leaderboard-movement-helpers.ts";
import {
  selectDashboardProjectedScoreSummary,
  shouldUseProjectedLeaderboardMode
} from "../lib/projected-leaderboard-mode.ts";

test("projected leaderboard mode is enabled only for group-phase leaderboard views", () => {
  assert.equal(
    shouldUseProjectedLeaderboardMode({
      requestedMode: "projected",
      projectedLeaderboardEnabled: true,
      phase: "group_phase",
      view: "global"
    }),
    true
  );

  assert.equal(
    shouldUseProjectedLeaderboardMode({
      requestedMode: "projected",
      projectedLeaderboardEnabled: true,
      phase: "knockout_phase",
      view: "global"
    }),
    false
  );

  assert.equal(
    shouldUseProjectedLeaderboardMode({
      requestedMode: "projected",
      projectedLeaderboardEnabled: true,
      phase: "group_phase",
      view: "teams"
    }),
    false
  );
});

test("projected leaderboard mode stays disabled when the app setting is off", () => {
  assert.equal(
    shouldUseProjectedLeaderboardMode({
      requestedMode: "projected",
      projectedLeaderboardEnabled: false,
      phase: "group_phase",
      view: "my_groups"
    }),
    false
  );
});

test("dashboard keeps official scoring when official history is meaningful", () => {
  const official = {
    ...createEmptyDashboardScoringMovementSummary(),
    currentPoints: 6,
    history: [
      {
        matchId: "g-1",
        createdAt: "2026-06-11T19:00:00.000Z",
        totalPoints: 6,
        pacePoints: 4,
        rank: 15,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 2
      }
    ]
  };
  const projected = {
    ...createEmptyDashboardScoringMovementSummary(),
    currentPoints: 8,
    history: [
      {
        matchId: "projection-1",
        createdAt: "2026-06-11T20:00:00.000Z",
        totalPoints: 8,
        pacePoints: 5,
        rank: 12,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 3
      }
    ]
  };

  const result = selectDashboardProjectedScoreSummary({
    official,
    projected,
    projectedLeaderboardEnabled: true
  });

  assert.equal(result.scoreKind, "official");
  assert.equal(result.score, official);
});

test("dashboard switches to projected scoring when official history is flat and projected history is meaningful", () => {
  const official = {
    ...createEmptyDashboardScoringMovementSummary(),
    currentPoints: 0,
    history: [
      {
        matchId: "g-1",
        createdAt: "2026-06-11T19:00:00.000Z",
        totalPoints: 0,
        pacePoints: 0,
        rank: 120,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 0
      }
    ]
  };
  const projected = {
    ...createEmptyDashboardScoringMovementSummary(),
    currentPoints: 4.5,
    history: [
      {
        matchId: "projection-1",
        createdAt: "2026-06-11T20:00:00.000Z",
        totalPoints: 4.5,
        pacePoints: 3.1,
        rank: 45,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 1.4
      }
    ]
  };

  const result = selectDashboardProjectedScoreSummary({
    official,
    projected,
    projectedLeaderboardEnabled: true
  });

  assert.equal(result.scoreKind, "projected");
  assert.equal(result.score, projected);
});

test("dashboard does not switch to projected scoring when the setting is disabled", () => {
  const official = createEmptyDashboardScoringMovementSummary();
  const projected = {
    ...createEmptyDashboardScoringMovementSummary(),
    currentPoints: 3,
    history: [
      {
        matchId: "projection-1",
        createdAt: "2026-06-11T20:00:00.000Z",
        totalPoints: 3,
        pacePoints: 2,
        rank: 30,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 1
      }
    ]
  };

  const result = selectDashboardProjectedScoreSummary({
    official,
    projected,
    projectedLeaderboardEnabled: false
  });

  assert.equal(result.scoreKind, "official");
  assert.equal(result.score, official);
});
