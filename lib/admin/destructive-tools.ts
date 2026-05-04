import "server-only";

export type TestingResetType = "knockout" | "group";

export type ResetDiagnostics = {
  nodeEnv: string;
  vercelEnv: string;
  isProductionDeployment: boolean;
  allowProductionKnockoutResetPresent: boolean;
  allowProductionKnockoutResetIsTrue: boolean;
  allowProductionGroupResetPresent: boolean;
  allowProductionGroupResetIsTrue: boolean;
};

export type TestingResetAvailability = ResetDiagnostics & {
  resetType: TestingResetType;
  environmentResetAllowed: boolean;
  productionResetRequired: boolean;
  productionResetAllowed: boolean;
  canRun: boolean;
  disabledReason: string | null;
};

export function getResetDiagnostics(): ResetDiagnostics {
  const nodeEnv = process.env.NODE_ENV ?? "unknown";
  const vercelEnv = process.env.VERCEL_ENV ?? "unknown";
  const isProductionDeployment = nodeEnv === "production" && vercelEnv === "production";

  return {
    nodeEnv,
    vercelEnv,
    isProductionDeployment,
    allowProductionKnockoutResetPresent: typeof process.env.ALLOW_PRODUCTION_KNOCKOUT_RESET !== "undefined",
    allowProductionKnockoutResetIsTrue: process.env.ALLOW_PRODUCTION_KNOCKOUT_RESET === "true",
    allowProductionGroupResetPresent: typeof process.env.ALLOW_PRODUCTION_GROUP_RESET !== "undefined",
    allowProductionGroupResetIsTrue: process.env.ALLOW_PRODUCTION_GROUP_RESET === "true"
  };
}

export function getTestingResetAvailability(resetType: TestingResetType): TestingResetAvailability {
  // Server-only env guards. After changing these locally, restart `npm run dev`.
  // In Vercel, env changes require redeploying the target environment.
  const diagnostics = getResetDiagnostics();
  const productionResetRequired = diagnostics.isProductionDeployment;
  const productionResetAllowed =
    !productionResetRequired ||
    (resetType === "knockout"
      ? diagnostics.allowProductionKnockoutResetIsTrue
      : diagnostics.allowProductionGroupResetIsTrue);
  const canRun = productionResetAllowed;

  let disabledReason: string | null = null;
  if (!productionResetAllowed) {
    disabledReason =
      resetType === "knockout"
        ? "Production knockout reset is disabled. Set ALLOW_PRODUCTION_KNOCKOUT_RESET=true and redeploy."
        : "Production group-stage reset is disabled. Set ALLOW_PRODUCTION_GROUP_RESET=true and redeploy.";
  }

  return {
    ...diagnostics,
    resetType,
    environmentResetAllowed: canRun,
    productionResetRequired,
    productionResetAllowed,
    canRun,
    disabledReason
  };
}

export function logTestingResetEnvDiagnostics(
  source:
    | "adminMatchesPage"
    | "getDestructiveAdminToolStatusAction"
    | "resetKnockoutTestingDataAction"
    | "resetGroupStageTestingDataAction"
    | "batchFinalizeMatchResultsAction",
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
    ALLOW_PRODUCTION_KNOCKOUT_RESET_present: diagnostics.allowProductionKnockoutResetPresent,
    ALLOW_PRODUCTION_KNOCKOUT_RESET_isTrue: diagnostics.allowProductionKnockoutResetIsTrue,
    ALLOW_PRODUCTION_GROUP_RESET_present: diagnostics.allowProductionGroupResetPresent,
    ALLOW_PRODUCTION_GROUP_RESET_isTrue: diagnostics.allowProductionGroupResetIsTrue,
    knockoutCanRun: getTestingResetAvailability("knockout").canRun,
    knockoutDisabledReason: getTestingResetAvailability("knockout").disabledReason,
    groupCanRun: getTestingResetAvailability("group").canRun,
    groupDisabledReason: getTestingResetAvailability("group").disabledReason
  });
}
