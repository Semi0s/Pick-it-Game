import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnockoutPreviousMatchesByTargetId,
  parseKnockoutSourceLabel,
  resolveKnockoutSourceTeam,
  resolveVisibleKnockoutTeamForSlot
} from "../lib/knockout-team-resolution.ts";

test("official knockout slot prefers a finalized feeder winner over a stale seeded team", () => {
  const resolved = resolveVisibleKnockoutTeamForSlot({
    mode: "official",
    seededTeamId: "can",
    resolvedSourceTeamId: "par",
    resolvedSource: "actual",
    projectedTeamId: null
  });

  assert.deepEqual(resolved, {
    teamId: "par",
    resolutionSource: "actual"
  });
});

test("official knockout slot still falls back to feeder winner when no seeded team exists", () => {
  const resolved = resolveVisibleKnockoutTeamForSlot({
    mode: "official",
    seededTeamId: null,
    resolvedSourceTeamId: "mar",
    resolvedSource: "actual",
    projectedTeamId: null
  });

  assert.deepEqual(resolved, {
    teamId: "mar",
    resolutionSource: "actual"
  });
});

test("official knockout slot still uses the seeded team when the feeder is not final", () => {
  const resolved = resolveVisibleKnockoutTeamForSlot({
    mode: "official",
    seededTeamId: "can",
    resolvedSourceTeamId: "par",
    resolvedSource: "prediction",
    projectedTeamId: null
  });

  assert.deepEqual(resolved, {
    teamId: "can",
    resolutionSource: "actual"
  });
});

test("projected knockout slot still prefers resolved projected path over seeded team", () => {
  const resolved = resolveVisibleKnockoutTeamForSlot({
    mode: "projected",
    seededTeamId: "can",
    resolvedSourceTeamId: "mar",
    resolvedSource: "prediction",
    projectedTeamId: null
  });

  assert.deepEqual(resolved, {
    teamId: "mar",
    resolutionSource: "prediction"
  });
});

test("canonical knockout sources override stale next-match wiring when resolving feeders", () => {
  const previousMatchesByTargetId = buildKnockoutPreviousMatchesByTargetId([
    {
      id: "r32-01",
      next_match_id: "M90",
      next_match_slot: "home"
    },
    {
      id: "r32-02",
      next_match_id: "M89",
      next_match_slot: "home"
    },
    {
      id: "r32-03",
      next_match_id: "M90",
      next_match_slot: "away"
    },
    {
      id: "r32-05",
      next_match_id: "M89",
      next_match_slot: "away"
    },
    {
      id: "r16-01",
      home_source: null,
      away_source: null
    },
    {
      id: "r16-02",
      home_source: null,
      away_source: null
    }
  ]);

  const roundOf16MatchOne = previousMatchesByTargetId.get("r16-01") ?? [];
  const roundOf16MatchTwo = previousMatchesByTargetId.get("r16-02") ?? [];

  assert.deepEqual(
    roundOf16MatchOne.map((match) => ({
      id: match.id,
      slot: match.next_match_slot
    })),
    [
      { id: "r32-02", slot: "home" },
      { id: "r32-05", slot: "away" }
    ]
  );
  assert.deepEqual(
    roundOf16MatchTwo.map((match) => ({
      id: match.id,
      slot: match.next_match_slot
    })),
    [
      { id: "r32-01", slot: "home" },
      { id: "r32-03", slot: "away" }
    ]
  );
});

test("knockout source parser recognizes loser labels for third-place mapping", () => {
  assert.deepEqual(parseKnockoutSourceLabel("Loser of M101"), {
    matchId: "M101",
    outcome: "loser"
  });
});

test("knockout source team resolves semifinal losers for the third-place match", () => {
  const resolved = resolveKnockoutSourceTeam({
    sourceMatch: {
      id: "sf-01",
      status: "final",
      home_team_id: "can",
      away_team_id: "mar",
      winner_team_id: "can"
    },
    sourceLabel: "Loser of sf-01",
    mode: "official"
  });

  assert.deepEqual(resolved, {
    teamId: "mar",
    source: "actual"
  });
});

test("projected knockout source team can infer a predicted loser when the feeder is not final", () => {
  const resolved = resolveKnockoutSourceTeam({
    sourceMatch: {
      id: "sf-02",
      status: "scheduled",
      home_team_id: "bra",
      away_team_id: "nor",
      winner_team_id: null
    },
    sourceLabel: "Loser of sf-02",
    predictionsByMatchId: new Map([
      ["sf-02", { predictedWinnerTeamId: "bra" }]
    ]),
    mode: "projected"
  });

  assert.deepEqual(resolved, {
    teamId: "nor",
    source: "prediction"
  });
});
