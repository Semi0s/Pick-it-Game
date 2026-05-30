import test from "node:test";
import assert from "node:assert/strict";
import {
  hasCurrentUnsavedGroupStageDraft,
  parseUnsavedGroupStageDraft
} from "../lib/group-stage-unsaved-draft.ts";

test("group-stage unsaved draft parser ignores missing and invalid drafts", () => {
  assert.equal(parseUnsavedGroupStageDraft(null), null);
  assert.equal(parseUnsavedGroupStageDraft("not-json"), null);
  assert.equal(parseUnsavedGroupStageDraft(JSON.stringify({ groupRankings: [] })), null);
});

test("group-stage unsaved draft parser keeps valid rankings and filters empty values", () => {
  const parsed = parseUnsavedGroupStageDraft(
    JSON.stringify({
      groupRankings: [
        { groupName: "A", rankedTeamIds: ["team-1", "", "team-2"] },
        { groupName: "", rankedTeamIds: ["team-3"] }
      ],
      thirdPlaceRankings: ["team-2", "", "team-9"],
      touchedGroupNames: ["A", ""],
      hasTouchedThirdPlaceRanking: true,
      changedSinceAt: "2026-05-30T12:00:00.000Z"
    })
  );

  assert.deepEqual(parsed?.groupRankings, [
    { groupName: "A", rankedTeamIds: ["team-1", "team-2"] }
  ]);
  assert.deepEqual(parsed?.thirdPlaceRankings, ["team-2", "team-9"]);
  assert.deepEqual(parsed?.touchedGroupNames, ["A"]);
  assert.equal(parsed?.hasTouchedThirdPlaceRanking, true);
  assert.equal(parsed?.changedSinceAt, "2026-05-30T12:00:00.000Z");
});

test("group-stage unsaved draft warning only counts drafts newer than the last commit", () => {
  const draft = JSON.stringify({
    groupRankings: [{ groupName: "A", rankedTeamIds: ["team-1", "team-2"] }],
    thirdPlaceRankings: [],
    touchedGroupNames: ["A"],
    hasTouchedThirdPlaceRanking: false,
    changedSinceAt: "2026-05-30T12:00:00.000Z"
  });

  assert.equal(hasCurrentUnsavedGroupStageDraft(draft), true);
  assert.equal(
    hasCurrentUnsavedGroupStageDraft(draft, {
      lastCommittedAt: "2026-05-30T11:59:59.000Z"
    }),
    true
  );
  assert.equal(
    hasCurrentUnsavedGroupStageDraft(draft, {
      lastCommittedAt: "2026-05-30T12:00:00.000Z"
    }),
    false
  );
  assert.equal(
    hasCurrentUnsavedGroupStageDraft(draft, {
      lastCommittedAt: "2026-05-30T12:00:01.000Z"
    }),
    false
  );
});
