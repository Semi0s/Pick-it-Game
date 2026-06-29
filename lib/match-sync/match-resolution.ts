import type { NormalizedExternalMatch } from "../match-api/client";
import type { MatchStage, MatchStatus } from "../types";

export type MatchSyncRow = {
  id: string;
  stage: MatchStage;
  home_team_id?: string | null;
  away_team_id?: string | null;
  kickoff_time: string;
  kickoff_at?: string | null;
  status: MatchStatus;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  finalized_at?: string | null;
  last_synced_at?: string | null;
  external_id?: string | null;
  is_manual_override?: boolean | null;
  sync_status?: "ok" | "skipped" | "error" | null;
  sync_error?: string | null;
};

export function findInternalMatch({
  externalMatch,
  matches,
  homeTeamId,
  awayTeamId
}: {
  externalMatch: NormalizedExternalMatch;
  matches: MatchSyncRow[];
  homeTeamId: string;
  awayTeamId: string;
}) {
  const exactExternalIdMatch = findInternalMatchByExternalId(externalMatch.external_id, matches);
  if (exactExternalIdMatch) {
    return exactExternalIdMatch;
  }

  const kickoffMillis = new Date(externalMatch.kickoff_at).getTime();
  const exactCandidates = matches.filter((match) => {
    if (match.home_team_id !== homeTeamId || match.away_team_id !== awayTeamId) {
      return false;
    }

    const internalKickoffMillis = new Date(match.kickoff_at ?? match.kickoff_time).getTime();
    return Math.abs(internalKickoffMillis - kickoffMillis) <= 60 * 60 * 1000;
  });

  if (exactCandidates.length === 1) {
    return exactCandidates[0];
  }

  const reversedCandidates = matches.filter((match) => {
    if (match.home_team_id !== awayTeamId || match.away_team_id !== homeTeamId) {
      return false;
    }

    const internalKickoffMillis = new Date(match.kickoff_at ?? match.kickoff_time).getTime();
    return Math.abs(internalKickoffMillis - kickoffMillis) <= 60 * 60 * 1000;
  });

  if (reversedCandidates.length !== 1) {
    return null;
  }

  return reversedCandidates[0];
}

export function findInternalMatchByExternalId(externalId: string, matches: MatchSyncRow[]) {
  return matches.find((match) => match.external_id === externalId) ?? null;
}

export function deriveSyncedNonFinalStatus(input: {
  externalStatus: "scheduled" | "live";
  kickoffAt: string;
  currentStatus: MatchStatus;
}) {
  if (input.currentStatus === "final") {
    return "final" as const;
  }

  if (input.externalStatus === "live") {
    return "live" as const;
  }

  const kickoffMs = new Date(input.kickoffAt).getTime();
  if (Number.isFinite(kickoffMs) && kickoffMs > Date.now() + 5 * 60 * 1000) {
    return "scheduled" as const;
  }

  return "locked" as const;
}

export function shouldReopenUpcomingLockedMatch(input: {
  currentStatus: MatchStatus;
  kickoffAt: string | null;
  nowMs?: number;
  finalizedAt?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
}) {
  if (input.currentStatus !== "locked") {
    return false;
  }

  if (input.finalizedAt || input.homeScore !== null && input.homeScore !== undefined || input.awayScore !== null && input.awayScore !== undefined) {
    return false;
  }

  if (!input.kickoffAt) {
    return false;
  }

  const kickoffMs = new Date(input.kickoffAt).getTime();
  if (!Number.isFinite(kickoffMs)) {
    return false;
  }

  const nowMs = input.nowMs ?? Date.now();
  return kickoffMs > nowMs + 5 * 60 * 1000;
}
