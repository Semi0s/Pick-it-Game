import "server-only";

import {
  filterMatchesByTeamIds,
  getPredictionProgress,
  getLiveMatches,
  getNextMatch,
  type DashboardCommandCenterSummary,
  type DashboardMatchSummary
} from "@/lib/dashboard-home";
import { fetchGlobalLeaderboardRankSummaryForUser } from "@/lib/leaderboard-data";
import { EXPECTED_KNOCKOUT_MATCH_COUNTS, isRoundOf32Stage, normalizeKnockoutStage } from "@/lib/match-stage";
import { getGroupMatches, teams as demoTeams } from "@/lib/mock-data";
import { GROUP_PHASE_START_AT } from "@/lib/play-mode";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-safety";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { fetchUserLightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { getRequiredThirdPlaceQualifierCount } from "@/lib/knockout-seeding";
import { fetchUserBracketPredictions } from "@/lib/bracket-predictions";
import type { MatchStage, MatchStatus } from "@/lib/types";

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  flag_emoji: string | null;
  group_name: string | null;
};

type UserRow = {
  total_points: number | null;
};

type UserSettingsRow = {
  followed_team_ids?: string[] | null;
};

type MatchRow = {
  id: string;
  stage: MatchStage;
  status: MatchStatus;
  kickoff_time: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
};

type GroupMemberRow = {
  group_id: string;
  role: "manager" | "member";
};

type OwnedGroupRow = {
  id: string;
};

export async function fetchDashboardCommandCenterData(userId: string): Promise<DashboardCommandCenterSummary> {
  if (!userId) {
    return buildFallbackDashboardCommandCenter();
  }

  if (!hasSupabaseConfig()) {
    return buildFallbackDashboardCommandCenter();
  }

  const adminSupabase = createAdminClient();
  const [
    teamsResult,
    matchesResult,
    userResult,
    groupMembershipResult,
    ownedGroupsResult,
    snapshotResult,
    knockoutPredictionsResult,
    globalRankResult,
    userSettingsResult
  ] = await Promise.all([
    adminSupabase
      .from("teams")
      .select("id,name,short_name,flag_emoji,group_name")
      .order("group_name", { ascending: true })
      .order("name", { ascending: true }),
    adminSupabase
      .from("matches")
      .select("id,stage,status,kickoff_time,home_team_id,away_team_id,home_score,away_score")
      .order("kickoff_time", { ascending: true }),
    adminSupabase.from("users").select("total_points").eq("id", userId).maybeSingle(),
    adminSupabase.from("group_members").select("group_id,role").eq("user_id", userId),
    adminSupabase.from("groups").select("id").eq("owner_user_id", userId),
    fetchUserLightSeedBuilderSnapshot(adminSupabase, userId).catch(() => null),
    fetchUserBracketPredictions(userId).catch(() => []),
    fetchGlobalLeaderboardRankSummaryForUser(userId).catch(() => ({
      rank: null,
      totalPlayers: 0,
      totalPoints: null
    })),
    adminSupabase.from("user_settings").select("followed_team_ids").eq("user_id", userId).maybeSingle()
  ]);

  const teams = ((teamsResult.data as TeamRow[] | null) ?? []).length
    ? ((teamsResult.data as TeamRow[] | null) ?? [])
    : demoTeams.map((team) => ({
        id: team.id,
        name: team.name,
        short_name: team.shortName,
        flag_emoji: team.flagEmoji,
        group_name: team.groupName
      }));
  const matches = ((matchesResult.data as MatchRow[] | null) ?? []).length
    ? ((matchesResult.data as MatchRow[] | null) ?? [])
    : getGroupMatches().map((match) => ({
        id: match.id,
        stage: match.stage,
        status: match.status,
        kickoff_time: match.kickoffTime,
        home_team_id: match.homeTeamId ?? null,
        away_team_id: match.awayTeamId ?? null,
        home_score: match.homeScore ?? null,
        away_score: match.awayScore ?? null
      }));
  const profile = (userResult.data as UserRow | null) ?? null;
  const memberships = ((groupMembershipResult.data as GroupMemberRow[] | null) ?? []);
  const ownedGroups = ((ownedGroupsResult.data as OwnedGroupRow[] | null) ?? []);
  const snapshot = snapshotResult as LightSeedBuilderSnapshot | null;
  const savedKnockoutPredictions = Array.from(new Set((knockoutPredictionsResult ?? []).map((prediction) => prediction.matchId)));

  const teamById = new Map(
    teams.map((team) => [team.id, team])
  );
  const dashboardMatches = matches.map((match) => mapDashboardMatch(match, teamById));
  const followedTeamIds = resolveFollowedTeamIds(userSettingsResult.data as UserSettingsRow | null, userSettingsResult.error?.message);
  const reminderMatches = filterMatchesByTeamIds(dashboardMatches, followedTeamIds);
  const reminderLiveMatches = getLiveMatches(reminderMatches, { limit: 2 });
  const reminderNextMatch = reminderLiveMatches.length > 0 ? null : getNextMatch(reminderMatches);

  const joinedGroupIds = Array.from(new Set(memberships.map((membership) => membership.group_id).filter(Boolean)));
  const managedGroupIds = Array.from(
    new Set([
      ...memberships.filter((membership) => membership.role === "manager").map((membership) => membership.group_id),
      ...ownedGroups.map((group) => group.id)
    ].filter(Boolean))
  );
  const visibleGroupIds = Array.from(new Set([...joinedGroupIds, ...managedGroupIds]));

  const totalGroups = Math.max(
    new Set(teams.map((team) => team.group_name).filter(Boolean)).size,
    12
  );
  const completedGroupCount = (snapshot?.groupRankings ?? []).filter(
    (ranking) => new Set((ranking.rankedTeamIds ?? []).filter(Boolean)).size >= 4
  ).length;
  const roundOf32Placeholders = matches
    .filter((match) => isRoundOf32Stage(match.stage))
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      status: match.status,
      homeSource: null,
      awaySource: null,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id
    }));
  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders) || 8;
  const selectedThirdPlaceCount = Math.min(snapshot?.thirdPlaceRankings?.length ?? 0, requiredThirdPlaceQualifierCount);

  const knockoutCounts = {
    r32: 0,
    r16: 0,
    qf: 0,
    sf: 0,
    third: 0,
    final: 0
  };
  let seededRoundOf32Count = 0;
  const officialKnockoutMatches = matches.filter((match) => {
    const canonicalStage = normalizeKnockoutStage(match.stage);
    if (!canonicalStage) {
      return false;
    }

    knockoutCounts[canonicalStage] += 1;
    if (canonicalStage === "r32" && match.home_team_id && match.away_team_id) {
      seededRoundOf32Count += 1;
    }

    return true;
  });
  const hasRequiredKnockoutStructure = (Object.keys(EXPECTED_KNOCKOUT_MATCH_COUNTS) as Array<keyof typeof EXPECTED_KNOCKOUT_MATCH_COUNTS>)
    .filter((stage) => stage !== "third")
    .every((stage) => knockoutCounts[stage] >= EXPECTED_KNOCKOUT_MATCH_COUNTS[stage]);
  const isKnockoutActive =
    hasRequiredKnockoutStructure && seededRoundOf32Count >= EXPECTED_KNOCKOUT_MATCH_COUNTS.r32;
  const nextKnockoutDeadline =
    officialKnockoutMatches
      .filter((match) => match.status !== "final" && match.kickoff_time)
      .sort((left, right) => String(left.kickoff_time).localeCompare(String(right.kickoff_time)))[0]?.kickoff_time ?? null;
  const hasFinalPrediction = officialKnockoutMatches
    .filter((match) => normalizeKnockoutStage(match.stage) === "final")
    .some((match) => savedKnockoutPredictions.includes(match.id));

  const progress = isKnockoutActive
    ? getPredictionProgress({
        phase: "knockout_stage",
        savedPredictionCount: savedKnockoutPredictions.length,
        totalPredictionCount: officialKnockoutMatches.length,
        hasFinalPrediction,
        deadlineAt: nextKnockoutDeadline,
        isLive: dashboardMatches.some((match) => match.status === "live" && normalizeKnockoutStage(match.stage) !== null)
      })
    : getPredictionProgress({
        phase: "group_stage",
        completedGroups: completedGroupCount,
        totalGroups,
        selectedThirdPlaceCount,
        requiredThirdPlaceCount: requiredThirdPlaceQualifierCount,
        deadlineAt: GROUP_PHASE_START_AT
      });

  return {
    progress,
    performance: {
      globalPoints: profile?.total_points ?? globalRankResult.totalPoints ?? null,
      globalRank: globalRankResult.rank,
      totalGroups: visibleGroupIds.length
    },
    reminder: {
      followedTeamCount: followedTeamIds.length,
      nextMatch: reminderNextMatch,
      liveMatches: reminderLiveMatches
    }
  };
}

