import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveLastChanceLockAtFromSchedule,
  formatLastChanceDeadlineLabel,
  getSidePicksCompletionCount,
  getHighestScoringTeamIds,
  isSidePicksLocked,
  normalizeSidePicksSubmission,
  resolveLastChanceDefaultLockAt,
  scoreSidePicks,
  LAST_CHANCE_FALLBACK_LOCK_AT,
  type SidePickScoringMatch
} from "../lib/side-picks.ts";

const matches: SidePickScoringMatch[] = [
  {
    id: "g-a",
    stage: "group",
    status: "final",
    homeTeamId: "flop",
    awayTeamId: "other",
    homeScore: 1,
    awayScore: 2,
    winnerTeamId: "other"
  },
  {
    id: "r32-a",
    stage: "r32",
    status: "final",
    homeTeamId: "dark",
    awayTeamId: "r32-loser",
    homeScore: 3,
    awayScore: 1,
    winnerTeamId: "dark"
  },
  {
    id: "r16-a",
    stage: "r16",
    status: "final",
    homeTeamId: "dark",
    awayTeamId: "r16-loser",
    homeScore: 2,
    awayScore: 0,
    winnerTeamId: "dark"
  },
  {
    id: "qf-a",
    stage: "qf",
    status: "final",
    homeTeamId: "dark",
    awayTeamId: "qf-loser",
    homeScore: 1,
    awayScore: 0,
    winnerTeamId: "dark"
  },
  {
    id: "sf-a",
    stage: "sf",
    status: "final",
    homeTeamId: "champion",
    awayTeamId: "dark",
    homeScore: 2,
    awayScore: 1,
    winnerTeamId: "champion"
  },
  {
    id: "sf-b",
    stage: "sf",
    status: "final",
    homeTeamId: "runner",
    awayTeamId: "semi4",
    homeScore: 4,
    awayScore: 0,
    winnerTeamId: "runner"
  },
  {
    id: "final",
    stage: "final",
    status: "final",
    homeTeamId: "champion",
    awayTeamId: "runner",
    homeScore: 1,
    awayScore: 0,
    winnerTeamId: "champion"
  }
];

test("Last-Chance scoring supports top 4 any order and objective category points", () => {
  const scores = scoreSidePicks({
    picks: {
      championTeamId: "champion",
      runnerUpTeamId: "runner",
      semifinalistTeamIds: ["semi4", "champion", "dark", "runner"],
      darkHorseTeamId: "dark",
      favoriteFlopTeamId: "flop",
      highestScoringTeamId: "dark",
      goldenBootPlayerId: null,
      goldenBallPlayerId: null
    },
    matches
  });
  const byKey = new Map(scores.map((score) => [score.key, score.points]));

  assert.equal(byKey.get("champion"), 18);
  assert.equal(byKey.get("runner_up"), 12);
  assert.equal(byKey.get("semifinalists"), 24);
  assert.equal(byKey.get("dark_horse"), 9);
  assert.equal(byKey.get("favorite_flop"), 10);
  assert.equal(byKey.get("highest_scoring_team"), 8);
});

test("Favorite Flop scoring gives fewer points as the favorite advances", () => {
  const qfFavoriteScores = scoreSidePicks({
    picks: {
      championTeamId: null,
      runnerUpTeamId: null,
      semifinalistTeamIds: ["champion", "runner", "dark", "semi4"],
      darkHorseTeamId: null,
      favoriteFlopTeamId: "qf-loser",
      highestScoringTeamId: null,
      goldenBootPlayerId: null,
      goldenBallPlayerId: null
    },
    matches
  });

  assert.equal(qfFavoriteScores.find((score) => score.key === "favorite_flop")?.points, 0);
});

test("Highest-scoring team scoring handles ties", () => {
  const tiedMatches: SidePickScoringMatch[] = [
    { stage: "group", status: "final", homeTeamId: "a", awayTeamId: "b", homeScore: 4, awayScore: 4, winnerTeamId: "a" },
    { stage: "group", status: "final", homeTeamId: "c", awayTeamId: "d", homeScore: 4, awayScore: 0, winnerTeamId: "c" }
  ];

  assert.deepEqual(getHighestScoringTeamIds(tiedMatches).sort(), ["a", "b", "c"]);
});

test("Last-Chance lock deadline is deterministic", () => {
  assert.equal(isSidePicksLocked("2026-06-08T12:00:00.000Z", new Date("2026-06-08T12:00:00.000Z")), true);
  assert.equal(isSidePicksLocked("2026-06-08T12:00:00.000Z", new Date("2026-06-08T11:59:59.000Z")), false);
  assert.equal(isSidePicksLocked(null, new Date("2026-06-08T12:00:00.000Z")), false);
});

