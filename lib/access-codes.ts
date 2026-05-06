export type AccessCodeFailureReason =
  | "invalid"
  | "inactive"
  | "expired"
  | "full"
  | "group_full"
  | "group_unavailable"
  | "redemption_failed";

export const ACCESS_CODE_ERROR_KEY = {
  invalid: "ACCESS_CODE_INVALID",
  inactive: "ACCESS_CODE_INACTIVE",
  expired: "ACCESS_CODE_EXPIRED",
  full: "ACCESS_CODE_FULL",
  groupFull: "ACCESS_CODE_GROUP_FULL",
  groupUnavailable: "ACCESS_CODE_GROUP_UNAVAILABLE",
  redemptionFailed: "ACCESS_CODE_REDEMPTION_FAILED"
} as const;

export function normalizeAccessCode(value: string) {
  const normalized = value.replace(/\s+/g, "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : "";
}

export function getAccessCodeBlockedMessage(reason: AccessCodeFailureReason) {
  if (reason === "invalid") {
    return "That code does not exist or is not available.";
  }

  if (reason === "inactive") {
    return "This code is not active.";
  }

  if (reason === "expired") {
    return "This code has expired.";
  }

  if (reason === "full") {
    return "This code has reached its limit.";
  }

  if (reason === "group_full") {
    return "This code's group is full.";
  }

  if (reason === "group_unavailable") {
    return "This code is no longer available for its group.";
  }

  if (reason === "redemption_failed") {
    return "That code looked valid, but we couldn't finish signup. Ask the pool admin to verify access-code setup.";
  }

  return "That code is not valid or is no longer available.";
}

export function getAccessCodeFailureReasonFromMessage(message: string): AccessCodeFailureReason | null {
  const normalized = message.toLowerCase();

  if (normalized.includes(ACCESS_CODE_ERROR_KEY.expired.toLowerCase())) {
    return "expired";
  }

  if (normalized.includes(ACCESS_CODE_ERROR_KEY.full.toLowerCase())) {
    return "full";
  }

  if (normalized.includes(ACCESS_CODE_ERROR_KEY.groupFull.toLowerCase())) {
    return "group_full";
  }

  if (normalized.includes(ACCESS_CODE_ERROR_KEY.groupUnavailable.toLowerCase())) {
    return "group_unavailable";
  }

  if (normalized.includes(ACCESS_CODE_ERROR_KEY.redemptionFailed.toLowerCase())) {
    return "redemption_failed";
  }

  if (normalized.includes(ACCESS_CODE_ERROR_KEY.inactive.toLowerCase())) {
    return "inactive";
  }

  if (normalized.includes(ACCESS_CODE_ERROR_KEY.invalid.toLowerCase())) {
    return "invalid";
  }

  return null;
}
