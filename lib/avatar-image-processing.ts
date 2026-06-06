export type AvatarImageProcessingErrorCode =
  | "unsupported_type"
  | "decode_failed"
  | "too_small"
  | "canvas_unavailable"
  | "encode_failed";

export type ProcessAvatarImageOptions = {
  maxSizePx?: number;
  outputType?: "image/webp" | "image/jpeg";
  quality?: number;
  maxBytes?: number;
  minSourceSizePx?: number;
};

export type ProcessedAvatarImage = {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  size: number;
  mimeType: "image/webp" | "image/jpeg";
};

export class AvatarImageProcessingError extends Error {
  code: AvatarImageProcessingErrorCode;

  constructor(code: AvatarImageProcessingErrorCode, message: string) {
    super(message);
    this.name = "AvatarImageProcessingError";
    this.code = code;
  }
}

const DEFAULT_MAX_SIZE_PX = 512;
const DEFAULT_QUALITY = 0.82;
const DEFAULT_MAX_BYTES = 500_000;
const DEFAULT_MIN_SOURCE_SIZE_PX = 128;
const IMAGE_INPUT_ACCEPT_ATTRIBUTE =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

const SUPPORTED_INPUT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

const HEIC_INPUT_MIME_TYPES = new Set(["image/heic", "image/heif"]);

type LoadedImageSource = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

export function getAvatarImageInputAcceptAttribute() {
  return IMAGE_INPUT_ACCEPT_ATTRIBUTE;
}

export function getAvatarImageProcessingErrorMessage(error: unknown) {
  if (error instanceof AvatarImageProcessingError) {
    return error.message;
  }

  return "This image could not be processed. Please try another photo.";
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return extension;
}

function getNormalizedInputMimeType(file: File) {
  const mimeType = file.type.toLowerCase();
  if (mimeType) {
    return mimeType;
  }

  const extension = getFileExtension(file.name);
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  if (extension === "heic") {
    return "image/heic";
  }
  if (extension === "heif") {
    return "image/heif";
  }

  return "";
}

export function isSupportedAvatarImageInput(file: File) {
  return SUPPORTED_INPUT_MIME_TYPES.has(getNormalizedInputMimeType(file));
}

function assertBrowserImageProcessingAvailable() {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new AvatarImageProcessingError(
      "canvas_unavailable",
      "This image could not be processed. Please try another photo."
    );
  }
}

async function loadWithCreateImageBitmap(file: File): Promise<LoadedImageSource | null> {
  if (typeof createImageBitmap === "undefined") {
    return null;
  }

  try {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close()
    };
  } catch {
    return null;
  }
}

function loadWithImageElement(file: File): Promise<LoadedImageSource> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        cleanup: () => URL.revokeObjectURL(objectUrl)
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image decode failed."));
    };
    image.src = objectUrl;
  });
}

async function loadImageSource(file: File): Promise<LoadedImageSource> {
  const bitmapSource = await loadWithCreateImageBitmap(file);
  if (bitmapSource) {
    return bitmapSource;
  }

  return loadWithImageElement(file);
}

