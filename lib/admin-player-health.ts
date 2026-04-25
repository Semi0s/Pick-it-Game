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
  avatar_url?: string | null;
  role: UserRole;
  status?: UserStatus | null;
  username?: string | null;
  username_set_at?: string | null;
  needs_profile_setup?: boolean | null;
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

type EmailJobRow = {
  email: string;
  status: "pending" | "processing" | "retrying" | "sent" | "failed";
  created_at: string;
};

type GroupInviteStatusRow = {
  normalized_email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
};

type GroupMembershipRow = {
  user_id: string;
};

export type AdminPlayerHealthRow = {
  key: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
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
  currentGroupsUsed: number;
  currentMembersUsed: number;
  createdAt?: string | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  inviteLastSentAt?: string | null;
  inviteSendAttempts: number;
  inviteLastError?: string | null;
  inviteDeliveryState: "not_sent" | "queued" | "sent" | "failed" | "unknown";
  emailConfirmedAt?: string | null;
  confirmationSentAt?: string | null;
  lastSignInAt?: string | null;
  hasProfile: boolean;
  usernameSet: boolean;
  groupInviteStatus: string;
  groupMembershipCount: number;
  onboardingIncomplete: boolean;
  username?: string | null;
  troubleshootingNotes: string[];
};

export async function fetchAdminPlayerHealthRows(): Promise<AdminPlayerHealthRow[]> {
  const adminSupabase = createAdminClient();

  const [{ data: users, error: usersError }, { data: invites, error: invitesError }, { data: managerLimits, error: managerLimitsError }, { data: groups, error: groupsError }, emailJobsResult, groupInviteStatusesResult, groupMembershipsResult, authUsers] = await Promise.all([
    adminSupabase.from("users").select("id,name,email,avatar_url,role,status,username,username_set_at,needs_profile_setup,total_points,created_at").order("created_at", { ascending: false }),
    adminSupabase
      .from("invites")
      .select("email,display_name,role,status,accepted_at,created_at,last_sent_at,send_attempts,last_error")
      .order("created_at", { ascending: false }),
    adminSupabase.from("manager_limits").select("user_id,max_groups,max_members_per_group"),
    adminSupabase
      .from("groups")
      .select("owner_user_id,group_members(count)")
      .eq("status", "active"),
    adminSupabase
      .from("email_jobs")
      .select("email,status,created_at")
      .eq("kind", "access_email")
      .order("created_at", { ascending: false }),
    adminSupabase.from("group_invites").select("normalized_email,status"),
    adminSupabase.from("group_members").select("user_id"),
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

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  const emailJobRows = !emailJobsResult.error ? ((emailJobsResult.data ?? []) as EmailJobRow[]) : [];
  const groupInviteStatuses = !groupInviteStatusesResult.error
    ? ((groupInviteStatusesResult.data ?? []) as GroupInviteStatusRow[])
    : [];
  const groupMemberships = !groupMembershipsResult.error
    ? ((groupMembershipsResult.data ?? []) as GroupMembershipRow[])
    : [];

  const rowsByKey = new Map<string, { appUser?: RawAdminAppUser; invite?: RawAdminInvite; authUser?: RawAdminAuthUser }>();
  const managerLimitsByUserId = new Map(
    ((managerLimits ?? []) as ManagerLimitsRow[]).map((row) => [row.user_id, row])
  );
  const latestInviteJobByEmail = new Map<string, EmailJobRow>();
  const groupUsageByUserId = new Map<string, { currentGroupsUsed: number; currentMembersUsed: number }>();
  const groupInviteStatusByEmail = new Map<string, string>();
  const groupMembershipCountByUserId = new Map<string, number>();

  for (const emailJob of emailJobRows) {
    const normalizedEmail = normalizeEmail(emailJob.email);
    if (!normalizedEmail || latestInviteJobByEmail.has(normalizedEmail)) {
      continue;
    }

    latestInviteJobByEmail.set(normalizedEmail, emailJob);
  }

  const inviteStatusCountsByEmail = new Map<string, Record<string, number>>();
  for (const invite of groupInviteStatuses) {
    const existing = inviteStatusCountsByEmail.get(invite.normalized_email) ?? {};
    existing[invite.status] = (existing[invite.status] ?? 0) + 1;
    inviteStatusCountsByEmail.set(invite.normalized_email, existing);
  }

  for (const [email, counts] of inviteStatusCountsByEmail.entries()) {
    groupInviteStatusByEmail.set(email, summarizeGroupInviteStatuses(counts));
  }

  for (const membership of groupMemberships) {
    groupMembershipCountByUserId.set(
      membership.user_id,
      (groupMembershipCountByUserId.get(membership.user_id) ?? 0) + 1
    );
  }

  for (const group of (groups ?? []) as Array<{ owner_user_id: string | null; group_members?: Array<{ count: number | null }> | { count: number | null } | null }>) {
    if (!group.owner_user_id) {
      continue;
    }

    const memberCount = Array.isArray(group.group_members)
      ? (group.group_members[0]?.count ?? 0)
      : (group.group_members?.count ?? 0);
    const existing = groupUsageByUserId.get(group.owner_user_id) ?? { currentGroupsUsed: 0, currentMembersUsed: 0 };
    existing.currentGroupsUsed += 1;
    existing.currentMembersUsed += memberCount;
    groupUsageByUserId.set(group.owner_user_id, existing);
  }

  for (const user of (users ?? []) as UserRow[]) {
    const normalizedEmail = normalizeEmail(user.email);
    const key = normalizedEmail ? `email:${normalizedEmail}` : `app:${user.id}`;
    rowsByKey.set(key, {
      ...rowsByKey.get(key),
      appUser: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url ?? null,
        role: user.role,
        status: user.status ?? "active",
        username: user.username ?? null,
        usernameSetAt: user.username_set_at ?? null,
        needsProfileSetup: user.needs_profile_setup ?? null,
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
        lastError: invite.last_error ?? null,
        hasPendingEmailJob: normalizedEmail ? latestInviteJobByEmail.has(normalizedEmail) : false,
        latestEmailJobStatus: normalizedEmail ? (latestInviteJobByEmail.get(normalizedEmail)?.status ?? null) : null
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
      const inviteDeliveryState = deriveInviteDeliveryState(value.invite);

      return {
        key,
        displayName,
        email: health.email ?? value.invite?.email ?? "Unknown email",
        avatarUrl: value.appUser?.avatar_url ?? null,
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
        currentGroupsUsed: health.appUserId ? (groupUsageByUserId.get(health.appUserId)?.currentGroupsUsed ?? 0) : 0,
        currentMembersUsed: health.appUserId ? (groupUsageByUserId.get(health.appUserId)?.currentMembersUsed ?? 0) : 0,
        createdAt: value.appUser?.createdAt ?? health.authCreatedAt ?? null,
        invitedAt: health.invitedAt ?? null,
        acceptedAt: health.acceptedAt ?? null,
        inviteLastSentAt: value.invite?.lastSentAt ?? null,
        inviteSendAttempts: value.invite?.sendAttempts ?? 0,
        inviteLastError: value.invite?.lastError ?? null,
        inviteDeliveryState,
        emailConfirmedAt: health.emailConfirmedAt ?? null,
        confirmationSentAt: health.confirmationSentAt ?? null,
        lastSignInAt: health.lastSignInAt ?? null,
        hasProfile: Boolean(value.appUser),
        usernameSet: Boolean(value.appUser?.username?.trim()),
        groupInviteStatus: groupInviteStatusByEmail.get(normalizeEmail(health.email) ?? "") ?? "None",
        groupMembershipCount: health.appUserId ? (groupMembershipCountByUserId.get(health.appUserId) ?? 0) : 0,
        onboardingIncomplete: health.onboardingIncomplete,
        username: value.appUser?.username ?? null,
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

function summarizeGroupInviteStatuses(counts: Record<string, number>) {
  const orderedStatuses: Array<{ key: keyof typeof counts; label: string }> = [
    { key: "pending", label: "Pending" },
    { key: "accepted", label: "Accepted" },
    { key: "expired", label: "Expired" },
    { key: "revoked", label: "Revoked" }
  ];

  const parts = orderedStatuses
    .map(({ key, label }) => {
      const count = counts[key];
      return count ? `${label} (${count})` : null;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "None";
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
        confirmationSentAt: user.confirmation_sent_at ?? null,
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

function deriveInviteDeliveryState(invite?: RawAdminInvite | null): AdminPlayerHealthRow["inviteDeliveryState"] {
  if (!invite) {
    return "unknown";
  }

  if (invite.lastError || invite.status === "failed" || invite.latestEmailJobStatus === "failed") {
    return "failed";
  }

  if (invite.hasPendingEmailJob && ["pending", "processing", "retrying"].includes(invite.latestEmailJobStatus ?? "")) {
    return "queued";
  }

  if (invite.lastSentAt || invite.latestEmailJobStatus === "sent") {
    return "sent";
  }

  if ((invite.sendAttempts ?? 0) === 0 && !invite.lastSentAt) {
    return "not_sent";
  }

  return "unknown";
}
