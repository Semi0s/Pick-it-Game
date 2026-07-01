import assert from "node:assert/strict";
import test from "node:test";
import {
  PREDICTION_LAB_DEFAULT_SETTINGS,
  buildPredictionLabInputs,
  buildPredictionLabPreferredMatchId,
  buildPredictionLabViewModel
} from "../lib/prediction-lab.ts";
import type { Match, Team } from "../lib/types.ts";

const teams: Team[] = [
  { id: "fav", name: "Favorite", shortName: "FAV", groupName: "A", fifaRank: 2, flagEmoji: "🏳️" },
  { id: "dark", name: "Dark Horse", shortName: "DRK", groupName: "B", fifaRank: 18, flagEmoji: "🏴" },
  { id: "steady", name: "Steady", shortName: "STD", groupName: "C", fifaRank: 9, flagEmoji: "🚩" },
  { id: "long", name: "Longshot", shortName: "LNG", groupName: "D", fifaRank: 31, flagEmoji: "🎌" }
];

const matches: Match[] = [
  {
    id: "g-01",
    stage: "group",
    status: "final",
    homeTeamId: "fav",
    awayTeamId: "long",
    kickoffTime: "2026-06-18T12:00:00.000Z",
    homeScore: 3,
    awayScore: 0,
    winnerTeamId: "fav"
  },
  {
    id: "g-02",
    stage: "group",
    status: "final",
    homeTeamId: "dark",
    awayTeamId: "steady",
    kickoffTime: "2026-06-19T12:00:00.000Z",
    homeScore: 1,
    awayScore: 1
  },
  {
    id: "r32-01",
    stage: "r32",
    status: "final",
    homeTeamId: "fav",
    awayTeamId: "long",
    kickoffTime: "2026-06-28T12:00:00.000Z",
    homeScore: 2,
    awayScore: 0,
    winnerTeamId: "fav",
    nextMatchId: "r16-01",
    nextMatchSlot: "home"
  },
  {
    id: "r32-02",
    stage: "r32",
    status: "scheduled",
    homeTeamId: "dark",
    awayTeamId: "steady",
    kickoffTime: "2026-06-29T12:00:00.000Z",
    nextMatchId: "r16-01",
    nextMatchSlot: "away"
  },
  {
    id: "r16-01",
    stage: "r16",
    status: "scheduled",
    homeTeamId: "fav",
    homeSource: "Winner of r32-01",
    awaySource: "Winner of r32-02",
    kickoffTime: "2026-07-02T12:00:00.000Z"
  }
];

test("prediction lab inputs keep only active knockout teams", () => {
  const inputs = buildPredictionLabInputs({
    teams,
    matches
  });

  assert.deepEqual(
    inputs.activeTeams.map((team) => team.id).sort(),
    ["dark", "fav", "steady"]
  );
  assert.deepEqual(
    inputs.upcomingMatches.map((match) => match.id),
    ["r32-02", "r16-01"]
  );
  assert.equal(inputs.upcomingMatches[1]?.homeSource, "Winner of r32-01");
  assert.equal(inputs.upcomingMatches[1]?.awaySource, "Winner of r32-02");
});

test("preferred matchup follows an existing bracket pick when available", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const preferredMatchId = buildPredictionLabPreferredMatchId({
    upcomingMatches: inputs.upcomingMatches,
    bracketPicks: [{ matchId: "r32-02", predictedWinnerTeamId: "dark" }]
  });

  assert.equal(preferredMatchId, "r32-02");
});

test("prediction lab hides anonymous crowd signal until five players have data", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: {
      groupCount: 4,
      averageSettings: {
        scheduleLoad: 33,
        availability: 33,
        formQuality: 67,
        crowdPulse: 67
      }
    }
  });

  assert.equal(viewModel.canShowAverage, false);
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "crowdPulse")?.status, "missing");
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "publicPulse")?.status, "active");
});

test("prediction lab shows a bracket pick marker and disabled availability signal", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: {
      groupCount: 8,
      averageSettings: {
        scheduleLoad: 33,
        availability: 33,
        formQuality: 67,
        crowdPulse: 67
      }
    },
    bracketPicks: [{ matchId: "r32-02", predictedWinnerTeamId: "dark" }],
    focusMatchId: "r32-02"
  });

  assert.equal(viewModel.matchLens?.bracketPickTeamId, "dark");
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "availability")?.status, "missing");
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "availability")?.controlId, null);
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "publicPulse")?.controlId, null);
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "scheduleLoad")?.controlId, "scheduleLoad");
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "formQuality")?.controlId, "formQuality");
  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "crowdPulse")?.controlId, "crowdPulse");
});

