import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnockoutPreviousMatchesByTargetId,
  resolveVisibleKnockoutTeamForSlot
} from "../lib/knockout-team-resolution.ts";

test("official knockout slot prefers seeded team over a stale feeder winner", () => {
  const resolved = resolveVisibleKnockoutTeamForSlot({
    mode: "official",
    seededTeamId: "can",
    resolvedSourceTeamId: "par",
    resolvedSource: "actual",
    projectedTeamId: null
  });

  assert.deepEqual(resolved, {
    teamId: "can",
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
