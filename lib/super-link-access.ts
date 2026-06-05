import {
  COMMERCIAL_TIER_DEFINITIONS,
  COMMERCIAL_TIER_ORDER,
  normalizeCommercialTier,
  type CommercialTier
} from "@/lib/tier-access";

export const ACCESS_CODE_TYPES = ["standard", "super_link"] as const;

export type AccessCodeType = (typeof ACCESS_CODE_TYPES)[number];

export const SUPER_LINK_GRANT_TIERS = COMMERCIAL_TIER_ORDER;

export function normalizeAccessCodeType(value: unknown): AccessCodeType {
  return value === "super_link" ? "super_link" : "standard";
}

export function normalizeSuperLinkGrantTier(value: unknown): CommercialTier {
  return normalizeCommercialTier(value) ?? "player";
}

export function getCommercialTierRank(tier: unknown) {
  const normalizedTier = normalizeCommercialTier(tier) ?? "player";
  return COMMERCIAL_TIER_ORDER.indexOf(normalizedTier);
}

export function shouldApplyCommercialTierGrant(currentTier: unknown, grantedTier: unknown) {
  return getCommercialTierRank(grantedTier) > getCommercialTierRank(currentTier);
}

export function getCommercialTierLabel(tier: unknown) {
  const normalizedTier = normalizeCommercialTier(tier) ?? "player";
  return COMMERCIAL_TIER_DEFINITIONS[normalizedTier].label;
}
