import { fetchLeaderboardFeatureSettings, type LeaderboardFeatureSettings } from "@/lib/app-settings";
import {
  fetchGroupLeaderboardActivity,
  fetchRecentGlobalLeaderboardActivity,
  type LeaderboardActivityItem
} from "@/lib/leaderboard-activity";
import { fetchGroupLeaderboardRankMovement } from "@/lib/leaderboard-movement";
import { demoUsers } from "@/lib/mock-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { fetchGroupCustomScoreTotals, fetchStandardSidePickTotalsByUser } from "@/lib/scoped-scoring";
import {
  fetchDailyWinners,
  fetchPerfectPickUserIdsForLatestFinalizedMatch,
  type DailyWinner
} from "@/lib/leaderboard-highlights";
import { fetchGlobalChallengeSummaries } from "@/lib/global-challenge-data";
import { fetchGroupPhaseSummaries } from "@/lib/group-phase-data";
import {
  fetchProjectedGroupPhaseSummaries,
  fetchProjectedLeaderboardRankMovement,
  persistProjectedLeaderboardSnapshots,
  type ProjectedGroupPhaseUserSummary
} from "@/lib/projected-leaderboard";
import { shouldUseProjectedLeaderboardMode } from "@/lib/projected-leaderboard-mode";
import { isMissingAnyRelationError, isMissingColumnError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { assignDeterministicRanks, assignDeterministicRanksWithComparator, compareLeaderboardEntries } from "@/lib/scoring-engine";
import { hasOrganizerAccess, normalizeCommercialTier, resolveAccessLevel, type AccessLevel } from "@/lib/tier-access";
import { areLeaderboardCommentsEnabledForScope } from "@/lib/ugc-safety";
import type { UserProfile, UserTrophy } from "@/lib/types";

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
  visual_theme_id?: string | null;
  role: UserProfile["role"];
  plan_tier?: string | null;
  total_points: number;
};

type UserSettingsVisualThemeRow = {
  user_id: string;
  visual_theme_id?: string | null;
};

type BracketScoreRow = {
  user_id: string;
  points?: number | null;
};

// Visible Group Phase leaderboard points come from the ladder summaries.
// Do not substitute legacy full-score `prediction_scores` rows here unless
// the product scoring model intentionally changes.

type LatestSnapshotRow = {
  match_id: string;
  created_at: string;
};

type GroupRow = {
  id: string;
  name: string;
  avatar_url?: string | null;
  status?: "active" | "archived";
  owner_user_id?: string | null;
  owner?:
    | { id: string; name: string; email: string }
    | Array<{ id: string; name: string; email: string }>
    | null;
};

type GroupMemberRow = {
  group_id: string;
  role: "manager" | "member";
  user_id: string;
  user?:
    | { id: string; name: string; email: string; total_points: number }
    | Array<{ id: string; name: string; email: string; total_points: number }>
    | null;
};

type ManagerLimitRow = {
  user_id: string;
  max_groups?: number | null;
  max_members_per_group?: number | null;
};

type TeamCatalogRow = {
  id: string;
  name: string;
  short_name: string;
  flag_emoji?: string | null;
};

type UserTrophyRow = {
  user_id: string;
  awarded_at: string;
  trophies:
    | {
        id: string;
        key: string;
        name: string;
        description: string;
        icon: string;
        tier?: "bronze" | "silver" | "gold" | "special" | null;
      }
    | Array<{
        id: string;
        key: string;
        name: string;
        description: string;
        icon: string;
        tier?: "bronze" | "silver" | "gold" | "special" | null;
      }>
    | null;
};

export type LeaderboardListItem = UserProfile & {
  rank: number;
  rankDelta: number | null;
  pointsDelta: number | null;
  projectedPoints?: number | null;
  hasPerfectPickHighlight: boolean;
  standardPoints?: number;
  groupCustomPoints?: number;
  groupPhasePoints?: number | null;
  knockoutPhasePoints?: number | null;
  globalTopTenPoints?: number | null;
  sidePickPoints?: number | null;
  groupStrategyPoints?: number | null;
  knockoutGlobalPoints?: number | null;
  globalChallengePoints?: number | null;
};

export type LeaderboardSwitcherView = "global" | "my_groups" | "managed_groups" | "groups" | "teams" | "managers";
export type LeaderboardPhase = "group_phase" | "knockout_phase" | "side_picks" | "global_top10";
export type LeaderboardMode = "official" | "projected";

export type LeaderboardSwitcherOption = {
  id: string;
  label: string;
};

export type LeaderboardGroupNavItem = LeaderboardSwitcherOption & {
  rank: number | null;
  totalPlayers: number;
  points: number | null;
  rankDelta: number | null;
  context: "joined" | "managed" | "all";
  avatarUrl?: string | null;
  managerName: string | null;
  averagePoints: number | null;
  globalRank: number | null;
};

export type LeaderboardSwitcherContext = {
  accessLevel: AccessLevel;
  tabs: Array<{
    value: LeaderboardSwitcherView;
    label: string;
  }>;
  groups: LeaderboardSwitcherOption[];
  joinedGroups: LeaderboardGroupNavItem[];
  managedGroups: LeaderboardGroupNavItem[];
  managers: LeaderboardSwitcherOption[];
};

export type LeaderboardPageData = {
  leaderboard: LeaderboardListItem[];
  groupStandings: GroupStandingItem[];
  teamStandings: TeamStandingItem[];
  switcher: LeaderboardSwitcherContext;
  dailyWinners: DailyWinner[];
  activityFeed: LeaderboardActivityItem[];
  settings: LeaderboardFeatureSettings;
  phase: LeaderboardPhase;
  mode: LeaderboardMode;
  currentUserRank: number | null;
  globalLeaderboardTotalPlayers: number;
};

export type GroupStandingItem = {
  id: string;
  rank: number;
  name: string;
  managerName: string;
  totalPoints: number;
  avgPoints: number;
  playerCount: number;
  topPlayerName: string;
  topPlayerPoints: number;
  perfectPickCount: number | null;
  recentActivityCount: number | null;
  tag: string | null;
  scoringScope: "standard";
  visibility: "standings" | "directory";
};

export type TeamStandingItem = {
  id: string;
  rank: number;
  name: string;
  shortName: string;
  flagEmoji?: string | null;
  avgPoints: number;
  totalPoints: number;
  playerCount: number;
  topPlayerName: string;
  topPlayerPoints: number;
  tag: string | null;
};

export type LeaderboardPageRequest = {
  phase?: LeaderboardPhase;
  mode?: LeaderboardMode;
  view?: LeaderboardSwitcherView;
  groupId?: string;
  managerId?: string;
};

export type GlobalLeaderboardRankSummary = {
  rank: number | null;
  totalPlayers: number;
  totalPoints: number | null;
};

