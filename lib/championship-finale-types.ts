export type ChampionshipFinaleBadgeKey =
  | "champion"
  | "poolWinner"
  | "top10"
  | "top25"
  | "beatTheField"
  | "survivor";

export type ChampionshipFinaleRoundKey =
  | "roundOf32"
  | "roundOf16"
  | "quarterfinals"
  | "semifinals"
  | "thirdPlaceMatch"
  | "finalAndChampion";

export type ChampionshipFinaleSummary = {
  isFinalized: boolean;
  isPendingVerification: boolean;
  finalizedAt: string | null;
  champion: {
    userId: string;
    name: string;
    score: number;
    rank: number;
  } | null;
  user: {
    userId: string;
    displayName: string;
    finalRank: number;
    totalPlayers: number;
    finalScore: number;
    playersBeaten: number;
    percentile: number | null;
    topPercent: number | null;
    bestGroupRank: number | null;
    bestGroupName: string | null;
    bestGroupTotalPlayers: number | null;
    bestRound: {
      key: ChampionshipFinaleRoundKey;
      points: number;
    } | null;
    biggestPick: {
      label: string;
      points: number;
    } | null;
    badges: ChampionshipFinaleBadgeKey[];
  };
};
