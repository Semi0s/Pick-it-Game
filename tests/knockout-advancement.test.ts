import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldClearKnockoutParticipants,
  shouldClearKnockoutScoresForParticipantChange
} from "../lib/knockout-advancement-logic.ts";

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

test("knockout score rows stay intact when rebuilt participants end where they started", () => {
  assert.equal(
    shouldClearKnockoutScoresForParticipantChange({
      status: "scheduled",
      beforeHomeTeamId: "can",
      beforeAwayTeamId: "mar",
      afterHomeTeamId: "can",
      afterAwayTeamId: "mar"
    }),
    false
  );
});

test("knockout score rows clear when a rebuilt pairing actually changes", () => {
  assert.equal(
    shouldClearKnockoutScoresForParticipantChange({
      status: "scheduled",
      beforeHomeTeamId: "can",
      beforeAwayTeamId: "par",
      afterHomeTeamId: "can",
      afterAwayTeamId: "mar"
    }),
    true
  );
});

test("finalized matches never clear scores during participant repair", () => {
  assert.equal(
    shouldClearKnockoutScoresForParticipantChange({
      status: "final",
      beforeHomeTeamId: "can",
      beforeAwayTeamId: "par",
      afterHomeTeamId: "can",
      afterAwayTeamId: "mar"
    }),
    false
  );
});
