import assert from "node:assert/strict";
import test from "node:test";

import {
  getLeaderboardActivityTimestamp,
  shouldIncludeLeaderboardActivityItem
} from "../lib/leaderboard-activity-helpers.ts";

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

test("group phase activity is cleared once the phase is closed", () => {
  assert.equal(
    shouldIncludeLeaderboardActivityItem({
      phase: "group_phase",
      eventType: "points_awarded",
      match: { stage: "group" }
    }),
    false
  );
});

test("knockout and global activity keep only knockout match events", () => {
  assert.equal(
    shouldIncludeLeaderboardActivityItem({
      phase: "knockout_phase",
      eventType: "points_awarded",
      match: { stage: "r32" }
    }),
    true
  );

  assert.equal(
    shouldIncludeLeaderboardActivityItem({
      phase: "knockout_phase",
      eventType: "points_awarded",
      match: { stage: "group" }
    }),
    false
  );

  assert.equal(
    shouldIncludeLeaderboardActivityItem({
      phase: "global_top10",
      eventType: "rank_moved_up",
      match: { stage: "qf" }
    }),
    true
  );

  assert.equal(
    shouldIncludeLeaderboardActivityItem({
      phase: "global_top10",
      eventType: "rank_moved_up",
      match: { stage: "group" }
    }),
    false
  );
});

test("non-match activity is limited to global top 10 and side picks", () => {
  assert.equal(
    shouldIncludeLeaderboardActivityItem({
      phase: "knockout_phase",
      eventType: "trophy_awarded",
      match: null
    }),
    false
  );

  assert.equal(
    shouldIncludeLeaderboardActivityItem({
      phase: "global_top10",
      eventType: "daily_winner",
      match: null
    }),
    true
  );
});
