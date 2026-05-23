import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_PHASE_GROUP_MAX_POINTS,
  scoreGroupPhaseGroupPrediction,
  scoreGroupPhaseSnapshot
} from "../lib/group-phase-scoring.ts";

test("group phase group prediction awards the full 14-point ladder when everything is correct", () => {
  const result = scoreGroupPhaseGroupPrediction({
    actual: {
      groupName: "Group A",
      rankedTeamIds: ["a1", "a2", "a3", "a4"],
      thirdPlaceQualified: true
    },
    predictedRankedTeamIds: ["a1", "a2", "a3", "a4"],
    predictedThirdPlaceQualified: true
  });

  assert.equal(result.totalPoints, GROUP_PHASE_GROUP_MAX_POINTS);
  assert.equal(result.winnerPoints, 5);
  assert.equal(result.runnerUpPoints, 3);
  assert.equal(result.thirdPlacePoints, 2);
  assert.equal(result.topTwoAnyOrderBonus, 1);
  assert.equal(result.thirdPlaceQualificationPoints, 1);
  assert.equal(result.completeLadderBonus, 2);
});

test("group phase ladder awards top-two any-order bonus without full-order bonus", () => {
  const result = scoreGroupPhaseGroupPrediction({
    actual: {
      groupName: "Group B",
      rankedTeamIds: ["b1", "b2", "b3", "b4"],
      thirdPlaceQualified: false
    },
    predictedRankedTeamIds: ["b2", "b1", "b3", "b4"],
    predictedThirdPlaceQualified: false
  });

  assert.equal(result.winnerPoints, 0);
  assert.equal(result.runnerUpPoints, 0);
  assert.equal(result.thirdPlacePoints, 2);
  assert.equal(result.topTwoAnyOrderBonus, 1);
  assert.equal(result.completeLadderBonus, 0);
  assert.equal(result.thirdPlaceQualificationPoints, 1);
  assert.equal(result.totalPoints, 4);
});

test("group phase snapshot scoring totals multiple groups with third-place qualifier selections", () => {
  const summary = scoreGroupPhaseSnapshot({
    snapshot: {
      groupRankings: [
        { groupName: "Group A", rankedTeamIds: ["a1", "a2", "a3", "a4"] },
        { groupName: "Group B", rankedTeamIds: ["b2", "b1", "b3", "b4"] }
      ],
      thirdPlaceRankings: [
        { teamId: "a3", rank: 1 },
        { teamId: "b3", rank: 2 }
      ]
    },
    actualOutcomes: [
      { groupName: "Group A", rankedTeamIds: ["a1", "a2", "a3", "a4"], thirdPlaceQualified: true },
      { groupName: "Group B", rankedTeamIds: ["b1", "b2", "b3", "b4"], thirdPlaceQualified: false }
    ],
    requiredThirdPlaceQualifierCount: 1
  });

  assert.equal(summary.maxPoints, 28);
  assert.equal(summary.totalPoints, 18);
});
