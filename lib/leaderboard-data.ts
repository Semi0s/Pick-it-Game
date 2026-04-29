import { getAccessLevel, type AccessLevel } from "@/lib/access-levels";
import { fetchLeaderboardFeatureSettings, type LeaderboardFeatureSettings } from "@/lib/app-settings";
import {
  fetchGroupLeaderboardActivity,
  fetchRecentGlobalLeaderboardActivity,
  type LeaderboardActivityItem
} from "@/lib/leaderboard-activity";
import { fetchGlobalLeaderboardRankMovement, fetchGroupLeaderboardRankMovement } from "@/lib/leaderboard-movement";
import { demoUsers } from "@/lib/mock-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  fetchDailyWinners,
  fetchPerfectPickUserIdsForLatestFinalizedMatch,
  type DailyWinner
} from "@/lib/leaderboard-highlights";
import { isMissingAnyRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import type { UserProfile, UserTrophy } from "@/lib/types";

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
  role: UserProfile["role"];
  total_points: number;
};

type LeaderboardEntryRow = {
  user_id: string;
  total_points: number;
  rank: number;
};

type LatestSnapshotRow = {
  match_id: string;
  created_at: string;
};

type GroupRow = {
  id: string;
  name: string;
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
  hasPerfectPickHighlight: boolean;
};

export type LeaderboardSwitcherView = "global" | "my_groups" | "managed_groups" | "groups" | "managers";

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
  switcher: LeaderboardSwitcherContext;
  dailyWinners: DailyWinner[];
  activityFeed: LeaderboardActivityItem[];
  settings: LeaderboardFeatureSettings;
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
};

export type LeaderboardPageRequest = {
  view?: LeaderboardSwitcherView;
  groupId?: string;
  managerId?: string;
};

