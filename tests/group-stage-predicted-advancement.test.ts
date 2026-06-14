import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPredictedAdvancementByTeamId,
  type PredictedAdvancementSnapshot
} from "../lib/group-stage-predicted-advancement.ts";

function buildSnapshot(): PredictedAdvancementSnapshot {
  return {
    groupRankings: [
      {
        groupName: "Group B",
        rankedTeamIds: ["sui", "can", "qat", "bih"]
      },
      {
        groupName: "Group D",
        rankedTeamIds: ["usa", "aus", "tur", "par"]
      }
    ],
    thirdPlaceRankings: [
      { teamId: "tur", rank: 1 }
    ]
  };
}

test("predicted advancement marks first-place team as advancing", () => {
  const decorations = buildPredictedAdvancementByTeamId(buildSnapshot());

  assert.deepEqual(decorations.get("sui"), {
    isPredictedToAdvance: true,
    predictedGroupId: "B",
    predictedGroupRank: 1,
    predictedThirdPlaceRank: undefined
  });
});

test("predicted advancement marks second-place team as advancing", () => {
  const decorations = buildPredictedAdvancementByTeamId(buildSnapshot());

  assert.deepEqual(decorations.get("can"), {
    isPredictedToAdvance: true,
    predictedGroupId: "B",
    predictedGroupRank: 2,
    predictedThirdPlaceRank: undefined
  });
});

test("predicted advancement marks third-place team as advancing only when selected in third-place rankings", () => {
  const decorations = buildPredictedAdvancementByTeamId(buildSnapshot());

  assert.deepEqual(decorations.get("tur"), {
    isPredictedToAdvance: true,
    predictedGroupId: "D",
    predictedGroupRank: 3,
    predictedThirdPlaceRank: 1
  });
});

test("predicted advancement keeps third-place team unhighlighted when absent from third-place rankings", () => {
  const decorations = buildPredictedAdvancementByTeamId(buildSnapshot());

  assert.deepEqual(decorations.get("qat"), {
    isPredictedToAdvance: false,
    predictedGroupId: "B",
    predictedGroupRank: 3,
    predictedThirdPlaceRank: undefined
  });
});

test("predicted advancement keeps fourth-place team unhighlighted", () => {
  const decorations = buildPredictedAdvancementByTeamId(buildSnapshot());

  assert.deepEqual(decorations.get("bih"), {
    isPredictedToAdvance: false,
    predictedGroupId: "B",
    predictedGroupRank: 4,
    predictedThirdPlaceRank: undefined
  });
});

test("predicted advancement does not let third-place rankings override a fourth-place finish", () => {
  const decorations = buildPredictedAdvancementByTeamId({
    groupRankings: [
      {
        groupName: "Group B",
        rankedTeamIds: ["sui", "can", "qat", "bih"]
      }
    ],
    thirdPlaceRankings: [{ teamId: "bih", rank: 2 }]
  });

  assert.deepEqual(decorations.get("bih"), {
    isPredictedToAdvance: false,
    predictedGroupId: "B",
    predictedGroupRank: 4,
    predictedThirdPlaceRank: 2
  });
});
