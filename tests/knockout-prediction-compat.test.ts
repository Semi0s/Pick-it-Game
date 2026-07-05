import test from "node:test";
import assert from "node:assert/strict";

import {
  getCompatibleKnockoutPredictionState,
  isKnockoutPredictionCompatibleWithMatchup
} from "../lib/knockout-prediction-compat.ts";

test("saved knockout prediction stays compatible when winner matches the visible matchup", () => {
  assert.equal(
    isKnockoutPredictionCompatibleWithMatchup({
      predictedWinnerTeamId: "can",
      homeTeamId: "can",
      awayTeamId: "mar"
    }),
    true
  );
});

test("saved knockout prediction becomes incompatible when the matchup changes", () => {
  assert.equal(
    isKnockoutPredictionCompatibleWithMatchup({
      predictedWinnerTeamId: "par",
      homeTeamId: "can",
      awayTeamId: "mar"
    }),
    false
  );
});

test("saved knockout prediction is incompatible until both matchup sides are visible", () => {
  assert.equal(
    isKnockoutPredictionCompatibleWithMatchup({
      predictedWinnerTeamId: "can",
      homeTeamId: "can",
      awayTeamId: null
    }),
    false
  );
});

test("compatible knockout prediction keeps its saved scores", () => {
  assert.deepEqual(
    getCompatibleKnockoutPredictionState({
      predictedWinnerTeamId: "can",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      homeTeamId: "can",
      awayTeamId: "mar"
    }),
    {
      isCompatible: true,
      predictedWinnerTeamId: "can",
      predictedHomeScore: 2,
      predictedAwayScore: 1
    }
  );
});

test("incompatible knockout prediction hides stale saved scores instead of reapplying them", () => {
  assert.deepEqual(
    getCompatibleKnockoutPredictionState({
      predictedWinnerTeamId: "par",
      predictedHomeScore: 2,
      predictedAwayScore: 1,
      homeTeamId: "can",
      awayTeamId: "mar"
    }),
    {
      isCompatible: false,
      predictedWinnerTeamId: null,
      predictedHomeScore: null,
      predictedAwayScore: null
    }
  );
});
