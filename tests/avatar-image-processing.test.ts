import assert from "node:assert/strict";
import test from "node:test";
import {
  AvatarImageProcessingError,
  getAvatarImageInputAcceptAttribute,
  getAvatarImageProcessingErrorMessage,
  isSupportedAvatarImageInput
} from "../lib/avatar-image-processing.ts";

test("avatar image input support accepts common avatar image types", () => {
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "avatar.jpg", { type: "image/jpeg" })), true);
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "avatar.png", { type: "image/png" })), true);
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "avatar.webp", { type: "image/webp" })), true);
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "avatar.heic", { type: "image/heic" })), true);
});

test("avatar image input support falls back to file extension when mime type is missing", () => {
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "phone-photo.HEIF", { type: "" })), true);
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "avatar.JPEG", { type: "" })), true);
});

test("avatar image input support rejects unsupported file types", () => {
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "avatar.gif", { type: "image/gif" })), false);
  assert.equal(isSupportedAvatarImageInput(new File(["x"], "avatar.pdf", { type: "application/pdf" })), false);
});

test("avatar file input accept attribute includes phone-photo image types", () => {
  const accept = getAvatarImageInputAcceptAttribute();
  assert.match(accept, /image\/jpeg/);
  assert.match(accept, /image\/png/);
  assert.match(accept, /image\/webp/);
  assert.match(accept, /image\/heic/);
  assert.match(accept, /\.heif/);
});

test("avatar image processing maps failures to friendly user messages", () => {
  assert.equal(
    getAvatarImageProcessingErrorMessage(
      new AvatarImageProcessingError("unsupported_type", "This file type is not supported yet. Try a JPG or PNG.")
    ),
    "This file type is not supported yet. Try a JPG or PNG."
  );

  assert.equal(
    getAvatarImageProcessingErrorMessage(new Error("low-level decoder failed")),
    "This image could not be processed. Please try another photo."
  );
});
