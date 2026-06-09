import test from "node:test";
import assert from "node:assert/strict";
import {
  getGroupJoinSourceLabel,
  getRemainingCaptainsPassAllowance,
  normalizeGroupJoinSource,
  parseAllowedEmailInput
} from "../lib/group-management.ts";

test("parseAllowedEmailInput normalizes, validates, and deduplicates plain email lists", () => {
  const parsed = parseAllowedEmailInput(`
    Alice@example.com
    bad-email
    bob@example.com
    alice@example.com
  `);

  assert.deepEqual(parsed.validEmails, ["alice@example.com", "bob@example.com"]);
  assert.deepEqual(parsed.invalidEntries, ["bad-email"]);
  assert.deepEqual(parsed.duplicateEntries, ["alice@example.com"]);
});

test("parseAllowedEmailInput reads CSV email columns without inventing fake rows", () => {
  const parsed = parseAllowedEmailInput(`
email,name
 captain@example.com,Captain
 invalid-entry,Broken
 player@example.com,Player
 captain@example.com,Duplicate
  `);

  assert.deepEqual(parsed.validEmails, ["captain@example.com", "player@example.com"]);
  assert.deepEqual(parsed.invalidEntries, ["invalid-entry"]);
  assert.deepEqual(parsed.duplicateEntries, ["captain@example.com"]);
});

test("getRemainingCaptainsPassAllowance is limited by both allowance and available seats", () => {
  assert.equal(
    getRemainingCaptainsPassAllowance({
      allowance: 5,
      invitesUsed: 2,
      remainingSeats: 10
    }),
    3
  );

  assert.equal(
    getRemainingCaptainsPassAllowance({
      allowance: 5,
      invitesUsed: 2,
      remainingSeats: 1
    }),
    1
  );

  assert.equal(
    getRemainingCaptainsPassAllowance({
      allowance: 5,
      invitesUsed: 7,
      remainingSeats: 10
    }),
    0
  );
});

test("group join source labels cover public signup and special invite flows", () => {
  assert.equal(getGroupJoinSourceLabel(normalizeGroupJoinSource("public_signup")), "Public signup");
  assert.equal(getGroupJoinSourceLabel(normalizeGroupJoinSource("access_code")), "Access code");
  assert.equal(getGroupJoinSourceLabel(normalizeGroupJoinSource("invite_link")), "Invite link");
  assert.equal(getGroupJoinSourceLabel(normalizeGroupJoinSource("super_link")), "Super Link");
  assert.equal(getGroupJoinSourceLabel(normalizeGroupJoinSource("unknown")), "Direct");
});
