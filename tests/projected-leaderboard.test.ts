import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyDashboardScoringMovementSummary } from "../lib/leaderboard-movement-helpers.ts";
import {
  buildProjectedGlobalHistoryCheckpointStates,
  buildProjectedLeaderboardSnapshotInsertRows
} from "../lib/projected-leaderboard.ts";
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

test("projected history checkpoints replay group results in order and preserve a pre state", () => {
  const states = buildProjectedGlobalHistoryCheckpointStates(
    [
      {
        id: "g-01",
        stage: "group",
        group_name: "Group A",
        status: "final",
        home_team_id: "mex",
        away_team_id: "rsa",
        home_score: 2,
        away_score: 0,
        kickoff_time: "2026-06-11T19:00:00.000Z"
      },
      {
        id: "g-02",
        stage: "group",
        group_name: "Group B",
        status: "final",
        home_team_id: "sui",
        away_team_id: "can",
        home_score: 1,
        away_score: 1,
        kickoff_time: "2026-06-12T19:00:00.000Z"
      },
      {
        id: "g-03",
        stage: "group",
        group_name: "Group C",
        status: "scheduled",
        home_team_id: "bra",
        away_team_id: "mar",
        home_score: null,
        away_score: null,
        kickoff_time: "2026-06-13T19:00:00.000Z"
      }
    ],
    new Map([
      ["g-01", "2026-06-11T21:05:00.000Z"],
      ["g-02", "2026-06-12T21:10:00.000Z"]
    ])
  );

  assert.equal(states.length, 3);
  assert.equal(states[0]?.projectionKey, "group:g-01:pre");
  assert.equal(states[0]?.createdAt, "2026-06-11T18:59:00.000Z");
  assert.equal(states[1]?.projectionKey, "group:g-01");
  assert.equal(states[1]?.createdAt, "2026-06-11T21:05:00.000Z");
  assert.equal(states[2]?.projectionKey, "group:g-02");
  assert.equal(states[2]?.createdAt, "2026-06-12T21:10:00.000Z");
});

test("projected history checkpoints reset future group matches until their result checkpoint arrives", () => {
  const states = buildProjectedGlobalHistoryCheckpointStates([
    {
      id: "g-01",
      stage: "group",
      group_name: "Group A",
      status: "final",
      home_team_id: "mex",
      away_team_id: "rsa",
      home_score: 2,
      away_score: 0,
      kickoff_time: "2026-06-11T19:00:00.000Z"
    },
    {
      id: "g-02",
      stage: "group",
      group_name: "Group B",
      status: "final",
      home_team_id: "sui",
      away_team_id: "can",
      home_score: 1,
      away_score: 1,
      kickoff_time: "2026-06-12T19:00:00.000Z"
    }
  ]);

  const afterFirstResult = states[1]?.matches.find((match) => match.id === "g-02");
  const afterSecondResult = states[2]?.matches.find((match) => match.id === "g-02");

  assert.equal(afterFirstResult?.status, "scheduled");
  assert.equal(afterFirstResult?.home_score, null);
  assert.equal(afterFirstResult?.away_score, null);

  assert.equal(afterSecondResult?.status, "final");
  assert.equal(afterSecondResult?.home_score, 1);
  assert.equal(afterSecondResult?.away_score, 1);
});

test("projected snapshot insert rows omit created_at when no checkpoint timestamp is provided", () => {
  const rows = buildProjectedLeaderboardSnapshotInsertRows({
    scopeType: "global",
    projectionKey: "group:g-01",
    createdAt: null,
    rankedEntries: [{ user_id: "user-1", rank: 1, total_points: 121.234 }]
  });

  assert.equal(rows.length, 1);
  assert.equal("created_at" in rows[0]!, false);
  assert.equal(rows[0]?.projected_points, 121.234);
});

test("projected snapshot insert rows include created_at when a checkpoint timestamp exists", () => {
  const rows = buildProjectedLeaderboardSnapshotInsertRows({
    scopeType: "group",
    groupId: "group-1",
    projectionKey: "group:g-02",
    createdAt: "2026-06-18T14:00:00.000Z",
    rankedEntries: [{ user_id: "user-2", rank: 3, total_points: 99.5 }]
  });

  assert.equal(rows[0]?.created_at, "2026-06-18T14:00:00.000Z");
  assert.equal(rows[0]?.group_id, "group-1");
});
