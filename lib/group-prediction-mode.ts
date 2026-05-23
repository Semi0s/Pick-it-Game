export type GroupPredictionMode = "bracket" | "full_scores" | "both";

const DEFAULT_GROUP_PREDICTION_MODE: GroupPredictionMode = "bracket";

export function normalizeGroupPredictionMode(value?: string | null): GroupPredictionMode {
  if (value === "full_scores" || value === "both") {
    return value;
  }

  return DEFAULT_GROUP_PREDICTION_MODE;
}

export function getConfiguredGroupPredictionMode(): GroupPredictionMode {
  return normalizeGroupPredictionMode(
    process.env.GROUP_PREDICTION_MODE ?? process.env.NEXT_PUBLIC_GROUP_PREDICTION_MODE ?? null
  );
}

export function isBracketModeEnabled(mode: GroupPredictionMode) {
  return mode === "bracket" || mode === "both";
}

export function isFullScoresModeEnabled(mode: GroupPredictionMode) {
  return mode === "full_scores" || mode === "both";
}

export function shouldHideFullScoresForLaunch(mode: GroupPredictionMode) {
  return !isFullScoresModeEnabled(mode);
}

export function shouldHideStrategyModeForLaunch() {
  return process.env.NEXT_PUBLIC_SHOW_STRATEGY_MODE === "true" ? false : true;
}
