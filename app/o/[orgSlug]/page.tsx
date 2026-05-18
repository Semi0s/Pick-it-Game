import { notFound } from "next/navigation";
import { OrganizationPortalPreview } from "@/components/OrganizationPortalPreview";
import {
  getDefaultOrganizationSponsorMessage,
  getDefaultOrganizationWelcomeHeadline,
  getDefaultOrganizationWelcomeMessage,
  type OrganizationBrandingStatus
} from "@/lib/organization-branding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveTierAccess } from "@/lib/tier-access";

type OrganizationRow = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
};

type OrganizationBrandingRow = {
  status: OrganizationBrandingStatus;
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

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export default async function OrganizationPortalPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams?: Promise<{ preview?: string }>;
}) {
  const { orgSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const adminSupabase = createAdminClient();
  const { data: organizationData, error: organizationError } = await adminSupabase
    .from("organizations")
    .select("id,owner_user_id,name,slug")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (organizationError) {
    throw new Error(organizationError.message);
  }

  const organization = organizationData as OrganizationRow | null;
  if (!organization) {
    notFound();
  }

  const { data: brandingData, error: brandingError } = await adminSupabase
    .from("organization_branding")
    .select(
      "status,draft_logo_storage_path,draft_background_storage_path,draft_welcome_headline,draft_welcome_message,draft_sponsor_prize_message,live_logo_storage_path,live_background_storage_path,live_welcome_headline,live_welcome_message,live_sponsor_prize_message"
    )
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (brandingError) {
    throw new Error(brandingError.message);
  }

  const branding = brandingData as OrganizationBrandingRow | null;
  const previewRequested = resolvedSearchParams?.preview === "1";
  const canSeePreviewDraft = previewRequested ? await canCurrentViewerPreviewOrganizationDraft(organization) : false;

  const resolvedView = await buildPortalView(adminSupabase, organization, branding, canSeePreviewDraft ? "preview" : "live");

  return (
    <OrganizationPortalPreview
      organizationName={organization.name}
      welcomeHeadline={resolvedView.welcomeHeadline}
      welcomeMessage={resolvedView.welcomeMessage}
      sponsorPrizeMessage={resolvedView.sponsorPrizeMessage}
      logoUrl={resolvedView.logoUrl}
      backgroundUrl={resolvedView.backgroundUrl}
      mode="full"
      previewLabel={canSeePreviewDraft ? "Previewing draft branding" : null}
    />
  );
}

async function canCurrentViewerPreviewOrganizationDraft(organization: OrganizationRow) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id,role,plan_tier")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return false;
  }

  const tierAccess = resolveTierAccess({
    role: profile.role,
    planTier: profile.plan_tier ?? null,
    managerLimits: null
  });

  return tierAccess.accessLevel === "super_admin" || organization.owner_user_id === user.id;
}

async function buildPortalView(
  adminSupabase: ReturnType<typeof createAdminClient>,
  organization: OrganizationRow,
  branding: OrganizationBrandingRow | null,
  view: "live" | "preview"
) {
  const usePreviewDraft = view === "preview";
  const status = branding?.status ?? "draft";
  const logoPath = usePreviewDraft
    ? branding?.draft_logo_storage_path ?? branding?.live_logo_storage_path ?? null
    : status === "disabled"
      ? null
      : branding?.live_logo_storage_path ?? null;
  const backgroundPath = usePreviewDraft
    ? branding?.draft_background_storage_path ?? branding?.live_background_storage_path ?? null
    : status === "disabled"
      ? null
      : branding?.live_background_storage_path ?? null;
  const welcomeHeadline = usePreviewDraft
    ? normalizePortalText(branding?.draft_welcome_headline, branding?.live_welcome_headline)
    : status === "disabled"
      ? null
      : branding?.live_welcome_headline ?? null;
  const welcomeMessage = usePreviewDraft
    ? normalizePortalText(branding?.draft_welcome_message, branding?.live_welcome_message)
    : status === "disabled"
      ? null
      : branding?.live_welcome_message ?? null;
  const sponsorPrizeMessage = usePreviewDraft
    ? normalizePortalText(branding?.draft_sponsor_prize_message, branding?.live_sponsor_prize_message)
    : status === "disabled"
      ? null
      : branding?.live_sponsor_prize_message ?? null;

  return {
    logoUrl: logoPath ? await createSignedUrl(adminSupabase, logoPath) : null,
    backgroundUrl: backgroundPath ? await createSignedUrl(adminSupabase, backgroundPath) : null,
    welcomeHeadline: welcomeHeadline ?? getDefaultOrganizationWelcomeHeadline(organization.name),
    welcomeMessage: welcomeMessage ?? getDefaultOrganizationWelcomeMessage(),
    sponsorPrizeMessage: sponsorPrizeMessage ?? getDefaultOrganizationSponsorMessage()
  };
}

async function createSignedUrl(
  adminSupabase: ReturnType<typeof createAdminClient>,
  storagePath: string
) {
  const { data, error } = await adminSupabase.storage
    .from("organization-branding")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn("Could not create organization portal signed URL.", {
      storagePath,
      message: error.message
    });
    return null;
  }

  return data.signedUrl;
}

function normalizePortalText(draftValue?: string | null, fallbackValue?: string | null) {
  const trimmedDraftValue = draftValue?.trim() ?? "";
  if (trimmedDraftValue) {
    return trimmedDraftValue;
  }

  const trimmedFallbackValue = fallbackValue?.trim() ?? "";
  return trimmedFallbackValue || null;
}
