import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDashboardPicksInPlaySummary,
  createEmptyDashboardPicksInPlaySummary,
  dismissMessageId,
  filterMatchesByTeamIds,
  formatCountdown,
  resolveDashboardMovementMode,
  resolveDashboardScoringDisplaySummary,
  getDashboardHomeMessageStorageKey,
  getDeadlineUrgency,
  getGroupStageSaveStatus,
  getLiveMatches,
  getNextMatch,
  getPredictionProgress,
  getReminderLabel,
  hasMeaningfulGroupStageChangesAfterCommit,
  isMessageDismissed,
  parseDismissedMessageIds,
  restoreMessageId,
  serializeDismissedMessageIds,
  type DashboardMatchSummary
} from "../lib/dashboard-home.ts";
import { createEmptyDashboardScoringMovementSummary } from "../lib/leaderboard-movement-helpers.ts";
import {
  getAdvanceTotalProbability,
  getAdvanceViaThirdProbabilityResult,
  getThirdPlaceQualifierProbabilityForTeam,
  getGroupSelectionProbability,
  getPickProbabilityForTeam,
  getThirdPlaceCandidatePoolFromGroupRankings,
  getThirdPlaceSelectionProbability,
  mergeProbabilityRowTeamIds,
  shouldShowMiniTablePickProbability
} from "../lib/group-pick-probability.ts";
import {
  shouldPreferPredictedStandingsOrder,
  shouldUseOfficialGroupStandingsOrder
} from "../lib/group-standings.ts";

const BASE_NOW = Date.UTC(2026, 4, 23, 12, 0, 0);

function createMatch(overrides: Partial<DashboardMatchSummary> = {}): DashboardMatchSummary {
  return {
    id: overrides.id ?? "match-1",
    stage: overrides.stage ?? "group",
    status: overrides.status ?? "scheduled",
    kickoffTime: overrides.kickoffTime ?? new Date(BASE_NOW + 60 * 60 * 1000).toISOString(),
    groupLabel: overrides.groupLabel ?? null,
    homeTeamId: overrides.homeTeamId ?? "usa",
    awayTeamId: overrides.awayTeamId ?? "can",
    homeTeamName: overrides.homeTeamName ?? "Team A",
    awayTeamName: overrides.awayTeamName ?? "Team B",
    homeTeamShortName: overrides.homeTeamShortName ?? "A",
    awayTeamShortName: overrides.awayTeamShortName ?? "B",
    homeScore: overrides.homeScore ?? null,
    awayScore: overrides.awayScore ?? null,
    homeYellowCards: overrides.homeYellowCards,
    awayYellowCards: overrides.awayYellowCards,
    homeRedCards: overrides.homeRedCards,
    awayRedCards: overrides.awayRedCards
  };
}

test("dismissible dashboard message ids serialize and restore cleanly", () => {
  const initial = parseDismissedMessageIds('["home-banner-v1","admin-update-2"]');
  assert.equal(isMessageDismissed(initial, "home-banner-v1"), true);

  const next = dismissMessageId(initial, "dashboard-logo-hint-v2");
  assert.equal(isMessageDismissed(next, "dashboard-logo-hint-v2"), true);

  const restored = restoreMessageId(next, "home-banner-v1");
  assert.equal(isMessageDismissed(restored, "home-banner-v1"), false);
  assert.deepEqual(parseDismissedMessageIds(serializeDismissedMessageIds(restored)), restored);
});

test("dashboard logo hint storage waits for the signed-in user key before hydrating", () => {
  assert.equal(getDashboardHomeMessageStorageKey({ userId: "user-1", isUserLoading: true }), null);
  assert.equal(
    getDashboardHomeMessageStorageKey({ userId: "user-1", isUserLoading: false }),
    "pickit.dismissedHomeMessages:user-1"
  );
  assert.equal(
    getDashboardHomeMessageStorageKey({ userId: null, isUserLoading: false }),
    "pickit.dismissedHomeMessages:guest"
  );
});

