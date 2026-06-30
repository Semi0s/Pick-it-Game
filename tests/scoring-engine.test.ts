import test from "node:test";
import assert from "node:assert/strict";
import {
  assertScoreBreakdownInvariant,
  assignDeterministicRanks,
  assignDeterministicRanksWithComparator,
  calculateGroupMatchScoreLineItem,
  calculateKnockoutMatchScoreLineItem,
  calculateUserScoreBreakdown,
  isMatchLockedAt
} from "../lib/scoring-engine.ts";
import {
  assertCanonicalScoreBreakdownInvariant,
  calculateCanonicalLeaderboardScores
} from "../lib/canonical-scoring.ts";
import { recomputeGroupPhaseLadderScores } from "../lib/group-phase-ladder-recompute.ts";

test("full group match scoring awards exact score, goal-difference, and wrong-pick totals deterministically", () => {
  const match = {
    stage: "group" as const,
    status: "final" as const,
    homeTeamId: "mex",
    awayTeamId: "rsa",
    homeScore: 2,
    awayScore: 1
  };

  assert.equal(
    calculateGroupMatchScoreLineItem({
      userId: "user-exact",
      matchId: "group-a-1",
      match,
      prediction: {
        predictedWinnerTeamId: "mex",
        predictedIsDraw: false,
        predictedHomeScore: 2,
        predictedAwayScore: 1
      }
    }).points,
    8
  );

  assert.equal(
    calculateGroupMatchScoreLineItem({
      userId: "user-goal-diff",
      matchId: "group-a-1",
      match,
      prediction: {
        predictedWinnerTeamId: "mex",
        predictedIsDraw: false,
        predictedHomeScore: 3,
        predictedAwayScore: 2
      }
    }).points,
    4
  );

  assert.equal(
    calculateGroupMatchScoreLineItem({
      userId: "user-wrong",
      matchId: "group-a-1",
      match,
      prediction: {
        predictedWinnerTeamId: "rsa",
        predictedIsDraw: false,
        predictedHomeScore: 1,
        predictedAwayScore: 2
      }
    }).points,
    0
  );
});

test("group match scoring ignores non-final matches", () => {
  const lineItem = calculateGroupMatchScoreLineItem({
    userId: "user-live",
    matchId: "group-a-live",
    match: {
      stage: "group",
      status: "live",
      homeTeamId: "mex",
      awayTeamId: "rsa",
      homeScore: 2,
      awayScore: 1
    },
    prediction: {
      predictedWinnerTeamId: "mex",
      predictedIsDraw: false,
      predictedHomeScore: 2,
      predictedAwayScore: 1
    }
  });

  assert.equal(lineItem.points, 0);
});

test("knockout scoring uses round points plus exact-score bonus only after final", () => {
  const finalExact = calculateKnockoutMatchScoreLineItem({
    userId: "user-final",
    matchId: "final",
    match: {
      stage: "final",
      status: "final",
      homeScore: 2,
      awayScore: 0,
      winnerTeamId: "arg"
    },
    prediction: {
      predictedWinnerTeamId: "arg",
      predictedHomeScore: 2,
      predictedAwayScore: 0
    }
  });

  assert.equal(finalExact.points, 25);

  const roundOf32Exact = calculateKnockoutMatchScoreLineItem({
    userId: "user-r32",
    matchId: "r32-1",
    match: {
      stage: "r32",
      status: "final",
      homeScore: 1,
      awayScore: 0,
      winnerTeamId: "usa"
    },
    prediction: {
      predictedWinnerTeamId: "usa",
      predictedHomeScore: 1,
      predictedAwayScore: 0
    }
  });

  assert.equal(roundOf32Exact.points, 8);

  const scheduled = calculateKnockoutMatchScoreLineItem({
    userId: "user-scheduled",
    matchId: "r16-1",
    match: {
      stage: "r16",
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      winnerTeamId: null
    },
    prediction: {
      predictedWinnerTeamId: "usa",
      predictedHomeScore: 1,
      predictedAwayScore: 0
    }
  });

  assert.equal(scheduled.points, 0);
});

test("knockout golden scoring values are stable for every supported round", () => {
  const goldenRounds = [
    { stage: "r32" as const, winnerOnly: 3, exact: 8 },
    { stage: "r16" as const, winnerOnly: 5, exact: 10 },
    { stage: "qf" as const, winnerOnly: 8, exact: 13 },
    { stage: "sf" as const, winnerOnly: 10, exact: 15 },
    { stage: "third" as const, winnerOnly: 5, exact: 10 },
    { stage: "final" as const, winnerOnly: 15, exact: 25 }
  ];

  for (const round of goldenRounds) {
    const winnerOnly = calculateKnockoutMatchScoreLineItem({
      userId: `user-${round.stage}`,
      matchId: `M-${round.stage}`,
      match: {
        stage: round.stage,
        status: "final",
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: "home"
      },
      prediction: {
        predictedWinnerTeamId: "home",
        predictedHomeScore: 1,
        predictedAwayScore: 0
      }
    });
    const exact = calculateKnockoutMatchScoreLineItem({
      userId: `user-${round.stage}`,
      matchId: `M-${round.stage}`,
      match: {
        stage: round.stage,
        status: "final",
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: "home"
      },
      prediction: {
        predictedWinnerTeamId: "home",
        predictedHomeScore: 2,
        predictedAwayScore: 1
      }
    });
    const wrong = calculateKnockoutMatchScoreLineItem({
      userId: `user-${round.stage}`,
      matchId: `M-${round.stage}`,
      match: {
        stage: round.stage,
        status: "final",
        homeScore: 2,
        awayScore: 1,
        winnerTeamId: "home"
      },
      prediction: {
        predictedWinnerTeamId: "away",
        predictedHomeScore: 1,
        predictedAwayScore: 2
      }
    });

    assert.equal(winnerOnly.points, round.winnerOnly);
    assert.equal(exact.points, round.exact);
    assert.equal(wrong.points, 0);
  }
});