function buildFallbackDashboardCommandCenter(): DashboardCommandCenterSummary {
  return {
    progress: getPredictionProgress({
      phase: "group_stage",
      completedGroups: 0,
      totalGroups: 12,
      selectedThirdPlaceCount: 0,
      requiredThirdPlaceCount: 8,
      deadlineAt: GROUP_PHASE_START_AT
    }),
    performance: {
      globalPoints: null,
      globalRank: null,
      totalGroups: 0
    },
    reminder: {
      followedTeamCount: 0,
      nextMatch: null,
      liveMatches: []
    }
  };
}

function mapDashboardMatch(
  match: MatchRow,
  teamById: Map<string, TeamRow>
): DashboardMatchSummary {
  const homeTeam = match.home_team_id ? teamById.get(match.home_team_id) ?? null : null;
  const awayTeam = match.away_team_id ? teamById.get(match.away_team_id) ?? null : null;

  return {
    id: match.id,
    stage: match.stage,
    status: match.status,
    kickoffTime: match.kickoff_time ?? null,
    groupLabel: homeTeam?.group_name ?? awayTeam?.group_name ?? null,
    homeTeamId: match.home_team_id ?? null,
    awayTeamId: match.away_team_id ?? null,
    homeTeamName: homeTeam?.name ?? "TBD",
    awayTeamName: awayTeam?.name ?? "TBD",
    homeTeamShortName: homeTeam?.short_name?.trim() || homeTeam?.name || "TBD",
    awayTeamShortName: awayTeam?.short_name?.trim() || awayTeam?.name || "TBD",
    homeTeamFlagEmoji: homeTeam?.flag_emoji ?? null,
    awayTeamFlagEmoji: awayTeam?.flag_emoji ?? null,
    homeScore: match.home_score ?? null,
    awayScore: match.away_score ?? null
  };
}

function resolveFollowedTeamIds(row: UserSettingsRow | null, errorMessage?: string) {
  if (isMissingRelationError(errorMessage, "user_settings") || isMissingColumnError(errorMessage, "user_settings", "followed_team_ids")) {
    return [];
  }

  const validIds = new Set(demoTeams.map((team) => team.id));
  return (row?.followed_team_ids ?? []).filter((teamId): teamId is string => typeof teamId === "string" && validIds.has(teamId));
}
