"use server";

import { revalidatePath } from "next/cache";
import {
  approveOrganizationBrandingAction,
  disableOrganizationBrandingAction,
  rejectOrganizationBrandingAction
} from "@/app/my-groups/organization-branding-actions";
import { createMediaModerationNotification } from "@/lib/notifications";
import { isMissingRelationError, isMissingStorageBucketError } from "@/lib/schema-safety";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const AVATAR_BUCKET = "avatars";
const GROUP_AVATAR_BUCKET = "group-avatars";
const ORGANIZATION_BRANDING_BUCKET = "organization-branding";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const LEGACY_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

type AdminMediaUserContext =
  | {
      ok: true;
      userId: string;
      accessLevel: "super_admin";
    }
  | {
      ok: false;
      message: string;
    };

export type AdminOrganizationBrandingMediaItem = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  ownerLabel: string;
  status: string;
  reviewNote: string | null;
  updatedAt: string | null;
  draftLogoUrl: string | null;
  draftBackgroundUrl: string | null;
  liveLogoUrl: string | null;
  liveBackgroundUrl: string | null;
};

export type AdminAvatarMediaItem = {
  id: string;
  label: string;
  context: string;
  imageUrl: string;
  updatedAt: string | null;
};

export type AdminMediaAuditItem = {
  id: string;
  action: string;
  actorUserId: string | null;
  targetType: string;
  targetId: string;
  note: string | null;
  createdAt: string;
};

export type FetchAdminMediaReviewResult =
  | {
      ok: true;
      organizationBranding: AdminOrganizationBrandingMediaItem[];
      userAvatars: AdminAvatarMediaItem[];
      groupAvatars: AdminAvatarMediaItem[];
      auditLog: AdminMediaAuditItem[];
    }
  | {
      ok: false;
      message: string;
    };

export type AdminMediaActionResult = { ok: true; message: string } | { ok: false; message: string };

type OrganizationBrandingRow = {
  organization_id: string;
  status: string;
  review_note?: string | null;
  draft_logo_storage_path?: string | null;
  draft_background_storage_path?: string | null;
  live_logo_storage_path?: string | null;
  live_background_storage_path?: string | null;
  updated_at?: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  owner_user_id?: string | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  updated_at?: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  avatar_url?: string | null;
  updated_at?: string | null;
  owner_user_id?: string | null;
};

