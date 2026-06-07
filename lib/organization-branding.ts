import type { AccessLevel } from "@/lib/tier-access";
import {
  ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY,
  ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY
} from "./image-upload-config.ts";
import { validateImageUploadFile, type ValidatedImageUpload } from "./image-upload-validation.ts";

export const ORGANIZATION_BRANDING_BUCKET = "organization-branding";
export const ORGANIZATION_WELCOME_HEADLINE_MAX_LENGTH = 80;
export const ORGANIZATION_WELCOME_MESSAGE_MAX_LENGTH = 280;
export const ORGANIZATION_SPONSOR_MESSAGE_MAX_LENGTH = 280;
export const ORGANIZATION_REVIEW_NOTE_MAX_LENGTH = 280;
export const ORGANIZATION_LOGO_MAX_BYTES = ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY.maxBytes;
export const ORGANIZATION_BACKGROUND_MAX_BYTES = ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY.maxBytes;
export const ORGANIZATION_LOGO_MAX_WIDTH = ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY.maxWidth;
export const ORGANIZATION_LOGO_MAX_HEIGHT = ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY.maxHeight;
export const ORGANIZATION_BACKGROUND_MAX_WIDTH = ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY.maxWidth;
export const ORGANIZATION_BACKGROUND_MAX_HEIGHT = ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY.maxHeight;
export const ORGANIZATION_LOGO_MIN_WIDTH = ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY.minWidth;
export const ORGANIZATION_LOGO_MIN_HEIGHT = ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY.minHeight;
export const ORGANIZATION_BACKGROUND_MIN_WIDTH = ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY.minWidth;
export const ORGANIZATION_BACKGROUND_MIN_HEIGHT = ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY.minHeight;
export const ORGANIZATION_LOGO_DEFAULT_SRC = "/images/pickit-logo.svg";
export const ORGANIZATION_BACKGROUND_DEFAULT_SRC = "/images/signin-stadium.jpeg";

export type OrganizationBrandingStatus = "draft" | "pending_review" | "approved" | "rejected" | "disabled";
export type OrganizationBrandingAssetKind = "logo" | "background";

export type OrganizationBrandingAsset = {
  storagePath: string | null;
  signedUrl: string | null;
};

export type OrganizationBrandingSnapshot = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  status: OrganizationBrandingStatus;
  reviewNote: string | null;
  welcomeHeadline: string | null;
  welcomeMessage: string | null;
  sponsorPrizeMessage: string | null;
  logo: OrganizationBrandingAsset;
  background: OrganizationBrandingAsset;
};

export type OrganizationBrandingEditorState = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  status: OrganizationBrandingStatus;
  reviewNote: string | null;
  welcomeHeadline: string;
  welcomeMessage: string;
  sponsorPrizeMessage: string;
  logo: OrganizationBrandingAsset;
  background: OrganizationBrandingAsset;
  live: OrganizationBrandingSnapshot;
  previewPath: string;
};

export type OrganizationBrandingUploadValidation = ValidatedImageUpload;

export type OrganizationPortalView = "live" | "preview";

export function getDefaultOrganizationWelcomeHeadline(organizationName: string) {
  return `Welcome to ${organizationName}`;
}

export function getDefaultOrganizationWelcomeMessage() {
  return "Picks, standings, and group bragging rights all live here.";
}

export function getDefaultOrganizationSponsorMessage() {
  return "";
}

export function normalizeOrganizationPlainText(value: string, maxLength: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, maxLength);
}

export function slugifyOrganizationName(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return normalized || `org-${crypto.randomUUID().slice(0, 8)}`;
}

export function buildOrganizationBrandingObjectPath(
  organizationId: string,
  assetKind: OrganizationBrandingAssetKind,
  scope: OrganizationPortalView,
  extension: "jpg" | "png" | "webp"
) {
  return `organizations/${organizationId}/${assetKind}/${scope}/${crypto.randomUUID()}.${extension}`;
}

export function getOrganizationBrandingLabel(status: OrganizationBrandingStatus) {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending_review":
      return "Pending review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "disabled":
      return "Disabled";
  }
}

export function getOrganizationBrandingTone(status: OrganizationBrandingStatus): "neutral" | "accent" | "danger" {
  if (status === "approved") {
    return "accent";
  }

  if (status === "rejected" || status === "disabled") {
    return "danger";
  }

  return "neutral";
}

export function canEditOrganizationBranding(accessLevel: AccessLevel) {
  return accessLevel === "managing_director" || accessLevel === "super_admin";
}

export function canModerateOrganizationBranding(accessLevel: AccessLevel) {
  return accessLevel === "super_admin";
}

export async function validateOrganizationBrandingUpload(
  file: File,
  assetKind: OrganizationBrandingAssetKind
): Promise<{ ok: true; value: OrganizationBrandingUploadValidation } | { ok: false; message: string }> {
  return validateImageUploadFile(
    file,
    assetKind === "logo" ? ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY : ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY
  );
}
