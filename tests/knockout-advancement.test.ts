import test from "node:test";
import assert from "node:assert/strict";

import { shouldClearKnockoutParticipants } from "../lib/knockout-advancement-logic.ts";

test("round of 32 participants are preserved while the match is still upcoming", () => {
  assert.equal(
    shouldClearKnockoutParticipants({
      stage: "r32",
      status: "scheduled"
    }),
    false
  );
});

test("alias round_of_32 participants are preserved while the match is still upcoming", () => {
  assert.equal(
    shouldClearKnockoutParticipants({
      stage: "round_of_32",
      status: "locked"
    }),
    false
  );
});

test("non-final downstream knockout rounds are rebuilt from prior winners", () => {
  assert.equal(
    shouldClearKnockoutParticipants({
      stage: "r16",
      status: "scheduled"
    }),
    true
  );
});

test("final knockout matches are never cleared", () => {
  assert.equal(
    shouldClearKnockoutParticipants({
      stage: "qf",
      status: "final"
    }),
    false
  );
});
