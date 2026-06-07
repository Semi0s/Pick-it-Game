import test from "node:test";
import assert from "node:assert/strict";
import { shouldIncludeLeaderboardComments } from "../lib/ugc-safety-policy.ts";

test("leaderboard comments stay hidden when the global flag is disabled", () => {
  assert.equal(
    shouldIncludeLeaderboardComments({
      globalCommentsEnabled: false,
      scopeType: "group",
      groupCommentsEnabled: true
    }),
    false
  );
});

test("leaderboard comments stay hidden outside group scope", () => {
  assert.equal(
    shouldIncludeLeaderboardComments({
      globalCommentsEnabled: true,
      scopeType: "global",
      groupCommentsEnabled: true
    }),
    false
  );
});

test("leaderboard comments require the group-level flag", () => {
  assert.equal(
    shouldIncludeLeaderboardComments({
      globalCommentsEnabled: true,
      scopeType: "group",
      groupCommentsEnabled: false
    }),
    false
  );
  assert.equal(
    shouldIncludeLeaderboardComments({
      globalCommentsEnabled: true,
      scopeType: "group",
      groupCommentsEnabled: true
    }),
    true
  );
});
