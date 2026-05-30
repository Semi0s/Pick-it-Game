import test from "node:test";
import assert from "node:assert/strict";
import {
  dismissMessageId,
  filterMatchesByTeamIds,
  formatCountdown,
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
import { getPickProbabilityForTeam } from "../lib/group-pick-probability.ts";
import { shouldUseOfficialGroupStandingsOrder } from "../lib/group-standings.ts";

const BASE_NOW = Date.UTC(2026, 4, 23, 12, 0, 0);

function createMatch(overrides: Partial<DashboardMatchSummary> = {}): DashboardMatchSummary {
  return {
    id: overrides.id ?? "match-1",
    stage: overrides.stage ?? "group",
    status: overrides.status ?? "scheduled",
    kickoffTime: overrides.kickoffTime ?? new Date(BASE_NOW + 60 * 60 * 1000).toISOString(),
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
  assert.equal(empty.totalUnits, 13);
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

  const complete = getPredictionProgress({
    phase: "group_stage",
    completedGroups: 12,
    totalGroups: 12,
    selectedThirdPlaceCount: 8,
    requiredThirdPlaceCount: 8,
    deadlineAt: new Date(BASE_NOW + 5 * 24 * 60 * 60 * 1000).toISOString(),
    now: BASE_NOW
  });
  assert.equal(complete.completedUnits, 13);
  assert.equal(complete.isComplete, true);
  assert.equal(complete.headline, "All group picks saved.");
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

test("group-stage save status mirrors the Group Stage saved timestamp gate", () => {
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
    true
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
  const rows = [
    { teamId: "cze", teamName: "Czechia", rank: 4, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    { teamId: "kor", teamName: "Korea", rank: 2, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    { teamId: "mex", teamName: "Mexico", rank: 3, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
    { teamId: "rsa", teamName: "South Africa", rank: 1, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
  ];

  assert.deepEqual(getPickProbabilityForTeam({ rows, teamId: "cze", predictedPlace: 1 }), {
    probability: 68,
    predictedPlace: 1,
    mode: "exact_place",
    targetLabel: "1st"
  });
  assert.deepEqual(getPickProbabilityForTeam({ rows, teamId: "rsa", predictedPlace: 4 }), {
    probability: 12,
    predictedPlace: 4,
    mode: "advance",
    targetLabel: "advance"
  });
  assert.equal(getPickProbabilityForTeam({ rows, teamId: "rsa", predictedPlace: null }), null);

  const finalRows = rows.map((row) => ({ ...row, played: 3 }));
  assert.deepEqual(getPickProbabilityForTeam({ rows: finalRows, teamId: "kor", predictedPlace: 2 }), {
    probability: 100,
    predictedPlace: 2,
    mode: "exact_place",
    targetLabel: "2nd"
  });
  assert.deepEqual(getPickProbabilityForTeam({ rows: finalRows, teamId: "cze", predictedPlace: 1 }), {
    probability: 0,
    predictedPlace: 1,
    mode: "exact_place",
    targetLabel: "1st"
  });
  assert.deepEqual(getPickProbabilityForTeam({ rows: finalRows, teamId: "mex", predictedPlace: 3, isAdvancing: true }), {
    probability: 100,
    predictedPlace: 3,
    mode: "advance",
    targetLabel: "advance"
  });
  assert.deepEqual(getPickProbabilityForTeam({ rows: finalRows, teamId: "rsa", predictedPlace: 4, isAdvancing: false }), {
    probability: 0,
    predictedPlace: 4,
    mode: "advance",
    targetLabel: "advance"
  });
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
