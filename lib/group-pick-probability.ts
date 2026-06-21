import { getTeamRating } from "./team-strength.ts";
import type { Team } from "./types.ts";

export type PickProbabilityPlace = 1 | 2 | 3 | 4;
export type PickProbabilityMode = "exact_place" | "advance_total" | "advance_via_third";
export type PickProbabilitySource = "finish_1" | "finish_2" | "advance_total" | "advance_via_third" | "unavailable";

export type PickProbabilityResult = {
  probability: number | null;
  predictedPlace: PickProbabilityPlace;
  mode: PickProbabilityMode;
  targetLabel: "1st" | "2nd" | "advance" | "via 3rd";
  source: PickProbabilitySource;
  fullLabel: string;
  compactLabel: string;
  ariaLabel: string;
  isUnavailable?: boolean;
};

export type PickProbabilityMatchState = {
  status?: string | null;
};

export type PickProbabilityStandingsRow = {
  teamId: string;
  rank: number;
  played: number;
  goalsFor: number;
  goalDifference: number;
  points: number;
};

export type PickProbabilityTeam = Pick<
  Team,
  "id" | "name" | "shortName" | "groupName" | "fifaRank" | "fifaPoints" | "flagEmoji"
>;

export type PickProbabilityGroupRanking = {
  rankedTeamIds: string[];
};

export function mergeProbabilityRowTeamIds(
  selectedTeamIds: readonly (string | null | undefined)[],
  fullGroupTeamIds: readonly (string | null | undefined)[]
): string[] {
  const seenTeamIds = new Set<string>();
  const mergedTeamIds: string[] = [];

  for (const teamId of [...selectedTeamIds, ...fullGroupTeamIds]) {
    if (!teamId || seenTeamIds.has(teamId)) {
      continue;
    }

    seenTeamIds.add(teamId);
    mergedTeamIds.push(teamId);
  }

  return mergedTeamIds;
}

export function shouldShowMiniTablePickProbability({
  predictedPlace,
  isSelectedThirdPlaceQualifier
}: {
  predictedPlace?: PickProbabilityPlace | null;
  isSelectedThirdPlaceQualifier?: boolean;
}) {
  return predictedPlace === 1 || predictedPlace === 2 || (predictedPlace === 3 && Boolean(isSelectedThirdPlaceQualifier));
}

export function getThirdPlaceQualifierProbabilityForTeam({
  teamId,
  predictedThirdPlaceQualifierTeamIds,
  thirdPlaceQualificationProbabilityByTeamId
}: {
  teamId: string;
  predictedThirdPlaceQualifierTeamIds: ReadonlySet<string>;
  thirdPlaceQualificationProbabilityByTeamId: ReadonlyMap<string, PickProbabilityResult>;
}): PickProbabilityResult | null {
  if (!predictedThirdPlaceQualifierTeamIds.has(teamId)) {
    return null;
  }

  return thirdPlaceQualificationProbabilityByTeamId.get(teamId) ?? null;
}

export function getThirdPlaceCandidatePoolFromGroupRankings<TTeam extends PickProbabilityTeam>(
  groupRankings: PickProbabilityGroupRanking[],
  teamsById: Map<string, TTeam>
): TTeam[] {
  const seenTeamIds = new Set<string>();
  const pool: TTeam[] = [];

  for (const ranking of groupRankings) {
    const thirdPlaceTeamId = ranking.rankedTeamIds[2];
    if (!thirdPlaceTeamId || seenTeamIds.has(thirdPlaceTeamId)) {
      continue;
    }

    const team = teamsById.get(thirdPlaceTeamId);
    if (!team) {
      continue;
    }

    seenTeamIds.add(thirdPlaceTeamId);
    pool.push(team);
  }

  return pool;
}

