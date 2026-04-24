import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  deriveAdminUserHealth,
  type AdminHealthBadge,
  type AdminAppState,
  type AdminAuthState,
  type AdminInviteState,
  type RawAdminAppUser,
  type RawAdminAuthUser,
  type RawAdminInvite
} from "@/lib/admin-auth-health";
import type { UserRole, UserStatus } from "@/lib/types";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: UserStatus | null;
  total_points: number;
  created_at: string;
};

type InviteRow = {
  email: string;
  display_name?: string | null;
  role?: UserRole | null;
  status?: "pending" | "accepted" | "revoked" | "expired" | "failed" | null;
  accepted_at?: string | null;
  created_at?: string | null;
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
};

type ManagerLimitsRow = {
  user_id: string;
  max_groups: number;
  max_members_per_group: number;
};

export type AdminPlayerHealthRow = {
  key: string;
  displayName: string;
  email: string;
  roleLabel: string;
  totalPoints: number;
  appState: AdminAppState;
  authState: AdminAuthState;
  inviteState: AdminInviteState;
  healthBadge: AdminHealthBadge;
  appUserId?: string | null;
  authUserId?: string | null;
  userStatus?: UserStatus | null;
  isManager: boolean;
  maxGroups?: number | null;
  maxMembersPerGroup?: number | null;
  createdAt?: string | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  inviteLastSentAt?: string | null;
  inviteSendAttempts: number;
  inviteLastError?: string | null;
  emailConfirmedAt?: string | null;
  lastSignInAt?: string | null;
  troubleshootingNotes: string[];
};

export async function fetchAdminPlayerHealthRows(): Promise<AdminPlayerHealthRow[]> {
  const adminSupabase = createAdminClient();

  const [{ data: users, error: usersError }, { data: invites, error: invitesError }, { data: managerLimits, error: managerLimitsError }, authUsers] = await Promise.all([
    adminSupabase.from("users").select("id,name,email,role,status,total_points,created_at").order("created_at", { ascending: false }),
    adminSupabase
      .from("invites")
      .select("email,display_name,role,status,accepted_at,created_at,last_sent_at,send_attempts,last_error")
      .order("created_at", { ascending: false }),
    adminSupabase.from("manager_limits").select("user_id,max_groups,max_members_per_group"),
    fetchAllAuthUsers(adminSupabase)
  ]);

  if (usersError) {
    throw new Error(usersError.message);
  }

  if (invitesError) {
    throw new Error(invitesError.message);
  }

  if (managerLimitsError) {
    throw new Error(managerLimitsError.message);
  }

  const rowsByKey = new Map<string, { appUser?: RawAdminAppUser; invite?: RawAdminInvite; authUser?: RawAdminAuthUser }>();
  const managerLimitsByUserId = new Map(
    ((managerLimits ?? []) as ManagerLimitsRow[]).map((row) => [row.user_id, row])
  );

  for (const user of (users ?? []) as UserRow[]) {
    const normalizedEmail = normalizeEmail(user.email);
    const key = normalizedEmail ? `email:${normalizedEmail}` : `app:${user.id}`;
    rowsByKey.set(key, {
      ...rowsByKey.get(key),
      appUser: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status ?? "active",
        totalPoints: user.total_points,
        createdAt: user.created_at
      }
    });
  }

  for (const invite of (invites ?? []) as InviteRow[]) {
    const normalizedEmail = normalizeEmail(invite.email);
    const key = normalizedEmail ? `email:${normalizedEmail}` : `invite:${invite.email}`;
    rowsByKey.set(key, {
      ...rowsByKey.get(key),
      invite: {
        email: invite.email,
        displayName: invite.display_name ?? null,
        role: invite.role ?? null,
        status: invite.status ?? null,
        acceptedAt: invite.accepted_at ?? null,
        createdAt: invite.created_at ?? null,
        lastSentAt: invite.last_sent_at ?? null,
        sendAttempts: invite.send_attempts ?? null,
        lastError: invite.last_error ?? null
      }
    });
  }

  for (const authUser of authUsers) {
    const normalizedEmail = normalizeEmail(authUser.email);
    const key = normalizedEmail ? `email:${normalizedEmail}` : `auth:${authUser.id}`;
    rowsByKey.set(key, {
      ...rowsByKey.get(key),
      authUser
    });
  }

  return Array.from(rowsByKey.entries())
    .map(([key, value]) => {
      const health = deriveAdminUserHealth(value);
      const displayName =
        value.appUser?.name ??
        value.invite?.displayName ??
        value.authUser?.email?.split("@")[0] ??
        "Unknown user";
      const roleLabel = value.appUser?.role ?? value.invite?.role ?? "player";

      return {
        key,
        displayName,
        email: health.email ?? value.invite?.email ?? "Unknown email",
        roleLabel,
        totalPoints: value.appUser?.totalPoints ?? 0,
        appState: health.appState,
        authState: health.authState,
        inviteState: health.inviteState,
        healthBadge: health.healthBadge,
        appUserId: health.appUserId,
        authUserId: health.authUserId,
        userStatus: value.appUser?.status ?? null,
        isManager: Boolean(health.appUserId && managerLimitsByUserId.has(health.appUserId)),
        maxGroups: health.appUserId ? (managerLimitsByUserId.get(health.appUserId)?.max_groups ?? null) : null,
        maxMembersPerGroup: health.appUserId
          ? (managerLimitsByUserId.get(health.appUserId)?.max_members_per_group ?? null)
          : null,
        createdAt: value.appUser?.createdAt ?? health.authCreatedAt ?? null,
        invitedAt: health.invitedAt ?? null,
        acceptedAt: health.acceptedAt ?? null,
        inviteLastSentAt: value.invite?.lastSentAt ?? null,
        inviteSendAttempts: value.invite?.sendAttempts ?? 0,
        inviteLastError: value.invite?.lastError ?? null,
        emailConfirmedAt: health.emailConfirmedAt ?? null,
        lastSignInAt: health.lastSignInAt ?? null,
        troubleshootingNotes: health.troubleshootingNotes
      };
    })
    .sort((left, right) => {
      const healthRank = compareHealthBadge(left.healthBadge) - compareHealthBadge(right.healthBadge);
      if (healthRank !== 0) {
        return healthRank;
      }

      return left.displayName.localeCompare(right.displayName);
    });
}

async function fetchAllAuthUsers(adminSupabase: ReturnType<typeof createAdminClient>): Promise<RawAdminAuthUser[]> {
  const users: RawAdminAuthUser[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(error.message);
    }

    users.push(
      ...data.users.map((user) => ({
        id: user.id,
        email: user.email ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
        confirmedAt: user.confirmed_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        createdAt: user.created_at ?? null
      }))
    );

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return users;
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

function compareHealthBadge(badge: AdminHealthBadge) {
  switch (badge) {
    case "mismatch":
      return 0;
    case "needs_attention":
      return 1;
    case "pending_confirmation":
      return 2;
    case "pending_signup":
      return 3;
    case "pending_first_login":
      return 4;
    case "healthy":
      return 5;
    default:
      return 6;
  }
}
