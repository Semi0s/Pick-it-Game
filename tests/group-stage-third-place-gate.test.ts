import assert from "node:assert/strict";
import test from "node:test";
import {
  getGroupTopTwoCompletionStatus,
  hasCompleteTopTwo
} from "../lib/group-stage-third-place-gate.ts";
import { buildProjectedGroupStandingsFromSeedRankings } from "../lib/knockout-seeding.ts";

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

test("partial saved top-two rankings remain incomplete for projection", () => {
  const standings = buildProjectedGroupStandingsFromSeedRankings(
    [
      { id: "a1", name: "Alpha", shortName: "ALP", groupName: "Group A", fifaRank: 1, fifaPoints: null, flagEmoji: "" },
      { id: "a2", name: "Beta", shortName: "BET", groupName: "Group A", fifaRank: 2, fifaPoints: null, flagEmoji: "" },
      { id: "a3", name: "Gamma", shortName: "GAM", groupName: "Group A", fifaRank: 3, fifaPoints: null, flagEmoji: "" },
      { id: "a4", name: "Delta", shortName: "DEL", groupName: "Group A", fifaRank: 4, fifaPoints: null, flagEmoji: "" }
    ],
    [{ groupName: "Group A", rankedTeamIds: ["a1"] }]
  );

  const group = standings.get("Group A");
  assert.ok(group);
  assert.equal(group.isComplete, false);
  assert.deepEqual(
    group.rows.map((row) => row.rank),
    [0, 0, 0, 0]
  );
});
