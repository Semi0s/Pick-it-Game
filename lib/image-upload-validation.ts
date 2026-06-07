import {
  IMAGE_EXTENSION_BY_MIME_TYPE,
  SUPPORTED_RASTER_IMAGE_MIME_TYPES,
  type ImageUploadPolicy,
  type SupportedRasterImageExtension,
  type SupportedRasterImageMimeType
} from "./image-upload-config.ts";

export type ValidatedImageUpload = {
  mimeType: SupportedRasterImageMimeType;
  extension: SupportedRasterImageExtension;
  width: number;
  height: number;
  bytes: Buffer;
};

export async function validateImageUploadFile(
  file: File,
  policy: ImageUploadPolicy
): Promise<{ ok: true; value: ValidatedImageUpload } | { ok: false; message: string }> {
  if (file.size <= 0) {
    return { ok: false, message: "Choose an image file first." };
  }

  if (file.size > policy.maxBytes) {
    return {
      ok: false,
      message: `${policy.label} images must be ${formatBytes(policy.maxBytes)} or smaller after compression.`
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detectedImage = detectSupportedRasterImage(bytes);
  if (!detectedImage) {
    return { ok: false, message: "Use a JPG, PNG, or WebP image." };
  }

  const normalizedMimeType = normalizeImageMimeType(file.type);
  if (normalizedMimeType && normalizedMimeType !== detectedImage.mimeType) {
    return { ok: false, message: "The uploaded file type did not match the image contents." };
  }

  if (detectedImage.isAnimated) {
    return { ok: false, message: "Animated images are not supported for app images." };
  }

  if (
    detectedImage.width < policy.minWidth ||
    detectedImage.height < policy.minHeight ||
    detectedImage.width > policy.maxWidth ||
    detectedImage.height > policy.maxHeight
  ) {
    return {
      ok: false,
      message: `${policy.label} images must be between ${policy.minWidth}x${policy.minHeight} and ${policy.maxWidth}x${policy.maxHeight}.`
    };
  }

  if (policy.requireSquare && detectedImage.width !== detectedImage.height) {
    return { ok: false, message: `${policy.label} images must be square.` };
  }

  return {
    ok: true,
    value: {
      mimeType: detectedImage.mimeType,
      extension: IMAGE_EXTENSION_BY_MIME_TYPE[detectedImage.mimeType],
      width: detectedImage.width,
      height: detectedImage.height,
      bytes
    }
  };
}

export function detectSupportedRasterImage(
  bytes: Buffer
): { mimeType: SupportedRasterImageMimeType; width: number; height: number; isAnimated?: boolean } | null {
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

function normalizeImageMimeType(value: string | null | undefined): SupportedRasterImageMimeType | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "image/jpg") {
    return "image/jpeg";
  }

  return SUPPORTED_RASTER_IMAGE_MIME_TYPES.includes(normalized as SupportedRasterImageMimeType)
    ? (normalized as SupportedRasterImageMimeType)
    : null;
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
      width: 1 + readUInt24LE(bytes, 24),
      height: 1 + readUInt24LE(bytes, 27),
      isAnimated: Boolean(bytes[20] & 0x02)
    };
  }

  if (chunkType === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      mimeType: "image/webp" as const,
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }

  if (chunkType === "VP8 " && bytes.length >= 30) {
    return {
      mimeType: "image/webp" as const,
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }

  return null;
}

function readUInt24LE(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${Math.round((bytes / 1_000_000) * 10) / 10} MB`;
  }

  return `${Math.round(bytes / 1000)} KB`;
}
