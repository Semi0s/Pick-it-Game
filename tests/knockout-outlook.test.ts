import test from "node:test";
import assert from "node:assert/strict";

import { buildKnockoutOutlookSummary } from "../lib/knockout-outlook.ts";
import type { ManagedGroupRulesetSummary } from "../lib/scoped-scoring.ts";

test("knockout outlook compares projected R32 sides against official seeded teams", () => {
  const summary = buildKnockoutOutlookSummary({
    matches: [
      {
        id: "r32-01",
        stage: "r32",
        status: "scheduled",
        kickoffTime: "2026-06-28T13:00:00.000Z",
        homeTeamId: "rsa",
        awayTeamId: "can"
      },
      {
        id: "r32-02",
        stage: "r32",
        status: "scheduled",
        kickoffTime: "2026-06-28T16:00:00.000Z",
        homeTeamId: "ger",
        awayTeamId: "par"
      }
    ],
    savedPredictionMatchIds: [],
    projectedComparison: {
      projectedSeeds: {
        resolvedSideCount: 4,
        matches: [
          {
            matchId: "r32-01",
            home: { teamId: "rsa" },
            away: { teamId: "can" }
          },
          {
            matchId: "r32-02",
            home: { teamId: "ger" },
            away: { teamId: "gha" }
          }
        ]
      }
    },
    officialRoundOf32Matches: [
      { id: "r32-01", homeTeamId: "rsa", awayTeamId: "can" },
      { id: "r32-02", homeTeamId: "ger", awayTeamId: "par" }
    ]
  });

  assert.ok(summary.projection);
  assert.equal(summary.projection?.comparedSides, 4);
  assert.equal(summary.projection?.hitSides, 3);
  assert.equal(summary.projection?.missSides, 1);
  assert.equal(summary.projection?.matchedRoundOf32Matches, 1);
});

test("knockout outlook selects the nearest future group knockout deadline", () => {
  const groupRulesets = new Map<string, ManagedGroupRulesetSummary>([
    [
      "group-past",
      {
        groupId: "group-past",
        knockoutPicksDueAt: "2026-06-28T12:00:00.000Z"
      } as ManagedGroupRulesetSummary
    ],
    [
      "group-soon",
      {
        groupId: "group-soon",
        knockoutPicksDueAt: "2026-06-30T12:00:00.000Z"
      } as ManagedGroupRulesetSummary
    ],
    [
      "group-later",
      {
        groupId: "group-later",
        knockoutPicksDueAt: "2026-07-02T12:00:00.000Z"
      } as ManagedGroupRulesetSummary
    ]
  ]);

  const summary = buildKnockoutOutlookSummary({
    matches: [],
    savedPredictionMatchIds: [],
    groupSummaries: [
      { id: "group-past", name: "Past Group" },
      { id: "group-soon", name: "Soon Group" },
      { id: "group-later", name: "Later Group" }
    ],
    groupRulesets,
    now: Date.parse("2026-06-29T12:00:00.000Z")
  });

  assert.equal(summary.nearestGroupDeadline?.groupId, "group-soon");
  assert.equal(summary.nearestGroupDeadline?.groupName, "Soon Group");
});

test("knockout outlook marks waiting rounds and open saved rounds correctly", () => {
  const summary = buildKnockoutOutlookSummary({
    matches: [
      {
        id: "r32-01",
        stage: "r32",
        status: "scheduled",
        kickoffTime: "2026-06-28T13:00:00.000Z",
        homeTeamId: "rsa",
        awayTeamId: "can"
      },
      {
        id: "r32-02",
        stage: "r32",
        status: "scheduled",
        kickoffTime: "2026-06-28T16:00:00.000Z",
        homeTeamId: "ger",
        awayTeamId: "par"
      },
      {
        id: "qf-01",
        stage: "qf",
        status: "scheduled",
        kickoffTime: "2026-07-04T16:00:00.000Z",
        homeTeamId: null,
        awayTeamId: null
      }
    ],
    savedPredictionMatchIds: ["r32-01", "r32-02"]
  });

  const r32 = summary.rounds.find((round) => round.stage === "r32");
  const qf = summary.rounds.find((round) => round.stage === "qf");

  assert.equal(r32?.status, "saved");
  assert.equal(r32?.savedMatches, 2);
  assert.equal(qf?.status, "waiting");
});

test("knockout outlook includes the third-place round when it is the next open official pick", () => {
  const summary = buildKnockoutOutlookSummary({
    matches: [
      {
        id: "sf-01",
        stage: "sf",
        status: "final",
        kickoffTime: "2026-07-14T19:00:00.000Z",
        homeTeamId: "bra",
        awayTeamId: "can"
      },
      {
        id: "sf-02",
        stage: "sf",
        status: "final",
        kickoffTime: "2026-07-15T19:00:00.000Z",
        homeTeamId: "fra",
        awayTeamId: "nor"
      },
      {
        id: "third-01",
        stage: "third",
        status: "scheduled",
        kickoffTime: "2026-07-17T16:00:00.000Z",
        homeTeamId: "can",
        awayTeamId: "fra"
      },
      {
        id: "final-01",
        stage: "final",
        status: "scheduled",
        kickoffTime: "2026-07-19T19:00:00.000Z",
        homeTeamId: "bra",
        awayTeamId: "nor"
      }
    ],
    savedPredictionMatchIds: []
  });

  const third = summary.rounds.find((round) => round.stage === "third");
  const final = summary.rounds.find((round) => round.stage === "final");

  assert.equal(summary.nextOpenStage, "third");
  assert.equal(third?.status, "open");
  assert.equal(third?.savedMatches, 0);
  assert.equal(third?.totalMatches, 1);
  assert.equal(final?.status, "open");
});
