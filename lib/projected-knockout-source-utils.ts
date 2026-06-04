import type {
  GroupStagePredictionForProjection
} from "@/lib/knockout-seeding";

export type ProjectedKnockoutSource = "seed_builder" | "score_predictions";

export function hasScorePredictionInputs(predictions: GroupStagePredictionForProjection[]) {
  return predictions.some(
    (prediction) =>
      prediction.predictedHomeScore !== null &&
      prediction.predictedHomeScore !== undefined &&
      prediction.predictedAwayScore !== null &&
      prediction.predictedAwayScore !== undefined
  );
}

export function chooseProjectedKnockoutSource({
  preferredSource,
  seedResolvedSideCount,
  scoreResolvedSideCount
}: {
  preferredSource: ProjectedKnockoutSource;
  seedResolvedSideCount: number;
  scoreResolvedSideCount: number;
}): ProjectedKnockoutSource {
  if (preferredSource === "score_predictions") {
    return scoreResolvedSideCount > 0 || seedResolvedSideCount === 0 ? "score_predictions" : "seed_builder";
  }

  return seedResolvedSideCount > 0 || scoreResolvedSideCount === 0 ? "seed_builder" : "score_predictions";
}
