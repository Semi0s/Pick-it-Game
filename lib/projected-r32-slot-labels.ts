import {
  buildRoundOf32MatchIdLookup,
  type KnockoutPlaceholderMatch,
  type ProjectedRoundOf32Match
} from "./knockout-seeding.ts";
import {
  buildFifa2026RoundOf32FromSeeds,
  sourceToGroupLetter,
  type Fifa2026RoundOf32Side
} from "./fifa-2026-knockout-seeding.ts";
import type { Fifa2026SeedSource } from "./fifa-2026-third-place-permutations.ts";

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

export function buildCanonicalRoundOf32SlotLabelMap(
  roundOf32Placeholders: KnockoutPlaceholderMatch[]
) {
  const storedMatchIdByOfficialId = buildRoundOf32MatchIdLookup(roundOf32Placeholders);
  const labelsByMatchId = new Map<string, ProjectedRoundOf32SlotLabels>();
  const canonicalMatches = buildFifa2026RoundOf32FromSeeds({
    fixedQualifiers: new Map(),
    rankedThirdPlaceTeams: []
  });

  for (const match of canonicalMatches) {
    const labels = {
      home: formatFifaRoundOf32SideLabel(match.sideA),
      away: formatFifaRoundOf32SideLabel(match.sideB)
    };
    const storedMatchId = storedMatchIdByOfficialId.get(match.matchId);

    labelsByMatchId.set(match.matchId, labels);
    if (storedMatchId) {
      labelsByMatchId.set(storedMatchId, labels);
    }
  }

  return labelsByMatchId;
}

function formatFifaRoundOf32SideLabel(side: Fifa2026RoundOf32Side) {
  return side.source ? formatFifaSourceLabel(side.source) : side.placeholder ?? "TBD";
}

function formatFifaSourceLabel(source: Fifa2026SeedSource) {
  const groupLetter = sourceToGroupLetter(source);
  const finish = source.slice(0, 1);
  if (finish === "1") {
    return `${groupLetter}-1st`;
  }
  if (finish === "2") {
    return `${groupLetter}-2nd`;
  }
  return `${groupLetter}-3rd`;
}
