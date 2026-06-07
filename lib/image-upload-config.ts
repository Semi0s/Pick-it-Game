export const SUPPORTED_RASTER_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedRasterImageMimeType = (typeof SUPPORTED_RASTER_IMAGE_MIME_TYPES)[number];
export type SupportedRasterImageExtension = "jpg" | "png" | "webp";

export const IMAGE_EXTENSION_BY_MIME_TYPE: Record<SupportedRasterImageMimeType, SupportedRasterImageExtension> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export type ImageUploadPolicy = {
  label: string;
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  requireSquare?: boolean;
};

export const AVATAR_IMAGE_UPLOAD_POLICY = {
  label: "Avatar",
  maxBytes: 500_000,
  minWidth: 128,
  minHeight: 128,
  maxWidth: 1024,
  maxHeight: 1024,
  requireSquare: true
} satisfies ImageUploadPolicy;

export const GROUP_AVATAR_IMAGE_UPLOAD_POLICY = {
  label: "Group avatar",
  maxBytes: 500_000,
  minWidth: 128,
  minHeight: 128,
  maxWidth: 1024,
  maxHeight: 1024,
  requireSquare: true
} satisfies ImageUploadPolicy;

export const ORGANIZATION_LOGO_IMAGE_UPLOAD_POLICY = {
  label: "Organization logo",
  maxBytes: 500_000,
  minWidth: 64,
  minHeight: 64,
  maxWidth: 1024,
  maxHeight: 1024
} satisfies ImageUploadPolicy;

export const ORGANIZATION_BACKGROUND_IMAGE_UPLOAD_POLICY = {
  label: "Organization background",
  maxBytes: 1_500_000,
  minWidth: 640,
  minHeight: 360,
  maxWidth: 2000,
  maxHeight: 2000
} satisfies ImageUploadPolicy;

export const IMAGE_UPLOAD_ACCEPT_ATTRIBUTE =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";
