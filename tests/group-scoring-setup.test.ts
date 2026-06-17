import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScoringSetupDateOptions,
  LEGACY_GROUP_STAGE_MAX_DUE_DATE,
  resolveLegacyScoringSetupDueDates
} from "../lib/group-scoring-setup.ts";

test("buildScoringSetupDateOptions returns the future range while a phase is still open", () => {
  const options = buildScoringSetupDateOptions("2026-06-28T00:00:00.000Z", new Date("2026-06-17T12:00:00.000Z"));

  assert.equal(options[0]?.value, "2026-06-18");
  assert.equal(options.at(-1)?.value, "2026-06-28");
});

test("buildScoringSetupDateOptions falls back to the official deadline after the window has passed", () => {
  const options = buildScoringSetupDateOptions(LEGACY_GROUP_STAGE_MAX_DUE_DATE, new Date("2026-06-17T12:00:00.000Z"));

  assert.deepEqual(options, [{ value: "2026-06-13", label: "Jun 13" }]);
});

test("resolveLegacyScoringSetupDueDates clamps the group-stage deadline after it has passed", () => {
  const result = resolveLegacyScoringSetupDueDates({
    groupStagePicksDueAt: "2026-06-13",
    knockoutPicksDueAt: "2026-06-28",
    now: new Date("2026-06-17T12:00:00.000Z"),
    groupStageDeadlineIso: LEGACY_GROUP_STAGE_MAX_DUE_DATE,
    knockoutDeadlineIso: "2026-06-28T00:00:00.000Z"
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.groupStageDueAt.toISOString(), "2026-06-13T00:00:00.000Z");
  assert.equal(result.knockoutDueAt.toISOString(), "2026-06-28T00:00:00.000Z");
});

test("resolveLegacyScoringSetupDueDates still rejects knockout deadlines beyond the phase start while it is upcoming", () => {
  const result = resolveLegacyScoringSetupDueDates({
    groupStagePicksDueAt: "2026-06-13",
    knockoutPicksDueAt: "2026-06-29",
    now: new Date("2026-06-17T12:00:00.000Z"),
    groupStageDeadlineIso: LEGACY_GROUP_STAGE_MAX_DUE_DATE,
    knockoutDeadlineIso: "2026-06-28T00:00:00.000Z"
  });

  assert.deepEqual(result, {
    ok: false,
    message: "Knockout picks due date must be on or before the start of the knockout phase."
  });
});
