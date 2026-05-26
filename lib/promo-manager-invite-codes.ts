import { normalizeAccessCode } from "./access-codes.ts";

export type PromoManagerInviteStatus = "active" | "paused" | "full" | "expired" | "archived";
export type PromoManagerInviteAvailabilityReason =
  | "invalid"
  | "not_started"
  | "paused"
  | "full"
  | "expired"
  | "archived"
  | "ineligible"
  | "unavailable";

export const PROMO_MANAGER_INVITE_ERROR_KEY = {
  invalid: "PROMO_MANAGER_CODE_INVALID",
  notStarted: "PROMO_MANAGER_CODE_NOT_STARTED",
  paused: "PROMO_MANAGER_CODE_PAUSED",
  full: "PROMO_MANAGER_CODE_FULL",
  expired: "PROMO_MANAGER_CODE_EXPIRED",
  archived: "PROMO_MANAGER_CODE_ARCHIVED",
  ineligible: "PROMO_MANAGER_INELIGIBLE",
  userUnavailable: "PROMO_MANAGER_USER_UNAVAILABLE"
} as const;

export const PROMO_MANAGER_INVITE_CODE_PATTERN = /^[A-Za-z0-9-]{4,32}$/;

export type PromoManagerInviteStatusInput = {
  status: PromoManagerInviteStatus;
  startsAt?: string | null;
  expiresAt?: string | null;
  redemptionCount: number;
  maxRedemptions: number;
};

export function normalizePromoManagerInviteCode(value: string) {
  return normalizeAccessCode(value);
}

export function formatPromoManagerInviteCode(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase();
}

export function getPromoManagerInviteAvailability(input: PromoManagerInviteStatusInput, now = Date.now()) {
  if (input.status === "archived") {
    return { claimable: false, reason: "archived" as const };
  }

  if (input.status === "paused") {
    return { claimable: false, reason: "paused" as const };
  }

  if (input.startsAt && new Date(input.startsAt).getTime() > now) {
    return { claimable: false, reason: "not_started" as const };
  }

  if (input.status === "expired" || (input.expiresAt && new Date(input.expiresAt).getTime() <= now)) {
    return { claimable: false, reason: "expired" as const };
  }

  if (input.status === "full" || input.redemptionCount >= input.maxRedemptions) {
    return { claimable: false, reason: "full" as const };
  }

  return { claimable: true, reason: null };
}

export function getPromoManagerInviteReasonFromMessage(message: string): PromoManagerInviteAvailabilityReason | null {
  const normalized = message.toLowerCase();

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.notStarted.toLowerCase())) {
    return "not_started";
  }

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.paused.toLowerCase())) {
    return "paused";
  }

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.full.toLowerCase())) {
    return "full";
  }

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.expired.toLowerCase())) {
    return "expired";
  }

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.archived.toLowerCase())) {
    return "archived";
  }

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.ineligible.toLowerCase())) {
    return "ineligible";
  }

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.userUnavailable.toLowerCase())) {
    return "unavailable";
  }

  if (normalized.includes(PROMO_MANAGER_INVITE_ERROR_KEY.invalid.toLowerCase())) {
    return "invalid";
  }

  return null;
}
