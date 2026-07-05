import test from "node:test";
import assert from "node:assert/strict";

import {
  getGlobalTopTenPoints,
  getGlobalTopTenTiebreakPoints,
  getLeaderboardPhaseStandardPoints
} from "../lib/leaderboard-phase-points.ts";

test("global top 10 official points exclude side picks", () => {
  assert.equal(
    getLeaderboardPhaseStandardPoints({
      phase: "global_top10",
      mode: "official",
      groupPhasePoints: 18,
      projectedGroupPhasePoints: 24,
      knockoutPhasePoints: 7,
      sidePickPoints: 11
    }),
    25
  );
});

test("global top 10 projected points exclude side picks", () => {
  assert.equal(
    getLeaderboardPhaseStandardPoints({
      phase: "global_top10",
      mode: "projected",
      groupPhasePoints: 18,
      projectedGroupPhasePoints: 24,
      knockoutPhasePoints: 7,
      sidePickPoints: 11
    }),
    31
  );
});

test("side picks phase still returns only side pick totals", () => {
  assert.equal(
    getLeaderboardPhaseStandardPoints({
      phase: "side_picks",
      mode: "official",
      groupPhasePoints: 18,
      projectedGroupPhasePoints: 24,
      knockoutPhasePoints: 7,
      sidePickPoints: 11
    }),
    11
  );
});

test("global top 10 display and tiebreak helpers ignore side picks", () => {
  assert.equal(
    getGlobalTopTenPoints({
      mode: "official",
      groupPhasePoints: 18,
      projectedGroupPhasePoints: 24,
      knockoutPhasePoints: 7,
      sidePickPoints: 11
    }),
    25
  );

  assert.equal(
    getGlobalTopTenTiebreakPoints({
      mode: "projected",
      groupPhasePoints: 18,
      projectedGroupPhasePoints: 24,
      knockoutPhasePoints: 7,
      sidePickPoints: 11
    }),
    25
  );
});
