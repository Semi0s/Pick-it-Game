import test from "node:test";
import assert from "node:assert/strict";

import { getKnockoutReferenceBracketView } from "../lib/knockout-reference.ts";
import type { KnockoutBracketEditorView } from "../lib/bracket-predictions.ts";

function createView(mode: "official" | "projected", title: string): KnockoutBracketEditorView {
  return {
    mode,
    isSeeded: true,
    isLocked: true,
    lockReason: null,
    firstRoundOf32Kickoff: null,
    bracketPoints: 0,
    correctPicks: 0,
    stages: [],
    champion: null,
    thirdPlace: null,
    predictions: [],
    title,
    description: "",
    secondaryNote: null
  };
}

test("knockout reference bracket prefers archived projected comparison view", () => {
  const projectedChallengeView = createView("projected", "Projected Bracket");
  const projectedComparisonView = createView("projected", "Archived Projected Bracket");

  assert.equal(
    getKnockoutReferenceBracketView({
      projectedChallengeView,
      projectedComparisonView
    }),
    projectedComparisonView
  );
});

test("knockout reference bracket falls back to projected challenge view", () => {
  const projectedChallengeView = createView("projected", "Projected Bracket");

  assert.equal(
    getKnockoutReferenceBracketView({
      projectedChallengeView,
      projectedComparisonView: null
    }),
    projectedChallengeView
  );
});

test("knockout reference bracket returns null when no group-stage bracket exists", () => {
  assert.equal(
    getKnockoutReferenceBracketView({
      projectedChallengeView: null,
      projectedComparisonView: null
    }),
    null
  );
});
