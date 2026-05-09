export type CommercialTier = "player" | "captain" | "manager" | "director" | "managing_director";
export type AccessLevel = CommercialTier | "super_admin";
export type PlatformRole = "player" | "admin";
export type GroupRelation = {
  isOwner: boolean;
  isGroupManager: boolean;
};

export type LegacyManagerLimits = {
  maxGroups: number;
  maxMembersPerGroup: number;
};

export type TierAccessContext = {
  role?: PlatformRole | null;
  planTier?: string | null;
  managerLimits?: LegacyManagerLimits | null;
};

export type TierLimitSnapshot = {
  maxGroups: number | null;
  maxMembersPerGroup: number | null;
  businessMaxReach: number | null;
  isUnlimited: boolean;
  source: "super_admin" | "plan" | "legacy_override";
};

export type TierCapabilitySnapshot = {
  canCreateGroup: boolean;
  canManageOwnGroups: boolean;
  canManageMembersAndInvites: boolean;
  canCreateInviteCode: boolean;
  canDeactivateInviteCode: boolean;
  canManageSocialTrophies: boolean;
  canAwardSocialTrophies: boolean;
  canUseDirectorCustomization: boolean;
  canUseManagingDirectorDelegation: boolean;
  canPostAnnouncement: boolean;
  canAccessSuperAdmin: boolean;
  canSeeOrganizerControls: boolean;
  canUseSponsorPrizeMessaging: boolean;
  canUseSidePickManagement: boolean;
  canChooseGroupDescription: boolean;
  canManageOrganizationBranding: boolean;
  canModerateOrganizationBranding: boolean;
};

export type ResolvedTierAccess = {
  accessLevel: AccessLevel;
  commercialTier: CommercialTier | null;
  label: string;
  shortLabel: string;
  limits: TierLimitSnapshot;
  capabilities: TierCapabilitySnapshot;
  hasLegacyManagerOverride: boolean;
};

export type CommercialTierDefinition = {
  label: string;
  shortLabel: string;
  maxGroups: number;
  maxMembersPerGroup: number;
  businessMaxReach: number;
};

export const COMMERCIAL_TIER_DEFINITIONS: Record<CommercialTier, CommercialTierDefinition> = {
  player: {
    label: "Player",
    shortLabel: "P",
    maxGroups: 0,
    maxMembersPerGroup: 0,
    businessMaxReach: 1
  },
  captain: {
    label: "Captain",
    shortLabel: "C",
    maxGroups: 1,
    maxMembersPerGroup: 20,
    businessMaxReach: 21
  },
  manager: {
    label: "Manager",
    shortLabel: "M",
    maxGroups: 3,
    maxMembersPerGroup: 30,
    businessMaxReach: 91
  },
  director: {
    label: "Director",
    shortLabel: "D",
    maxGroups: 10,
    maxMembersPerGroup: 100,
    businessMaxReach: 1001
  },
  managing_director: {
    label: "Managing Director",
    shortLabel: "MD",
    maxGroups: 25,
    maxMembersPerGroup: 100,
    businessMaxReach: 2501
  }
};

export const COMMERCIAL_TIER_ORDER: CommercialTier[] = [
  "player",
  "captain",
  "manager",
  "director",
  "managing_director"
];

export const ADMIN_ASSIGNABLE_ACCESS_LEVELS: AccessLevel[] = [
  "player",
  "captain",
  "manager",
  "director",
  "managing_director",
  "super_admin"
];

export const ACCESS_LEVEL_ORDER: AccessLevel[] = [
  "player",
  "captain",
  "manager",
  "director",
  "managing_director",
  "super_admin"
];

export function normalizeCommercialTier(value: unknown): CommercialTier | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return COMMERCIAL_TIER_ORDER.find((tier) => tier === normalized) ?? null;
}

export function normalizeAccessLevel(value: unknown): AccessLevel | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "super_admin") {
    return "super_admin";
  }

  return normalizeCommercialTier(normalized);
}

