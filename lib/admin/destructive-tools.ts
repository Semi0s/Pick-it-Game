import "server-only";

export type AdminRecoveryScope =
  | "user"
  | "group"
  | "match"
  | "group_stage"
  | "bracket_builder"
  | "knockout"
  | "leaderboard"
  | "social"
  | "full_test"
  | "batch_finalize";

export type AdminRecoveryToolDefinition = {
  actionKey: string;
  scope: AdminRecoveryScope;
  clears: string[];
  preserves: string[];
  shouldAlsoClear: string[];
  bumpsResetEpoch: boolean;
  writesAuditLog: boolean;
  superAdminOnly: boolean;
  safeInProduction: boolean;
};

export const ADMIN_RESET_TOOL_DEFINITIONS: Record<string, AdminRecoveryToolDefinition> = {
  clear_user_test_predictions: {
    actionKey: "clear_user_test_predictions",
    scope: "user",
    clears: ["predictions", "prediction_scores", "bracket_predictions", "projected_bracket_predictions", "bracket_scores", "user leaderboard rows"],
    preserves: ["account", "profile", "memberships", "groups"],
    shouldAlsoClear: ["legacy bracket picks", "event-backed notifications", "stale leaderboard snapshots"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  reset_group_local_state: {
    actionKey: "reset_group_local_state",
    scope: "group",
    clears: ["group leaderboard snapshots", "group leaderboard events", "group bonus overlays"],
    preserves: ["group identity", "group owner", "members", "global predictions"],
    shouldAlsoClear: ["group-local notification rows", "group-local custom scoring overlays"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  reset_match_to_open: {
    actionKey: "reset_match_to_open",
    scope: "match",
    clears: ["actual scores", "winner", "finalized state", "derived scoring rows"],
    preserves: ["match schedule", "team assignments unless broader reset clears them"],
    shouldAlsoClear: ["manual override flags", "sync status", "stale knockout downstream slots"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  reset_group_stage_test_data: {
    actionKey: "reset_group_stage_test_data",
    scope: "group_stage",
    clears: ["group match results", "group predictions", "group prediction_scores", "derived knockout seeds"],
    preserves: ["official schedule", "group match team assignments"],
    shouldAlsoClear: ["legacy bracket artifacts", "stale dashboard history", "stale leaderboard snapshots"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  clear_bracket_builder_snapshots: {
    actionKey: "clear_bracket_builder_snapshots",
    scope: "bracket_builder",
    clears: ["user Bracket Builder seed rankings", "user best-third selections"],
    preserves: ["match results", "group-stage score predictions", "knockout predictions", "leaderboard totals"],
    shouldAlsoClear: ["stale projected bracket previews based on saved bracket-builder state"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  reset_knockout_test_data: {
    actionKey: "reset_knockout_test_data",
    scope: "knockout",
    clears: ["seeded knockout teams", "bracket predictions", "projected bracket predictions", "bracket scores", "knockout leaderboard rows"],
    preserves: ["group-stage predictions", "group-stage match schedule"],
    shouldAlsoClear: ["legacy projected picks", "stale downstream winners", "stale seeded/open state"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  repair_leaderboards: {
    actionKey: "repair_leaderboards",
    scope: "leaderboard",
    clears: ["stale derived leaderboard snapshots"],
    preserves: ["predictions", "scores", "match state"],
    shouldAlsoClear: ["ghost user rows caused by previous partial resets"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  reset_testing_social_state: {
    actionKey: "reset_testing_social_state",
    scope: "social",
    clears: ["comments", "reactions", "notifications", "movement history", "manual trophies"],
    preserves: ["predictions", "scores", "matches"],
    shouldAlsoClear: ["stale dashboard movement history"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  full_prelaunch_test_reset: {
    actionKey: "full_prelaunch_test_reset",
    scope: "full_test",
    clears: ["group-stage test data", "knockout test data", "social test data", "derived leaderboard state"],
    preserves: ["accounts", "groups", "tier assignments", "branding settings"],
    shouldAlsoClear: ["dashboard/client reset epoch", "stale local UI history"],
    bumpsResetEpoch: true,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  },
  batch_finalize_test_matches: {
    actionKey: "batch_finalize_test_matches",
    scope: "batch_finalize",
    clears: [],
    preserves: ["existing predictions", "existing structure"],
    shouldAlsoClear: ["stale leaderboard rows before overwrite where needed"],
    bumpsResetEpoch: false,
    writesAuditLog: true,
    superAdminOnly: true,
    safeInProduction: false
  }
};

const PRODUCTION_SCOPE_ENV_KEYS: Record<AdminRecoveryScope, string[]> = {
  user: ["ALLOW_PRODUCTION_ADMIN_RESETS"],
  group: ["ALLOW_PRODUCTION_ADMIN_RESETS"],
  match: ["ALLOW_PRODUCTION_ADMIN_RESETS"],
  group_stage: ["ALLOW_PRODUCTION_GROUP_RESET", "ALLOW_PRODUCTION_ADMIN_RESETS"],
  bracket_builder: ["ALLOW_PRODUCTION_ADMIN_RESETS"],
  knockout: ["ALLOW_PRODUCTION_KNOCKOUT_RESET", "ALLOW_PRODUCTION_ADMIN_RESETS"],
  leaderboard: ["ALLOW_PRODUCTION_ADMIN_RESETS"],
  social: ["ALLOW_PRODUCTION_ADMIN_RESETS"],
  full_test: ["ALLOW_PRODUCTION_ADMIN_RESETS"],
  batch_finalize: ["ALLOW_PRODUCTION_KNOCKOUT_RESET", "ALLOW_PRODUCTION_ADMIN_RESETS"]
};

export type ResetDiagnostics = {
  nodeEnv: string;
  vercelEnv: string;
  isProductionDeployment: boolean;
  enableDestructiveAdminToolsPresent: boolean;
  enableDestructiveAdminToolsIsTrue: boolean;
  allowProductionAdminResetsPresent: boolean;
  allowProductionAdminResetsIsTrue: boolean;
  allowProductionKnockoutResetPresent: boolean;
  allowProductionKnockoutResetIsTrue: boolean;
  allowProductionGroupResetPresent: boolean;
  allowProductionGroupResetIsTrue: boolean;
};

export type TestingResetAvailability = ResetDiagnostics & {
  resetType: AdminRecoveryScope;
  environmentResetAllowed: boolean;
  productionResetRequired: boolean;
  productionResetAllowed: boolean;
  canRun: boolean;
  disabledReason: string | null;
  checkedEnvKeys: string[];
};

export function getResetDiagnostics(): ResetDiagnostics {
  const nodeEnv = process.env.NODE_ENV ?? "unknown";
  const vercelEnv = process.env.VERCEL_ENV ?? "unknown";
  const isProductionDeployment = nodeEnv === "production" && vercelEnv === "production";

  return {
    nodeEnv,
    vercelEnv,
    isProductionDeployment,
    enableDestructiveAdminToolsPresent: typeof process.env.ENABLE_DESTRUCTIVE_ADMIN_TOOLS !== "undefined",
    enableDestructiveAdminToolsIsTrue: process.env.ENABLE_DESTRUCTIVE_ADMIN_TOOLS === "true",
    allowProductionAdminResetsPresent: typeof process.env.ALLOW_PRODUCTION_ADMIN_RESETS !== "undefined",
    allowProductionAdminResetsIsTrue: process.env.ALLOW_PRODUCTION_ADMIN_RESETS === "true",
    allowProductionKnockoutResetPresent: typeof process.env.ALLOW_PRODUCTION_KNOCKOUT_RESET !== "undefined",
    allowProductionKnockoutResetIsTrue: process.env.ALLOW_PRODUCTION_KNOCKOUT_RESET === "true",
    allowProductionGroupResetPresent: typeof process.env.ALLOW_PRODUCTION_GROUP_RESET !== "undefined",
    allowProductionGroupResetIsTrue: process.env.ALLOW_PRODUCTION_GROUP_RESET === "true"
  };
}

function isEnvKeyEnabled(envKey: string, diagnostics: ResetDiagnostics) {
  switch (envKey) {
    case "ENABLE_DESTRUCTIVE_ADMIN_TOOLS":
      return diagnostics.enableDestructiveAdminToolsIsTrue;
    case "ALLOW_PRODUCTION_ADMIN_RESETS":
      return diagnostics.allowProductionAdminResetsIsTrue;
    case "ALLOW_PRODUCTION_KNOCKOUT_RESET":
      return diagnostics.allowProductionKnockoutResetIsTrue;
    case "ALLOW_PRODUCTION_GROUP_RESET":
      return diagnostics.allowProductionGroupResetIsTrue;
    default:
      return false;
  }
}

function formatScopeLabel(scope: AdminRecoveryScope) {
  return scope.replace(/_/g, " ");
}

export function getTestingResetAvailability(resetType: AdminRecoveryScope): TestingResetAvailability {
  const diagnostics = getResetDiagnostics();
  const checkedEnvKeys = PRODUCTION_SCOPE_ENV_KEYS[resetType] ?? ["ALLOW_PRODUCTION_ADMIN_RESETS"];
  const productionResetRequired = diagnostics.isProductionDeployment;
  const destructiveToolsExplicitlyDisabled =
    diagnostics.enableDestructiveAdminToolsPresent && !diagnostics.enableDestructiveAdminToolsIsTrue;
  const productionResetAllowed =
    !productionResetRequired || checkedEnvKeys.some((envKey) => isEnvKeyEnabled(envKey, diagnostics));
  const canRun = !destructiveToolsExplicitlyDisabled && productionResetAllowed;

  let disabledReason: string | null = null;
  if (destructiveToolsExplicitlyDisabled) {
    disabledReason = "Destructive admin tools are disabled. Set ENABLE_DESTRUCTIVE_ADMIN_TOOLS=true and restart or redeploy.";
  } else if (!productionResetAllowed) {
    disabledReason = `Production ${formatScopeLabel(resetType)} reset is disabled. Enable one of: ${checkedEnvKeys.join(", ")}.`;
  }

  return {
    ...diagnostics,
    resetType,
    environmentResetAllowed: canRun,
    productionResetRequired,
    productionResetAllowed,
    canRun,
    disabledReason,
    checkedEnvKeys
  };
}

export function isSelfServiceTestResetEnabled() {
  // TODO(testing-cleanup): remove or minimize this temporary self-service testing tool before broader launch.
  return process.env.ENABLE_SELF_SERVICE_TEST_RESETS === "true";
}

export function logTestingResetEnvDiagnostics(
  source:
    | "adminMatchesPage"
    | "getDestructiveAdminToolStatusAction"
    | "resetKnockoutTestingDataAction"
    | "resetGroupStageTestingDataAction"
    | "clearBracketBuilderSnapshotsAction"
    | "batchFinalizeMatchResultsAction"
    | "batchClearMatchResultsAction"
    | "clearUserTestPredictionsAction"
    | "resetGroupLocalDerivedStateAction"
    | "resetMatchToOpenAction"
    | "repairLeaderboardStateAction"
    | "fullPreLaunchTestResetAction",
  actor?: { adminUserId?: string; adminEmail?: string | null }
) {
  const diagnostics = getResetDiagnostics();

  console.info("[testing-reset-env]", {
    source,
    adminUserId: actor?.adminUserId ?? null,
    adminEmail: actor?.adminEmail ?? null,
    nodeEnv: diagnostics.nodeEnv,
    vercelEnv: diagnostics.vercelEnv,
    isProductionDeployment: diagnostics.isProductionDeployment,
    ENABLE_DESTRUCTIVE_ADMIN_TOOLS_present: diagnostics.enableDestructiveAdminToolsPresent,
    ENABLE_DESTRUCTIVE_ADMIN_TOOLS_isTrue: diagnostics.enableDestructiveAdminToolsIsTrue,
    ALLOW_PRODUCTION_ADMIN_RESETS_present: diagnostics.allowProductionAdminResetsPresent,
    ALLOW_PRODUCTION_ADMIN_RESETS_isTrue: diagnostics.allowProductionAdminResetsIsTrue,
    ALLOW_PRODUCTION_KNOCKOUT_RESET_present: diagnostics.allowProductionKnockoutResetPresent,
    ALLOW_PRODUCTION_KNOCKOUT_RESET_isTrue: diagnostics.allowProductionKnockoutResetIsTrue,
    ALLOW_PRODUCTION_GROUP_RESET_present: diagnostics.allowProductionGroupResetPresent,
    ALLOW_PRODUCTION_GROUP_RESET_isTrue: diagnostics.allowProductionGroupResetIsTrue,
    knockoutCanRun: getTestingResetAvailability("knockout").canRun,
    knockoutDisabledReason: getTestingResetAvailability("knockout").disabledReason,
    groupStageCanRun: getTestingResetAvailability("group_stage").canRun,
    groupStageDisabledReason: getTestingResetAvailability("group_stage").disabledReason,
    matchCanRun: getTestingResetAvailability("match").canRun,
    matchDisabledReason: getTestingResetAvailability("match").disabledReason,
    fullTestCanRun: getTestingResetAvailability("full_test").canRun,
    fullTestDisabledReason: getTestingResetAvailability("full_test").disabledReason
  });
}
