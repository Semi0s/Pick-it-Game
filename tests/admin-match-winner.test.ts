import test from "node:test";
import assert from "node:assert/strict";

import {
  hasAdminWinnerScoreConflict,
  requiresAdminKnockoutTiebreakWinner,
  resolveAdminMatchWinnerTeamId
} from "../lib/admin-match-winner.ts";

test("group-stage tied admin score resolves to draw without a winner", () => {
  const winnerTeamId = resolveAdminMatchWinnerTeamId({
    stage: "group",
    homeScore: "1",
    awayScore: "1",
    homeTeamId: "ger",
    awayTeamId: "par"
  });

  assert.equal(winnerTeamId, null);
});

test("knockout tied admin score uses explicit tie-break winner", () => {
  const winnerTeamId = resolveAdminMatchWinnerTeamId({
    stage: "r32",
    homeScore: "1",
    awayScore: "1",
    homeTeamId: "ger",
    awayTeamId: "par",
    tiedWinnerTeamId: "ger"
  });

  assert.equal(winnerTeamId, "ger");
});

test("knockout tied final requires an explicit tie-break winner", () => {
  assert.equal(
    requiresAdminKnockoutTiebreakWinner({
      stage: "r32",
      status: "final",
      homeScore: "1",
      awayScore: "1",
      winnerTeamId: null
    }),
    true
  );
});

test("knockout tied non-final can stay unset while the match is still open", () => {
  assert.equal(
    requiresAdminKnockoutTiebreakWinner({
      stage: "r32",
      status: "live",
      homeScore: "1",
      awayScore: "1",
      winnerTeamId: null
    }),
    false
  );
});

test("knockout tied score with explicit winner does not produce a winner-score conflict", () => {
  assert.equal(
    hasAdminWinnerScoreConflict({
      stage: "r32",
      homeScore: 1,
      awayScore: 1,
      homeTeamId: "par",
      awayTeamId: "ger",
      winnerTeamId: "ger"
    }),
    false
  );
});

test("group-stage tied score with a winner still produces a winner-score conflict", () => {
  assert.equal(
    hasAdminWinnerScoreConflict({
      stage: "group",
      homeScore: 1,
      awayScore: 1,
      homeTeamId: "par",
      awayTeamId: "ger",
      winnerTeamId: "ger"
    }),
    true
  );
});
