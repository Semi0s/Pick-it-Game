import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardKnockoutProgressSummary } from "../lib/knockout-progress.ts";

const teams = [
  { id: "can", name: "Canada", shortName: "CAN", flagEmoji: "🇨🇦" },
  { id: "bra", name: "Brazil", shortName: "BRA", flagEmoji: "🇧🇷" },
  { id: "jpn", name: "Japan", shortName: "JPN", flagEmoji: "🇯🇵" },
  { id: "ger", name: "Germany", shortName: "GER", flagEmoji: "🇩🇪" },
  { id: "par", name: "Paraguay", shortName: "PAR", flagEmoji: "🇵🇾" }
];

test("knockout progress promotes winners and keeps pending opponents in the next round builder", () => {
  const summary = buildDashboardKnockoutProgressSummary({
    teams,
    matches: [
      {
        id: "r32-01",
        stage: "r32",
        status: "final",
        kickoffTime: "2026-06-28T13:00:00.000Z",
        homeTeamId: "can",
        awayTeamId: "bra",
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: "can",
        nextMatchId: "r16-01",
        nextMatchSlot: "home"
      },
      {
        id: "r32-02",
        stage: "r32",
        status: "scheduled",
        kickoffTime: "2026-06-28T16:00:00.000Z",
        homeTeamId: "ger",
        awayTeamId: "par",
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        nextMatchId: "r16-01",
        nextMatchSlot: "away"
      },
      {
        id: "r16-01",
        stage: "r16",
        status: "scheduled",
        kickoffTime: "2026-06-30T13:00:00.000Z",
        homeTeamId: "can",
        awayTeamId: null,
        homeScore: null,
        awayScore: null,
        winnerTeamId: null
      }
    ]
  });

  assert.ok(summary);
  assert.equal(summary?.currentRoundStage, "r32");
  assert.equal(summary?.currentRoundDecided, 1);
  assert.equal(summary?.nextRoundStage, "r16");
  assert.equal(summary?.matchups.length, 1);
  assert.equal(summary?.matchups[0]?.homeSlot.primaryTeam?.teamId, "can");
  assert.equal(summary?.matchups[0]?.homeSlot.secondaryTeam?.teamId, "bra");
  assert.equal(summary?.matchups[0]?.awaySlot.state, "pending");
  assert.deepEqual(
    summary?.matchups[0]?.awaySlot.candidates.map((team) => team.teamId),
    ["ger", "par"]
  );
});

test("knockout progress surfaces live feeder scores", () => {
  const summary = buildDashboardKnockoutProgressSummary({
    teams,
    matches: [
      {
        id: "r32-03",
        stage: "r32",
        status: "live",
        kickoffTime: "2026-06-28T19:00:00.000Z",
        homeTeamId: "bra",
        awayTeamId: "jpn",
        homeScore: 1,
        awayScore: 1,
        winnerTeamId: null,
        nextMatchId: "r16-02",
        nextMatchSlot: "home"
      },
      {
        id: "r16-02",
        stage: "r16",
        status: "scheduled",
        kickoffTime: "2026-06-30T16:00:00.000Z",
        homeTeamId: null,
        awayTeamId: null,
        homeScore: null,
        awayScore: null,
        winnerTeamId: null
      }
    ]
  });

  assert.ok(summary);
  assert.equal(summary?.matchups[0]?.homeSlot.state, "live");
  assert.equal(summary?.matchups[0]?.homeSlot.scoreLabel, "1-1");
  assert.equal(summary?.matchups[0]?.homeSlot.live, true);
});

test("knockout progress advances to the next undecided source round", () => {
  const summary = buildDashboardKnockoutProgressSummary({
    teams,
    matches: [
      {
        id: "r32-01",
        stage: "r32",
        status: "final",
        kickoffTime: "2026-06-28T13:00:00.000Z",
        homeTeamId: "can",
        awayTeamId: "bra",
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: "can",
        nextMatchId: "r16-01",
        nextMatchSlot: "home"
      },
      {
        id: "r16-01",
        stage: "r16",
        status: "scheduled",
        kickoffTime: "2026-06-30T13:00:00.000Z",
        homeTeamId: "can",
        awayTeamId: "ger",
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        nextMatchId: "qf-01",
        nextMatchSlot: "home"
      },
      {
        id: "qf-01",
        stage: "qf",
        status: "scheduled",
        kickoffTime: "2026-07-03T13:00:00.000Z",
        homeTeamId: null,
        awayTeamId: null,
        homeScore: null,
        awayScore: null,
        winnerTeamId: null
      }
    ]
  });

  assert.ok(summary);
  assert.equal(summary?.currentRoundStage, "r16");
  assert.equal(summary?.nextRoundStage, "qf");
});
