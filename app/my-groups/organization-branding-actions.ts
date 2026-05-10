"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ORGANIZATION_BRANDING_BUCKET,
  ORGANIZATION_REVIEW_NOTE_MAX_LENGTH,
  ORGANIZATION_SPONSOR_MESSAGE_MAX_LENGTH,
  ORGANIZATION_WELCOME_HEADLINE_MAX_LENGTH,
  ORGANIZATION_WELCOME_MESSAGE_MAX_LENGTH,
  buildOrganizationBrandingObjectPath,
  canEditOrganizationBranding,
  canModerateOrganizationBranding,
  getDefaultOrganizationSponsorMessage,
  getDefaultOrganizationWelcomeHeadline,
  getDefaultOrganizationWelcomeMessage,
  normalizeOrganizationPlainText,
  slugifyOrganizationName,
  validateOrganizationBrandingUpload,
  type OrganizationBrandingAssetKind,
  type OrganizationBrandingEditorState,
  type OrganizationBrandingSnapshot,
  type OrganizationBrandingStatus,
  type OrganizationPortalView
} from "@/lib/organization-branding";
import {
  normalizeCommercialTier,
  resolveTierAccess,
  type AccessLevel,
  type CommercialTier,
  type PlatformRole
} from "@/lib/tier-access";

type CurrentBrandingUserContext =
  | {
      ok: true;
      userId: string;
      name: string;
      email: string;
      role: PlatformRole;
      accessLevel: AccessLevel;
      planTier: CommercialTier | null;
    }
  | {
      ok: false;
      message: string;
    };

type OrganizationRow = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
};

type OrganizationBrandingRow = {
  organization_id: string;
  status: OrganizationBrandingStatus;
  review_note: string | null;
  draft_logo_storage_path: string | null;
  draft_background_storage_path: string | null;
  draft_welcome_headline: string | null;
  draft_welcome_message: string | null;
  draft_sponsor_prize_message: string | null;
  live_logo_storage_path: string | null;
  live_background_storage_path: string | null;
  live_welcome_headline: string | null;
  live_welcome_message: string | null;
  live_sponsor_prize_message: string | null;
};

type OrganizationOption = {
  id: string;
  name: string;
  slug: string;
};