export async function fetchAdminMediaReviewAction(): Promise<FetchAdminMediaReviewResult> {
  const currentUser = await requireSuperAdmin();
  if (!currentUser.ok) {
    return currentUser;
  }

  try {
    const adminSupabase = createAdminClient();
    const [brandingResult, organizationsResult, usersResult, groupsResult, auditResult] = await Promise.all([
      adminSupabase
        .from("organization_branding")
        .select("organization_id,status,review_note,draft_logo_storage_path,draft_background_storage_path,live_logo_storage_path,live_background_storage_path,updated_at")
        .order("updated_at", { ascending: false }),
      adminSupabase.from("organizations").select("id,name,slug,owner_user_id"),
      adminSupabase
        .from("users")
        .select("id,name,email,avatar_url,updated_at")
        .not("avatar_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(100),
      adminSupabase
        .from("groups")
        .select("id,name,avatar_url,updated_at,owner_user_id")
        .not("avatar_url", "is", null)
        .order("updated_at", { ascending: false })
        .limit(100),
      fetchMediaAuditLog(adminSupabase)
    ]);

    if (brandingResult.error) {
      return { ok: false, message: brandingResult.error.message };
    }
    if (organizationsResult.error) {
      return { ok: false, message: organizationsResult.error.message };
    }
    if (usersResult.error) {
      return { ok: false, message: usersResult.error.message };
    }
    if (groupsResult.error) {
      return { ok: false, message: groupsResult.error.message };
    }

    const organizations = ((organizationsResult.data as OrganizationRow[] | null) ?? []);
    const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
    const ownerIds = Array.from(
      new Set(organizations.map((organization) => organization.owner_user_id).filter(Boolean) as string[])
    );
    const groupOwnerIds = Array.from(
      new Set(((groupsResult.data as GroupRow[] | null) ?? []).map((group) => group.owner_user_id).filter(Boolean) as string[])
    );
    const ownersById = await fetchUsersById(adminSupabase, Array.from(new Set([...ownerIds, ...groupOwnerIds])));

    const organizationBranding = await Promise.all(
      ((brandingResult.data as OrganizationBrandingRow[] | null) ?? []).map(async (branding) => {
        const organization = organizationById.get(branding.organization_id);
        const owner = organization?.owner_user_id ? ownersById.get(organization.owner_user_id) : null;

        return {
          organizationId: branding.organization_id,
          organizationName: organization?.name ?? "Unknown organization",
          organizationSlug: organization?.slug ?? "",
          ownerLabel: owner ? `${owner.name} · ${owner.email}` : "No owner found",
          status: branding.status,
          reviewNote: branding.review_note ?? null,
          updatedAt: branding.updated_at ?? null,
          draftLogoUrl: await createOrganizationSignedUrl(adminSupabase, branding.draft_logo_storage_path ?? null),
          draftBackgroundUrl: await createOrganizationSignedUrl(adminSupabase, branding.draft_background_storage_path ?? null),
          liveLogoUrl: await createOrganizationSignedUrl(adminSupabase, branding.live_logo_storage_path ?? null),
          liveBackgroundUrl: await createOrganizationSignedUrl(adminSupabase, branding.live_background_storage_path ?? null)
        };
      })
    );

    const userAvatars = ((usersResult.data as UserRow[] | null) ?? [])
      .filter((user) => Boolean(user.avatar_url))
      .map((user) => ({
        id: user.id,
        label: user.name || user.email,
        context: user.email,
        imageUrl: user.avatar_url as string,
        updatedAt: user.updated_at ?? null
      }));

    const groupAvatars = ((groupsResult.data as GroupRow[] | null) ?? [])
      .filter((group) => Boolean(group.avatar_url))
      .map((group) => {
        const owner = group.owner_user_id ? ownersById.get(group.owner_user_id) : null;
        return {
          id: group.id,
          label: group.name,
          context: owner ? `Owner: ${owner.name} · ${owner.email}` : "No owner found",
          imageUrl: group.avatar_url as string,
          updatedAt: group.updated_at ?? null
        };
      });

    return {
      ok: true,
      organizationBranding,
      userAvatars,
      groupAvatars,
      auditLog: auditResult
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load media review right now."
    };
  }
}

export async function approveOrganizationBrandingFromMediaAction(organizationId: string): Promise<AdminMediaActionResult> {
  const result = await approveOrganizationBrandingAction({ organizationId });
  return result.ok ? { ok: true, message: result.message } : result;
}

export async function rejectOrganizationBrandingFromMediaAction(
  organizationId: string,
  reason: string
): Promise<AdminMediaActionResult> {
  const result = await rejectOrganizationBrandingAction({ organizationId, reason });
  return result.ok ? { ok: true, message: result.message } : result;
}

export async function disableOrganizationBrandingFromMediaAction(
  organizationId: string,
  reason: string
): Promise<AdminMediaActionResult> {
  const result = await disableOrganizationBrandingAction({ organizationId, reason });
  return result.ok ? { ok: true, message: result.message } : result;
}

export async function removeUserAvatarAsAdminAction(userId: string, note: string): Promise<AdminMediaActionResult> {
  const currentUser = await requireSuperAdmin();
  if (!currentUser.ok) {
    return currentUser;
  }

  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return { ok: false, message: "Choose a valid user." };
  }

  const adminSupabase = createAdminClient();
  const { data: existingUser, error: existingUserError } = await adminSupabase
    .from("users")
    .select("id,avatar_url")
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (existingUserError || !existingUser) {
    return { ok: false, message: existingUserError?.message ?? "That user could not be found." };
  }

  const { error } = await adminSupabase.from("users").update({ avatar_url: null }).eq("id", normalizedUserId);
  if (error) {
    return { ok: false, message: error.message };
  }

  await removeKnownStorageObjects(adminSupabase, AVATAR_BUCKET, normalizedUserId);
  await logMediaModerationAudit(adminSupabase, {
    actorUserId: currentUser.userId,
    action: "user_avatar_removed",
    targetType: "user_avatar",
    targetId: normalizedUserId,
    oldStatus: "active",
    newStatus: "removed",
    note,
    details: {
      previousAvatarUrl: (existingUser as { avatar_url?: string | null }).avatar_url ?? null
    }
  });
  await createMediaModerationNotification({
    adminSupabase,
    recipientUserIds: [normalizedUserId],
    targetType: "profile_avatar",
    targetId: normalizedUserId,
    status: "removed",
    note,
    href: "/profile"
  });

  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/admin/media");
  return { ok: true, message: "User avatar removed." };
}