test("knockout tied score with explicit winner still awards exact-score bonus fairly", () => {
  const tiedKnockoutExact = calculateKnockoutMatchScoreLineItem({
    userId: "user-penalties",
    matchId: "r32-pen",
    match: {
      stage: "r32",
      status: "final",
      homeScore: 1,
      awayScore: 1,
      winnerTeamId: "ger"
    },
    prediction: {
      predictedWinnerTeamId: "ger",
      predictedHomeScore: 1,
      predictedAwayScore: 1
    }
  });

  const tiedKnockoutWrongWinner = calculateKnockoutMatchScoreLineItem({
    userId: "user-penalties-wrong",
    matchId: "r32-pen",
    match: {
      stage: "r32",
      status: "final",
      homeScore: 1,
      awayScore: 1,
      winnerTeamId: "ger"
    },
    prediction: {
      predictedWinnerTeamId: "par",
      predictedHomeScore: 1,
      predictedAwayScore: 1
    }
  });

  assert.equal(tiedKnockoutExact.points, 8);
  assert.equal(tiedKnockoutWrongWinner.points, 0);
});

test("score breakdown totals always equal line-item sums", () => {
  const breakdown = calculateUserScoreBreakdown({
    userId: "user-total",
    lineItems: [
      {
        userId: "user-total",
        source: "group_match",
        points: 8,
        reasonKey: "scoring.groupMatch",
        matchId: "group-a-1"
      },
      {
        userId: "user-total",
        source: "knockout_match",
        points: 25,
        reasonKey: "scoring.knockoutMatch",
        matchId: "final"
      }
    ]
  });

  assert.equal(breakdown.totalPoints, 33);
  assert.doesNotThrow(() => assertScoreBreakdownInvariant(breakdown));
});

test("leaderboard ranking is deterministic with competition ranks and user id tie-breakers", () => {
  const ranked = assignDeterministicRanks([
    { user_id: "user-c", total_points: 5 },
    { user_id: "user-b", total_points: 10 },
    { user_id: "user-a", total_points: 10 },
    { user_id: "user-d", total_points: 0 }
  ]);

  assert.deepEqual(
    ranked.map((entry) => ({ user_id: entry.user_id, rank: entry.rank })),
    [
      { user_id: "user-a", rank: 1 },
      { user_id: "user-b", rank: 1 },
      { user_id: "user-c", rank: 3 },
      { user_id: "user-d", rank: 4 }
    ]
  );
});

test("group leaderboard filtering uses the same deterministic score ordering for members only", () => {
  const memberIds = new Set(["user-a", "user-c", "user-d"]);
  const rankedGroup = assignDeterministicRanks(
    [
      { user_id: "user-a", total_points: 12 },
      { user_id: "user-b", total_points: 40 },
      { user_id: "user-c", total_points: 12 },
      { user_id: "user-d", total_points: 3 }
    ].filter((entry) => memberIds.has(entry.user_id))
  );

  assert.deepEqual(
    rankedGroup.map((entry) => ({ user_id: entry.user_id, rank: entry.rank })),
    [
      { user_id: "user-a", rank: 1 },
      { user_id: "user-c", rank: 1 },
      { user_id: "user-d", rank: 3 }
    ]
  );
});

test("custom leaderboard comparator can break projected ties without changing shared ranks", () => {
  const ranked = assignDeterministicRanksWithComparator(
    [
      { user_id: "user-z", total_points: 12, tiebreak_points: 4, tiebreak_name: "Zulu" },
      { user_id: "user-a", total_points: 12, tiebreak_points: 6, tiebreak_name: "Alpha" },
      { user_id: "user-b", total_points: 12, tiebreak_points: 6, tiebreak_name: "Bravo" },
      { user_id: "user-c", total_points: 9, tiebreak_points: 8, tiebreak_name: "Charlie" }
    ],
    (left, right) =>
      right.total_points - left.total_points ||
      right.tiebreak_points - left.tiebreak_points ||
      left.tiebreak_name.localeCompare(right.tiebreak_name) ||
      left.user_id.localeCompare(right.user_id)
  );

  assert.deepEqual(
    ranked.map((entry) => ({ user_id: entry.user_id, rank: entry.rank })),
    [
      { user_id: "user-a", rank: 1 },
      { user_id: "user-b", rank: 1 },
      { user_id: "user-z", rank: 1 },
      { user_id: "user-c", rank: 4 }
    ]
  );
});

