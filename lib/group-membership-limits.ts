import "server-only";

import { fetchIntegerAppSetting } from "@/lib/app-settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const MAX_JOINED_GROUPS_PER_PLAYER_SETTING_KEY = "max_joined_groups_per_player";
export const DEFAULT_MAX_JOINED_GROUPS_PER_PLAYER = 10;
export const MAX_JOINED_GROUPS_PER_PLAYER_MESSAGE = "This player is already in the maximum number of groups.";

export async function fetchMaxJoinedGroupsPerPlayer() {
  return fetchIntegerAppSetting(
    MAX_JOINED_GROUPS_PER_PLAYER_SETTING_KEY,
    DEFAULT_MAX_JOINED_GROUPS_PER_PLAYER
  );
}

export async function fetchJoinedPlayerGroupCount(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { count, error } = await adminSupabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "member");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function ensureUserCanJoinAnotherGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [joinedGroupCount, maxJoinedGroups] = await Promise.all([
    fetchJoinedPlayerGroupCount(adminSupabase, userId),
    fetchMaxJoinedGroupsPerPlayer()
  ]);

  if (joinedGroupCount >= maxJoinedGroups) {
    return { ok: false, message: MAX_JOINED_GROUPS_PER_PLAYER_MESSAGE };
  }

  return { ok: true };
}
