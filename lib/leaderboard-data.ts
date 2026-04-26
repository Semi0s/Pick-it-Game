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
};

type GroupMemberRow = {
  group_id: string;
  role: "manager" | "member";
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

export type LeaderboardSwitcherContext = {
  accessLevel: AccessLevel;
  tabs: Array<{
    value: LeaderboardSwitcherView;
    label: string;
  }>;
  groups: LeaderboardSwitcherOption[];
  managers: LeaderboardSwitcherOption[];
};

export type LeaderboardPageData = {
  leaderboard: LeaderboardListItem[];
  switcher: LeaderboardSwitcherContext;
  dailyWinners: DailyWinner[];
  activityFeed: LeaderboardActivityItem[];
  settings: LeaderboardFeatureSettings;
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
        managers: []
      }
    };
  }

  const [settings, switcher] = await Promise.all([fetchLeaderboardFeatureSettings(), fetchLeaderboardSwitcherContext()]);
  const activeView = resolveAllowedView(request?.view, switcher);
  const selectedGroupId = resolveAllowedGroupId(request?.groupId, switcher, activeView);
  const [leaderboard, dailyWinners, activityFeed] = await Promise.all([
    activeView === "global"
      ? fetchGlobalLeaderboardRows(settings.perfect_pick_enabled)
      : selectedGroupId
        ? fetchGroupLeaderboardRows(selectedGroupId, settings.perfect_pick_enabled)
        : Promise.resolve([]),
    settings.daily_winner_enabled
      ? activeView === "global"
        ? fetchDailyWinners()
        : selectedGroupId
          ? fetchDailyWinners(selectedGroupId)
          : Promise.resolve([])
      : Promise.resolve([]),
    settings.leaderboard_activity_enabled
      ? activeView === "global"
        ? fetchRecentGlobalLeaderboardActivity({ includeDailyWinner: settings.daily_winner_enabled })
        : selectedGroupId
          ? fetchGroupLeaderboardActivity(selectedGroupId)
          : Promise.resolve([])
      : Promise.resolve([])
  ]);

  return {
    leaderboard: leaderboard.map((item) => ({
      ...item,
      rankDelta: settings.leaderboard_activity_enabled ? item.rankDelta : null,
      pointsDelta: settings.leaderboard_activity_enabled ? item.pointsDelta : null,
      hasPerfectPickHighlight: settings.perfect_pick_enabled ? item.hasPerfectPickHighlight : false
    })),
    dailyWinners: settings.daily_winner_enabled ? dailyWinners : [],
    activityFeed: settings.leaderboard_activity_enabled ? activityFeed : [],
    settings,
    switcher
  };
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

  const groupOptions = await fetchAccessibleGroupOptions(adminSupabase, user.id, accessLevel);
  const managerOptions = accessLevel === "super_admin" ? await fetchManagerOptions(adminSupabase) : [];

  const tabs: LeaderboardSwitcherContext["tabs"] =
    accessLevel === "super_admin"
      ? [
          { value: "global", label: "Global" },
          { value: "managers", label: "Managers" },
          { value: "groups", label: "Groups" }
        ]
      : accessLevel === "manager"
        ? [
            { value: "global", label: "Global" },
            { value: "managed_groups", label: "My Managed Groups" }
          ]
        : [
            { value: "global", label: "Global" },
            { value: "my_groups", label: "My Groups" }
          ];

  return {
    accessLevel,
    tabs,
    groups: groupOptions,
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

    return (((data as GroupRow[] | null) ?? []).map((group) => ({
      id: group.id,
      label: group.status === "archived" ? `${group.name} (Archived)` : group.name
    })));
  }

  const { data: groupMemberships, error: membershipError } = await adminSupabase
    .from("group_members")
    .select("group_id,role")
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const memberships = (groupMemberships as GroupMemberRow[] | null) ?? [];
  const relevantGroupIds =
    accessLevel === "manager"
      ? Array.from(new Set(memberships.map((membership) => membership.group_id)))
      : Array.from(new Set(memberships.map((membership) => membership.group_id)));

  if (relevantGroupIds.length === 0) {
    return [];
  }

  const { data: groups, error: groupsError } = await adminSupabase
    .from("groups")
    .select("id,name,status")
    .in("id", relevantGroupIds)
    .order("name", { ascending: true });

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  return (((groups as GroupRow[] | null) ?? []).map((group) => ({
    id: group.id,
    label: group.status === "archived" ? `${group.name} (Archived)` : group.name
  })));
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
    const normalized = error.message.toLowerCase();
    if (
      (normalized.includes("user_trophies") || normalized.includes("trophies")) &&
      (normalized.includes("schema cache") || normalized.includes("does not exist") || normalized.includes("could not find the table"))
    ) {
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

  return "global";
}

function resolveAllowedGroupId(
  requestedGroupId: string | undefined,
  switcher: LeaderboardSwitcherContext,
  activeView: LeaderboardSwitcherView
) {
  if (!["my_groups", "managed_groups", "groups"].includes(activeView)) {
    return "";
  }

  if (requestedGroupId && switcher.groups.some((group) => group.id === requestedGroupId)) {
    return requestedGroupId;
  }

  return switcher.groups[0]?.id ?? "";
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
