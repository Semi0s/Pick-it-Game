import test from "node:test";
import assert from "node:assert/strict";
import { orderRowsByPredictionSlots } from "../lib/group-stage-mini-table-order.ts";

const rows = [
  { teamId: "team-1", teamName: "Team 1" },
  { teamId: "team-2", teamName: "Team 2" },
  { teamId: "team-3", teamName: "Team 3" },
  { teamId: "team-4", teamName: "Team 4" }
];

test("mini table ordering preserves a second-place-only prediction slot", () => {
  const ordered = orderRowsByPredictionSlots(rows, new Map([["team-4", 2]]));

  assert.deepEqual(
    ordered.map((entry) => ({ teamId: entry.row.teamId, rank: entry.displayRank })),
    [
      { teamId: "team-1", rank: 1 },
      { teamId: "team-4", rank: 2 },
      { teamId: "team-2", rank: 3 },
      { teamId: "team-3", rank: 4 }
    ]
  );
});

test("mini table ordering keeps explicit first and second slots as source of truth", () => {
  const ordered = orderRowsByPredictionSlots(rows, new Map([
    ["team-3", 1],
    ["team-1", 2]
  ]));

  assert.deepEqual(
    ordered.map((entry) => ({ teamId: entry.row.teamId, rank: entry.displayRank })),
    [
      { teamId: "team-3", rank: 1 },
      { teamId: "team-1", rank: 2 },
      { teamId: "team-2", rank: 3 },
      { teamId: "team-4", rank: 4 }
    ]
  );
});
