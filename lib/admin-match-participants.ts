import {
  buildKnockoutPreviousMatchesByTargetId,
  resolveKnockoutSourceParticipant,
  resolveVisibleKnockoutTeamForSlot
} from "./knockout-team-resolution.ts";
import type { MatchNextSlot, MatchStage, MatchStatus } from "./types.ts";

export type AdminResolvedTeam = {
  id: string;
  name: string;
  shortName: string;
  flagEmoji: string;
};

export type AdminResolvableMatch = {
  id: string;
  stage: MatchStage;
  status: MatchStatus;
  homeTeamId?: string;
  awayTeamId?: string;
  winnerTeamId?: string;
  homeSource?: string;
  awaySource?: string;
  nextMatchId?: string | null;
  nextMatchSlot?: MatchNextSlot | null;
  homeTeam?: AdminResolvedTeam;
  awayTeam?: AdminResolvedTeam;
};

export function resolveAdminMatchParticipants<T extends AdminResolvableMatch>(matches: T[]): T[] {
  const previousMatchesByTargetId = buildKnockoutPreviousMatchesByTargetId(
    matches.map((match) => ({
      id: match.id,
      home_source: match.homeSource ?? null,
      away_source: match.awaySource ?? null,
      next_match_id: match.nextMatchId ?? null,
      next_match_slot: match.nextMatchSlot ?? null,
      status: match.status,
      winner_team_id: match.winnerTeamId ?? null,
      home_team_id: match.homeTeamId ?? null,
      away_team_id: match.awayTeamId ?? null,
      homeTeam: match.homeTeam ?? null,
      awayTeam: match.awayTeam ?? null
    }))
  );
  const existingTeamMap = buildAdminTeamMap(matches);

  return matches.map((match) => {
    if (match.stage === "group") {
      return match;
    }

    const sourceMatches = previousMatchesByTargetId.get(match.id) ?? [];
    const homeSourceMatch = sourceMatches.find((sourceMatch) => sourceMatch.next_match_slot === "home");
    const awaySourceMatch = sourceMatches.find((sourceMatch) => sourceMatch.next_match_slot === "away");

    const resolvedHome = resolveKnockoutSourceParticipant({
      sourceMatch: homeSourceMatch,
      sourceLabel: match.homeSource ?? null,
      mode: "official",
      fallbackTeamsById: existingTeamMap
    });
    const resolvedAway = resolveKnockoutSourceParticipant({
      sourceMatch: awaySourceMatch,
      sourceLabel: match.awaySource ?? null,
      mode: "official",
      fallbackTeamsById: existingTeamMap
    });

    const homeSelection = resolveVisibleKnockoutTeamForSlot({
      mode: "official",
      seededTeamId: match.homeTeamId ?? null,
      resolvedSourceTeamId: resolvedHome.teamId,
      resolvedSource: resolvedHome.source
    });
    const awaySelection = resolveVisibleKnockoutTeamForSlot({
      mode: "official",
      seededTeamId: match.awayTeamId ?? null,
      resolvedSourceTeamId: resolvedAway.teamId,
      resolvedSource: resolvedAway.source
    });

    const nextHomeTeamId = homeSelection.teamId ?? match.homeTeamId;
    const nextAwayTeamId = awaySelection.teamId ?? match.awayTeamId;

    return {
      ...match,
      homeTeamId: nextHomeTeamId ?? undefined,
      awayTeamId: nextAwayTeamId ?? undefined,
      homeTeam: selectResolvedAdminTeam({
        selectedTeamId: nextHomeTeamId ?? null,
        currentTeam: match.homeTeam,
        sourceTeam: resolvedHome.team
      }),
      awayTeam: selectResolvedAdminTeam({
        selectedTeamId: nextAwayTeamId ?? null,
        currentTeam: match.awayTeam,
        sourceTeam: resolvedAway.team
      })
    };
  });
}

function buildAdminTeamMap<T extends AdminResolvableMatch>(matches: T[]) {
  const teamMap = new Map<string, AdminResolvedTeam>();

  for (const match of matches) {
    if (match.homeTeam) {
      teamMap.set(match.homeTeam.id, match.homeTeam);
    }

    if (match.awayTeam) {
      teamMap.set(match.awayTeam.id, match.awayTeam);
    }
  }

  return teamMap;
}

function selectResolvedAdminTeam(input: {
  selectedTeamId: string | null;
  currentTeam?: AdminResolvedTeam;
  sourceTeam?: AdminResolvedTeam | null;
  fallbackTeam?: AdminResolvedTeam;
}) {
  const candidates = [input.currentTeam, input.sourceTeam ?? undefined, input.fallbackTeam];
  if (input.selectedTeamId) {
    const matchingCandidate = candidates.find((team) => team?.id === input.selectedTeamId);
    if (matchingCandidate) {
      return matchingCandidate;
    }
  }

  return candidates.find(Boolean);
}
