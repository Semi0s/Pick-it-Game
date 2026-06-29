import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveSyncedNonFinalStatus,
  findInternalMatch,
  resolveEffectiveKickoffAt,
  shouldLockScheduledMatch,
  shouldReopenUpcomingLockedMatch
} from "../lib/match-sync/match-resolution.ts";

test("findInternalMatch matches a unique reversed-team fixture by kickoff", () => {
  const match = findInternalMatch({
    externalMatch: {
      external_id: "fixture-1001",
      status: "final",
      kickoff_at: "2026-06-28T17:00:00.000Z",
      home_team_name: "Canada",
      away_team_name: "South Africa",
      home_score: 2,
      away_score: 1
    },
    matches: [
      {
        id: "r32-01",
        stage: "r32",
        home_team_id: "rsa",
        away_team_id: "can",
        kickoff_time: "2026-06-28T17:00:00.000Z",
        kickoff_at: "2026-06-28T17:00:00.000Z",
        status: "locked"
      }
    ],
    homeTeamId: "can",
    awayTeamId: "rsa"
  });

  assert.equal(match?.id, "r32-01");
});

test("findInternalMatch returns null when reversed kickoff fallback is ambiguous", () => {
  const match = findInternalMatch({
    externalMatch: {
      external_id: "fixture-1002",
      status: "scheduled",
      kickoff_at: "2026-06-28T17:00:00.000Z",
      home_team_name: "Canada",
      away_team_name: "South Africa",
      home_score: null,
      away_score: null
    },
    matches: [
      {
        id: "r32-01",
        stage: "r32",
        home_team_id: "rsa",
        away_team_id: "can",
        kickoff_time: "2026-06-28T17:00:00.000Z",
        kickoff_at: "2026-06-28T17:00:00.000Z",
        status: "locked"
      },
      {
        id: "r32-99",
        stage: "r32",
        home_team_id: "rsa",
        away_team_id: "can",
        kickoff_time: "2026-06-28T17:30:00.000Z",
        kickoff_at: "2026-06-28T17:30:00.000Z",
        status: "locked"
      }
    ],
    homeTeamId: "can",
    awayTeamId: "rsa"
  });

  assert.equal(match, null);
});

test("deriveSyncedNonFinalStatus reopens future scheduled matches", () => {
  const futureKickoff = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const status = deriveSyncedNonFinalStatus({
    externalStatus: "scheduled",
    kickoffAt: futureKickoff,
    currentStatus: "locked"
  });

  assert.equal(status, "scheduled");
});

test("deriveSyncedNonFinalStatus marks live provider matches as live", () => {
  const status = deriveSyncedNonFinalStatus({
    externalStatus: "live",
    kickoffAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    currentStatus: "locked"
  });

  assert.equal(status, "live");
});

test("deriveSyncedNonFinalStatus keeps imminent scheduled matches locked", () => {
  const imminentKickoff = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const status = deriveSyncedNonFinalStatus({
    externalStatus: "scheduled",
    kickoffAt: imminentKickoff,
    currentStatus: "locked"
  });

  assert.equal(status, "locked");
});

test("resolveEffectiveKickoffAt falls back to kickoff_time when kickoff_at is missing", () => {
  const kickoff = "2026-06-29T20:00:00.000Z";

  assert.equal(
    resolveEffectiveKickoffAt({
      kickoffAt: null,
      kickoffTime: kickoff
    }),
    kickoff
  );
});

test("shouldReopenUpcomingLockedMatch reopens future locked matches when kickoff_at is missing", () => {
  const futureKickoff = new Date(Date.now() + 45 * 60 * 1000).toISOString();

  assert.equal(
    shouldReopenUpcomingLockedMatch({
      currentStatus: "locked",
      kickoffAt: null,
      kickoffTime: futureKickoff,
      finalizedAt: null,
      homeScore: null,
      awayScore: null
    }),
    true
  );
});

test("shouldLockScheduledMatch locks scheduled matches using kickoff_time fallback", () => {
  const imminentKickoff = new Date(Date.now() + 2 * 60 * 1000).toISOString();

  assert.equal(
    shouldLockScheduledMatch({
      currentStatus: "scheduled",
      kickoffAt: null,
      kickoffTime: imminentKickoff,
      finalizedAt: null
    }),
    true
  );
});