test("Last-Chance completion state tracks eight pick categories", () => {
  assert.equal(getSidePicksCompletionCount({}), 0);
  assert.equal(getSidePicksCompletionCount({
    championTeamId: "a",
    runnerUpTeamId: "b",
    semifinalistTeamIds: ["a", "b", "c"],
    darkHorseTeamId: "d",
    favoriteFlopTeamId: null,
    highestScoringTeamId: "e",
    goldenBootPlayerId: null,
    goldenBallPlayerId: null
  }), 4);
  assert.equal(getSidePicksCompletionCount({
    championTeamId: "a",
    runnerUpTeamId: "b",
    semifinalistTeamIds: ["a", "b", "c", "d"],
    darkHorseTeamId: "e",
    favoriteFlopTeamId: "f",
    highestScoringTeamId: "g",
    goldenBootPlayerId: "player-1",
    goldenBallPlayerId: "player-2"
  }), 8);
});

test("Side Picks player awards score only from confirmed official player ids", () => {
  const pendingScores = scoreSidePicks({
    picks: {
      championTeamId: null,
      runnerUpTeamId: null,
      semifinalistTeamIds: ["champion", "runner", "dark", "semi4"],
      darkHorseTeamId: null,
      favoriteFlopTeamId: null,
      highestScoringTeamId: null,
      goldenBootPlayerId: "player-golden-boot",
      goldenBallPlayerId: "player-golden-ball"
    },
    matches
  });

  assert.equal(pendingScores.find((score) => score.key === "golden_boot")?.points, 0);
  assert.equal(pendingScores.find((score) => score.key === "golden_ball")?.points, 0);

  const confirmedScores = scoreSidePicks({
    picks: {
      championTeamId: null,
      runnerUpTeamId: null,
      semifinalistTeamIds: ["champion", "runner", "dark", "semi4"],
      darkHorseTeamId: null,
      favoriteFlopTeamId: null,
      highestScoringTeamId: null,
      goldenBootPlayerId: "player-golden-boot",
      goldenBallPlayerId: "other-player"
    },
    matches,
    officialPlayerResults: {
      golden_boot: "player-golden-boot",
      golden_ball: "player-golden-ball"
    },
    pointValues: {
      golden_boot: 11,
      golden_ball: 13
    }
  });

  assert.equal(confirmedScores.find((score) => score.key === "golden_boot")?.points, 11);
  assert.equal(confirmedScores.find((score) => score.key === "golden_ball")?.points, 0);
});

test("Side Picks normalize player award ids for stable storage", () => {
  const normalized = normalizeSidePicksSubmission({
    goldenBootPlayerId: " player-golden-boot ",
    goldenBallPlayerId: "player-golden-ball"
  });

  assert.equal(normalized.goldenBootPlayerId, "player-golden-boot");
  assert.equal(normalized.goldenBallPlayerId, "player-golden-ball");
});

test("Side Picks player award scoring is deterministic across reruns", () => {
  const input = {
    picks: {
      championTeamId: null,
      runnerUpTeamId: null,
      semifinalistTeamIds: ["champion", "runner", "dark", "semi4"],
      darkHorseTeamId: null,
      favoriteFlopTeamId: null,
      highestScoringTeamId: null,
      goldenBootPlayerId: "player-golden-boot",
      goldenBallPlayerId: "player-golden-ball"
    },
    matches,
    officialPlayerResults: {
      golden_boot: "player-golden-boot",
      golden_ball: "player-golden-ball"
    }
  } satisfies Parameters<typeof scoreSidePicks>[0];

  assert.deepEqual(scoreSidePicks(input), scoreSidePicks(input));
});

test("Last-Chance default lock prefers official first third-group-match kickoff", () => {
  const schedule = [
    { id: "a1", stage: "group_stage", groupName: "A", kickoffTime: "2026-06-12T18:00:00.000Z", homeTeamId: "a", awayTeamId: "b" },
    { id: "a2", stage: "group_stage", groupName: "A", kickoffTime: "2026-06-12T21:00:00.000Z", homeTeamId: "c", awayTeamId: "d" },
    { id: "a3", stage: "group_stage", groupName: "A", kickoffTime: "2026-06-18T18:00:00.000Z", homeTeamId: "a", awayTeamId: "c" },
    { id: "a4", stage: "group_stage", groupName: "A", kickoffTime: "2026-06-18T21:00:00.000Z", homeTeamId: "b", awayTeamId: "d" },
    { id: "a5", stage: "group_stage", groupName: "A", kickoffTime: "2026-06-24T19:00:00.000Z", homeTeamId: "a", awayTeamId: "d" },
    { id: "a6", stage: "group_stage", groupName: "A", kickoffTime: "2026-06-24T19:00:00.000Z", homeTeamId: "b", awayTeamId: "c" }
  ];

  assert.equal(deriveLastChanceLockAtFromSchedule(schedule), "2026-06-24T18:45:00.000Z");
  assert.equal(resolveLastChanceDefaultLockAt(schedule), "2026-06-24T18:45:00.000Z");
  assert.equal(resolveLastChanceDefaultLockAt([]), LAST_CHANCE_FALLBACK_LOCK_AT);
  assert.equal(formatLastChanceDeadlineLabel("2026-06-24T18:45:00.000Z"), "Closes Jun 24");
});