function createSquareAvatarCanvas(source: LoadedImageSource, sizePx: number) {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new AvatarImageProcessingError(
      "canvas_unavailable",
      "This image could not be processed. Please try another photo."
    );
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sizePx, sizePx);

  const cropSize = Math.min(source.width, source.height);
  const sourceX = Math.max(0, Math.floor((source.width - cropSize) / 2));
  const sourceY = Math.max(0, Math.floor((source.height - cropSize) / 2));

  context.drawImage(source.source, sourceX, sourceY, cropSize, cropSize, 0, 0, sizePx, sizePx);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: "image/webp" | "image/jpeg", quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== type) {
          reject(new Error("Canvas encoding failed."));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

let webpOutputSupport: boolean | null = null;

async function canEncodeWebP() {
  if (webpOutputSupport !== null) {
    return webpOutputSupport;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;

  try {
    const blob = await canvasToBlob(canvas, "image/webp", 0.8);
    webpOutputSupport = blob.type === "image/webp";
  } catch {
    webpOutputSupport = false;
  }

  return webpOutputSupport;
}

function getOutputFileName(inputName: string, mimeType: "image/webp" | "image/jpeg") {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const baseName = inputName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${baseName || "avatar"}-avatar.${extension}`;
}

function getQualityAttempts(initialQuality: number) {
  const boundedQuality = Math.min(0.92, Math.max(0.48, initialQuality));
  return [boundedQuality, 0.74, 0.66, 0.58, 0.5, 0.44].filter((quality, index, values) => {
    return values.findIndex((value) => Math.abs(value - quality) < 0.01) === index;
  });
}

function getSizeAttempts(maxSizePx: number) {
  const boundedMaxSize = Math.max(256, Math.min(1024, Math.round(maxSizePx)));
  return [boundedMaxSize, 384, 320, 256, 192].filter((size, index, values) => {
    return size <= boundedMaxSize && values.indexOf(size) === index;
  });
}

export async function processAvatarImage(
  file: File,
  options: ProcessAvatarImageOptions = {}
): Promise<ProcessedAvatarImage> {
  assertBrowserImageProcessingAvailable();

  const inputMimeType = getNormalizedInputMimeType(file);
  if (!SUPPORTED_INPUT_MIME_TYPES.has(inputMimeType)) {
    throw new AvatarImageProcessingError(
      "unsupported_type",
      "This file type is not supported yet. Try a JPG or PNG."
    );
  }

  const maxSizePx = options.maxSizePx ?? DEFAULT_MAX_SIZE_PX;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const minSourceSizePx = options.minSourceSizePx ?? DEFAULT_MIN_SOURCE_SIZE_PX;
  const preferredType = options.outputType ?? "image/webp";
  const qualityAttempts = getQualityAttempts(options.quality ?? DEFAULT_QUALITY);
  const sizeAttempts = getSizeAttempts(maxSizePx);

  let source: LoadedImageSource;
  try {
    source = await loadImageSource(file);
  } catch {
    if (HEIC_INPUT_MIME_TYPES.has(inputMimeType)) {
      throw new AvatarImageProcessingError(
        "unsupported_type",
        "This file type is not supported yet. Try a JPG or PNG."
      );
    }

    throw new AvatarImageProcessingError(
      "decode_failed",
      "This image could not be processed. Please try another photo."
    );
  }

  try {
    if (Math.min(source.width, source.height) < minSourceSizePx) {
      throw new AvatarImageProcessingError("too_small", "The image is too small to use as an avatar.");
    }

    const outputTypes: Array<"image/webp" | "image/jpeg"> =
      preferredType === "image/webp" && (await canEncodeWebP())
        ? ["image/webp", "image/jpeg"]
        : ["image/jpeg"];
    let bestResult: { blob: Blob; mimeType: "image/webp" | "image/jpeg"; sizePx: number } | null = null;

    for (const mimeType of outputTypes) {
      for (const sizePx of sizeAttempts) {
        const canvas = createSquareAvatarCanvas(source, sizePx);

        for (const quality of qualityAttempts) {
          try {
            const blob = await canvasToBlob(canvas, mimeType, quality);
            if (!bestResult || blob.size < bestResult.blob.size) {
              bestResult = { blob, mimeType, sizePx };
            }
            if (blob.size <= maxBytes) {
              const processedFile = new File([blob], getOutputFileName(file.name, mimeType), {
                type: mimeType,
                lastModified: Date.now()
              });
              return {
                file: processedFile,
                previewUrl: URL.createObjectURL(blob),
                width: sizePx,
                height: sizePx,
                size: blob.size,
                mimeType
              };
            }
          } catch {
            if (mimeType === "image/webp") {
              break;
            }
          }
        }
      }
    }

    if (!bestResult || bestResult.blob.size > maxBytes) {
      throw new AvatarImageProcessingError(
        "encode_failed",
        "This image could not be processed. Please try another photo."
      );
    }

    const processedFile = new File([bestResult.blob], getOutputFileName(file.name, bestResult.mimeType), {
      type: bestResult.mimeType,
      lastModified: Date.now()
    });

    return {
      file: processedFile,
      previewUrl: URL.createObjectURL(bestResult.blob),
      width: bestResult.sizePx,
      height: bestResult.sizePx,
      size: bestResult.blob.size,
      mimeType: bestResult.mimeType
    };
  } finally {
    source.cleanup();
  }
}
