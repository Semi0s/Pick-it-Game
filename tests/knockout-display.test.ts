import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowProjectedComparisonRound } from "../lib/knockout-display.ts";

test("projected comparison layout is allowed on R32 while the projected challenge is active", () => {
  assert.equal(
    shouldShowProjectedComparisonRound({
      currentStage: "r32",
      mode: "projected",
      projectedComparisonMatchCount: 0
    }),
    true
  );
});

test("projected comparison layout is allowed on official R32 when archived projected matches exist", () => {
  assert.equal(
    shouldShowProjectedComparisonRound({
      currentStage: "r32",
      mode: "official",
      projectedComparisonMatchCount: 8
    }),
    true
  );
});

test("projected comparison layout is removed from R16 and later official knockout rounds", () => {
  for (const stage of ["r16", "qf", "sf", "third", "final"] as const) {
    assert.equal(
      shouldShowProjectedComparisonRound({
        currentStage: stage,
        mode: "official",
        projectedComparisonMatchCount: 8
      }),
      false
    );
  }
});
