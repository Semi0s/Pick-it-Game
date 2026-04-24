"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email-sender";
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
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
};

type GroupInviteRecord = {
  id: string;
  group_id: string;
  email: string;
  normalized_email: string;
  invited_by_user_id: string | null;
  suggested_display_name?: string | null;
  status: GroupInviteStatus;
  expires_at?: string | null;
  accepted_by_user_id?: string | null;
  accepted_at?: string | null;
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
  created_at: string;
  invited_by?: { name?: string | null; email?: string | null } | Array<{ name?: string | null; email?: string | null }> | null;
};

type GroupMemberRecord = {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  joined_at: string;
  user?: { id: string; name: string; email: string } | Array<{ id: string; name: string; email: string }> | null;
};

type EnqueueEmailJobResult =
  | { ok: true; alreadyQueued: boolean }
  | { ok: false; message: string };

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

export type MyManagedGroup = {
  id: string;
  name: string;
  membershipLimit: number;
  status: GroupStatus;
  memberCount: number;
  pendingInviteCount: number;
  canManage: boolean;
  userRole: "super_admin" | GroupMemberRole | "viewer";
};

export type ManagedGroupMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: GroupMemberRole;
  joinedAt: string;
};

export type ManagedGroupInvite = {
  id: string;
  email: string;
  suggestedDisplayName?: string;
  invitedByLabel?: string;
  status: GroupInviteStatus;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  lastSentAt?: string | null;
  sendAttempts: number;
  lastError?: string | null;
  createdAt: string;
};

export type ManagedGroupDetails = MyManagedGroup & {
  members: ManagedGroupMember[];
  invites: ManagedGroupInvite[];
};

export type FetchMyGroupsResult =
  | {
      ok: true;
      currentUser: {
        userId: string;
        email: string;
        role: PlatformRole;
      };
      managerAccess: {
        enabled: boolean;
        maxGroups?: number;
        maxMembersPerGroup?: number;
      };
      groupAccess: {
        joinedGroupCount: number;
        managedGroupCount: number;
        hasAnyGroups: boolean;
      };
      groups: MyManagedGroup[];
    }
  | {
      ok: false;
      message: string;
    };

export type GroupInvitePreviewResult =
  | {
      ok: true;
      invite: {
        groupId: string;
        groupName: string;
        email: string;
        status: GroupInviteStatus;
        expiresAt: string | null;
      };
    }
  | {
      ok: false;
      message: string;
    };

export type ListManagedGroupPlayersResult =
  | {
      ok: true;
      groups: ManagedGroupDetails[];
    }
  | {
      ok: false;
      message: string;
    };

