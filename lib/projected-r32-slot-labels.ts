import {
  buildRoundOf32MatchIdLookup,
  type KnockoutPlaceholderMatch,
  type ProjectedRoundOf32Match
} from "./knockout-seeding.ts";

export type ProjectedRoundOf32SlotLabels = {
  home: string;
  away: string;
};

export function buildProjectedRoundOf32SlotLabelMap(
  projectedMatches: ProjectedRoundOf32Match[],
  roundOf32Placeholders: KnockoutPlaceholderMatch[]
) {
  const storedMatchIdByOfficialId = buildRoundOf32MatchIdLookup(roundOf32Placeholders);
  const labelsByMatchId = new Map<string, ProjectedRoundOf32SlotLabels>();

  for (const match of projectedMatches) {
    const labels = {
      home: match.home.sourceLabel,
      away: match.away.sourceLabel
    };
    const storedMatchId = storedMatchIdByOfficialId.get(match.matchId);

    labelsByMatchId.set(match.matchId, labels);
    if (storedMatchId) {
      labelsByMatchId.set(storedMatchId, labels);
    }
  }

  return labelsByMatchId;
}