export type FetchOrganizationBrandingWorkspaceResult =
  | {
      ok: true;
      organizations: OrganizationOption[];
      selectedOrganizationId: string | null;
      organization: OrganizationBrandingEditorState | null;
      canModerate: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export type UpdateOrganizationBrandingResult =
  | {
      ok: true;
      organization: OrganizationBrandingEditorState;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

type SaveOrganizationBrandingCopyInput = {
  organizationId: string;
  welcomeHeadline: string;
  welcomeMessage: string;
  sponsorPrizeMessage: string;
};

type ReviewOrganizationBrandingInput = {
  organizationId: string;
  reason?: string;
};

type OrganizationBrandingAssetFormField = "logo" | "background";

const ORGANIZATION_BRANDING_SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function fetchOrganizationBrandingWorkspaceAction(
  selectedOrganizationId?: string | null
): Promise<FetchOrganizationBrandingWorkspaceResult> {
  const currentUser = await getCurrentBrandingUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  if (!canEditOrganizationBranding(currentUser.accessLevel)) {
    return { ok: false, message: "Organization branding is only available to Managing Directors and Super Admins." };
  }

  try {
    const adminSupabase = createAdminClient();
    const organizations = await loadAccessibleOrganizations(adminSupabase, currentUser);
    const selectedOrganization =
      organizations.find((organization) => organization.id === (selectedOrganizationId ?? "")) ?? organizations[0] ?? null;

    if (!selectedOrganization) {
      return {
        ok: true,
        organizations: [],
        selectedOrganizationId: null,
        organization: null,
        canModerate: canModerateOrganizationBranding(currentUser.accessLevel)
      };
    }

    const branding = await ensureOrganizationBrandingRow(adminSupabase, selectedOrganization.id);
    const organization = await buildOrganizationBrandingEditorState(adminSupabase, selectedOrganization, branding);

    return {
      ok: true,
      organizations: organizations.map(({ id, name, slug }) => ({ id, name, slug })),
      selectedOrganizationId: selectedOrganization.id,
      organization,
      canModerate: canModerateOrganizationBranding(currentUser.accessLevel)
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load organization branding right now."
    };
  }
}

export async function saveOrganizationBrandingCopyAction(
  input: SaveOrganizationBrandingCopyInput
): Promise<UpdateOrganizationBrandingResult> {
  const context = await requireOrganizationBrandingAccess(input.organizationId);
  if (!context.ok) {
    return context;
  }

  const welcomeHeadline = normalizeOrganizationPlainText(
    input.welcomeHeadline,
    ORGANIZATION_WELCOME_HEADLINE_MAX_LENGTH
  );
  const welcomeMessage = normalizeOrganizationPlainText(
    input.welcomeMessage,
    ORGANIZATION_WELCOME_MESSAGE_MAX_LENGTH
  );
  const sponsorPrizeMessage = normalizeOrganizationPlainText(
    input.sponsorPrizeMessage,
    ORGANIZATION_SPONSOR_MESSAGE_MAX_LENGTH
  );

  try {
    const { adminSupabase, organization, branding, currentUser } = context;
    const nextStatus = nextEditableBrandingStatus(branding.status);

    const { error } = await adminSupabase
      .from("organization_branding")
      .update({
        draft_welcome_headline: welcomeHeadline || null,
        draft_welcome_message: welcomeMessage || null,
        draft_sponsor_prize_message: sponsorPrizeMessage || null,
        status: nextStatus,
        review_note: nextStatus === "draft" ? null : branding.review_note
      })
      .eq("organization_id", organization.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: "copy_saved",
      details: {
        status: nextStatus
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: "Branding copy saved as a draft."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save organization branding copy."
    };
  }
}

export async function submitOrganizationBrandingForReviewAction(
  organizationId: string
): Promise<UpdateOrganizationBrandingResult> {
  const context = await requireOrganizationBrandingAccess(organizationId);
  if (!context.ok) {
    return context;
  }

  try {
    const { adminSupabase, organization, branding, currentUser } = context;
    const { error } = await adminSupabase
      .from("organization_branding")
      .update({
        status: "pending_review",
        review_note: null
      })
      .eq("organization_id", organization.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: "submitted_for_review",
      details: {
        previousStatus: branding.status
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: "Branding submitted for review."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not submit organization branding for review."
    };
  }
}

export async function uploadOrganizationBrandingAssetAction(
  formData: FormData
): Promise<UpdateOrganizationBrandingResult> {
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const assetKind = String(formData.get("assetKind") ?? "").trim() as OrganizationBrandingAssetFormField;
  const file = formData.get("file");

  if (assetKind !== "logo" && assetKind !== "background") {
    return { ok: false, message: "Choose whether you are updating the logo or the background." };
  }

  if (!(file instanceof File)) {
    return { ok: false, message: "Choose an image file first." };
  }

  const context = await requireOrganizationBrandingAccess(organizationId);
  if (!context.ok) {
    return context;
  }

  try {
    const validation = await validateOrganizationBrandingUpload(file, assetKind);
    if (!validation.ok) {
      return validation;
    }

    const { adminSupabase, organization, branding, currentUser } = context;
    const objectPath = buildOrganizationBrandingObjectPath(
      organization.id,
      assetKind,
      "preview",
      validation.value.extension
    );

    const { error: uploadError } = await adminSupabase.storage
      .from(ORGANIZATION_BRANDING_BUCKET)
      .upload(objectPath, validation.value.bytes, {
        upsert: false,
        contentType: validation.value.mimeType,
        cacheControl: "3600"
      });

    if (uploadError) {
      return { ok: false, message: uploadError.message };
    }

    const existingDraftPath =
      assetKind === "logo" ? branding.draft_logo_storage_path : branding.draft_background_storage_path;
    const existingLivePath =
      assetKind === "logo" ? branding.live_logo_storage_path : branding.live_background_storage_path;

    if (existingDraftPath && existingDraftPath !== existingLivePath) {
      await removeOrganizationStorageObject(adminSupabase, existingDraftPath);
    }

    // TODO(launch): insert automated image moderation here before allowing submit-for-review or approval.
    const { error: updateError } = await adminSupabase
      .from("organization_branding")
      .update({
        [assetKind === "logo" ? "draft_logo_storage_path" : "draft_background_storage_path"]: objectPath,
        status: nextEditableBrandingStatus(branding.status),
        review_note: null
      })
      .eq("organization_id", organization.id);

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: `${assetKind}_uploaded`,
      details: {
        status: nextEditableBrandingStatus(branding.status),
        mimeType: validation.value.mimeType,
        width: validation.value.width,
        height: validation.value.height,
        size: file.size
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: assetKind === "logo" ? "Logo draft updated." : "Background draft updated."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not upload the organization branding image."
    };
  }
}

export async function removeOrganizationBrandingAssetAction(
  organizationId: string,
  assetKind: OrganizationBrandingAssetKind
): Promise<UpdateOrganizationBrandingResult> {
  const context = await requireOrganizationBrandingAccess(organizationId);
  if (!context.ok) {
    return context;
  }

  try {
    const { adminSupabase, organization, branding, currentUser } = context;
    const existingDraftPath =
      assetKind === "logo" ? branding.draft_logo_storage_path : branding.draft_background_storage_path;
    const existingLivePath =
      assetKind === "logo" ? branding.live_logo_storage_path : branding.live_background_storage_path;

    if (existingDraftPath && existingDraftPath !== existingLivePath) {
      await removeOrganizationStorageObject(adminSupabase, existingDraftPath);
    }

    const { error } = await adminSupabase
      .from("organization_branding")
      .update({
        [assetKind === "logo" ? "draft_logo_storage_path" : "draft_background_storage_path"]: null,
        status: nextEditableBrandingStatus(branding.status),
        review_note: null
      })
      .eq("organization_id", organization.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: `${assetKind}_removed`,
      details: {
        status: nextEditableBrandingStatus(branding.status)
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: assetKind === "logo" ? "Logo removed from the draft." : "Background removed from the draft."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not remove the organization branding image."
    };
  }
}

export async function approveOrganizationBrandingAction(
  input: ReviewOrganizationBrandingInput
): Promise<UpdateOrganizationBrandingResult> {
  const context = await requireOrganizationBrandingModeration(input.organizationId);
  if (!context.ok) {
    return context;
  }

  try {
    const { adminSupabase, organization, branding, currentUser } = context;
    const liveLogoStoragePath = await publishOrganizationAsset(adminSupabase, organization.id, "logo", branding);
    const liveBackgroundStoragePath = await publishOrganizationAsset(adminSupabase, organization.id, "background", branding);

    if (!liveLogoStoragePath && branding.live_logo_storage_path) {
      await removeOrganizationStorageObject(adminSupabase, branding.live_logo_storage_path);
    }

    if (!liveBackgroundStoragePath && branding.live_background_storage_path) {
      await removeOrganizationStorageObject(adminSupabase, branding.live_background_storage_path);
    }

    const { error } = await adminSupabase
      .from("organization_branding")
      .update({
        status: "approved",
        review_note: null,
        reviewed_by_user_id: currentUser.userId,
        reviewed_at: new Date().toISOString(),
        disabled_by_user_id: null,
        disabled_at: null,
        live_updated_at: new Date().toISOString(),
        live_logo_storage_path: liveLogoStoragePath,
        live_background_storage_path: liveBackgroundStoragePath,
        live_welcome_headline: normalizedDraftValue(
          branding.draft_welcome_headline,
          getDefaultOrganizationWelcomeHeadline(organization.name)
        ),
        live_welcome_message: normalizedDraftValue(
          branding.draft_welcome_message,
          getDefaultOrganizationWelcomeMessage()
        ),
        live_sponsor_prize_message: normalizedDraftValue(
          branding.draft_sponsor_prize_message,
          getDefaultOrganizationSponsorMessage()
        )
      })
      .eq("organization_id", organization.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: "approved",
      details: {
        previousStatus: branding.status
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: "Organization branding approved."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not approve organization branding."
    };
  }
}

export async function rejectOrganizationBrandingAction(
  input: ReviewOrganizationBrandingInput
): Promise<UpdateOrganizationBrandingResult> {
  const context = await requireOrganizationBrandingModeration(input.organizationId);
  if (!context.ok) {
    return context;
  }

  const reason = normalizeOrganizationPlainText(input.reason ?? "", ORGANIZATION_REVIEW_NOTE_MAX_LENGTH);
  if (!reason) {
    return { ok: false, message: "Add a short reason before rejecting branding." };
  }

  try {
    const { adminSupabase, organization, branding, currentUser } = context;
    const { error } = await adminSupabase
      .from("organization_branding")
      .update({
        status: "rejected",
        review_note: reason,
        reviewed_by_user_id: currentUser.userId,
        reviewed_at: new Date().toISOString()
      })
      .eq("organization_id", organization.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: "rejected",
      details: {
        previousStatus: branding.status,
        reason
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: "Organization branding rejected."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not reject organization branding."
    };
  }
}

export async function disableOrganizationBrandingAction(
  input: ReviewOrganizationBrandingInput
): Promise<UpdateOrganizationBrandingResult> {
  const context = await requireOrganizationBrandingModeration(input.organizationId);
  if (!context.ok) {
    return context;
  }

  const reason = normalizeOrganizationPlainText(input.reason ?? "", ORGANIZATION_REVIEW_NOTE_MAX_LENGTH);

  try {
    const { adminSupabase, organization, branding, currentUser } = context;
    const { error } = await adminSupabase
      .from("organization_branding")
      .update({
        status: "disabled",
        review_note: reason || "Branding has been disabled by a Super Admin.",
        reviewed_by_user_id: currentUser.userId,
        reviewed_at: new Date().toISOString(),
        disabled_by_user_id: currentUser.userId,
        disabled_at: new Date().toISOString()
      })
      .eq("organization_id", organization.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: "disabled",
      details: {
        previousStatus: branding.status,
        reason: reason || null
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: "Organization branding disabled."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not disable organization branding."
    };
  }
}

export async function revertOrganizationBrandingAction(
  organizationId: string
): Promise<UpdateOrganizationBrandingResult> {
  const context = await requireOrganizationBrandingModeration(organizationId);
  if (!context.ok) {
    return context;
  }

  try {
    const { adminSupabase, organization, branding, currentUser } = context;
    const hasLiveBranding = Boolean(
      branding.live_logo_storage_path ||
        branding.live_background_storage_path ||
        branding.live_welcome_headline ||
        branding.live_welcome_message ||
        branding.live_sponsor_prize_message
    );

    const { error } = await adminSupabase
      .from("organization_branding")
      .update({
        status: hasLiveBranding ? "approved" : "draft",
        review_note: null,
        disabled_by_user_id: null,
        disabled_at: null,
        draft_logo_storage_path: branding.live_logo_storage_path,
        draft_background_storage_path: branding.live_background_storage_path,
        draft_welcome_headline: branding.live_welcome_headline,
        draft_welcome_message: branding.live_welcome_message,
        draft_sponsor_prize_message: branding.live_sponsor_prize_message
      })
      .eq("organization_id", organization.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    await logOrganizationBrandingAudit(adminSupabase, {
      organizationId: organization.id,
      actorUserId: currentUser.userId,
      action: "reverted",
      details: {
        previousStatus: branding.status
      }
    });

    const refreshedBranding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
    const editorState = await buildOrganizationBrandingEditorState(adminSupabase, organization, refreshedBranding);
    revalidateOrganizationBrandingPaths(organization.slug);

    return {
      ok: true,
      organization: editorState,
      message: "Branding reverted to the current live version."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not revert organization branding."
    };
  }
}

async function getCurrentBrandingUserContext(): Promise<CurrentBrandingUserContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return { ok: false, message: "You must be signed in to manage organization branding." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id,name,email,role,plan_tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, message: "Your player profile could not be loaded." };
  }

  const tierAccess = resolveTierAccess({
    role: profile.role,
    planTier: profile.plan_tier ?? null,
    managerLimits: null
  });

  return {
    ok: true,
    userId: profile.id,
    name: profile.name ?? profile.email,
    email: profile.email,
    role: profile.role,
    accessLevel: tierAccess.accessLevel,
    planTier: normalizeCommercialTier(profile.plan_tier ?? null)
  };
}

async function loadAccessibleOrganizations(
  adminSupabase: ReturnType<typeof createAdminClient>,
  currentUser: Extract<CurrentBrandingUserContext, { ok: true }>
) {
  if (currentUser.accessLevel === "managing_director") {
    const ownedOrganization = await ensureOwnedOrganization(adminSupabase, currentUser);
    return [ownedOrganization];
  }

  const { data, error } = await adminSupabase
    .from("organizations")
    .select("id,owner_user_id,name,slug")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as OrganizationRow[] | null) ?? []).filter(Boolean);
}

async function ensureOwnedOrganization(
  adminSupabase: ReturnType<typeof createAdminClient>,
  currentUser: Extract<CurrentBrandingUserContext, { ok: true }>
) {
  const { data: existingOrganization, error: existingOrganizationError } = await adminSupabase
    .from("organizations")
    .select("id,owner_user_id,name,slug")
    .eq("owner_user_id", currentUser.userId)
    .maybeSingle();

  if (existingOrganizationError) {
    throw new Error(existingOrganizationError.message);
  }

  if (existingOrganization) {
    return existingOrganization as OrganizationRow;
  }

  const baseName = `${currentUser.name.trim() || currentUser.email.split("@")[0]}'s Portal`;
  const uniqueSlug = await generateUniqueOrganizationSlug(adminSupabase, baseName);
  const { data: insertedOrganization, error: insertOrganizationError } = await adminSupabase
    .from("organizations")
    .insert({
      owner_user_id: currentUser.userId,
      name: baseName,
      slug: uniqueSlug
    })
    .select("id,owner_user_id,name,slug")
    .single();

  if (insertOrganizationError || !insertedOrganization) {
    throw new Error(insertOrganizationError?.message ?? "Could not create the default organization.");
  }

  await logOrganizationBrandingAudit(adminSupabase, {
    organizationId: insertedOrganization.id,
    actorUserId: currentUser.userId,
    action: "organization_created",
    details: {
      slug: insertedOrganization.slug
    }
  });

  return insertedOrganization as OrganizationRow;
}

async function generateUniqueOrganizationSlug(
  adminSupabase: ReturnType<typeof createAdminClient>,
  baseName: string
) {
  const baseSlug = slugifyOrganizationName(baseName);
  let slug = baseSlug;
  let counter = 1;

  while (counter <= 20) {
    const { data, error } = await adminSupabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return slug;
    }

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  return `${baseSlug}-${Date.now().toString().slice(-6)}`;
}

async function ensureOrganizationBrandingRow(
  adminSupabase: ReturnType<typeof createAdminClient>,
  organizationId: string
) {
  const { data, error } = await adminSupabase
    .from("organization_branding")
    .select(
      "organization_id,status,review_note,draft_logo_storage_path,draft_background_storage_path,draft_welcome_headline,draft_welcome_message,draft_sponsor_prize_message,live_logo_storage_path,live_background_storage_path,live_welcome_headline,live_welcome_message,live_sponsor_prize_message"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data as OrganizationBrandingRow;
  }

  const { data: insertedRow, error: insertError } = await adminSupabase
    .from("organization_branding")
    .insert({
      organization_id: organizationId
    })
    .select(
      "organization_id,status,review_note,draft_logo_storage_path,draft_background_storage_path,draft_welcome_headline,draft_welcome_message,draft_sponsor_prize_message,live_logo_storage_path,live_background_storage_path,live_welcome_headline,live_welcome_message,live_sponsor_prize_message"
    )
    .single();

  if (insertError || !insertedRow) {
    throw new Error(insertError?.message ?? "Could not initialize organization branding.");
  }

  return insertedRow as OrganizationBrandingRow;
}

async function buildOrganizationBrandingEditorState(
  adminSupabase: ReturnType<typeof createAdminClient>,
  organization: OrganizationRow,
  branding: OrganizationBrandingRow
): Promise<OrganizationBrandingEditorState> {
  const liveSnapshot = await buildOrganizationBrandingSnapshot(adminSupabase, organization, branding, "live");
  const previewSnapshot = await buildOrganizationBrandingSnapshot(adminSupabase, organization, branding, "preview");

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    status: branding.status,
    reviewNote: branding.review_note,
    welcomeHeadline: previewSnapshot.welcomeHeadline ?? getDefaultOrganizationWelcomeHeadline(organization.name),
    welcomeMessage: previewSnapshot.welcomeMessage ?? getDefaultOrganizationWelcomeMessage(),
    sponsorPrizeMessage: previewSnapshot.sponsorPrizeMessage ?? "",
    logo: previewSnapshot.logo,
    background: previewSnapshot.background,
    live: liveSnapshot,
    previewPath: `/o/${organization.slug}?preview=1`
  };
}

export async function buildOrganizationBrandingSnapshot(
  adminSupabase: ReturnType<typeof createAdminClient>,
  organization: OrganizationRow,
  branding: OrganizationBrandingRow,
  view: OrganizationPortalView
): Promise<OrganizationBrandingSnapshot> {
  const usePreviewDraft = view === "preview";
  const logoPath = usePreviewDraft
    ? branding.draft_logo_storage_path ?? branding.live_logo_storage_path
    : branding.status === "disabled"
      ? null
      : branding.live_logo_storage_path;
  const backgroundPath = usePreviewDraft
    ? branding.draft_background_storage_path ?? branding.live_background_storage_path
    : branding.status === "disabled"
      ? null
      : branding.live_background_storage_path;
  const welcomeHeadline = usePreviewDraft
    ? normalizedDraftValue(branding.draft_welcome_headline, branding.live_welcome_headline)
    : branding.status === "disabled"
      ? null
      : branding.live_welcome_headline;
  const welcomeMessage = usePreviewDraft
    ? normalizedDraftValue(branding.draft_welcome_message, branding.live_welcome_message)
    : branding.status === "disabled"
      ? null
      : branding.live_welcome_message;
  const sponsorPrizeMessage = usePreviewDraft
    ? normalizedDraftValue(branding.draft_sponsor_prize_message, branding.live_sponsor_prize_message)
    : branding.status === "disabled"
      ? null
      : branding.live_sponsor_prize_message;

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    status: branding.status,
    reviewNote: branding.review_note,
    welcomeHeadline: welcomeHeadline ?? getDefaultOrganizationWelcomeHeadline(organization.name),
    welcomeMessage: welcomeMessage ?? getDefaultOrganizationWelcomeMessage(),
    sponsorPrizeMessage: sponsorPrizeMessage ?? getDefaultOrganizationSponsorMessage(),
    logo: {
      storagePath: logoPath,
      signedUrl: logoPath ? await createOrganizationSignedUrl(adminSupabase, logoPath) : null
    },
    background: {
      storagePath: backgroundPath,
      signedUrl: backgroundPath ? await createOrganizationSignedUrl(adminSupabase, backgroundPath) : null
    }
  };
}

async function createOrganizationSignedUrl(
  adminSupabase: ReturnType<typeof createAdminClient>,
  storagePath: string
) {
  const { data, error } = await adminSupabase.storage
    .from(ORGANIZATION_BRANDING_BUCKET)
    .createSignedUrl(storagePath, ORGANIZATION_BRANDING_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn("Could not create organization branding signed URL.", {
      storagePath,
      message: error.message
    });
    return null;
  }

  return data.signedUrl;
}

async function requireOrganizationBrandingAccess(organizationId: string) {
  const currentUser = await getCurrentBrandingUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  if (!canEditOrganizationBranding(currentUser.accessLevel)) {
    return { ok: false as const, message: "You do not have access to organization branding settings." };
  }

  const adminSupabase = createAdminClient();
  const organization = await getAccessibleOrganizationById(adminSupabase, currentUser, organizationId);
  if (!organization) {
    return { ok: false as const, message: "That organization is not available in your scope." };
  }

  const branding = await ensureOrganizationBrandingRow(adminSupabase, organization.id);
  return {
    ok: true as const,
    adminSupabase,
    currentUser,
    organization,
    branding
  };
}

async function requireOrganizationBrandingModeration(organizationId: string) {
  const context = await requireOrganizationBrandingAccess(organizationId);
  if (!context.ok) {
    return context;
  }

  if (!canModerateOrganizationBranding(context.currentUser.accessLevel)) {
    return { ok: false as const, message: "Only Super Admins can moderate organization branding." };
  }

  return context;
}

async function getAccessibleOrganizationById(
  adminSupabase: ReturnType<typeof createAdminClient>,
  currentUser: Extract<CurrentBrandingUserContext, { ok: true }>,
  organizationId: string
) {
  if (currentUser.accessLevel === "managing_director") {
    const ownedOrganization = await ensureOwnedOrganization(adminSupabase, currentUser);
    return ownedOrganization.id === organizationId ? ownedOrganization : null;
  }

  const { data, error } = await adminSupabase
    .from("organizations")
    .select("id,owner_user_id,name,slug")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as OrganizationRow | null) ?? null;
}

async function publishOrganizationAsset(
  adminSupabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  assetKind: OrganizationBrandingAssetKind,
  branding: OrganizationBrandingRow
) {
  const draftPath =
    assetKind === "logo" ? branding.draft_logo_storage_path : branding.draft_background_storage_path;
  const livePath =
    assetKind === "logo" ? branding.live_logo_storage_path : branding.live_background_storage_path;

  if (!draftPath) {
    return null;
  }

  if (draftPath === livePath) {
    return livePath;
  }

  const { data: downloadData, error: downloadError } = await adminSupabase.storage
    .from(ORGANIZATION_BRANDING_BUCKET)
    .download(draftPath);

  if (downloadError || !downloadData) {
    throw new Error(downloadError?.message ?? "Could not publish the draft branding asset.");
  }

  const extension = draftPath.split(".").pop()?.toLowerCase() === "png"
    ? "png"
    : draftPath.split(".").pop()?.toLowerCase() === "webp"
      ? "webp"
      : "jpg";
  const nextLivePath = buildOrganizationBrandingObjectPath(organizationId, assetKind, "live", extension);
  const uploadBytes = Buffer.from(await downloadData.arrayBuffer());
  const { error: uploadError } = await adminSupabase.storage
    .from(ORGANIZATION_BRANDING_BUCKET)
    .upload(nextLivePath, uploadBytes, {
      upsert: false,
      contentType:
        extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg",
      cacheControl: "3600"
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  if (livePath && livePath !== draftPath) {
    await removeOrganizationStorageObject(adminSupabase, livePath);
  }

  return nextLivePath;
}

async function removeOrganizationStorageObject(
  adminSupabase: ReturnType<typeof createAdminClient>,
  storagePath: string
) {
  const { error } = await adminSupabase.storage.from(ORGANIZATION_BRANDING_BUCKET).remove([storagePath]);
  if (error && !error.message.toLowerCase().includes("not found")) {
    console.warn("Could not remove organization branding object.", {
      storagePath,
      message: error.message
    });
  }
}

async function logOrganizationBrandingAudit(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    organizationId: string;
    actorUserId: string | null;
    action: string;
    details?: Record<string, unknown>;
  }
) {
  const { error } = await adminSupabase.from("organization_branding_audit_log").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    action: input.action,
    details: input.details ?? {}
  });

  if (error) {
    console.warn("Could not write organization branding audit log.", {
      organizationId: input.organizationId,
      action: input.action,
      message: error.message
    });
  }
}

function revalidateOrganizationBrandingPaths(organizationSlug: string) {
  revalidatePath("/my-groups");
  revalidatePath(`/o/${organizationSlug}`);
}

function nextEditableBrandingStatus(currentStatus: OrganizationBrandingStatus): OrganizationBrandingStatus {
  if (currentStatus === "approved" || currentStatus === "rejected" || currentStatus === "disabled") {
    return "draft";
  }

  return currentStatus === "pending_review" ? "draft" : currentStatus;
}

function normalizedDraftValue(draftValue: string | null, fallbackValue: string | null) {
  const trimmedDraftValue = draftValue?.trim() ?? "";
  if (trimmedDraftValue) {
    return trimmedDraftValue;
  }

  const trimmedFallbackValue = fallbackValue?.trim() ?? "";
  return trimmedFallbackValue || null;
}
