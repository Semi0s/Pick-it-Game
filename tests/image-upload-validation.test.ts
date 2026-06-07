import assert from "node:assert/strict";
import test from "node:test";
import { AVATAR_IMAGE_UPLOAD_POLICY } from "../lib/image-upload-config.ts";
import { validateImageUploadFile } from "../lib/image-upload-validation.ts";

function createPngBytes(width: number, height: number) {
  const bytes = Buffer.alloc(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function createAnimatedWebpBytes(width: number, height: number) {
  const bytes = Buffer.alloc(30);
  bytes.write("RIFF", 0, "ascii");
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes[20] = 0x02;
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

test("image upload validation accepts a square avatar raster image", async () => {
  const file = new File([createPngBytes(512, 512)], "avatar.png", { type: "image/png" });
  const result = await validateImageUploadFile(file, AVATAR_IMAGE_UPLOAD_POLICY);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.mimeType, "image/png");
    assert.equal(result.value.extension, "png");
    assert.equal(result.value.width, 512);
    assert.equal(result.value.height, 512);
  }
});

test("image upload validation enforces square avatar images", async () => {
  const file = new File([createPngBytes(512, 384)], "avatar.png", { type: "image/png" });
  const result = await validateImageUploadFile(file, AVATAR_IMAGE_UPLOAD_POLICY);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /must be square/);
  }
});

test("image upload validation rejects SVG and other scriptable image inputs", async () => {
  const file = new File(["<svg><script>alert(1)</script></svg>"], "avatar.svg", {
    type: "image/svg+xml"
  });
  const result = await validateImageUploadFile(file, AVATAR_IMAGE_UPLOAD_POLICY);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /JPG, PNG, or WebP/);
  }
});

test("image upload validation rejects MIME/content mismatches", async () => {
  const file = new File([createPngBytes(512, 512)], "avatar.jpg", { type: "image/jpeg" });
  const result = await validateImageUploadFile(file, AVATAR_IMAGE_UPLOAD_POLICY);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /did not match/);
  }
});

test("image upload validation rejects animated WebP images", async () => {
  const file = new File([createAnimatedWebpBytes(512, 512)], "avatar.webp", { type: "image/webp" });
  const result = await validateImageUploadFile(file, AVATAR_IMAGE_UPLOAD_POLICY);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /Animated images are not supported/);
  }
});
