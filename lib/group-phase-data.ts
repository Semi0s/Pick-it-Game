import "server-only";

import { scoreGroupPhaseSnapshot, type GroupPhaseActualOutcome } from "@/lib/group-phase-scoring";
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
    adminSupabase
      .from("user_group_seed_rankings")
      .select("user_id,group_name,rank_position,team_id")
      .in("user_id", uniqueUserIds)
      .order("user_id", { ascending: true })
      .order("group_name", { ascending: true })
      .order("rank_position", { ascending: true }),
    adminSupabase
      .from("user_best_third_rankings")
      .select("user_id,team_id,rank_position")
      .in("user_id", uniqueUserIds)
      .order("user_id", { ascending: true })
      .order("rank_position", { ascending: true })
  ]);

  const groupedRankings = new Map<string, Map<string, string[]>>();
  for (const row of ((groupSeedRows.data as GroupSeedRankingRecord[] | null) ?? [])) {
    const normalizedGroup = normalizeGroupKey(row.group_name) ?? row.group_name;
    const byGroup = groupedRankings.get(row.user_id) ?? new Map<string, string[]>();
    const ranked = byGroup.get(normalizedGroup) ?? [];
    ranked.push(row.team_id);
    byGroup.set(normalizedGroup, ranked);
    groupedRankings.set(row.user_id, byGroup);
  }

  const groupedThirdPlaceRankings = new Map<string, Array<{ teamId: string; rank: number }>>();
  for (const row of ((thirdPlaceRows.data as ThirdPlaceRankingRecord[] | null) ?? [])) {
    const current = groupedThirdPlaceRankings.get(row.user_id) ?? [];
    current.push({ teamId: row.team_id, rank: row.rank_position });
    groupedThirdPlaceRankings.set(row.user_id, current);
  }

  for (const userId of uniqueUserIds) {
    const rankingMap = groupedRankings.get(userId) ?? null;
    const snapshot: LightSeedBuilderSnapshot | null =
      rankingMap || groupedThirdPlaceRankings.has(userId)
        ? {
            groupRankings: Array.from((rankingMap ?? new Map()).entries())
              .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
              .map(([groupName, rankedTeamIds]) => ({ groupName, rankedTeamIds })),
            thirdPlaceRankings: (groupedThirdPlaceRankings.get(userId) ?? []).sort((left, right) => left.rank - right.rank)
          }
        : null;

    const summary = scoreGroupPhaseSnapshot({
      snapshot,
      actualOutcomes,
      requiredThirdPlaceQualifierCount
    });

    result.set(userId, {
      userId,
      snapshot,
      points: isScorable ? summary.totalPoints : 0,
      maxPoints: summary.maxPoints,
      hasSnapshot: Boolean(snapshot?.groupRankings.length || snapshot?.thirdPlaceRankings.length)
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
