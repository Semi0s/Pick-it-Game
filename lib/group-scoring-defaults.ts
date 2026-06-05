export type GroupStagePredictionDepth = "simple_results" | "full_match_scores";
export type FullMatchScoringVariant = "classic" | "goal_difference_bonus";
export type GroupBonusMode = "classic" | "early_bird" | "high_stakes" | "all_in";
export type GroupStageMode = "full_scores" | "light_seed_builder";

export const MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS = {
  groupStageMode: "light_seed_builder",
  groupStagePredictionDepth: "simple_results",
  fullMatchScoringVariant: "classic",
  groupBonusMode: "classic"
} as const satisfies {
  groupStageMode: GroupStageMode;
  groupStagePredictionDepth: GroupStagePredictionDepth;
  fullMatchScoringVariant: FullMatchScoringVariant;
  groupBonusMode: GroupBonusMode;
};

export const GROUP_BONUS_MODE_PRESETS = {
  classic: {
    earlyGroupStageCompletionBonus: 0,
    knockoutCompletionBonus: 0,
    finalMatchupBonus: 0,
    exactFinalScoreBonus: 0
  },
  early_bird: {
    earlyGroupStageCompletionBonus: 10,
    knockoutCompletionBonus: 10,
    finalMatchupBonus: 5,
    exactFinalScoreBonus: 5
  },
  high_stakes: {
    earlyGroupStageCompletionBonus: 3,
    knockoutCompletionBonus: 5,
    finalMatchupBonus: 12,
    exactFinalScoreBonus: 10
  },
  all_in: {
    earlyGroupStageCompletionBonus: 0,
    knockoutCompletionBonus: 0,
    finalMatchupBonus: 10,
    exactFinalScoreBonus: 20
  }
} as const satisfies Record<
  GroupBonusMode,
  {
    earlyGroupStageCompletionBonus: number;
    knockoutCompletionBonus: number;
    finalMatchupBonus: number;
    exactFinalScoreBonus: number;
  }
>;
