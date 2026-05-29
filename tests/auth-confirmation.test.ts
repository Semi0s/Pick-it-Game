import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidConfirmationEmail,
  maskConfirmationEmail,
  normalizeConfirmationEmail
} from "../lib/auth-confirmation.ts";

test("confirmation email helpers normalize, validate, and mask pending signup emails", () => {
  assert.equal(normalizeConfirmationEmail("  Player@Example.COM "), "player@example.com");
  assert.equal(isValidConfirmationEmail("player@example.com"), true);
  assert.equal(isValidConfirmationEmail("not-an-email"), false);
  assert.equal(maskConfirmationEmail("player@example.com"), "pl****@ex*****.com");
});
