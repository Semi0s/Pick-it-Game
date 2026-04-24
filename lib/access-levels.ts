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
    return "Super Admin";
  }

  if (accessLevel === "manager") {
    return "Manager";
  }

  return "Player";
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