export async function fetchLeaderboardPageData(request?: LeaderboardPageRequest): Promise<LeaderboardPageData> {
  const phase = normalizeLeaderboardPhase(request?.phase);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: currentUser }
  } = await supabase.auth.getUser();

  if (!hasSupabaseConfig()) {
    return {
      leaderboard: [...demoUsers]
        .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name))
        .map((user, index) => ({
          ...user,
          rank: index + 1,
          rankDelta: null,
          pointsDelta: null,
          hasPerfectPickHighlight: false
        })),
      groupStandings: [],
      teamStandings: [],
      dailyWinners: [],
      activityFeed: [],
      settings: await fetchLeaderboardFeatureSettings(),
      phase,
      mode: "official",
      currentUserRank: null,
      globalLeaderboardTotalPlayers: demoUsers.length,
      switcher: {
        accessLevel: "player",
        tabs: [
          { value: "my_groups", label: "Invited / Joined Groups" },
          { value: "global", label: "Global Standings" }
        ],
        groups: [],
        joinedGroups: [],
        managedGroups: [],
        managers: []
      }
    };
  }

  const [settings, switcher] = await Promise.all([fetchLeaderboardFeatureSettings(), fetchLeaderboardSwitcherContext()]);
  const activeView = resolveAllowedView(request?.view, switcher);
  const mode = shouldUseProjectedLeaderboardMode({
    requestedMode: request?.mode,
    projectedLeaderboardEnabled: settings.projected_leaderboard_enabled,
    phase,
    view: activeView
  })
    ? "projected"
    : "official";
  const selectedGroupId = resolveAllowedGroupId(request?.groupId, switcher, activeView);
  const groupStandingIds = switcher.groups.map((group) => group.id);
  const groupStandingsPromise = activeView === "groups"
    ? fetchGroupStandingsForAccessibleGroups(
        switcher.accessLevel,
        groupStandingIds,
        settings.perfect_pick_enabled
      )
    : Promise.resolve([]);
  const teamStandingsPromise = activeView === "teams" ? fetchTeamStandings() : Promise.resolve([]);
  const leaderboardPromise =
    activeView === "global"
      ? fetchGlobalLeaderboardRows(phase, settings.perfect_pick_enabled, mode)
      : selectedGroupId
        ? fetchGroupLeaderboardRows(selectedGroupId, phase, settings.perfect_pick_enabled, mode)
        : Promise.resolve([]);
  const dailyWinnersPromise =
    settings.daily_winner_enabled && mode === "official"
      ? activeView === "global"
        ? fetchDailyWinners()
        : selectedGroupId
          ? fetchDailyWinners(selectedGroupId)
          : Promise.resolve([])
      : Promise.resolve([]);

  const [rawLeaderboard, dailyWinners, groupStandings, teamStandings] = await Promise.all([
    leaderboardPromise,
    dailyWinnersPromise,
    groupStandingsPromise,
    teamStandingsPromise
  ]);
  const currentUserRank =
    activeView === "global" && currentUser
      ? rawLeaderboard.find((item) => item.id === currentUser.id)?.rank ?? null
      : null;
  const globalLeaderboardTotalPlayers = activeView === "global" ? rawLeaderboard.length : 0;
  const hasGlobalTopTenScoringStarted =
    activeView === "global" &&
    phase === "global_top10" &&
    rawLeaderboard.some((item) => (item.globalTopTenPoints ?? item.totalPoints ?? 0) > 0);
  const leaderboard =
    activeView === "global" && phase === "global_top10"
      ? rawLeaderboard.slice(0, hasGlobalTopTenScoringStarted ? 10 : 30)
      : rawLeaderboard;
  const commentsEnabledForActivity =
    settings.leaderboard_comments_enabled && selectedGroupId && mode === "official"
      ? await areLeaderboardCommentsEnabledForScope("group", selectedGroupId)
      : false;
  const activityFeed =
    settings.leaderboard_activity_enabled && mode === "official"
      ? activeView === "global"
        ? await fetchRecentGlobalLeaderboardActivity({
            includeDailyWinner: settings.daily_winner_enabled,
            dailyWinnersFallback: dailyWinners,
            includeComments: false
          })
        : selectedGroupId
          ? await fetchGroupLeaderboardActivity(selectedGroupId, {
              includeDailyWinner: settings.daily_winner_enabled,
              dailyWinnersFallback: dailyWinners,
              includeComments: commentsEnabledForActivity
            })
          : []
      : [];

  return {
    leaderboard: leaderboard.map((item) => ({
      ...item,
      rankDelta: settings.leaderboard_activity_enabled ? item.rankDelta : null,
      pointsDelta: settings.leaderboard_activity_enabled ? item.pointsDelta : null,
      hasPerfectPickHighlight: settings.perfect_pick_enabled ? item.hasPerfectPickHighlight : false
    })),
    groupStandings,
    teamStandings,
    dailyWinners: settings.daily_winner_enabled ? dailyWinners : [],
    activityFeed: settings.leaderboard_activity_enabled ? activityFeed : [],
    settings,
    phase,
    mode,
    currentUserRank,
    globalLeaderboardTotalPlayers,
    switcher
  };
}

export async function fetchGlobalLeaderboardRankSummaryForUser(
  userId: string,
  phase: LeaderboardPhase = "global_top10"
): Promise<GlobalLeaderboardRankSummary> {
  if (!userId) {
    return {
      rank: null,
      totalPlayers: 0,
      totalPoints: null
    };
  }

  if (!hasSupabaseConfig()) {
    const rankedDemoUsers = [...demoUsers]
      .sort((left, right) => right.totalPoints - left.totalPoints || left.name.localeCompare(right.name))
      .map((user, index) => ({ ...user, rank: index + 1 }));
    const currentUser = rankedDemoUsers.find((user) => user.id === userId) ?? null;

    return {
      rank: currentUser?.rank ?? null,
      totalPlayers: rankedDemoUsers.length,
      totalPoints: currentUser?.totalPoints ?? null
    };
  }

  const settings = await fetchLeaderboardFeatureSettings();
  const rows = await fetchGlobalLeaderboardRows(phase, settings.perfect_pick_enabled);
  const currentUser = rows.find((row) => row.id === userId) ?? null;

  return {
    rank: currentUser?.rank ?? null,
    totalPlayers: rows.length,
    totalPoints: currentUser?.totalPoints ?? null
  };
}