export function getAccessLevelDisplayLabel(accessLevel: AccessLevel) {
  if (accessLevel === "super_admin") {
    return "Super Admin";
  }

  return COMMERCIAL_TIER_DEFINITIONS[accessLevel].label;
}

export function compareAccessLevels(left: AccessLevel, right: AccessLevel) {
  return ACCESS_LEVEL_ORDER.indexOf(left) - ACCESS_LEVEL_ORDER.indexOf(right);
}

export function resolveCommercialTier(context: TierAccessContext): CommercialTier {
  const explicitTier = normalizeCommercialTier(context.planTier);
  if (explicitTier) {
    return explicitTier;
  }

  if (context.managerLimits) {
    return "manager";
  }

  return "player";
}

export function resolveAccessLevel(context: TierAccessContext): AccessLevel {
  if (context.role === "admin") {
    return "super_admin";
  }

  return resolveCommercialTier(context);
}

export function resolveTierAccess(context: TierAccessContext): ResolvedTierAccess {
  const accessLevel = resolveAccessLevel(context);

  if (accessLevel === "super_admin") {
    return {
      accessLevel,
      commercialTier: normalizeCommercialTier(context.planTier),
      label: "Super Admin",
      shortLabel: "SA",
      limits: {
        maxGroups: null,
        maxMembersPerGroup: null,
        businessMaxReach: null,
        isUnlimited: true,
        source: "super_admin"
      },
      capabilities: {
        canCreateGroup: true,
        canManageOwnGroups: true,
        canManageMembersAndInvites: true,
        canCreateInviteCode: true,
        canDeactivateInviteCode: true,
        canManageSocialTrophies: true,
        canAwardSocialTrophies: true,
        canUseDirectorCustomization: true,
        canUseManagingDirectorDelegation: true,
        canPostAnnouncement: true,
        canAccessSuperAdmin: true,
        canSeeOrganizerControls: true,
        canUseSponsorPrizeMessaging: true,
        canUseSidePickManagement: true,
        canChooseGroupDescription: true,
        canManageOrganizationBranding: true,
        canModerateOrganizationBranding: true
      },
      hasLegacyManagerOverride: false
    };
  }

  const commercialTier = resolveCommercialTier(context);
  const definition = COMMERCIAL_TIER_DEFINITIONS[commercialTier];
  const hasLegacyManagerOverride = Boolean(context.managerLimits);
  const maxGroups = context.managerLimits?.maxGroups ?? definition.maxGroups;
  const maxMembersPerGroup = context.managerLimits?.maxMembersPerGroup ?? definition.maxMembersPerGroup;
  const hasOrganizerAccess = commercialTier !== "player";
  const hasManagerTooling =
    commercialTier === "manager" || commercialTier === "director" || commercialTier === "managing_director";
  const hasDirectorTooling = commercialTier === "director" || commercialTier === "managing_director";

  return {
    accessLevel,
    commercialTier,
    label: definition.label,
    shortLabel: definition.shortLabel,
    limits: {
      maxGroups,
      maxMembersPerGroup,
      businessMaxReach: definition.businessMaxReach,
      isUnlimited: false,
      source: hasLegacyManagerOverride ? "legacy_override" : "plan"
    },
    capabilities: {
      canCreateGroup: maxGroups > 0,
      canManageOwnGroups: hasOrganizerAccess,
      canManageMembersAndInvites: hasOrganizerAccess,
      canCreateInviteCode: hasOrganizerAccess,
      canDeactivateInviteCode: hasOrganizerAccess,
      canManageSocialTrophies: hasManagerTooling,
      canAwardSocialTrophies: hasManagerTooling,
      canUseDirectorCustomization: hasDirectorTooling,
      canUseManagingDirectorDelegation: false, // TODO(launch): add scoped org delegation once org boundaries exist.
      canPostAnnouncement: false, // TODO(launch): wire this up only when a lightweight pinned message model exists.
      canAccessSuperAdmin: false,
      canSeeOrganizerControls: hasOrganizerAccess,
      canUseSponsorPrizeMessaging: false, // TODO(launch): display-only sponsor/prize messaging belongs to Director+.
      canUseSidePickManagement: hasDirectorTooling,
      canChooseGroupDescription: hasOrganizerAccess,
      canManageOrganizationBranding: commercialTier === "managing_director",
      canModerateOrganizationBranding: false
    },
    hasLegacyManagerOverride
  };
}

