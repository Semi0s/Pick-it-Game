import type { MatchStage, Team } from "./types.ts";
import {
  GLOBAL_CHALLENGE_TOTAL_WEIGHT,
  GROUP_STRATEGY_GLOBAL_WEIGHT,
  GROUP_STRATEGY_MAX_FADES,
  GROUP_STRATEGY_MAX_POINTS_PER_TEAM,
  KNOCKOUT_PICKS_GLOBAL_WEIGHT,
  STRATEGY_TOTAL_BELIEF_POINTS
} from "./play-mode.ts";

export type GroupStrategyAdjustmentMode = "trust_more" | "high_upside" | "fade";

export type GroupStrategyAdjustment = {
  mode: GroupStrategyAdjustmentMode;
  points?: number;
};

export type GroupStrategyAdjustmentMap = Record<string, GroupStrategyAdjustment>;

export type GroupStrategyBucket = "favorites" | "contenders" | "bubble" | "longshots";

export type GroupStrategyComponentBreakdown = {
  points: number | null;
  maxPoints: number;
  status: "draft" | "submitted" | "locked" | "pending" | "scored";
  adjustedTeamIds: string[];
  fadedTeamIds: string[];
  heartPickTeamId: string | null;
};

export type KnockoutGlobalComponentBreakdown = {
  points: number | null;
  maxPoints: number;
  rawPoints: number;
  rawMaxPoints: number;
  status: "pending" | "open" | "scored";
};

export type GlobalChallengeScoreBreakdown = {
  groupStrategy: GroupStrategyComponentBreakdown;
  knockout: KnockoutGlobalComponentBreakdown;
  totalPoints: number | null;
  totalMaxPoints: number;
};

export type PlayerStageProbabilityInput = {
  baselineProbability: number | null | undefined;
  adjustmentType?: GroupStrategyAdjustmentMode | "about_right" | null;
  adjustmentPoints?: number | null;
  isHeartPick?: boolean;
  stage: "r32" | "r16" | "qf" | "sf" | "final" | "champion";
};

export const GROUP_STRATEGY_PROBABILITY_MESSAGE =
  "Probability comparison will appear once model data is connected.";

const PLAYER_STAGE_PROBABILITY_FLOOR = 0.01;
const PLAYER_STAGE_PROBABILITY_CEILING = 0.99;

const STAGE_ADJUSTMENT_LIMITS: Record<PlayerStageProbabilityInput["stage"], {
  trustPerPoint: number;
  trustCap: number;
  upsidePerPoint: number;
  upsideCap: number;
  fadeDelta: number;
  fadeCap: number;
  heartDelta: number;
}> = {
  r32: { trustPerPoint: 0.08, trustCap: 0.18, upsidePerPoint: 0.1, upsideCap: 0.22, fadeDelta: 0.1, fadeCap: 0.2, heartDelta: 0.08 },
  r16: { trustPerPoint: 0.06, trustCap: 0.14, upsidePerPoint: 0.08, upsideCap: 0.18, fadeDelta: 0.08, fadeCap: 0.16, heartDelta: 0.06 },
  qf: { trustPerPoint: 0.05, trustCap: 0.12, upsidePerPoint: 0.07, upsideCap: 0.15, fadeDelta: 0.07, fadeCap: 0.14, heartDelta: 0.05 },
  sf: { trustPerPoint: 0.04, trustCap: 0.1, upsidePerPoint: 0.06, upsideCap: 0.13, fadeDelta: 0.06, fadeCap: 0.12, heartDelta: 0.04 },
  final: { trustPerPoint: 0.03, trustCap: 0.08, upsidePerPoint: 0.05, upsideCap: 0.1, fadeDelta: 0.05, fadeCap: 0.1, heartDelta: 0.03 },
  champion: { trustPerPoint: 0.02, trustCap: 0.06, upsidePerPoint: 0.04, upsideCap: 0.08, fadeDelta: 0.04, fadeCap: 0.08, heartDelta: 0.02 }
};

type QualifierStatus = {
  qualifiedTeamIds: Set<string>;
  allGroupsFinal: boolean;
};

const QUALIFIED_ACTION_WEIGHT: Record<GroupStrategyAdjustmentMode, number> = {
  trust_more: 1.45,
  high_upside: 1.4,
  fade: 0.3
};

const NON_QUALIFIED_FADE_WEIGHT = 0.6;
const HEART_PICK_QUALIFIED_BONUS = 0.25;

export function normalizeGroupStrategyAdjustments(value?: unknown): GroupStrategyAdjustmentMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const normalized: GroupStrategyAdjustmentMap = {};

  for (const [teamId, rawValue] of Object.entries(candidate)) {
    if (!rawValue || typeof rawValue !== "object") {
      continue;
    }

    const entry = rawValue as Record<string, unknown>;
    const mode = entry.mode;
    if (mode !== "trust_more" && mode !== "high_upside" && mode !== "fade") {
      continue;
    }

    const points =
      mode === "fade"
        ? undefined
        : Math.max(1, Math.min(GROUP_STRATEGY_MAX_POINTS_PER_TEAM, Math.round(Number(entry.points ?? 1) || 1)));

    normalized[teamId] = points ? { mode, points } : { mode };
  }

  return clampGroupStrategyAdjustments(normalized);
}