async function fetchGroupStandingsForAccessibleGroups(
  accessLevel: AccessLevel,
  accessibleGroupIds: string[],
  perfectPickEnabled: boolean
): Promise<GroupStandingItem[]> {
  const adminSupabase = createAdminClient();
  if (accessLevel === "super_admin") {
    return fetchSuperAdminGroupDirectory(adminSupabase);
  }

  if (accessLevel === "player" || accessibleGroupIds.length === 0) {
    return [];
  }

  const groupsQuery = adminSupabase
    .from("groups")
    .select("id,name,status,owner_user_id,owner:users!groups_owner_user_id_fkey(id,name,email)")
    .order("name", { ascending: true });
  const membershipsQuery = adminSupabase
    .from("group_members")
    .select("group_id,user_id,role,user:users!group_members_user_id_fkey(id,name,email,total_points)");
  const activityCountsQuery = adminSupabase
    .from("leaderboard_events")
    .select("group_id")
    .eq("scope_type", "group");

  const scopedGroupsQuery = groupsQuery.in("id", accessibleGroupIds);
  const scopedMembershipsQuery = membershipsQuery.in("group_id", accessibleGroupIds);
  const scopedActivityCountsQuery = activityCountsQuery.in("group_id", accessibleGroupIds);

  const [
    { data: groupsData, error: groupsError },
    { data: membershipsData, error: membershipsError },
    { data: activityRows, error: activityError }
  ] = await Promise.all([scopedGroupsQuery, scopedMembershipsQuery, scopedActivityCountsQuery]);

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  if (activityError && !isMissingAnyRelationError(activityError.message, ["leaderboard_events"])) {
    throw new Error(activityError.message);
  }

  const groups = (groupsData as GroupRow[] | null) ?? [];
  const memberships = (membershipsData as GroupMemberRow[] | null) ?? [];
  const hasActivityCounts = !activityError;

  if (groups.length === 0 || memberships.length === 0) {
    return [];
  }

  const membersByGroupId = new Map<
    string,
    Array<{ userId: string; name: string; totalPoints: number; role: "manager" | "member" }>
  >();

  for (const membership of memberships) {
    const user = Array.isArray(membership.user) ? membership.user[0] : membership.user;
    if (!user) {
      continue;
    }

    const list = membersByGroupId.get(membership.group_id) ?? [];
    list.push({
      userId: membership.user_id,
      name: user.name,
      totalPoints: user.total_points,
      role: membership.role
    });
    membersByGroupId.set(membership.group_id, list);
  }

  const recentActivityCountByGroupId = new Map<string, number>();
  for (const row of ((activityRows as Array<{ group_id: string | null }> | null) ?? [])) {
    if (!row.group_id) {
      continue;
    }

    recentActivityCountByGroupId.set(row.group_id, (recentActivityCountByGroupId.get(row.group_id) ?? 0) + 1);
  }

  const perfectPickCountsByGroupId = new Map<string, number>();
  if (perfectPickEnabled) {
    await Promise.all(
      groups.map(async (group) => {
        const winnerIds = await fetchPerfectPickUserIdsForLatestFinalizedMatch(group.id);
        perfectPickCountsByGroupId.set(group.id, winnerIds.size);
      })
    );
  }

  return groups
    .map((group) => {
      const owner = Array.isArray(group.owner) ? group.owner[0] : group.owner;
      const members = membersByGroupId.get(group.id) ?? [];
      if (members.length === 0) {
        return null;
      }

      const totalPoints = members.reduce((sum, member) => sum + member.totalPoints, 0);
      const playerCount = members.length;
      const avgPoints = totalPoints / playerCount;
      const topPlayer = [...members].sort(
        (left, right) => right.totalPoints - left.totalPoints || left.name.localeCompare(right.name)
      )[0];
      const manager = members.find((member) => member.role === "manager");
      const perfectPickCount = perfectPickEnabled ? (perfectPickCountsByGroupId.get(group.id) ?? 0) : null;
      const recentActivityCount = hasActivityCounts ? (recentActivityCountByGroupId.get(group.id) ?? 0) : null;

      return {
        id: group.id,
        rank: 0,
        name: group.status === "archived" ? `${group.name} (Archived)` : group.name,
        managerName: manager?.name ?? owner?.name ?? "Group manager",
        totalPoints,
        avgPoints,
        playerCount,
        topPlayerName: topPlayer?.name ?? "No top player yet",
        topPlayerPoints: topPlayer?.totalPoints ?? 0,
        perfectPickCount,
        recentActivityCount,
        tag: deriveGroupStandingTag({ avgPoints, playerCount, perfectPickCount }),
        scoringScope: "standard",
        visibility: "standings"
      } satisfies GroupStandingItem;
    })
    .filter(Boolean)
    .sort((left, right) =>
      (right?.avgPoints ?? 0) - (left?.avgPoints ?? 0) ||
      (right?.totalPoints ?? 0) - (left?.totalPoints ?? 0) ||
      (right?.playerCount ?? 0) - (left?.playerCount ?? 0) ||
      (right?.perfectPickCount ?? 0) - (left?.perfectPickCount ?? 0) ||
      (left?.name ?? "").localeCompare(right?.name ?? "")
    )
    .map((group, index) => ({
      ...(group as GroupStandingItem),
      rank: index + 1
    }));
}

async function fetchSuperAdminGroupDirectory(
  adminSupabase: ReturnType<typeof createAdminClient>
): Promise<GroupStandingItem[]> {
  const { data, error } = await adminSupabase
    .from("groups")
    .select("id,name,status,owner_user_id,owner:users!groups_owner_user_id_fkey(id,name,email)")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as GroupRow[] | null) ?? []).map((group, index) => {
    const owner = Array.isArray(group.owner) ? group.owner[0] : group.owner;
    return {
      id: group.id,
      rank: index + 1,
      name: group.status === "archived" ? `${group.name} (Archived)` : group.name,
      managerName: owner?.name ?? owner?.email ?? "Group manager",
      totalPoints: 0,
      avgPoints: 0,
      playerCount: 0,
      topPlayerName: "",
      topPlayerPoints: 0,
      perfectPickCount: null,
      recentActivityCount: null,
      tag: group.status === "archived" ? "Archived" : null,
      scoringScope: "standard",
      visibility: "directory"
    } satisfies GroupStandingItem;
  });
}

async function fetchTeamStandings(): Promise<TeamStandingItem[]> {
  const adminSupabase = createAdminClient();
  const { data: usersData, error: usersError } = await adminSupabase
    .from("users")
    .select("id,name,home_team_id,total_points")
    .not("home_team_id", "is", null);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const playersWithTeams = (((usersData as Array<Pick<UserRow, "id" | "name" | "home_team_id" | "total_points">> | null) ?? []).filter(
    (user): user is Pick<UserRow, "id" | "name" | "home_team_id" | "total_points"> & { home_team_id: string } =>
      Boolean(user.home_team_id)
  ));

  if (playersWithTeams.length === 0) {
    return [];
  }

  const uniqueTeamIds = Array.from(new Set(playersWithTeams.map((user) => user.home_team_id)));
  const { data: teamsData, error: teamsError } = await adminSupabase
    .from("teams")
    .select("id,name,short_name,flag_emoji")
    .in("id", uniqueTeamIds);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  const teamsById = new Map((((teamsData as TeamCatalogRow[] | null) ?? []).map((team) => [team.id, team] as const)));
  const playersByTeamId = new Map<string, Array<{ userId: string; name: string; totalPoints: number }>>();

  for (const player of playersWithTeams) {
    const list = playersByTeamId.get(player.home_team_id) ?? [];
    list.push({
      userId: player.id,
      name: player.name,
      totalPoints: player.total_points
    });
    playersByTeamId.set(player.home_team_id, list);
  }

  return Array.from(playersByTeamId.entries())
    .map(([teamId, players]) => {
      const team = teamsById.get(teamId);
      if (!team || players.length === 0) {
        return null;
      }

      const totalPoints = players.reduce((sum, player) => sum + player.totalPoints, 0);
      const playerCount = players.length;
      const avgPoints = totalPoints / playerCount;
      const topPlayer = [...players].sort(
        (left, right) => right.totalPoints - left.totalPoints || left.name.localeCompare(right.name)
      )[0];

      return {
        id: team.id,
        rank: 0,
        name: team.name,
        shortName: team.short_name,
        flagEmoji: team.flag_emoji ?? null,
        avgPoints,
        totalPoints,
        playerCount,
        topPlayerName: topPlayer?.name ?? "No top player yet",
        topPlayerPoints: topPlayer?.totalPoints ?? 0,
        tag: deriveGroupStandingTag({ avgPoints, playerCount, perfectPickCount: null })
      } satisfies TeamStandingItem;
    })
    .filter(Boolean)
    .sort((left, right) =>
      (right?.avgPoints ?? 0) - (left?.avgPoints ?? 0) ||
      (right?.totalPoints ?? 0) - (left?.totalPoints ?? 0) ||
      (right?.playerCount ?? 0) - (left?.playerCount ?? 0) ||
      (left?.name ?? "").localeCompare(right?.name ?? "")
    )
    .map((team, index) => ({
      ...(team as TeamStandingItem),
      rank: index + 1
    }));
}