test("prediction lab activates availability when provider summaries are present", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const availabilityByTeamId = new Map([
    ["dark", { teamId: "dark", flaggedCount: 3, updatedAt: "2026-06-28T12:00:00.000Z" }],
    ["steady", { teamId: "steady", flaggedCount: 0, updatedAt: "2026-06-28T12:00:00.000Z" }]
  ]);

  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: {
      groupCount: 8,
      averageSettings: {
        scheduleLoad: 33,
        availability: 33,
        formQuality: 67,
        crowdPulse: 67
      }
    },
    availabilityByTeamId,
    focusMatchId: "r32-02"
  });

  const availabilitySignal = viewModel.matchLens?.signals.find((signal) => signal.id === "availability");
  assert.equal(availabilitySignal?.status, "active");
  assert.equal(availabilitySignal?.controlId, "availability");
  assert.ok((availabilitySignal?.lean ?? 0) > 0);
});

test("prediction lab labels Team Health as not configured when no feed is available", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: {
      groupCount: 8,
      averageSettings: {
        scheduleLoad: 33,
        availability: 33,
        formQuality: 67,
        crowdPulse: 67
      }
    },
    teamHealthSummary: {
      status: "not_configured",
      teams: [],
      checkedAt: "2026-06-30T20:00:00.000Z",
      refreshIntervalSeconds: 300
    },
    focusMatchId: "r32-02"
  });

  const teamHealthSignal = viewModel.matchLens?.signals.find((signal) => signal.id === "availability");
  assert.equal(teamHealthSignal?.label, "Team Health");
  assert.equal(teamHealthSignal?.status, "missing");
  assert.equal(teamHealthSignal?.controlId, null);
  assert.match(teamHealthSignal?.evidence ?? "", /not configured/i);
});

test("prediction lab surfaces a Team Health mapping issue distinctly", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: {
      groupCount: 8,
      averageSettings: {
        scheduleLoad: 33,
        availability: 33,
        formQuality: 67,
        crowdPulse: 67
      }
    },
    teamHealthSummary: {
      status: "mapping_empty",
      teams: [],
      checkedAt: "2026-06-30T20:00:00.000Z",
      refreshIntervalSeconds: 300
    },
    focusMatchId: "r32-02"
  });

  const teamHealthSignal = viewModel.matchLens?.signals.find((signal) => signal.id === "availability");
  assert.equal(teamHealthSignal?.status, "missing");
  assert.match(teamHealthSignal?.evidence ?? "", /do not map cleanly/i);
});

test("prediction lab attention changes move the lens result", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });

  const crowdOff = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: {
      scheduleLoad: 67,
      availability: 33,
      formQuality: 67,
      crowdPulse: 0
    },
    averageSummary: {
      groupCount: 8,
      averageSettings: {
        scheduleLoad: 67,
        availability: 33,
        formQuality: 100,
        crowdPulse: 100
      }
    },
    focusMatchId: "r32-02"
  });

  const crowdHeavy = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: {
      scheduleLoad: 67,
      availability: 33,
      formQuality: 67,
      crowdPulse: 100
    },
    averageSummary: {
      groupCount: 8,
      averageSettings: {
        scheduleLoad: 67,
        availability: 33,
        formQuality: 100,
        crowdPulse: 100
      }
    },
    focusMatchId: "r32-02"
  });

  assert.notEqual(crowdOff.matchLens?.compositeLean, crowdHeavy.matchLens?.compositeLean);
});