export async function removeGroupAvatarAsAdminAction(groupId: string, note: string): Promise<AdminMediaActionResult> {
  const currentUser = await requireSuperAdmin();
  if (!currentUser.ok) {
    return currentUser;
  }

  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return { ok: false, message: "Choose a valid group." };
  }

  const adminSupabase = createAdminClient();
  const { data: existingGroup, error: existingGroupError } = await adminSupabase
    .from("groups")
    .select("id,avatar_url,owner_user_id")
    .eq("id", normalizedGroupId)
    .maybeSingle();

  if (existingGroupError || !existingGroup) {
    return { ok: false, message: existingGroupError?.message ?? "That group could not be found." };
  }

  const { error } = await adminSupabase
    .from("groups")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", normalizedGroupId);

  if (error) {
    return { ok: false, message: error.message };
  }

  await removeStoragePrefixObjects(adminSupabase, GROUP_AVATAR_BUCKET, normalizedGroupId);
  await logMediaModerationAudit(adminSupabase, {
    actorUserId: currentUser.userId,
    action: "group_avatar_removed",
    targetType: "group_avatar",
    targetId: normalizedGroupId,
    oldStatus: "active",
    newStatus: "removed",
    note,
    details: {
      previousAvatarUrl: (existingGroup as { avatar_url?: string | null }).avatar_url ?? null
    }
  });
  await createMediaModerationNotification({
    adminSupabase,
    recipientUserIds: await fetchGroupAvatarNotificationRecipients(adminSupabase, normalizedGroupId, (existingGroup as GroupRow).owner_user_id ?? null),
    targetType: "group_avatar",
    targetId: normalizedGroupId,
    status: "removed",
    note,
    href: "/my-groups"
  });

  revalidatePath("/my-groups");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/admin/media");
  return { ok: true, message: "Group avatar reset to default." };
}

async function fetchGroupAvatarNotificationRecipients(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  ownerUserId: string | null
) {
  const recipientIds = new Set<string>();
  if (ownerUserId) {
    recipientIds.add(ownerUserId);
  }

  const { data, error } = await adminSupabase
    .from("group_members")
    .select("user_id,role")
    .eq("group_id", groupId)
    .eq("role", "manager");

  if (error) {
    console.warn("Could not fetch group avatar moderation notification recipients.", {
      groupId,
      message: error.message
    });
    return Array.from(recipientIds);
  }

  for (const member of ((data as Array<{ user_id?: string | null; role?: string | null }> | null) ?? [])) {
    if (member.user_id) {
      recipientIds.add(member.user_id);
    }
  }

  return Array.from(recipientIds);
}

