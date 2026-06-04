import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseProjectedKnockoutSource,
  hasScorePredictionInputs
} from "../lib/projected-knockout-source-utils.ts";

test("projected knockout source falls back to score predictions for legacy players without seed-builder resolution", () => {
  assert.equal(
    chooseProjectedKnockoutSource({
      preferredSource: "seed_builder",
      seedResolvedSideCount: 0,
      scoreResolvedSideCount: 16
    }),
    "score_predictions"
  );
});

test("projected knockout source keeps seed builder when it resolves projected sides", () => {
  assert.equal(
    chooseProjectedKnockoutSource({
      preferredSource: "seed_builder",
      seedResolvedSideCount: 16,
      scoreResolvedSideCount: 16
    }),
    "seed_builder"
  );
});

test("projected knockout source honors score preference when score predictions resolve sides", () => {
  assert.equal(
    chooseProjectedKnockoutSource({
      preferredSource: "score_predictions",
      seedResolvedSideCount: 16,
      scoreResolvedSideCount: 8
    }),
    "score_predictions"
  );
});

test("projected knockout source falls back to seed builder when preferred score predictions are unavailable", () => {
  assert.equal(
    chooseProjectedKnockoutSource({
      preferredSource: "score_predictions",
      seedResolvedSideCount: 16,
      scoreResolvedSideCount: 0
    }),
    "seed_builder"
  );
});

test("score prediction availability requires both home and away scores", () => {
  assert.equal(hasScorePredictionInputs([{ matchId: "m1", predictedHomeScore: 1, predictedAwayScore: 0 }]), true);
  assert.equal(hasScorePredictionInputs([{ matchId: "m1", predictedHomeScore: 1, predictedAwayScore: null }]), false);
});
