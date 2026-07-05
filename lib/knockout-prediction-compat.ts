export type KnockoutPredictionCompatibilityInput = {
  predictedWinnerTeamId: string | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

export type CompatibleKnockoutPredictionState = {
  isCompatible: boolean;
  predictedWinnerTeamId: string | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
};

export function isKnockoutPredictionCompatibleWithMatchup(
  input: Pick<KnockoutPredictionCompatibilityInput, "predictedWinnerTeamId" | "homeTeamId" | "awayTeamId">
) {
  return Boolean(
    input.homeTeamId &&
      input.awayTeamId &&
      input.predictedWinnerTeamId &&
      [input.homeTeamId, input.awayTeamId].includes(input.predictedWinnerTeamId)
  );
}

export function getCompatibleKnockoutPredictionState(
  input: KnockoutPredictionCompatibilityInput
): CompatibleKnockoutPredictionState {
  const isCompatible = isKnockoutPredictionCompatibleWithMatchup(input);
  if (!isCompatible) {
    return {
      isCompatible: false,
      predictedWinnerTeamId: null,
      predictedHomeScore: null,
      predictedAwayScore: null
    };
  }

  return {
    isCompatible: true,
    predictedWinnerTeamId: input.predictedWinnerTeamId,
    predictedHomeScore: input.predictedHomeScore,
    predictedAwayScore: input.predictedAwayScore
  };
}