async function requireSuperAdmin(): Promise<AdminMediaUserContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in as a Super Admin." };
  }

  const { data, error } = await supabase.from("users").select("id,role").eq("id", user.id).maybeSingle();
  if (error || !data || (data as { role?: string | null }).role !== "admin") {
    return { ok: false, message: "Only Super Admins can manage the global media queue." };
  }

  return {
    ok: true,
    userId: user.id,
    accessLevel: "super_admin"
  };
}

async function fetchUsersById(adminSupabase: ReturnType<typeof createAdminClient>, userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, { id: string; name: string; email: string }>();
  }

  const { data, error } = await adminSupabase.from("users").select("id,name,email").in("id", userIds);
  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data as Array<{ id: string; name: string; email: string }> | null) ?? []).map((user) => [user.id, user]));
}

async function createOrganizationSignedUrl(
  adminSupabase: ReturnType<typeof createAdminClient>,
  storagePath: string | null
) {
  if (!storagePath) {
    return null;
  }

  const { data, error } = await adminSupabase.storage
    .from(ORGANIZATION_BRANDING_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

async function removeKnownStorageObjects(
  adminSupabase: ReturnType<typeof createAdminClient>,
  bucket: string,
  baseName: string
) {
  const paths = LEGACY_IMAGE_EXTENSIONS.map((extension) => `${baseName}.${extension}`);
  const { error } = await adminSupabase.storage.from(bucket).remove(paths);
  if (error && !error.message.toLowerCase().includes("not found") && !isMissingStorageBucketError(error.message, bucket)) {
    console.warn("Could not remove media storage objects.", { bucket, baseName, message: error.message });
  }
}

async function removeStoragePrefixObjects(
  adminSupabase: ReturnType<typeof createAdminClient>,
  bucket: string,
  prefix: string
) {
  const { data, error } = await adminSupabase.storage.from(bucket).list(prefix, { limit: 100 });
  if (error) {
    if (!isMissingStorageBucketError(error.message, bucket)) {
      console.warn("Could not list media storage objects.", { bucket, prefix, message: error.message });
    }
    return;
  }

  const paths = (data ?? []).map((item) => `${prefix}/${item.name}`);
  if (paths.length === 0) {
    return;
  }

  const { error: removeError } = await adminSupabase.storage.from(bucket).remove(paths);
  if (removeError && !removeError.message.toLowerCase().includes("not found")) {
    console.warn("Could not remove media storage prefix objects.", { bucket, prefix, message: removeError.message });
  }
}

async function fetchMediaAuditLog(adminSupabase: ReturnType<typeof createAdminClient>): Promise<AdminMediaAuditItem[]> {
  const { data, error } = await adminSupabase
    .from("media_moderation_audit_log")
    .select("id,action,actor_user_id,target_type,target_id,note,created_at")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    if (isMissingRelationError(error.message, "media_moderation_audit_log")) {
      return [];
    }
    throw new Error(error.message);
  }

  return ((data as Array<{
    id: string;
    action: string;
    actor_user_id?: string | null;
    target_type: string;
    target_id: string;
    note?: string | null;
    created_at: string;
  }> | null) ?? []).map((entry) => ({
    id: entry.id,
    action: entry.action,
    actorUserId: entry.actor_user_id ?? null,
    targetType: entry.target_type,
    targetId: entry.target_id,
    note: entry.note ?? null,
    createdAt: entry.created_at
  }));
}

async function logMediaModerationAudit(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    oldStatus: string;
    newStatus: string;
    note?: string;
    details?: Record<string, unknown>;
  }
) {
  const { error } = await adminSupabase.from("media_moderation_audit_log").insert({
    actor_user_id: input.actorUserId,
    actor_access_level: "super_admin",
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    old_status: input.oldStatus,
    new_status: input.newStatus,
    note: input.note?.trim() || null,
    details: input.details ?? {}
  });

  if (error && !isMissingRelationError(error.message, "media_moderation_audit_log")) {
    console.warn("Could not write media moderation audit log.", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      message: error.message
    });
  }
}
