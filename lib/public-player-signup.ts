import "server-only";

import { getEffectiveGroupSeatLimit } from "@/lib/group-tier-limits";
import { ensureUserCanJoinAnotherGroup } from "@/lib/group-membership-limits";
import {
  PUBLIC_PLAYER_SIGNUP_ENABLED_KEY,
  PUBLIC_SIGNUP_DEFAULT_GROUP_ID_KEY,
  PUBLIC_SIGNUP_DEFAULT_TIER_KEY,
  fetchBooleanAppSetting,
  fetchTextAppSetting
} from "@/lib/app-settings";
import { createAdminClient } from "@/lib/supabase/admin";

export const PUBLIC_SIGNUP_DEFAULT_GROUP_NAME = "FIFA 2026 Predictions";
export const PUBLIC_SIGNUP_DEFAULT_TIER = "player";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type PublicSignupGroupRow = {
  id: string;
  name: string;
  status: "active" | "archived";
  membership_limit: number;
  owner_user_id?: string | null;
};

export type PublicPlayerSignupStatus = {
  enabled: boolean;
  defaultGroupId: string | null;
  defaultGroupName: string;
  defaultTier: "player";
  message: string;
};

export async function fetchPublicPlayerSignupStatus(
  adminSupabase: AdminSupabaseClient = createAdminClient()
): Promise<PublicPlayerSignupStatus> {
  const enabled = await fetchBooleanAppSetting(PUBLIC_PLAYER_SIGNUP_ENABLED_KEY, true);
  const defaultTierSetting = await fetchTextAppSetting(PUBLIC_SIGNUP_DEFAULT_TIER_KEY, PUBLIC_SIGNUP_DEFAULT_TIER);
  const defaultTier = defaultTierSetting === "player" ? "player" : PUBLIC_SIGNUP_DEFAULT_TIER;
  const configuredGroupId = await fetchTextAppSetting(PUBLIC_SIGNUP_DEFAULT_GROUP_ID_KEY, null);
  const defaultGroup = await resolvePublicSignupDefaultGroup(adminSupabase, configuredGroupId);

  if (!enabled) {
    return {
      enabled: false,
      defaultGroupId: defaultGroup?.id ?? configuredGroupId,
      defaultGroupName: defaultGroup?.name ?? PUBLIC_SIGNUP_DEFAULT_GROUP_NAME,
      defaultTier,
      message: "Public Player signup is temporarily disabled."
    };
  }

  if (!defaultGroup || defaultGroup.status !== "active") {
    return {
      enabled: false,
      defaultGroupId: defaultGroup?.id ?? configuredGroupId,
      defaultGroupName: defaultGroup?.name ?? PUBLIC_SIGNUP_DEFAULT_GROUP_NAME,
      defaultTier,
      message: "Free Player signup is not ready yet. Try an invite or access code, or contact support."
    };
  }

  return {
    enabled: true,
    defaultGroupId: defaultGroup.id,
    defaultGroupName: defaultGroup.name,
    defaultTier,
    message: "Create a free Player account to start your predictions."
  };
}

export async function ensurePublicPlayerDefaultGroupMembership(
  adminSupabase: AdminSupabaseClient,
  userId: string,
  notes: string[] = []
) {
  const status = await fetchPublicPlayerSignupStatus(adminSupabase);
  if (!status.enabled || !status.defaultGroupId) {
    notes.push(status.message);
    return false;
  }

  const { data: existingMembership, error: membershipLookupError } = await adminSupabase
    .from("group_members")
    .select("id")
    .eq("group_id", status.defaultGroupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipLookupError) {
    throw new Error(membershipLookupError.message);
  }

  if (existingMembership) {
    notes.push(`Player is already a member of ${status.defaultGroupName}.`);
    return true;
  }

  const { data: group, error: groupError } = await adminSupabase
    .from("groups")
    .select("id,name,status,membership_limit,owner_user_id")
    .eq("id", status.defaultGroupId)
    .maybeSingle();

  if (groupError) {
    throw new Error(groupError.message);
  }

  const defaultGroup = group as PublicSignupGroupRow | null;
  if (!defaultGroup || defaultGroup.status !== "active") {
    notes.push("Skipped public signup default group join because the group is unavailable.");
    return false;
  }

  const { count, error: memberCountError } = await adminSupabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", defaultGroup.id);

  if (memberCountError) {
    throw new Error(memberCountError.message);
  }

  const effectiveSeatLimit = await getEffectiveGroupSeatLimit(adminSupabase, defaultGroup);
  if ((count ?? 0) >= effectiveSeatLimit) {
    notes.push(`Skipped public signup default group join because ${defaultGroup.name} is full.`);
    return false;
  }

  const joinLimitResult = await ensureUserCanJoinAnotherGroup(adminSupabase, userId);
  if (!joinLimitResult.ok) {
    notes.push("Skipped public signup default group join because the player is already in the maximum number of groups.");
    return false;
  }

  const { error: membershipInsertError } = await adminSupabase.from("group_members").insert({
    group_id: defaultGroup.id,
    user_id: userId,
    role: "member",
    join_source: "public_signup"
  });

  if (membershipInsertError && membershipInsertError.code !== "23505") {
    throw new Error(membershipInsertError.message);
  }

  notes.push(`Joined ${defaultGroup.name} through public signup.`);
  return true;
}

async function resolvePublicSignupDefaultGroup(
  adminSupabase: AdminSupabaseClient,
  configuredGroupId: string | null
): Promise<PublicSignupGroupRow | null> {
  if (configuredGroupId) {
    const { data, error } = await adminSupabase
      .from("groups")
      .select("id,name,status,membership_limit,owner_user_id")
      .eq("id", configuredGroupId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data as PublicSignupGroupRow;
    }
  }

  const { data, error } = await adminSupabase
    .from("groups")
    .select("id,name,status,membership_limit,owner_user_id")
    .eq("name", PUBLIC_SIGNUP_DEFAULT_GROUP_NAME)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return ((data as PublicSignupGroupRow[] | null)?.[0] as PublicSignupGroupRow | undefined) ?? null;
}
