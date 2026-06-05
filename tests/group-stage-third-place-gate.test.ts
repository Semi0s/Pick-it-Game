import assert from "node:assert/strict";
import test from "node:test";
import {
  getGroupTopTwoCompletionStatus,
  hasCompleteTopTwo
} from "../lib/group-stage-third-place-gate.ts";
import {
  buildProjectedGroupStandingsFromSeedRankings,
  buildQualifiedTeamSeedsFromManualThirdPlaceRanking,
  buildUserProjectedRoundOf32
} from "../lib/knockout-seeding.ts";

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

test("projected bracket preview ignores stale third-place qualifier rows instead of crashing", () => {
  const groupLetters = "ABCDEFGHIJKL".split("");
  const teams = groupLetters.flatMap((groupLetter) =>
    [1, 2, 3, 4].map((seed) => ({
      id: `${groupLetter.toLowerCase()}${seed}`,
      name: `Group ${groupLetter} Team ${seed}`,
      shortName: `${groupLetter}${seed}`,
      groupName: `Group ${groupLetter}`,
      fifaRank: seed,
      fifaPoints: null,
      flagEmoji: ""
    }))
  );
  const rankings = groupLetters.map((groupLetter) => ({
    groupName: `Group ${groupLetter}`,
    rankedTeamIds:
      groupLetter === "A"
        ? ["a1", "a2", "a3", "a4"]
        : [1, 2, 3, 4].map((seed) => `${groupLetter.toLowerCase()}${seed}`)
  }));
  const standings = buildProjectedGroupStandingsFromSeedRankings(teams, rankings);
  const placeholders = Array.from({ length: 16 }, (_, index) => ({
    id: `M${73 + index}`,
    stage: "r32",
    status: "scheduled" as const,
    homeSource: null,
    awaySource: index < 8 ? `Best third-place ${index + 1}` : null,
    homeTeamId: null,
    awayTeamId: null
  }));
  const staleThirdPlaceIds = ["a4", "b3", "c3", "d3", "e3", "f3", "g3", "h3"];

  assert.throws(
    () =>
      buildQualifiedTeamSeedsFromManualThirdPlaceRanking(
        new Map(Array.from(standings.entries()).map(([groupId, group]) => [groupId, group.rows])),
        staleThirdPlaceIds,
        8
      ),
    /Only teams ranked 3rd/
  );

  const preview = buildUserProjectedRoundOf32({
    groupMatches: [],
    teams,
    predictions: [],
    roundOf32Placeholders: placeholders,
    standingsByGroupOverride: standings,
    rankedThirdPlaceTeamIdsOverride: staleThirdPlaceIds
  });

  assert.equal(preview.matches.length, 16);
  assert.equal(preview.matches.some((match) => match.home.teamId === "a4" || match.away.teamId === "a4"), false);
});
