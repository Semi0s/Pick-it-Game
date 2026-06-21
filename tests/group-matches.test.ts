import test from "node:test";
import assert from "node:assert/strict";

import { mergeGroupMatchRows } from "../lib/group-match-merge.ts";
import type { MatchWithTeams } from "../lib/types";

function createLocalMatch(overrides: Partial<MatchWithTeams> = {}): MatchWithTeams {
  return {
    id: overrides.id ?? "g-1",
    stage: "group",
    groupName: overrides.groupName ?? "A",
    homeTeamId: overrides.homeTeamId ?? "ecu",
    awayTeamId: overrides.awayTeamId ?? "cuw",
    kickoffTime: overrides.kickoffTime ?? "2026-06-14T16:00:00.000Z",
    status: overrides.status ?? "scheduled",
    homeScore: overrides.homeScore,
    awayScore: overrides.awayScore,
    winnerTeamId: overrides.winnerTeamId,
    homeTeam: overrides.homeTeam,
    awayTeam: overrides.awayTeam
  };
}

test("group match rows prefer database results even when local fixture ids drift", () => {
  const localMatches = [
    createLocalMatch({
      id: "mock-g-ecu-cuw",
      groupName: "E",
      homeTeamId: "ecu",
      awayTeamId: "cuw",
      kickoffTime: "2026-06-14T16:00:00.000Z"
    })
  ];

  const matches = mergeGroupMatchRows(
    [
      {
        id: "db-ecu-cuw-final",
        stage: "group",
        group_name: "E",
        status: "final",
        home_team_id: "ecu",
        away_team_id: "cuw",
        home_score: 2,
        away_score: 0,
        winner_team_id: "ecu",
        kickoff_time: "2026-06-14T16:00:00.000Z"
      }
    ],
    localMatches,
    () => undefined
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.id, "db-ecu-cuw-final");
  assert.equal(matches[0]?.status, "final");
  assert.equal(matches[0]?.homeScore, 2);
  assert.equal(matches[0]?.awayScore, 0);
  assert.equal(matches[0]?.winnerTeamId, "ecu");
  assert.equal(matches[0]?.groupName, "E");
  assert.equal(matches[0]?.homeTeamId, "ecu");
  assert.equal(matches[0]?.awayTeamId, "cuw");
});

test("group match rows keep local metadata when the database row is partial", () => {
  const localMatches = [
    createLocalMatch({
      id: "g-2",
      groupName: "F",
      homeTeamId: "ned",
      awayTeamId: "jpn",
      kickoffTime: "2026-06-15T19:00:00.000Z"
    })
  ];

  const matches = mergeGroupMatchRows(
    [
      {
        id: "g-2",
        stage: "group",
        status: "live",
        home_score: 1,
        away_score: 1,
        winner_team_id: null,
        kickoff_time: null
      }
    ],
    localMatches,
    () => undefined
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.groupName, "F");
  assert.equal(matches[0]?.homeTeamId, "ned");
  assert.equal(matches[0]?.awayTeamId, "jpn");
  assert.equal(matches[0]?.kickoffTime, "2026-06-15T19:00:00.000Z");
  assert.equal(matches[0]?.status, "live");
  assert.equal(matches[0]?.homeScore, 1);
  assert.equal(matches[0]?.awayScore, 1);
});

test("group match rows sort by kickoff time after merging", () => {
  const localMatches = [
    createLocalMatch({
      id: "late",
      groupName: "G",
      homeTeamId: "bel",
      awayTeamId: "egy",
      kickoffTime: "2026-06-16T19:00:00.000Z"
    }),
    createLocalMatch({
      id: "early",
      groupName: "H",
      homeTeamId: "esp",
      awayTeamId: "uru",
      kickoffTime: "2026-06-14T19:00:00.000Z"
    })
  ];

  const matches = mergeGroupMatchRows(
    [
      {
        id: "late-db",
        stage: "group",
        group_name: "G",
        status: "scheduled",
        home_team_id: "bel",
        away_team_id: "egy",
        kickoff_time: "2026-06-16T19:00:00.000Z"
      },
      {
        id: "early-db",
        stage: "group",
        group_name: "H",
        status: "scheduled",
        home_team_id: "esp",
        away_team_id: "uru",
        kickoff_time: "2026-06-14T19:00:00.000Z"
      }
    ],
    localMatches,
    () => undefined
  );

  assert.deepEqual(
    matches.map((match) => match.id),
    ["early-db", "late-db"]
  );
});
