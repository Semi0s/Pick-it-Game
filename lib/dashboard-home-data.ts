import "server-only";

import {
  SIDE_PICKS_TRIPTYCH_PREVIEW_ENABLED_KEY,
  fetchBooleanAppSetting
} from "@/lib/app-settings";
import {
  buildDashboardPicksInPlaySummary,
  createEmptyDashboardMovementSummary,
  filterMatchesByTeamIds,
  getGroupStageSaveStatus,
  getPredictionProgress,
  getLiveMatches,
  getNextMatch,
  getUpcomingMatches,
  resolveDashboardMovementMode,
  type DashboardCommandCenterSummary,
  type DashboardMatchSummary
} from "@/lib/dashboard-home";
import { buildDashboardKnockoutProgressSummary } from "@/lib/knockout-progress";
import { buildKnockoutOutlookSummary } from "@/lib/knockout-outlook";
import { normalizeGroupKey } from "@/lib/group-standings";
import { getGroupTopTwoCompletionStatus } from "@/lib/group-stage-third-place-gate";
import { fetchGlobalLeaderboardRankSummaryForUser } from "@/lib/leaderboard-data";
import {
  createEmptyDashboardScoringMovementSummary,
  fetchGlobalDashboardScoringMovementSummary,
  type DashboardScoringMovementSummary
} from "@/lib/leaderboard-movement";
import {
  PROJECTED_LEADERBOARD_ENABLED_KEY,
  fetchProjectedDashboardScoringMovementSummary,
  fetchProjectedGroupPhaseSummaries
} from "@/lib/projected-leaderboard";
import { selectDashboardProjectedScoreSummary } from "@/lib/projected-leaderboard-mode";
import { buildProjectedGroupStandings } from "@/lib/knockout-seeding";
import {
  buildProjectionOutlookViewModel,
  type ProjectedOutlookCurrentStandings,
  type ProjectedOutlookMatchSummary,
  type ProjectionCheckpointMatch
} from "@/lib/projected-outlook";
import { EXPECTED_KNOCKOUT_MATCH_COUNTS, isRoundOf32Stage, normalizeKnockoutStage } from "@/lib/match-stage";
import { getGroupMatches, teams as demoTeams } from "@/lib/mock-data";
import { GROUP_PHASE_START_AT } from "@/lib/play-mode";
import { loadProjectedRoundOf32FromPreferredSource } from "@/lib/projected-knockout-source";
import { fetchActiveGroupRulesets } from "@/lib/scoped-scoring";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-safety";
import { fetchSidePicksDashboardPreviewProgress, fetchSidePicksDashboardProgress } from "@/lib/side-picks-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { fetchTournamentEntrySettings } from "@/lib/tournament-entry";
import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { fetchUserLightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { getRequiredThirdPlaceQualifierCount } from "@/lib/knockout-seeding";
import { fetchUserBracketPredictions } from "@/lib/bracket-predictions";
import type { BracketPrediction, MatchStage, MatchStatus } from "@/lib/types";

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  flag_emoji: string | null;
  group_name: string | null;
};

type UserRow = {
  total_points: number | null;
  role?: string | null;
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
  home_source?: string | null;
  away_source?: string | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id?: string | null;
  next_match_id?: string | null;
  next_match_slot?: "home" | "away" | null;
};

type GroupMemberRow = {
  group_id: string;
  role: "manager" | "member";
};

type OwnedGroupRow = {
  id: string;
};

