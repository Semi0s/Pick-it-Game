import { canEditPrediction } from "@/lib/prediction-state";
import { getTeamRating } from "@/lib/team-strength";
import type {
  AutoPickDraft,
  AutoPickOutcome,
  AutoPickResult,
  AutoPickTotalTier,
  MatchProbabilitySnapshot,
  MatchProbabilitySnapshotSource,
  MatchWithTeams
} from "@/lib/types";

export const AUTO_PICK_DRAFT_STORAGE_KEY = "pickit:auto-pick-draft";

const SNAPSHOT_SOURCE_PRIORITY: MatchProbabilitySnapshotSource[] = ["manual", "polymarket", "ranking", "neutral"];

const SCORE_POOLS: Record<AutoPickOutcome, Record<AutoPickTotalTier, Array<[number, number]>>> = {
  home: {
    low: [
      [1, 0],
      [2, 0]
    ],
    medium: [
      [2, 1],
      [3, 1]
    ],
    high: [
      [3, 2],
      [4, 2]
    ]
  },
  away: {
    low: [
      [0, 1],
      [0, 2]
    ],
    medium: [
      [1, 2],
      [1, 3]
    ],
    high: [
      [2, 3],
      [2, 4]
    ]
  },
  draw: {
    low: [
      [0, 0],
      [1, 1]
    ],
    medium: [
      [1, 1],
      [2, 2]
    ],
    high: [
      [2, 2],
      [3, 3]
    ]
  }
};

type ProbabilityModel = {
  source: MatchProbabilitySnapshotSource;
  homeRating: number | null;
  awayRating: number | null;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  over25Probability?: number | null;
};

type WeightedOutcomeSelection = {
  outcome: AutoPickOutcome;
  randomRoll: number;
};

type AutoPickDebugPayload = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  source: string;
  homeRating: number | null;
  awayRating: number | null;
  ratingDiff: number | null;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  selectedOutcome: AutoPickOutcome;
  selectedScore: string;
  randomRoll: number;
};

export function getNextOpenMatch(matches: MatchWithTeams[]) {
  return [...matches]
    .filter((match) => canEditPrediction(match.status))
    .sort((left, right) => left.kickoffTime.localeCompare(right.kickoffTime))[0] ?? null;
}

