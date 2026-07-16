import {
  expandFifa2026KnockoutStoredMatchIds,
  getFifa2026CanonicalKnockoutSources,
  normalizeFifa2026KnockoutStoredMatchId
} from "./fifa-2026-knockout-seeding.ts";
import type { ProjectedMatchScoreSource } from "./knockout-seeding.ts";
import type { MatchNextSlot } from "./types.ts";

type KnockoutLinkedMatchLike = {
  id: string;
  home_source?: string | null;
  away_source?: string | null;
  next_match_id?: string | null;
  next_match_slot?: MatchNextSlot | null;
  nextMatchId?: string | null;
  nextMatchSlot?: MatchNextSlot | null;
};

type KnockoutSourceMatchLike = {
  id?: string;
  matchId?: string;
  status?: string | null;
  winner_team_id?: string | null;
  actualWinnerTeamId?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeam?: { id: string } | null;
  awayTeam?: { id: string } | null;
  seededHomeTeam?: { id: string } | null;
  seededAwayTeam?: { id: string } | null;
};

type KnockoutPredictionsByMatchId = Map<
  string,
  {
    predictedWinnerTeamId?: string | null;
    predicted_winner_team_id?: string | null;
  }
>;

export type KnockoutSourceOutcome = "winner" | "loser";

type KnockoutSourceTeamRef = {
  id: string;
};

export type ParsedKnockoutSourceLabel = {
  matchId: string;
  outcome: KnockoutSourceOutcome;
};

export function buildKnockoutPreviousMatchesByTargetId<T extends KnockoutLinkedMatchLike>(matches: T[]) {
  const previousMatchesByTargetId = new Map<string, T[]>();
  const matchesByNormalizedId = new Map<string, T>();

  for (const match of matches) {
    for (const alias of expandFifa2026KnockoutStoredMatchIds(match.id)) {
      matchesByNormalizedId.set(alias, match);
    }
  }

  for (const targetMatch of matches) {
    const canonicalSources = getFifa2026CanonicalKnockoutSources(targetMatch.id);
    const homeSourceMatch = resolveFeederMatchFromSourceLabel(
      canonicalSources?.homeSource ?? targetMatch.home_source,
      matchesByNormalizedId
    );
    const awaySourceMatch = resolveFeederMatchFromSourceLabel(
      canonicalSources?.awaySource ?? targetMatch.away_source,
      matchesByNormalizedId
    );
    const resolvedSources: T[] = [];

    if (homeSourceMatch) {
      resolvedSources.push(withResolvedTargetSlot(homeSourceMatch, targetMatch.id, "home"));
    }

    if (awaySourceMatch) {
      resolvedSources.push(withResolvedTargetSlot(awaySourceMatch, targetMatch.id, "away"));
    }

    if (resolvedSources.length > 0) {
      previousMatchesByTargetId.set(targetMatch.id, resolvedSources);
    }
  }

  for (const sourceMatch of matches) {
    const nextMatchId = sourceMatch.next_match_id ?? sourceMatch.nextMatchId ?? null;
    const nextMatchSlot = sourceMatch.next_match_slot ?? sourceMatch.nextMatchSlot ?? null;
    if (!nextMatchId || !nextMatchSlot) {
      continue;
    }

    for (const targetId of expandFifa2026KnockoutStoredMatchIds(nextMatchId)) {
      const existingMatches = previousMatchesByTargetId.get(targetId) ?? [];
      const hasSlot = existingMatches.some((match) => {
        const existingSlot = match.next_match_slot ?? match.nextMatchSlot ?? null;
        return existingSlot === nextMatchSlot;
      });
      if (hasSlot) {
        continue;
      }

      previousMatchesByTargetId.set(targetId, [
        ...existingMatches,
        withResolvedTargetSlot(sourceMatch, targetId, nextMatchSlot)
      ]);
    }
  }

  return previousMatchesByTargetId;
}

export function resolveVisibleKnockoutTeamForSlot(input: {
  mode: "official" | "projected";
  seededTeamId: string | null;
  resolvedSourceTeamId: string | null;
  resolvedSource: ProjectedMatchScoreSource | null;
  projectedTeamId?: string | null;
}): {
  teamId: string | null;
  resolutionSource: ProjectedMatchScoreSource;
} {
  // When an upstream knockout match is final, that winner is the canonical
  // official entrant even if the downstream seeded slot has not been repaired yet.
  if (input.mode === "official" && input.resolvedSource === "actual" && input.resolvedSourceTeamId) {
    return {
      teamId: input.resolvedSourceTeamId,
      resolutionSource: "actual"
    };
  }

  if (input.mode === "official" && input.seededTeamId) {
    return {
      teamId: input.seededTeamId,
      resolutionSource: "actual"
    };
  }

  if (input.resolvedSourceTeamId) {
    return {
      teamId: input.resolvedSourceTeamId,
      resolutionSource: input.resolvedSource ?? "actual"
    };
  }

  if (input.projectedTeamId) {
    return {
      teamId: input.projectedTeamId,
      resolutionSource: "prediction"
    };
  }

  if (input.mode === "official" && input.seededTeamId) {
    return {
      teamId: input.seededTeamId,
      resolutionSource: "actual"
    };
  }

  return {
    teamId: null,
    resolutionSource: input.mode === "projected" ? "prediction" : "missing"
  };
}

export function parseKnockoutSourceLabel(sourceLabel: string | null | undefined): ParsedKnockoutSourceLabel | null {
  const normalized = (sourceLabel ?? "").trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(Winner|Loser) of\s+([A-Za-z0-9-]+)$/i);
  if (!match) {
    return null;
  }

  return {
    outcome: match[1]?.toLowerCase() === "loser" ? "loser" : "winner",
    matchId: match[2] ?? ""
  };
}