test("match lock boundaries are enforced at kickoff time in UTC milliseconds", () => {
  const kickoffTime = "2026-06-11T19:00:00.000Z";
  const kickoffMs = new Date(kickoffTime).getTime();

  assert.equal(isMatchLockedAt({ status: "scheduled", kickoffTime }, kickoffMs - 1000), false);
  assert.equal(isMatchLockedAt({ status: "scheduled", kickoffTime }, kickoffMs), true);
  assert.equal(isMatchLockedAt({ status: "scheduled", kickoffTime }, kickoffMs + 1000), true);
  assert.equal(isMatchLockedAt({ status: "live", kickoffTime }, kickoffMs - 60_000), true);
  assert.equal(isMatchLockedAt({ status: "final", kickoffTime: null }, kickoffMs - 60_000), true);
});

test("canonical totals use Group Phase ladder scores instead of legacy full-score rows", () => {
  const ladderScores = recomputeGroupPhaseLadderScores({
    userIds: ["user-a", "user-b"],
    actualOutcomes: [
      { groupName: "Group A", rankedTeamIds: ["a1", "a2", "a3", "a4"], thirdPlaceQualified: true },
      { groupName: "Group B", rankedTeamIds: ["b1", "b2", "b3", "b4"], thirdPlaceQualified: false }
    ],
    requiredThirdPlaceQualifierCount: 1,
    groupSeedRankings: [
      { user_id: "user-a", group_name: "Group A", rank_position: 1, team_id: "a1" },
      { user_id: "user-a", group_name: "Group A", rank_position: 2, team_id: "a2" },
      { user_id: "user-a", group_name: "Group A", rank_position: 3, team_id: "a3" },
      { user_id: "user-a", group_name: "Group A", rank_position: 4, team_id: "a4" },
      { user_id: "user-a", group_name: "Group B", rank_position: 1, team_id: "b2" },
      { user_id: "user-a", group_name: "Group B", rank_position: 2, team_id: "b1" },
      { user_id: "user-a", group_name: "Group B", rank_position: 3, team_id: "b3" },
      { user_id: "user-a", group_name: "Group B", rank_position: 4, team_id: "b4" }
    ],
    thirdPlaceRankings: [{ user_id: "user-a", team_id: "a3", rank_position: 1 }]
  });
  const groupPhaseScores = new Map(
    Array.from(ladderScores.entries()).map(([userId, score]) => [userId, score.points] as const)
  );
  const legacyFullScoreTotals = new Map([["user-a", 1_000]]);

  const ranked = calculateCanonicalLeaderboardScores({
    users: ["user-a", "user-b"],
    groupPhaseScores,
    knockoutScores: new Map([["user-a", 5]]),
    standardSidePickScores: new Map([["user-a", 2]])
  });

  assert.equal(legacyFullScoreTotals.get("user-a"), 1_000);
  assert.equal(ladderScores.get("user-a")?.points, 18);
  assert.deepEqual(
    ranked.map((entry) => ({ user_id: entry.user_id, total_points: entry.total_points, rank: entry.rank })),
    [
      { user_id: "user-a", total_points: 25, rank: 1 },
      { user_id: "user-b", total_points: 0, rank: 2 }
    ]
  );
  assert.doesNotThrow(() => assertCanonicalScoreBreakdownInvariant(ranked[0].breakdown));
});

test("canonical group leaderboard adds group-custom points only in group scope", () => {
  const globalEntries = calculateCanonicalLeaderboardScores({
    users: ["user-a", "user-b"],
    groupPhaseScores: new Map([
      ["user-a", 10],
      ["user-b", 10]
    ]),
    knockoutScores: new Map([["user-b", 3]]),
    standardSidePickScores: new Map([["user-a", 1]]),
    groupCustomScores: new Map([["user-a", 99]])
  });
  const groupEntries = calculateCanonicalLeaderboardScores({
    users: ["user-a", "user-b"],
    groupPhaseScores: new Map([
      ["user-a", 10],
      ["user-b", 10]
    ]),
    knockoutScores: new Map([["user-b", 3]]),
    standardSidePickScores: new Map([["user-a", 1]]),
    groupCustomScores: new Map([["user-a", 99]]),
    groupId: "group-1",
    includeGroupCustom: true
  });

  assert.deepEqual(
    globalEntries.map((entry) => ({ user_id: entry.user_id, total_points: entry.total_points, rank: entry.rank })),
    [
      { user_id: "user-b", total_points: 13, rank: 1 },
      { user_id: "user-a", total_points: 11, rank: 2 }
    ]
  );
  assert.deepEqual(
    groupEntries.map((entry) => ({ user_id: entry.user_id, total_points: entry.total_points, rank: entry.rank })),
    [
      { user_id: "user-a", total_points: 110, rank: 1 },
      { user_id: "user-b", total_points: 13, rank: 2 }
    ]
  );
  for (const entry of groupEntries) {
    assert.doesNotThrow(() => assertCanonicalScoreBreakdownInvariant(entry.breakdown));
  }
});
