import test from "node:test";
import assert from "node:assert/strict";

import { buildDashboardKnockoutProgressSummary } from "../lib/knockout-progress.ts";

const teams = [
  { id: "can", name: "Canada", shortName: "CAN", flagEmoji: "🇨🇦" },
  { id: "bra", name: "Brazil", shortName: "BRA", flagEmoji: "🇧🇷" },
  { id: "jpn", name: "Japan", shortName: "JPN", flagEmoji: "🇯🇵" },
  { id: "ger", name: "Germany", shortName: "GER", flagEmoji: "🇩🇪" },
  { id: "par", name: "Paraguay", shortName: "PAR", flagEmoji: "🇵🇾" },
  { id: "ned", name: "Netherlands", shortName: "NED", flagEmoji: "🇳🇱" },
  { id: "mar", name: "Morocco", shortName: "MAR", flagEmoji: "🇲🇦" }
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

test("knockout progress prefers official winner source labels over stale legacy next-match links", () => {
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
        homeSource: "2A",
        awaySource: "2B",
        homeScore: 1,
        awayScore: 0,
        winnerTeamId: "can",
        nextMatchId: "r16-01",
        nextMatchSlot: "home"
      },
      {
        id: "r32-03",
        stage: "r32",
        status: "live",
        kickoffTime: "2026-06-29T19:00:00.000Z",
        homeTeamId: "ned",
        awayTeamId: "mar",
        homeSource: "1F",
        awaySource: "2C",
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        // stale legacy link that would incorrectly pair this matchup elsewhere
        nextMatchId: "r16-01",
        nextMatchSlot: "away"
      },
      {
        id: "r32-04",
        stage: "r32",
        status: "scheduled",
        kickoffTime: "2026-06-29T12:00:00.000Z",
        homeTeamId: "bra",
        awayTeamId: "jpn",
        homeSource: "1C",
        awaySource: "2F",
        homeScore: null,
        awayScore: null,
        winnerTeamId: null,
        nextMatchId: "r16-03",
        nextMatchSlot: "home"
      },
      {
        id: "M90",
        stage: "r16",
        status: "scheduled",
        kickoffTime: "2026-07-04T17:00:00.000Z",
        homeTeamId: "can",
        awayTeamId: null,
        homeSource: "Winner of M73",
        awaySource: "Winner of M75",
        homeScore: null,
        awayScore: null,
        winnerTeamId: null
      },
      {
        id: "M91",
        stage: "r16",
        status: "scheduled",
        kickoffTime: "2026-07-05T16:00:00.000Z",
        homeTeamId: null,
        awayTeamId: null,
        homeSource: "Winner of M76",
        awaySource: "Winner of M78",
        homeScore: null,
        awayScore: null,
        winnerTeamId: null
      }
    ]
  });

  assert.ok(summary);
  const canadaPath = summary?.matchups.find((matchup) => matchup.homeSlot.primaryTeam?.teamId === "can") ?? null;
  assert.ok(canadaPath);
  assert.equal(canadaPath?.awaySlot.state, "live");
  assert.deepEqual(
    canadaPath?.awaySlot.candidates.map((team) => team.teamId),
    ["ned", "mar"]
  );
});

