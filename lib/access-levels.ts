import type { UserProfile } from "@/lib/types";
import {
  resolveAccessLevel,
  resolveTierAccess,
  type AccessLevel
} from "@/lib/tier-access";

export function getAccessLevel(
  user: Pick<UserProfile, "accessLevel" | "role" | "planTier" | "managerLimits">
): AccessLevel {
  if (user.accessLevel) {
    return user.accessLevel;
  }

  return resolveAccessLevel({
    role: user.role,
    planTier: user.planTier,
    managerLimits: user.managerLimits ?? null
  });
}

export function getAccessLevelLabel(
  user: Pick<UserProfile, "accessLevel" | "role" | "planTier" | "managerLimits">
) {
  const access = resolveTierAccess({
    role: user.role,
    planTier: user.planTier,
    managerLimits: user.managerLimits ?? null
  });

  return access.shortLabel;
}

export function getRoleBadgeLabel(role: string | null | undefined) {
  if (!role) {
    return "";
  }

  const normalizedRole = role.trim().toLowerCase().replace(/[_\s-]+/g, " ");

  if (normalizedRole === "super admin" || normalizedRole === "super_admin") {
    return "A";
  }

  if (normalizedRole === "manager") {
    return "M";
  }

  if (normalizedRole === "captain") {
    return "C";
  }

  if (normalizedRole === "director") {
    return "L";
  }

  if (normalizedRole === "managing director" || normalizedRole === "managing_director") {
    return "L+";
  }

  if (normalizedRole === "admin") {
    return "A";
  }

  if (normalizedRole === "player") {
    return "P";
  }

  return role;
}

export function getAccessLevelDescription(
  user: Pick<UserProfile, "accessLevel" | "role" | "planTier" | "managerLimits">
) {
  const access = resolveTierAccess({
    role: user.role,
    planTier: user.planTier,
    managerLimits: user.managerLimits ?? null
  });

  if (access.accessLevel === "super_admin") {
    return "Unlimited access";
  }

  if (access.accessLevel === "player") {
    return null;
  }

  return access.limits.isUnlimited
    ? "Unlimited organizer access"
    : [
        `Up to ${access.limits.maxGroups ?? 0} group${access.limits.maxGroups === 1 ? "" : "s"}`,
        `${access.limits.maxMembersPerGroup ?? 0} members per group`,
        access.limits.maxTotalPlayers ? `${access.limits.maxTotalPlayers} total players` : null
      ]
        .filter(Boolean)
        .join(" · ");
}

export function shouldShowAccessBadge(
  user: Pick<UserProfile, "accessLevel" | "role" | "planTier" | "managerLimits">
) {
  return getAccessLevel(user) !== "player";
}
