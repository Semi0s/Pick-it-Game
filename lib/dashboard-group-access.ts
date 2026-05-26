import "server-only";

import { fetchIntegerAppSetting } from "@/lib/app-settings";
import { fetchJoinedPlayerGroupCount } from "@/lib/group-membership-limits";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { DASHBOARD_UI_RESET_EPOCH_SETTING_KEY } from "@/lib/ui-storage-keys";

type PlatformRole = "player" | "admin";

export type FetchDashboardGroupAccessResult =
  | {
      ok: true;
      groupAccess: {
        joinedGroupCount: number;
        managedGroupCount: number;
        hasAnyGroups: boolean;
      };
      dashboardUiResetEpoch: number;
    }
  | {
      ok: false;
      message: string;
    };

export async function fetchDashboardGroupAccessForUser(userId: string): Promise<FetchDashboardGroupAccessResult> {
  if (!userId) {
    return { ok: false, message: "You must be signed in to do that." };
  }

  try {
    const adminSupabase = createAdminClient();
    const [joinedGroupCount, managedGroupCount, dashboardUiResetEpoch] = await Promise.all([
      fetchJoinedPlayerGroupCount(adminSupabase, userId),
      fetchManagedGroupCount(adminSupabase, userId),
      fetchIntegerAppSetting(DASHBOARD_UI_RESET_EPOCH_SETTING_KEY, 0)
    ]);

    return {
      ok: true,
      groupAccess: {
        joinedGroupCount,
        managedGroupCount,
        hasAnyGroups: joinedGroupCount > 0 || managedGroupCount > 0
      },
      dashboardUiResetEpoch
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load your group access."
    };
  }
}

export async function fetchDashboardGroupAccessDataForCurrentUser(): Promise<FetchDashboardGroupAccessResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in to do that." };
  }

  return fetchDashboardGroupAccessForUser(user.id);
}

async function fetchManagedGroupCount(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: profile, error: profileError } = await adminSupabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const role = ((profile as { role?: PlatformRole | null } | null)?.role ?? "player") as PlatformRole;
  if (role === "admin") {
    const { count, error } = await adminSupabase
      .from("groups")
      .select("id", { count: "exact", head: true });

    if (error) {
      throw new Error(error.message);
    }

    return count ?? 0;
  }

  const [{ data: ownedGroups, error: ownedGroupsError }, { data: managerMemberships, error: managerMembershipsError }] = await Promise.all([
    adminSupabase
      .from("groups")
      .select("id")
      .eq("owner_user_id", userId),
    adminSupabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId)
      .eq("role", "manager")
  ]);

  if (ownedGroupsError) {
    throw new Error(ownedGroupsError.message);
  }

  if (managerMembershipsError) {
    throw new Error(managerMembershipsError.message);
  }

  const managedGroupIds = new Set<string>();
  for (const group of (ownedGroups ?? []) as Array<{ id?: string | null }>) {
    if (group.id) {
      managedGroupIds.add(group.id);
    }
  }
  for (const membership of (managerMemberships ?? []) as Array<{ group_id?: string | null }>) {
    if (membership.group_id) {
      managedGroupIds.add(membership.group_id);
    }
  }

  return managedGroupIds.size;
}