async function fetchGlobalLeaderboardRows(
  phase: LeaderboardPhase,
  perfectPickEnabled: boolean,
  mode: LeaderboardMode = "official"
): Promise<LeaderboardListItem[]> {
  const adminSupabase = createAdminClient();
  const { data: usersData, error: usersError } = await adminSupabase
    .from("users")
    .select("id,name,email,avatar_url,home_team_id,role,plan_tier,total_points")
    .order("name", { ascending: true });

  if (usersError) {
    throw new Error(usersError.message);
  }

  const users = (usersData as UserRow[] | null) ?? [];
  if (users.length === 0) {
    return [];
  }
  const usesProjectedGroupPhasePoints = mode === "projected" && (phase === "group_phase" || phase === "global_top10");

  const userIds = users.map((user) => user.id);
  const [
    globalChallengeSummaries,
    groupPhaseSummaries,
    projectedGroupPhaseResult,
    knockoutPointsByUserId,
    standardSidePickTotals,
    perfectPickUserIds,
    trophiesByUserId,
    visualThemeIdsByUserId
  ] = await Promise.all([
    fetchGlobalChallengeSummaries(userIds),
    fetchGroupPhaseSummaries(userIds),
    usesProjectedGroupPhasePoints
      ? fetchProjectedGroupPhaseSummaries(userIds)
      : Promise.resolve({ summaries: new Map<string, ProjectedGroupPhaseUserSummary>(), projectionKey: null }),
    fetchKnockoutPointsByUserIds(adminSupabase, userIds),
    fetchStandardSidePickTotalsByUser(adminSupabase),
    perfectPickEnabled ? fetchPerfectPickUserIdsForLatestFinalizedMatch() : Promise.resolve(new Set<string>()),
    fetchTrophiesByUserIds(adminSupabase, userIds),
    fetchVisualThemeIdsByUserIds(adminSupabase, userIds)
  ]);

  const rankedEntries = users
    .map((user) => {
      const groupPhasePoints = groupPhaseSummaries.get(user.id)?.points ?? 0;
      const projectedGroupPhasePoints = projectedGroupPhaseResult.summaries.get(user.id)?.projectedPoints ?? groupPhasePoints;
      const knockoutPhasePoints = knockoutPointsByUserId.get(user.id) ?? 0;
      const standardSidePickPoints = standardSidePickTotals.get(user.id) ?? 0;
      const totalPoints =
        phase === "group_phase"
          ? usesProjectedGroupPhasePoints
            ? projectedGroupPhasePoints
            : groupPhasePoints
          : phase === "knockout_phase"
            ? knockoutPhasePoints
            : phase === "side_picks"
              ? standardSidePickPoints
              : usesProjectedGroupPhasePoints
                ? projectedGroupPhasePoints + knockoutPhasePoints + standardSidePickPoints
                : groupPhasePoints + knockoutPhasePoints + standardSidePickPoints;
      return {
        user_id: user.id,
        total_points: totalPoints,
        tiebreak_points:
          phase === "global_top10"
            ? groupPhasePoints + knockoutPhasePoints + standardSidePickPoints
            : groupPhasePoints,
        tiebreak_name: user.name
      };
    });

  const ranks = usesProjectedGroupPhasePoints
    ? assignProjectedDisplayRanks(rankedEntries)
    : assignRanks(rankedEntries);
  if (usesProjectedGroupPhasePoints) {
    await persistProjectedLeaderboardSnapshots({
      scopeType: "global",
      projectionKey: projectedGroupPhaseResult.projectionKey,
      rankedEntries: ranks
    });
  }
  const movementByUserId =
    usesProjectedGroupPhasePoints
      ? new Map(
          (
            await fetchProjectedLeaderboardRankMovement({
              scopeType: "global",
              projectionKey: projectedGroupPhaseResult.projectionKey
            })
          ).map((row) => [row.user_id, { rankDelta: row.rank_delta, pointsDelta: row.points_delta }] as const)
        )
      : new Map<string, { rankDelta: number | null; pointsDelta: number | null }>();

  return ranks
    .map((entry) => {
      const joinedUser = users.find((user) => user.id === entry.user_id);
      if (!joinedUser) {
        return null;
      }

      const summary = globalChallengeSummaries.get(entry.user_id) ?? null;
      const groupPhaseSummary = groupPhaseSummaries.get(entry.user_id) ?? null;
      const projectedGroupPhasePoints = projectedGroupPhaseResult.summaries.get(entry.user_id)?.projectedPoints ?? null;
      const knockoutPhasePoints = knockoutPointsByUserId.get(entry.user_id) ?? 0;
      const standardSidePickPoints = standardSidePickTotals.get(entry.user_id) ?? 0;
      const movement = movementByUserId.get(entry.user_id) ?? { rankDelta: null, pointsDelta: null };
      const displayedGroupPhasePoints = usesProjectedGroupPhasePoints
        ? projectedGroupPhasePoints ?? 0
        : groupPhaseSummary?.points ?? 0;

      return {
        ...mapUserRow(joinedUser, visualThemeIdsByUserId.get(entry.user_id) ?? null),
        trophies: trophiesByUserId.get(entry.user_id) ?? [],
        totalPoints: entry.total_points,
        standardPoints: entry.total_points,
        groupCustomPoints: 0,
        groupPhasePoints: displayedGroupPhasePoints,
        projectedPoints: projectedGroupPhasePoints,
        knockoutPhasePoints,
        sidePickPoints: standardSidePickPoints,
        globalTopTenPoints: usesProjectedGroupPhasePoints
          ? (projectedGroupPhasePoints ?? 0) + knockoutPhasePoints + standardSidePickPoints
          : (groupPhaseSummary?.points ?? 0) + knockoutPhasePoints + standardSidePickPoints,
        groupStrategyPoints: summary?.groupStrategy.points ?? null,
        knockoutGlobalPoints: summary?.knockout.points ?? null,
        globalChallengePoints: summary?.totalPoints ?? null,
        rank: entry.rank,
        rankDelta: movement.rankDelta,
        pointsDelta: movement.pointsDelta,
        hasPerfectPickHighlight: perfectPickUserIds.has(entry.user_id)
      };
    })
    .filter(Boolean) as LeaderboardListItem[];
}

