import type { MiniGroupStandingsRow } from "@/components/GroupStandingsMiniTable";

export type PickProbabilityPlace = 1 | 2 | 3 | 4;
export type PickProbabilityMode = "exact_place" | "advance";

export type PickProbabilityResult = {
  probability: number | null;
  predictedPlace: PickProbabilityPlace;
  mode: PickProbabilityMode;
  targetLabel: "1st" | "2nd" | "advance";
};

export type PickProbabilityMatchState = {
  status?: string | null;
};

export function getPickProbabilityForTeam({
  rows,
  remainingMatches = [],
  teamId,
  predictedPlace,
  isAdvancing
}: {
  rows: MiniGroupStandingsRow[];
  remainingMatches?: PickProbabilityMatchState[];
  teamId: string;
  predictedPlace?: PickProbabilityPlace | null;
  isAdvancing?: boolean | null;
}): PickProbabilityResult | null {
  if (!predictedPlace) {
    return null;
  }

  const row = rows.find((candidate) => candidate.teamId === teamId);
  if (!row) {
    return null;
  }

  const mode = predictedPlace <= 2 ? "exact_place" : "advance";
  const targetLabel = predictedPlace === 1 ? "1st" : predictedPlace === 2 ? "2nd" : "advance";

  if (isGroupFinal(rows, remainingMatches)) {
    const finalAdvanceState = isAdvancing ?? row.rank <= 2;
    return {
      probability: mode === "exact_place" ? (row.rank === predictedPlace ? 100 : 0) : finalAdvanceState ? 100 : 0,
      predictedPlace,
      mode,
      targetLabel
    };
  }

  // TODO: Replace this deterministic placeholder with a simulation model that
  // uses team strength ratings, actual results, and remaining group fixtures.
  const baseProbability = getBaseProbability(predictedPlace, mode);
  const maxPlayed = rows.reduce((max, candidate) => Math.max(max, candidate.played), 0);
  const progressWeight = Math.max(0, Math.min(maxPlayed / 3, 1));

  if (progressWeight <= 0) {
    return {
      probability: baseProbability,
      predictedPlace,
      mode,
      targetLabel
    };
  }

  const rankFit = mode === "exact_place" ? 92 - Math.abs(row.rank - predictedPlace) * 26 : getAdvanceRankFit(row.rank);
  const points = rows.map((candidate) => candidate.points);
  const minPoints = Math.min(...points);
  const maxPoints = Math.max(...points);
  const pointsSpread = Math.max(1, maxPoints - minPoints);
  const teamPower = (row.points - minPoints) / pointsSpread;
  const targetPower = predictedPlace === 1 ? 0.95 : predictedPlace === 2 ? 0.63 : predictedPlace === 3 ? 0.42 : 0.18;
  const powerFit = 100 - Math.abs(teamPower - targetPower) * 42;
  const formAdjustment = clamp(row.goalDifference * 3 + row.goalsFor, -8, 8);
  const currentEstimate = clamp(Math.round(rankFit * 0.72 + powerFit * 0.28 + formAdjustment), 3, 97);

  return {
    probability: clamp(Math.round(baseProbability * (1 - progressWeight) + currentEstimate * progressWeight), 0, 100),
    predictedPlace,
    mode,
    targetLabel
  };
}

function isGroupFinal(rows: MiniGroupStandingsRow[], remainingMatches: PickProbabilityMatchState[]) {
  if (rows.length === 0) {
    return false;
  }

  const eachTeamPlayedThree = rows.every((row) => row.played >= 3);
  if (eachTeamPlayedThree) {
    return true;
  }

  const hasKnownRemainingMatch = remainingMatches.some((match) => match.status !== "final");
  const totalPlayedMatches = rows.reduce((sum, row) => sum + row.played, 0) / 2;
  return totalPlayedMatches >= 6 && !hasKnownRemainingMatch;
}

function getBaseProbability(predictedPlace: PickProbabilityPlace, mode: PickProbabilityMode) {
  if (mode === "advance") {
    return predictedPlace === 3 ? 31 : 12;
  }
  return predictedPlace === 1 ? 68 : 52;
}

function getAdvanceRankFit(rank: number) {
  if (rank <= 2) {
    return 78;
  }
  if (rank === 3) {
    return 42;
  }
  return 16;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