export function clampGroupStrategyAdjustments(input: GroupStrategyAdjustmentMap): GroupStrategyAdjustmentMap {
  const fadeEntries = Object.entries(input).filter(([, value]) => value.mode === "fade").slice(0, GROUP_STRATEGY_MAX_FADES);
  const boostEntries = Object.entries(input)
    .filter(([, value]) => value.mode !== "fade")
    .map(([teamId, value]) => [
      teamId,
      {
        mode: value.mode,
        points: Math.max(1, Math.min(GROUP_STRATEGY_MAX_POINTS_PER_TEAM, Math.round(value.points ?? 1)))
      } satisfies GroupStrategyAdjustment
    ] as const)
    .sort((left, right) => (right[1].points ?? 1) - (left[1].points ?? 1));

  const normalized: GroupStrategyAdjustmentMap = {};
  let remainingPoints = STRATEGY_TOTAL_BELIEF_POINTS;

  for (const [teamId, value] of boostEntries) {
    if (remainingPoints <= 0) {
      break;
    }

    const nextPoints = Math.min(value.points ?? 1, remainingPoints);
    normalized[teamId] = {
      mode: value.mode,
      points: nextPoints
    };
    remainingPoints -= nextPoints;
  }

  for (const [teamId, value] of fadeEntries) {
    normalized[teamId] = value;
  }

  return normalized;
}

export function countUsedStrategyPoints(adjustments: GroupStrategyAdjustmentMap) {
  return Object.values(adjustments).reduce(
    (sum, value) => sum + (value.mode === "fade" ? 0 : Math.max(1, value.points ?? 1)),
    0
  );
}

export function countUsedFades(adjustments: GroupStrategyAdjustmentMap) {
  return Object.values(adjustments).filter((value) => value.mode === "fade").length;
}

export function getGroupStrategyBucket(team: Team): GroupStrategyBucket {
  if (team.fifaRank <= 12) {
    return "favorites";
  }
  if (team.fifaRank <= 24) {
    return "contenders";
  }
  if (team.fifaRank <= 48) {
    return "bubble";
  }
  return "longshots";
}

export function computeGroupStrategyComponent(params: {
  adjustments: GroupStrategyAdjustmentMap;
  heartPickTeamId?: string | null;
  qualifierStatus: QualifierStatus;
  tournamentEntryState?: "draft" | "active" | "locked" | "inactive" | "archived" | null;
}): GroupStrategyComponentBreakdown {
  const adjustments = clampGroupStrategyAdjustments(params.adjustments);
  const adjustedTeamIds = Object.keys(adjustments).filter((teamId) => adjustments[teamId]?.mode !== "fade");
  const fadedTeamIds = Object.keys(adjustments).filter((teamId) => adjustments[teamId]?.mode === "fade");

  if (!params.qualifierStatus.allGroupsFinal || params.qualifierStatus.qualifiedTeamIds.size === 0) {
    return {
      points: null,
      maxPoints: GROUP_STRATEGY_GLOBAL_WEIGHT,
      status: params.tournamentEntryState === "active" || params.tournamentEntryState === "locked" ? "submitted" : "draft",
      adjustedTeamIds,
      fadedTeamIds,
      heartPickTeamId: params.heartPickTeamId ?? null
    };
  }

  let raw = 0;
  for (const teamId of params.qualifierStatus.qualifiedTeamIds) {
    const adjustment = adjustments[teamId];
    if (!adjustment) {
      raw += 1;
      continue;
    }

    if (adjustment.mode === "fade") {
      raw += QUALIFIED_ACTION_WEIGHT.fade;
      continue;
    }

    const tierLift = adjustment.mode === "trust_more"
      ? 1 + ((adjustment.points ?? 1) - 1) * 0.15
      : 1 + ((adjustment.points ?? 1) - 1) * 0.1;
    raw += Math.min(QUALIFIED_ACTION_WEIGHT[adjustment.mode], tierLift);
  }

  for (const [teamId, adjustment] of Object.entries(adjustments)) {
    if (adjustment.mode !== "fade") {
      continue;
    }

    if (!params.qualifierStatus.qualifiedTeamIds.has(teamId)) {
      raw += NON_QUALIFIED_FADE_WEIGHT;
    }
  }

  if (params.heartPickTeamId && params.qualifierStatus.qualifiedTeamIds.has(params.heartPickTeamId)) {
    raw += HEART_PICK_QUALIFIED_BONUS;
  }

  const qualifierCount = params.qualifierStatus.qualifiedTeamIds.size;
  const rawMax = qualifierCount * QUALIFIED_ACTION_WEIGHT.trust_more +
    GROUP_STRATEGY_MAX_FADES * NON_QUALIFIED_FADE_WEIGHT +
    HEART_PICK_QUALIFIED_BONUS;
  const normalizedPoints = rawMax > 0
    ? Math.min(
        GROUP_STRATEGY_GLOBAL_WEIGHT,
        Number(((GROUP_STRATEGY_GLOBAL_WEIGHT * raw) / rawMax).toFixed(1))
      )
    : 0;

  return {
    points: normalizedPoints,
    maxPoints: GROUP_STRATEGY_GLOBAL_WEIGHT,
    status: "scored",
    adjustedTeamIds,
    fadedTeamIds,
    heartPickTeamId: params.heartPickTeamId ?? null
  };
}