export type ResendGroupInviteResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CancelGroupInviteResult = ResendGroupInviteResult;
export type RemoveGroupMemberResult = ResendGroupInviteResult;
export type UpdateGroupInviteNameResult = ResendGroupInviteResult;
export type DeleteManagedGroupResult = ResendGroupInviteResult;

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

  console.info("Manager group invite requested.", {
    managerUserId: currentUser.userId,
    groupId: managedGroup.id,
    email: normalizedEmail
  });

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
    console.info("Manager group invite blocked because user is already a member.", {
      managerUserId: currentUser.userId,
      groupId: managedGroup.id,
      email: normalizedEmail
    });
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
    console.info("Manager group invite blocked because a pending invite already exists.", {
      managerUserId: currentUser.userId,
      groupId: managedGroup.id,
      email: normalizedEmail
    });
    return { ok: false, message: "A pending invite already exists for that email in this group." };
  }

  const token = randomBytes(24).toString("hex");
  const tokenHash = hashInviteToken(token);
  const claimUrl = buildGroupInviteClaimUrl(token);
  const expiresAt = new Date(Date.now() + normalizeExpiryDays(input.expiresInDays) * 24 * 60 * 60 * 1000).toISOString();

  console.info("Manager group invite claim link generated.", {
    managerUserId: currentUser.userId,
    groupId: managedGroup.id,
    email: normalizedEmail,
    claimUrl
  });

  const inviterProfile = await getUserLabel(adminSupabase, currentUser.userId);

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

  const enqueueResult = await enqueueGroupInviteEmail(adminSupabase, {
    email: normalizedEmail,
    groupInviteId: data.id,
    groupId: managedGroup.id,
    groupName: managedGroup.name ?? "Group",
    invitedByUserId: currentUser.userId,
    inviterName: inviterProfile.name,
    inviterEmail: inviterProfile.email,
    suggestedDisplayName: input.suggestedDisplayName?.trim() || null,
    claimUrl
  });

  console.info("Manager group invite email enqueue result.", {
    managerUserId: currentUser.userId,
    groupInviteId: data.id,
    groupId: managedGroup.id,
    email: normalizedEmail,
    enqueueResult
  });

  if (!enqueueResult.ok) {
    await markGroupInviteEmailFailure(adminSupabase, data.id, enqueueResult.message);
    revalidatePath("/my-groups");
    return {
      ok: false,
      message: `Group invite saved, but the email could not be queued: ${enqueueResult.message}`
    };
  }

  const workerTriggerResult = await triggerEmailWorkerNow();
  console.info("Manager group invite worker trigger result.", {
    managerUserId: currentUser.userId,
    groupInviteId: data.id,
    groupId: managedGroup.id,
    email: normalizedEmail,
    workerTriggerResult
  });

  revalidatePath("/my-groups");

  return {
    ok: true,
    invite: {
      id: data.id,
      groupId: data.group_id,
      email: data.email,
      status: data.status,
      expiresAt: data.expires_at ?? null
    },
    message:
      !workerTriggerResult.ok
        ? "Group invite email queued. Automatic sending could not be triggered right away, so the worker cron will pick it up shortly."
        : enqueueResult.alreadyQueued
          ? "A matching group invite email is already queued."
          : "Group invite email queued and sending started."
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

export async function listManagedGroupPlayersAction(): Promise<ListManagedGroupPlayersResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  try {
    const adminSupabase = createAdminClient();
    const groups = await fetchManagedGroupDetails(adminSupabase, currentUser.userId, currentUser.role);
    return { ok: true, groups };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load managed group players."
    };
  }
}

