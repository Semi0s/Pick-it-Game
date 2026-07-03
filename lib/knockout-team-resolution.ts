import {
  expandFifa2026KnockoutStoredMatchIds,
  getFifa2026CanonicalKnockoutSources,
  normalizeFifa2026KnockoutStoredMatchId
} from "./fifa-2026-knockout-seeding.ts";
import type { MatchNextSlot } from "./types.ts";
import type { ProjectedMatchScoreSource } from "./knockout-seeding.ts";

type KnockoutLinkedMatchLike = {
  id: string;
  home_source?: string | null;
  away_source?: string | null;
  next_match_id?: string | null;
  next_match_slot?: MatchNextSlot | null;
  nextMatchId?: string | null;
  nextMatchSlot?: MatchNextSlot | null;
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

function resolveFeederMatchFromSourceLabel<T extends KnockoutLinkedMatchLike>(
  sourceLabel: string | null | undefined,
  matchesByNormalizedId: Map<string, T>
) {
  const matchId = parseWinnerSourceMatchId(sourceLabel);
  if (!matchId) {
    return null;
  }

  const normalizedId = normalizeFifa2026KnockoutStoredMatchId(matchId);
  return normalizedId ? matchesByNormalizedId.get(normalizedId) ?? null : null;
}

function parseWinnerSourceMatchId(sourceLabel: string | null | undefined) {
  const normalized = (sourceLabel ?? "").trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^Winner of\s+([A-Za-z0-9-]+)$/i);
  return match?.[1] ?? null;
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
