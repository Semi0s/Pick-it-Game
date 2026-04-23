import type { UserRole, UserStatus } from "@/lib/types";

export type AdminAppState = "invited" | "active" | "admin" | "disabled" | "removed" | "unknown";
export type AdminAuthState =
  | "no_auth_account"
  | "unconfirmed_email"
  | "confirmed_never_signed_in"
  | "active_auth_user"
  | "auth_unavailable"
  | "auth_profile_mismatch"
  | "unknown";
export type AdminInviteState =
  | "not_invited"
  | "invited_pending"
  | "invite_accepted"
  | "invite_expired"
  | "invite_failed"
  | "resend_needed"
  | "unknown";
export type AdminHealthBadge =
  | "healthy"
  | "pending_signup"
  | "pending_confirmation"
  | "pending_first_login"
  | "mismatch"
  | "needs_attention";

export type AdminUserHealth = {
  appState: AdminAppState;
  authState: AdminAuthState;
  inviteState: AdminInviteState;
  healthBadge: AdminHealthBadge;
  authUserId?: string | null;
  appUserId?: string | null;
  email?: string | null;
  emailConfirmedAt?: string | null;
  lastSignInAt?: string | null;
  authCreatedAt?: string | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  troubleshootingNotes: string[];
};

export type RawAdminAppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: UserStatus | null;
  totalPoints: number;
  createdAt: string;
};

export type RawAdminInvite = {
  email: string;
  displayName?: string | null;
  role?: UserRole | null;
  status?: "pending" | "accepted" | "revoked" | "expired" | "failed" | null;
  acceptedAt?: string | null;
  createdAt?: string | null;
  lastSentAt?: string | null;
  sendAttempts?: number | null;
  lastError?: string | null;
};

export type RawAdminAuthUser = {
  id: string;
  email?: string | null;
  emailConfirmedAt?: string | null;
  confirmedAt?: string | null;
  lastSignInAt?: string | null;
  createdAt?: string | null;
};

export function deriveAdminUserHealth(input: {
  appUser?: RawAdminAppUser | null;
  invite?: RawAdminInvite | null;
  authUser?: RawAdminAuthUser | null;
}): AdminUserHealth {
  const { appUser, invite, authUser } = input;
  const troubleshootingNotes: string[] = [];
  const normalizedAppEmail = normalizeEmail(appUser?.email);
  const normalizedInviteEmail = normalizeEmail(invite?.email);
  const normalizedAuthEmail = normalizeEmail(authUser?.email);

  const appState = deriveAppState(appUser, invite);
  const authState = deriveAuthState(authUser);
  const inviteState = deriveInviteState(invite);

  if (appUser && authUser && appUser.id !== authUser.id) {
    troubleshootingNotes.push("App profile id does not match the Supabase auth user id.");
  }

  const distinctEmails = new Set([normalizedAppEmail, normalizedInviteEmail, normalizedAuthEmail].filter(Boolean));
  if (distinctEmails.size > 1) {
    troubleshootingNotes.push("App, invite, and auth records disagree on the email address.");
  }

  if (inviteState === "invite_accepted" && !authUser) {
    troubleshootingNotes.push("Invite is marked accepted, but no matching auth account was found.");
  }

  if (appUser && !authUser) {
    troubleshootingNotes.push("App profile exists without a matching auth account.");
  }

  if (authUser && !appUser) {
    troubleshootingNotes.push("Auth account exists without a matching app profile.");
  }

  if (invite?.lastError) {
    troubleshootingNotes.push(`Latest invite error: ${invite.lastError}`);
  }

  const hasMismatch =
    troubleshootingNotes.some((note) =>
      note.includes("does not match") ||
      note.includes("disagree") ||
      note.includes("without a matching")
    );

  const healthBadge = deriveHealthBadge({
    appState,
    authState,
    inviteState,
    hasMismatch
  });

  return {
    appState,
    authState,
    inviteState,
    healthBadge,
    authUserId: authUser?.id ?? null,
    appUserId: appUser?.id ?? null,
    email: appUser?.email ?? authUser?.email ?? invite?.email ?? null,
    emailConfirmedAt: authUser?.emailConfirmedAt ?? authUser?.confirmedAt ?? null,
    lastSignInAt: authUser?.lastSignInAt ?? null,
    authCreatedAt: authUser?.createdAt ?? null,
    invitedAt: invite?.createdAt ?? null,
    acceptedAt: invite?.acceptedAt ?? null,
    troubleshootingNotes
  };
}

function deriveAppState(appUser?: RawAdminAppUser | null, invite?: RawAdminInvite | null): AdminAppState {
  if (appUser?.role === "admin") {
    return "admin";
  }

  if (appUser?.status === "inactive" || appUser?.status === "suspended") {
    return "disabled";
  }

  if (appUser) {
    return "active";
  }

  if (invite) {
    return "invited";
  }

  return "unknown";
}

function deriveAuthState(authUser?: RawAdminAuthUser | null): AdminAuthState {
  if (!authUser) {
    return "no_auth_account";
  }

  const emailConfirmedAt = authUser.emailConfirmedAt ?? authUser.confirmedAt;
  if (!emailConfirmedAt) {
    return "unconfirmed_email";
  }

  if (!authUser.lastSignInAt) {
    return "confirmed_never_signed_in";
  }

  return "active_auth_user";
}

function deriveInviteState(invite?: RawAdminInvite | null): AdminInviteState {
  if (!invite) {
    return "not_invited";
  }

  if (invite.acceptedAt || invite.status === "accepted") {
    return "invite_accepted";
  }

  if (invite.status === "expired") {
    return "invite_expired";
  }

  if (invite.status === "failed") {
    return "invite_failed";
  }

  if (invite.status === "revoked") {
    return "resend_needed";
  }

  if (invite.status === "pending") {
    return "invited_pending";
  }

  return "unknown";
}

function deriveHealthBadge(input: {
  appState: AdminAppState;
  authState: AdminAuthState;
  inviteState: AdminInviteState;
  hasMismatch: boolean;
}): AdminHealthBadge {
  if (input.hasMismatch || input.authState === "auth_profile_mismatch") {
    return "mismatch";
  }

  if (input.appState === "invited" && input.authState === "no_auth_account" && input.inviteState === "invited_pending") {
    return "pending_signup";
  }

  if (input.authState === "unconfirmed_email") {
    return "pending_confirmation";
  }

  if (input.authState === "confirmed_never_signed_in") {
    return "pending_first_login";
  }

  if ((input.appState === "active" || input.appState === "admin") && input.authState === "active_auth_user") {
    return "healthy";
  }

  return "needs_attention";
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? null;
}