async function fetchGroupLeaderboardRows(
  groupId: string,
  phase: LeaderboardPhase,
  perfectPickEnabled: boolean,
  mode: LeaderboardMode = "official"
): Promise<LeaderboardListItem[]> {
  const adminSupabase = createAdminClient();
  const { data: memberships, error: membershipsError } = await adminSupabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const memberUserIds = Array.from(
    new Set((((memberships as Array<{ user_id: string }> | null) ?? []).map((row) => row.user_id)))
  );

  if (memberUserIds.length === 0) {
    return [];
  }

  const [groupCustomTotals, groupPhaseSummaries, projectedGroupPhaseResult, knockoutPointsByUserId, standardSidePickTotals] = await Promise.all([
    fetchGroupCustomScoreTotals(adminSupabase, [groupId]),
    fetchGroupPhaseSummaries(memberUserIds),
    mode === "projected" && phase === "group_phase"
      ? fetchProjectedGroupPhaseSummaries(memberUserIds)
      : Promise.resolve({ summaries: new Map<string, ProjectedGroupPhaseUserSummary>(), projectionKey: null }),
    fetchKnockoutPointsByUserIds(adminSupabase, memberUserIds),
    fetchStandardSidePickTotalsByUser(adminSupabase)
  ]);
  const groupCustomTotalsByUserId = groupCustomTotals.get(groupId) ?? new Map<string, number>();
  const usersById = await fetchUsersByIds(adminSupabase, memberUserIds);

  const groupLeaderboardEntries: Array<{
    user_id: string;
    standard_points: number;
    group_custom_points: number;
    total_points: number;
    tiebreak_points: number;
    tiebreak_name: string;
  }> = memberUserIds
    .map((userId) => {
      const groupPhasePoints = groupPhaseSummaries.get(userId)?.points ?? 0;
      const projectedGroupPhasePoints = projectedGroupPhaseResult.summaries.get(userId)?.projectedPoints ?? groupPhasePoints;
      const knockoutPhasePoints = knockoutPointsByUserId.get(userId) ?? 0;
      const standardSidePickPoints = standardSidePickTotals.get(userId) ?? 0;
      const user = usersById.get(userId);
      const phasePoints =
        phase === "group_phase"
          ? mode === "projected"
            ? projectedGroupPhasePoints
            : groupPhasePoints
          : phase === "knockout_phase"
            ? knockoutPhasePoints
            : phase === "side_picks"
              ? standardSidePickPoints
              : groupPhasePoints + knockoutPhasePoints + standardSidePickPoints;
      return {
        user_id: userId,
        standard_points: phasePoints,
        group_custom_points: phase === "global_top10" ? groupCustomTotalsByUserId.get(userId) ?? 0 : 0,
        total_points: phasePoints + (phase === "global_top10" ? groupCustomTotalsByUserId.get(userId) ?? 0 : 0),
        tiebreak_points: groupPhasePoints,
        tiebreak_name: user?.name ?? userId
      };
    });

  const rankedEntries =
    mode === "projected" && phase === "group_phase"
      ? assignProjectedDisplayRanks(groupLeaderboardEntries)
      : assignRanks(groupLeaderboardEntries);
  if (mode === "projected" && phase === "group_phase") {
    await persistProjectedLeaderboardSnapshots({
      scopeType: "group",
      groupId,
      projectionKey: projectedGroupPhaseResult.projectionKey,
      rankedEntries
    });
  }
  const latestMatchId =
    mode === "projected" && phase === "group_phase"
      ? projectedGroupPhaseResult.projectionKey
      : await fetchLatestSnapshotMatchId(adminSupabase, { scopeType: "group", groupId });
  const [movementByUserId, perfectPickUserIds, trophiesByUserId, visualThemeIdsByUserId] = await Promise.all([
    latestMatchId
      ? Promise.resolve(
          new Map(
            ((mode === "projected" && phase === "group_phase"
              ? await fetchProjectedLeaderboardRankMovement({
                  scopeType: "group",
                  groupId,
                  projectionKey: latestMatchId
                })
              : await fetchGroupLeaderboardRankMovement(latestMatchId, groupId))).map((row) => [
              row.user_id,
              { rankDelta: row.rank_delta, pointsDelta: row.points_delta }
            ])
          )
        )
      : Promise.resolve(new Map<string, { rankDelta: number | null; pointsDelta: number | null }>()),
    perfectPickEnabled ? fetchPerfectPickUserIdsForLatestFinalizedMatch(groupId) : Promise.resolve(new Set<string>()),
    fetchTrophiesByUserIds(adminSupabase, rankedEntries.map((entry) => entry.user_id)),
    fetchVisualThemeIdsByUserIds(adminSupabase, rankedEntries.map((entry) => entry.user_id))
  ]);

  return rankedEntries
    .map((entry) => {
      const joinedUser = usersById.get(entry.user_id);
      if (!joinedUser) {
        return null;
      }

      const movement = movementByUserId.get(entry.user_id) ?? {
        rankDelta: null,
        pointsDelta: null
      };

      return {
        ...mapUserRow(joinedUser, visualThemeIdsByUserId.get(entry.user_id) ?? null),
        trophies: trophiesByUserId.get(entry.user_id) ?? [],
        totalPoints: entry.total_points,
        standardPoints: entry.standard_points,
        groupCustomPoints: entry.group_custom_points,
        groupPhasePoints:
          mode === "projected" && phase === "group_phase"
            ? projectedGroupPhaseResult.summaries.get(entry.user_id)?.projectedPoints ?? 0
            : groupPhaseSummaries.get(entry.user_id)?.points ?? 0,
        projectedPoints: projectedGroupPhaseResult.summaries.get(entry.user_id)?.projectedPoints ?? null,
        knockoutPhasePoints: knockoutPointsByUserId.get(entry.user_id) ?? 0,
        sidePickPoints: standardSidePickTotals.get(entry.user_id) ?? 0,
        globalTopTenPoints:
          (groupPhaseSummaries.get(entry.user_id)?.points ?? 0) +
          (knockoutPointsByUserId.get(entry.user_id) ?? 0) +
          (standardSidePickTotals.get(entry.user_id) ?? 0),
        rank: entry.rank,
        rankDelta: movement.rankDelta,
        pointsDelta: movement.pointsDelta,
        hasPerfectPickHighlight: perfectPickUserIds.has(entry.user_id)
      };
    })
    .filter(Boolean) as LeaderboardListItem[];
}

