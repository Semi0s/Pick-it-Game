import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChampionshipBadges,
  deriveChampionshipFinaleState,
  deriveFinalePercentile,
  deriveFinaleTopPercent,
  summarizeBestRound
} from "../lib/championship-finale-logic.ts";
import type { BracketScore } from "../lib/types.ts";

test("derives percentile and top-percent from final rank", () => {
  assert.equal(deriveFinalePercentile(1, 100), 100);
  assert.equal(deriveFinaleTopPercent(1, 100), 1);
  assert.equal(deriveFinaleTopPercent(50, 100), 50);
  assert.equal(deriveFinaleTopPercent(100, 100), 100);
});

test("badge priority includes champion, pool winner, and top-finish badges", () => {
  assert.deepEqual(buildChampionshipBadges({ finalRank: 1, totalPlayers: 100, bestGroupRank: 1 }), [
    "champion",
    "poolWinner",
    "top10",
    "beatTheField"
  ]);

  assert.deepEqual(buildChampionshipBadges({ finalRank: 18, totalPlayers: 100, bestGroupRank: 2 }), [
    "top25",
    "beatTheField"
  ]);
});

test("finale stays hidden before the final match is scored", () => {
  assert.deepEqual(
    deriveChampionshipFinaleState({
      transitionModality: "knockout_live",
      hasFinalMatchResult: false
    }),
    {
      isFinalized: false,
      isPendingVerification: false
    }
  );
});

test("finale unlocks as soon as the final match is scored", () => {
  assert.deepEqual(
    deriveChampionshipFinaleState({
      transitionModality: "knockout_live",
      hasFinalMatchResult: true
    }),
    {
      isFinalized: true,
      isPendingVerification: false
    }
  );
});

test("survivor badge is used as the safe fallback", () => {
  assert.deepEqual(buildChampionshipBadges({ finalRank: 90, totalPlayers: 100, bestGroupRank: 8 }), ["survivor"]);
});

test("best round summary chooses the highest-scoring round", () => {
  const scores: BracketScore[] = [
    {
      id: "1",
      userId: "u1",
      matchId: "r32-01",
      stage: "r32",
      predictedWinnerTeamId: "can",
      actualWinnerTeamId: "can",
      roundPoints: 5,
      exactScorePoints: 0,
      points: 5,
      isCorrect: true,
      scoredAt: "2026-06-28T17:00:00.000Z"
    },
    {
      id: "2",
      userId: "u1",
      matchId: "r16-01",
      stage: "r16",
      predictedWinnerTeamId: "can",
      actualWinnerTeamId: "can",
      roundPoints: 10,
      exactScorePoints: 5,
      points: 15,
      isCorrect: true,
      scoredAt: "2026-07-04T17:00:00.000Z"
    },
    {
      id: "3",
      userId: "u1",
      matchId: "r16-02",
      stage: "r16",
      predictedWinnerTeamId: "bra",
      actualWinnerTeamId: "bra",
      roundPoints: 10,
      exactScorePoints: 0,
      points: 10,
      isCorrect: true,
      scoredAt: "2026-07-04T21:00:00.000Z"
    }
  ];

  assert.deepEqual(summarizeBestRound(scores), {
    key: "roundOf16",
    points: 25
  });
});
