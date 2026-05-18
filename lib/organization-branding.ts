import type { AccessLevel } from "@/lib/tier-access";

export const ORGANIZATION_BRANDING_BUCKET = "organization-branding";
export const ORGANIZATION_WELCOME_HEADLINE_MAX_LENGTH = 80;
export const ORGANIZATION_WELCOME_MESSAGE_MAX_LENGTH = 280;
export const ORGANIZATION_SPONSOR_MESSAGE_MAX_LENGTH = 280;
export const ORGANIZATION_REVIEW_NOTE_MAX_LENGTH = 280;
export const ORGANIZATION_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const ORGANIZATION_BACKGROUND_MAX_BYTES = 5 * 1024 * 1024;
export const ORGANIZATION_LOGO_MAX_WIDTH = 2048;
export const ORGANIZATION_LOGO_MAX_HEIGHT = 2048;
export const ORGANIZATION_BACKGROUND_MAX_WIDTH = 4096;
export const ORGANIZATION_BACKGROUND_MAX_HEIGHT = 4096;
export const ORGANIZATION_LOGO_MIN_WIDTH = 64;
export const ORGANIZATION_LOGO_MIN_HEIGHT = 64;
export const ORGANIZATION_BACKGROUND_MIN_WIDTH = 640;
export const ORGANIZATION_BACKGROUND_MIN_HEIGHT = 360;
export const ORGANIZATION_LOGO_DEFAULT_SRC = "/images/pickit-signin-logo.png";
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

export type OrganizationBrandingUploadValidation = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
  bytes: Buffer;
};

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
  const maxBytes = assetKind === "logo" ? ORGANIZATION_LOGO_MAX_BYTES : ORGANIZATION_BACKGROUND_MAX_BYTES;
  if (file.size <= 0) {
    return { ok: false, message: "Choose an image file first." };
  }

  if (file.size > maxBytes) {
    return {
      ok: false,
      message:
        assetKind === "logo"
          ? "Choose a logo image smaller than 2 MB."
          : "Choose a background image smaller than 5 MB."
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedImage = detectSupportedImage(bytes);
  if (!detectedImage) {
    return { ok: false, message: "Use a JPG, PNG, or WebP image." };
  }

  if (file.type && file.type !== detectedImage.mimeType) {
    return { ok: false, message: "The uploaded file type did not match the image contents." };
  }

  if (assetKind === "logo") {
    if (
      detectedImage.width < ORGANIZATION_LOGO_MIN_WIDTH ||
      detectedImage.height < ORGANIZATION_LOGO_MIN_HEIGHT ||
      detectedImage.width > ORGANIZATION_LOGO_MAX_WIDTH ||
      detectedImage.height > ORGANIZATION_LOGO_MAX_HEIGHT
    ) {
      return {
        ok: false,
        message: `Logo images must be between ${ORGANIZATION_LOGO_MIN_WIDTH}x${ORGANIZATION_LOGO_MIN_HEIGHT} and ${ORGANIZATION_LOGO_MAX_WIDTH}x${ORGANIZATION_LOGO_MAX_HEIGHT}.`
      };
    }
  } else if (
    detectedImage.width < ORGANIZATION_BACKGROUND_MIN_WIDTH ||
    detectedImage.height < ORGANIZATION_BACKGROUND_MIN_HEIGHT ||
    detectedImage.width > ORGANIZATION_BACKGROUND_MAX_WIDTH ||
    detectedImage.height > ORGANIZATION_BACKGROUND_MAX_HEIGHT
  ) {
    return {
      ok: false,
      message: `Background images must be between ${ORGANIZATION_BACKGROUND_MIN_WIDTH}x${ORGANIZATION_BACKGROUND_MIN_HEIGHT} and ${ORGANIZATION_BACKGROUND_MAX_WIDTH}x${ORGANIZATION_BACKGROUND_MAX_HEIGHT}.`
    };
  }

  return {
    ok: true,
    value: {
      ...detectedImage,
      bytes
    }
  };
}

function detectSupportedImage(
  bytes: Buffer
): Pick<OrganizationBrandingUploadValidation, "mimeType" | "extension" | "width" | "height"> | null {
  const png = detectPng(bytes);
  if (png) {
    return png;
  }

  const jpeg = detectJpeg(bytes);
  if (jpeg) {
    return jpeg;
  }

  const webp = detectWebp(bytes);
  if (webp) {
    return webp;
  }

  return null;
}

function detectPng(bytes: Buffer) {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      mimeType: "image/png" as const,
      extension: "png" as const,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20)
    };
  }

  return null;
}

function detectJpeg(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) {
      offset += 1;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 1 >= bytes.length) {
      break;
    }

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame && offset + 7 < bytes.length) {
      return {
        mimeType: "image/jpeg" as const,
        extension: "jpg" as const,
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5)
      };
    }

    offset += segmentLength;
  }

  return null;
}

function detectWebp(bytes: Buffer) {
  if (
    bytes.length < 30 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunkType = bytes.toString("ascii", 12, 16);
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      mimeType: "image/webp" as const,
      extension: "webp" as const,
      width: 1 + readUInt24LE(bytes, 24),
      height: 1 + readUInt24LE(bytes, 27)
    };
  }

  if (chunkType === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      mimeType: "image/webp" as const,
      extension: "webp" as const,
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }

  if (chunkType === "VP8 " && bytes.length >= 30) {
    return {
      mimeType: "image/webp" as const,
      extension: "webp" as const,
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }

  return null;
}

function readUInt24LE(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}
