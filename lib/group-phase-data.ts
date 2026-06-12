import "server-only";

import type { GroupPhaseActualOutcome } from "@/lib/group-phase-scoring";
import { recomputeGroupPhaseLadderScores } from "@/lib/group-phase-ladder-recompute";
import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { normalizeGroupKey } from "@/lib/group-standings";
import {
  buildProjectedGroupStandings,
  buildQualifiedTeamSeeds,
  getRequiredThirdPlaceQualifierCount,
  type KnockoutPlaceholderMatch
} from "@/lib/knockout-seeding";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getGroupMatches, teams as demoTeams } from "@/lib/mock-data";
import type { Team } from "@/lib/types";

type MatchRow = {
  id: string;
  stage: string;
  group_name?: string | null;
  status: "scheduled" | "locked" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  group_name: string;
  fifa_rank: number;
  flag_emoji: string;
};

type GroupSeedRankingRecord = {
  user_id: string;
  group_name: string;
  rank_position: number;
  team_id: string;
};

type ThirdPlaceRankingRecord = {
  user_id: string;
  team_id: string;
  rank_position: number;
};

export type GroupPhaseUserSummary = {
  userId: string;
  snapshot: LightSeedBuilderSnapshot | null;
  points: number;
  maxPoints: number;
  hasSnapshot: boolean;
};

export async function fetchGroupPhaseSummaries(userIds: string[]): Promise<Map<string, GroupPhaseUserSummary>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, GroupPhaseUserSummary>();

  if (uniqueUserIds.length === 0) {
    return result;
  }

  const { actualOutcomes, requiredThirdPlaceQualifierCount, isScorable } = await fetchActualGroupPhaseOutcomes();

  if (!hasSupabaseConfig()) {
    for (const userId of uniqueUserIds) {
      result.set(userId, {
        userId,
        snapshot: null,
        points: 0,
        maxPoints: actualOutcomes.length * 14,
        hasSnapshot: false
      });
    }
    return result;
  }

  const adminSupabase = createAdminClient();
  const [groupSeedRows, thirdPlaceRows] = await Promise.all([
    fetchGroupSeedRankingsForUsers(adminSupabase, uniqueUserIds),
    fetchThirdPlaceRankingsForUsers(adminSupabase, uniqueUserIds)
  ]);

  const ladderScores = recomputeGroupPhaseLadderScores({
    userIds: uniqueUserIds,
    actualOutcomes,
    requiredThirdPlaceQualifierCount,
    groupSeedRankings: groupSeedRows.map((row) => ({
      ...row,
      group_name: normalizeGroupKey(row.group_name) ?? row.group_name
    })),
    thirdPlaceRankings: thirdPlaceRows,
    isScorable
  });

  for (const userId of uniqueUserIds) {
    const summary = ladderScores.get(userId);
    result.set(userId, {
      userId,
      snapshot: summary?.snapshot ?? null,
      points: summary?.points ?? 0,
      maxPoints: summary?.maxPoints ?? actualOutcomes.length * 14,
      hasSnapshot: summary?.hasSnapshot ?? false
    });
  }

  return result;
}

