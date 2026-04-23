"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

const DEFAULT_GROUP_MEMBERSHIP_LIMIT = 15;
const DEFAULT_INVITE_EXPIRY_DAYS = 14;

type GroupStatus = "active" | "archived";
type GroupMemberRole = "manager" | "member";
type GroupInviteStatus = "pending" | "accepted" | "revoked" | "expired";
type PlatformRole = "player" | "admin";

type CurrentUserContext =
  | {
      ok: true;
      userId: string;
      email: string;
      role: PlatformRole;
    }
  | {
      ok: false;
      message: string;
    };

type ManagerLimitsRow = {
  user_id: string;
  max_groups: number;
  max_members_per_group: number;
};

type GroupRow = {
  id: string;
  name: string;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  membership_limit: number;
  status: GroupStatus;
  created_at: string;
  updated_at: string;
};

type GroupInviteRow = {
  id: string;
  group_id: string;
  email: string;
  normalized_email: string;
  invited_by_user_id: string | null;
  suggested_display_name?: string | null;
  status: GroupInviteStatus;
  token_hash: string;
  expires_at?: string | null;
  accepted_by_user_id?: string | null;
  accepted_at?: string | null;
};

export type CreateGroupInput = {
  name: string;
  membershipLimit?: number;
};

export type CreateGroupResult =
  | {
      ok: true;
      group: {
        id: string;
        name: string;
        membershipLimit: number;
        status: GroupStatus;
      };
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CreateGroupInviteInput = {
  groupId: string;
  email: string;
  suggestedDisplayName?: string;
  expiresInDays?: number;
};

export type CreateGroupInviteResult =
  | {
      ok: true;
      invite: {
        id: string;
        groupId: string;
        email: string;
        status: GroupInviteStatus;
        expiresAt: string | null;
        token: string;
        claimUrl: string;
      };
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type AcceptGroupInviteInput = {
  token: string;
};

export type AcceptGroupInviteResult =
  | {
      ok: true;
      membership: {
        groupId: string;
        userId: string;
        role: GroupMemberRole;
      };
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function createGroupAction(input: CreateGroupInput): Promise<CreateGroupResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const name = input.name?.trim();
  if (!name) {
    return { ok: false, message: "Group name is required." };
  }

  const adminSupabase = createAdminClient();
  const managerLimits = await getManagerLimits(adminSupabase, currentUser.userId);

  if (currentUser.role !== "admin" && !managerLimits) {
    return { ok: false, message: "You are not entitled to create groups yet." };
  }

  const requestedMembershipLimit = normalizeRequestedMembershipLimit(input.membershipLimit);
  const membershipLimit =
    currentUser.role === "admin"
      ? requestedMembershipLimit
      : Math.min(requestedMembershipLimit, managerLimits!.max_members_per_group);

  if (currentUser.role !== "admin" && requestedMembershipLimit > managerLimits!.max_members_per_group) {
    return {
      ok: false,
      message: `Your plan allows up to ${managerLimits!.max_members_per_group} members per group.`
    };
  }

  if (currentUser.role !== "admin") {
    const activeGroupCount = await getActiveOwnedGroupCount(adminSupabase, currentUser.userId);
    if (activeGroupCount >= managerLimits!.max_groups) {
      return {
        ok: false,
        message: `You already manage ${managerLimits!.max_groups} active group${managerLimits!.max_groups === 1 ? "" : "s"}.`
      };
    }
  }

  const { data, error } = await adminSupabase
    .from("groups")
    .insert({
      name,
      owner_user_id: currentUser.userId,
      created_by_user_id: currentUser.userId,
      membership_limit: membershipLimit,
      status: "active"
    })
    .select("id,name,membership_limit,status")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/my-groups");
  revalidatePath("/dashboard");

  return {
    ok: true,
    group: {
      id: data.id,
      name: data.name,
      membershipLimit: data.membership_limit,
      status: data.status
    },
    message: "Group created."
  };
}

export async function createGroupInviteAction(input: CreateGroupInviteInput): Promise<CreateGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const groupId = input.groupId?.trim();
  const normalizedEmail = normalizeEmail(input.email);
  if (!groupId || !normalizedEmail) {
    return { ok: false, message: "A valid group and email are required." };
  }

  const adminSupabase = createAdminClient();
  const managedGroup = await getManagedGroup(adminSupabase, groupId, currentUser.userId, currentUser.role);
  if (!managedGroup) {
    return { ok: false, message: "You do not manage that group." };
  }

  const seatCheck = await ensureGroupHasInviteCapacity(adminSupabase, managedGroup.id, managedGroup.membership_limit);
  if (!seatCheck.ok) {
    return seatCheck;
  }

  const existingUserId = await findUserIdByEmail(adminSupabase, normalizedEmail);

  let existingMembership: { id: string } | null = null;
  let existingMembershipError: { message: string } | null = null;

  if (existingUserId) {
    const membershipLookup = await adminSupabase
      .from("group_members")
      .select("id")
      .eq("group_id", managedGroup.id)
      .eq("user_id", existingUserId)
      .maybeSingle();

    existingMembership = membershipLookup.data;
    existingMembershipError = membershipLookup.error;
  }

  if (existingMembershipError) {
    return { ok: false, message: existingMembershipError.message };
  }

  if (existingMembership) {
    return { ok: false, message: "That user is already a member of this group." };
  }

  const { data: existingPendingInvite, error: existingPendingInviteError } = await adminSupabase
    .from("group_invites")
    .select("id")
    .eq("group_id", managedGroup.id)
    .eq("normalized_email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPendingInviteError) {
    return { ok: false, message: existingPendingInviteError.message };
  }

  if (existingPendingInvite) {
    return { ok: false, message: "A pending invite already exists for that email in this group." };
  }

  const token = randomBytes(24).toString("hex");
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + normalizeExpiryDays(input.expiresInDays) * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await adminSupabase
    .from("group_invites")
    .insert({
      group_id: managedGroup.id,
      email: normalizedEmail,
      normalized_email: normalizedEmail,
      invited_by_user_id: currentUser.userId,
      suggested_display_name: input.suggestedDisplayName?.trim() || null,
      status: "pending",
      token_hash: tokenHash,
      expires_at: expiresAt
    })
    .select("id,group_id,email,status,expires_at")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/my-groups");

  return {
    ok: true,
    invite: {
      id: data.id,
      groupId: data.group_id,
      email: data.email,
      status: data.status,
      expiresAt: data.expires_at ?? null,
      token,
      claimUrl: buildGroupInviteClaimUrl(token)
    },
    message: "Group invite created."
  };
}

export async function acceptGroupInviteAction(input: AcceptGroupInviteInput): Promise<AcceptGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const token = input.token?.trim();
  if (!token) {
    return { ok: false, message: "Invite token is required." };
  }

  const adminSupabase = createAdminClient();
  const tokenHash = hashInviteToken(token);
  const { data: invite, error: inviteError } = await adminSupabase
    .from("group_invites")
    .select("id,group_id,email,normalized_email,status,expires_at,accepted_at,accepted_by_user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (inviteError) {
    return { ok: false, message: inviteError.message };
  }

  if (!invite) {
    return { ok: false, message: "That invite could not be found." };
  }

  const inviteRow = invite as GroupInviteRow;
  if (inviteRow.status !== "pending") {
    return { ok: false, message: "That invite is no longer pending." };
  }

  if (inviteRow.expires_at && new Date(inviteRow.expires_at).getTime() < Date.now()) {
    await adminSupabase
      .from("group_invites")
      .update({ status: "expired" })
      .eq("id", inviteRow.id);

    return { ok: false, message: "That invite has expired." };
  }

  if (normalizeEmail(currentUser.email) !== inviteRow.normalized_email) {
    return { ok: false, message: "You must sign in with the invited email to accept this invite." };
  }

  const { data: existingMembership, error: existingMembershipError } = await adminSupabase
    .from("group_members")
    .select("id,role")
    .eq("group_id", inviteRow.group_id)
    .eq("user_id", currentUser.userId)
    .maybeSingle();

  if (existingMembershipError) {
    return { ok: false, message: existingMembershipError.message };
  }

  if (existingMembership) {
    return { ok: false, message: "You are already a member of this group." };
  }

  const { data: group, error: groupError } = await adminSupabase
    .from("groups")
    .select("id,membership_limit,status")
    .eq("id", inviteRow.group_id)
    .single();

  if (groupError) {
    return { ok: false, message: groupError.message };
  }

  if (group.status !== "active") {
    return { ok: false, message: "That group is not accepting members right now." };
  }

  const seatCheck = await ensureGroupHasOpenSeat(adminSupabase, group.id, group.membership_limit);
  if (!seatCheck.ok) {
    return seatCheck;
  }

  const { error: membershipInsertError } = await adminSupabase
    .from("group_members")
    .insert({
      group_id: inviteRow.group_id,
      user_id: currentUser.userId,
      role: "member"
    });

  if (membershipInsertError) {
    return { ok: false, message: membershipInsertError.message };
  }

  const { error: inviteUpdateError } = await adminSupabase
    .from("group_invites")
    .update({
      status: "accepted",
      accepted_by_user_id: currentUser.userId,
      accepted_at: new Date().toISOString()
    })
    .eq("id", inviteRow.id);

  if (inviteUpdateError) {
    return { ok: false, message: inviteUpdateError.message };
  }

  revalidatePath("/my-groups");
  revalidatePath("/dashboard");

  return {
    ok: true,
    membership: {
      groupId: inviteRow.group_id,
      userId: currentUser.userId,
      role: "member"
    },
    message: "You joined the group."
  };
}

