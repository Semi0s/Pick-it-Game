import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEffectiveMembershipLimitForGroup,
  normalizeCommercialTier,
  resolveTierAccess,
  type ResolvedTierAccess
} from "@/lib/tier-access";

type PlatformRole = "player" | "admin";

type ManagerLimitsRow = {
  user_id: string;
  max_groups: number;
  max_members_per_group: number;
};

type UserTierRow = {
  id: string;
  role: PlatformRole;
  plan_tier?: string | null;
};

type GroupLimitRow = {
  membership_limit: number;
  owner_user_id?: string | null;
};

async function fetchManagerLimits(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data, error } = await adminSupabase
    .from("manager_limits")
    .select("user_id,max_groups,max_members_per_group")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ManagerLimitsRow | null) ?? null;
}

export async function fetchTierAccessForUser(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<ResolvedTierAccess | null> {
  const [{ data: userProfile, error: userError }, managerLimits] = await Promise.all([
    adminSupabase.from("users").select("id,role,plan_tier").eq("id", userId).maybeSingle(),
    fetchManagerLimits(adminSupabase, userId)
  ]);

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userProfile) {
    return null;
  }

  return resolveTierAccess({
    role: (userProfile as UserTierRow).role,
    planTier: normalizeCommercialTier((userProfile as UserTierRow).plan_tier ?? null),
    managerLimits: managerLimits
      ? {
          maxGroups: managerLimits.max_groups,
          maxMembersPerGroup: managerLimits.max_members_per_group
        }
      : null
  });
}

export async function getEffectiveGroupSeatLimit(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: GroupLimitRow
) {
  if (!group.owner_user_id) {
    return group.membership_limit;
  }

  const ownerTierAccess = await fetchTierAccessForUser(adminSupabase, group.owner_user_id);
  if (!ownerTierAccess) {
    return group.membership_limit;
  }

  return getEffectiveMembershipLimitForGroup(group.membership_limit, {
    role: ownerTierAccess.accessLevel === "super_admin" ? "admin" : "player",
    planTier: ownerTierAccess.commercialTier,
    managerLimits:
      ownerTierAccess.hasLegacyManagerOverride &&
      ownerTierAccess.limits.maxGroups !== null &&
      ownerTierAccess.limits.maxMembersPerGroup !== null
        ? {
            maxGroups: ownerTierAccess.limits.maxGroups,
            maxMembersPerGroup: ownerTierAccess.limits.maxMembersPerGroup
          }
        : null
  });
}

export async function getAllowedMembershipLimitForGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: GroupLimitRow
) {
  if (!group.owner_user_id) {
    return group.membership_limit;
  }

  const ownerTierAccess = await fetchTierAccessForUser(adminSupabase, group.owner_user_id);
  if (!ownerTierAccess || ownerTierAccess.limits.isUnlimited || ownerTierAccess.limits.maxMembersPerGroup === null) {
    return group.membership_limit;
  }

  return ownerTierAccess.limits.maxMembersPerGroup;
}