export function buildAutoPickDraft(result: AutoPickResult): AutoPickDraft {
  return {
    ...result,
    token: `${result.matchId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
  };
}

export function getAutoPickForMatch(
  match: MatchWithTeams,
  snapshots: MatchProbabilitySnapshot[] = []
): AutoPickResult {
  const selectedSource = selectProbabilitySource(match, snapshots);
  const { outcome: selectedOutcome, randomRoll } = pickWeightedOutcome(
    selectedSource.homeWinProbability,
    selectedSource.drawProbability,
    selectedSource.awayWinProbability
  );
  const totalTier = pickTotalTier(match, selectedSource.over25Probability ?? null);
  const [homeScore, awayScore] = pickScoreline(selectedOutcome, totalTier);

  logAutoPickDebug({
    matchId: match.id,
    homeTeam: match.homeTeam?.name ?? match.homeTeam?.shortName ?? "Home",
    awayTeam: match.awayTeam?.name ?? match.awayTeam?.shortName ?? "Away",
    source: selectedSource.source,
    homeRating: selectedSource.homeRating,
    awayRating: selectedSource.awayRating,
    ratingDiff:
      selectedSource.homeRating !== null && selectedSource.awayRating !== null
        ? selectedSource.homeRating - selectedSource.awayRating
        : null,
    homeWinProbability: selectedSource.homeWinProbability,
    drawProbability: selectedSource.drawProbability,
    awayWinProbability: selectedSource.awayWinProbability,
    selectedOutcome,
    selectedScore: `${homeScore}-${awayScore}`,
    randomRoll
  });

  return {
    matchId: match.id,
    homeScore,
    awayScore,
    outcome: selectedOutcome,
    totalTier,
    source: selectedSource.source,
    homeWinProbability: selectedSource.homeWinProbability,
    drawProbability: selectedSource.drawProbability,
    awayWinProbability: selectedSource.awayWinProbability
  };
}

function selectProbabilitySource(match: MatchWithTeams, snapshots: MatchProbabilitySnapshot[]): ProbabilityModel {
  const bestSnapshot = getBestSnapshot(snapshots);
  if (bestSnapshot) {
    return {
      source: bestSnapshot.source,
      homeRating: null,
      awayRating: null,
      homeWinProbability: bestSnapshot.homeWinProbability,
      drawProbability: bestSnapshot.drawProbability,
      awayWinProbability: bestSnapshot.awayWinProbability,
      over25Probability: bestSnapshot.over25Probability ?? null
    };
  }

  const rankedProbabilities = getRankingProbabilities(match);
  if (rankedProbabilities) {
    return rankedProbabilities;
  }

  return {
    source: "neutral",
    homeRating: null,
    awayRating: null,
    homeWinProbability: 0.38,
    drawProbability: 0.24,
    awayWinProbability: 0.38,
    over25Probability: null
  };
}

function getBestSnapshot(snapshots: MatchProbabilitySnapshot[]) {
  if (snapshots.length === 0) {
    return null;
  }

  const snapshotsBySource = new Map<MatchProbabilitySnapshotSource, MatchProbabilitySnapshot[]>();
  for (const snapshot of snapshots) {
    const existing = snapshotsBySource.get(snapshot.source) ?? [];
    existing.push(snapshot);
    snapshotsBySource.set(snapshot.source, existing);
  }

  for (const source of SNAPSHOT_SOURCE_PRIORITY) {
    const sourceSnapshots = snapshotsBySource.get(source);
    if (!sourceSnapshots?.length) {
      continue;
    }

    return [...sourceSnapshots].sort((left, right) => right.fetchedAt.localeCompare(left.fetchedAt))[0];
  }

  return null;
}

function getRankingProbabilities(match: MatchWithTeams): ProbabilityModel {
  const homeRating = getTeamRating(match.homeTeam);
  const awayRating = getTeamRating(match.awayTeam);
  const ratingDiff = homeRating - awayRating;
  const expectedHome = 1 / (1 + Math.exp(-ratingDiff / 300));
  let drawProbability = getDrawProbability(Math.abs(ratingDiff));
  const nonDrawShare = 1 - drawProbability;
  let homeWinProbability = expectedHome * nonDrawShare;
  let awayWinProbability = (1 - expectedHome) * nonDrawShare;

  ({ homeWinProbability, drawProbability, awayWinProbability } = applyStrongTeamGuardrails({
    ratingDiff,
    homeWinProbability,
    drawProbability,
    awayWinProbability
  }));

  ({ homeWinProbability, drawProbability, awayWinProbability } = applyClearFavoriteValidation(match, {
    homeWinProbability,
    drawProbability,
    awayWinProbability
  }));

  const normalized = normalizeProbabilities({
    homeWinProbability,
    drawProbability,
    awayWinProbability
  });

  return {
    source: "ranking",
    homeRating,
    awayRating,
    homeWinProbability: normalized.homeWinProbability,
    drawProbability: normalized.drawProbability,
    awayWinProbability: normalized.awayWinProbability,
    over25Probability: null
  };
}

function applyStrongTeamGuardrails({
  ratingDiff,
  homeWinProbability,
  drawProbability,
  awayWinProbability
}: {
  ratingDiff: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
}) {
  const absoluteDiff = Math.abs(ratingDiff);
  let minimumStrongerTeamProbability = 0;

  if (absoluteDiff >= 500) {
    minimumStrongerTeamProbability = 0.72;
  } else if (absoluteDiff >= 350) {
    minimumStrongerTeamProbability = 0.66;
  } else if (absoluteDiff >= 200) {
    minimumStrongerTeamProbability = 0.58;
  }

  if (minimumStrongerTeamProbability === 0) {
    return { homeWinProbability, drawProbability, awayWinProbability };
  }

  if (ratingDiff > 0 && homeWinProbability < minimumStrongerTeamProbability) {
    return {
      homeWinProbability: minimumStrongerTeamProbability,
      drawProbability,
      awayWinProbability: Math.max(0, 1 - minimumStrongerTeamProbability - drawProbability)
    };
  }

  if (ratingDiff < 0 && awayWinProbability < minimumStrongerTeamProbability) {
    return {
      homeWinProbability: Math.max(0, 1 - minimumStrongerTeamProbability - drawProbability),
      drawProbability,
      awayWinProbability: minimumStrongerTeamProbability
    };
  }

  return { homeWinProbability, drawProbability, awayWinProbability };
}

function applyClearFavoriteValidation(
  match: MatchWithTeams,
  probabilities: {
    homeWinProbability: number;
    drawProbability: number;
    awayWinProbability: number;
  }
) {
  const homeRank = match.homeTeam?.fifaRank;
  const awayRank = match.awayTeam?.fifaRank;
  if (!homeRank || !awayRank) {
    return probabilities;
  }

  const rankGap = Math.abs(homeRank - awayRank);
  const higherRankedIsHome = homeRank < awayRank;
  const strongFavoriteByRank = rankGap >= 20;
  if (!strongFavoriteByRank) {
    return probabilities;
  }

  const favoriteMinimum = 0.7;
  const drawProbability = Math.min(0.22, Math.max(0.16, probabilities.drawProbability));
  const underdogProbability = Math.max(0.08, 1 - favoriteMinimum - drawProbability);
  const normalized = normalizeProbabilities({
    homeWinProbability: higherRankedIsHome ? favoriteMinimum : underdogProbability,
    drawProbability,
    awayWinProbability: higherRankedIsHome ? underdogProbability : favoriteMinimum
  });

  if (higherRankedIsHome && probabilities.homeWinProbability >= favoriteMinimum) {
    return probabilities;
  }

  if (!higherRankedIsHome && probabilities.awayWinProbability >= favoriteMinimum) {
    return probabilities;
  }

  return normalized;
}

function getDrawProbability(ratingGap: number) {
  if (ratingGap >= 500) {
    return 0.16;
  }

  if (ratingGap >= 350) {
    return 0.18;
  }

  if (ratingGap >= 200) {
    return 0.21;
  }

  return 0.25;
}

function normalizeProbabilities({
  homeWinProbability,
  drawProbability,
  awayWinProbability
}: {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
}) {
  const total = homeWinProbability + drawProbability + awayWinProbability;

  if (total <= 0) {
    return {
      homeWinProbability: 0.38,
      drawProbability: 0.24,
      awayWinProbability: 0.38
    };
  }

  return {
    homeWinProbability: clampProbability(homeWinProbability / total),
    drawProbability: clampProbability(drawProbability / total),
    awayWinProbability: clampProbability(awayWinProbability / total)
  };
}

function pickWeightedOutcome(homeWinProbability: number, drawProbability: number, awayWinProbability: number): WeightedOutcomeSelection {
  const randomRoll = Math.random();

  if (randomRoll < homeWinProbability) {
    return { outcome: "home", randomRoll };
  }

  if (randomRoll < homeWinProbability + drawProbability) {
    return { outcome: "draw", randomRoll };
  }

  if (randomRoll < homeWinProbability + drawProbability + awayWinProbability) {
    return { outcome: "away", randomRoll };
  }

  return { outcome: "draw", randomRoll };
}

function pickTotalTier(match: MatchWithTeams, over25Probability: number | null): AutoPickTotalTier {
  if (over25Probability !== null && over25Probability !== undefined) {
    let inferredTier: AutoPickTotalTier;
    if (over25Probability > 0.55) {
      inferredTier = "high";
    } else if (over25Probability >= 0.45) {
      inferredTier = "medium";
    } else {
      inferredTier = "low";
    }

    return maybeBiasKnockoutTowardLowerTotals(match, inferredTier);
  }

  const isKnockoutMatch = match.stage !== "group";
  const tierRoll = Math.random();
  if (isKnockoutMatch) {
    if (tierRoll < 0.52) {
      return "low";
    }

    if (tierRoll < 0.9) {
      return "medium";
    }

    return "high";
  }

  if (tierRoll < 0.4) {
    return "low";
  }

  if (tierRoll < 0.85) {
    return "medium";
  }

  return "high";
}

function maybeBiasKnockoutTowardLowerTotals(match: MatchWithTeams, tier: AutoPickTotalTier): AutoPickTotalTier {
  if (match.stage === "group") {
    return tier;
  }

  if (tier === "high" && Math.random() < 0.55) {
    return "medium";
  }

  if (tier === "medium" && Math.random() < 0.35) {
    return "low";
  }

  return tier;
}

function pickScoreline(outcome: AutoPickOutcome, totalTier: AutoPickTotalTier) {
  const options = SCORE_POOLS[outcome][totalTier];
  return options[Math.floor(Math.random() * options.length)] ?? options[0];
}

export function simulateAutoPickOutcomes(
  match: MatchWithTeams,
  snapshots: MatchProbabilitySnapshot[] = [],
  iterations = 1000
) {
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (let index = 0; index < iterations; index += 1) {
    const result = getAutoPickForMatch(match, snapshots);
    if (result.outcome === "home") {
      homeWins += 1;
    } else if (result.outcome === "draw") {
      draws += 1;
    } else {
      awayWins += 1;
    }
  }

  return {
    iterations,
    homeWins,
    draws,
    awayWins
  };
}

function logAutoPickDebug(payload: AutoPickDebugPayload) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.info("[auto-pick]", payload);

  const favoriteProbability = Math.max(payload.homeWinProbability, payload.awayWinProbability);
  const favoriteOutcome = payload.homeWinProbability >= payload.awayWinProbability ? "home" : "away";
  if (favoriteProbability >= 0.7 && payload.selectedOutcome !== favoriteOutcome) {
    console.warn("Auto Pick selected upset/draw despite strong favorite. This is allowed but should be infrequent.", payload);
  }
}

function clampProbability(value: number) {
  return Math.min(1, Math.max(0, value));
}