export function hasOrganizerAccess(accessLevel: AccessLevel) {
  return accessLevel !== "player";
}

export function hasManagerAccess(accessLevel: AccessLevel) {
  return accessLevel === "manager" || accessLevel === "director" || accessLevel === "managing_director" || accessLevel === "super_admin";
}

export function hasDirectorAccess(accessLevel: AccessLevel) {
  return accessLevel === "director" || accessLevel === "managing_director" || accessLevel === "super_admin";
}

export function canManageOrganizationBranding(accessLevel: AccessLevel) {
  return accessLevel === "managing_director" || accessLevel === "super_admin";
}

export function canModerateOrganizationBranding(accessLevel: AccessLevel) {
  return accessLevel === "super_admin";
}

export function hasManagingDirectorAccess(accessLevel: AccessLevel) {
  return accessLevel === "managing_director" || accessLevel === "super_admin";
}

export function canCreateGroup(context: TierAccessContext) {
  return resolveTierAccess(context).capabilities.canCreateGroup;
}

export function canManageGroup(context: TierAccessContext, relation: GroupRelation) {
  const access = resolveTierAccess(context);
  if (access.capabilities.canAccessSuperAdmin) {
    return true;
  }

  return access.capabilities.canManageOwnGroups && (relation.isOwner || relation.isGroupManager);
}

export function canInviteMember(context: TierAccessContext, relation: GroupRelation) {
  const access = resolveTierAccess(context);
  return access.capabilities.canManageMembersAndInvites && canManageGroup(context, relation);
}

export function canAwardSocialTrophy(context: TierAccessContext, relation: GroupRelation) {
  const access = resolveTierAccess(context);
  return access.capabilities.canAwardSocialTrophies && canManageGroup(context, relation);
}

export function canPostAnnouncement(context: TierAccessContext, relation: GroupRelation) {
  const access = resolveTierAccess(context);
  return access.capabilities.canPostAnnouncement && canManageGroup(context, relation);
}

export function canUseDirectorCustomization(context: TierAccessContext, relation: GroupRelation) {
  const access = resolveTierAccess(context);
  return access.capabilities.canUseDirectorCustomization && canManageGroup(context, relation);
}

export function canAccessSuperAdmin(context: TierAccessContext) {
  return resolveTierAccess(context).capabilities.canAccessSuperAdmin;
}

export function getEffectiveMembershipLimitForGroup(
  configuredMembershipLimit: number,
  context: TierAccessContext
) {
  const access = resolveTierAccess(context);
  if (access.limits.isUnlimited || access.limits.maxMembersPerGroup === null) {
    return configuredMembershipLimit;
  }

  return Math.min(configuredMembershipLimit, access.limits.maxMembersPerGroup);
}

export function getEffectiveManagedGroupLimit(context: TierAccessContext) {
  const access = resolveTierAccess(context);
  return access.limits.maxGroups;
}

export function isAtOrOverManagedGroupLimit(activeManagedGroupCount: number, context: TierAccessContext) {
  const access = resolveTierAccess(context);
  if (access.limits.isUnlimited || access.limits.maxGroups === null) {
    return false;
  }

  return activeManagedGroupCount >= access.limits.maxGroups;
}

export function isAtOrOverEffectiveMembershipLimit(
  occupiedSeats: number,
  configuredMembershipLimit: number,
  context: TierAccessContext
) {
  return occupiedSeats >= getEffectiveMembershipLimitForGroup(configuredMembershipLimit, context);
}