async function fetchLeaderboardSwitcherContext(): Promise<LeaderboardSwitcherContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      accessLevel: "player",
      tabs: [{ value: "global", label: "Global" }],
      groups: [],
      joinedGroups: [],
      managedGroups: [],
      managers: []
    };
  }

  const adminSupabase = createAdminClient();
  const [{ profile, profileError }, managerLimit] = await Promise.all([
    fetchLeaderboardViewerProfile(adminSupabase, user.id),
    fetchLeaderboardManagerLimit(adminSupabase, user.id)
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const accessLevel = resolveAccessLevel({
    role: (profile?.role as UserProfile["role"] | undefined) ?? "player",
    planTier: (profile as { plan_tier?: string | null } | null)?.plan_tier ?? null,
    managerLimits: managerLimit
      ? {
          maxGroups: (managerLimit as ManagerLimitRow).max_groups ?? 3,
          maxMembersPerGroup: (managerLimit as ManagerLimitRow).max_members_per_group ?? 30
        }
      : null
  });

  const { groups: groupOptions, joinedGroups, managedGroups } = await fetchAccessibleGroupOptions(
    adminSupabase,
    user.id,
    accessLevel
  );

  const tabs: LeaderboardSwitcherContext["tabs"] = [
    ...(hasOrganizerAccess(accessLevel) && managedGroups.length > 0
      ? [{ value: "managed_groups" as const, label: "My Managed Groups" }]
      : []),
    ...(joinedGroups.length > 0
      ? [{ value: "my_groups" as const, label: "Invited / Joined Groups" }]
      : []),
    { value: "global", label: "Global Standings" },
    ...(accessLevel === "super_admin" ? [{ value: "groups" as const, label: "Group Directory" }] : [])
  ];

  return {
    accessLevel,
    tabs,
    groups: groupOptions,
    joinedGroups,
    managedGroups,
    managers: []
  };
}

async function fetchLeaderboardViewerProfile(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{
  profile: Pick<UserRow, "id" | "role" | "plan_tier"> | null;
  profileError: { message: string } | null;
}> {
  const fullQuery = await adminSupabase
    .from("users")
    .select("id,role,plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (!fullQuery.error) {
    return {
      profile: (fullQuery.data as Pick<UserRow, "id" | "role" | "plan_tier"> | null) ?? null,
      profileError: null
    };
  }

  if (!isMissingColumnError(fullQuery.error.message, "users", "plan_tier")) {
    return { profile: null, profileError: { message: fullQuery.error.message } };
  }

  warnOptionalFeatureOnce(
    "leaderboard-switcher-plan-tier-missing",
    "Leaderboard switcher is loading without users.plan_tier because the live public.users schema is behind the app.",
    fullQuery.error.message
  );

  const fallbackQuery = await adminSupabase
    .from("users")
    .select("id,role")
    .eq("id", userId)
    .maybeSingle();

  if (fallbackQuery.error) {
    return { profile: null, profileError: { message: fallbackQuery.error.message } };
  }

  const fallbackProfile = (fallbackQuery.data as Pick<UserRow, "id" | "role"> | null) ?? null;
  return {
    profile: fallbackProfile ? { ...fallbackProfile, plan_tier: null } : null,
    profileError: null
  };
}

async function fetchLeaderboardManagerLimit(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<ManagerLimitRow | null> {
  const fullQuery = await adminSupabase
    .from("manager_limits")
    .select("user_id,max_groups,max_members_per_group")
    .eq("user_id", userId)
    .maybeSingle();

  if (!fullQuery.error) {
    return (fullQuery.data as ManagerLimitRow | null) ?? null;
  }

  if (isMissingAnyRelationError(fullQuery.error.message, ["manager_limits"])) {
    warnOptionalFeatureOnce(
      "leaderboard-switcher-manager-limits-missing",
      "Leaderboard switcher is loading without manager_limits because the live schema is behind the app.",
      fullQuery.error.message
    );
    return null;
  }

  const missingMaxGroups = isMissingColumnError(fullQuery.error.message, "manager_limits", "max_groups");
  const missingMaxMembersPerGroup = isMissingColumnError(
    fullQuery.error.message,
    "manager_limits",
    "max_members_per_group"
  );

  if (!missingMaxGroups && !missingMaxMembersPerGroup) {
    throw new Error(fullQuery.error.message);
  }

  warnOptionalFeatureOnce(
    "leaderboard-switcher-manager-limits-columns-missing",
    "Leaderboard switcher is loading without expanded manager_limits columns because the live schema is behind the app.",
    fullQuery.error.message
  );

  const fallbackQuery = await adminSupabase
    .from("manager_limits")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (fallbackQuery.error) {
    if (isMissingAnyRelationError(fallbackQuery.error.message, ["manager_limits"])) {
      return null;
    }

    throw new Error(fallbackQuery.error.message);
  }

  const fallbackRow = (fallbackQuery.data as Pick<ManagerLimitRow, "user_id"> | null) ?? null;
  return fallbackRow
    ? {
        user_id: fallbackRow.user_id,
        max_groups: 3,
        max_members_per_group: 30
      }
    : null;
}

async function fetchAccessibleGroupOptions(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  accessLevel: AccessLevel
) {
  const { data: groupMemberships, error: membershipError } = await adminSupabase
    .from("group_members")
    .select("group_id,role")
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const memberships = (groupMemberships as GroupMemberRow[] | null) ?? [];
  const ownedGroupIds =
    hasOrganizerAccess(accessLevel)
      ? await fetchOwnedGroupIds(adminSupabase, userId)
      : [];
  const joinedGroupIds = Array.from(
    new Set(memberships.filter((membership) => membership.role === "member").map((membership) => membership.group_id))
  );
  const managedGroupIds = Array.from(
    new Set([
      ...memberships.filter((membership) => membership.role === "manager").map((membership) => membership.group_id),
      ...ownedGroupIds
    ])
  );
  const relevantGroupIds = Array.from(
    new Set(hasOrganizerAccess(accessLevel) ? [...joinedGroupIds, ...managedGroupIds] : joinedGroupIds)
  );
  const allGroupOptionsPromise =
    accessLevel === "super_admin"
      ? adminSupabase
          .from("groups")
          .select("id,name,status")
          .order("name", { ascending: true })
      : null;

  if (relevantGroupIds.length === 0) {
    if (allGroupOptionsPromise) {
      const { data: allGroups, error: allGroupsError } = await allGroupOptionsPromise;
      if (allGroupsError) {
        throw new Error(allGroupsError.message);
      }

      return {
        groups: (((allGroups as GroupRow[] | null) ?? []).map((group) => ({
          id: group.id,
          label: group.status === "archived" ? `${group.name} (Archived)` : group.name
        }))),
        joinedGroups: [],
        managedGroups: []
      };
    }

    return {
      groups: [],
      joinedGroups: [],
      managedGroups: []
    };
  }

  const [{ data: groups, error: groupsError }, joinedGroups, managedGroups, allGroupOptionsResult] = await Promise.all([
    adminSupabase
      .from("groups")
      .select("id,name,status")
      .in("id", relevantGroupIds)
      .order("name", { ascending: true }),
    fetchGroupNavigationItems(adminSupabase, userId, joinedGroupIds, "joined", {
      rankScopeGroupIds: relevantGroupIds,
      ownedGroupIds: new Set(ownedGroupIds)
    }),
    hasOrganizerAccess(accessLevel)
      ? fetchGroupNavigationItems(adminSupabase, userId, managedGroupIds, "managed", {
          rankScopeGroupIds: relevantGroupIds,
          ownedGroupIds: new Set(ownedGroupIds)
        })
      : Promise.resolve([]),
    allGroupOptionsPromise ?? Promise.resolve({ data: null, error: null })
  ]);

  if (groupsError) {
    throw new Error(groupsError.message);
  }
  if (allGroupOptionsResult.error) {
    throw new Error(allGroupOptionsResult.error.message);
  }

  const directoryGroups =
    accessLevel === "super_admin"
      ? ((allGroupOptionsResult.data as GroupRow[] | null) ?? [])
      : ((groups as GroupRow[] | null) ?? []);

  return {
    groups: (directoryGroups.map((group) => ({
      id: group.id,
      label: group.status === "archived" ? `${group.name} (Archived)` : group.name
    }))),
    joinedGroups,
    managedGroups
  };
}

async function fetchOwnedGroupIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data, error } = await adminSupabase
    .from("groups")
    .select("id")
    .eq("owner_user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<{ id: string }> | null) ?? []).map((group) => group.id);
}

async function fetchGroupNavigationItems(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  groupIds: string[],
  context: LeaderboardGroupNavItem["context"],
  options?: {
    rankScopeGroupIds?: string[];
    ownedGroupIds?: Set<string>;
  }
): Promise<LeaderboardGroupNavItem[]> {
  const uniqueGroupIds = Array.from(new Set(groupIds)).filter(Boolean);
  if (uniqueGroupIds.length === 0) {
    return [];
  }

  const scopedGroupIds = Array.from(new Set([...(options?.rankScopeGroupIds ?? []), ...uniqueGroupIds])).filter(Boolean);

  const [{ data: groupsData, error: groupsError }, { data: membershipsData, error: membershipsError }] = await Promise.all([
    adminSupabase
      .from("groups")
      .select("id,name,status,owner_user_id,avatar_url")
      .in("id", scopedGroupIds),
    adminSupabase
      .from("group_members")
      .select("group_id,user_id,role")
      .in("group_id", scopedGroupIds)
  ]);

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const groups = (groupsData as GroupRow[] | null) ?? [];
  const memberships = (membershipsData as Array<{ group_id: string; user_id: string; role: "manager" | "member" }> | null) ?? [];
  if (groups.length === 0 || memberships.length === 0) {
    return [];
  }

  const memberIds = Array.from(new Set(memberships.map((membership) => membership.user_id)));
  const ownerIds = Array.from(new Set(groups.map((group) => group.owner_user_id).filter(Boolean) as string[]));
  const usersById = await fetchUsersByIds(adminSupabase, Array.from(new Set([...memberIds, ...ownerIds])));

  const membersByGroupId = new Map<string, Array<{ userId: string; role: "manager" | "member" }>>();
  for (const membership of memberships) {
    const list = membersByGroupId.get(membership.group_id) ?? [];
    list.push({ userId: membership.user_id, role: membership.role });
    membersByGroupId.set(membership.group_id, list);
  }

  const groupCustomTotals = await fetchGroupCustomScoreTotals(adminSupabase, groups.map((group) => group.id));

  const latestMatchIdsByGroup = new Map(
    await Promise.all(
      groups.map(async (group) => [
        group.id,
        await fetchLatestSnapshotMatchId(adminSupabase, { scopeType: "group", groupId: group.id })
      ] as const)
    )
  );
  const movementByGroupId = new Map<string, { rankDelta: number | null }>();
  await Promise.all(
    groups.map(async (group) => {
      const latestMatchId = latestMatchIdsByGroup.get(group.id);
      if (!latestMatchId) {
        movementByGroupId.set(group.id, { rankDelta: null });
        return;
      }

      const movementRows = await fetchGroupLeaderboardRankMovement(latestMatchId, group.id);
      const currentUserMovement = movementRows.find((row) => row.user_id === userId) ?? null;
      movementByGroupId.set(group.id, { rankDelta: currentUserMovement?.rank_delta ?? null });
    })
  );

  const globalRankByGroupId = new Map(
    assignRanks(
      groups
        .map((group) => {
          const memberEntries = (membersByGroupId.get(group.id) ?? [])
            .map((member) => usersById.get(member.userId))
            .filter((member): member is UserRow => Boolean(member));
          if (memberEntries.length === 0) {
            return null;
          }

          const totalPoints = memberEntries.reduce((sum, member) => sum + member.total_points, 0);
          return {
            user_id: group.id,
            total_points: totalPoints / memberEntries.length
          };
        })
        .filter((entry): entry is { user_id: string; total_points: number } => Boolean(entry))
        .sort(compareLeaderboardEntries)
    ).map((entry) => [entry.user_id, entry.rank] as const)
  );

  return groups
    .filter((group) => uniqueGroupIds.includes(group.id))
    .map((group) => {
      const memberEntries = membersByGroupId.get(group.id) ?? [];
      const memberUserIds = memberEntries.map((member) => member.userId);
      const rankedEntries: Array<{
        user_id: string;
        standard_points: number;
        group_custom_points: number;
        total_points: number;
        rank: number;
      }> = assignRanks(
        memberUserIds
          .map((memberUserId) => {
            const member = usersById.get(memberUserId);
            if (!member) {
              return null;
            }

            return {
              user_id: memberUserId,
              standard_points: member.total_points,
              group_custom_points: groupCustomTotals.get(group.id)?.get(memberUserId) ?? 0,
              total_points: member.total_points + (groupCustomTotals.get(group.id)?.get(memberUserId) ?? 0)
            };
          })
          .filter(
            (
              entry
            ): entry is {
              user_id: string;
              standard_points: number;
              group_custom_points: number;
              total_points: number;
            } => Boolean(entry)
          )
          .sort(compareLeaderboardEntries)
      );
      const currentUserEntry = rankedEntries.find((entry) => entry.user_id === userId) ?? null;
      const currentUser = usersById.get(userId);
      const managerMember = memberEntries.find((member) => member.role === "manager") ?? null;
      const managerUser = managerMember ? usersById.get(managerMember.userId) ?? null : null;
      const ownerUser = group.owner_user_id ? usersById.get(group.owner_user_id) ?? null : null;
      const averagePoints =
        rankedEntries.length > 0
          ? rankedEntries.reduce((sum, entry) => sum + entry.total_points, 0) / rankedEntries.length
          : null;

      return {
        id: group.id,
        label: group.status === "archived" ? `${group.name} (Archived)` : group.name,
        rank: currentUserEntry?.rank ?? null,
        totalPlayers: rankedEntries.length,
        points:
          currentUser && currentUserEntry
            ? currentUser.total_points + (groupCustomTotals.get(group.id)?.get(userId) ?? 0)
            : null,
        rankDelta: movementByGroupId.get(group.id)?.rankDelta ?? null,
        context,
        avatarUrl: group.avatar_url ?? null,
        managerName:
          context === "managed" && options?.ownedGroupIds?.has(group.id)
            ? "You"
            : managerUser?.name ?? ownerUser?.name ?? null,
        averagePoints,
        globalRank: globalRankByGroupId.get(group.id) ?? null
      } satisfies LeaderboardGroupNavItem;
    })
    .sort((left, right) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      (right.points ?? 0) - (left.points ?? 0) ||
      left.label.localeCompare(right.label)
    );
}

async function fetchLatestSnapshotMatchId(
  adminSupabase: ReturnType<typeof createAdminClient>,
  scope: { scopeType: "global"; groupId?: undefined } | { scopeType: "group"; groupId: string }
) {
  let query = adminSupabase
    .from("leaderboard_snapshots")
    .select("match_id,created_at")
    .eq("scope_type", scope.scopeType)
    .order("created_at", { ascending: false })
    .limit(1);

  query = scope.scopeType === "group" ? query.eq("group_id", scope.groupId) : query.is("group_id", null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as LatestSnapshotRow | null)?.match_id ?? null;
}

async function fetchUsersByIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, UserRow>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await adminSupabase
    .from("users")
    .select("id,name,email,avatar_url,home_team_id,role,plan_tier,total_points")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((((data as UserRow[] | null) ?? []).map((user) => [user.id, user])));
}

async function fetchTrophiesByUserIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, UserTrophy[]>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await adminSupabase
    .from("user_trophies")
    .select("user_id,awarded_at,trophies(id,key,name,description,icon,tier)")
    .in("user_id", uniqueIds)
    .order("awarded_at", { ascending: false });

  if (error) {
    if (isMissingAnyRelationError(error.message, ["user_trophies", "trophies"])) {
      warnOptionalFeatureOnce(
        "leaderboard-trophies-missing",
        "Trophies are unavailable on leaderboard rows until the trophies migrations are applied.",
        error.message
      );
      return new Map();
    }

    throw new Error(error.message);
  }

  const grouped = new Map<string, UserTrophy[]>();
  for (const row of ((data as UserTrophyRow[] | null) ?? [])) {
    const trophy = Array.isArray(row.trophies) ? (row.trophies[0] ?? null) : row.trophies;
    if (!trophy) {
      continue;
    }

    const list = grouped.get(row.user_id) ?? [];
    list.push({
      id: trophy.id,
      key: trophy.key,
      name: trophy.name,
      description: trophy.description,
      icon: trophy.icon,
      tier: trophy.tier ?? "special",
      awardedAt: row.awarded_at
    });
    grouped.set(row.user_id, list);
  }

  return grouped;
}

async function fetchVisualThemeIdsByUserIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("user_id,visual_theme_id")
    .in("user_id", uniqueIds);

  if (error) {
    if (
      isMissingAnyRelationError(error.message, ["user_settings"]) ||
      isMissingColumnError(error.message, "user_settings", "visual_theme_id")
    ) {
      warnOptionalFeatureOnce(
        "leaderboard-visual-theme-settings-missing",
        "Leaderboard rows are loading without special visual themes because user_settings.visual_theme_id is unavailable.",
        error.message
      );
      return new Map();
    }

    throw new Error(error.message);
  }

  return new Map(
    (((data as UserSettingsVisualThemeRow[] | null) ?? [])
      .filter((row) => Boolean(row.visual_theme_id))
      .map((row) => [row.user_id, row.visual_theme_id as string]))
  );
}

function mapUserRow(row: UserRow, visualThemeId: string | null = row.visual_theme_id ?? null): UserProfile {
  const planTier = normalizeCommercialTier(row.plan_tier ?? null);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    homeTeamId: row.home_team_id ?? null,
    visualThemeId,
    role: row.role,
    planTier,
    accessLevel: resolveAccessLevel({
      role: row.role,
      planTier
    }),
    totalPoints: row.total_points
  };
}

async function fetchKnockoutPointsByUserIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, number>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await adminSupabase.from("bracket_scores").select("user_id,points").in("user_id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  const pointsByUserId = new Map<string, number>();
  for (const row of ((data as BracketScoreRow[] | null) ?? [])) {
    pointsByUserId.set(row.user_id, (pointsByUserId.get(row.user_id) ?? 0) + Math.max(0, row.points ?? 0));
  }

  return pointsByUserId;
}