export function resolveKnockoutSourceTeam(input: {
  sourceMatch: KnockoutSourceMatchLike | null | undefined;
  sourceLabel: string | null | undefined;
  predictionsByMatchId?: KnockoutPredictionsByMatchId;
  mode: "official" | "projected";
}): { teamId: string | null; source: ProjectedMatchScoreSource } {
  const sourceMatch = input.sourceMatch;
  if (!sourceMatch) {
    return { teamId: null, source: input.mode === "projected" ? "prediction" : "missing" };
  }

  const parsedSource = parseKnockoutSourceLabel(input.sourceLabel);
  const outcome = parsedSource?.outcome ?? "winner";
  const actualWinnerTeamId = getWinnerTeamId(sourceMatch);
  const [homeTeamId, awayTeamId] = getParticipantTeamIds(sourceMatch);
  const sourceMatchId = sourceMatch.id ?? sourceMatch.matchId ?? null;

  if (isFinalMatch(sourceMatch) && actualWinnerTeamId) {
    const actualTeamId =
      outcome === "winner"
        ? actualWinnerTeamId
        : resolveOpposingTeamId({
            homeTeamId,
            awayTeamId,
            selectedTeamId: actualWinnerTeamId
          });
    if (actualTeamId) {
      return { teamId: actualTeamId, source: "actual" };
    }
  }

  const predictedWinnerTeamId = sourceMatchId
    ? input.predictionsByMatchId?.get(sourceMatchId)?.predictedWinnerTeamId ??
      input.predictionsByMatchId?.get(sourceMatchId)?.predicted_winner_team_id ??
      null
    : null;

  if (predictedWinnerTeamId) {
    const predictedTeamId =
      outcome === "winner"
        ? predictedWinnerTeamId
        : resolveOpposingTeamId({
            homeTeamId,
            awayTeamId,
            selectedTeamId: predictedWinnerTeamId
          });
    if (predictedTeamId) {
      return { teamId: predictedTeamId, source: "prediction" };
    }
  }

  return { teamId: null, source: input.mode === "projected" ? "prediction" : "missing" };
}

export function resolveKnockoutSourceParticipant<T extends KnockoutSourceTeamRef>(input: {
  sourceMatch:
    | (KnockoutSourceMatchLike & {
        homeTeam?: T | null;
        awayTeam?: T | null;
        seededHomeTeam?: T | null;
        seededAwayTeam?: T | null;
      })
    | null
    | undefined;
  sourceLabel: string | null | undefined;
  predictionsByMatchId?: KnockoutPredictionsByMatchId;
  mode: "official" | "projected";
  fallbackTeamsById?: Map<string, T>;
}): { team: T | null; teamId: string | null; source: ProjectedMatchScoreSource } {
  const resolved = resolveKnockoutSourceTeam({
    sourceMatch: input.sourceMatch,
    sourceLabel: input.sourceLabel,
    predictionsByMatchId: input.predictionsByMatchId,
    mode: input.mode
  });

  if (!resolved.teamId) {
    return {
      team: null,
      teamId: null,
      source: resolved.source
    };
  }

  const sourceMatch = input.sourceMatch;
  const matchTeam =
    [sourceMatch?.homeTeam, sourceMatch?.awayTeam, sourceMatch?.seededHomeTeam, sourceMatch?.seededAwayTeam].find(
      (team) => team?.id === resolved.teamId
    ) ?? null;

  return {
    team: matchTeam ?? input.fallbackTeamsById?.get(resolved.teamId) ?? null,
    teamId: resolved.teamId,
    source: resolved.source
  };
}

function resolveFeederMatchFromSourceLabel<T extends KnockoutLinkedMatchLike>(
  sourceLabel: string | null | undefined,
  matchesByNormalizedId: Map<string, T>
) {
  const parsedSource = parseKnockoutSourceLabel(sourceLabel);
  if (!parsedSource) {
    return null;
  }

  const normalizedId = normalizeFifa2026KnockoutStoredMatchId(parsedSource.matchId);
  return normalizedId ? matchesByNormalizedId.get(normalizedId) ?? null : null;
}

function withResolvedTargetSlot<T extends KnockoutLinkedMatchLike>(
  match: T,
  targetMatchId: string,
  targetMatchSlot: MatchNextSlot
): T {
  return {
    ...match,
    next_match_id: targetMatchId,
    next_match_slot: targetMatchSlot,
    nextMatchId: targetMatchId,
    nextMatchSlot: targetMatchSlot
  };
}

function isFinalMatch(match: KnockoutSourceMatchLike) {
  return match.status === "final";
}

function getWinnerTeamId(match: KnockoutSourceMatchLike) {
  return match.winner_team_id ?? match.actualWinnerTeamId ?? null;
}

function getParticipantTeamIds(match: KnockoutSourceMatchLike): [string | null, string | null] {
  return [
    match.home_team_id ?? match.homeTeamId ?? match.homeTeam?.id ?? match.seededHomeTeam?.id ?? null,
    match.away_team_id ?? match.awayTeamId ?? match.awayTeam?.id ?? match.seededAwayTeam?.id ?? null
  ];
}

function resolveOpposingTeamId(input: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  selectedTeamId: string;
}) {
  if (input.homeTeamId === input.selectedTeamId) {
    return input.awayTeamId;
  }
  if (input.awayTeamId === input.selectedTeamId) {
    return input.homeTeamId;
  }
  return null;
}
