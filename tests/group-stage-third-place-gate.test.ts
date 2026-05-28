import assert from "node:assert/strict";
import test from "node:test";
import {
  getGroupTopTwoCompletionStatus,
  hasCompleteTopTwo
} from "../lib/group-stage-third-place-gate.ts";

test("third-place gate requires first and second place for every group", () => {
  const status = getGroupTopTwoCompletionStatus({
    groupNames: ["Group A", "Group B"],
    rankings: [
      { groupName: "Group A", rankedTeamIds: ["a1", "a2", "a3", "a4"] },
      { groupName: "Group B", rankedTeamIds: ["b1"] }
    ]
  });

  assert.equal(status.isComplete, false);
  assert.deepEqual(status.incompleteGroupNames, ["Group B"]);
  assert.deepEqual(Array.from(status.completeGroupNames), ["Group A"]);
});

test("third-place gate only counts touched groups as complete", () => {
  const status = getGroupTopTwoCompletionStatus({
    groupNames: ["Group A", "Group B"],
    rankings: [
      { groupName: "Group A", rankedTeamIds: ["a1", "a2", "a3", "a4"] },
      { groupName: "Group B", rankedTeamIds: ["b1", "b2", "b3", "b4"] }
    ],
    touchedGroupNames: new Set(["Group A"])
  });

  assert.equal(status.isComplete, false);
  assert.deepEqual(status.incompleteGroupNames, ["Group B"]);
});

test("third-place gate rejects duplicate or out-of-group top-two teams", () => {
  assert.equal(hasCompleteTopTwo(["a1", "a1"], new Set(["a1", "a2", "a3", "a4"])), false);
  assert.equal(hasCompleteTopTwo(["a1", "b2"], new Set(["a1", "a2", "a3", "a4"])), false);
  assert.equal(hasCompleteTopTwo(["a1", "a2"], new Set(["a1", "a2", "a3", "a4"])), true);
});
