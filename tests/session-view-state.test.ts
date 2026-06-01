import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSessionViewStateStorageKey,
  parseSessionViewStateValue
} from "../lib/session-view-state.ts";

test("session view state keys are versioned and scoped by user tournament and page", () => {
  assert.equal(
    buildSessionViewStateStorageKey({
      key: "group-stage",
      userId: "user:123",
      tournamentId: "wc2026",
      version: 1
    }),
    "bracket2026:view-state:v1:user_123:wc2026:group-stage"
  );

  assert.equal(
    buildSessionViewStateStorageKey({ key: "dashboard", userId: null, tournamentId: null }),
    "bracket2026:view-state:v1:anonymous:wc2026:dashboard"
  );
});

test("session view state parser validates envelope version and value shape", () => {
  const defaultValue = { selectedGroup: "A", open: false };
  const validEnvelope = JSON.stringify({
    version: 1,
    updatedAt: 1710000000000,
    value: { selectedGroup: "E", open: true }
  });

  assert.deepEqual(
    parseSessionViewStateValue({
      rawValue: validEnvelope,
      defaultValue,
      validate: (value) => {
        if (!value || typeof value !== "object") {
          return null;
        }
        const candidate = value as Partial<typeof defaultValue>;
        return typeof candidate.selectedGroup === "string" && typeof candidate.open === "boolean"
          ? { selectedGroup: candidate.selectedGroup, open: candidate.open }
          : null;
      }
    }),
    { value: { selectedGroup: "E", open: true }, hasStoredValue: true }
  );

  assert.deepEqual(
    parseSessionViewStateValue({
      rawValue: JSON.stringify({ version: 2, value: { selectedGroup: "E", open: true } }),
      defaultValue
    }),
    { value: defaultValue, hasStoredValue: false }
  );

  assert.deepEqual(
    parseSessionViewStateValue({
      rawValue: "{not-json",
      defaultValue
    }),
    { value: defaultValue, hasStoredValue: false }
  );
});