test("deadline urgency stays green when more than two days away", () => {
  const deadline = new Date(BASE_NOW + 3 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(getDeadlineUrgency(deadline, BASE_NOW), "green");
});

test("deadline urgency turns orange within two days", () => {
  const deadline = new Date(BASE_NOW + 36 * 60 * 60 * 1000).toISOString();
  assert.equal(getDeadlineUrgency(deadline, BASE_NOW), "orange");
});

test("deadline urgency turns red the day before and day of", () => {
  const tomorrowDeadline = new Date(BASE_NOW + 20 * 60 * 60 * 1000).toISOString();
  const todayDeadline = new Date(BASE_NOW + 2 * 60 * 60 * 1000).toISOString();

  assert.equal(getDeadlineUrgency(tomorrowDeadline, BASE_NOW), "red");
  assert.equal(getDeadlineUrgency(todayDeadline, BASE_NOW), "red");
});

test("deadline urgency stays red for live events", () => {
  assert.equal(getDeadlineUrgency(null, BASE_NOW, { isLive: true }), "red");
});

test("dashboard scoring display prefers live current metrics over stale history snapshots", () => {
  const score = {
    ...createEmptyDashboardScoringMovementSummary(),
    currentPoints: 22,
    currentRank: 9,
    currentPacePoints: 18,
    previousPoints: 18,
    previousRank: 12,
    previousPacePoints: 16,
    pointsChange: 4,
    rankChange: 3,
    deltaFromPace: 4,
    comparisonMode: "previous_snapshot" as const,
    history: [
      {
        matchId: "r32-01",
        createdAt: "2026-06-28T17:00:00.000Z",
        totalPoints: 18,
        pacePoints: 16,
        rank: 12,
        pointsDelta: 2,
        rankDelta: 1,
        paceDelta: 2
      },
      {
        matchId: "r32-02",
        createdAt: "2026-06-29T17:00:00.000Z",
        totalPoints: 20,
        pacePoints: 17,
        rank: 30,
        pointsDelta: 2,
        rankDelta: -18,
        paceDelta: 3
      }
    ]
  };

  const resolved = resolveDashboardScoringDisplaySummary({
    score,
    relevantHistory: score.history
  });

  assert.equal(resolved.currentPoints, 22);
  assert.equal(resolved.currentRank, 9);
  assert.equal(resolved.currentPacePoints, 18);
  assert.equal(resolved.previousPoints, 18);
  assert.equal(resolved.previousRank, 12);
  assert.equal(resolved.pointsChange, 4);
  assert.equal(resolved.rankChange, 3);
  assert.equal(resolved.deltaFromPace, 4);
});

test("dashboard scoring display falls back to snapshot metrics when live summary values are missing", () => {
  const score = createEmptyDashboardScoringMovementSummary();
  const relevantHistory = [
    {
      matchId: "r32-01",
      createdAt: "2026-06-28T17:00:00.000Z",
      totalPoints: 18,
      pacePoints: 16,
      rank: 12,
      pointsDelta: null,
      rankDelta: null,
      paceDelta: 2
    }
  ];

  const resolved = resolveDashboardScoringDisplaySummary({
    score,
    relevantHistory
  });

  assert.equal(resolved.currentPoints, 18);
  assert.equal(resolved.currentRank, 12);
  assert.equal(resolved.currentPacePoints, 16);
  assert.equal(resolved.pointsChange, null);
  assert.equal(resolved.rankChange, null);
  assert.equal(resolved.deltaFromPace, 2);
});

test("predicted standings order stays active before tournament start", () => {
  assert.equal(
    shouldPreferPredictedStandingsOrder({
      hasTournamentStarted: false,
      hasPredictionForGroup: true,
      hasFinalizedResultInGroup: false
    }),
    true
  );
});

test("predicted standings order stays active for unresolved groups after tournament start", () => {
  assert.equal(
    shouldPreferPredictedStandingsOrder({
      hasTournamentStarted: true,
      hasPredictionForGroup: true,
      hasFinalizedResultInGroup: false
    }),
    true
  );
});

test("actual standings order wins once a group has finalized results", () => {
  assert.equal(
    shouldPreferPredictedStandingsOrder({
      hasTournamentStarted: true,
      hasPredictionForGroup: true,
      hasFinalizedResultInGroup: true
    }),
    false
  );
});

test("group-stage prediction progress handles empty, partial, and complete states", () => {
  const empty = getPredictionProgress({
    phase: "group_stage",
    completedGroups: 0,
    totalGroups: 12,
    selectedThirdPlaceCount: 0,
    requiredThirdPlaceCount: 8,
    deadlineAt: new Date(BASE_NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(empty.completedUnits, 0);
  assert.equal(empty.totalUnits, 20);
  assert.equal(empty.isComplete, false);

  const partial = getPredictionProgress({
    phase: "group_stage",
    completedGroups: 8,
    totalGroups: 12,
    selectedThirdPlaceCount: 0,
    requiredThirdPlaceCount: 8,
    deadlineAt: new Date(BASE_NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(partial.detail, "8 of 12 groups complete");
  assert.equal(partial.headline, "4 groups left");

  const partialThirdPlaceLadder = getPredictionProgress({
    phase: "group_stage",
    completedGroups: 12,
    totalGroups: 12,
    selectedThirdPlaceCount: 3,
    requiredThirdPlaceCount: 8,
    deadlineAt: new Date(BASE_NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(partialThirdPlaceLadder.completedUnits, 15);
  assert.equal(partialThirdPlaceLadder.totalUnits, 20);
  assert.equal(partialThirdPlaceLadder.isComplete, false);
  assert.equal(partialThirdPlaceLadder.detail, "3 of 8 third-place qualifiers selected");

  const complete = getPredictionProgress({
    phase: "group_stage",
    completedGroups: 12,
    totalGroups: 12,
    selectedThirdPlaceCount: 8,
    requiredThirdPlaceCount: 8,
    deadlineAt: new Date(BASE_NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(complete.completedUnits, 20);
  assert.equal(complete.isComplete, true);
  assert.equal(complete.headline, "All group picks saved.");

  const unresolvedRoundOf32 = getPredictionProgress({
    phase: "group_stage",
    completedGroups: 12,
    totalGroups: 12,
    selectedThirdPlaceCount: 8,
    requiredThirdPlaceCount: 8,
    projectedRoundOf32ResolvedSideCount: 28,
    projectedRoundOf32ExpectedSideCount: 32,
    deadlineAt: new Date(BASE_NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(unresolvedRoundOf32.completedUnits, 20);
  assert.equal(unresolvedRoundOf32.totalUnits, 21);
  assert.equal(unresolvedRoundOf32.isComplete, false);
  assert.equal(unresolvedRoundOf32.headline, "Group Stage picks need review.");
  assert.equal(unresolvedRoundOf32.detail, "Review Group Stage picks to resolve the projected Round of 32");
});

test("group-stage commit comparison ignores the finalize autosave grace window", () => {
  const committedAt = new Date(BASE_NOW).toISOString();

  assert.equal(
    hasMeaningfulGroupStageChangesAfterCommit({
      committedAt,
      latestChangedAt: new Date(BASE_NOW + 5_000).toISOString()
    }),
    false
  );
  assert.equal(
    hasMeaningfulGroupStageChangesAfterCommit({
      committedAt,
      latestChangedAt: new Date(BASE_NOW + 60_000).toISOString()
    }),
    true
  );
  assert.equal(
    hasMeaningfulGroupStageChangesAfterCommit({
      committedAt: null,
      latestChangedAt: new Date(BASE_NOW + 60_000).toISOString()
    }),
    false
  );
});

test("group-stage save status only marks finalized brackets with later saved changes as needing save", () => {
  const committedAt = new Date(BASE_NOW).toISOString();

  assert.equal(
    getGroupStageSaveStatus({
      completedGroups: 0,
      totalGroups: 12,
      selectedThirdPlaceCount: 0,
      requiredThirdPlaceCount: 8,
      hasSavedProgress: false,
      committedAt: null,
      latestChangedAt: null
    }).needsSave,
    false
  );
  assert.equal(
    getGroupStageSaveStatus({
      completedGroups: 8,
      totalGroups: 12,
      selectedThirdPlaceCount: 0,
      requiredThirdPlaceCount: 8,
      hasSavedProgress: true,
      committedAt: null,
      latestChangedAt: new Date(BASE_NOW - 60_000).toISOString()
    }).needsSave,
    false
  );
  assert.equal(
    getGroupStageSaveStatus({
      completedGroups: 12,
      totalGroups: 12,
      selectedThirdPlaceCount: 8,
      requiredThirdPlaceCount: 8,
      hasSavedProgress: true,
      committedAt,
      latestChangedAt: new Date(BASE_NOW + 5_000).toISOString()
    }).needsSave,
    false
  );
  assert.equal(
    getGroupStageSaveStatus({
      completedGroups: 12,
      totalGroups: 12,
      selectedThirdPlaceCount: 8,
      requiredThirdPlaceCount: 8,
      hasSavedProgress: true,
      committedAt,
      latestChangedAt: new Date(BASE_NOW + 60_000).toISOString()
    }).needsSave,
    true
  );
});

test("flat zero score history chooses picks in play when relevant matches are active", () => {
  const score = {
    ...createEmptyDashboardScoringMovementSummary(),
    history: [
      {
        matchId: "g-1",
        createdAt: "2026-06-11T19:00:00.000Z",
        totalPoints: 0,
        pacePoints: 0,
        rank: 120,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 0
      }
    ]
  };
  const activity = buildDashboardPicksInPlaySummary({
    matches: [
      createMatch({
        id: "g-1",
        groupLabel: "Group A",
        status: "final",
        kickoffTime: "2026-06-11T18:00:00.000Z"
      })
    ],
    relevantGroupKeys: ["Group A"],
    now: Date.parse("2026-06-11T22:00:00.000Z")
  });

  assert.equal(resolveDashboardMovementMode({ score, activity }), "picks_in_play");
});

test("non-zero score history chooses score movement", () => {
  const score = {
    ...createEmptyDashboardScoringMovementSummary(),
    currentPoints: 4,
    history: [
      {
        matchId: "g-1",
        createdAt: "2026-06-11T19:00:00.000Z",
        totalPoints: 4,
        pacePoints: 2,
        rank: 120,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 2
      }
    ]
  };

  assert.equal(
    resolveDashboardMovementMode({
      score,
      activity: createEmptyDashboardPicksInPlaySummary()
    }),
    "score_movement"
  );
});

test("changing score history chooses score movement even before non-zero totals", () => {
  const score = {
    ...createEmptyDashboardScoringMovementSummary(),
    history: [
      {
        matchId: "g-1",
        createdAt: "2026-06-11T19:00:00.000Z",
        totalPoints: 0,
        pacePoints: 0,
        rank: 120,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: 0
      },
      {
        matchId: "g-2",
        createdAt: "2026-06-12T19:00:00.000Z",
        totalPoints: 0,
        pacePoints: 0,
        rank: 118,
        pointsDelta: 0,
        rankDelta: 2,
        paceDelta: 0
      }
    ]
  };

  assert.equal(
    resolveDashboardMovementMode({
      score,
      activity: createEmptyDashboardPicksInPlaySummary()
    }),
    "score_movement"
  );
});

test("no picks or matches chooses empty movement mode", () => {
  assert.equal(
    resolveDashboardMovementMode({
      score: createEmptyDashboardScoringMovementSummary(),
      activity: createEmptyDashboardPicksInPlaySummary()
    }),
    "empty"
  );
});

test("picks in play summary builds daily activity history and next relevant match", () => {
  const activity = buildDashboardPicksInPlaySummary({
    matches: [
      createMatch({
        id: "g-1",
        groupLabel: "Group A",
        status: "final",
        kickoffTime: "2026-06-11T18:00:00.000Z"
      }),
      createMatch({
        id: "g-2",
        groupLabel: "Group A",
        status: "scheduled",
        kickoffTime: "2026-06-12T18:00:00.000Z"
      }),
      createMatch({
        id: "g-3",
        groupLabel: "Group B",
        status: "scheduled",
        kickoffTime: "2026-06-12T20:00:00.000Z"
      })
    ],
    relevantGroupKeys: ["Group A"],
    now: Date.parse("2026-06-12T12:00:00.000Z")
  });

  assert.equal(activity.activePickCount, 1);
  assert.equal(activity.finalizedMatchCount, 1);
  assert.equal(activity.todayRelevantMatchCount, 1);
  assert.equal(activity.nextRelevantMatch?.id, "g-2");
  assert.equal(activity.history.length, 2);
  assert.equal(activity.history[0]?.finalCount, 1);
  assert.equal(activity.history[1]?.todayCount, 1);
});

test("knockout prediction progress handles no predictions, partial predictions, and completion", () => {
  const empty = getPredictionProgress({
    phase: "knockout_stage",
    savedPredictionCount: 0,
    totalPredictionCount: 0,
    hasFinalPrediction: false,
    deadlineAt: null,
    now: BASE_NOW
  });
  assert.equal(empty.detail, "Waiting for the official bracket");

  const partial = getPredictionProgress({
    phase: "knockout_stage",
    savedPredictionCount: 11,
    totalPredictionCount: 32,
    hasFinalPrediction: false,
    deadlineAt: new Date(BASE_NOW + 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(partial.detail, "11 of 32 predictions saved");
  assert.equal(partial.headline, "Final prediction remaining");

  const complete = getPredictionProgress({
    phase: "knockout_stage",
    savedPredictionCount: 32,
    totalPredictionCount: 32,
    hasFinalPrediction: true,
    deadlineAt: new Date(BASE_NOW + 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(complete.isComplete, true);
  assert.equal(complete.headline, "All knockout picks saved.");
});

test("next-match helper finds the nearest upcoming match", () => {
  const matches = [
    createMatch({ id: "later", kickoffTime: new Date(BASE_NOW + 5 * 60 * 60 * 1000).toISOString() }),
    createMatch({ id: "soon", kickoffTime: new Date(BASE_NOW + 30 * 60 * 1000).toISOString() }),
    createMatch({ id: "finalized", status: "final", kickoffTime: new Date(BASE_NOW - 60 * 60 * 1000).toISOString() })
  ];

  assert.equal(getNextMatch(matches, BASE_NOW)?.id, "soon");
});

test("team filter keeps only followed-team matches", () => {
  const matches = [
    createMatch({ id: "usa-match", homeTeamId: "usa", awayTeamId: "mex" }),
    createMatch({ id: "arg-match", homeTeamId: "arg", awayTeamId: "bra" })
  ];

  const filteredMatches = filterMatchesByTeamIds(matches, ["arg"]);
  assert.deepEqual(filteredMatches.map((match) => match.id), ["arg-match"]);
});

test("live-match helper returns up to two live matches and preserves missing card counts", () => {
  const liveMatches = getLiveMatches([
    createMatch({ id: "live-a", status: "live", homeScore: 1, awayScore: 0 }),
    createMatch({ id: "live-b", status: "live", homeScore: 2, awayScore: 2, homeYellowCards: 1 }),
    createMatch({ id: "scheduled", status: "scheduled" }),
    createMatch({ id: "live-c", status: "live", homeScore: 0, awayScore: 0 })
  ]);

  assert.equal(liveMatches.length, 2);
  assert.equal(liveMatches[0]?.status, "live");
  assert.equal(liveMatches[1]?.homeYellowCards ?? null, 1);
  assert.equal(liveMatches[1]?.awayRedCards ?? null, null);
});

test("reminder label shifts from days to hours as kickoff gets closer", () => {
  assert.equal(
    getReminderLabel(new Date(BASE_NOW + 4 * 24 * 60 * 60 * 1000).toISOString(), BASE_NOW),
    "in 4d"
  );
  assert.equal(
    getReminderLabel(new Date(BASE_NOW + 36 * 60 * 60 * 1000).toISOString(), BASE_NOW),
    "in 1d"
  );
  assert.equal(
    getReminderLabel(new Date(BASE_NOW + 10 * 60 * 60 * 1000).toISOString(), BASE_NOW),
    "in 10h"
  );
  assert.equal(
    getReminderLabel(new Date(BASE_NOW + 150 * 60 * 1000).toISOString(), BASE_NOW),
    "in 2.5h"
  );
});

test("countdown formatter handles missing, same-day, and future kickoff states", () => {
  assert.equal(formatCountdown(null, BASE_NOW), "Schedule coming soon");
  assert.equal(
    formatCountdown(new Date(BASE_NOW + 2 * 60 * 60 * 1000).toISOString(), BASE_NOW),
    "Starts in 02:00:00"
  );
  assert.match(
    formatCountdown(new Date(BASE_NOW + 3 * 24 * 60 * 60 * 1000).toISOString(), BASE_NOW),
    /[A-Z][a-z]{2}\s+\d{1,2},/
  );
});

test("pick probability uses exact placement for top two and advance probability for lower picks", () => {
  const teams = [
    { id: "cze", name: "Czechia", shortName: "CZE", groupName: "Group A", fifaRank: 39, fifaPoints: 1510, flagEmoji: "🇨🇿" },
    { id: "kor", name: "Korea", shortName: "KOR", groupName: "Group A", fifaRank: 23, fifaPoints: 1585, flagEmoji: "🇰🇷" },
    { id: "mex", name: "Mexico", shortName: "MEX", groupName: "Group A", fifaRank: 14, fifaPoints: 1660, flagEmoji: "🇲🇽" },
    { id: "rsa", name: "South Africa", shortName: "RSA", groupName: "Group A", fifaRank: 59, fifaPoints: 1410, flagEmoji: "🇿🇦" }
  ];
  const rows = [
    { teamId: "cze", teamName: "Czechia", rank: 4, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    { teamId: "kor", teamName: "Korea", rank: 2, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    { teamId: "mex", teamName: "Mexico", rank: 3, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    { teamId: "rsa", teamName: "South Africa", rank: 1, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
  ];
  const thirdPlacePool = [teams[2], teams[1], teams[0]];

  const topPick = getPickProbabilityForTeam({
    rows,
    teamId: "cze",
    team: teams[0],
    groupTeams: teams,
    predictedPlace: 1
  });
  assert.equal(topPick?.probability, getGroupSelectionProbability(teams[0], 1, teams));
  assert.equal(topPick?.probability, 50);
  assert.equal(topPick?.mode, "exact_place");
  assert.equal(topPick?.targetLabel, "1st");
  assert.equal(topPick?.source, "finish_1");

  const lowerPick = getPickProbabilityForTeam({
    rows,
    teamId: "rsa",
    team: teams[3],
    groupTeams: teams,
    thirdPlacePool,
    thirdPlaceRankingIndex: 3,
    predictedPlace: 4
  });
  assert.equal(lowerPick?.probability, getAdvanceTotalProbability({
    team: teams[3],
    groupTeams: teams,
    thirdPlacePool,
    thirdPlaceRankingIndex: 3
  }));
  assert.equal(lowerPick?.mode, "advance_total");
  assert.equal(lowerPick?.targetLabel, "advance");
  assert.equal(lowerPick?.source, "advance_total");
  assert.equal(getPickProbabilityForTeam({ rows, teamId: "rsa", predictedPlace: null }), null);

  const unavailablePick = getPickProbabilityForTeam({ rows, teamId: "rsa", predictedPlace: 4 });
  assert.equal(unavailablePick?.probability, null);
  assert.equal(unavailablePick?.source, "unavailable");
  assert.equal(unavailablePick?.isUnavailable, true);

  const finalRows = rows.map((row) => ({ ...row, played: 3 }));
  assert.equal(getPickProbabilityForTeam({ rows: finalRows, teamId: "kor", predictedPlace: 2 })?.probability, 100);
  assert.equal(getPickProbabilityForTeam({ rows: finalRows, teamId: "cze", predictedPlace: 1 })?.probability, 0);
  assert.equal(
    getPickProbabilityForTeam({ rows: finalRows, teamId: "mex", predictedPlace: 3, isAdvancing: true })?.probability,
    100
  );
  assert.equal(
    getPickProbabilityForTeam({ rows: finalRows, teamId: "rsa", predictedPlace: 4, isAdvancing: false })?.probability,
    0
  );
});

test("top-two picker exact-place probabilities use the full group roster", () => {
  const teams = [
    { id: "bra", name: "Brazil", shortName: "BRA", groupName: "Group C", fifaRank: 5, fifaPoints: 1780, flagEmoji: "🇧🇷" },
    { id: "mex", name: "Mexico", shortName: "MEX", groupName: "Group C", fifaRank: 14, fifaPoints: 1660, flagEmoji: "🇲🇽" },
    { id: "sco", name: "Scotland", shortName: "SCO", groupName: "Group C", fifaRank: 44, fifaPoints: 1485, flagEmoji: "🏴" },
    { id: "hai", name: "Haiti", shortName: "HAI", groupName: "Group C", fifaRank: 89, fifaPoints: 1270, flagEmoji: "🇭🇹" }
  ];
  const teamsById = new Map(teams.map((team) => [team.id, team] as const));
  const selectedTopTwoTeamIds = ["bra", "mex"];
  const fullGroupTeamIds = ["bra", "mex", "sco", "hai"];
  const probabilityRowTeamIds = mergeProbabilityRowTeamIds(selectedTopTwoTeamIds, fullGroupTeamIds);
  const rows = probabilityRowTeamIds.map((teamId, index) => ({
    teamId,
    rank: index + 1,
    played: 0,
    goalsFor: 0,
    goalDifference: 0,
    points: 0
  }));
  const selectedOnlyTeams = selectedTopTwoTeamIds.map((teamId) => teamsById.get(teamId)!);
  const fullGroupTeams = fullGroupTeamIds.map((teamId) => teamsById.get(teamId)!);
  const mexico = teamsById.get("mex")!;

  const partialPoolPick = getPickProbabilityForTeam({
    rows,
    teamId: "mex",
    team: mexico,
    groupTeams: selectedOnlyTeams,
    predictedPlace: 2
  });
  const canonicalPick = getPickProbabilityForTeam({
    rows,
    teamId: "mex",
    team: mexico,
    groupTeams: fullGroupTeams,
    predictedPlace: 2
  });

  assert.deepEqual(probabilityRowTeamIds, fullGroupTeamIds);
  assert.notEqual(partialPoolPick?.probability, canonicalPick?.probability);
  assert.equal(canonicalPick?.probability, getGroupSelectionProbability(mexico, 2, fullGroupTeams));
  assert.equal(canonicalPick?.source, "finish_2");
  assert.equal(canonicalPick?.fullLabel, `${canonicalPick?.probability}% for 2nd`);
});

test("third-place mini standings use the full candidate pool for canonical advance probability", () => {
  const teams = [
    { id: "a1", name: "Argentina", shortName: "ARG", groupName: "Group A", fifaRank: 2, fifaPoints: 1870, flagEmoji: "🇦🇷" },
    { id: "a2", name: "Austria", shortName: "AUT", groupName: "Group A", fifaRank: 25, fifaPoints: 1570, flagEmoji: "🇦🇹" },
    { id: "cze", name: "Czechia", shortName: "CZE", groupName: "Group A", fifaRank: 39, fifaPoints: 1510, flagEmoji: "🇨🇿" },
    { id: "a4", name: "Angola", shortName: "ANG", groupName: "Group A", fifaRank: 86, fifaPoints: 1280, flagEmoji: "🇦🇴" },
    { id: "b1", name: "Belgium", shortName: "BEL", groupName: "Group B", fifaRank: 8, fifaPoints: 1730, flagEmoji: "🇧🇪" },
    { id: "b2", name: "Bolivia", shortName: "BOL", groupName: "Group B", fifaRank: 77, fifaPoints: 1320, flagEmoji: "🇧🇴" },
    { id: "kor", name: "Korea", shortName: "KOR", groupName: "Group B", fifaRank: 23, fifaPoints: 1585, flagEmoji: "🇰🇷" },
    { id: "b4", name: "Benin", shortName: "BEN", groupName: "Group B", fifaRank: 92, fifaPoints: 1250, flagEmoji: "🇧🇯" },
    { id: "c1", name: "Croatia", shortName: "CRO", groupName: "Group C", fifaRank: 10, fifaPoints: 1710, flagEmoji: "🇭🇷" },
    { id: "c2", name: "Cameroon", shortName: "CMR", groupName: "Group C", fifaRank: 49, fifaPoints: 1460, flagEmoji: "🇨🇲" },
    { id: "mex", name: "Mexico", shortName: "MEX", groupName: "Group C", fifaRank: 14, fifaPoints: 1660, flagEmoji: "🇲🇽" },
    { id: "c4", name: "Curaçao", shortName: "CUW", groupName: "Group C", fifaRank: 82, fifaPoints: 1295, flagEmoji: "🇨🇼" },
    { id: "d1", name: "Denmark", shortName: "DEN", groupName: "Group D", fifaRank: 21, fifaPoints: 1605, flagEmoji: "🇩🇰" },
    { id: "d2", name: "Dominican Republic", shortName: "DOM", groupName: "Group D", fifaRank: 142, fifaPoints: 1080, flagEmoji: "🇩🇴" },
    { id: "jpn", name: "Japan", shortName: "JPN", groupName: "Group D", fifaRank: 18, fifaPoints: 1630, flagEmoji: "🇯🇵" },
    { id: "d4", name: "Djibouti", shortName: "DJI", groupName: "Group D", fifaRank: 190, fifaPoints: 870, flagEmoji: "🇩🇯" },
    { id: "e1", name: "Ecuador", shortName: "ECU", groupName: "Group E", fifaRank: 24, fifaPoints: 1580, flagEmoji: "🇪🇨" },
    { id: "e2", name: "Egypt", shortName: "EGY", groupName: "Group E", fifaRank: 32, fifaPoints: 1545, flagEmoji: "🇪🇬" },
    { id: "sen", name: "Senegal", shortName: "SEN", groupName: "Group E", fifaRank: 20, fifaPoints: 1620, flagEmoji: "🇸🇳" },
    { id: "e4", name: "El Salvador", shortName: "SLV", groupName: "Group E", fifaRank: 81, fifaPoints: 1300, flagEmoji: "🇸🇻" },
    { id: "f1", name: "France", shortName: "FRA", groupName: "Group F", fifaRank: 3, fifaPoints: 1840, flagEmoji: "🇫🇷" },
    { id: "f2", name: "Finland", shortName: "FIN", groupName: "Group F", fifaRank: 62, fifaPoints: 1400, flagEmoji: "🇫🇮" },
    { id: "usa", name: "United States", shortName: "USA", groupName: "Group F", fifaRank: 13, fifaPoints: 1670, flagEmoji: "🇺🇸" },
    { id: "f4", name: "Faroe Islands", shortName: "FRO", groupName: "Group F", fifaRank: 136, fifaPoints: 1105, flagEmoji: "🇫🇴" },
    { id: "g1", name: "Germany", shortName: "GER", groupName: "Group G", fifaRank: 16, fifaPoints: 1650, flagEmoji: "🇩🇪" },
    { id: "g2", name: "Ghana", shortName: "GHA", groupName: "Group G", fifaRank: 65, fifaPoints: 1380, flagEmoji: "🇬🇭" },
    { id: "can", name: "Canada", shortName: "CAN", groupName: "Group G", fifaRank: 30, fifaPoints: 1540, flagEmoji: "🇨🇦" },
    { id: "g4", name: "Guatemala", shortName: "GUA", groupName: "Group G", fifaRank: 101, fifaPoints: 1210, flagEmoji: "🇬🇹" },
    { id: "h1", name: "Hungary", shortName: "HUN", groupName: "Group H", fifaRank: 36, fifaPoints: 1525, flagEmoji: "🇭🇺" },
    { id: "h2", name: "Honduras", shortName: "HON", groupName: "Group H", fifaRank: 78, fifaPoints: 1315, flagEmoji: "🇭🇳" },
    { id: "tun", name: "Tunisia", shortName: "TUN", groupName: "Group H", fifaRank: 35, fifaPoints: 1530, flagEmoji: "🇹🇳" },
    { id: "h4", name: "Haiti", shortName: "HAI", groupName: "Group H", fifaRank: 89, fifaPoints: 1270, flagEmoji: "🇭🇹" },
    { id: "i1", name: "Italy", shortName: "ITA", groupName: "Group I", fifaRank: 9, fifaPoints: 1720, flagEmoji: "🇮🇹" },
    { id: "i2", name: "Iceland", shortName: "ISL", groupName: "Group I", fifaRank: 70, fifaPoints: 1350, flagEmoji: "🇮🇸" },
    { id: "ecu", name: "Ecuador", shortName: "ECU", groupName: "Group I", fifaRank: 24, fifaPoints: 1580, flagEmoji: "🇪🇨" },
    { id: "i4", name: "India", shortName: "IND", groupName: "Group I", fifaRank: 121, fifaPoints: 1140, flagEmoji: "🇮🇳" }
  ];
  const teamsById = new Map(teams.map((team) => [team.id, team] as const));
  const groupRankings = [
    { rankedTeamIds: ["a1", "a2", "cze", "a4"] },
    { rankedTeamIds: ["b1", "b2", "kor", "b4"] },
    { rankedTeamIds: ["c1", "c2", "mex", "c4"] },
    { rankedTeamIds: ["d1", "d2", "jpn", "d4"] },
    { rankedTeamIds: ["e1", "e2", "sen", "e4"] },
    { rankedTeamIds: ["f1", "f2", "usa", "f4"] },
    { rankedTeamIds: ["g1", "g2", "can", "g4"] },
    { rankedTeamIds: ["h1", "h2", "tun", "h4"] },
    { rankedTeamIds: ["i1", "i2", "ecu", "i4"] }
  ];
  const candidatePool = getThirdPlaceCandidatePoolFromGroupRankings(groupRankings, teamsById);
  const selectedQualifierPool = candidatePool.slice(0, 8);
  const czechia = teamsById.get("cze");
  const rows = groupRankings[0].rankedTeamIds.map((teamId, index) => ({
    teamId,
    rank: index + 1,
    played: 0,
    goalsFor: 0,
    goalDifference: 0,
    points: 0
  }));

  assert.deepEqual(candidatePool.map((team) => team.id), ["cze", "kor", "mex", "jpn", "sen", "usa", "can", "tun", "ecu"]);
  assert.notEqual(
    getThirdPlaceSelectionProbability(czechia!, 2, candidatePool),
    getThirdPlaceSelectionProbability(czechia!, 2, selectedQualifierPool)
  );

  const lowerPick = getPickProbabilityForTeam({
    rows,
    teamId: "cze",
    team: czechia,
    groupTeams: groupRankings[0].rankedTeamIds.map((teamId) => teamsById.get(teamId)!),
    thirdPlacePool: candidatePool,
    thirdPlaceRankingIndex: 2,
    predictedPlace: 3
  });

  assert.equal(lowerPick?.probability, getAdvanceTotalProbability({
    team: czechia!,
    groupTeams: groupRankings[0].rankedTeamIds.map((teamId) => teamsById.get(teamId)!),
    thirdPlacePool: candidatePool,
    thirdPlaceRankingIndex: 2
  }));
  assert.equal(lowerPick?.source, "advance_total");
  assert.equal(lowerPick?.fullLabel, `${lowerPick?.probability}% to advance`);
  assert.equal(lowerPick?.compactLabel, `${lowerPick?.probability}% adv`);

  const viaThirdPick = getAdvanceViaThirdProbabilityResult({
    team: czechia!,
    thirdPlacePool: candidatePool,
    thirdPlaceRankingIndex: 2
  });
  assert.equal(viaThirdPick.probability, getThirdPlaceSelectionProbability(czechia!, 2, candidatePool));
  assert.equal(viaThirdPick.mode, "advance_via_third");
  assert.equal(viaThirdPick.source, "advance_via_third");
  assert.equal(viaThirdPick.compactLabel, `${viaThirdPick.probability}% 3rd-place qual`);
});

test("mini standings probability appears for saved top-two picks and selected third-place qualifiers only", () => {
  assert.equal(
    shouldShowMiniTablePickProbability({
      predictedPlace: 1
    }),
    true
  );
  assert.equal(
    shouldShowMiniTablePickProbability({
      predictedPlace: 2
    }),
    true
  );
  assert.equal(
    shouldShowMiniTablePickProbability({
      predictedPlace: 3,
      isSelectedThirdPlaceQualifier: true
    }),
    true
  );
  assert.equal(
    shouldShowMiniTablePickProbability({
      predictedPlace: 3,
      isSelectedThirdPlaceQualifier: false
    }),
    false
  );
  assert.equal(
    shouldShowMiniTablePickProbability({
      predictedPlace: 4
    }),
    false
  );
  assert.equal(
    shouldShowMiniTablePickProbability({
      predictedPlace: null
    }),
    false
  );
});

test("third-place qualifier probability helper only returns team-keyed probabilities for selected qualifiers", () => {
  const teams = [
    { id: "tur", name: "Türkiye", shortName: "TUR", groupName: "Group D", fifaRank: 22, fifaPoints: 1560, flagEmoji: "🇹🇷" },
    { id: "qat", name: "Qatar", shortName: "QAT", groupName: "Group B", fifaRank: 55, fifaPoints: 1450, flagEmoji: "🇶🇦" },
    { id: "civ", name: "Côte d'Ivoire", shortName: "CIV", groupName: "Group E", fifaRank: 34, fifaPoints: 1500, flagEmoji: "🇨🇮" },
    { id: "gha", name: "Ghana", shortName: "GHA", groupName: "Group L", fifaRank: 74, fifaPoints: 1320, flagEmoji: "🇬🇭" }
  ];
  const teamsById = new Map(teams.map((team) => [team.id, team] as const));
  const candidatePool = teams;
  const probabilityByTeamId = new Map([
    [
      "tur",
      getAdvanceViaThirdProbabilityResult({
        team: teamsById.get("tur")!,
        thirdPlacePool: candidatePool,
        thirdPlaceRankingIndex: 0
      })
    ],
    [
      "qat",
      getAdvanceViaThirdProbabilityResult({
        team: teamsById.get("qat")!,
        thirdPlacePool: candidatePool,
        thirdPlaceRankingIndex: 3
      })
    ]
  ]);
  const selectedThirdPlaceQualifierTeamIds = new Set(["tur"]);

  const turkeyProbability = getThirdPlaceQualifierProbabilityForTeam({
    teamId: "tur",
    predictedThirdPlaceQualifierTeamIds: selectedThirdPlaceQualifierTeamIds,
    thirdPlaceQualificationProbabilityByTeamId: probabilityByTeamId
  });
  const qatarProbability = getThirdPlaceQualifierProbabilityForTeam({
    teamId: "qat",
    predictedThirdPlaceQualifierTeamIds: selectedThirdPlaceQualifierTeamIds,
    thirdPlaceQualificationProbabilityByTeamId: probabilityByTeamId
  });
  const bihProbability = getThirdPlaceQualifierProbabilityForTeam({
    teamId: "bih",
    predictedThirdPlaceQualifierTeamIds: selectedThirdPlaceQualifierTeamIds,
    thirdPlaceQualificationProbabilityByTeamId: probabilityByTeamId
  });

  assert.equal(turkeyProbability?.mode, "advance_via_third");
  assert.equal(turkeyProbability?.source, "advance_via_third");
  assert.equal(turkeyProbability?.compactLabel.includes("3rd-place qual"), true);
  assert.equal(qatarProbability, null);
  assert.equal(bihProbability, null);
});

test("third-place qualifier probability helper returns null when the selected team has no team-keyed probability", () => {
  const probability = getThirdPlaceQualifierProbabilityForTeam({
    teamId: "tur",
    predictedThirdPlaceQualifierTeamIds: new Set(["tur"]),
    thirdPlaceQualificationProbabilityByTeamId: new Map()
  });

  assert.equal(probability, null);
});

test("exact-place probability returns zero when the predicted finish is already impossible by points", () => {
  const teams = [
    { id: "usa", name: "United States", shortName: "USA", groupName: "Group D", fifaRank: 10, fifaPoints: 1700, flagEmoji: "🇺🇸" },
    { id: "aus", name: "Australia", shortName: "AUS", groupName: "Group D", fifaRank: 20, fifaPoints: 1600, flagEmoji: "🇦🇺" },
    { id: "tur", name: "Türkiye", shortName: "TUR", groupName: "Group D", fifaRank: 22, fifaPoints: 1580, flagEmoji: "🇹🇷" },
    { id: "par", name: "Paraguay", shortName: "PAR", groupName: "Group D", fifaRank: 30, fifaPoints: 1500, flagEmoji: "🇵🇾" }
  ];
  const rows = [
    { teamId: "usa", rank: 1, played: 2, goalsFor: 4, goalDifference: 3, points: 6 },
    { teamId: "aus", rank: 2, played: 2, goalsFor: 2, goalDifference: 1, points: 4 },
    { teamId: "tur", rank: 3, played: 2, goalsFor: 1, goalDifference: -1, points: 1 },
    { teamId: "par", rank: 4, played: 2, goalsFor: 1, goalDifference: -3, points: 0 }
  ];
  const remainingMatches = [
    { status: "scheduled", homeTeamId: "usa", awayTeamId: "par" },
    { status: "scheduled", homeTeamId: "aus", awayTeamId: "tur" }
  ];

  const impossibleFirst = getPickProbabilityForTeam({
    rows,
    remainingMatches,
    teamId: "tur",
    team: teams[2],
    groupTeams: teams,
    predictedPlace: 1
  });
  const impossibleSecond = getPickProbabilityForTeam({
    rows,
    remainingMatches,
    teamId: "par",
    team: teams[3],
    groupTeams: teams,
    predictedPlace: 2
  });

  assert.equal(impossibleFirst?.probability, 0);
  assert.equal(impossibleSecond?.probability, 0);
});

test("third-place qualification probability returns zero when finishing third is already impossible", () => {
  const teams = [
    { id: "usa", name: "United States", shortName: "USA", groupName: "Group D", fifaRank: 10, fifaPoints: 1700, flagEmoji: "🇺🇸" },
    { id: "aus", name: "Australia", shortName: "AUS", groupName: "Group D", fifaRank: 20, fifaPoints: 1600, flagEmoji: "🇦🇺" },
    { id: "tur", name: "Türkiye", shortName: "TUR", groupName: "Group D", fifaRank: 22, fifaPoints: 1580, flagEmoji: "🇹🇷" },
    { id: "par", name: "Paraguay", shortName: "PAR", groupName: "Group D", fifaRank: 30, fifaPoints: 1500, flagEmoji: "🇵🇾" }
  ];
  const rows = [
    { teamId: "usa", rank: 1, played: 2, goalsFor: 4, goalDifference: 3, points: 6 },
    { teamId: "aus", rank: 2, played: 2, goalsFor: 2, goalDifference: 1, points: 4 },
    { teamId: "tur", rank: 3, played: 2, goalsFor: 2, goalDifference: 0, points: 4 },
    { teamId: "par", rank: 4, played: 2, goalsFor: 1, goalDifference: -4, points: 0 }
  ];
  const remainingMatches = [
    { status: "scheduled", homeTeamId: "usa", awayTeamId: "par" },
    { status: "scheduled", homeTeamId: "aus", awayTeamId: "tur" }
  ];

  const impossibleViaThird = getAdvanceViaThirdProbabilityResult({
    team: teams[3],
    thirdPlacePool: [teams[2], teams[3]],
    thirdPlaceRankingIndex: 1,
    rows,
    remainingMatches
  });

  assert.equal(impossibleViaThird.probability, 0);
  assert.equal(impossibleViaThird.mode, "advance_via_third");
});

test("mini standings keep prediction order before kickoff even if scheduled rows have stale scores", () => {
  const futureKickoff = new Date(BASE_NOW + 24 * 60 * 60 * 1000).toISOString();
  const pastKickoff = new Date(BASE_NOW - 60 * 1000).toISOString();
  const futureScheduledWithScore = {
    stage: "group" as const,
    status: "scheduled" as const,
    kickoffTime: futureKickoff,
    homeScore: 2,
    awayScore: 1
  };

  assert.equal(
    shouldUseOfficialGroupStandingsOrder([futureScheduledWithScore], BASE_NOW),
    false
  );
  assert.equal(
    shouldUseOfficialGroupStandingsOrder(
      [
        {
          stage: "group",
          status: "live",
          kickoffTime: futureKickoff
        }
      ],
      BASE_NOW
    ),
    true
  );
  assert.equal(
    shouldUseOfficialGroupStandingsOrder(
      [
        {
          stage: "group",
          status: "scheduled",
          kickoffTime: pastKickoff
        }
      ],
      BASE_NOW
    ),
    true
  );
});
