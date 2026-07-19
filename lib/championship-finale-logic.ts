import type {
  ChampionshipFinaleBadgeKey,
  ChampionshipFinaleRoundKey
} from "./championship-finale-types";
import type { BracketScore, MatchStage } from "./types";

export function deriveChampionshipFinaleState(input: {
  transitionModality?: string | null;
  hasFinalMatchResult: boolean;
}) {
  const isFinalized = input.hasFinalMatchResult || input.transitionModality === "post_tournament";

  return {
    isFinalized,
    isPendingVerification: !isFinalized && input.transitionModality === "post_tournament"
  };
}

export function deriveFinalePercentile(finalRank: number, totalPlayers: number) {
  if (!Number.isFinite(finalRank) || finalRank <= 0 || !Number.isFinite(totalPlayers) || totalPlayers <= 0) {
    return null;
  }

  if (totalPlayers <= 1) {
    return 100;
  }

  return ((totalPlayers - finalRank) / (totalPlayers - 1)) * 100;
}

export function deriveFinaleTopPercent(finalRank: number, totalPlayers: number) {
  if (!Number.isFinite(finalRank) || finalRank <= 0 || !Number.isFinite(totalPlayers) || totalPlayers <= 0) {
    return null;
  }

  return Math.max(1, Math.ceil((finalRank / totalPlayers) * 100));
}

export function buildChampionshipBadges(input: {
  finalRank: number;
  totalPlayers: number;
  bestGroupRank?: number | null;
}) {
  const badges: ChampionshipFinaleBadgeKey[] = [];
  const percentile = deriveFinalePercentile(input.finalRank, input.totalPlayers);
  const topPercent = deriveFinaleTopPercent(input.finalRank, input.totalPlayers);

  if (input.finalRank === 1) {
    badges.push("champion");
  }

  if (input.bestGroupRank === 1) {
    badges.push("poolWinner");
  }

  if (topPercent !== null && topPercent <= 10) {
    badges.push("top10");
  } else if (topPercent !== null && topPercent <= 25) {
    badges.push("top25");
  }

  if (percentile !== null && percentile >= 50) {
    badges.push("beatTheField");
  }

  if (badges.length === 0) {
    badges.push("survivor");
  }

  return badges;
}

export function summarizeBestRound(scores: BracketScore[]) {
  const pointsByRound = new Map<ChampionshipFinaleRoundKey, number>();

  for (const score of scores) {
    const roundKey = mapStageToFinaleRoundKey(score.stage);
    if (!roundKey) {
      continue;
    }

    pointsByRound.set(roundKey, (pointsByRound.get(roundKey) ?? 0) + (score.points ?? 0));
  }

  const bestRound = Array.from(pointsByRound.entries()).sort(
    (left, right) => right[1] - left[1] || compareFinaleRoundOrder(left[0], right[0])
  )[0];

  if (!bestRound || bestRound[1] <= 0) {
    return null;
  }

  return {
    key: bestRound[0],
    points: bestRound[1]
  };
}

function mapStageToFinaleRoundKey(stage: MatchStage): ChampionshipFinaleRoundKey | null {
  switch (stage) {
    case "round_of_32":
    case "r32":
      return "roundOf32";
    case "round_of_16":
    case "r16":
      return "roundOf16";
    case "quarterfinal":
    case "qf":
      return "quarterfinals";
    case "semifinal":
    case "sf":
      return "semifinals";
    case "third":
      return "thirdPlaceMatch";
    case "final":
      return "finalAndChampion";
    default:
      return null;
  }
}

function compareFinaleRoundOrder(left: ChampionshipFinaleRoundKey, right: ChampionshipFinaleRoundKey) {
  return getFinaleRoundOrder(left) - getFinaleRoundOrder(right);
}

function getFinaleRoundOrder(roundKey: ChampionshipFinaleRoundKey) {
  switch (roundKey) {
    case "roundOf32":
      return 0;
    case "roundOf16":
      return 1;
    case "quarterfinals":
      return 2;
    case "semifinals":
      return 3;
    case "thirdPlaceMatch":
      return 4;
    case "finalAndChampion":
      return 5;
    default:
      return 99;
  }
}
