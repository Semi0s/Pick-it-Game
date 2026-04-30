import type { UserProfile } from "@/lib/types";

export type AccessLevel = "player" | "manager" | "super_admin";

export function getAccessLevel(user: Pick<UserProfile, "accessLevel" | "role">): AccessLevel {
  if (user.accessLevel) {
    return user.accessLevel;
  }

  if (user.role === "admin") {
    return "super_admin";
  }

  return "player";
}

export function getAccessLevelLabel(user: Pick<UserProfile, "accessLevel" | "role">) {
  const accessLevel = getAccessLevel(user);
  if (accessLevel === "super_admin") {
    return "SA";
  }

  if (accessLevel === "manager") {
    return "M";
  }

  return "P";
}

export function getRoleBadgeLabel(role: string | null | undefined) {
  if (!role) {
    return "";
  }

  const normalizedRole = role.trim().toLowerCase().replace(/[_\s-]+/g, " ");

  if (normalizedRole === "super admin" || normalizedRole === "super_admin") {
    return "SA";
  }

  if (normalizedRole === "manager") {
    return "M";
  }

  if (normalizedRole === "director") {
    return "D";
  }

  if (normalizedRole === "admin") {
    return "A";
  }

  if (normalizedRole === "player") {
    return "P";
  }

  return role;
}

export function getAccessLevelDescription(user: Pick<UserProfile, "accessLevel" | "role">) {
  const accessLevel = getAccessLevel(user);
  if (accessLevel === "super_admin") {
    return "Unlimited access";
  }

  if (accessLevel === "manager") {
    return "Limited access";
  }

  return null;
}

export function shouldShowAccessBadge(user: Pick<UserProfile, "accessLevel" | "role">) {
  return getAccessLevel(user) !== "player";
}
