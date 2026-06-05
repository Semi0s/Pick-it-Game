import test from "node:test";
import assert from "node:assert/strict";
import {
  completeRankingSlotsForProjection,
  normalizeRankingSlotsForPersistence
} from "../lib/group-stage-ranking-slots.ts";

test("ranking slot normalization preserves a second-place-only selection", () => {
  assert.deepEqual(normalizeRankingSlotsForPersistence(["", "team-2"]), ["", "team-2"]);
});

test("ranking slot completion does not promote incomplete second-place slots", () => {
  assert.deepEqual(completeRankingSlotsForProjection(["", "team-2"], ["team-1", "team-2", "team-3", "team-4"]), [
    "",
    "team-2"
  ]);
});

test("ranking slot completion fills defaults only after first and second are explicit", () => {
  assert.deepEqual(completeRankingSlotsForProjection(["team-2", "team-1"], ["team-1", "team-2", "team-3", "team-4"]), [
    "team-2",
    "team-1",
    "team-3",
    "team-4"
  ]);
});