async function getCurrentUserContext(): Promise<CurrentUserContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return { ok: false, message: "You must be signed in to do that." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id,email,role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, message: "Your player profile could not be loaded." };
  }

  return {
    ok: true,
    userId: profile.id,
    email: profile.email,
    role: profile.role
  };
}

async function getManagerLimits(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
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

async function getActiveOwnedGroupCount(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { count, error } = await adminSupabase
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function getManagedGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  userId: string,
  role: PlatformRole
) {
  const { data, error } = await adminSupabase
    .from("groups")
    .select("id,owner_user_id,membership_limit,status")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  if (role === "admin" || data.owner_user_id === userId) {
    return data as GroupRow;
  }

  const { data: membership, error: membershipError } = await adminSupabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  return membership ? (data as GroupRow) : null;
}

async function ensureGroupHasOpenSeat(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  membershipLimit: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { count, error } = await adminSupabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((count ?? 0) >= membershipLimit) {
    return { ok: false, message: "This group is already full." };
  }

  return { ok: true };
}

async function ensureGroupHasInviteCapacity(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  membershipLimit: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [memberCountResult, pendingInviteCountResult] = await Promise.all([
    adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId),
    adminSupabase
      .from("group_invites")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("status", "pending")
  ]);

  if (memberCountResult.error || pendingInviteCountResult.error) {
    return {
      ok: false,
      message: memberCountResult.error?.message ?? pendingInviteCountResult.error?.message ?? "Could not check group capacity."
    };
  }

  const usedSeats = (memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0);
  if (usedSeats >= membershipLimit) {
    return { ok: false, message: "This group has no open seats for another invite." };
  }

  return { ok: true };
}

async function findUserIdByEmail(adminSupabase: ReturnType<typeof createAdminClient>, normalizedEmail: string) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

function normalizeRequestedMembershipLimit(value?: number) {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_GROUP_MEMBERSHIP_LIMIT;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeExpiryDays(value?: number) {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_INVITE_EXPIRY_DAYS;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildGroupInviteClaimUrl(token: string) {
  return `${getSiteUrl()}/my-groups?invite=${token}`;
}
