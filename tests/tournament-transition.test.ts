import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTournamentTransitionMessageId,
  resolveTournamentTransitionSettings,
  shouldForceDashboardStartThisSession,
  shouldShowReturnToDashboardIndicator,
  shouldSkipLegacyLaunchOnboarding
} from "../lib/tournament-transition-helpers.ts";

test("transition settings default to pre-tournament behavior", () => {
  const settings = resolveTournamentTransitionSettings();

  assert.equal(settings.modality, "pre_tournament");
  assert.equal(settings.showKnockoutOutlook, false);
  assert.equal(settings.sessionBehavior.startEachSessionOnDashboard, false);
  assert.equal(settings.sessionBehavior.showReturnToDashboardIndicator, false);
  assert.equal(settings.leftTriptych.primaryView, "group_stage_progress");
  assert.equal(settings.leftTriptych.secondaryView, "score_movement");
});

test("live tournament defaults promote score movement and keep dashboard return visible", () => {
  const settings = resolveTournamentTransitionSettings({
    modality: "group_stage_live"
  });

  assert.equal(settings.sessionBehavior.showReturnToDashboardIndicator, true);
  assert.equal(settings.leftTriptych.primaryView, "score_movement");
  assert.equal(settings.leftTriptych.secondaryView, "group_stage_progress");
});

test("secondary triptych view is corrected when it matches the primary view", () => {
  const settings = resolveTournamentTransitionSettings({
    modality: "knockout_live",
    leftTriptych: {
      primaryView: "knockout_progress",
      secondaryView: "knockout_progress"
    }
  });

  assert.equal(settings.leftTriptych.primaryView, "knockout_progress");
  assert.notEqual(settings.leftTriptych.secondaryView, settings.leftTriptych.primaryView);
});

test("legacy launch onboarding is skipped once the tournament is live", () => {
  assert.equal(shouldSkipLegacyLaunchOnboarding("pre_tournament"), false);
  assert.equal(shouldSkipLegacyLaunchOnboarding("group_stage_live"), true);
  assert.equal(shouldSkipLegacyLaunchOnboarding("knockout_live"), true);
});

test("forced dashboard start happens once per session and never on excluded routes", () => {
  const settings = resolveTournamentTransitionSettings({
    modality: "group_stage_live",
    sessionBehavior: {
      startEachSessionOnDashboard: true,
      showReturnToDashboardIndicator: true
    }
  });

  assert.equal(
    shouldForceDashboardStartThisSession({
      pathname: "/knockout",
      hasSeenSessionLanding: false,
      settings
    }),
    true
  );
  assert.equal(
    shouldForceDashboardStartThisSession({
      pathname: "/knockout",
      hasSeenSessionLanding: true,
      settings
    }),
    false
  );
  assert.equal(
    shouldForceDashboardStartThisSession({
      pathname: "/start-playing",
      hasSeenSessionLanding: false,
      settings
    }),
    false
  );
});

test("return-to-dashboard indicator only appears away from dashboard during active transition messaging", () => {
  const settings = resolveTournamentTransitionSettings({
    modality: "group_stage_live",
    dashboardMessage: {
      active: true,
      title: "Tournament mode is live",
      body: "Follow your live updates from the Dashboard.",
      dismissible: true
    },
    sessionBehavior: {
      startEachSessionOnDashboard: false,
      showReturnToDashboardIndicator: true
    }
  });

  assert.equal(
    shouldShowReturnToDashboardIndicator({
      pathname: "/leaderboard",
      settings
    }),
    true
  );
  assert.equal(
    shouldShowReturnToDashboardIndicator({
      pathname: "/dashboard",
      settings
    }),
    false
  );
  assert.equal(
    shouldShowReturnToDashboardIndicator({
      pathname: "/admin/players",
      settings
    }),
    false
  );
});

test("transition message ids change when modality or copy changes", () => {
  const first = resolveTournamentTransitionSettings({
    modality: "group_stage_live",
    dashboardMessage: {
      active: true,
      title: "Tournament mode is live",
      body: "Follow your live updates from the Dashboard.",
      dismissible: true
    }
  });
  const second = resolveTournamentTransitionSettings({
    modality: "knockout_live",
    dashboardMessage: {
      active: true,
      title: "Knockout mode is live",
      body: "Follow your live updates from the Dashboard.",
      dismissible: true
    }
  });

  assert.notEqual(buildTournamentTransitionMessageId(first), buildTournamentTransitionMessageId(second));
});
