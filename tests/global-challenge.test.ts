import test from "node:test";
import assert from "node:assert/strict";
import {
  clampGroupStrategyAdjustments,
  computeGlobalChallengeScore,
  computeGroupStrategyComponent,
  computeKnockoutGlobalComponent,
  countUsedFades,
  countUsedStrategyPoints,
  createEmptyQualifierStatus,
  derivePlayerStageProbability,
  getGroupStrategyProbabilityMessage,
  summarizeGroupStrategyReceipt
} from "../lib/global-challenge.ts";
import {
  GLOBAL_CHALLENGE_TOTAL_WEIGHT,
  GROUP_STRATEGY_GLOBAL_WEIGHT,
  GROUP_STRATEGY_MAX_FADES,
  GROUP_STRATEGY_MAX_POINTS_PER_TEAM,
  KNOCKOUT_PICKS_GLOBAL_WEIGHT,
  STRATEGY_TOTAL_BELIEF_POINTS
} from "../lib/play-mode.ts";
import type { Team } from "../lib/types.ts";

test("Group Strategy submit after deadline is handled by tournament entry gate helpers", () => {
  assert.equal(GROUP_STRATEGY_GLOBAL_WEIGHT, 40);
  assert.equal(KNOCKOUT_PICKS_GLOBAL_WEIGHT, 60);
  assert.equal(GLOBAL_CHALLENGE_TOTAL_WEIGHT, 100);
});

test("strategy point clamp keeps boosts within budget", () => {
  const clamped = clampGroupStrategyAdjustments({
    a: { mode: "trust_more", points: 3 },
    b: { mode: "trust_more", points: 3 },
    c: { mode: "high_upside", points: 3 },
    d: { mode: "high_upside", points: 3 }
  });

  assert.equal(countUsedStrategyPoints(clamped) <= 10, true);
  assert.equal(countUsedStrategyPoints(clamped) <= STRATEGY_TOTAL_BELIEF_POINTS, true);
});

test("fade clamp limits fades to allowed count", () => {
  const clamped = clampGroupStrategyAdjustments({
    a: { mode: "fade" },
    b: { mode: "fade" },
    c: { mode: "fade" },
    d: { mode: "fade" }
  });

  assert.equal(countUsedFades(clamped), GROUP_STRATEGY_MAX_FADES);
});

test("max 3 points per team is enforced", () => {
  const clamped = clampGroupStrategyAdjustments({
    a: { mode: "trust_more", points: 7 }
  });

  assert.equal(clamped.a?.points, GROUP_STRATEGY_MAX_POINTS_PER_TEAM);
});

test("About Right consumes no points and Fade consumes no points", () => {
  const clamped = clampGroupStrategyAdjustments({
    a: { mode: "fade" },
    b: { mode: "trust_more", points: 2 }
  });

  assert.equal(countUsedStrategyPoints(clamped), 2);
  assert.equal(countUsedFades(clamped), 1);
});

test("Group Strategy score cannot exceed 40 by default", () => {
  const qualifiers = new Set(["a", "b", "c", "d"]);
  const result = computeGroupStrategyComponent({
    adjustments: {
      a: { mode: "trust_more", points: 3 },
      b: { mode: "trust_more", points: 3 },
      c: { mode: "high_upside", points: 3 },
      x: { mode: "fade" },
      y: { mode: "fade" }
    },
    heartPickTeamId: "a",
    qualifierStatus: {
      qualifiedTeamIds: qualifiers,
      allGroupsFinal: true
    },
    tournamentEntryState: "locked"
  });

  assert.equal((result.points ?? 0) <= GROUP_STRATEGY_GLOBAL_WEIGHT, true);
});

test("Knockout Picks normalized component cannot exceed 60", () => {
  const result = computeKnockoutGlobalComponent(999, 100);
  assert.equal(result.points, KNOCKOUT_PICKS_GLOBAL_WEIGHT);
});

test("Global Score cannot exceed 100", () => {
  const total = computeGlobalChallengeScore({
    groupStrategy: {
      points: 40,
      maxPoints: 40,
      status: "scored",
      adjustedTeamIds: [],
      fadedTeamIds: [],
      heartPickTeamId: null
    },
    knockout: {
      points: 60,
      maxPoints: 60,
      rawPoints: 999,
      rawMaxPoints: 100,
      status: "scored"
    }
  });

  assert.equal(total.totalPoints, 100);
});

test("Global Score equals Group Strategy component plus Knockout component", () => {
  const total = computeGlobalChallengeScore({
    groupStrategy: {
      points: 31.5,
      maxPoints: 40,
      status: "scored",
      adjustedTeamIds: [],
      fadedTeamIds: [],
      heartPickTeamId: null
    },
    knockout: {
      points: 18,
      maxPoints: 60,
      rawPoints: 18,
      rawMaxPoints: 60,
      status: "scored"
    }
  });

  assert.equal(total.totalPoints, 49.5);
});

test("empty qualifier status keeps Group Strategy pending instead of scoring knockout outcomes", () => {
  const result = computeGroupStrategyComponent({
    adjustments: {},
    heartPickTeamId: null,
    qualifierStatus: createEmptyQualifierStatus(),
    tournamentEntryState: "active"
  });

  assert.equal(result.points, null);
  assert.equal(result.status, "submitted");
});

test("receipt shows boosted teams, high-upside teams, faded teams, and heart pick", () => {
  const teamsById = new Map<string, Team>([
    ["a", { id: "a", name: "Alpha", shortName: "ALP", groupName: "A", fifaRank: 1, flagEmoji: "🏳️" }],
    ["b", { id: "b", name: "Bravo", shortName: "BRV", groupName: "A", fifaRank: 2, flagEmoji: "🏳️" }],
    ["c", { id: "c", name: "Charlie", shortName: "CHR", groupName: "A", fifaRank: 3, flagEmoji: "🏳️" }]
  ]);

  const receipt = summarizeGroupStrategyReceipt({
    teamsById,
    adjustments: {
      a: { mode: "trust_more", points: 2 },
      b: { mode: "high_upside", points: 1 },
      c: { mode: "fade" }
    },
    heartPickTeamId: "b"
  });

  assert.match(receipt.trustMore.join(" "), /Alpha/);
  assert.match(receipt.highUpside.join(" "), /Bravo/);
  assert.match(receipt.fades.join(" "), /Charlie/);
  assert.equal(receipt.heartPick, "Bravo");
});

test("missing probability data does not create fake numbers", () => {
  assert.match(getGroupStrategyProbabilityMessage(false) ?? "", /model data is connected/i);
  assert.equal(getGroupStrategyProbabilityMessage(true), null);
});

test("derivePlayerStageProbability clamps values correctly", () => {
  assert.equal(
    derivePlayerStageProbability({
      baselineProbability: 0.97,
      adjustmentType: "high_upside",
      adjustmentPoints: 3,
      isHeartPick: true,
      stage: "r32"
    }),
    0.99
  );

  assert.equal(
    derivePlayerStageProbability({
      baselineProbability: 0.03,
      adjustmentType: "fade",
      adjustmentPoints: 3,
      isHeartPick: false,
      stage: "r32"
    }),
    0.01
  );
});
