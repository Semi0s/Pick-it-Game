import test from "node:test";
import assert from "node:assert/strict";
import {
  APP_UPDATES_ADMIN_REQUIRED_MESSAGE,
  APP_UPDATES_SIGN_IN_REQUIRED_MESSAGE,
  canManageAppUpdates,
  getAppUpdatesCardDisplayState,
  resolveAppUpdatesAdminAccess
} from "../lib/dashboard-updates.ts";

test("admin users can see update management controls", () => {
  assert.equal(canManageAppUpdates({ id: "admin-1", role: "admin" }), true);
});

test("non-admin users do not see update management controls", () => {
  assert.equal(canManageAppUpdates({ id: "player-1", role: "player" }), false);
});

test("logged-out users do not see update management controls", () => {
  assert.equal(canManageAppUpdates(null), false);
});

test("direct update-management calls reject logged-out users", () => {
  assert.deepEqual(resolveAppUpdatesAdminAccess({ userId: null, role: null }), {
    ok: false,
    message: APP_UPDATES_SIGN_IN_REQUIRED_MESSAGE
  });
});

test("direct update-management calls reject non-admin users", () => {
  assert.deepEqual(resolveAppUpdatesAdminAccess({ userId: "player-1", role: "player" }), {
    ok: false,
    message: APP_UPDATES_ADMIN_REQUIRED_MESSAGE
  });
});

test("direct update-management calls allow admins", () => {
  assert.deepEqual(resolveAppUpdatesAdminAccess({ userId: "admin-1", role: "admin" }), {
    ok: true,
    userId: "admin-1"
  });
});

test("when updates are off, regular users do not see the updates card", () => {
  assert.equal(
    getAppUpdatesCardDisplayState({
      canManageUpdates: false,
      isEnabled: false,
      hasActiveUpdate: false,
      hasError: false
    }),
    "hidden"
  );
});

test("when updates are off, admins see an admin-only disabled state", () => {
  assert.equal(
    getAppUpdatesCardDisplayState({
      canManageUpdates: true,
      isEnabled: false,
      hasActiveUpdate: false,
      hasError: false
    }),
    "admin_disabled"
  );
});

test("enabled updates with no live message stay hidden from regular users but visible to admins", () => {
  assert.equal(
    getAppUpdatesCardDisplayState({
      canManageUpdates: false,
      isEnabled: true,
      hasActiveUpdate: false,
      hasError: false
    }),
    "hidden"
  );
  assert.equal(
    getAppUpdatesCardDisplayState({
      canManageUpdates: true,
      isEnabled: true,
      hasActiveUpdate: false,
      hasError: false
    }),
    "admin_empty"
  );
});

test("enabled updates with a live message render the card", () => {
  assert.equal(
    getAppUpdatesCardDisplayState({
      canManageUpdates: false,
      isEnabled: true,
      hasActiveUpdate: true,
      hasError: false
    }),
    "card"
  );
});

test("update loading errors stay hidden from regular users but visible to admins", () => {
  assert.equal(
    getAppUpdatesCardDisplayState({
      canManageUpdates: false,
      isEnabled: true,
      hasActiveUpdate: false,
      hasError: true
    }),
    "hidden"
  );
  assert.equal(
    getAppUpdatesCardDisplayState({
      canManageUpdates: true,
      isEnabled: true,
      hasActiveUpdate: false,
      hasError: true
    }),
    "admin_error"
  );
});