export function getPickProbabilityForTeam({
  rows,
  remainingMatches = [],
  teamId,
  predictedPlace,
  isAdvancing,
  team,
  groupTeams = [],
  thirdPlaceRankingIndex,
  thirdPlacePool = []
}: {
  rows: PickProbabilityStandingsRow[];
  remainingMatches?: PickProbabilityMatchState[];
  teamId: string;
  predictedPlace?: PickProbabilityPlace | null;
  isAdvancing?: boolean | null;
  team?: PickProbabilityTeam | null;
  groupTeams?: PickProbabilityTeam[];
  thirdPlaceRankingIndex?: number | null;
  thirdPlacePool?: PickProbabilityTeam[];
}): PickProbabilityResult | null {
  if (!predictedPlace) {
    return null;
  }

  const row = rows.find((candidate) => candidate.teamId === teamId);
  if (!row) {
    return null;
  }

  const mode = predictedPlace <= 2 ? "exact_place" : "advance_total";
  const targetLabel = predictedPlace === 1 ? "1st" : predictedPlace === 2 ? "2nd" : "advance";

  if (isGroupFinal(rows, remainingMatches)) {
    const finalAdvanceState = isAdvancing ?? row.rank <= 2;
    return createPickProbabilityResult({
      probability: mode === "exact_place" ? (row.rank === predictedPlace ? 100 : 0) : finalAdvanceState ? 100 : 0,
      predictedPlace,
      mode,
      targetLabel
    });
  }

  if (!team) {
    return createPickProbabilityResult({
      probability: null,
      predictedPlace,
      mode,
      targetLabel,
      isUnavailable: true
    });
  }

  const sourceProbability =
    mode === "exact_place"
      ? getGroupSelectionProbability(team, predictedPlace as 1 | 2, groupTeams)
      : getAdvanceTotalProbability({
          team,
          groupTeams,
          thirdPlacePool,
          thirdPlaceRankingIndex
        });

  if (sourceProbability === null) {
    return createPickProbabilityResult({
      probability: null,
      predictedPlace,
      mode,
      targetLabel,
      isUnavailable: true
    });
  }

  const maxPlayed = rows.reduce((max, candidate) => Math.max(max, candidate.played), 0);
  const progressWeight = Math.max(0, Math.min(maxPlayed / 3, 1));

  if (progressWeight <= 0) {
    return createPickProbabilityResult({
      probability: sourceProbability,
      predictedPlace,
      mode,
      targetLabel
    });
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

  return createPickProbabilityResult({
    probability: clamp(Math.round(sourceProbability * (1 - progressWeight) + currentEstimate * progressWeight), 0, 100),
    predictedPlace,
    mode,
    targetLabel
  });
}

export function getGroupSelectionProbability(
  team: PickProbabilityTeam,
  predictedPlace: 1 | 2,
  groupTeams: PickProbabilityTeam[]
): number {
  const comparisonTeams = ensureTeamInPool(team, groupTeams);
  const strengthPercentile = getStrengthPercentile(team, comparisonTeams);
  const strengthRank = getStrengthRank(team, comparisonTeams);
  const rankDistance = strengthRank === null ? comparisonTeams.length : Math.abs(strengthRank - predictedPlace);
  const fieldSize = Math.max(4, comparisonTeams.length);
  const rankFit = 1 - Math.min(rankDistance, fieldSize - 1) / Math.max(1, fieldSize - 1);
  const placeShapeFit =
    predictedPlace === 1 ? strengthPercentile : 1 - Math.min(1, Math.abs(strengthPercentile - 0.58) / 0.58);
  const baseline = 100 / fieldSize;
  const estimate = baseline + rankFit * (predictedPlace === 1 ? 54 : 46) + placeShapeFit * 18;

  return clamp(Math.round(estimate), 28, 88);
}

export function getAdvanceViaThirdProbability(
  team: PickProbabilityTeam,
  rankingIndex: number,
  thirdPlacePool: PickProbabilityTeam[]
): number {
  const comparisonTeams = ensureTeamInPool(team, thirdPlacePool);
  const fieldSize = Math.max(8, comparisonTeams.length);
  const normalizedIndex = clamp(Math.max(0, rankingIndex), 0, fieldSize - 1);
  const rankingFit = 1 - normalizedIndex / Math.max(1, fieldSize - 1);
  const strengthPercentile = getStrengthPercentile(team, comparisonTeams);
  const estimate = 22 + rankingFit * 44 + strengthPercentile * 20;

  return clamp(Math.round(estimate), 18, 86);
}

export function resolveAdvanceViaThirdRankingIndex(
  team: PickProbabilityTeam,
  thirdPlacePool: PickProbabilityTeam[],
  thirdPlaceRankingIndex?: number | null
) {
  if (thirdPlacePool.length === 0) {
    return null;
  }

  if (typeof thirdPlaceRankingIndex === "number") {
    return thirdPlaceRankingIndex >= 0 ? thirdPlaceRankingIndex : null;
  }

  const selectedIndex = thirdPlacePool.findIndex((candidate) => candidate.id === team.id);
  return selectedIndex >= 0 ? selectedIndex : null;
}

export function getThirdPlaceSelectionProbability(
  team: PickProbabilityTeam,
  rankingIndex: number,
  thirdPlacePool: PickProbabilityTeam[]
): number {
  return getAdvanceViaThirdProbability(team, rankingIndex, thirdPlacePool);
}

export function getAdvanceViaThirdProbabilityResult({
  team,
  thirdPlacePool,
  thirdPlaceRankingIndex,
  predictedPlace = 3
}: {
  team: PickProbabilityTeam;
  thirdPlacePool: PickProbabilityTeam[];
  thirdPlaceRankingIndex?: number | null;
  predictedPlace?: 3 | 4;
}): PickProbabilityResult {
  const probability = getAdvanceViaThirdCandidateProbability({
    team,
    thirdPlacePool,
    thirdPlaceRankingIndex
  });

  return createPickProbabilityResult({
    probability,
    predictedPlace,
    mode: "advance_via_third",
    targetLabel: "via 3rd"
  });
}

export function getAdvanceTotalProbability({
  team,
  groupTeams,
  thirdPlacePool,
  thirdPlaceRankingIndex
}: {
  team: PickProbabilityTeam;
  groupTeams: PickProbabilityTeam[];
  thirdPlacePool: PickProbabilityTeam[];
  thirdPlaceRankingIndex?: number | null;
}) {
  const probFinish1 = getGroupSelectionProbability(team, 1, groupTeams);
  const probFinish2 = getGroupSelectionProbability(team, 2, groupTeams);
  const topTwoAdvanceProbability = clamp(
    Math.round(Math.max(probFinish1, probFinish2) + Math.min(probFinish1, probFinish2) * 0.35),
    14,
    94
  );
  const probAdvanceViaThird = getAdvanceViaThirdCandidateProbability({
    team,
    thirdPlacePool,
    thirdPlaceRankingIndex
  });

  if (probAdvanceViaThird === null) {
    return topTwoAdvanceProbability;
  }

  // The current model estimates independent path strengths rather than a full
  // mutually-exclusive simulation. Use the strongest available path so the
  // displayed "adv" value is total-advance oriented without double-counting.
  return clamp(Math.max(topTwoAdvanceProbability, probAdvanceViaThird), 14, 96);
}

function getAdvanceViaThirdCandidateProbability({
  team,
  thirdPlacePool,
  thirdPlaceRankingIndex
}: {
  team: PickProbabilityTeam;
  thirdPlacePool: PickProbabilityTeam[];
  thirdPlaceRankingIndex?: number | null;
}) {
  const rankingIndex = resolveAdvanceViaThirdRankingIndex(team, thirdPlacePool, thirdPlaceRankingIndex);
  if (rankingIndex !== null) {
    return getAdvanceViaThirdProbability(team, rankingIndex, thirdPlacePool);
  }

  return null;
}

function createPickProbabilityResult({
  probability,
  predictedPlace,
  mode,
  targetLabel,
  source,
  isUnavailable
}: {
  probability: number | null;
  predictedPlace: PickProbabilityPlace;
  mode: PickProbabilityMode;
  targetLabel: "1st" | "2nd" | "advance" | "via 3rd";
  source?: PickProbabilitySource;
  isUnavailable?: boolean;
}): PickProbabilityResult {
  const normalizedProbability = probability === null ? null : clamp(Math.round(probability), 0, 100);
  const normalizedSource =
    source ??
    (isUnavailable || normalizedProbability === null
      ? "unavailable"
      : mode === "exact_place"
        ? predictedPlace === 1
          ? "finish_1"
          : "finish_2"
        : mode === "advance_via_third"
          ? "advance_via_third"
          : "advance_total");
  const percentLabel = normalizedProbability === null ? "—" : `${normalizedProbability}%`;
  const fullLabel =
    mode === "exact_place"
      ? `${percentLabel} for ${targetLabel}`
      : mode === "advance_via_third"
        ? `${percentLabel} 3rd-place qual`
        : `${percentLabel} to advance`;
  const compactLabel =
    mode === "exact_place"
      ? `${percentLabel} ${targetLabel}`
      : mode === "advance_via_third"
        ? `${percentLabel} 3rd-place qual`
        : `${percentLabel} adv`;
  const ariaLabel =
    normalizedProbability === null
      ? "Pick Probability unavailable."
      : mode === "exact_place"
        ? `Pick Probability: ${normalizedProbability} percent probability this team finishes ${targetLabel}, your predicted place.`
        : mode === "advance_via_third"
          ? `Pick Probability: ${normalizedProbability} percent probability this team advances via third-place qualification.`
          : `Pick Probability: ${normalizedProbability} percent probability this team advances from the group.`;

  return {
    probability: normalizedProbability,
    predictedPlace,
    mode,
    targetLabel,
    source: normalizedSource,
    fullLabel,
    compactLabel,
    ariaLabel,
    isUnavailable
  };
}

function isGroupFinal(rows: PickProbabilityStandingsRow[], remainingMatches: PickProbabilityMatchState[]) {
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

function getAdvanceRankFit(rank: number) {
  if (rank <= 2) {
    return 78;
  }
  if (rank === 3) {
    return 42;
  }
  return 16;
}

function ensureTeamInPool(team: PickProbabilityTeam, teams: PickProbabilityTeam[]) {
  if (teams.length === 0) {
    return [team];
  }

  if (teams.some((candidate) => candidate.id === team.id)) {
    return teams;
  }

  return [...teams, team];
}

function getStrengthRank(team: PickProbabilityTeam, teams: PickProbabilityTeam[]) {
  const sorted = [...teams].sort((left, right) => {
    const ratingDiff = getTeamRating(right) - getTeamRating(left);
    if (ratingDiff !== 0) {
      return ratingDiff;
    }
    return left.name.localeCompare(right.name);
  });
  const index = sorted.findIndex((candidate) => candidate.id === team.id);
  return index >= 0 ? index + 1 : null;
}

function getStrengthPercentile(team: PickProbabilityTeam, teams: PickProbabilityTeam[]) {
  if (teams.length <= 1) {
    return 0.5;
  }

  const ratings = teams.map((candidate) => getTeamRating(candidate));
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const spread = Math.max(1, maxRating - minRating);
  return clamp((getTeamRating(team) - minRating) / spread, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
