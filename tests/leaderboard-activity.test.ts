import assert from "node:assert/strict";
import test from "node:test";

import { getLeaderboardActivityTimestamp } from "../lib/leaderboard-activity-helpers.ts";

test("leaderboard activity prefers finalized match time over event insert time", () => {
  const timestamp = getLeaderboardActivityTimestamp(
    { created_at: "2026-06-30T12:00:00.000Z" },
    {
      finalized_at: "2026-06-28T18:00:00.000Z",
      last_synced_at: "2026-06-30T11:00:00.000Z",
      kickoff_at: "2026-06-28T16:00:00.000Z",
      updated_at: "2026-06-30T11:30:00.000Z"
    }
  );

  assert.equal(timestamp, "2026-06-28T18:00:00.000Z");
});

test("leaderboard activity falls back through sync, kickoff, update, then insert time", () => {
  assert.equal(
    getLeaderboardActivityTimestamp(
      { created_at: "2026-06-30T12:00:00.000Z" },
      {
        finalized_at: null,
        last_synced_at: "2026-06-29T01:00:00.000Z",
        kickoff_at: "2026-06-28T16:00:00.000Z",
        updated_at: "2026-06-29T02:00:00.000Z"
      }
    ),
    "2026-06-29T01:00:00.000Z"
  );

  assert.equal(
    getLeaderboardActivityTimestamp(
      { created_at: "2026-06-30T12:00:00.000Z" },
      {
        finalized_at: null,
        last_synced_at: null,
        kickoff_at: "2026-06-28T16:00:00.000Z",
        updated_at: "2026-06-29T02:00:00.000Z"
      }
    ),
    "2026-06-28T16:00:00.000Z"
  );

  assert.equal(
    getLeaderboardActivityTimestamp(
      { created_at: "2026-06-30T12:00:00.000Z" },
      {
        finalized_at: null,
        last_synced_at: null,
        kickoff_at: null,
        updated_at: "2026-06-29T02:00:00.000Z"
      }
    ),
    "2026-06-29T02:00:00.000Z"
  );

  assert.equal(
    getLeaderboardActivityTimestamp(
      { created_at: "2026-06-30T12:00:00.000Z" },
      null
    ),
    "2026-06-30T12:00:00.000Z"
  );
});
