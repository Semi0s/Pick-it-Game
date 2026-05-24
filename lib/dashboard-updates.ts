import type { UserProfile } from "@/lib/types";

export const APP_UPDATES_ADMIN_REQUIRED_MESSAGE = "Only super admins can manage updates.";
export const APP_UPDATES_SIGN_IN_REQUIRED_MESSAGE = "Sign in to continue.";

type AppUpdatesManagerUser = Pick<UserProfile, "id" | "role"> | null | undefined;
export type AppUpdatesCardDisplayState = "hidden" | "card" | "admin_disabled" | "admin_empty" | "admin_error";

export function canManageAppUpdates(user: AppUpdatesManagerUser): boolean {
  return user?.role === "admin";
}

export function getAppUpdatesCardDisplayState(input: {
  canManageUpdates: boolean;
  isEnabled: boolean;
  hasActiveUpdate: boolean;
  hasError: boolean;
}): AppUpdatesCardDisplayState {
  if (input.hasError) {
    return input.canManageUpdates ? "admin_error" : "hidden";
  }

  if (!input.isEnabled) {
    return input.canManageUpdates ? "admin_disabled" : "hidden";
  }

  if (!input.hasActiveUpdate) {
    return input.canManageUpdates ? "admin_empty" : "hidden";
  }

  return "card";
}

export function resolveAppUpdatesAdminAccess(input: {
  userId: string | null | undefined;
  role: string | null | undefined;
}): { ok: true; userId: string } | { ok: false; message: string } {
  if (!input.userId) {
    return { ok: false, message: APP_UPDATES_SIGN_IN_REQUIRED_MESSAGE };
  }

  if (input.role !== "admin") {
    return { ok: false, message: APP_UPDATES_ADMIN_REQUIRED_MESSAGE };
  }

  return { ok: true, userId: input.userId };
}
