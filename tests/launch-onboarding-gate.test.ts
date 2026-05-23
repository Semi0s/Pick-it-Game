import test from "node:test";
import assert from "node:assert/strict";
import { REQUIRED_LAUNCH_ONBOARDING_VERSION, shouldRequireLaunchOnboarding } from "../lib/launch-onboarding.ts";

test("launch onboarding is required when a player has never seen the current version", () => {
  assert.equal(shouldRequireLaunchOnboarding(null), true);
  assert.equal(shouldRequireLaunchOnboarding(0), true);
});

test("launch onboarding is not required once the current version has been seen", () => {
  assert.equal(shouldRequireLaunchOnboarding(REQUIRED_LAUNCH_ONBOARDING_VERSION), false);
  assert.equal(shouldRequireLaunchOnboarding(REQUIRED_LAUNCH_ONBOARDING_VERSION + 1), false);
});