export async function resendGroupInviteAction(inviteId: string): Promise<ResendGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedInviteId = inviteId.trim();
  if (!trimmedInviteId) {
    return { ok: false, message: "Invite id is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const invite = await getManagedGroupInvite(adminSupabase, trimmedInviteId, currentUser.userId, currentUser.role);
    if (!invite) {
      return { ok: false, message: "You do not manage that invite." };
    }

    if (invite.status === "accepted") {
      return { ok: false, message: "That invite has already been accepted." };
    }

    const managedGroup = await getManagedGroup(adminSupabase, invite.group_id, currentUser.userId, currentUser.role);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const seatCheck = await ensureGroupHasInviteCapacity(adminSupabase, managedGroup.id, managedGroup.membership_limit, invite.id);
    if (!seatCheck.ok) {
      return seatCheck;
    }

    const freshToken = randomBytes(24).toString("hex");
    const freshTokenHash = hashInviteToken(freshToken);
    const claimUrl = buildGroupInviteClaimUrl(freshToken);
    const refreshedExpiry = new Date(Date.now() + DEFAULT_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const inviterProfile = await getUserLabel(adminSupabase, invite.invited_by_user_id ?? currentUser.userId);

    const { error: updateInviteError } = await adminSupabase
      .from("group_invites")
      .update({
        status: "pending",
        token_hash: freshTokenHash,
        expires_at: refreshedExpiry,
        last_error: null
      })
      .eq("id", invite.id);

    if (updateInviteError) {
      return { ok: false, message: updateInviteError.message };
    }

    const enqueueResult = await enqueueGroupInviteEmail(adminSupabase, {
      email: invite.email,
      groupInviteId: invite.id,
      groupId: invite.group_id,
      groupName: managedGroup.name ?? "Group",
      invitedByUserId: invite.invited_by_user_id ?? currentUser.userId,
      inviterName: inviterProfile.name,
      inviterEmail: inviterProfile.email,
      suggestedDisplayName: invite.suggested_display_name ?? null,
      claimUrl
    });

    if (!enqueueResult.ok) {
      await markGroupInviteEmailFailure(adminSupabase, invite.id, enqueueResult.message);
      return { ok: false, message: `Could not queue the group invite email: ${enqueueResult.message}` };
    }

    const workerTriggerResult = await triggerEmailWorkerNow();
    console.info("Manager resend invite worker trigger result.", {
      managerUserId: currentUser.userId,
      groupInviteId: invite.id,
      groupId: invite.group_id,
      email: invite.email,
      workerTriggerResult
    });

    revalidatePath("/my-groups");
    return {
      ok: true,
      message:
        !workerTriggerResult.ok
          ? "Group invite email queued again. Automatic sending could not be triggered right away, so the worker cron will pick it up shortly."
          : enqueueResult.alreadyQueued
            ? "A matching group invite email is already queued."
            : "Group invite email queued again and sending started."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not resend that invite."
    };
  }
}

export async function cancelGroupInviteAction(inviteId: string): Promise<CancelGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedInviteId = inviteId.trim();
  if (!trimmedInviteId) {
    return { ok: false, message: "Invite id is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const invite = await getManagedGroupInvite(adminSupabase, trimmedInviteId, currentUser.userId, currentUser.role);
    if (!invite) {
      return { ok: false, message: "You do not manage that invite." };
    }

    if (invite.status === "accepted") {
      return { ok: false, message: "Accepted invites cannot be canceled." };
    }

    const { error } = await adminSupabase
      .from("group_invites")
      .update({
        status: "revoked",
        last_error: null
      })
      .eq("id", invite.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    return { ok: true, message: "Group invite canceled." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not cancel that invite."
    };
  }
}

export async function removeGroupMemberAction(groupId: string, userId: string): Promise<RemoveGroupMemberResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  if (!groupId.trim() || !userId.trim()) {
    return { ok: false, message: "A valid group and user are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, groupId.trim(), currentUser.userId, currentUser.role);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { data: membership, error: membershipError } = await adminSupabase
      .from("group_members")
      .select("id,role")
      .eq("group_id", groupId.trim())
      .eq("user_id", userId.trim())
      .maybeSingle();

    if (membershipError) {
      return { ok: false, message: membershipError.message };
    }

    if (!membership) {
      return { ok: false, message: "That player is not in this group anymore." };
    }

    if (membership.role === "manager") {
      return { ok: false, message: "Manager memberships cannot be removed from this screen." };
    }

    const { error } = await adminSupabase
      .from("group_members")
      .delete()
      .eq("id", membership.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    return { ok: true, message: "Player removed from the group." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not remove that player."
    };
  }
}

export async function updateGroupInviteNameAction(inviteId: string, suggestedDisplayName: string): Promise<UpdateGroupInviteNameResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedInviteId = inviteId.trim();
  if (!trimmedInviteId) {
    return { ok: false, message: "Invite id is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const invite = await getManagedGroupInvite(adminSupabase, trimmedInviteId, currentUser.userId, currentUser.role);
    if (!invite) {
      return { ok: false, message: "You do not manage that invite." };
    }

    if (invite.status !== "pending") {
      return { ok: false, message: "Only pending invites can be edited." };
    }

    const { error } = await adminSupabase
      .from("group_invites")
      .update({
        suggested_display_name: suggestedDisplayName.trim() || null
      })
      .eq("id", invite.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    return { ok: true, message: "Suggested display name updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update that invite."
    };
  }
}

export async function deleteManagedGroupAction(groupId: string, confirmationName: string): Promise<DeleteManagedGroupResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  const trimmedConfirmationName = confirmationName.trim();
  if (!trimmedGroupId || !trimmedConfirmationName) {
    return { ok: false, message: "Group id and confirmation name are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser.userId, currentUser.role);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    if (trimmedConfirmationName !== managedGroup.name.trim()) {
      return { ok: false, message: "Type the exact group name before deleting it." };
    }

    const { error } = await adminSupabase
      .from("groups")
      .delete()
      .eq("id", managedGroup.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message: "Group deleted. Players kept their accounts, invites, and predictions."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not delete that group."
    };
  }
}

export async function fetchMyGroupsAction(): Promise<FetchMyGroupsResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  try {
    const adminSupabase = createAdminClient();
    const managerLimits = await getManagerLimits(adminSupabase, currentUser.userId);
    const groups = await fetchManagedGroups(adminSupabase, currentUser.userId, currentUser.role);
    const joinedGroupCount = await getJoinedGroupCount(adminSupabase, currentUser.userId);

    return {
      ok: true,
      currentUser: {
        userId: currentUser.userId,
        email: currentUser.email,
        role: currentUser.role
      },
      managerAccess: currentUser.role === "admin"
        ? {
            enabled: true
          }
        : {
            enabled: Boolean(managerLimits),
            maxGroups: managerLimits?.max_groups,
            maxMembersPerGroup: managerLimits?.max_members_per_group
          },
      groupAccess: {
        joinedGroupCount,
        managedGroupCount: groups.length,
        hasAnyGroups: joinedGroupCount > 0
      },
      groups
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load your groups."
    };
  }
}

export async function fetchGroupInvitePreviewAction(token: string): Promise<GroupInvitePreviewResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false, message: "Invite token is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const tokenHash = hashInviteToken(trimmedToken);
    const { data, error } = await adminSupabase
      .from("group_invites")
      .select("group_id,email,status,expires_at,groups(name)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      return { ok: false, message: error.message };
    }

    if (!data) {
      return { ok: false, message: "That invite could not be found." };
    }

    const groupName =
      Array.isArray(data.groups) ? data.groups[0]?.name :
      (data.groups as { name?: string } | null)?.name;

    return {
      ok: true,
      invite: {
        groupId: data.group_id,
        groupName: groupName ?? "Group",
        email: data.email,
        status: data.status,
        expiresAt: data.expires_at ?? null
      }
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load the invite."
    };
  }
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

async function getJoinedGroupCount(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { count, error } = await adminSupabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function fetchManagedGroups(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  role: PlatformRole
): Promise<MyManagedGroup[]> {
  const { data: groups, error: groupsError } = role === "admin"
    ? await adminSupabase
        .from("groups")
        .select("id,name,membership_limit,status,owner_user_id")
        .order("created_at", { ascending: false })
    : await adminSupabase
        .from("groups")
        .select("id,name,membership_limit,status,owner_user_id")
        .or(`owner_user_id.eq.${userId},id.in.(${await managedGroupIdList(adminSupabase, userId)})`)
        .order("created_at", { ascending: false });

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  const groupRows = (groups ?? []) as Array<{
    id: string;
    name: string;
    membership_limit: number;
    status: GroupStatus;
    owner_user_id?: string | null;
  }>;

  if (groupRows.length === 0) {
    return [];
  }

  const groupIds = groupRows.map((group) => group.id);
  const membershipRoleByGroup = await fetchMembershipRolesByGroup(adminSupabase, userId, groupIds);
  const [memberCounts, pendingInviteCounts] = await Promise.all([
    fetchCountsByGroup(adminSupabase, "group_members", groupIds),
    fetchCountsByGroup(adminSupabase, "group_invites", groupIds, { status: "pending" })
  ]);

  return groupRows.map((group) => ({
    id: group.id,
    name: group.name,
    membershipLimit: group.membership_limit,
    status: group.status,
    memberCount: memberCounts.get(group.id) ?? 0,
    pendingInviteCount: pendingInviteCounts.get(group.id) ?? 0,
    canManage: true,
    userRole:
      role === "admin"
        ? "super_admin"
        : membershipRoleByGroup.get(group.id) === "manager"
          ? "manager"
          : "manager"
  }));
}

async function fetchManagedGroupDetails(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  role: PlatformRole
): Promise<ManagedGroupDetails[]> {
  const groups = await fetchVisibleGroups(adminSupabase, userId, role);
  if (groups.length === 0) {
    return [];
  }

  const groupIds = groups.map((group) => group.id);
  const manageableGroupIds = groups.filter((group) => group.canManage).map((group) => group.id);
  const [memberResult, inviteResult] = await Promise.all([
    adminSupabase
      .from("group_members")
      .select("id,group_id,user_id,role,joined_at,user:users!group_members_user_id_fkey(id,name,email)")
      .in("group_id", groupIds)
      .order("joined_at", { ascending: true }),
    manageableGroupIds.length > 0
      ? adminSupabase
          .from("group_invites")
          .select("id,group_id,email,normalized_email,invited_by_user_id,suggested_display_name,status,expires_at,accepted_by_user_id,accepted_at,last_sent_at,send_attempts,last_error,created_at,invited_by:users!group_invites_invited_by_user_id_fkey(name,email)")
          .in("group_id", manageableGroupIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (memberResult.error) {
    throw new Error(memberResult.error.message);
  }

  if (inviteResult.error) {
    throw new Error(inviteResult.error.message);
  }

  const membersByGroup = new Map<string, ManagedGroupMember[]>();
  for (const row of ((memberResult.data ?? []) as GroupMemberRecord[])) {
    const userRow = Array.isArray(row.user) ? row.user[0] : row.user;
    const list = membersByGroup.get(row.group_id) ?? [];
    list.push({
      membershipId: row.id,
      userId: row.user_id,
      name: userRow?.name ?? "Player",
      email: userRow?.email ?? "",
      role: row.role,
      joinedAt: row.joined_at
    });
    membersByGroup.set(row.group_id, list);
  }

  const invitesByGroup = new Map<string, ManagedGroupInvite[]>();
  for (const row of ((inviteResult.data ?? []) as GroupInviteRecord[])) {
    const inviterRow = Array.isArray(row.invited_by) ? row.invited_by[0] : row.invited_by;
    const list = invitesByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      email: row.email,
      suggestedDisplayName: row.suggested_display_name ?? undefined,
      invitedByLabel: inviterRow?.name ?? inviterRow?.email ?? undefined,
      status: row.status,
      expiresAt: row.expires_at ?? null,
      acceptedAt: row.accepted_at ?? null,
      acceptedByUserId: row.accepted_by_user_id ?? null,
      lastSentAt: row.last_sent_at ?? null,
      sendAttempts: row.send_attempts ?? 0,
      lastError: row.last_error ?? null,
      createdAt: row.created_at
    });
    invitesByGroup.set(row.group_id, list);
  }

  return groups.map((group) => ({
    ...group,
    members: membersByGroup.get(group.id) ?? [],
    invites: invitesByGroup.get(group.id) ?? []
  }));
}

async function fetchVisibleGroups(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  role: PlatformRole
): Promise<MyManagedGroup[]> {
  const membershipGroupIds = await allVisibleGroupIdList(adminSupabase, userId);
  const membershipRoleByGroup = await fetchMembershipRolesByGroup(
    adminSupabase,
    userId,
    membershipGroupIds.length > 0 ? membershipGroupIds : undefined
  );

  const { data: groups, error: groupsError } = role === "admin"
    ? await adminSupabase
        .from("groups")
        .select("id,name,membership_limit,status,owner_user_id")
        .order("created_at", { ascending: false })
    : await adminSupabase
        .from("groups")
        .select("id,name,membership_limit,status,owner_user_id")
        .or(`owner_user_id.eq.${userId},id.in.(${membershipGroupIds.length > 0 ? membershipGroupIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
        .order("created_at", { ascending: false });

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  const groupRows = (groups ?? []) as Array<{
    id: string;
    name: string;
    membership_limit: number;
    status: GroupStatus;
    owner_user_id?: string | null;
  }>;

  if (groupRows.length === 0) {
    return [];
  }

  const groupIds = groupRows.map((group) => group.id);
  const [memberCounts, pendingInviteCounts] = await Promise.all([
    fetchCountsByGroup(adminSupabase, "group_members", groupIds),
    fetchCountsByGroup(adminSupabase, "group_invites", groupIds, { status: "pending" })
  ]);

  return groupRows.map((group) => {
    const membershipRole = membershipRoleByGroup.get(group.id);
    const canManage = role === "admin" || group.owner_user_id === userId || membershipRole === "manager";

    return {
      id: group.id,
      name: group.name,
      membershipLimit: group.membership_limit,
      status: group.status,
      memberCount: memberCounts.get(group.id) ?? 0,
      pendingInviteCount: canManage ? pendingInviteCounts.get(group.id) ?? 0 : 0,
      canManage,
      userRole:
        role === "admin"
          ? "super_admin"
          : membershipRole ?? "viewer"
    };
  });
}

async function managedGroupIdList(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await adminSupabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .eq("role", "manager");

  if (error) {
    throw new Error(error.message);
  }

  const ids = ((data ?? []) as Array<{ group_id: string }>).map((row) => row.group_id);
  return ids.length > 0 ? ids.join(",") : "00000000-0000-0000-0000-000000000000";
}

async function allVisibleGroupIdList(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await adminSupabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{ group_id: string }>).map((row) => row.group_id);
}

async function fetchMembershipRolesByGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  groupIds?: string[]
) {
  let query = adminSupabase
    .from("group_members")
    .select("group_id,role")
    .eq("user_id", userId);

  if (groupIds && groupIds.length > 0) {
    query = query.in("group_id", groupIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const roles = new Map<string, GroupMemberRole>();
  for (const row of ((data ?? []) as Array<{ group_id: string; role: GroupMemberRole }>)) {
    roles.set(row.group_id, row.role);
  }

  return roles;
}

async function fetchCountsByGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  table: "group_members" | "group_invites",
  groupIds: string[],
  filters?: { status?: GroupInviteStatus }
) {
  let query = adminSupabase.from(table).select("group_id");
  query = query.in("group_id", groupIds);
  if (table === "group_invites" && filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const counts = new Map<string, number>();
  for (const row of ((data ?? []) as Array<{ group_id: string }>)) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  return counts;
}

async function getManagedGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  userId: string,
  role: PlatformRole
) {
  const { data, error } = await adminSupabase
    .from("groups")
    .select("id,name,owner_user_id,membership_limit,status")
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
  membershipLimit: number,
  ignoreInviteId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const pendingInviteQuery = adminSupabase
    .from("group_invites")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "pending");

  if (ignoreInviteId) {
    pendingInviteQuery.neq("id", ignoreInviteId);
  }

  const [memberCountResult, pendingInviteCountResult] = await Promise.all([
    adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId),
    pendingInviteQuery
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

async function getManagedGroupInvite(
  adminSupabase: ReturnType<typeof createAdminClient>,
  inviteId: string,
  userId: string,
  role: PlatformRole
) {
  const { data, error } = await adminSupabase
    .from("group_invites")
    .select("id,group_id,email,normalized_email,invited_by_user_id,suggested_display_name,status,expires_at,accepted_by_user_id,accepted_at,last_sent_at,send_attempts,last_error")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const managedGroup = await getManagedGroup(adminSupabase, data.group_id, userId, role);
  return managedGroup ? (data as GroupInviteRow) : null;
}

async function getUserLabel(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("name,email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    name: data?.name ?? null,
    email: data?.email ?? null
  };
}

async function enqueueGroupInviteEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    email: string;
    groupInviteId: string;
    groupId: string;
    groupName: string;
    invitedByUserId: string;
    inviterName?: string | null;
    inviterEmail?: string | null;
    suggestedDisplayName?: string | null;
    claimUrl: string;
  }
): Promise<EnqueueEmailJobResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const { error } = await adminSupabase.from("email_jobs").insert({
    kind: "group_invite_email",
    email: input.email,
    dedupe_key: `group_invite:${input.groupId}:${normalizedEmail}`,
    payload: {
      groupInviteId: input.groupInviteId,
      groupId: input.groupId,
      groupName: input.groupName,
      inviterName: input.inviterName ?? undefined,
      inviterEmail: input.inviterEmail ?? undefined,
      suggestedDisplayName: input.suggestedDisplayName ?? undefined,
      claimUrl: input.claimUrl
    },
    requested_by_admin_id: input.invitedByUserId
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyQueued: true };
    }

    if (isMissingEmailJobsError(error.message)) {
      try {
        await sendGroupInviteEmailInline({
          to: input.email,
          groupName: input.groupName,
          invitedEmail: input.email,
          suggestedDisplayName: input.suggestedDisplayName ?? null,
          inviterName: input.inviterName ?? null,
          inviterEmail: input.inviterEmail ?? null,
          claimUrl: input.claimUrl
        });
        return { ok: true, alreadyQueued: false };
      } catch (inlineError) {
        return {
          ok: false,
          message: inlineError instanceof Error ? inlineError.message : "Could not send the group invite email."
        };
      }
    }

    return { ok: false, message: error.message };
  }

  return { ok: true, alreadyQueued: false };
}

type TriggerEmailWorkerResult =
  | { ok: true; status: number }
  | { ok: false; message: string };

async function triggerEmailWorkerNow(): Promise<TriggerEmailWorkerResult> {
  const secret = process.env.EMAIL_JOB_SECRET ?? process.env.CRON_SECRET;
  const workerUrl = `${getSiteUrl()}/api/email-jobs/process`;

  try {
    const headers: Record<string, string> = {};
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    const response = await fetch(workerUrl, {
      method: "POST",
      headers,
      cache: "no-store"
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return {
        ok: false,
        message: `Worker responded with ${response.status}.${bodyText ? ` ${bodyText}` : ""}`.trim()
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown worker trigger error."
    };
  }
}

async function markGroupInviteEmailFailure(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupInviteId: string,
  message: string
) {
  await adminSupabase
    .from("group_invites")
    .update({
      last_error: message
    })
    .eq("id", groupInviteId);
}

async function sendGroupInviteEmailInline(input: {
  to: string;
  groupName: string;
  invitedEmail: string;
  suggestedDisplayName?: string | null;
  inviterName?: string | null;
  inviterEmail?: string | null;
  claimUrl: string;
}) {
  const inviterLabel = input.inviterName?.trim() || input.inviterEmail?.trim() || "A group manager";
  const subject = `You're invited to join ${input.groupName} on PICK-IT!`;
  const introLine = input.suggestedDisplayName?.trim()
    ? `${inviterLabel} invited ${input.suggestedDisplayName.trim()} (${input.invitedEmail}) to join ${input.groupName}.`
    : `${inviterLabel} invited ${input.invitedEmail} to join ${input.groupName}.`;

  await sendTransactionalEmail({
    to: input.to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h1 style="font-size: 24px; margin-bottom: 16px;">Join ${input.groupName} on PICK-IT!</h1>
        <p style="margin-bottom: 12px;">${introLine}</p>
        <p style="margin-bottom: 12px;">Use the secure claim link below to sign in or create your account, then join the group.</p>
        <p style="margin: 24px 0;">
          <a href="${input.claimUrl}" style="display: inline-block; background: #1f8b4c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">
            Open Group Invite
          </a>
        </p>
        <p style="font-size: 14px; color: #6b7280; word-break: break-all;">${input.claimUrl}</p>
      </div>
    `,
    text: [
      `Join ${input.groupName} on PICK-IT!`,
      "",
      introLine,
      "",
      "Use this secure claim link to sign in or create your account, then join the group:",
      input.claimUrl
    ].join("\n"),
    replyTo: input.inviterEmail?.trim() || undefined
  });
}

function isMissingEmailJobsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("email_jobs") &&
    ((normalized.includes("schema cache")) ||
      (normalized.includes("relation") && normalized.includes("does not exist")) ||
      (normalized.includes("table") && normalized.includes("does not exist")))
  );
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
