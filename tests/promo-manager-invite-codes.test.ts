import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPromoManagerInviteCode,
  getPromoManagerInviteAvailability,
  getPromoManagerInviteReasonFromMessage,
  normalizePromoManagerInviteCode
} from "../lib/promo-manager-invite-codes.ts";

test("promo manager invite code normalization matches access-code behavior", () => {
  assert.equal(normalizePromoManagerInviteCode(" WORLD 26 "), "world26");
  assert.equal(formatPromoManagerInviteCode(" world-26 "), "WORLD-26");
});

test("promo manager invite availability blocks paused expired full and not-started codes", () => {
  const future = new Date("2026-06-01T00:00:00.000Z").toISOString();
  const past = new Date("2026-05-01T00:00:00.000Z").toISOString();
  const now = new Date("2026-05-25T12:00:00.000Z").getTime();

  assert.deepEqual(
    getPromoManagerInviteAvailability({ status: "paused", redemptionCount: 0, maxRedemptions: 10 }, now),
    { claimable: false, reason: "paused" }
  );
  assert.deepEqual(
    getPromoManagerInviteAvailability({ status: "active", startsAt: future, redemptionCount: 0, maxRedemptions: 10 }, now),
    { claimable: false, reason: "not_started" }
  );
  assert.deepEqual(
    getPromoManagerInviteAvailability({ status: "active", expiresAt: past, redemptionCount: 0, maxRedemptions: 10 }, now),
    { claimable: false, reason: "expired" }
  );
  assert.deepEqual(
    getPromoManagerInviteAvailability({ status: "active", redemptionCount: 10, maxRedemptions: 10 }, now),
    { claimable: false, reason: "full" }
  );
});

test("promo manager invite availability allows active codes with remaining capacity", () => {
  assert.deepEqual(
    getPromoManagerInviteAvailability({ status: "active", redemptionCount: 4, maxRedemptions: 10 }),
    { claimable: true, reason: null }
  );
});

test("promo manager invite db error messages map to public reasons", () => {
  assert.equal(getPromoManagerInviteReasonFromMessage("PROMO_MANAGER_CODE_FULL"), "full");
  assert.equal(getPromoManagerInviteReasonFromMessage("PROMO_MANAGER_CODE_PAUSED"), "paused");
  assert.equal(getPromoManagerInviteReasonFromMessage("PROMO_MANAGER_INELIGIBLE"), "ineligible");
});
