import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalRoundOf32SlotLabelMap,
  buildProjectedRoundOf32SlotLabelMap
} from "../lib/projected-r32-slot-labels.ts";

test("projected R32 slot labels are available by official and stored match ids", () => {
  const labelsByMatchId = buildProjectedRoundOf32SlotLabelMap(
    [
      {
        matchId: "M73",
        stage: "r32",
        home: {
          sourceLabel: "A-2nd",
          teamId: "can",
          resolutionSource: "prediction"
        },
        away: {
          sourceLabel: "B-2nd",
          teamId: "sui",
          resolutionSource: "prediction"
        }
      },
      {
        matchId: "M79",
        stage: "r32",
        home: {
          sourceLabel: "A-1st",
          teamId: "mex",
          resolutionSource: "prediction"
        },
        away: {
          sourceLabel: "H-3rd",
          teamId: "sco",
          resolutionSource: "prediction"
        }
      }
    ],
    [
      { id: "r32-01", stage: "r32", status: "scheduled" },
      { id: "r32-07", stage: "r32", status: "scheduled" }
    ]
  );

  assert.deepEqual(labelsByMatchId.get("M73"), { home: "A-2nd", away: "B-2nd" });
  assert.deepEqual(labelsByMatchId.get("r32-01"), { home: "A-2nd", away: "B-2nd" });
  assert.deepEqual(labelsByMatchId.get("M79"), { home: "A-1st", away: "H-3rd" });
  assert.deepEqual(labelsByMatchId.get("r32-07"), { home: "A-1st", away: "H-3rd" });
});

test("canonical R32 labels override stale stored placeholder labels", () => {
  const labelsByMatchId = buildCanonicalRoundOf32SlotLabelMap([
    {
      id: "r32-16",
      stage: "r32",
      status: "scheduled",
      homeSource: "Best third-place 6",
      awaySource: "Best third-place 7"
    }
  ]);

  assert.deepEqual(labelsByMatchId.get("M88"), { home: "D-2nd", away: "G-2nd" });
  assert.deepEqual(labelsByMatchId.get("r32-16"), { home: "D-2nd", away: "G-2nd" });
});