export function computeKnockoutGlobalComponent(rawPoints: number, rawMaxPoints: number): KnockoutGlobalComponentBreakdown {
  if (rawMaxPoints <= 0) {
    return {
      points: null,
      maxPoints: KNOCKOUT_PICKS_GLOBAL_WEIGHT,
      rawPoints,
      rawMaxPoints,
      status: "pending"
    };
  }

  const points = Math.min(
    KNOCKOUT_PICKS_GLOBAL_WEIGHT,
    Number(((KNOCKOUT_PICKS_GLOBAL_WEIGHT * Math.max(0, rawPoints)) / rawMaxPoints).toFixed(1))
  );

  return {
    points,
    maxPoints: KNOCKOUT_PICKS_GLOBAL_WEIGHT,
    rawPoints,
    rawMaxPoints,
    status: rawPoints > 0 ? "scored" : "open"
  };
}

export function computeGlobalChallengeScore(params: {
  groupStrategy: GroupStrategyComponentBreakdown;
  knockout: KnockoutGlobalComponentBreakdown;
}): GlobalChallengeScoreBreakdown {
  const groupPoints = params.groupStrategy.points ?? 0;
  const knockoutPoints = params.knockout.points ?? 0;
  const hasAnyScoredComponent = params.groupStrategy.points !== null || params.knockout.points !== null;

  return {
    groupStrategy: params.groupStrategy,
    knockout: params.knockout,
    totalPoints: hasAnyScoredComponent
      ? Math.min(GLOBAL_CHALLENGE_TOTAL_WEIGHT, Number((groupPoints + knockoutPoints).toFixed(1)))
      : null,
    totalMaxPoints: GLOBAL_CHALLENGE_TOTAL_WEIGHT
  };
}

export function createEmptyQualifierStatus(): QualifierStatus {
  return {
    qualifiedTeamIds: new Set<string>(),
    allGroupsFinal: false
  };
}

export function summarizeGroupStrategyReceipt(params: {
  teamsById: Map<string, Team>;
  adjustments: GroupStrategyAdjustmentMap;
  heartPickTeamId?: string | null;
}) {
  const trustMore: string[] = [];
  const highUpside: string[] = [];
  const fades: string[] = [];

  for (const [teamId, adjustment] of Object.entries(clampGroupStrategyAdjustments(params.adjustments))) {
    const teamName = params.teamsById.get(teamId)?.name ?? teamId;
    if (adjustment.mode === "trust_more") {
      trustMore.push(`${teamName} +${adjustment.points ?? 1}`);
    } else if (adjustment.mode === "high_upside") {
      highUpside.push(`${teamName} +${adjustment.points ?? 1}`);
    } else if (adjustment.mode === "fade") {
      fades.push(teamName);
    }
  }

  return {
    trustMore,
    highUpside,
    fades,
    heartPick: params.heartPickTeamId ? params.teamsById.get(params.heartPickTeamId)?.name ?? null : null
  };
}

export function getGroupStrategyProbabilityMessage(hasModelData: boolean) {
  return hasModelData ? null : GROUP_STRATEGY_PROBABILITY_MESSAGE;
}

export function isKnockoutStage(stage: MatchStage) {
  return stage !== "group";
}

export function derivePlayerStageProbability({
  baselineProbability,
  adjustmentType,
  adjustmentPoints,
  isHeartPick,
  stage
}: PlayerStageProbabilityInput) {
  const normalizedBaseline = clampProbability(typeof baselineProbability === "number" ? baselineProbability : 0.5);
  const stageRules = STAGE_ADJUSTMENT_LIMITS[stage];
  const points = Math.max(0, Math.min(GROUP_STRATEGY_MAX_POINTS_PER_TEAM, Math.round(adjustmentPoints ?? 0)));
  let adjustedProbability = normalizedBaseline;

  if (adjustmentType === "trust_more" && points > 0) {
    adjustedProbability += Math.min(stageRules.trustCap, stageRules.trustPerPoint * points);
  } else if (adjustmentType === "high_upside" && points > 0) {
    adjustedProbability += Math.min(stageRules.upsideCap, stageRules.upsidePerPoint * points);
  } else if (adjustmentType === "fade") {
    adjustedProbability -= Math.min(stageRules.fadeCap, stageRules.fadeDelta * Math.max(1, points || 1));
  }

  if (isHeartPick) {
    adjustedProbability += stageRules.heartDelta;
  }

  return clampProbability(adjustedProbability);
}

function clampProbability(value: number) {
  return Math.min(PLAYER_STAGE_PROBABILITY_CEILING, Math.max(PLAYER_STAGE_PROBABILITY_FLOOR, Number(value.toFixed(4))));
}
