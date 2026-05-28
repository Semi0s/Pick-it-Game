import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGroupJoinInput, normalizeInviteTokenInput } from "../lib/group-join-input.ts";

test("group join input keeps raw codes available for access-code redemption", () => {
  assert.deepEqual(normalizeGroupJoinInput("  WORLD26  "), {
    kind: "access_code_or_token",
    value: "WORLD26"
  });
});

test("group join input extracts invite tokens from full My Groups invite links", () => {
  assert.deepEqual(normalizeGroupJoinInput("https://pickit.test/my-groups?invite=abc123&lang=es"), {
    kind: "group_invite_token",
    value: "abc123"
  });
});

test("group join input extracts invite tokens from nested login return links", () => {
  const nestedLink =
    "https://pickit.test/login?flow=invite&next=%2Fmy-groups%3Finvite%3Dtoken456%26lang%3Dfr";

  assert.deepEqual(normalizeGroupJoinInput(nestedLink), {
    kind: "group_invite_token",
    value: "token456"
  });
  assert.equal(normalizeInviteTokenInput(nestedLink), "token456");
});

test("group join input rejects URL-like values without an invite token", () => {
  assert.equal(normalizeGroupJoinInput("https://pickit.test/dashboard"), null);
});
