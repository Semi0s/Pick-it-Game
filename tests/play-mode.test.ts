import test from "node:test";
import assert from "node:assert/strict";
import {
  canActivateTournamentEntry,
  canSwitchTournamentEntry,
  getModePreviewConflictMessage,
  GROUP_PHASE_START_AT,
  resolveTournamentEntryState,
  shouldApplyHomeTeamAdvantage,
  shouldHideDockForPath
} from "../lib/play-mode.ts";

const deadline = new Date(GROUP_PHASE_START_AT).getTime();
const beforeDeadline = deadline - 60_000;
const afterDeadline = deadline + 60_000;

test("preview does not count as an active tournament entry", () => {
  assert.equal(resolveTournamentEntryState(null, null, beforeDeadline), null);
});

test("active entry before deadline counts as active", () => {
  assert.equal(resolveTournamentEntryState("easy_bracket", "active", beforeDeadline), "active");
});

test("submit after deadline fails activation", () => {
  assert.equal(canActivateTournamentEntry(afterDeadline), false);
});

test("switch before deadline works", () => {
  assert.equal(canSwitchTournamentEntry(beforeDeadline), true);
});

test("switch after deadline fails", () => {
  assert.equal(canSwitchTournamentEntry(afterDeadline), false);
});

test("Easy Bracket and Global Challenge conflict messaging is explicit", () => {
  assert.match(getModePreviewConflictMessage("easy_bracket", "strategy_mode") ?? "", /active Easy Bracket/i);
  assert.match(getModePreviewConflictMessage("strategy_mode", "easy_bracket") ?? "", /active Global Challenge/i);
});

test("Home Team Advantage stays group-only", () => {
  assert.equal(shouldApplyHomeTeamAdvantage(true, "group"), true);
  assert.equal(shouldApplyHomeTeamAdvantage(true, "global"), false);
  assert.equal(shouldApplyHomeTeamAdvantage(true, "personal"), false);
});

test("onboarding hides dock", () => {
  assert.equal(shouldHideDockForPath("/start-playing", null), true);
  assert.equal(shouldHideDockForPath("/groups", "1"), true);
});

test("exiting onboarding restores dock on normal app routes", () => {
  assert.equal(shouldHideDockForPath("/groups", null), false);
  assert.equal(shouldHideDockForPath("/leaderboard", null), false);
});

test("legacy normal app entry shows dock", () => {
  assert.equal(shouldHideDockForPath("/dashboard", null), false);
});
