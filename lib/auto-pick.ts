import { canEditPrediction } from "@/lib/prediction-state";
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
  const outcome = pickWeightedOutcome(selectedSource.homeWinProbability, selectedSource.drawProbability, selectedSource.awayWinProbability);
  const totalTier = pickTotalTier(match, selectedSource.over25Probability ?? null);
  const [homeScore, awayScore] = pickScoreline(outcome, totalTier);

  return {
    matchId: match.id,
    homeScore,
    awayScore,
    outcome,
    totalTier,
    source: selectedSource.source
  };
}

type ProbabilityModel = {
  source: string;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  over25Probability?: number | null;
};

type ProbabilityValues = Omit<ProbabilityModel, "source">;

function selectProbabilitySource(match: MatchWithTeams, snapshots: MatchProbabilitySnapshot[]): ProbabilityModel {
  const bestSnapshot = getBestSnapshot(snapshots);
  if (bestSnapshot) {
    return {
      source: bestSnapshot.source,
      homeWinProbability: bestSnapshot.homeWinProbability,
      drawProbability: bestSnapshot.drawProbability,
      awayWinProbability: bestSnapshot.awayWinProbability,
      over25Probability: bestSnapshot.over25Probability ?? null
    };
  }

  const rankedProbabilities = getRankingProbabilities(match);
  if (rankedProbabilities) {
    return {
      source: "ranking",
      ...rankedProbabilities
    };
  }

  return {
    source: "neutral",
    homeWinProbability: 0.375,
    drawProbability: 0.25,
    awayWinProbability: 0.375,
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

function getRankingProbabilities(match: MatchWithTeams): ProbabilityValues | null {
  const homeRank = match.homeTeam?.fifaRank;
  const awayRank = match.awayTeam?.fifaRank;
  if (!homeRank || !awayRank) {
    return null;
  }

  const homeRating = getPseudoRatingFromRank(homeRank);
  const awayRating = getPseudoRatingFromRank(awayRank);
  const ratingDiff = homeRating - awayRating;
  const homeVsAway = 1 / (1 + Math.exp(-ratingDiff / 400));
  const gapPenalty = Math.min(Math.abs(ratingDiff) / 1600, 0.12);
  const drawProbability = Math.max(0.14, 0.25 - gapPenalty);
  const remainingShare = 1 - drawProbability;
  const homeWinProbability = homeVsAway * remainingShare;
  const awayWinProbability = (1 - homeVsAway) * remainingShare;

  return normalizeProbabilities({
    homeWinProbability,
    drawProbability,
    awayWinProbability,
    over25Probability: getRankingOver25Probability(ratingDiff)
  });
}

function getPseudoRatingFromRank(rank: number) {
  return 2000 - rank * 8;
}

function getRankingOver25Probability(ratingDiff: number) {
  const parityBonus = Math.max(0, 0.08 - Math.min(Math.abs(ratingDiff) / 2400, 0.08));
  return clampProbability(0.44 + parityBonus);
}

function normalizeProbabilities(model: ProbabilityValues): ProbabilityValues {
  const total = model.homeWinProbability + model.drawProbability + model.awayWinProbability;
  if (total <= 0) {
    return {
      ...model,
      homeWinProbability: 0.375,
      drawProbability: 0.25,
      awayWinProbability: 0.375
    };
  }

  return {
    ...model,
    homeWinProbability: clampProbability(model.homeWinProbability / total),
    drawProbability: clampProbability(model.drawProbability / total),
    awayWinProbability: clampProbability(model.awayWinProbability / total)
  };
}

function pickWeightedOutcome(homeWinProbability: number, drawProbability: number, awayWinProbability: number): AutoPickOutcome {
  const roll = Math.random();
  const drawThreshold = homeWinProbability + drawProbability;

  if (roll < homeWinProbability) {
    return "home";
  }

  if (roll < drawThreshold) {
    return "draw";
  }

  if (roll <= homeWinProbability + drawProbability + awayWinProbability) {
    return "away";
  }

  return "draw";
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

function clampProbability(value: number) {
  return Math.min(1, Math.max(0, value));
}