function normalizeLeaderboardPhase(value?: string | null): LeaderboardPhase {
  return value === "global_top10" || value === "side_picks" || value === "knockout_phase"
    ? value
    : "group_phase";
}

function resolveAllowedView(
  requestedView: LeaderboardSwitcherView | undefined,
  switcher: LeaderboardSwitcherContext
) {
  if (requestedView && switcher.tabs.some((tab) => tab.value === requestedView)) {
    return requestedView;
  }

  return getDefaultLeaderboardView(switcher);
}

function resolveAllowedGroupId(
  requestedGroupId: string | undefined,
  switcher: LeaderboardSwitcherContext,
  activeView: LeaderboardSwitcherView
) {
  if (!["my_groups", "managed_groups"].includes(activeView)) {
    return "";
  }

  const availableGroups = getGroupOptionsForView(switcher, activeView);

  if (requestedGroupId && availableGroups.some((group) => group.id === requestedGroupId)) {
    return requestedGroupId;
  }

  return availableGroups[0]?.id ?? "";
}

export function getGroupOptionsForView(
  switcher: LeaderboardSwitcherContext,
  activeView: LeaderboardSwitcherView
): LeaderboardGroupNavItem[] {
  if (activeView === "managed_groups") {
    return switcher.managedGroups;
  }

  if (activeView === "my_groups") {
    return switcher.joinedGroups;
  }

  return [];
}

export function getDefaultLeaderboardView(switcher: LeaderboardSwitcherContext): LeaderboardSwitcherView {
  if (switcher.managedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "managed_groups")) {
    return "managed_groups";
  }

  if (switcher.joinedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "my_groups")) {
    return "my_groups";
  }

  return switcher.tabs[0]?.value ?? "global";
}

function assignRanks<T extends { user_id: string; total_points: number }>(
  entries: T[]
): Array<T & { rank: number }> {
  return assignDeterministicRanks(entries);
}

function assignProjectedDisplayRanks<
  T extends { user_id: string; total_points: number; tiebreak_points: number; tiebreak_name: string }
>(entries: T[]): Array<T & { rank: number }> {
  return assignDeterministicRanksWithComparator(entries, (left, right) => {
    return (
      right.total_points - left.total_points ||
      right.tiebreak_points - left.tiebreak_points ||
      left.tiebreak_name.localeCompare(right.tiebreak_name) ||
      left.user_id.localeCompare(right.user_id)
    );
  });
}

function deriveGroupStandingTag(input: {
  avgPoints: number;
  playerCount: number;
  perfectPickCount: number | null;
}) {
  if ((input.perfectPickCount ?? 0) >= 2) {
    return "Snipers";
  }

  if (input.avgPoints >= 18) {
    return "Hot Group";
  }

  if (input.playerCount >= 8) {
    return "Deep Bench";
  }

  if (input.avgPoints >= 12) {
    return "In Form";
  }

  return null;
}
