"use client";

import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { mergeGroupMatchRows, type GroupMatchRow } from "@/lib/group-match-merge";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import type { MatchWithTeams } from "@/lib/types";

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
    .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score,winner_team_id,kickoff_time")
    .eq("stage", "group");

  if (error) {
    throw error;
  }

  return buildGroupMatchesFromRows((data as GroupMatchRow[] | null) ?? [], localMatches);
}

export function buildGroupMatchesFromRows(
  rows: GroupMatchRow[],
  localMatches: MatchWithTeams[] = getLocalGroupMatches()
): MatchWithTeams[] {
  return mergeGroupMatchRows(rows, localMatches, getTeam);
}
