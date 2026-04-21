"use client";

import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import type { MatchStatus, MatchWithTeams } from "@/lib/types";

type MatchRow = {
  id: string;
  status: MatchStatus;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
};

export function getLocalGroupMatches(): MatchWithTeams[] {
  return getGroupMatches().map((match) => ({
    ...match,
    homeTeam: getTeam(match.homeTeamId),
    awayTeam: getTeam(match.awayTeamId)
  }));
}

export async function fetchGroupMatchesForPredictions(): Promise<MatchWithTeams[]> {
  const localMatches = getLocalGroupMatches();

  if (!hasSupabaseConfig()) {
    return localMatches;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("matches")
    .select("id,status,home_score,away_score,winner_team_id")
    .eq("stage", "group");

  if (error) {
    throw error;
  }

  const rowsById = new Map((data as MatchRow[]).map((row) => [row.id, row]));
  return localMatches.map((match) => {
    const row = rowsById.get(match.id);
    if (!row) {
      return match;
    }

    return {
      ...match,
      status: row.status,
      homeScore: row.home_score ?? undefined,
      awayScore: row.away_score ?? undefined,
      winnerTeamId: row.winner_team_id ?? undefined
    };
  });
}