test("prediction lab attention intensity sharpens a one-signal lean", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });

  const lightLens = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: {
      scheduleLoad: 33,
      availability: 33,
      formQuality: 33,
      crowdPulse: 0
    },
    averageSummary: {
      groupCount: 4,
      averageSettings: null
    },
    focusMatchId: "r32-02"
  });

  const heavyLens = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: {
      scheduleLoad: 33,
      availability: 33,
      formQuality: 100,
      crowdPulse: 0
    },
    averageSummary: {
      groupCount: 4,
      averageSettings: null
    },
    focusMatchId: "r32-02"
  });

  assert.ok(Math.abs(heavyLens.matchLens?.compositeLean ?? 0) > Math.abs(lightLens.matchLens?.compositeLean ?? 0));
  assert.notEqual(heavyLens.matchLens?.userPairLabel, lightLens.matchLens?.userPairLabel);
});

test("prediction lab availability attention changes team projection percentages", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const availabilityByTeamId = new Map([
    ["dark", { teamId: "dark", flaggedCount: 3, updatedAt: "2026-06-28T12:00:00.000Z" }]
  ]);

  const availabilityOff = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: {
      scheduleLoad: 67,
      availability: 0,
      formQuality: 67,
      crowdPulse: 0
    },
    availabilityByTeamId,
    averageSummary: {
      groupCount: 4,
      averageSettings: null
    }
  });

  const availabilityHeavy = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: {
      scheduleLoad: 67,
      availability: 100,
      formQuality: 67,
      crowdPulse: 0
    },
    availabilityByTeamId,
    averageSummary: {
      groupCount: 4,
      averageSettings: null
    }
  });

  const offDarkProjection = availabilityOff.projectionRows.find((row) => row.teamId === "dark")?.yourPercent ?? 0;
  const heavyDarkProjection = availabilityHeavy.projectionRows.find((row) => row.teamId === "dark")?.yourPercent ?? 0;
  assert.ok(heavyDarkProjection < offDarkProjection);
});

test("prediction lab exposes public pulse when public matchup data is available", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const publicMatchPulseByMatchId = new Map([
    [
      "r32-02",
      {
        homePercent: 58,
        awayPercent: 42,
        provider: "api-football" as const
      }
    ]
  ]);

  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: {
      groupCount: 8,
      averageSettings: {
        scheduleLoad: 67,
        availability: 33,
        formQuality: 67,
        crowdPulse: 67
      }
    },
    publicMatchPulseByMatchId,
    focusMatchId: "r32-02"
  });

  assert.equal(viewModel.matchLens?.signals.find((signal) => signal.id === "publicPulse")?.status, "active");
  assert.equal(viewModel.matchLens?.publicLean, -16);
  assert.equal(viewModel.matchLens?.publicPairLabel, "DRK 58.0% · STD 42.0%");
  assert.match(
    viewModel.matchLens?.signals.find((signal) => signal.id === "publicPulse")?.sourceLabel ?? "",
    /API-Football/i
  );
});

test("prediction lab derives Rank + Form when no external public signal is provided", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: {
      groupCount: 4,
      averageSettings: null
    },
    focusMatchId: "r32-02"
  });

  const rankFormSignal = viewModel.matchLens?.signals.find((signal) => signal.id === "publicPulse");
  assert.equal(rankFormSignal?.status, "active");
  assert.equal(rankFormSignal?.label, "Rank + Form");
  assert.match(rankFormSignal?.sourceLabel ?? "", /FIFA rank/i);
  assert.notEqual(viewModel.matchLens?.publicPairLabel, null);
});

test("prediction lab scenarios build a path summary and next opponent", () => {
  const inputs = buildPredictionLabInputs({ teams, matches });
  const selectedMatch = inputs.upcomingMatches[0]!;
  assert.ok(selectedMatch.homeTeamId);
  assert.ok(selectedMatch.awayTeamId);

  const viewModel = buildPredictionLabViewModel({
    activeTeams: inputs.activeTeams,
    upcomingMatches: inputs.upcomingMatches,
    settings: PREDICTION_LAB_DEFAULT_SETTINGS,
    averageSummary: null,
    focusMatchId: selectedMatch.id,
    scenario: {
      matchId: selectedMatch.id,
      winnerTeamId: selectedMatch.homeTeamId,
      loserTeamId: selectedMatch.awayTeamId
    }
  });

  assert.equal(viewModel.scenarioSummary.winnerTeamId, selectedMatch.homeTeamId);
  assert.equal(viewModel.scenarioSummary.miniBracket?.winnerAdvancesLabel, "Winner faces FAV");
  assert.ok(viewModel.scenarioSummary.messages.some((message) => message.includes("advances")));
});