type UpdatedAtRow = {
  updated_at: string | null;
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
    scoringMovementResult,
    projectedScoringMovementResult,
    projectedGroupPhaseResult,
    projectedLeaderboardEnabledResult,
    userSettingsResult,
    totalPlayersResult,
    tournamentEntrySettings,
    latestGroupSeedUpdateResult,
    latestThirdPlaceUpdateResult,
    projectedRoundOf32Result,
    knockoutScoreRowsResult,
    sidePicksProgressResult,
    sidePicksPreviewEnabledResult,
    sidePicksPreviewProgressResult
  ] = await Promise.all([
    adminSupabase
      .from("teams")
      .select("id,name,short_name,flag_emoji,group_name")
      .order("group_name", { ascending: true })
      .order("name", { ascending: true }),
    adminSupabase
      .from("matches")
      .select("id,stage,status,kickoff_time,home_team_id,away_team_id,home_source,away_source,home_score,away_score,winner_team_id,next_match_id,next_match_slot")
      .order("kickoff_time", { ascending: true }),
    adminSupabase.from("users").select("total_points,role").eq("id", userId).maybeSingle(),
    adminSupabase.from("group_members").select("group_id,role").eq("user_id", userId),
    adminSupabase.from("groups").select("id").eq("owner_user_id", userId),
    fetchUserLightSeedBuilderSnapshot(adminSupabase, userId).catch(() => null),
    fetchUserBracketPredictions(userId).catch(() => []),
    fetchGlobalLeaderboardRankSummaryForUser(userId).catch(() => ({
      rank: null,
      totalPlayers: 0,
      totalPoints: null
    })),
    fetchGlobalDashboardScoringMovementSummary(userId).catch(() => createEmptyDashboardScoringMovementSummary()),
    fetchProjectedDashboardScoringMovementSummary(userId).catch(() => createEmptyDashboardScoringMovementSummary()),
    fetchProjectedGroupPhaseSummaries([userId]).catch(() => ({
      summaries: new Map(),
      projectionKey: null
    })),
    fetchBooleanAppSetting(PROJECTED_LEADERBOARD_ENABLED_KEY, true).catch(() => true),
    adminSupabase.from("user_settings").select("followed_team_ids").eq("user_id", userId).maybeSingle(),
    adminSupabase.from("users").select("id", { count: "exact", head: true }),
    fetchTournamentEntrySettings(adminSupabase, userId).catch(() => null),
    adminSupabase
      .from("user_group_seed_rankings")
      .select("updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1),
    adminSupabase
      .from("user_best_third_rankings")
      .select("updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1),
    loadProjectedRoundOf32FromPreferredSource(adminSupabase, userId).catch(() => null),
    adminSupabase
      .from("bracket_scores")
      .select("match_id,stage,points")
      .eq("user_id", userId),
    fetchSidePicksDashboardProgress(adminSupabase, userId).catch(() => null),
    fetchBooleanAppSetting(SIDE_PICKS_TRIPTYCH_PREVIEW_ENABLED_KEY, false).catch(() => false),
    fetchSidePicksDashboardPreviewProgress(adminSupabase, userId).catch(() => null)
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
        home_source: null,
        away_source: null,
        home_score: match.homeScore ?? null,
        away_score: match.awayScore ?? null,
        winner_team_id: null,
        next_match_id: null,
        next_match_slot: null
      }));
  const profile = (userResult.data as UserRow | null) ?? null;
  const sidePicksDisplayProgress =
    sidePicksProgressResult ??
    (profile?.role === "admin" && sidePicksPreviewEnabledResult ? sidePicksPreviewProgressResult : null);
  const memberships = ((groupMembershipResult.data as GroupMemberRow[] | null) ?? []);
  const ownedGroups = ((ownedGroupsResult.data as OwnedGroupRow[] | null) ?? []);
  const snapshot = snapshotResult as LightSeedBuilderSnapshot | null;
  const savedKnockoutPredictions = Array.from(
    new Set(((knockoutPredictionsResult ?? []) as BracketPrediction[]).map((prediction) => prediction.matchId))
  );
  const knockoutScoreRows =
    knockoutScoreRowsResult.error && isMissingRelationError(knockoutScoreRowsResult.error.message, "bracket_scores")
      ? []
      : (((knockoutScoreRowsResult.data as Array<{ match_id: string; stage: MatchStage; points: number | null }> | null) ?? []));

  const teamById = new Map(
    teams.map((team) => [team.id, team])
  );
  const dashboardMatches = matches.map((match) => mapDashboardMatch(match, teamById));
  const dashboardMatchById = new Map(dashboardMatches.map((match) => [match.id, match]));
  const projectedCurrentStandings = buildProjectedGroupStandings(
    matches.map((match) => ({
      id: match.id,
      stage: match.stage,
      groupName: match.home_source ? null : teamById.get(match.home_team_id ?? "")?.group_name ?? teamById.get(match.away_team_id ?? "")?.group_name ?? null,
      status: match.status,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null
    })),
    teams.map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name ?? team.name,
      groupName: team.group_name ?? "",
      fifaRank: 999,
      fifaPoints: null,
      flagEmoji: team.flag_emoji ?? ""
    }))
  );
  const currentStandings: ProjectedOutlookCurrentStandings = {
    byGroup: new Map(
      Array.from(projectedCurrentStandings.entries()).map(([groupName, standings]) => [
        groupName,
        standings.rows.map((row) => ({
          teamId: row.teamId,
          rank: row.rank,
          played: row.played,
          wins: row.wins,
          draws: row.draws,
          losses: row.losses,
          points: row.points,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          teamName: row.teamName,
          teamShortName: row.teamCode ?? row.teamName,
          teamCode: row.teamCode ?? null,
          flagEmoji: row.flagEmoji ?? null,
          groupName
        }))
      ])
    )
  };
  const checkpointMatchesById = new Map<string, ProjectionCheckpointMatch>(
    dashboardMatches.map((match) => [
      match.id,
      {
        id: match.id,
        kickoffTime: match.kickoffTime,
        groupLabel: match.groupLabel ?? null,
        homeTeamName: match.homeTeamName,
        awayTeamName: match.awayTeamName,
        homeTeamShortName: match.homeTeamShortName,
        awayTeamShortName: match.awayTeamShortName,
        homeTeamFlagEmoji: match.homeTeamFlagEmoji ?? null,
        awayTeamFlagEmoji: match.awayTeamFlagEmoji ?? null
      }
    ])
  );
  const upcomingProjectedMatches: ProjectedOutlookMatchSummary[] = dashboardMatches
    .filter((match) => normalizeGroupKey(match.groupLabel) && match.status !== "final")
    .map((match) => ({
      id: match.id,
      status: match.status,
      kickoffTime: match.kickoffTime,
      groupLabel: match.groupLabel ?? null,
      homeTeamId: match.homeTeamId ?? null,
      awayTeamId: match.awayTeamId ?? null,
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      homeTeamShortName: match.homeTeamShortName,
      awayTeamShortName: match.awayTeamShortName,
      homeTeamFlagEmoji: match.homeTeamFlagEmoji ?? null,
      awayTeamFlagEmoji: match.awayTeamFlagEmoji ?? null
    }));
  const followedTeamIds = resolveFollowedTeamIds(userSettingsResult.data as UserSettingsRow | null, userSettingsResult.error?.message);
  const reminderMatches = filterMatchesByTeamIds(dashboardMatches, followedTeamIds);
  const reminderLiveMatches = getLiveMatches(reminderMatches, { limit: 2 });
  const reminderUpcomingMatches = reminderLiveMatches.length > 0 ? [] : getUpcomingMatches(reminderMatches, { limit: 6 });
  const reminderNextMatch = reminderLiveMatches.length > 0 ? null : reminderUpcomingMatches[0] ?? getNextMatch(reminderMatches);

  const joinedGroupIds = Array.from(new Set(memberships.map((membership) => membership.group_id).filter(Boolean)));
  const managedGroupIds = Array.from(
    new Set([
      ...memberships.filter((membership) => membership.role === "manager").map((membership) => membership.group_id),
      ...ownedGroups.map((group) => group.id)
    ].filter(Boolean))
  );
  const visibleGroupIds = Array.from(new Set([...joinedGroupIds, ...managedGroupIds]));
  const [groupSummariesResult, groupRulesets] = await Promise.all([
    visibleGroupIds.length > 0
      ? adminSupabase.from("groups").select("id,name").in("id", visibleGroupIds)
      : Promise.resolve({ data: [], error: null }),
    fetchActiveGroupRulesets(adminSupabase, visibleGroupIds).catch(() => new Map())
  ]);
  const groupSummaries = ((groupSummariesResult.data as Array<{ id: string; name: string }> | null) ?? []);

  const groupNames = Array.from(
    new Set(
      teams
        .map((team) => normalizeGroupKey(team.group_name) ?? team.group_name)
        .filter((groupName): groupName is string => Boolean(groupName))
    )
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const totalGroups = Math.max(groupNames.length, 12);
  const teamIdsByGroup = new Map<string, Set<string>>();
  for (const team of teams) {
    const groupName = normalizeGroupKey(team.group_name) ?? team.group_name;
    if (!groupName) {
      continue;
    }

    const current = teamIdsByGroup.get(groupName) ?? new Set<string>();
    current.add(team.id);
    teamIdsByGroup.set(groupName, current);
  }
  const savedGroupNames = new Set(
    (snapshot?.groupRankings ?? []).map((ranking) => normalizeGroupKey(ranking.groupName) ?? ranking.groupName)
  );
  const picksInPlayActivity = buildDashboardPicksInPlaySummary({
    matches: dashboardMatches,
    relevantGroupKeys: savedGroupNames,
    now: Date.now()
  });
  const topTwoCompletionStatus = getGroupTopTwoCompletionStatus({
    groupNames,
    rankings: snapshot?.groupRankings ?? [],
    teamIdsByGroup,
    touchedGroupNames: savedGroupNames
  });
  const completedGroupCount = topTwoCompletionStatus.completeGroupNames.size;
  const roundOf32Placeholders = matches
    .filter((match) => isRoundOf32Stage(match.stage))
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      status: match.status,
      homeSource: match.home_source ?? null,
      awaySource: match.away_source ?? null,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id
    }));
  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders) || 8;
  const selectedThirdPlaceCount = Math.min(snapshot?.thirdPlaceRankings?.length ?? 0, requiredThirdPlaceQualifierCount);
  const projectedRoundOf32ExpectedSideCount = EXPECTED_KNOCKOUT_MATCH_COUNTS.r32 * 2;
  const projectedRoundOf32ResolvedSideCount =
    projectedRoundOf32Result?.projectedSeeds.resolvedSideCount ?? null;
  const latestGroupStageChangedAt = getLatestTimestamp([
    ((latestGroupSeedUpdateResult.data as UpdatedAtRow[] | null) ?? [])[0]?.updated_at ?? null,
    ((latestThirdPlaceUpdateResult.data as UpdatedAtRow[] | null) ?? [])[0]?.updated_at ?? null
  ]);
  const groupStageCommittedAt =
    tournamentEntrySettings?.tournamentEntryMode === "easy_bracket" &&
    (tournamentEntrySettings.tournamentEntryState === "active" || tournamentEntrySettings.tournamentEntryState === "locked") &&
    tournamentEntrySettings.tournamentEntrySubmittedAt
      ? tournamentEntrySettings.tournamentEntrySubmittedAt
      : null;
  const hasGroupStageSnapshot = Boolean((snapshot?.groupRankings.length ?? 0) > 0 || (snapshot?.thirdPlaceRankings.length ?? 0) > 0);
  const groupStageSaveStatus = getGroupStageSaveStatus({
    completedGroups: completedGroupCount,
    totalGroups,
    selectedThirdPlaceCount,
    requiredThirdPlaceCount: requiredThirdPlaceQualifierCount,
    hasSavedProgress: hasGroupStageSnapshot,
    committedAt: groupStageCommittedAt,
    latestChangedAt: latestGroupStageChangedAt
  });

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

  const groupStageProgress = getPredictionProgress({
    phase: "group_stage",
    completedGroups: completedGroupCount,
    totalGroups,
    selectedThirdPlaceCount,
    requiredThirdPlaceCount: requiredThirdPlaceQualifierCount,
    deadlineAt: GROUP_PHASE_START_AT,
    needsSave: groupStageSaveStatus.needsSave,
    hasUncommittedChanges: groupStageSaveStatus.hasMeaningfulChangesAfterCommit,
    lastCommittedAt: groupStageCommittedAt,
    lastChangedAt: latestGroupStageChangedAt,
    projectedRoundOf32ResolvedSideCount,
    projectedRoundOf32ExpectedSideCount
  });
  const knockoutPredictionProgress = getPredictionProgress({
    phase: "knockout_stage",
    savedPredictionCount: savedKnockoutPredictions.length,
    totalPredictionCount: officialKnockoutMatches.length,
    hasFinalPrediction,
    deadlineAt: nextKnockoutDeadline,
    isLive: dashboardMatches.some((match) => match.status === "live" && normalizeKnockoutStage(match.stage) !== null)
  });
  const knockoutOutlook = buildKnockoutOutlookSummary({
    matches: officialKnockoutMatches.map((match) => ({
      id: match.id,
      stage: match.stage,
      status: match.status,
      kickoffTime: match.kickoff_time,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id
    })),
    savedPredictionMatchIds: savedKnockoutPredictions,
    scoreRows: knockoutScoreRows.map((row) => ({
      matchId: row.match_id,
      stage: row.stage,
      points: row.points
    })),
    projectedComparison: projectedRoundOf32Result
      ? {
          projectedSeeds: projectedRoundOf32Result.projectedSeeds
        }
      : null,
    officialRoundOf32Matches: officialKnockoutMatches
      .filter((match) => normalizeKnockoutStage(match.stage) === "r32")
      .map((match) => ({
        id: match.id,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id
      })),
    groupSummaries,
    groupRulesets
  });
  const knockoutBracketProgress = buildDashboardKnockoutProgressSummary({
    matches: officialKnockoutMatches.map((match) => ({
      id: match.id,
      stage: match.stage,
      status: match.status,
      kickoffTime: match.kickoff_time,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      homeSource: match.home_source ?? null,
      awaySource: match.away_source ?? null,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null,
      winnerTeamId: match.winner_team_id ?? null,
      nextMatchId: match.next_match_id ?? null,
      nextMatchSlot: match.next_match_slot ?? null
    })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      flagEmoji: team.flag_emoji
    }))
  });
  const sidePicksProgress = sidePicksDisplayProgress
    ? getPredictionProgress({
        phase: "last_chance",
        completedPickCount: sidePicksDisplayProgress.completedPicks,
        totalPickCount: sidePicksDisplayProgress.totalPicks,
        deadlineAt: sidePicksDisplayProgress.lockAt,
        isLocked: sidePicksDisplayProgress.isLocked
      })
    : null;
  const decoratedOfficialScoreSummary = decorateDashboardScoringMovementSummary(
    scoringMovementResult,
    dashboardMatchById
  );
  const decoratedProjectedScoreSummary = decorateDashboardScoringMovementSummary(
    projectedScoringMovementResult,
    dashboardMatchById
  );
  const progressBase = isKnockoutActive ? knockoutPredictionProgress : groupStageProgress;
  const progress = {
    ...progressBase,
    hasCompletedBracketOnce: groupStageSaveStatus.hasCommittedEntry
  };
  const officialScoreSummary = {
    ...decoratedOfficialScoreSummary,
    currentPoints:
      decoratedOfficialScoreSummary.currentPoints ??
      profile?.total_points ??
      globalRankResult.totalPoints ??
      null,
    currentRank: decoratedOfficialScoreSummary.currentRank ?? globalRankResult.rank ?? null
  };
  const { score: effectiveScoreSummary, scoreKind } = selectDashboardProjectedScoreSummary({
    official: officialScoreSummary,
    projected: decoratedProjectedScoreSummary,
    projectedLeaderboardEnabled: projectedLeaderboardEnabledResult
  });
  const projectedOutlook = buildProjectionOutlookViewModel({
    official: officialScoreSummary,
    projected: decoratedProjectedScoreSummary,
    currentProjection:
      projectedGroupPhaseResult.projectionKey && projectedGroupPhaseResult.summaries.get(userId)
        ? {
            checkpointId: projectedGroupPhaseResult.projectionKey,
            createdAt:
              getLatestTimestamp(
                dashboardMatches
                  .filter((match) => match.status === "live" || match.status === "final")
                  .map((match) => match.kickoffTime)
              ) ?? decoratedProjectedScoreSummary.latestSnapshotAt ?? null,
            projectedFinalPoints: projectedGroupPhaseResult.summaries.get(userId)?.projectedPoints ?? null,
            projectedRank: null
          }
        : null,
    checkpointMatchesById,
    snapshot,
    currentStandings,
    allMatches: dashboardMatches
      .filter((match) => normalizeGroupKey(match.groupLabel))
      .map((match) => ({
        id: match.id,
        status: match.status,
        kickoffTime: match.kickoffTime,
        groupLabel: match.groupLabel ?? null,
        homeTeamId: match.homeTeamId ?? null,
        awayTeamId: match.awayTeamId ?? null,
        homeTeamName: match.homeTeamName,
        awayTeamName: match.awayTeamName,
        homeTeamShortName: match.homeTeamShortName,
        awayTeamShortName: match.awayTeamShortName,
        homeTeamFlagEmoji: match.homeTeamFlagEmoji ?? null,
        awayTeamFlagEmoji: match.awayTeamFlagEmoji ?? null
      })),
    upcomingMatches: upcomingProjectedMatches,
    language: null
  });

  return {
    progress,
    progressViews: {
      group_stage_progress: {
        ...groupStageProgress,
        hasCompletedBracketOnce: groupStageSaveStatus.hasCommittedEntry
      },
      knockout_progress: {
        ...knockoutPredictionProgress,
        knockoutOutlook
      },
      side_picks_progress: sidePicksProgress
    },
    performance: {
      globalPoints: profile?.total_points ?? globalRankResult.totalPoints ?? null,
      globalRank: globalRankResult.rank,
      invitedGroups: joinedGroupIds.length,
      managedGroups: managedGroupIds.length,
      totalGroups: visibleGroupIds.length,
      totalPlayers: totalPlayersResult.count ?? globalRankResult.totalPlayers ?? 0
    },
    scoring: {
      mode: resolveDashboardMovementMode({
        score: effectiveScoreSummary,
        activity: picksInPlayActivity
      }),
      scoreKind,
      score: effectiveScoreSummary,
      projectedOutlook,
      activity: picksInPlayActivity
    },
    reminder: {
      followedTeamCount: followedTeamIds.length,
      nextMatch: reminderNextMatch,
      upcomingMatches: reminderUpcomingMatches,
      liveMatches: reminderLiveMatches
    },
    knockoutProgress: knockoutBracketProgress
  };
}

function getLatestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
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
    progressViews: {
      group_stage_progress: getPredictionProgress({
        phase: "group_stage",
        completedGroups: 0,
        totalGroups: 12,
        selectedThirdPlaceCount: 0,
        requiredThirdPlaceCount: 8,
        deadlineAt: GROUP_PHASE_START_AT
      }),
      knockout_progress: getPredictionProgress({
        phase: "knockout_stage",
        savedPredictionCount: 0,
        totalPredictionCount: 16,
        hasFinalPrediction: false,
        deadlineAt: null
      }),
      side_picks_progress: null
    },
    performance: {
      globalPoints: null,
      globalRank: null,
      invitedGroups: 0,
      managedGroups: 0,
      totalGroups: 0,
      totalPlayers: 0
    },
    scoring: createEmptyDashboardMovementSummary(),
    reminder: {
      followedTeamCount: 0,
      nextMatch: null,
      upcomingMatches: [],
      liveMatches: []
    },
    knockoutProgress: null
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
    homeSource: match.home_source ?? null,
    awaySource: match.away_source ?? null,
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

function decorateDashboardScoringMovementSummary(
  summary: DashboardScoringMovementSummary,
  matchesById: ReadonlyMap<string, DashboardMatchSummary>
): DashboardScoringMovementSummary {
  if (summary.history.length === 0) {
    return summary;
  }

  return {
    ...summary,
    history: summary.history.map((point) => {
      const match = matchesById.get(point.matchId);
      if (!match) {
        return point;
      }

      return {
        ...point,
        stage: match.stage,
        compactMatchupLabel: buildCompactDashboardMatchLabel(match),
        matchupLabel: buildDashboardMatchLabel(match)
      };
    })
  };
}

function buildCompactDashboardMatchLabel(match: DashboardMatchSummary) {
  return `${match.homeTeamShortName} v ${match.awayTeamShortName}`;
}

function buildDashboardMatchLabel(match: DashboardMatchSummary) {
  const homeFlag = match.homeTeamFlagEmoji ? `${match.homeTeamFlagEmoji} ` : "";
  const awayFlag = match.awayTeamFlagEmoji ? `${match.awayTeamFlagEmoji} ` : "";
  return `${homeFlag}${match.homeTeamShortName} v ${awayFlag}${match.awayTeamShortName}`;
}

function resolveFollowedTeamIds(row: UserSettingsRow | null, errorMessage?: string) {
  if (isMissingRelationError(errorMessage, "user_settings") || isMissingColumnError(errorMessage, "user_settings", "followed_team_ids")) {
    return [];
  }

  const validIds = new Set(demoTeams.map((team) => team.id));
  return (row?.followed_team_ids ?? []).filter((teamId): teamId is string => typeof teamId === "string" && validIds.has(teamId));
}
