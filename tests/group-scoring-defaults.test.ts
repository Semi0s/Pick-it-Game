import test from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_BONUS_MODE_PRESETS,
  MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS
} from "../lib/group-scoring-defaults.ts";
import { resolveTierAccess } from "../lib/tier-access.ts";

test("manager-compatible group scoring defaults use standard simple scoring", () => {
  assert.deepEqual(MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS, {
    groupStageMode: "light_seed_builder",
    groupStagePredictionDepth: "simple_results",
    fullMatchScoringVariant: "classic",
    groupBonusMode: "classic"
  });

  assert.deepEqual(GROUP_BONUS_MODE_PRESETS[MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS.groupBonusMode], {
    earlyGroupStageCompletionBonus: 0,
    knockoutCompletionBonus: 0,
    finalMatchupBonus: 0,
    exactFinalScoreBonus: 0
  });
});

test("league tiers keep organizer capacity without custom scoring tooling", () => {
  const leagueAccess = resolveTierAccess({ planTier: "director" });
  const leaguePlusAccess = resolveTierAccess({ planTier: "managing_director" });

  assert.equal(leagueAccess.capabilities.canCreateGroup, true);
  assert.equal(leagueAccess.capabilities.canUseDirectorCustomization, false);
  assert.equal(leagueAccess.capabilities.canUseSidePickManagement, false);
  assert.equal(leagueAccess.capabilities.canManageSocialTrophies, true);

  assert.equal(leaguePlusAccess.capabilities.canCreateGroup, true);
  assert.equal(leaguePlusAccess.capabilities.canUseDirectorCustomization, false);
  assert.equal(leaguePlusAccess.capabilities.canUseSidePickManagement, false);
  assert.equal(leaguePlusAccess.capabilities.canManageOrganizationBranding, true);
});