export async function fetchLeaderboardPageData(request?: LeaderboardPageRequest): Promise<LeaderboardPageData> {
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
      dailyWinners: [],
      activityFeed: [],
      settings: await fetchLeaderboardFeatureSettings(),
      switcher: {
        accessLevel: "player",
        tabs: [
          { value: "global", label: "Global" },
          { value: "my_groups", label: "My Groups" }
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
  const selectedGroupId = resolveAllowedGroupId(request?.groupId, switcher, activeView);
  const groupStandingIds =
    switcher.accessLevel === "super_admin"
      ? switcher.groups.map((group) => group.id)
      : switcher.managedGroups.map((group) => group.id);
  const groupStandingsPromise = activeView === "groups"
    ? fetchGroupStandingsForAccessibleGroups(
        switcher.accessLevel,
        groupStandingIds,
        settings.perfect_pick_enabled
      )
    : Promise.resolve([]);
  const leaderboardPromise =
    activeView === "global"
      ? fetchGlobalLeaderboardRows(settings.perfect_pick_enabled)
      : selectedGroupId
        ? fetchGroupLeaderboardRows(selectedGroupId, settings.perfect_pick_enabled)
        : Promise.resolve([]);
  const dailyWinnersPromise =
    settings.daily_winner_enabled
      ? activeView === "global"
        ? fetchDailyWinners()
        : selectedGroupId
          ? fetchDailyWinners(selectedGroupId)
          : Promise.resolve([])
      : Promise.resolve([]);

  const [leaderboard, dailyWinners, groupStandings] = await Promise.all([
    leaderboardPromise,
    dailyWinnersPromise,
    groupStandingsPromise
  ]);
  const activityFeed =
    settings.leaderboard_activity_enabled
      ? activeView === "global"
        ? await fetchRecentGlobalLeaderboardActivity({
            includeDailyWinner: settings.daily_winner_enabled,
            dailyWinnersFallback: dailyWinners
          })
        : selectedGroupId
          ? await fetchGroupLeaderboardActivity(selectedGroupId, {
              includeDailyWinner: settings.daily_winner_enabled,
              dailyWinnersFallback: dailyWinners
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
    dailyWinners: settings.daily_winner_enabled ? dailyWinners : [],
    activityFeed: settings.leaderboard_activity_enabled ? activityFeed : [],
    settings,
    switcher
  };
}

async function fetchGroupStandingsForAccessibleGroups(
  accessLevel: AccessLevel,
  accessibleGroupIds: string[],
  perfectPickEnabled: boolean
): Promise<GroupStandingItem[]> {
  const adminSupabase = createAdminClient();
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

  const scopedGroupsQuery = accessLevel === "super_admin" ? groupsQuery : groupsQuery.in("id", accessibleGroupIds);
  const scopedMembershipsQuery =
    accessLevel === "super_admin" ? membershipsQuery : membershipsQuery.in("group_id", accessibleGroupIds);
  const scopedActivityCountsQuery =
    accessLevel === "super_admin" ? activityCountsQuery : activityCountsQuery.in("group_id", accessibleGroupIds);

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
        tag: deriveGroupStandingTag({ avgPoints, playerCount, perfectPickCount })
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

async function fetchGlobalLeaderboardRows(perfectPickEnabled: boolean): Promise<LeaderboardListItem[]> {
  const adminSupabase = createAdminClient();
  const { data: leaderboardData, error: leaderboardError } = await adminSupabase
    .from("leaderboard_entries")
    .select("user_id,total_points,rank")
    .order("rank", { ascending: true })
    .order("total_points", { ascending: false });

  if (leaderboardError) {
    throw new Error(leaderboardError.message);
  }

  const leaderboardEntries = (leaderboardData as LeaderboardEntryRow[] | null) ?? [];
  if (leaderboardEntries.length === 0) {
    return [];
  }

  const latestMatchId = await fetchLatestGlobalSnapshotMatchId(adminSupabase);
  const [usersById, movementByUserId, perfectPickUserIds, trophiesByUserId] = await Promise.all([
    fetchUsersByIds(
      adminSupabase,
      leaderboardEntries.map((entry) => entry.user_id)
    ),
    latestMatchId
      ? Promise.resolve(
          new Map(
            (await fetchGlobalLeaderboardRankMovement(latestMatchId)).map((row) => [
              row.user_id,
              { rankDelta: row.rank_delta, pointsDelta: row.points_delta }
            ])
          )
        )
      : Promise.resolve(new Map<string, { rankDelta: number | null; pointsDelta: number | null }>()),
    perfectPickEnabled ? fetchPerfectPickUserIdsForLatestFinalizedMatch() : Promise.resolve(new Set<string>()),
    fetchTrophiesByUserIds(
      adminSupabase,
      leaderboardEntries.map((entry) => entry.user_id)
    )
  ]);

  return leaderboardEntries
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
          ...mapUserRow(joinedUser),
          trophies: trophiesByUserId.get(entry.user_id) ?? [],
          totalPoints: entry.total_points,
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
  perfectPickEnabled: boolean
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

  const { data: leaderboardData, error: leaderboardError } = await adminSupabase
    .from("leaderboard_entries")
    .select("user_id,total_points,rank")
    .in("user_id", memberUserIds);

  if (leaderboardError) {
    throw new Error(leaderboardError.message);
  }

  const groupLeaderboardEntries = (((leaderboardData as LeaderboardEntryRow[] | null) ?? [])
    .map((entry) => ({
      user_id: entry.user_id,
      total_points: entry.total_points
    }))
    .sort((a, b) => b.total_points - a.total_points || a.user_id.localeCompare(b.user_id)));

  const rankedEntries = assignRanks(groupLeaderboardEntries);
  const latestMatchId = await fetchLatestSnapshotMatchId(adminSupabase, { scopeType: "group", groupId });
  const [usersById, movementByUserId, perfectPickUserIds, trophiesByUserId] = await Promise.all([
    fetchUsersByIds(adminSupabase, rankedEntries.map((entry) => entry.user_id)),
    latestMatchId
      ? Promise.resolve(
          new Map(
            (await fetchGroupLeaderboardRankMovement(latestMatchId, groupId)).map((row) => [
              row.user_id,
              { rankDelta: row.rank_delta, pointsDelta: row.points_delta }
            ])
          )
        )
      : Promise.resolve(new Map<string, { rankDelta: number | null; pointsDelta: number | null }>()),
    perfectPickEnabled ? fetchPerfectPickUserIdsForLatestFinalizedMatch(groupId) : Promise.resolve(new Set<string>()),
    fetchTrophiesByUserIds(adminSupabase, rankedEntries.map((entry) => entry.user_id))
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
        ...mapUserRow(joinedUser),
        trophies: trophiesByUserId.get(entry.user_id) ?? [],
        totalPoints: entry.total_points,
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
  const [{ data: profile, error: profileError }, { data: managerLimit }] = await Promise.all([
    adminSupabase.from("users").select("id,role").eq("id", user.id).maybeSingle(),
    adminSupabase.from("manager_limits").select("user_id").eq("user_id", user.id).maybeSingle()
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const accessLevel = getAccessLevel({
    role: (profile?.role as UserProfile["role"] | undefined) ?? "player",
    accessLevel: managerLimit ? "manager" : profile?.role === "admin" ? "super_admin" : "player"
  });

  const { groups: groupOptions, joinedGroups, managedGroups } = await fetchAccessibleGroupOptions(
    adminSupabase,
    user.id,
    accessLevel
  );
  const managerOptions = accessLevel === "super_admin" ? await fetchManagerOptions(adminSupabase) : [];

  const tabs: LeaderboardSwitcherContext["tabs"] =
    accessLevel === "super_admin"
      ? [
          { value: "global", label: "Global" },
          { value: "managers", label: "Managers" },
          { value: "groups", label: "Group Standings" }
        ]
      : accessLevel === "manager"
        ? [
            { value: "global", label: "Global" },
            { value: "managed_groups", label: "My Managed Groups" },
            { value: "my_groups", label: "My Groups" },
            { value: "groups", label: "Group Standings" }
          ]
        : [
            { value: "global", label: "Global" },
            { value: "my_groups", label: "My Groups" }
          ];

  return {
    accessLevel,
    tabs,
    groups: groupOptions,
    joinedGroups,
    managedGroups,
    managers: managerOptions
  };
}

async function fetchAccessibleGroupOptions(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  accessLevel: AccessLevel
) {
  if (accessLevel === "super_admin") {
    const { data, error } = await adminSupabase
      .from("groups")
      .select("id,name,status")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return {
      groups: (((data as GroupRow[] | null) ?? []).map((group) => ({
        id: group.id,
        label: group.status === "archived" ? `${group.name} (Archived)` : group.name
      }))),
      joinedGroups: [],
      managedGroups: []
    };
  }

  const { data: groupMemberships, error: membershipError } = await adminSupabase
    .from("group_members")
    .select("group_id,role")
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const memberships = (groupMemberships as GroupMemberRow[] | null) ?? [];
  const joinedGroupIds = Array.from(
    new Set(memberships.filter((membership) => membership.role === "member").map((membership) => membership.group_id))
  );
  const managedGroupIds = Array.from(
    new Set(memberships.filter((membership) => membership.role === "manager").map((membership) => membership.group_id))
  );
  const relevantGroupIds = Array.from(
    new Set(accessLevel === "manager" ? [...joinedGroupIds, ...managedGroupIds] : joinedGroupIds)
  );

  if (relevantGroupIds.length === 0) {
    return {
      groups: [],
      joinedGroups: [],
      managedGroups: []
    };
  }

  const [{ data: groups, error: groupsError }, joinedGroups, managedGroups] = await Promise.all([
    adminSupabase
      .from("groups")
      .select("id,name,status")
      .in("id", relevantGroupIds)
      .order("name", { ascending: true }),
    fetchGroupNavigationItems(adminSupabase, userId, joinedGroupIds, "joined"),
    accessLevel === "manager"
      ? fetchGroupNavigationItems(adminSupabase, userId, managedGroupIds, "managed")
      : Promise.resolve([])
  ]);

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  return {
    groups: (((groups as GroupRow[] | null) ?? []).map((group) => ({
      id: group.id,
      label: group.status === "archived" ? `${group.name} (Archived)` : group.name
    }))),
    joinedGroups,
    managedGroups
  };
}

async function fetchGroupNavigationItems(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  groupIds: string[],
  context: LeaderboardGroupNavItem["context"]
): Promise<LeaderboardGroupNavItem[]> {
  const uniqueGroupIds = Array.from(new Set(groupIds)).filter(Boolean);
  if (uniqueGroupIds.length === 0) {
    return [];
  }

  const [{ data: groupsData, error: groupsError }, { data: membershipsData, error: membershipsError }] = await Promise.all([
    adminSupabase
      .from("groups")
      .select("id,name,status")
      .in("id", uniqueGroupIds),
    adminSupabase
      .from("group_members")
      .select("group_id,user_id")
      .in("group_id", uniqueGroupIds)
  ]);

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const groups = (groupsData as GroupRow[] | null) ?? [];
  const memberships = (membershipsData as Array<{ group_id: string; user_id: string }> | null) ?? [];
  if (groups.length === 0 || memberships.length === 0) {
    return [];
  }

  const memberIds = Array.from(new Set(memberships.map((membership) => membership.user_id)));
  const usersById = await fetchUsersByIds(adminSupabase, memberIds);

  const membersByGroupId = new Map<string, string[]>();
  for (const membership of memberships) {
    const list = membersByGroupId.get(membership.group_id) ?? [];
    list.push(membership.user_id);
    membersByGroupId.set(membership.group_id, list);
  }

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

  return groups
    .map((group) => {
      const memberUserIds = membersByGroupId.get(group.id) ?? [];
      const rankedEntries = assignRanks(
        memberUserIds
          .map((memberUserId) => {
            const member = usersById.get(memberUserId);
            if (!member) {
              return null;
            }

            return {
              user_id: memberUserId,
              total_points: member.total_points
            };
          })
          .filter(Boolean)
          .sort((left, right) =>
            (right?.total_points ?? 0) - (left?.total_points ?? 0) ||
            (left?.user_id ?? "").localeCompare(right?.user_id ?? "")
          ) as Array<{ user_id: string; total_points: number }>
      );
      const currentUserEntry = rankedEntries.find((entry) => entry.user_id === userId) ?? null;
      const currentUser = usersById.get(userId);

      return {
        id: group.id,
        label: group.status === "archived" ? `${group.name} (Archived)` : group.name,
        rank: currentUserEntry?.rank ?? null,
        totalPlayers: rankedEntries.length,
        points: currentUser?.total_points ?? null,
        rankDelta: movementByGroupId.get(group.id)?.rankDelta ?? null,
        context
      } satisfies LeaderboardGroupNavItem;
    })
    .sort((left, right) =>
      (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
      (right.points ?? 0) - (left.points ?? 0) ||
      left.label.localeCompare(right.label)
    );
}

async function fetchManagerOptions(adminSupabase: ReturnType<typeof createAdminClient>) {
  const { data: managerLimits, error: managerLimitsError } = await adminSupabase
    .from("manager_limits")
    .select("user_id");

  if (managerLimitsError) {
    throw new Error(managerLimitsError.message);
  }

  const managerUserIds = Array.from(new Set((((managerLimits as ManagerLimitRow[] | null) ?? []).map((row) => row.user_id))));
  if (managerUserIds.length === 0) {
    return [];
  }

  const usersById = await fetchUsersByIds(adminSupabase, managerUserIds);
  return managerUserIds
    .map((userId) => {
      const manager = usersById.get(userId);
      if (!manager) {
        return null;
      }

      return {
        id: manager.id,
        label: manager.name
      };
    })
    .filter(Boolean) as LeaderboardSwitcherOption[];
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

async function fetchLatestGlobalSnapshotMatchId(adminSupabase: ReturnType<typeof createAdminClient>) {
  return fetchLatestSnapshotMatchId(adminSupabase, { scopeType: "global" });
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
    .select("id,name,email,avatar_url,home_team_id,role,total_points")
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

function mapUserRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    homeTeamId: row.home_team_id ?? null,
    role: row.role,
    totalPoints: row.total_points
  };
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

function assignRanks(entries: Array<{ user_id: string; total_points: number }>) {
  let currentRank = 0;
  let lastScore: number | null = null;

  return entries.map((entry, index) => {
    if (lastScore === null || entry.total_points < lastScore) {
      currentRank = index + 1;
      lastScore = entry.total_points;
    }

    return {
      ...entry,
      rank: currentRank
    };
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