test("knockout progress builds all round-of-16 paths from official winner sources", () => {
  const fullTeams = [
    { id: "can", name: "Canada", shortName: "CAN", flagEmoji: "🇨🇦" },
    { id: "rsa", name: "South Africa", shortName: "RSA", flagEmoji: "🇿🇦" },
    { id: "ger", name: "Germany", shortName: "GER", flagEmoji: "🇩🇪" },
    { id: "par", name: "Paraguay", shortName: "PAR", flagEmoji: "🇵🇾" },
    { id: "ned", name: "Netherlands", shortName: "NED", flagEmoji: "🇳🇱" },
    { id: "mar", name: "Morocco", shortName: "MAR", flagEmoji: "🇲🇦" },
    { id: "bra", name: "Brazil", shortName: "BRA", flagEmoji: "🇧🇷" },
    { id: "jpn", name: "Japan", shortName: "JPN", flagEmoji: "🇯🇵" },
    { id: "fra", name: "France", shortName: "FRA", flagEmoji: "🇫🇷" },
    { id: "swe", name: "Sweden", shortName: "SWE", flagEmoji: "🇸🇪" },
    { id: "civ", name: "Cote d'Ivoire", shortName: "CIV", flagEmoji: "🇨🇮" },
    { id: "nor", name: "Norway", shortName: "NOR", flagEmoji: "🇳🇴" },
    { id: "mex", name: "Mexico", shortName: "MEX", flagEmoji: "🇲🇽" },
    { id: "ecu", name: "Ecuador", shortName: "ECU", flagEmoji: "🇪🇨" },
    { id: "eng", name: "England", shortName: "ENG", flagEmoji: "🏴" },
    { id: "cod", name: "DR Congo", shortName: "COD", flagEmoji: "🇨🇩" },
    { id: "usa", name: "United States", shortName: "USA", flagEmoji: "🇺🇸" },
    { id: "bih", name: "Bosnia-Herzegovina", shortName: "BIH", flagEmoji: "🇧🇦" },
    { id: "bel", name: "Belgium", shortName: "BEL", flagEmoji: "🇧🇪" },
    { id: "sen", name: "Senegal", shortName: "SEN", flagEmoji: "🇸🇳" },
    { id: "esp", name: "Spain", shortName: "ESP", flagEmoji: "🇪🇸" },
    { id: "aut", name: "Austria", shortName: "AUT", flagEmoji: "🇦🇹" },
    { id: "sui", name: "Switzerland", shortName: "SUI", flagEmoji: "🇨🇭" },
    { id: "alg", name: "Algeria", shortName: "ALG", flagEmoji: "🇩🇿" },
    { id: "por", name: "Portugal", shortName: "POR", flagEmoji: "🇵🇹" },
    { id: "cro", name: "Croatia", shortName: "CRO", flagEmoji: "🇭🇷" },
    { id: "arg", name: "Argentina", shortName: "ARG", flagEmoji: "🇦🇷" },
    { id: "cpv", name: "Cabo Verde", shortName: "CPV", flagEmoji: "🇨🇻" },
    { id: "col", name: "Colombia", shortName: "COL", flagEmoji: "🇨🇴" },
    { id: "gha", name: "Ghana", shortName: "GHA", flagEmoji: "🇬🇭" },
    { id: "aus", name: "Australia", shortName: "AUS", flagEmoji: "🇦🇺" },
    { id: "egy", name: "Egypt", shortName: "EGY", flagEmoji: "🇪🇬" }
  ];

  const currentRoundMatches = [
    ["r32-01", "rsa", "can", "M90", "home", "2A", "2B"],
    ["r32-02", "ger", "par", "M89", "home", "1E", "3D"],
    ["r32-03", "ned", "mar", "M90", "away", "1F", "2C"],
    ["r32-04", "bra", "jpn", "M91", "home", "1C", "2F"],
    ["r32-05", "fra", "swe", "M89", "away", "1I", "3F"],
    ["r32-06", "civ", "nor", "M91", "away", "2E", "2I"],
    ["r32-07", "mex", "ecu", "M92", "home", "1A", "3E"],
    ["r32-08", "eng", "cod", "M92", "away", "1L", "3K"],
    ["r32-09", "usa", "bih", "M94", "home", "1D", "3B"],
    ["r32-10", "bel", "sen", "M94", "away", "1G", "3I"],
    ["r32-11", "por", "cro", "M95", "home", "2K", "2L"],
    ["r32-12", "esp", "aut", "M93", "away", "1H", "2J"],
    ["r32-13", "sui", "alg", "M96", "away", "1B", "3J"],
    ["r32-14", "arg", "cpv", "M95", "away", "1J", "2H"],
    ["r32-15", "col", "gha", "M96", "home", "1K", "3L"],
    ["r32-16", "aus", "egy", "M93", "home", "2D", "2G"]
  ].map(([id, homeTeamId, awayTeamId, nextMatchId, nextMatchSlot, homeSource, awaySource], index) => ({
    id,
    stage: "r32" as const,
    status: "scheduled" as const,
    kickoffTime: new Date(Date.UTC(2026, 5, 28 + index)).toISOString(),
    homeTeamId,
    awayTeamId,
    homeSource,
    awaySource,
    homeScore: null,
    awayScore: null,
    winnerTeamId: null,
    nextMatchId,
    nextMatchSlot: nextMatchSlot as "home" | "away"
  }));

  const nextRoundMatches = [
    ["M89", "Winner of M74", "Winner of M77"],
    ["M90", "Winner of M73", "Winner of M75"],
    ["M91", "Winner of M76", "Winner of M78"],
    ["M92", "Winner of M79", "Winner of M80"],
    ["M93", "Winner of M83", "Winner of M84"],
    ["M94", "Winner of M81", "Winner of M82"],
    ["M95", "Winner of M86", "Winner of M88"],
    ["M96", "Winner of M85", "Winner of M87"]
  ].map(([id, homeSource, awaySource], index) => ({
    id,
    stage: "r16" as const,
    status: "scheduled" as const,
    kickoffTime: new Date(Date.UTC(2026, 6, 4 + index)).toISOString(),
    homeTeamId: null,
    awayTeamId: null,
    homeSource,
    awaySource,
    homeScore: null,
    awayScore: null,
    winnerTeamId: null
  }));

  const summary = buildDashboardKnockoutProgressSummary({
    teams: fullTeams,
    matches: [...currentRoundMatches, ...nextRoundMatches]
  });

  assert.ok(summary);
  const actualPaths = (summary?.matchups ?? []).map((matchup) => ({
    matchId: matchup.matchId,
    home: matchup.homeSlot.candidates.map((team) => team.teamId),
    away: matchup.awaySlot.candidates.map((team) => team.teamId)
  }));

  assert.deepEqual(actualPaths, [
    { matchId: "M89", home: ["ger", "par"], away: ["fra", "swe"] },
    { matchId: "M90", home: ["rsa", "can"], away: ["ned", "mar"] },
    { matchId: "M91", home: ["bra", "jpn"], away: ["civ", "nor"] },
    { matchId: "M92", home: ["mex", "ecu"], away: ["eng", "cod"] },
    { matchId: "M93", home: ["por", "cro"], away: ["esp", "aut"] },
    { matchId: "M94", home: ["usa", "bih"], away: ["bel", "sen"] },
    { matchId: "M95", home: ["arg", "cpv"], away: ["aus", "egy"] },
    { matchId: "M96", home: ["sui", "alg"], away: ["col", "gha"] }
  ]);
});