async function fetchActualGroupPhaseOutcomes(): Promise<{
  actualOutcomes: GroupPhaseActualOutcome[];
  requiredThirdPlaceQualifierCount: number;
  isScorable: boolean;
}> {
  const adminSupabase = createAdminClient();

  const [teams, matches] = await Promise.all([fetchTeams(adminSupabase), fetchMatches(adminSupabase)]);
  const projectedStandings = buildProjectedGroupStandings(
    matches.map((match) => ({
      id: match.id,
      stage: match.stage,
      groupName: match.group_name ?? null,
      status: match.status,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null
    })),
    teams
  );

  const standingsRows = new Map(Array.from(projectedStandings.entries()).map(([groupName, standings]) => [groupName, standings.rows]));
  const isScorable =
    projectedStandings.size > 0 &&
    Array.from(projectedStandings.values()).every((standings) => standings.isComplete && standings.isFullyActual);
  const roundOf32Placeholders = matches
    .filter((match) => match.stage === "r32" || match.stage === "round_of_32")
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      homeSource: match.home_source ?? null,
      awaySource: match.away_source ?? null,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      status: match.status
    })) satisfies KnockoutPlaceholderMatch[];
  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders) || 8;
  const { rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(standingsRows, requiredThirdPlaceQualifierCount);
  const qualifiedThirdPlaceIds = new Set(rankedThirdPlaceTeams.map((team) => team.teamId));

  return {
    requiredThirdPlaceQualifierCount,
    isScorable,
    actualOutcomes: Array.from(standingsRows.entries())
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([groupName, rows]) => ({
        groupName,
        rankedTeamIds: rows.slice(0, 4).map((row) => row.teamId),
        thirdPlaceQualified: rows[2] ? qualifiedThirdPlaceIds.has(rows[2].teamId) : null
      }))
  };
}

async function fetchTeams(adminSupabase: ReturnType<typeof createAdminClient>): Promise<Team[]> {
  if (!hasSupabaseConfig()) {
    return demoTeams;
  }

  const { data, error } = await adminSupabase
    .from("teams")
    .select("id,name,short_name,group_name,fifa_rank,flag_emoji")
    .order("group_name", { ascending: true })
    .order("fifa_rank", { ascending: true });

  if (error) {
    return demoTeams;
  }

  return (((data as TeamRow[] | null) ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    fifaRank: team.fifa_rank,
    flagEmoji: team.flag_emoji
  }))) || demoTeams;
}

async function fetchMatches(adminSupabase: ReturnType<typeof createAdminClient>): Promise<MatchRow[]> {
  if (!hasSupabaseConfig()) {
    return getGroupMatches().map((match) => ({
      id: match.id,
      stage: match.stage,
      group_name: match.groupName,
      status: match.status,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      home_score: match.homeScore,
      away_score: match.awayScore,
      home_source: null,
      away_source: null,
      kickoff_time: match.kickoffTime
    }));
  }

  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score,home_source,away_source,kickoff_time")
    .order("kickoff_time", { ascending: true });

  if (error) {
    return getGroupMatches().map((match) => ({
      id: match.id,
      stage: match.stage,
      group_name: match.groupName,
      status: match.status,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      home_score: match.homeScore,
      away_score: match.awayScore,
      home_source: null,
      away_source: null,
      kickoff_time: match.kickoffTime
    }));
  }

  return (data as MatchRow[] | null) ?? [];
}

const USER_RANKING_QUERY_BATCH_SIZE = 20;

async function fetchGroupSeedRankingsForUsers(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<GroupSeedRankingRecord[]> {
  const rows: GroupSeedRankingRecord[] = [];

  for (const batch of chunkUserIds(userIds)) {
    const { data, error } = await adminSupabase
      .from("user_group_seed_rankings")
      .select("user_id,group_name,rank_position,team_id")
      .in("user_id", batch)
      .order("user_id", { ascending: true })
      .order("group_name", { ascending: true })
      .order("rank_position", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data as GroupSeedRankingRecord[] | null) ?? []));
  }

  return rows;
}

async function fetchThirdPlaceRankingsForUsers(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<ThirdPlaceRankingRecord[]> {
  const rows: ThirdPlaceRankingRecord[] = [];

  for (const batch of chunkUserIds(userIds)) {
    const { data, error } = await adminSupabase
      .from("user_best_third_rankings")
      .select("user_id,team_id,rank_position")
      .in("user_id", batch)
      .order("user_id", { ascending: true })
      .order("rank_position", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data as ThirdPlaceRankingRecord[] | null) ?? []));
  }

  return rows;
}

function chunkUserIds(userIds: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < userIds.length; index += USER_RANKING_QUERY_BATCH_SIZE) {
    chunks.push(userIds.slice(index, index + USER_RANKING_QUERY_BATCH_SIZE));
  }
  return chunks;
}
