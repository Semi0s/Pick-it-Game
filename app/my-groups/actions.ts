"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { fetchBooleanAppSetting, fetchIntegerAppSetting } from "@/lib/app-settings";
import { normalizeAccessCode } from "@/lib/access-codes";
import { buildGroupInviteEmailCopy, getSafeEmailLanguage } from "@/lib/email-copy";
import { ensureUserCanJoinAnotherGroup, fetchJoinedPlayerGroupCount } from "@/lib/group-membership-limits";
import {
  appendExplainerLanguageToPath,
  appendLanguageToPath,
  normalizeExplainerLanguage,
  normalizeLanguage,
  type ExplainerLanguage,
  type SupportedLanguage
} from "@/lib/i18n";
import { isMissingColumnError, isMissingStorageBucketError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/email-sender";
import { createTrophyEarnedNotifications } from "@/lib/notifications";
import {
  canAwardSocialTrophy,
  canManageGroup,
  canInviteMember,
  getEffectiveManagedGroupLimit,
  getEffectiveMembershipLimitForGroup,
  hasDirectorAccess,
  isAtOrOverManagedGroupLimit,
  normalizeCommercialTier,
  resolveTierAccess,
  type AccessLevel,
  type CommercialTier,
  type GroupRelation,
  type ResolvedTierAccess
} from "@/lib/tier-access";
import {
  fetchActiveGroupRulesets,
  fetchSidePickPackageOptions,
  normalizeManagedGroupRulesetStatus,
  rebuildGroupCustomBonusScores,
  resolveManagedGroupRulesetPreset,
  type ManagedGroupRulesetPresetKey,
  type ManagedGroupRulesetSummary,
  type SidePickPackageOption
} from "@/lib/scoped-scoring";
import {
  GROUP_BONUS_MODE_PRESETS,
  MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS
} from "@/lib/group-scoring-defaults";
import { normalizeGroupBaseMode, type GroupBaseMode } from "@/lib/play-mode";
import {
  getGroupAvatarExtension,
  getCaptainsPassStatusLabel,
  GROUP_AVATAR_BUCKET,
  getRemainingCaptainsPassAllowance,
  MAX_CAPTAIN_PRIVATE_GROUP_MEMBERS,
  MAX_GROUP_AVATAR_FILE_BYTES,
  MAX_CAPTAINS_PASS_ALLOWANCE,
  MAX_GROUP_NAME_LENGTH,
  normalizeCaptainsPassStatus,
  normalizeGroupAccessMode,
  normalizeGroupInviteIntent,
  normalizeGroupInviteSource,
  normalizeGroupJoinSource,
  normalizeGroupKind,
  parseAllowedEmailInput,
  type CaptainsPassStatus,
  type GroupAccessMode,
  type GroupInviteIntent,
  type GroupInviteSource,
  type GroupJoinSource,
  type GroupKind
} from "@/lib/group-management";
import { normalizeGroupStageMode } from "@/lib/group-stage-modes";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublicSiteUrl, getSiteUrl } from "@/lib/site-url";
import { DASHBOARD_UI_RESET_EPOCH_SETTING_KEY } from "@/lib/ui-storage-keys";

const DEFAULT_GROUP_MEMBERSHIP_LIMIT = 15;
const DEFAULT_INVITE_EXPIRY_DAYS = 14;
const GROUP_INVITE_RESEND_COOLDOWN_MS = 60 * 1000;
const GROUP_INVITE_RESEND_DAILY_LIMIT = 5;
const GROUP_INVITE_MANAGER_DAILY_LIMIT = 50;
const GROUP_SCORING_SETUP_GROUP_STAGE_MAX_DUE_DATE = "2026-06-13T00:00:00.000Z";
const MAX_CUSTOM_TROPHIES_PER_GROUP = 10;
const MAX_GROUP_INVITE_CUSTOM_MESSAGE_LENGTH = 280;
const MAX_MANAGED_GROUP_INVITE_CODE_ATTEMPTS = 5;
const MANAGED_GROUP_INVITE_CODE_PATTERN = /^[A-Z0-9-]{4,24}$/;
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GROUP_DESCRIPTION_LENGTH = 250;

type GroupStatus = "active" | "archived";
type GroupMemberRole = "manager" | "member";
type GroupInviteStatus = "pending" | "accepted" | "revoked" | "expired";
type PlatformRole = "player" | "admin";

type CurrentUserContext =
  | {
      ok: true;
      userId: string;
      email: string;
      role: PlatformRole;
      planTier: CommercialTier | null;
      accessLevel: AccessLevel;
      tierAccess: ResolvedTierAccess;
      managerLimits: {
        maxGroups: number;
        maxMembersPerGroup: number;
      } | null;
      preferredLanguage: SupportedLanguage;
    }
  | {
      ok: false;
      message: string;
    };

type ManagerLimitsRow = {
  user_id: string;
  max_groups: number;
  max_members_per_group: number;
};

type GroupRow = {
  id: string;
  name: string;
  avatar_url?: string | null;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  membership_limit: number;
  description?: string | null;
  access_mode?: GroupAccessMode | null;
  group_kind?: GroupKind | null;
  parent_group_id?: string | null;
  status: GroupStatus;
  created_at: string;
  updated_at: string;
};

type GroupAllowedEmailRow = {
  id: string;
  group_id: string;
  email_normalized: string;
  display_name?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
};

type GroupFocusTeamRow = {
  id: string;
  group_id: string;
  team_id: string;
  created_by_user_id?: string | null;
  created_at: string;
  team?:
    | { id: string; name: string; short_name: string; group_name: string; flag_emoji?: string | null }
    | Array<{ id: string; name: string; short_name: string; group_name: string; flag_emoji?: string | null }>
    | null;
};

type CaptainsPassRow = {
  id: string;
  manager_group_id: string;
  captain_user_id?: string | null;
  captain_email_normalized?: string | null;
  issued_by_user_id?: string | null;
  status: CaptainsPassStatus;
  manager_group_invite_allowance: number;
  manager_group_invites_used: number;
  captain_private_group_id?: string | null;
  created_at: string;
  claimed_at?: string | null;
  expires_at?: string | null;
  captain_user?:
    | { id: string; name: string; email: string }
    | Array<{ id: string; name: string; email: string }>
    | null;
  captain_private_group?:
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
};

type GroupInviteRow = {
  id: string;
  group_id: string;
  email: string;
  normalized_email: string;
  invited_by_user_id: string | null;
  suggested_display_name?: string | null;
  custom_message?: string | null;
  language?: string | null;
  helper_language?: string | null;
  status: GroupInviteStatus;
  token_hash: string;
  claim_token?: string | null;
  expires_at?: string | null;
  accepted_by_user_id?: string | null;
  accepted_at?: string | null;
  email_status?: "pending" | "sent" | "failed" | null;
  email_sent_at?: string | null;
  email_provider_message_id?: string | null;
  email_error?: string | null;
  email_attempt_count?: number | null;
  last_email_attempt_at?: string | null;
  last_resent_by_user_id?: string | null;
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
  invite_source?: GroupInviteSource | null;
  captains_pass_id?: string | null;
  invite_intent?: GroupInviteIntent | null;
  captain_invite_allowance?: number | null;
};

type GroupInviteRecord = {
  id: string;
  group_id: string;
  email: string;
  normalized_email: string;
  invited_by_user_id: string | null;
  suggested_display_name?: string | null;
  custom_message?: string | null;
  language?: string | null;
  helper_language?: string | null;
  status: GroupInviteStatus;
  claim_token?: string | null;
  expires_at?: string | null;
  accepted_by_user_id?: string | null;
  accepted_at?: string | null;
  email_status?: "pending" | "sent" | "failed" | null;
  email_sent_at?: string | null;
  email_provider_message_id?: string | null;
  email_error?: string | null;
  email_attempt_count?: number | null;
  last_email_attempt_at?: string | null;
  last_resent_by_user_id?: string | null;
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
  invite_source?: GroupInviteSource | null;
  captains_pass_id?: string | null;
  invite_intent?: GroupInviteIntent | null;
  captain_invite_allowance?: number | null;
  created_at: string;
  invited_by?: { name?: string | null; email?: string | null } | Array<{ name?: string | null; email?: string | null }> | null;
};

type TrophyRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  tier?: "bronze" | "silver" | "gold" | "special" | null;
  award_source?: "system" | "manager";
  created_by: string | null;
  group_id: string | null;
};

type AccessCodeRecord = {
  id: string;
  code: string;
  active: boolean;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  group_id?: string | null;
  default_language?: string | null;
  created_at: string;
  updated_at: string;
};

type UserTrophyRecord = {
  user_id: string;
  trophy_id: string;
};

type GroupMemberRecord = {
  id: string;
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  join_source?: GroupJoinSource | null;
  joined_invite_id?: string | null;
  joined_at: string;
  user?:
    | { id: string; name: string; email: string; avatar_url?: string | null; home_team_id?: string | null }
    | Array<{ id: string; name: string; email: string; avatar_url?: string | null; home_team_id?: string | null }>
    | null;
};

type EnqueueEmailJobResult =
  | { ok: true; alreadyQueued: boolean; deliveryMethod: "queued" | "sent_inline" }
  | { ok: false; message: string };

export type CreateGroupInput = {
  name: string;
  description?: string;
  membershipLimit?: number;
  inviteEmailsText?: string;
  basePredictionMode?: GroupBaseMode;
  homeTeamAdvantageEnabled?: boolean;
};

export type CreateGroupResult =
  | {
      ok: true;
      group: {
        id: string;
        name: string;
        description: string | null;
        basePredictionMode: GroupBaseMode;
        homeTeamAdvantageEnabled: boolean;
        membershipLimit: number;
        status: GroupStatus;
      };
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CreateGroupInviteInput = {
  groupId: string;
  email: string;
  suggestedDisplayName?: string;
  customMessage?: string;
  language?: string;
  helperLanguage?: string;
  expiresInDays?: number;
};

export type CreateGroupInviteResult =
  | {
      ok: true;
      invite: {
        id: string;
        groupId: string;
        email: string;
        existingAccount: boolean;
        status: GroupInviteStatus;
        expiresAt: string | null;
      };
      claimUrl: string;
      deliveryStatus: "queued" | "already_queued" | "sent_inline" | "queue_failed";
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CreateGroupInviteShareLinkResult =
  | {
      ok: true;
      invite: {
        id: string;
        groupId: string;
        email: string;
        existingAccount: boolean;
        status: GroupInviteStatus;
        expiresAt: string | null;
      };
      claimUrl: string;
      whatsAppUrl: string;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type AcceptGroupInviteInput = {
  token: string;
};

export type UpdateManagedGroupProfileInput = {
  groupId: string;
  name: string;
  description?: string | null;
};

export type UpdateManagedGroupAccessInput = {
  groupId: string;
  accessMode: GroupAccessMode;
};

export type SaveManagedGroupAllowedEmailsInput = {
  groupId: string;
  emailsText: string;
};

export type AssignCaptainsPassInput = {
  groupId: string;
  captainUserId: string;
  inviteAllowance: number;
};

export type CreateCaptainManagedGroupInviteInput = {
  groupId: string;
  email: string;
};

export type CreateCaptainOnboardingInviteInput = {
  groupId: string;
  email: string;
  inviteAllowance?: number;
  expiresInDays?: number;
  language?: string;
  helperLanguage?: string;
};

export type AcceptGroupInviteResult =
  | {
      ok: true;
      membership: {
        groupId: string;
        userId: string;
        role: GroupMemberRole;
      };
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ManagedGroupInviteCode = {
  id: string;
  code: string;
  active: boolean;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  shareMessage: string;
  whatsAppUrl: string;
  emailUrl: string;
};

export type ManagedGroupScoringPreview = {
  standardScoringLabel: string;
  groupScoringLabel: string;
};

export type CreateManagedGroupInviteCodeResult =
  | {
      ok: true;
      inviteCode: ManagedGroupInviteCode;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type DeactivateManagedGroupInviteCodeResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type MyManagedGroup = {
  id: string;
  name: string;
  description?: string | null;
  avatarUrl?: string | null;
  basePredictionMode: GroupBaseMode;
  homeTeamAdvantageEnabled: boolean;
  accessMode: GroupAccessMode;
  groupKind: GroupKind;
  parentGroupId?: string | null;
  membershipLimit: number;
  status: GroupStatus;
  memberCount?: number;
  pendingInviteCount?: number;
  canManage: boolean;
  userRole: "super_admin" | GroupMemberRole | "viewer";
  currentUserGroupLevelLabel: "Admin View" | "Manager" | "Player" | "Viewer";
};

export type ManagedGroupMember = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  homeTeamId?: string | null;
  role: GroupMemberRole;
  joinSource: GroupJoinSource;
  joinedAt: string;
  trophies: Array<{
    id: string;
    name: string;
    icon: string;
  }>;
};

export type ManagedGroupInvite = {
  id: string;
  email: string;
  existingAccount: boolean;
  suggestedDisplayName?: string;
  customMessage?: string;
  invitedByLabel?: string;
  status: GroupInviteStatus;
  emailStatus: "pending" | "sent" | "failed";
  expiresAt?: string | null;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  emailSentAt?: string | null;
  emailProviderMessageId?: string | null;
  emailError?: string | null;
  emailAttemptCount: number;
  lastEmailAttemptAt?: string | null;
  lastResentByUserId?: string | null;
  lastSentAt?: string | null;
  sendAttempts: number;
  lastError?: string | null;
  inviteSource: GroupInviteSource;
  inviteIntent: GroupInviteIntent;
  captainInviteAllowance?: number | null;
  createdAt: string;
};

export type ManagedGroupAllowedEmail = {
  id: string;
  email: string;
  displayName?: string | null;
  status: "allowed" | "joined";
  joinedUserId?: string | null;
  joinedUserName?: string | null;
  createdAt: string;
};

export type ManagedGroupFocusTeam = {
  id: string;
  teamId: string;
  name: string;
  shortName: string;
  groupName: string;
  flagEmoji?: string | null;
};

export type ManagedGroupTeamOption = {
  id: string;
  name: string;
  shortName: string;
  groupName: string;
  flagEmoji?: string | null;
};

export type ManagedGroupCaptainPass = {
  id: string;
  status: CaptainsPassStatus;
  statusLabel: string;
  captainUserId?: string | null;
  captainName?: string | null;
  captainEmail?: string | null;
  inviteAllowance: number;
  invitesUsed: number;
  invitesRemaining: number;
  captainPrivateGroupId?: string | null;
  captainPrivateGroupName?: string | null;
  canCurrentUserUseInvites: boolean;
  isRestrictedByEmail: boolean;
  claimedAt?: string | null;
  expiresAt?: string | null;
};

export type ManagedGroupDetails = MyManagedGroup & {
  inviteCode: ManagedGroupInviteCode | null;
  inviteCodeStatus: "active" | "inactive" | "expired" | "maxed_out" | "missing";
  inviteCodeStatusLabel: string;
  members: ManagedGroupMember[];
  invites: ManagedGroupInvite[];
  allowedEmails: ManagedGroupAllowedEmail[];
  focusTeams: ManagedGroupFocusTeam[];
  teamOptions: ManagedGroupTeamOption[];
  captainPass: ManagedGroupCaptainPass | null;
  activeRuleset: ManagedGroupRulesetSummary | null;
  sidePickPackages: SidePickPackageOption[];
  canManageRuleset: boolean;
  canManageSidePicks: boolean;
  scoringPreview: ManagedGroupScoringPreview;
  trophies: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    icon: string;
    tier?: "bronze" | "silver" | "gold" | "special" | null;
    awardSource?: "system" | "manager";
    scope: "group" | "system";
    awardedCount: number;
  }>;
};

export type SaveManagedGroupRulesetInput = {
  groupId: string;
  presetKey?: ManagedGroupRulesetPresetKey | null;
  status?: "draft" | "active" | "locked" | "superseded" | "archived" | null;
  earlyGroupStageCompletionBonus?: number;
  knockoutCompletionBonus?: number;
  finalMatchupBonus?: number;
  exactFinalScoreBonus?: number;
  sidePickPackageId?: string | null;
};

export type SaveManagedGroupRulesetResult = ResendGroupInviteResult;

export type SaveLegacyGroupScoringSetupInput = {
  groupId: string;
  groupStagePredictionDepth: "simple_results" | "full_match_scores";
  fullMatchScoringVariant?: "classic" | "goal_difference_bonus";
  groupBonusMode: "classic" | "early_bird" | "high_stakes" | "all_in";
  groupStagePicksDueAt: string;
  knockoutPicksDueAt: string;
};

export type SaveLegacyGroupScoringSetupResult = ResendGroupInviteResult;

export type SaveGroupSidePickEntryInput = {
  groupId: string;
  definitionId: string;
  selectedTeamId?: string | null;
  selectedText?: string | null;
};

export type SaveGroupSidePickEntryResult = ResendGroupInviteResult;

export type ScoreManagedGroupSidePickInput = {
  groupId: string;
  definitionId: string;
  userId: string;
  points: number;
  scoringScope: "standard" | "group_custom";
  note?: string;
};

export type ScoreManagedGroupSidePickResult = ResendGroupInviteResult;
export type FetchMyGroupsResult =
  | {
      ok: true;
      currentUser: {
        userId: string;
        email: string;
        role: PlatformRole;
        planTier: CommercialTier | null;
        accessLevel: AccessLevel;
        preferredLanguage: SupportedLanguage;
      };
      tierAccess: ResolvedTierAccess;
      groupAccess: {
        joinedGroupCount: number;
        managedGroupCount: number;
        hasAnyGroups: boolean;
      };
      groups: MyManagedGroup[];
    }
  | {
      ok: false;
      message: string;
    };

export type FetchDashboardGroupAccessResult =
  | {
      ok: true;
      groupAccess: {
        joinedGroupCount: number;
        managedGroupCount: number;
        hasAnyGroups: boolean;
      };
      dashboardUiResetEpoch: number;
    }
  | {
      ok: false;
      message: string;
    };

export type GroupInvitePreviewResult =
  | {
      ok: true;
      invite: {
        groupId: string;
        groupName: string;
        inviterLabel: string;
        email: string;
        existingAccount: boolean;
        suggestedDisplayName?: string | null;
        customMessage?: string | null;
        language?: SupportedLanguage;
        helperLanguage?: ExplainerLanguage;
        status: GroupInviteStatus;
        expiresAt: string | null;
      };
    }
  | {
      ok: false;
      message: string;
    };

export type ListManagedGroupPlayersResult =
  | {
      ok: true;
      groups: ManagedGroupDetails[];
      managerCustomTrophiesEnabled: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export type FetchManagedGroupDetailResult =
  | {
      ok: true;
      group: ManagedGroupDetails;
      managerCustomTrophiesEnabled: boolean;
    }
  | {
      ok: false;
      message: string;
    };

export type ResendGroupInviteResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CancelGroupInviteResult = ResendGroupInviteResult;
export type RemoveGroupMemberResult = ResendGroupInviteResult;
export type LeaveJoinedGroupResult = ResendGroupInviteResult;
export type UpdateGroupInviteNameResult = ResendGroupInviteResult;
export type DeleteManagedGroupResult = ResendGroupInviteResult;
export type UpdateManagedGroupLimitResult = ResendGroupInviteResult;
export type UpdateManagedGroupProfileResult = ResendGroupInviteResult;
export type UpdateManagedGroupAvatarResult =
  | {
      ok: true;
      avatarUrl: string;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };
export type RemoveManagedGroupAvatarResult = ResendGroupInviteResult;
export type UpdateManagedGroupAccessResult = ResendGroupInviteResult;
export type SaveManagedGroupAllowedEmailsResult =
  | {
      ok: true;
      message: string;
      summary: {
        addedCount: number;
        duplicateIgnoredCount: number;
        invalidCount: number;
      };
    }
  | {
      ok: false;
      message: string;
    };
export type RemoveManagedGroupAllowedEmailResult = ResendGroupInviteResult;
export type AddGroupFocusTeamResult = ResendGroupInviteResult;
export type AddAllGroupFocusTeamsResult = ResendGroupInviteResult;
export type RemoveGroupFocusTeamResult = ResendGroupInviteResult;
export type AssignCaptainsPassResult = ResendGroupInviteResult;
export type CreateCaptainManagedGroupInviteResult = CreateGroupInviteResult;
export type CreateCaptainOnboardingInviteResult =
  | {
      ok: true;
      invite: {
        id: string;
        groupId: string;
        email: string;
        existingAccount: boolean;
        status: GroupInviteStatus;
        expiresAt: string | null;
        inviteAllowance: number;
      };
      claimUrl: string;
      deliveryStatus: "queued" | "already_queued" | "sent_inline" | "queue_failed";
      message: string;
    }
  | {
      ok: false;
      message: string;
    };
export type CreateManagedGroupTrophyInput = {
  groupId?: string | null;
  name: string;
  description: string;
  icon: string;
};
export type CreateManagedGroupTrophyResult = ResendGroupInviteResult;
export type AwardManagedGroupTrophyResult =
  | {
      ok: true;
      message: string;
      alreadyAwarded?: boolean;
      trophy?: {
        id: string;
        name: string;
        icon: string;
        tier?: "bronze" | "silver" | "gold" | "special" | null;
      };
    }
  | {
      ok: false;
      message: string;
    };

export async function createGroupAction(input: CreateGroupInput): Promise<CreateGroupResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const name = input.name?.trim();
  const description = normalizeGroupDescription(input.description);
  if (!name) {
    return { ok: false, message: "Group name is required." };
  }

  if (name.length > MAX_GROUP_NAME_LENGTH) {
    return {
      ok: false,
      message: `Keep the group name under ${MAX_GROUP_NAME_LENGTH} characters.`
    };
  }

  if (description.length > MAX_GROUP_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message: `Keep the group description under ${MAX_GROUP_DESCRIPTION_LENGTH} characters.`
    };
  }

  const parsedInviteEmails = parseInviteEmailInput(input.inviteEmailsText);
  if (!parsedInviteEmails.ok) {
    return { ok: false, message: parsedInviteEmails.message };
  }
  const basePredictionMode = normalizeGroupBaseMode(input.basePredictionMode);
  const homeTeamAdvantageEnabled = Boolean(input.homeTeamAdvantageEnabled);

  const adminSupabase = createAdminClient();
  if (currentUser.role !== "admin" && !currentUser.tierAccess.capabilities.canCreateGroup) {
    console.warn("[tier-access:create-group-blocked]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      planTier: currentUser.planTier
    });
    return {
      ok: false,
      message: "Your current tier does not include group creation yet. Upgrade options are coming soon."
    };
  }

  const requestedMembershipLimit = normalizeRequestedMembershipLimit(input.membershipLimit);
  const membershipLimit = getEffectiveMembershipLimitForGroup(requestedMembershipLimit, currentUser);
  const effectiveManagedGroupLimit = getEffectiveManagedGroupLimit(currentUser);

  if (
    currentUser.role !== "admin" &&
    effectiveManagedGroupLimit !== null &&
    requestedMembershipLimit > membershipLimit
  ) {
    console.warn("[tier-access:create-group-limit-blocked]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      requestedMembershipLimit,
      membershipLimit
    });
    return {
      ok: false,
      message: `Your current tier allows up to ${membershipLimit} members per group.`
    };
  }

  if (currentUser.role !== "admin") {
    const activeGroupCount = await getActiveOwnedGroupCount(adminSupabase, currentUser.userId);
    if (isAtOrOverManagedGroupLimit(activeGroupCount, currentUser)) {
      console.warn("[tier-access:create-group-cap-blocked]", {
        userId: currentUser.userId,
        accessLevel: currentUser.accessLevel,
        activeGroupCount,
        effectiveManagedGroupLimit
      });
      return {
        ok: false,
        message: `Your current tier allows ${effectiveManagedGroupLimit} active group${effectiveManagedGroupLimit === 1 ? "" : "s"}. Upgrade options are coming soon.`
      };
    }
  }

  if (parsedInviteEmails.emails.length > membershipLimit) {
    return {
      ok: false,
      message: `You can only pre-invite up to ${membershipLimit} player${membershipLimit === 1 ? "" : "s"} for this group.`
    };
  }

  console.info("[tier-access:create-group]", {
    userId: currentUser.userId,
    accessLevel: currentUser.accessLevel,
    requestedMembershipLimit,
    membershipLimit,
    hasDescription: Boolean(description)
  });

  const { data, error } = await adminSupabase
    .from("groups")
    .insert({
      name,
      description: description || null,
      base_prediction_mode: basePredictionMode,
      home_team_advantage_enabled: homeTeamAdvantageEnabled,
      owner_user_id: currentUser.userId,
      created_by_user_id: currentUser.userId,
      membership_limit: membershipLimit,
      status: "active"
    })
    .select("id,name,description,base_prediction_mode,home_team_advantage_enabled,membership_limit,status")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  let inviteCreationWarning: string | null = null;
  if (parsedInviteEmails.emails.length > 0) {
    try {
      const inviteCreationResult = await createPendingGroupInvites(adminSupabase, {
        groupId: data.id,
        groupName: data.name,
        normalizedEmails: parsedInviteEmails.emails,
        invitedByUserId: currentUser.userId,
        inviteLanguage: currentUser.preferredLanguage,
        helperLanguage: currentUser.preferredLanguage
      });

      if (inviteCreationResult.failedEmails.length > 0) {
        inviteCreationWarning = `Emails could not be queued for: ${inviteCreationResult.failedEmails.join(", ")}.`;
      }
    } catch (inviteCreationError) {
      inviteCreationWarning =
        inviteCreationError instanceof Error
          ? inviteCreationError.message
          : "Pending email invites could not be created.";
    }
  }

  revalidatePath("/my-groups");
  revalidatePath("/dashboard");

  return {
    ok: true,
      group: {
        id: data.id,
        name: data.name,
        description: data.description ?? null,
        basePredictionMode: normalizeGroupBaseMode(data.base_prediction_mode),
        homeTeamAdvantageEnabled: Boolean(data.home_team_advantage_enabled),
        membershipLimit: data.membership_limit,
        status: data.status
      },
    message:
      inviteCreationWarning
        ? `Group created, but the pending email invites could not be added: ${inviteCreationWarning}`
        : parsedInviteEmails.emails.length > 0
          ? `Group created with ${parsedInviteEmails.emails.length} pending email invite${parsedInviteEmails.emails.length === 1 ? "" : "s"}.`
          : "Group created."
  };
}

export async function createGroupInviteAction(input: CreateGroupInviteInput): Promise<CreateGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const groupId = input.groupId?.trim();
  const normalizedEmail = normalizeEmail(input.email);
  if (!groupId || !normalizedEmail) {
    return { ok: false, message: "A valid group and email are required." };
  }

  const adminSupabase = createAdminClient();
  const managedGroup = await getManagedGroup(adminSupabase, groupId, currentUser);
  if (!managedGroup) {
    return { ok: false, message: "You do not manage that group." };
  }

  if (!canManageInvitesForGroup(currentUser, managedGroup)) {
    return { ok: false, message: "Your current tier does not include invite management for this group." };
  }

  const accessCheck = await ensureGroupAllowsEmail(adminSupabase, managedGroup, normalizedEmail);
  if (!accessCheck.ok) {
    return accessCheck;
  }

  console.info("Manager group invite requested.", {
    managerUserId: currentUser.userId,
    groupId: managedGroup.id,
    email: normalizedEmail
  });

  const seatCheck = await ensureGroupHasInviteCapacity(adminSupabase, managedGroup, currentUser);
  if (!seatCheck.ok) {
    return seatCheck;
  }

  const existingUserId = await findUserIdByEmail(adminSupabase, normalizedEmail);

  let existingMembership: { id: string } | null = null;
  let existingMembershipError: { message: string } | null = null;

  if (existingUserId) {
    const membershipLookup = await adminSupabase
      .from("group_members")
      .select("id")
      .eq("group_id", managedGroup.id)
      .eq("user_id", existingUserId)
      .maybeSingle();

    existingMembership = membershipLookup.data;
    existingMembershipError = membershipLookup.error;
  }

  if (existingMembershipError) {
    return { ok: false, message: existingMembershipError.message };
  }

  if (existingMembership) {
    console.info("Manager group invite blocked because user is already a member.", {
      managerUserId: currentUser.userId,
      groupId: managedGroup.id,
      email: normalizedEmail
    });
    return { ok: false, message: "That user is already a member of this group." };
  }

  if (existingUserId) {
    const joinLimitResult = await ensureUserCanJoinAnotherGroup(adminSupabase, existingUserId);
    if (!joinLimitResult.ok) {
      return joinLimitResult;
    }
  }

  const { data: existingPendingInvite, error: existingPendingInviteError } = await adminSupabase
    .from("group_invites")
    .select("id")
    .eq("group_id", managedGroup.id)
    .eq("normalized_email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPendingInviteError) {
    return { ok: false, message: existingPendingInviteError.message };
  }

  if (existingPendingInvite) {
    console.info("Manager group invite blocked because a pending invite already exists.", {
      managerUserId: currentUser.userId,
      groupId: managedGroup.id,
      email: normalizedEmail
    });
    return { ok: false, message: "A pending invite already exists for that email in this group." };
  }

  const token = randomBytes(24).toString("hex");
  const tokenHash = hashInviteToken(token);
  const inviteLanguage = normalizeLanguage(input.language ?? currentUser.preferredLanguage);
  const helperLanguage = normalizeExplainerLanguage(input.helperLanguage ?? inviteLanguage);
  const customMessage = normalizeGroupInviteCustomMessage(input.customMessage);
  if (customMessage.length > MAX_GROUP_INVITE_CUSTOM_MESSAGE_LENGTH) {
    return {
      ok: false,
      message: `Keep the custom message under ${MAX_GROUP_INVITE_CUSTOM_MESSAGE_LENGTH} characters.`
    };
  }
  const claimUrl = buildGroupInviteClaimUrl(
    token,
    inviteLanguage,
    helperLanguage,
    existingUserId ? "login" : "signup"
  );
  const expiresAt = new Date(Date.now() + normalizeExpiryDays(input.expiresInDays) * 24 * 60 * 60 * 1000).toISOString();

  console.info("Manager group invite claim link generated.", {
    managerUserId: currentUser.userId,
    groupId: managedGroup.id,
    email: normalizedEmail,
    claimUrl
  });

  const inviterProfile = await getUserLabel(adminSupabase, currentUser.userId);

  const { data, error } = await adminSupabase
    .from("group_invites")
    .insert({
      group_id: managedGroup.id,
      email: normalizedEmail,
      normalized_email: normalizedEmail,
      invited_by_user_id: currentUser.userId,
      suggested_display_name: input.suggestedDisplayName?.trim() || null,
      custom_message: customMessage || null,
      language: inviteLanguage,
      helper_language: helperLanguage,
      status: "pending",
      claim_token: token,
      token_hash: tokenHash,
      email_status: "pending",
      expires_at: expiresAt,
      invite_source: normalizeGroupKind(managedGroup.group_kind) === "captain_private" ? "captain_private_invite" : "manager_invite"
    })
    .select("id,group_id,email,status,expires_at")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  const enqueueResult = await enqueueGroupInviteEmail(adminSupabase, {
    email: normalizedEmail,
    groupInviteId: data.id,
    groupId: managedGroup.id,
    groupName: managedGroup.name ?? "Group",
    invitedByUserId: currentUser.userId,
    inviterName: inviterProfile.name,
    inviterEmail: inviterProfile.email,
    suggestedDisplayName: input.suggestedDisplayName?.trim() || null,
    customMessage: customMessage || null,
    language: inviteLanguage,
    helperLanguage,
    existingAccount: Boolean(existingUserId),
    claimUrl
  });

  console.info("Manager group invite email enqueue result.", {
    managerUserId: currentUser.userId,
    groupInviteId: data.id,
    groupId: managedGroup.id,
    email: normalizedEmail,
    enqueueResult
  });

  if (!enqueueResult.ok) {
    await markGroupInviteEmailFailure(adminSupabase, data.id, enqueueResult.message);
    revalidatePath("/my-groups");
    return {
      ok: true,
      invite: {
        id: data.id,
        groupId: data.group_id,
        email: data.email,
        existingAccount: Boolean(existingUserId),
        status: data.status,
        expiresAt: data.expires_at ?? null
      },
      claimUrl,
      deliveryStatus: "queue_failed",
      message: `Group invite saved, but the email could not be queued: ${enqueueResult.message}`
    };
  }

  const workerTriggerResult = await triggerEmailWorkerNow();
  console.info("Manager group invite worker trigger result.", {
    managerUserId: currentUser.userId,
    groupInviteId: data.id,
    groupId: managedGroup.id,
    email: normalizedEmail,
    workerTriggerResult
  });

  revalidatePath("/my-groups");

  return {
    ok: true,
    invite: {
      id: data.id,
      groupId: data.group_id,
      email: data.email,
      existingAccount: Boolean(existingUserId),
      status: data.status,
      expiresAt: data.expires_at ?? null
    },
    claimUrl,
    deliveryStatus:
      enqueueResult.deliveryMethod === "sent_inline"
        ? "sent_inline"
        : enqueueResult.alreadyQueued
          ? "already_queued"
          : "queued",
    message:
      enqueueResult.deliveryMethod === "sent_inline"
        ? "Group invite email sent right away."
        : !workerTriggerResult.ok
          ? `Group invite email queued. ${existingUserId ? "The invited player can log in and join from the link." : "The invited player can finish signup from the link."} Automatic sending could not be triggered right away, so the worker cron will pick it up shortly.`
          : enqueueResult.alreadyQueued
            ? "A matching group invite email is already queued."
            : "Group invite email queued."
  };
}

export async function createGroupInviteShareLinkAction(
  input: CreateGroupInviteInput
): Promise<CreateGroupInviteShareLinkResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const groupId = input.groupId?.trim();
  const normalizedEmail = normalizeEmail(input.email);
  if (!groupId || !normalizedEmail) {
    return { ok: false, message: "A valid group and email are required." };
  }

  const adminSupabase = createAdminClient();
  const managedGroup = await getManagedGroup(adminSupabase, groupId, currentUser);
  if (!managedGroup) {
    return { ok: false, message: "You do not manage that group." };
  }

  if (!canManageInvitesForGroup(currentUser, managedGroup)) {
    return { ok: false, message: "Your current tier does not include invite management for this group." };
  }

  const accessCheck = await ensureGroupAllowsEmail(adminSupabase, managedGroup, normalizedEmail);
  if (!accessCheck.ok) {
    return accessCheck;
  }

  const seatCheck = await ensureGroupHasInviteCapacity(adminSupabase, managedGroup, currentUser);
  if (!seatCheck.ok) {
    return seatCheck;
  }

  const existingUserId = await findUserIdByEmail(adminSupabase, normalizedEmail);

  let existingMembership: { id: string } | null = null;
  let existingMembershipError: { message: string } | null = null;

  if (existingUserId) {
    const membershipLookup = await adminSupabase
      .from("group_members")
      .select("id")
      .eq("group_id", managedGroup.id)
      .eq("user_id", existingUserId)
      .maybeSingle();

    existingMembership = membershipLookup.data;
    existingMembershipError = membershipLookup.error;
  }

  if (existingMembershipError) {
    return { ok: false, message: existingMembershipError.message };
  }

  if (existingMembership) {
    return { ok: false, message: "That user is already a member of this group." };
  }

  if (existingUserId) {
    const joinLimitResult = await ensureUserCanJoinAnotherGroup(adminSupabase, existingUserId);
    if (!joinLimitResult.ok) {
      return joinLimitResult;
    }
  }

  const { data: existingPendingInvite, error: existingPendingInviteError } = await adminSupabase
    .from("group_invites")
    .select("id")
    .eq("group_id", managedGroup.id)
    .eq("normalized_email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPendingInviteError) {
    return { ok: false, message: existingPendingInviteError.message };
  }

  if (existingPendingInvite) {
    return { ok: false, message: "A pending invite already exists for that email in this group." };
  }

  const token = randomBytes(24).toString("hex");
  const tokenHash = hashInviteToken(token);
  const inviteLanguage = normalizeLanguage(input.language ?? currentUser.preferredLanguage);
  const helperLanguage = normalizeExplainerLanguage(input.helperLanguage ?? inviteLanguage);
  const customMessage = normalizeGroupInviteCustomMessage(input.customMessage);
  if (customMessage.length > MAX_GROUP_INVITE_CUSTOM_MESSAGE_LENGTH) {
    return {
      ok: false,
      message: `Keep the custom message under ${MAX_GROUP_INVITE_CUSTOM_MESSAGE_LENGTH} characters.`
    };
  }

  const claimUrl = buildGroupInviteClaimUrl(
    token,
    inviteLanguage,
    helperLanguage,
    existingUserId ? "login" : "signup"
  );
  const whatsAppUrl = buildWhatsAppShareUrl({
    claimUrl,
    groupName: managedGroup.name ?? "Group",
    invitedEmail: normalizedEmail
  });
  const expiresAt = new Date(Date.now() + normalizeExpiryDays(input.expiresInDays) * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await adminSupabase
    .from("group_invites")
    .insert({
      group_id: managedGroup.id,
      email: normalizedEmail,
      normalized_email: normalizedEmail,
      invited_by_user_id: currentUser.userId,
      suggested_display_name: input.suggestedDisplayName?.trim() || null,
      custom_message: customMessage || null,
      language: inviteLanguage,
      helper_language: helperLanguage,
      status: "pending",
      claim_token: token,
      token_hash: tokenHash,
      email_status: "pending",
      expires_at: expiresAt,
      invite_source: normalizeGroupKind(managedGroup.group_kind) === "captain_private" ? "captain_private_invite" : "manager_invite"
    })
    .select("id,group_id,email,status,expires_at")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/my-groups");
  revalidatePath("/dashboard");

  return {
    ok: true,
    invite: {
      id: data.id,
      groupId: data.group_id,
      email: data.email,
      existingAccount: Boolean(existingUserId),
      status: data.status,
      expiresAt: data.expires_at
    },
    claimUrl,
    whatsAppUrl,
    message: "Share link ready."
  };
}

export async function createManagedGroupInviteCodeAction(input: {
  groupId: string;
  replaceExisting?: boolean;
  customCode?: string;
}
): Promise<CreateManagedGroupInviteCodeResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = input.groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  const adminSupabase = createAdminClient();
  const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
  if (!managedGroup) {
    return { ok: false, message: "You do not manage that group." };
  }

  if (!canManageInvitesForGroup(currentUser, managedGroup)) {
    return { ok: false, message: "Your current tier does not include invite management for this group." };
  }

  const existingInviteCode = await fetchPrimaryManagedGroupInviteCode(adminSupabase, managedGroup.id, managedGroup.name);
  const customCodeResult = resolveManagedGroupInviteCodeInput(input.customCode);
  if (!customCodeResult.ok) {
    return customCodeResult;
  }

  console.info("[tier-access:invite-code-activate]", {
    userId: currentUser.userId,
    accessLevel: currentUser.accessLevel,
    groupId: managedGroup.id,
    replacingExisting: Boolean(existingInviteCode && input.replaceExisting),
    hasCustomCode: Boolean(customCodeResult.code)
  });

  if (existingInviteCode && !input.replaceExisting) {
    if (
      customCodeResult.code &&
      normalizeAccessCode(existingInviteCode.code) === normalizeAccessCode(customCodeResult.code)
    ) {
      return {
        ok: true,
        inviteCode: existingInviteCode,
        message: "Invite code ready."
      };
    }

    return {
      ok: true,
      inviteCode: existingInviteCode,
      message: "Invite code ready."
    };
  }

  if (
    existingInviteCode &&
    input.replaceExisting &&
    customCodeResult.code &&
    normalizeAccessCode(existingInviteCode.code) === normalizeAccessCode(customCodeResult.code)
  ) {
    return {
      ok: true,
      inviteCode: existingInviteCode,
      message: "That invite code is already active."
    };
  }

  await deactivateActiveManagedGroupInviteCodes(adminSupabase, managedGroup.id);

  let lastErrorMessage = "Could not create the invite code.";
  const isReplacingExistingCode = Boolean(existingInviteCode && input.replaceExisting);

  for (let attempt = 0; attempt < MAX_MANAGED_GROUP_INVITE_CODE_ATTEMPTS; attempt += 1) {
    const candidateCode = customCodeResult.code ?? buildManagedGroupInviteCodeValue(managedGroup.name);
    const { data, error } = await adminSupabase
      .from("access_codes")
      .insert({
        code: candidateCode,
        normalized_code: normalizeAccessCode(candidateCode),
        label: `${managedGroup.name} invite code`,
        notes: null,
        active: true,
        max_uses: null,
        expires_at: null,
        group_id: managedGroup.id,
        code_type: "standard",
        grants_plan_tier: "player",
        grants_group_membership: true,
        default_role: "player",
        default_language: normalizeLanguage(currentUser.preferredLanguage),
        created_by: currentUser.userId
      })
      .select("id,code,active,max_uses,used_count,expires_at,group_id,default_language,created_at,updated_at")
      .single();

    if (!error && data) {
      const mappedCode = mapManagedGroupInviteCode(data as AccessCodeRecord, managedGroup.name);
      revalidatePath("/my-groups");
      revalidatePath("/dashboard");
      return {
        ok: true,
        inviteCode: mappedCode,
        message: isReplacingExistingCode
          ? "New invite code activated. The previous code no longer works."
          : "Invite code activated."
      };
    }

    lastErrorMessage = error?.message ?? lastErrorMessage;
    if (error?.code === "23505") {
      if (isManagedGroupInviteCodeConflict(error, "normalized_code")) {
        return {
          ok: false,
          message: "That invite code is already in use. Choose another one."
        };
      }

      const currentInviteCode = await fetchPrimaryManagedGroupInviteCode(adminSupabase, managedGroup.id, managedGroup.name);
      if (currentInviteCode) {
        return {
          ok: true,
          inviteCode: currentInviteCode,
          message: isReplacingExistingCode
            ? "New invite code activated. The previous code no longer works."
            : "Invite code activated."
        };
      }

      if (customCodeResult.code) {
        return {
          ok: false,
          message: "That invite code could not be activated. Try another one."
        };
      }
    } else {
      break;
    }
  }

  return {
    ok: false,
    message: lastErrorMessage
  };
}

export async function deactivateManagedGroupInviteCodeAction(
  groupId: string
): Promise<DeactivateManagedGroupInviteCodeResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  const adminSupabase = createAdminClient();
  const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
  if (!managedGroup) {
    return { ok: false, message: "You do not manage that group." };
  }

  if (!canManageInvitesForGroup(currentUser, managedGroup)) {
    return { ok: false, message: "Your current tier does not include invite management for this group." };
  }

  const currentInviteCode = await fetchPrimaryManagedGroupInviteCode(adminSupabase, managedGroup.id, managedGroup.name);
  if (!currentInviteCode) {
    return { ok: false, message: "No active invite code found." };
  }

  console.info("[tier-access:invite-code-deactivate]", {
    userId: currentUser.userId,
    accessLevel: currentUser.accessLevel,
    groupId: managedGroup.id,
    inviteCodeId: currentInviteCode.id
  });

  await deactivateActiveManagedGroupInviteCodes(adminSupabase, managedGroup.id);

  revalidatePath("/my-groups");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: "Invite code deactivated."
  };
}

export async function acceptGroupInviteAction(input: AcceptGroupInviteInput): Promise<AcceptGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const token = input.token?.trim();
  if (!token) {
    return { ok: false, message: "Invite token is required." };
  }

  const adminSupabase = createAdminClient();
  const tokenHash = hashInviteToken(token);
  const { data: invite, error: inviteError } = await adminSupabase
    .from("group_invites")
    .select("id,group_id,email,normalized_email,status,expires_at,accepted_at,accepted_by_user_id,invite_source,captains_pass_id,invite_intent,captain_invite_allowance,invited_by_user_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (inviteError) {
    return { ok: false, message: inviteError.message };
  }

  if (!invite) {
    return { ok: false, message: "That invite could not be found." };
  }

  const inviteRow = invite as GroupInviteRow;
  const inviteIntent = normalizeGroupInviteIntent(inviteRow.invite_intent);
  const isCaptainOnboardingInvite = inviteIntent === "captain_pass";
  const captainInviteAllowance = normalizeCaptainInviteAllowance(inviteRow.captain_invite_allowance);
  if (inviteRow.status !== "pending") {
    return { ok: false, message: "That invite is no longer pending." };
  }

  if (inviteRow.expires_at && new Date(inviteRow.expires_at).getTime() < Date.now()) {
    await adminSupabase
      .from("group_invites")
      .update({ status: "expired" })
      .eq("id", inviteRow.id);

    return { ok: false, message: "That invite has expired." };
  }

  if (normalizeEmail(currentUser.email) !== inviteRow.normalized_email) {
    return { ok: false, message: "You must sign in with the invited email to accept this invite." };
  }

  const { data: existingMembership, error: existingMembershipError } = await adminSupabase
    .from("group_members")
    .select("id,role")
    .eq("group_id", inviteRow.group_id)
    .eq("user_id", currentUser.userId)
    .maybeSingle();

  if (existingMembershipError) {
    return { ok: false, message: existingMembershipError.message };
  }

  if (existingMembership && !isCaptainOnboardingInvite) {
    return { ok: false, message: "You are already a member of this group." };
  }

  if (existingMembership && existingMembership.role !== "member" && isCaptainOnboardingInvite) {
    return { ok: false, message: "Only a player member can receive a Captain’s Pass for this group." };
  }

  const { data: group, error: groupError } = await adminSupabase
    .from("groups")
    .select("id,membership_limit,owner_user_id,status,access_mode,group_kind")
    .eq("id", inviteRow.group_id)
    .single();

  if (groupError) {
    return { ok: false, message: groupError.message };
  }

  if (group.status !== "active") {
    return { ok: false, message: "That group is not accepting members right now." };
  }

  const accessCheck = await ensureGroupAllowsEmail(adminSupabase, group as GroupRow, inviteRow.normalized_email);
  if (!accessCheck.ok) {
    return accessCheck;
  }

  if (isCaptainOnboardingInvite) {
    const requiredOpenSeats = (existingMembership ? 0 : 1) + captainInviteAllowance;
    const capacityCheck = await ensureGroupHasCaptainInviteCapacity(adminSupabase, group as GroupRow, requiredOpenSeats, inviteRow.id);
    if (!capacityCheck.ok) {
      return capacityCheck;
    }
  } else {
    const seatCheck = await ensureGroupHasOpenSeat(adminSupabase, group as GroupRow, currentUser);
    if (!seatCheck.ok) {
      return seatCheck;
    }
  }

  if (!existingMembership) {
    const joinLimitResult = await ensureUserCanJoinAnotherGroup(adminSupabase, currentUser.userId);
    if (!joinLimitResult.ok) {
      return joinLimitResult;
    }

    const { error: membershipInsertError } = await adminSupabase
      .from("group_members")
      .insert({
        group_id: inviteRow.group_id,
        user_id: currentUser.userId,
        role: "member",
        join_source:
          isCaptainOnboardingInvite || normalizeGroupInviteSource(inviteRow.invite_source) === "captain_pass"
            ? "captain_pass"
            : normalizeGroupInviteSource(inviteRow.invite_source) === "captain_private_invite"
              ? "captain_private_invite"
              : "manager_invite"
      });

    if (membershipInsertError) {
      return { ok: false, message: membershipInsertError.message };
    }
  }

  let captainMessage: string | null = null;
  if (isCaptainOnboardingInvite) {
    const issueResult = await issueCaptainsPassForMember({
      adminSupabase,
      managedGroup: group as GroupRow,
      issuerUserId: inviteRow.invited_by_user_id ?? currentUser.userId,
      captainUserId: currentUser.userId,
      inviteAllowance: captainInviteAllowance,
      validateAllowanceCapacity: false,
      ignoreInviteId: inviteRow.id
    });

    if (!issueResult.ok) {
      console.warn("[captain-onboarding-invite:accept-failed]", {
        inviteId: inviteRow.id,
        groupId: inviteRow.group_id,
        userId: currentUser.userId,
        message: issueResult.message
      });
      return issueResult;
    }

    captainMessage = issueResult.message;
  }

  const { error: inviteUpdateError } = await adminSupabase
    .from("group_invites")
    .update({
      status: "accepted",
      accepted_by_user_id: currentUser.userId,
      accepted_at: new Date().toISOString()
    })
    .eq("id", inviteRow.id);

  if (inviteUpdateError) {
    return { ok: false, message: inviteUpdateError.message };
  }

  if (inviteRow.captains_pass_id && normalizeGroupInviteSource(inviteRow.invite_source) === "captain_pass") {
    const { data: captainsPass, error: captainsPassError } = await adminSupabase
      .from("captains_passes")
      .select("id,manager_group_invite_allowance,manager_group_invites_used")
      .eq("id", inviteRow.captains_pass_id)
      .maybeSingle();

    if (captainsPassError) {
      return { ok: false, message: captainsPassError.message };
    }

    if (captainsPass) {
      const nextUsedCount = (captainsPass.manager_group_invites_used ?? 0) + 1;
      const { error: captainsPassUpdateError } = await adminSupabase
        .from("captains_passes")
        .update({
          manager_group_invites_used: nextUsedCount,
          status: nextUsedCount >= captainsPass.manager_group_invite_allowance ? "exhausted" : "claimed"
        })
        .eq("id", captainsPass.id);

      if (captainsPassUpdateError) {
        return { ok: false, message: captainsPassUpdateError.message };
      }
    }
  }

  revalidatePath("/my-groups");
  revalidatePath("/dashboard");

  console.info("[group-invite:accepted]", {
    inviteId: inviteRow.id,
    groupId: inviteRow.group_id,
    userId: currentUser.userId,
    inviteIntent,
    inviteSource: normalizeGroupInviteSource(inviteRow.invite_source)
  });

  return {
    ok: true,
    membership: {
      groupId: inviteRow.group_id,
      userId: currentUser.userId,
      role: "member"
    },
    message: captainMessage ?? "You joined the group."
  };
}

export async function listManagedGroupPlayersAction(): Promise<ListManagedGroupPlayersResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  try {
    const adminSupabase = createAdminClient();
    const [groups, managerCustomTrophiesEnabled] = await Promise.all([
      fetchManagedGroupDetails(adminSupabase, currentUser),
      fetchBooleanAppSetting("manager_custom_trophies_enabled", false)
    ]);
    return { ok: true, groups, managerCustomTrophiesEnabled };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load managed group players."
    };
  }
}

export async function fetchManagedGroupDetailAction(groupId: string): Promise<FetchManagedGroupDetailResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "Group id is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const [group, managerCustomTrophiesEnabled] = await Promise.all([
      fetchManagedGroupDetail(adminSupabase, currentUser, trimmedGroupId),
      fetchBooleanAppSetting("manager_custom_trophies_enabled", false)
    ]);

    if (!group) {
      return { ok: false, message: "That group could not be loaded." };
    }

    return { ok: true, group, managerCustomTrophiesEnabled };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load that group."
    };
  }
}

export async function createManagedGroupTrophyAction(
  input: CreateManagedGroupTrophyInput
): Promise<CreateManagedGroupTrophyResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const name = input.name.trim();
  const description = input.description.trim();
  const icon = input.icon.trim();
  const trimmedGroupId = input.groupId?.trim() ?? "";

  if (!name || !icon) {
    return { ok: false, message: "Name and icon are required." };
  }

  if (!trimmedGroupId) {
    return { ok: false, message: "Choose a valid group first." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managerCustomTrophiesEnabled = await fetchBooleanAppSetting("manager_custom_trophies_enabled", false);
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const relation: GroupRelation = {
      isOwner: managedGroup.owner_user_id === currentUser.userId,
      isGroupManager: true
    };

    if (!hasDirectorAccess(currentUser.accessLevel) || !canAwardSocialTrophy(currentUser, relation)) {
      return { ok: false, message: "Custom group trophies are only available for League organizers right now." };
    }

    if (currentUser.role !== "admin" && !managerCustomTrophiesEnabled) {
      return { ok: false, message: "Custom group trophies are not enabled right now." };
    }

    const normalizedName = name.toLowerCase();
    const { data: existingTrophies, error: existingTrophiesError } = await adminSupabase
      .from("trophies")
      .select("id,name,group_id,award_source")
      .eq("award_source", "manager")
      .or(`group_id.is.null,group_id.eq.${trimmedGroupId}`);

    if (existingTrophiesError) {
      return { ok: false, message: existingTrophiesError.message };
    }

    const conflictingTrophy = ((existingTrophies ?? []) as Array<{
      id: string;
      name: string;
      group_id: string | null;
      award_source: "manager";
    }>).find((trophy) => trophy.name.trim().toLowerCase() === normalizedName);

    if (conflictingTrophy) {
      return {
        ok: false,
        message:
          conflictingTrophy.group_id === null
            ? "That name is already used by a core trophy. Try a more specific custom name."
            : "This group already has a trophy with that name."
      };
    }

    const customTrophyCount = ((existingTrophies ?? []) as Array<{
      id: string;
      name: string;
      group_id: string | null;
      award_source: "manager";
    }>).filter((trophy) => trophy.group_id === trimmedGroupId).length;

    if (customTrophyCount >= MAX_CUSTOM_TROPHIES_PER_GROUP) {
      return {
        ok: false,
        message: `This group already has ${MAX_CUSTOM_TROPHIES_PER_GROUP} custom trophies.`
      };
    }

    const { error } = await adminSupabase.from("trophies").insert({
      key: buildCustomTrophyKey(trimmedGroupId, name),
      name,
      description: description || "",
      icon,
      award_source: "manager",
      created_by: currentUser.userId,
      group_id: trimmedGroupId
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/profile");
    revalidatePath("/trophies");

    return {
      ok: true,
      message: "Group trophy created."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create that trophy."
    };
  }
}

export async function awardManagedGroupTrophyAction(
  groupId: string,
  userId: string,
  trophyId: string
): Promise<AwardManagedGroupTrophyResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  const trimmedUserId = userId.trim();
  const trimmedTrophyId = trophyId.trim();
  if (!trimmedGroupId || !trimmedUserId || !trimmedTrophyId) {
    return { ok: false, message: "Group, player, and trophy are all required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const relation: GroupRelation = {
      isOwner: managedGroup.owner_user_id === currentUser.userId,
      isGroupManager: true
    };

    if (!hasDirectorAccess(currentUser.accessLevel) || !canAwardSocialTrophy(currentUser, relation)) {
      return { ok: false, message: "Awarding custom group trophies is only available for League organizers right now." };
    }

    if (trimmedUserId === currentUser.userId && currentUser.role !== "admin") {
      return { ok: false, message: "You cannot award a trophy to yourself." };
    }

    const [
      { data: membership, error: membershipError },
      { data: trophy, error: trophyError },
      { data: existingAward, error: existingAwardError },
      awarderLabel
    ] = await Promise.all([
      adminSupabase
        .from("group_members")
        .select("id,user:users!group_members_user_id_fkey(name)")
        .eq("group_id", trimmedGroupId)
        .eq("user_id", trimmedUserId)
        .maybeSingle(),
      adminSupabase
        .from("trophies")
        .select("id,name,icon,tier,group_id,award_source")
        .eq("id", trimmedTrophyId)
        .maybeSingle(),
      adminSupabase
        .from("user_trophies")
        .select("id")
        .eq("user_id", trimmedUserId)
        .eq("trophy_id", trimmedTrophyId)
        .maybeSingle(),
      getUserLabel(adminSupabase, currentUser.userId)
    ]);

    if (membershipError) {
      return { ok: false, message: membershipError.message };
    }

    if (trophyError) {
      return { ok: false, message: trophyError.message };
    }

    if (existingAwardError) {
      return { ok: false, message: existingAwardError.message };
    }

    if (!membership) {
      return { ok: false, message: "That player is not in this group." };
    }

    if (!trophy) {
      return { ok: false, message: "That trophy could not be found." };
    }

    const trophyGroupId = (trophy as { group_id: string | null }).group_id;
    const trophyAwardSource = (trophy as { award_source?: "system" | "manager" }).award_source ?? "system";
    if (trophyAwardSource !== "manager") {
      return { ok: false, message: "System trophies are awarded automatically by the app." };
    }

    if (trophyGroupId && trophyGroupId !== trimmedGroupId) {
      return { ok: false, message: "That trophy belongs to a different group." };
    }

    if (existingAward) {
      return {
        ok: true,
        alreadyAwarded: true,
        trophy: {
          id: (trophy as { id: string }).id,
          name: (trophy as { name: string }).name,
          icon: (trophy as { icon: string }).icon,
          tier: (trophy as { tier?: "bronze" | "silver" | "gold" | "special" | null }).tier ?? "special"
        },
        message: `${(trophy as { name: string }).name} already awarded.`
      };
    }

    const { error: awardError } = await adminSupabase.from("user_trophies").upsert(
      {
        user_id: trimmedUserId,
        trophy_id: trimmedTrophyId,
        awarded_at: new Date().toISOString()
      },
      { onConflict: "user_id,trophy_id" }
    );

    if (awardError) {
      return { ok: false, message: awardError.message };
    }

    const membershipUser = Array.isArray((membership as { user?: Array<{ name?: string | null }> | { name?: string | null } | null }).user)
      ? (membership as { user?: Array<{ name?: string | null }> }).user?.[0]
      : (membership as { user?: { name?: string | null } | null }).user;
    const awardedPlayerName = membershipUser?.name ?? "A player";
    const awardedTrophy = trophy as {
      id: string;
      name: string;
      icon: string;
      tier?: "bronze" | "silver" | "gold" | "special" | null;
    };
    const awardedAt = new Date().toISOString();
    const todayWindow = getGroupActivityDayWindow();
    const awarderName = awarderLabel.name?.trim() || awarderLabel.email?.trim() || "A player";

    const { data: existingAwardEvent, error: existingAwardEventError } = await adminSupabase
      .from("leaderboard_events")
      .select("id")
      .eq("event_type", "trophy_awarded")
      .eq("scope_type", "group")
      .eq("group_id", trimmedGroupId)
      .eq("user_id", trimmedUserId)
      .eq("related_user_id", currentUser.userId)
      .contains("metadata", { trophy_id: awardedTrophy.id })
      .gte("created_at", todayWindow.start)
      .lt("created_at", todayWindow.end)
      .maybeSingle();

    if (existingAwardEventError) {
      return { ok: false, message: existingAwardEventError.message };
    }

    if (existingAwardEvent) {
      return {
        ok: true,
        alreadyAwarded: true,
        trophy: {
          id: awardedTrophy.id,
          name: awardedTrophy.name,
          icon: awardedTrophy.icon,
          tier: awardedTrophy.tier ?? "special"
        },
        message: `${awardedTrophy.name} was already awarded by you today.`
      };
    }

    await createTrophyEarnedNotifications({
      adminSupabase,
      awards: [
        {
          userId: trimmedUserId,
          trophyId: awardedTrophy.id,
          trophyName: awardedTrophy.name,
          trophyIcon: awardedTrophy.icon,
          trophyTier: awardedTrophy.tier ?? "special",
          trophyDescription: null,
          awardedAt,
          groupName: managedGroup.name
        }
      ]
    });

    const eventPayload = {
      event_type: "trophy_awarded" as const,
      match_id: null,
      user_id: trimmedUserId,
      related_user_id: currentUser.userId,
      points_delta: null,
      rank_delta: null,
      message: `${awardedPlayerName} earned ${awardedTrophy.icon} ${awardedTrophy.name} from ${awarderName}`,
      metadata: {
        trophy_id: awardedTrophy.id,
        trophy_name: awardedTrophy.name,
        trophy_icon: awardedTrophy.icon,
        awarded_by_user_id: currentUser.userId,
        awarded_by_name: awarderName,
        awarded_on: todayWindow.dateKey
      }
    };

    const { error: eventError } = await adminSupabase.from("leaderboard_events").insert([
      {
        ...eventPayload,
        scope_type: "group",
        group_id: trimmedGroupId
      },
      {
        ...eventPayload,
        scope_type: "global",
        group_id: null
      }
    ]);

    if (eventError) {
      return { ok: false, message: eventError.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/leaderboard");
    revalidatePath("/profile");
    revalidatePath("/trophies");

    return {
      ok: true,
      alreadyAwarded: false,
      trophy: {
        id: awardedTrophy.id,
        name: awardedTrophy.name,
        icon: awardedTrophy.icon,
        tier: awardedTrophy.tier ?? "special"
      },
      message: `${(trophy as { name: string }).name} awarded.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not award that trophy."
    };
  }
}

export async function resendGroupInviteAction(inviteId: string): Promise<ResendGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedInviteId = inviteId.trim();
  if (!trimmedInviteId) {
    return { ok: false, message: "Invite id is required." };
  }

  try {
    const traceId = buildInviteTraceId();
    const adminSupabase = createAdminClient();
    const invite = await getManagedGroupInvite(adminSupabase, trimmedInviteId, currentUser);
    if (!invite) {
      console.warn("[group-invite:resend:unauthorized]", {
        traceId,
        managerUserId: currentUser.userId,
        inviteId: trimmedInviteId
      });
      return { ok: false, message: "That invite could not be resent." };
    }

    const managedGroup = await getManagedGroup(adminSupabase, invite.group_id, currentUser);
    if (!managedGroup) {
      console.warn("[group-invite:resend:forbidden-group]", {
        traceId,
        managerUserId: currentUser.userId,
        inviteId: invite.id,
        groupId: invite.group_id
      });
      return { ok: false, message: "That invite could not be resent." };
    }

    console.info("[group-invite:resend:start]", {
      traceId,
      managerUserId: currentUser.userId,
      inviteId: invite.id,
      groupId: invite.group_id,
      inviteStatus: invite.status,
      emailStatus: deriveGroupInviteEmailStatus(invite)
    });

    if (!canResendManagedGroupInvite(invite)) {
      return {
        ok: false,
        message:
          invite.status === "accepted"
            ? "That invite has already been accepted."
            : invite.status === "revoked"
              ? "That invite has been canceled."
              : invite.status === "expired"
                ? "That invite has expired and cannot be resent."
                : "That invite cannot be resent."
      };
    }

    const seatCheck = await ensureGroupHasInviteCapacity(adminSupabase, managedGroup, currentUser, invite.id);
    if (!seatCheck.ok) {
      return seatCheck;
    }

    const cooldownRemainingMs = getResendCooldownRemainingMs(invite.last_email_attempt_at ?? null);
    if (cooldownRemainingMs > 0) {
      return {
        ok: false,
        message: `That invite was just resent. Try again in ${Math.ceil(cooldownRemainingMs / 1000)} seconds.`
      };
    }

    const rateCounts = await countGroupInviteEmailJobsToday(adminSupabase, {
      inviteId: invite.id,
      managerUserId: currentUser.userId
    });
    if (rateCounts.inviteCount >= GROUP_INVITE_RESEND_DAILY_LIMIT) {
      return {
        ok: false,
        message: "That invite has reached its resend limit for today."
      };
    }

    if (rateCounts.managerCount >= GROUP_INVITE_MANAGER_DAILY_LIMIT) {
      return {
        ok: false,
        message: "You have reached the invite resend limit for today."
      };
    }

    const inviteLanguage = normalizeLanguage(invite.language ?? currentUser.preferredLanguage);
    const helperLanguage = normalizeExplainerLanguage(invite.helper_language ?? inviteLanguage);
    const existingUserId = await findUserIdByEmail(adminSupabase, normalizeEmail(invite.email));
    const inviterProfile = await getUserLabel(adminSupabase, invite.invited_by_user_id ?? currentUser.userId);
    const activeToken = invite.claim_token?.trim() || randomBytes(24).toString("hex");
    const tokenHash = hashInviteToken(activeToken);
    const claimUrl = buildGroupInviteClaimUrl(activeToken, inviteLanguage, helperLanguage, existingUserId ? "login" : "signup");
    const attemptStartedAt = new Date().toISOString();
    const nextEmailAttemptCount = (invite.email_attempt_count ?? invite.send_attempts ?? 0) + 1;

    const { data: updatedInvites, error: updateInviteError } = await adminSupabase
      .from("group_invites")
      .update({
        claim_token: activeToken,
        token_hash: tokenHash,
        email_status: "pending",
        email_error: null,
        email_attempt_count: nextEmailAttemptCount,
        last_email_attempt_at: attemptStartedAt,
        last_resent_by_user_id: currentUser.userId,
        last_error: null
      })
      .eq("id", invite.id)
      .or(`last_email_attempt_at.is.null,last_email_attempt_at.lt.${new Date(Date.now() - GROUP_INVITE_RESEND_COOLDOWN_MS).toISOString()}`)
      .select("id");

    if (updateInviteError) {
      return { ok: false, message: updateInviteError.message };
    }

    if (!updatedInvites || updatedInvites.length === 0) {
      return {
        ok: false,
        message: "That invite was just resent. Wait a moment before trying again."
      };
    }

    const enqueueResult = await enqueueGroupInviteEmail(adminSupabase, {
      email: invite.email,
      groupInviteId: invite.id,
      groupId: invite.group_id,
      groupName: managedGroup.name ?? "Group",
      invitedByUserId: invite.invited_by_user_id ?? currentUser.userId,
      inviterName: inviterProfile.name,
      inviterEmail: inviterProfile.email,
      suggestedDisplayName: invite.suggested_display_name ?? null,
      customMessage: invite.custom_message ?? null,
      language: inviteLanguage,
      helperLanguage,
      existingAccount: Boolean(existingUserId),
      claimUrl,
      traceId,
      attemptAlreadyRecorded: true
    });

    if (!enqueueResult.ok) {
      await markGroupInviteEmailFailure(adminSupabase, invite.id, enqueueResult.message);
      console.error("[group-invite:resend:queue-failed]", {
        traceId,
        managerUserId: currentUser.userId,
        inviteId: invite.id,
        groupId: invite.group_id,
        message: enqueueResult.message
      });
      return { ok: false, message: "The invite email could not be resent right now." };
    }

    const workerTriggerResult = await triggerEmailWorkerNow();
    console.info("[group-invite:resend:worker-trigger]", {
      traceId,
      managerUserId: currentUser.userId,
      groupInviteId: invite.id,
      groupId: invite.group_id,
      email: invite.email,
      workerTriggerResult
    });

    revalidatePath("/my-groups");
    return {
      ok: true,
      message:
        !workerTriggerResult.ok
          ? "Invite resent. Automatic sending could not be triggered right away, so the worker cron will pick it up shortly."
          : enqueueResult.alreadyQueued
            ? "Invite resent. A matching email was already queued."
            : "Invite resent."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not resend that invite."
    };
  }
}

export async function cancelGroupInviteAction(inviteId: string): Promise<CancelGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedInviteId = inviteId.trim();
  if (!trimmedInviteId) {
    return { ok: false, message: "Invite id is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const invite = await getManagedGroupInvite(adminSupabase, trimmedInviteId, currentUser);
    if (!invite) {
      return { ok: false, message: "You do not manage that invite." };
    }

    if (invite.status === "accepted") {
      return { ok: false, message: "Accepted invites cannot be canceled." };
    }

    const { error } = await adminSupabase
      .from("group_invites")
      .update({
        status: "revoked",
        last_error: null
      })
      .eq("id", invite.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    console.info("[tier-access:group-invite-canceled]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId: invite.group_id,
      inviteId: invite.id
    });

    revalidatePath("/my-groups");
    return { ok: true, message: "Group invite canceled." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not cancel that invite."
    };
  }
}

export async function removeGroupMemberAction(groupId: string, userId: string): Promise<RemoveGroupMemberResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  if (!groupId.trim() || !userId.trim()) {
    return { ok: false, message: "A valid group and user are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, groupId.trim(), currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { data: membership, error: membershipError } = await adminSupabase
      .from("group_members")
      .select("id,role")
      .eq("group_id", groupId.trim())
      .eq("user_id", userId.trim())
      .maybeSingle();

    if (membershipError) {
      return { ok: false, message: membershipError.message };
    }

    if (!membership) {
      return { ok: false, message: "That player is not in this group anymore." };
    }

    if (membership.role === "manager") {
      return { ok: false, message: "Manager memberships cannot be removed from this screen." };
    }

    const { error } = await adminSupabase
      .from("group_members")
      .delete()
      .eq("id", membership.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    console.info("[tier-access:group-member-removed]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId: managedGroup.id,
      removedUserId: userId.trim()
    });

    revalidatePath("/my-groups");
    return { ok: true, message: "Player removed from the group." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not remove that player."
    };
  }
}

export async function leaveJoinedGroupAction(groupId: string): Promise<LeaveJoinedGroupResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const { data: membership, error: membershipError } = await adminSupabase
      .from("group_members")
      .select("id,role,group:groups!group_members_group_id_fkey(id,name,owner_user_id)")
      .eq("group_id", trimmedGroupId)
      .eq("user_id", currentUser.userId)
      .maybeSingle();

    if (membershipError) {
      return { ok: false, message: membershipError.message };
    }

    const membershipRow = membership as
      | {
          id: string;
          role: GroupMemberRole;
          group?: { id: string; name: string; owner_user_id: string | null } | Array<{ id: string; name: string; owner_user_id: string | null }> | null;
        }
      | null;

    if (!membershipRow) {
      return { ok: false, message: "You are not in this group anymore." };
    }

    const group = Array.isArray(membershipRow.group) ? membershipRow.group[0] : membershipRow.group;
    if (membershipRow.role === "manager" || group?.owner_user_id === currentUser.userId) {
      return { ok: false, message: "Managers cannot leave a group from the invited leaderboard. Transfer or archive the group first." };
    }

    const { error } = await adminSupabase
      .from("group_members")
      .delete()
      .eq("id", membershipRow.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    console.info("[tier-access:joined-group-left]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId: trimmedGroupId
    });

    revalidatePath("/leaderboard");
    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return { ok: true, message: "You left the group. Your account and picks were kept." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not leave that group."
    };
  }
}

export async function updateManagedGroupLimitAction(
  groupId: string,
  membershipLimit: number
): Promise<UpdateManagedGroupLimitResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  const nextLimit = Math.floor(membershipLimit);
  if (!trimmedGroupId || nextLimit <= 0) {
    return { ok: false, message: "Enter a valid group limit." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    if (normalizeGroupKind(managedGroup.group_kind) === "captain_private") {
      return { ok: false, message: `Captain Groups are fixed at ${MAX_CAPTAIN_PRIVATE_GROUP_MEMBERS} members.` };
    }

    const [memberCountResult, pendingInviteCountResult, allowedMembershipLimit] = await Promise.all([
      adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", trimmedGroupId),
      adminSupabase.from("group_invites").select("id", { count: "exact", head: true }).eq("group_id", trimmedGroupId).eq("status", "pending"),
      currentUser.role === "admin"
        ? Promise.resolve<number | null>(null)
        : getAllowedMembershipLimitForGroup(adminSupabase, managedGroup, currentUser)
    ]);

    if (memberCountResult.error || pendingInviteCountResult.error) {
      return {
        ok: false,
        message:
          memberCountResult.error?.message ??
          pendingInviteCountResult.error?.message ??
          "Could not check the current group capacity."
      };
    }

    const usedSeats = (memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0);
    if (nextLimit < usedSeats) {
      return {
        ok: false,
        message: `This group is already using ${usedSeats} seats. Raise the limit to at least ${usedSeats}.`
      };
    }

    if (currentUser.role !== "admin") {
      if (allowedMembershipLimit !== null && nextLimit > allowedMembershipLimit) {
        return {
          ok: false,
          message: `Your current tier allows up to ${allowedMembershipLimit} members per group.`
        };
      }
    }

    const { error: updateError } = await adminSupabase
      .from("groups")
      .update({
        membership_limit: nextLimit,
        updated_at: new Date().toISOString()
      })
      .eq("id", trimmedGroupId);

    if (updateError) {
      return { ok: false, message: updateError.message };
    }

    console.info("[tier-access:group-limit-updated]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId: trimmedGroupId,
      nextLimit
    });

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message: `Group limit updated to ${nextLimit} members.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update that group limit."
    };
  }
}

export async function updateManagedGroupProfileAction(
  input: UpdateManagedGroupProfileInput
): Promise<UpdateManagedGroupProfileResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = input.groupId.trim();
  const name = input.name.trim();
  const description = normalizeGroupDescription(input.description);

  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  if (!name) {
    return { ok: false, message: "Group name is required." };
  }

  if (name.length > MAX_GROUP_NAME_LENGTH) {
    return { ok: false, message: `Keep the group name under ${MAX_GROUP_NAME_LENGTH} characters.` };
  }

  if (description.length > MAX_GROUP_DESCRIPTION_LENGTH) {
    return { ok: false, message: `Keep the group description under ${MAX_GROUP_DESCRIPTION_LENGTH} characters.` };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { error } = await adminSupabase
      .from("groups")
      .update({
        name,
        description: description || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", trimmedGroupId);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");

    return { ok: true, message: "Group profile updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update that group profile."
    };
  }
}

export async function uploadManagedGroupAvatarAction(formData: FormData): Promise<UpdateManagedGroupAvatarResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = String(formData.get("groupId") ?? "").trim();
  const file = formData.get("file");

  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  if (!(file instanceof File)) {
    return { ok: false, message: "Choose an image file first." };
  }

  if (file.size > MAX_GROUP_AVATAR_FILE_BYTES) {
    return { ok: false, message: "Choose a JPG, PNG, or WEBP image under 2 MB." };
  }

  const extension = getGroupAvatarExtension(file.type);
  if (!extension) {
    return { ok: false, message: "Use a JPG, PNG, or WEBP image for the group avatar." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const uploadBytes = Buffer.from(await file.arrayBuffer());
    await removeKnownGroupAvatarObjects(adminSupabase, trimmedGroupId);

    const objectPath = buildManagedGroupAvatarObjectPath(trimmedGroupId, extension);
    const { error: uploadError } = await adminSupabase.storage.from(GROUP_AVATAR_BUCKET).upload(objectPath, uploadBytes, {
      upsert: false,
      contentType: file.type,
      cacheControl: "3600"
    });

    if (uploadError) {
      if (isMissingStorageBucketError(uploadError.message, GROUP_AVATAR_BUCKET)) {
        return { ok: false, message: "Group avatar uploads are not available yet. Apply the group avatar storage migration first." };
      }
      return { ok: false, message: uploadError.message };
    }

    const { data: publicUrlData } = adminSupabase.storage.from(GROUP_AVATAR_BUCKET).getPublicUrl(objectPath);
    const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await adminSupabase
      .from("groups")
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", trimmedGroupId);

    if (updateError) {
      await removeKnownGroupAvatarObjects(adminSupabase, trimmedGroupId);
      return { ok: false, message: updateError.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");

    return {
      ok: true,
      avatarUrl,
      message: "Group avatar updated."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not upload that group avatar."
    };
  }
}

export async function removeManagedGroupAvatarAction(groupId: string): Promise<RemoveManagedGroupAvatarResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    await removeKnownGroupAvatarObjects(adminSupabase, trimmedGroupId);

    const { error } = await adminSupabase
      .from("groups")
      .update({
        avatar_url: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", trimmedGroupId);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");

    return { ok: true, message: "Group avatar removed." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not remove that group avatar."
    };
  }
}

export async function updateManagedGroupAccessAction(
  input: UpdateManagedGroupAccessInput
): Promise<UpdateManagedGroupAccessResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = input.groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const accessMode = normalizeGroupAccessMode(input.accessMode);
    const { error } = await adminSupabase
      .from("groups")
      .update({
        access_mode: accessMode,
        updated_at: new Date().toISOString()
      })
      .eq("id", trimmedGroupId);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message:
        accessMode === "closed"
          ? "Group access closed. New members can no longer join."
          : accessMode === "restricted_by_email"
            ? "This group now accepts approved emails only."
            : "Invite code access is open again."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update group access."
    };
  }
}

export async function saveManagedGroupAllowedEmailsAction(
  input: SaveManagedGroupAllowedEmailsInput
): Promise<SaveManagedGroupAllowedEmailsResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = input.groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  const parsedEmails = parseAllowedEmailInput(input.emailsText);
  if (parsedEmails.validEmails.length === 0 && parsedEmails.invalidEntries.length === 0) {
    return { ok: false, message: "Add at least one email first." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { data: existingRows, error: existingRowsError } = await adminSupabase
      .from("group_allowed_emails")
      .select("email_normalized")
      .eq("group_id", trimmedGroupId);

    if (existingRowsError) {
      return { ok: false, message: existingRowsError.message };
    }

    const existingEmails = new Set(
      ((existingRows ?? []) as Array<{ email_normalized: string }>).map((row) => normalizeEmail(row.email_normalized))
    );
    const emailsToInsert = parsedEmails.validEmails.filter((email) => !existingEmails.has(email));

    if (emailsToInsert.length > 0) {
      const { error: insertError } = await adminSupabase.from("group_allowed_emails").insert(
        emailsToInsert.map((email) => ({
          group_id: trimmedGroupId,
          email_normalized: email,
          created_by_user_id: currentUser.userId
        }))
      );

      if (insertError) {
        return { ok: false, message: insertError.message };
      }
    }

    revalidatePath("/my-groups");

    const duplicateIgnoredCount = parsedEmails.duplicateEntries.length + (parsedEmails.validEmails.length - emailsToInsert.length);
    return {
      ok: true,
      message:
        emailsToInsert.length > 0
          ? `Added ${emailsToInsert.length} approved email${emailsToInsert.length === 1 ? "" : "s"}.`
          : "No new emails were added.",
      summary: {
        addedCount: emailsToInsert.length,
        duplicateIgnoredCount,
        invalidCount: parsedEmails.invalidEntries.length
      }
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save that email list."
    };
  }
}

export async function removeManagedGroupAllowedEmailAction(
  groupId: string,
  allowedEmailId: string
): Promise<RemoveManagedGroupAllowedEmailResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  const trimmedAllowedEmailId = allowedEmailId.trim();
  if (!trimmedGroupId || !trimmedAllowedEmailId) {
    return { ok: false, message: "A valid group and email are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { error } = await adminSupabase
      .from("group_allowed_emails")
      .delete()
      .eq("id", trimmedAllowedEmailId)
      .eq("group_id", trimmedGroupId);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    return { ok: true, message: "Approved email removed." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not remove that approved email."
    };
  }
}

export async function addGroupFocusTeamAction(groupId: string, teamId: string): Promise<AddGroupFocusTeamResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  const trimmedTeamId = teamId.trim();
  if (!trimmedGroupId || !trimmedTeamId) {
    return { ok: false, message: "A valid group and team are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { error } = await adminSupabase
      .from("group_focus_teams")
      .insert({
        group_id: trimmedGroupId,
        team_id: trimmedTeamId,
        created_by_user_id: currentUser.userId
      });

    if (error) {
      if (error.code === "23505") {
        return { ok: false, message: "That team is already in this group’s focus list." };
      }

      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    return { ok: true, message: "Team added to the group focus list." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not add that team."
    };
  }
}

export async function addAllGroupFocusTeamsAction(groupId: string): Promise<AddAllGroupFocusTeamsResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const [{ data: existingRows, error: existingRowsError }, { data: teamsData, error: teamsError }] = await Promise.all([
      adminSupabase.from("group_focus_teams").select("team_id").eq("group_id", trimmedGroupId),
      adminSupabase.from("teams").select("id")
    ]);

    if (existingRowsError || teamsError) {
      return { ok: false, message: existingRowsError?.message ?? teamsError?.message ?? "Could not load the teams for this group." };
    }

    const existingTeamIds = new Set(((existingRows ?? []) as Array<{ team_id: string }>).map((row) => row.team_id));
    const missingTeamIds = ((teamsData ?? []) as Array<{ id: string }>)
      .map((row) => row.id)
      .filter((teamId) => !existingTeamIds.has(teamId));

    if (missingTeamIds.length === 0) {
      return { ok: true, message: "All teams are already included in this group’s tallies." };
    }

    const { error: insertError } = await adminSupabase.from("group_focus_teams").insert(
      missingTeamIds.map((teamId) => ({
        group_id: trimmedGroupId,
        team_id: teamId,
        created_by_user_id: currentUser.userId
      }))
    );

    if (insertError) {
      return { ok: false, message: insertError.message };
    }

    revalidatePath("/my-groups");
    return { ok: true, message: "All teams are now included in this group’s tallies." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not include all teams."
    };
  }
}

export async function removeGroupFocusTeamAction(
  groupId: string,
  focusTeamId: string
): Promise<RemoveGroupFocusTeamResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  const trimmedFocusTeamId = focusTeamId.trim();
  if (!trimmedGroupId || !trimmedFocusTeamId) {
    return { ok: false, message: "A valid group and focused team are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { error } = await adminSupabase
      .from("group_focus_teams")
      .delete()
      .eq("id", trimmedFocusTeamId)
      .eq("group_id", trimmedGroupId);

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/my-groups");
    return { ok: true, message: "Team removed from the group focus list." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not remove that team."
    };
  }
}

export async function assignCaptainsPassAction(
  input: AssignCaptainsPassInput
): Promise<AssignCaptainsPassResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = input.groupId.trim();
  const trimmedCaptainUserId = input.captainUserId.trim();
  const inviteAllowance = Math.max(1, Math.min(MAX_CAPTAINS_PASS_ALLOWANCE, Math.floor(input.inviteAllowance)));

  if (!trimmedGroupId || !trimmedCaptainUserId) {
    return { ok: false, message: "A valid group and captain are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    if (normalizeGroupKind(managedGroup.group_kind) !== "standard") {
      return { ok: false, message: "Captain’s Pass is only available on standard managed groups." };
    }

    const [{ data: existingPass, error: existingPassError }, { data: captainMembership, error: captainMembershipError }] =
      await Promise.all([
        adminSupabase
          .from("captains_passes")
          .select("id,status,captain_user_id,captain_private_group_id")
          .eq("manager_group_id", trimmedGroupId)
          .maybeSingle(),
        adminSupabase
          .from("group_members")
          .select("id,role,user:users!group_members_user_id_fkey(id,name,email)")
          .eq("group_id", trimmedGroupId)
          .eq("user_id", trimmedCaptainUserId)
          .maybeSingle()
      ]);

    if (existingPassError) {
      return { ok: false, message: existingPassError.message };
    }

    if (captainMembershipError) {
      return { ok: false, message: captainMembershipError.message };
    }

    const captainUser = Array.isArray(captainMembership?.user) ? captainMembership?.user[0] : captainMembership?.user;
    if (!captainMembership || !captainUser) {
      return { ok: false, message: "Choose a current member of this group to receive the Captain’s Pass." };
    }

    if (captainMembership.role !== "member") {
      return { ok: false, message: "Only a trusted player member can receive the Captain’s Pass." };
    }

    const existingPassStatus = normalizeCaptainsPassStatus(existingPass?.status);
    if (
      existingPass &&
      existingPassStatus !== "available" &&
      existingPassStatus !== "cancelled_by_admin" &&
      existingPassStatus !== "expired"
    ) {
      return { ok: false, message: "This group already has an active Captain’s Pass." };
    }

    const [memberCountResult, pendingInviteCountResult, existingCaptainGroupResult, existingCaptainAssignmentResult] = await Promise.all([
      adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", trimmedGroupId),
      adminSupabase.from("group_invites").select("id", { count: "exact", head: true }).eq("group_id", trimmedGroupId).eq("status", "pending"),
      adminSupabase
        .from("groups")
        .select("id")
        .eq("owner_user_id", trimmedCaptainUserId)
        .eq("group_kind", "captain_private")
        .eq("status", "active")
        .maybeSingle(),
      adminSupabase
        .from("captains_passes")
        .select("id")
        .eq("captain_user_id", trimmedCaptainUserId)
        .in("status", ["claimed", "exhausted"])
        .maybeSingle()
    ]);

    if (memberCountResult.error || pendingInviteCountResult.error || existingCaptainGroupResult.error || existingCaptainAssignmentResult.error) {
      return {
        ok: false,
        message:
          memberCountResult.error?.message ??
          pendingInviteCountResult.error?.message ??
          existingCaptainGroupResult.error?.message ??
          existingCaptainAssignmentResult.error?.message ??
          "Could not prepare that Captain’s Pass."
      };
    }

    if (existingCaptainGroupResult.data || existingCaptainAssignmentResult.data) {
      return { ok: false, message: "That player already has a Captain Group or an active Captain’s Pass." };
    }

    const effectiveSeatLimit = await getEffectiveGroupSeatLimit(adminSupabase, managedGroup, currentUser);
    const remainingSeats = Math.max(0, effectiveSeatLimit - ((memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0)));
    if (remainingSeats <= 0) {
      return { ok: false, message: "This group is full, so there is no remaining Captain invite allowance to assign." };
    }

    if (inviteAllowance > remainingSeats) {
      return {
        ok: false,
        message: `Choose an allowance up to ${remainingSeats}. Captain invites cannot exceed your remaining group capacity.`
      };
    }

    const captainGroupName = buildCaptainPrivateGroupName(captainUser.name);
    const { data: createdCaptainGroup, error: createdCaptainGroupError } = await adminSupabase
      .from("groups")
      .insert({
        name: captainGroupName,
        description: `Private Captain Group linked to ${managedGroup.name}.`,
        base_prediction_mode: "my_picks",
        home_team_advantage_enabled: false,
        access_mode: "open_by_code",
        group_kind: "captain_private",
        parent_group_id: trimmedGroupId,
        owner_user_id: trimmedCaptainUserId,
        created_by_user_id: currentUser.userId,
        membership_limit: MAX_CAPTAIN_PRIVATE_GROUP_MEMBERS,
        status: "active"
      })
      .select("id")
      .single();

    if (createdCaptainGroupError || !createdCaptainGroup) {
      return { ok: false, message: createdCaptainGroupError?.message ?? "Could not create the Captain Group." };
    }

    const captainsPassPayload = {
      manager_group_id: trimmedGroupId,
      captain_user_id: trimmedCaptainUserId,
      captain_email_normalized: normalizeEmail(captainUser.email),
      issued_by_user_id: currentUser.userId,
      status: "claimed",
      manager_group_invite_allowance: inviteAllowance,
      manager_group_invites_used: 0,
      captain_private_group_id: createdCaptainGroup.id,
      claimed_at: new Date().toISOString(),
      expires_at: null
    };

    const { error: captainsPassError } = existingPass
      ? await adminSupabase
          .from("captains_passes")
          .update(captainsPassPayload)
          .eq("id", existingPass.id)
      : await adminSupabase.from("captains_passes").insert(captainsPassPayload);

    if (captainsPassError) {
      return { ok: false, message: captainsPassError.message };
    }

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message: `${captainUser.name} is now this group’s Captain with ${inviteAllowance} invite${inviteAllowance === 1 ? "" : "s"}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not issue that Captain’s Pass."
    };
  }
}

async function issueCaptainsPassForMember(input: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  managedGroup: GroupRow;
  issuerUserId: string;
  captainUserId: string;
  inviteAllowance: number;
  validateAllowanceCapacity?: boolean;
  ignoreInviteId?: string;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const { adminSupabase, managedGroup, issuerUserId, captainUserId } = input;
  const inviteAllowance = normalizeCaptainInviteAllowance(input.inviteAllowance);

  if (normalizeGroupKind(managedGroup.group_kind) !== "standard") {
    return { ok: false, message: "Captain’s Pass is only available on standard managed groups." };
  }

  const [{ data: existingPass, error: existingPassError }, { data: captainMembership, error: captainMembershipError }] =
    await Promise.all([
      adminSupabase
        .from("captains_passes")
        .select("id,status,captain_user_id,captain_private_group_id")
        .eq("manager_group_id", managedGroup.id)
        .maybeSingle(),
      adminSupabase
        .from("group_members")
        .select("id,role,user:users!group_members_user_id_fkey(id,name,email)")
        .eq("group_id", managedGroup.id)
        .eq("user_id", captainUserId)
        .maybeSingle()
    ]);

  if (existingPassError) {
    return { ok: false, message: existingPassError.message };
  }

  if (captainMembershipError) {
    return { ok: false, message: captainMembershipError.message };
  }

  const captainUser = Array.isArray(captainMembership?.user) ? captainMembership?.user[0] : captainMembership?.user;
  if (!captainMembership || !captainUser) {
    return { ok: false, message: "Choose a current member of this group to receive the Captain’s Pass." };
  }

  if (captainMembership.role !== "member") {
    return { ok: false, message: "Only a trusted player member can receive the Captain’s Pass." };
  }

  const existingPassStatus = normalizeCaptainsPassStatus(existingPass?.status);
  if (
    existingPass &&
    existingPassStatus !== "available" &&
    existingPassStatus !== "cancelled_by_admin" &&
    existingPassStatus !== "expired"
  ) {
    if (existingPass.captain_user_id === captainUserId && (existingPassStatus === "claimed" || existingPassStatus === "exhausted")) {
      return {
        ok: true,
        message: `${captainUser.name} already has this group’s Captain’s Pass.`
      };
    }

    return { ok: false, message: "This group already has an active Captain’s Pass." };
  }

  const [existingCaptainGroupResult, existingCaptainAssignmentResult] = await Promise.all([
    adminSupabase
      .from("groups")
      .select("id")
      .eq("owner_user_id", captainUserId)
      .eq("group_kind", "captain_private")
      .eq("status", "active")
      .maybeSingle(),
    adminSupabase
      .from("captains_passes")
      .select("id")
      .eq("captain_user_id", captainUserId)
      .in("status", ["claimed", "exhausted"])
      .maybeSingle()
  ]);

  if (existingCaptainGroupResult.error || existingCaptainAssignmentResult.error) {
    return {
      ok: false,
      message:
        existingCaptainGroupResult.error?.message ??
        existingCaptainAssignmentResult.error?.message ??
        "Could not prepare that Captain’s Pass."
    };
  }

  if (existingCaptainGroupResult.data || existingCaptainAssignmentResult.data) {
    return { ok: false, message: "That player already has a Captain Group or an active Captain’s Pass." };
  }

  if (input.validateAllowanceCapacity ?? true) {
    const capacityCheck = await ensureGroupHasCaptainInviteCapacity(
      adminSupabase,
      managedGroup,
      inviteAllowance,
      input.ignoreInviteId
    );
    if (!capacityCheck.ok) {
      return capacityCheck;
    }
  }

  const captainGroupName = buildCaptainPrivateGroupName(captainUser.name);
  const { data: createdCaptainGroup, error: createdCaptainGroupError } = await adminSupabase
    .from("groups")
    .insert({
      name: captainGroupName,
      description: `Private Captain Group linked to ${managedGroup.name}.`,
      base_prediction_mode: "my_picks",
      home_team_advantage_enabled: false,
      access_mode: "open_by_code",
      group_kind: "captain_private",
      parent_group_id: managedGroup.id,
      owner_user_id: captainUserId,
      created_by_user_id: issuerUserId,
      membership_limit: MAX_CAPTAIN_PRIVATE_GROUP_MEMBERS,
      status: "active"
    })
    .select("id")
    .single();

  if (createdCaptainGroupError || !createdCaptainGroup) {
    return { ok: false, message: createdCaptainGroupError?.message ?? "Could not create the Captain Group." };
  }

  const captainsPassPayload = {
    manager_group_id: managedGroup.id,
    captain_user_id: captainUserId,
    captain_email_normalized: normalizeEmail(captainUser.email),
    issued_by_user_id: issuerUserId,
    status: "claimed",
    manager_group_invite_allowance: inviteAllowance,
    manager_group_invites_used: 0,
    captain_private_group_id: createdCaptainGroup.id,
    claimed_at: new Date().toISOString(),
    expires_at: null
  };

  const { error: captainsPassError } = existingPass
    ? await adminSupabase
        .from("captains_passes")
        .update(captainsPassPayload)
        .eq("id", existingPass.id)
    : await adminSupabase.from("captains_passes").insert(captainsPassPayload);

  if (captainsPassError) {
    return { ok: false, message: captainsPassError.message };
  }

  return {
    ok: true,
    message: `${captainUser.name} is now this group’s Captain with ${inviteAllowance} invite${inviteAllowance === 1 ? "" : "s"}.`
  };
}

export async function createCaptainManagedGroupInviteAction(
  input: CreateCaptainManagedGroupInviteInput
): Promise<CreateCaptainManagedGroupInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const groupId = input.groupId?.trim();
  const normalizedEmail = normalizeEmail(input.email);
  if (!groupId || !normalizedEmail) {
    return { ok: false, message: "A valid group and email are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const [{ data: group, error: groupError }, { data: passRow, error: passError }] = await Promise.all([
      adminSupabase
        .from("groups")
        .select("id,name,owner_user_id,created_by_user_id,description,avatar_url,access_mode,group_kind,parent_group_id,membership_limit,status,created_at,updated_at")
        .eq("id", groupId)
        .maybeSingle(),
      adminSupabase
        .from("captains_passes")
        .select("id,manager_group_id,captain_user_id,status,manager_group_invite_allowance,manager_group_invites_used")
        .eq("manager_group_id", groupId)
        .eq("captain_user_id", currentUser.userId)
        .maybeSingle()
    ]);

    if (groupError) {
      return { ok: false, message: groupError.message };
    }

    if (passError) {
      return { ok: false, message: passError.message };
    }

    const managedGroup = (group as GroupRow | null) ?? null;
    if (!managedGroup || managedGroup.status !== "active") {
      return { ok: false, message: "That group is not accepting members right now." };
    }

    const captainsPass = passRow as Pick<CaptainsPassRow, "id" | "status" | "manager_group_invite_allowance" | "manager_group_invites_used"> | null;
    if (!captainsPass) {
      return { ok: false, message: "You do not have a Captain’s Pass for that group." };
    }

    const passStatus = normalizeCaptainsPassStatus(captainsPass.status);
    if (passStatus !== "claimed" && passStatus !== "exhausted") {
      return { ok: false, message: "That Captain’s Pass is not active anymore." };
    }

    const accessCheck = await ensureGroupAllowsEmail(adminSupabase, managedGroup, normalizedEmail);
    if (!accessCheck.ok) {
      return accessCheck;
    }

    const seatCheck = await ensureGroupHasInviteCapacity(adminSupabase, managedGroup, currentUser);
    if (!seatCheck.ok) {
      return seatCheck;
    }

    const effectiveSeatLimit = await getEffectiveGroupSeatLimit(adminSupabase, managedGroup, currentUser);
    const [memberCountResult, pendingInviteCountResult, existingPendingInviteResult] = await Promise.all([
      adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId),
      adminSupabase.from("group_invites").select("id", { count: "exact", head: true }).eq("group_id", groupId).eq("status", "pending"),
      adminSupabase
        .from("group_invites")
        .select("id")
        .eq("group_id", groupId)
        .eq("normalized_email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle()
    ]);

    if (memberCountResult.error || pendingInviteCountResult.error || existingPendingInviteResult.error) {
      return {
        ok: false,
        message:
          memberCountResult.error?.message ??
          pendingInviteCountResult.error?.message ??
          existingPendingInviteResult.error?.message ??
          "Could not prepare that invite."
      };
    }

    const remainingCaptainAllowance = getRemainingCaptainsPassAllowance({
      allowance: captainsPass.manager_group_invite_allowance,
      invitesUsed: captainsPass.manager_group_invites_used,
      remainingSeats: Math.max(0, effectiveSeatLimit - ((memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0)))
    });

    if (remainingCaptainAllowance <= 0) {
      return { ok: false, message: "This Captain’s Pass has no invite allowance left for the manager’s group." };
    }

    if (existingPendingInviteResult.data) {
      return { ok: false, message: "A pending invite already exists for that email in this group." };
    }

    const existingUserId = await findUserIdByEmail(adminSupabase, normalizedEmail);
    if (existingUserId) {
      const [{ data: existingMembership, error: existingMembershipError }, joinLimitResult] = await Promise.all([
        adminSupabase
          .from("group_members")
          .select("id")
          .eq("group_id", groupId)
          .eq("user_id", existingUserId)
          .maybeSingle(),
        ensureUserCanJoinAnotherGroup(adminSupabase, existingUserId)
      ]);

      if (existingMembershipError) {
        return { ok: false, message: existingMembershipError.message };
      }

      if (existingMembership) {
        return { ok: false, message: "That user is already a member of this group." };
      }

      if (!joinLimitResult.ok) {
        return joinLimitResult;
      }
    }

    const token = randomBytes(24).toString("hex");
    const tokenHash = hashInviteToken(token);
    const inviteLanguage = normalizeLanguage(currentUser.preferredLanguage);
    const helperLanguage = normalizeExplainerLanguage(inviteLanguage);
    const claimUrl = buildGroupInviteClaimUrl(token, inviteLanguage, helperLanguage, existingUserId ? "login" : "signup");
    const expiresAt = new Date(Date.now() + normalizeExpiryDays(undefined) * 24 * 60 * 60 * 1000).toISOString();
    const inviterProfile = await getUserLabel(adminSupabase, currentUser.userId);

    const { data: inviteData, error: inviteError } = await adminSupabase
      .from("group_invites")
      .insert({
        group_id: groupId,
        email: normalizedEmail,
        normalized_email: normalizedEmail,
        invited_by_user_id: currentUser.userId,
        language: inviteLanguage,
        helper_language: helperLanguage,
        status: "pending",
        claim_token: token,
        token_hash: tokenHash,
        email_status: "pending",
        expires_at: expiresAt,
        invite_source: "captain_pass",
        captains_pass_id: captainsPass.id
      })
      .select("id,group_id,email,status,expires_at")
      .single();

    if (inviteError) {
      return { ok: false, message: inviteError.message };
    }

    const enqueueResult = await enqueueGroupInviteEmail(adminSupabase, {
      email: normalizedEmail,
      groupInviteId: inviteData.id,
      groupId,
      groupName: managedGroup.name ?? "Group",
      invitedByUserId: currentUser.userId,
      inviterName: inviterProfile.name,
      inviterEmail: inviterProfile.email,
      suggestedDisplayName: null,
      customMessage: null,
      language: inviteLanguage,
      helperLanguage,
      existingAccount: Boolean(existingUserId),
      claimUrl
    });

    if (!enqueueResult.ok) {
      await markGroupInviteEmailFailure(adminSupabase, inviteData.id, enqueueResult.message);
      revalidatePath("/my-groups");
      return {
        ok: true,
        invite: {
          id: inviteData.id,
          groupId: inviteData.group_id,
          email: inviteData.email,
          existingAccount: Boolean(existingUserId),
          status: inviteData.status,
          expiresAt: inviteData.expires_at ?? null
        },
        claimUrl,
        deliveryStatus: "queue_failed",
        message: `Invite created, but the email could not be queued: ${enqueueResult.message}`
      };
    }

    await triggerEmailWorkerNow();
    revalidatePath("/my-groups");

    return {
      ok: true,
      invite: {
        id: inviteData.id,
        groupId: inviteData.group_id,
        email: inviteData.email,
        existingAccount: Boolean(existingUserId),
        status: inviteData.status,
        expiresAt: inviteData.expires_at ?? null
      },
      claimUrl,
      deliveryStatus: enqueueResult.deliveryMethod === "sent_inline" ? "sent_inline" : "queued",
      message: "Captain invite email queued."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create that Captain invite."
    };
  }
}

export async function createCaptainOnboardingInviteAction(
  input: CreateCaptainOnboardingInviteInput
): Promise<CreateCaptainOnboardingInviteResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  if (currentUser.role !== "admin") {
    return { ok: false, message: "Only Super Admins can create Captain invite links." };
  }

  const groupId = input.groupId.trim();
  const normalizedEmail = normalizeEmail(input.email);
  const inviteAllowance = normalizeCaptainInviteAllowance(input.inviteAllowance);

  if (!groupId || !normalizedEmail || !BASIC_EMAIL_PATTERN.test(normalizedEmail)) {
    return { ok: false, message: "Enter a valid group and email for the Captain invite." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, groupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    if (normalizeGroupKind(managedGroup.group_kind) !== "standard") {
      return { ok: false, message: "Captain invite links are only available for standard groups." };
    }

    if (managedGroup.status !== "active") {
      return { ok: false, message: "That group is not accepting Captain invites right now." };
    }

    const accessCheck = await ensureGroupAllowsEmail(adminSupabase, managedGroup, normalizedEmail);
    if (!accessCheck.ok) {
      return accessCheck;
    }

    const existingUserId = await findUserIdByEmail(adminSupabase, normalizedEmail);
    const [
      { data: existingMembership, error: existingMembershipError },
      { data: existingPendingInvite, error: existingPendingInviteError },
      { data: existingGroupCaptainInvite, error: existingGroupCaptainInviteError },
      { data: existingPass, error: existingPassError }
    ] =
      await Promise.all([
        existingUserId
          ? adminSupabase
              .from("group_members")
              .select("id,role")
              .eq("group_id", managedGroup.id)
              .eq("user_id", existingUserId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        adminSupabase
          .from("group_invites")
          .select("id")
          .eq("group_id", managedGroup.id)
          .eq("normalized_email", normalizedEmail)
          .eq("status", "pending")
          .maybeSingle(),
        adminSupabase
          .from("group_invites")
          .select("id,email")
          .eq("group_id", managedGroup.id)
          .eq("invite_intent", "captain_pass")
          .eq("status", "pending")
          .maybeSingle(),
        adminSupabase
          .from("captains_passes")
          .select("id,status")
          .eq("manager_group_id", managedGroup.id)
          .maybeSingle()
      ]);

    if (existingMembershipError || existingPendingInviteError || existingGroupCaptainInviteError || existingPassError) {
      return {
        ok: false,
        message:
          existingMembershipError?.message ??
          existingPendingInviteError?.message ??
          existingGroupCaptainInviteError?.message ??
          existingPassError?.message ??
          "Could not prepare that Captain invite."
      };
    }

    const existingPassStatus = normalizeCaptainsPassStatus(existingPass?.status);
    if (
      existingPass &&
      existingPassStatus !== "available" &&
      existingPassStatus !== "cancelled_by_admin" &&
      existingPassStatus !== "expired"
    ) {
      return { ok: false, message: "This group already has an active Captain’s Pass." };
    }

    if (existingMembership && existingMembership.role !== "member") {
      return { ok: false, message: "Only a player member can receive a Captain’s Pass for this group." };
    }

    if (existingGroupCaptainInvite && existingGroupCaptainInvite.email !== normalizedEmail) {
      return {
        ok: false,
        message: `A pending Captain invite already exists for ${existingGroupCaptainInvite.email}.`
      };
    }

    if (existingPendingInvite) {
      return { ok: false, message: "A pending invite already exists for that email in this group." };
    }

    if (existingUserId && !existingMembership) {
      const joinLimitResult = await ensureUserCanJoinAnotherGroup(adminSupabase, existingUserId);
      if (!joinLimitResult.ok) {
        return joinLimitResult;
      }
    }

    const requiredOpenSeats = (existingMembership ? 0 : 1) + inviteAllowance;
    const capacityCheck = await ensureGroupHasCaptainInviteCapacity(adminSupabase, managedGroup, requiredOpenSeats);
    if (!capacityCheck.ok) {
      return capacityCheck;
    }

    const token = randomBytes(24).toString("hex");
    const tokenHash = hashInviteToken(token);
    const inviteLanguage = normalizeLanguage(input.language ?? currentUser.preferredLanguage);
    const helperLanguage = normalizeExplainerLanguage(input.helperLanguage ?? inviteLanguage);
    const claimUrl = buildGroupInviteClaimUrl(token, inviteLanguage, helperLanguage, existingUserId ? "login" : "signup");
    const expiresAt = new Date(Date.now() + normalizeExpiryDays(input.expiresInDays) * 24 * 60 * 60 * 1000).toISOString();
    const inviterProfile = await getUserLabel(adminSupabase, currentUser.userId);

    const { data: inviteData, error: inviteError } = await adminSupabase
      .from("group_invites")
      .insert({
        group_id: managedGroup.id,
        email: normalizedEmail,
        normalized_email: normalizedEmail,
        invited_by_user_id: currentUser.userId,
        suggested_display_name: null,
        custom_message: "Captain invite",
        language: inviteLanguage,
        helper_language: helperLanguage,
        status: "pending",
        claim_token: token,
        token_hash: tokenHash,
        email_status: "pending",
        expires_at: expiresAt,
        invite_source: "manager_invite",
        invite_intent: "captain_pass",
        captain_invite_allowance: inviteAllowance
      })
      .select("id,group_id,email,status,expires_at")
      .single();

    if (inviteError) {
      return { ok: false, message: inviteError.message };
    }

    const enqueueResult = await enqueueGroupInviteEmail(adminSupabase, {
      email: normalizedEmail,
      groupInviteId: inviteData.id,
      groupId: managedGroup.id,
      groupName: managedGroup.name ?? "Group",
      invitedByUserId: currentUser.userId,
      inviterName: inviterProfile.name,
      inviterEmail: inviterProfile.email,
      suggestedDisplayName: null,
      customMessage: "This invite lets you join as Captain.",
      language: inviteLanguage,
      helperLanguage,
      existingAccount: Boolean(existingUserId),
      claimUrl
    });

    let deliveryStatus: "queued" | "already_queued" | "sent_inline" | "queue_failed" = "queued";
    if (!enqueueResult.ok) {
      await markGroupInviteEmailFailure(adminSupabase, inviteData.id, enqueueResult.message);
      deliveryStatus = "queue_failed";
    } else {
      deliveryStatus = enqueueResult.deliveryMethod === "sent_inline" ? "sent_inline" : "queued";
      if (enqueueResult.deliveryMethod === "queued") {
        await triggerEmailWorkerNow();
      }
    }

    revalidatePath("/my-groups");

    return {
      ok: true,
      invite: {
        id: inviteData.id,
        groupId: inviteData.group_id,
        email: inviteData.email,
        existingAccount: Boolean(existingUserId),
        status: inviteData.status,
        expiresAt: inviteData.expires_at ?? null,
        inviteAllowance
      },
      claimUrl,
      deliveryStatus,
      message:
        deliveryStatus === "queue_failed"
          ? "Captain invite link created, but the email could not be queued."
          : "Captain invite created."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not create that Captain invite link."
    };
  }
}

export async function saveManagedGroupRulesetAction(
  input: SaveManagedGroupRulesetInput
): Promise<SaveManagedGroupRulesetResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  if (!canManageLeagueCustomScoring(currentUser)) {
    return {
      ok: false,
      message: "League custom scoring is not available in the current product offer. Groups use standard Manager scoring."
    };
  }

  const trimmedGroupId = input.groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "Group id is required." };
  }

  const preset = resolveManagedGroupRulesetPreset(input.presetKey ?? "classic");
  const requestedStatus = normalizeManagedGroupRulesetStatus(input.status);
  const nextRuleset = {
    presetKey: preset.key,
    status: requestedStatus,
    earlyGroupStageCompletionBonus:
      input.earlyGroupStageCompletionBonus === undefined
        ? preset.ruleset.earlyGroupStageCompletionBonus
        : normalizeRulesetBonusValue(input.earlyGroupStageCompletionBonus, 10),
    knockoutCompletionBonus:
      input.knockoutCompletionBonus === undefined
        ? preset.ruleset.knockoutCompletionBonus
        : normalizeRulesetBonusValue(input.knockoutCompletionBonus, 10),
    finalMatchupBonus:
      input.finalMatchupBonus === undefined
        ? preset.ruleset.finalMatchupBonus
        : normalizeRulesetBonusValue(input.finalMatchupBonus, 15),
    exactFinalScoreBonus:
      input.exactFinalScoreBonus === undefined
        ? preset.ruleset.exactFinalScoreBonus
        : normalizeRulesetBonusValue(input.exactFinalScoreBonus, 25),
    sidePickPackageKey: preset.ruleset.sidePickPackageKey,
    sidePickPackageId: input.sidePickPackageId?.trim() || null
  };

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    if (nextRuleset.sidePickPackageKey) {
      const packages = await fetchSidePickPackageOptions(adminSupabase, "group_custom");
      const matchedPackage =
        packages.find((pkg) => pkg.key === nextRuleset.sidePickPackageKey) ??
        packages.find((pkg) => pkg.id === nextRuleset.sidePickPackageId);
      if (!matchedPackage) {
        return { ok: false, message: "Choose a valid group-local side-pick package." };
      }
      nextRuleset.sidePickPackageId = matchedPackage.id;
    }

    const { data: existingRulesets, error: existingRulesetsError } = await adminSupabase
      .from("group_rulesets")
      .select("id,version,status,group_stage_mode")
      .eq("group_id", trimmedGroupId)
      .order("version", { ascending: false });

    if (existingRulesetsError) {
      return { ok: false, message: existingRulesetsError.message };
    }

    const latestRuleset = (((existingRulesets ?? []) as Array<{
      version: number;
      status: string;
      group_stage_mode?: string | null;
    }>)[0] ?? null);
    if (latestRuleset?.status === "locked" && currentUser.role !== "admin") {
      return { ok: false, message: "This group ruleset is locked. Ask a super admin if it needs to change." };
    }

    const nextVersion = (latestRuleset?.version ?? 0) + 1;
    const legacyGroupStageMode = normalizeGroupStageMode(latestRuleset?.group_stage_mode);
    if (nextRuleset.status === "active") {
      const { error: supersedeError } = await adminSupabase
        .from("group_rulesets")
        .update({
          status: "superseded",
          updated_at: new Date().toISOString()
        })
        .eq("group_id", trimmedGroupId)
        .eq("status", "active");

      if (supersedeError) {
        return { ok: false, message: supersedeError.message };
      }
    }

    const { error: insertError } = await adminSupabase
      .from("group_rulesets")
      .insert({
        group_id: trimmedGroupId,
        version: nextVersion,
        status: nextRuleset.status,
        group_stage_mode: legacyGroupStageMode,
        early_group_stage_completion_bonus: nextRuleset.earlyGroupStageCompletionBonus,
        knockout_completion_bonus: nextRuleset.knockoutCompletionBonus,
        final_matchup_bonus: nextRuleset.finalMatchupBonus,
        exact_final_score_bonus: nextRuleset.exactFinalScoreBonus,
        side_pick_package_id: nextRuleset.sidePickPackageId,
        created_by_user_id: currentUser.userId
      });

    if (insertError) {
      return { ok: false, message: insertError.message };
    }

    await rebuildGroupCustomBonusScores(adminSupabase, [trimmedGroupId]);

    console.info("[group-ruleset-saved]", {
      actorUserId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId: trimmedGroupId,
      version: nextVersion,
      status: nextRuleset.status,
      groupStageMode: legacyGroupStageMode,
      presetKey: nextRuleset.presetKey,
      sidePickPackageId: nextRuleset.sidePickPackageId
    });

    revalidatePath("/my-groups");
    revalidatePath("/leaderboard");

    return {
      ok: true,
      message:
        nextVersion === 1
          ? `${preset.label} ruleset saved as ${nextRuleset.status}.`
          : `${preset.label} ruleset v${nextVersion} saved as ${nextRuleset.status}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save that group ruleset."
    };
  }
}

export async function saveLegacyGroupScoringSetupAction(
  input: SaveLegacyGroupScoringSetupInput
): Promise<SaveLegacyGroupScoringSetupResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = input.groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "Group id is required." };
  }

  const groupStagePredictionDepth = MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS.groupStagePredictionDepth;
  const groupBonusMode = MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS.groupBonusMode;
  const groupBonusPreset = GROUP_BONUS_MODE_PRESETS[groupBonusMode];

  const parsedGroupStageDueAt = parseMidnightGmtDateKey(input.groupStagePicksDueAt);
  const parsedKnockoutDueAt = parseMidnightGmtDateKey(input.knockoutPicksDueAt);
  if (!parsedGroupStageDueAt || !parsedKnockoutDueAt) {
    return { ok: false, message: "Choose valid due dates for both group and knockout picks." };
  }

  const now = Date.now();
  if (parsedGroupStageDueAt.getTime() <= now || parsedKnockoutDueAt.getTime() <= now) {
    return { ok: false, message: "Both due dates must be in the future." };
  }

  if (parsedKnockoutDueAt.getTime() <= parsedGroupStageDueAt.getTime()) {
    return { ok: false, message: "Knockout picks due date must be after the group-stage due date." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const { knockoutDeadline } = await fetchTournamentPickLockDeadlines(adminSupabase);
    if (parsedGroupStageDueAt.getTime() > new Date(GROUP_SCORING_SETUP_GROUP_STAGE_MAX_DUE_DATE).getTime()) {
      return { ok: false, message: "Group-stage picks due date must be on or before June 13." };
    }

    if (knockoutDeadline && parsedKnockoutDueAt.getTime() > new Date(knockoutDeadline).getTime()) {
      return { ok: false, message: "Knockout picks due date must be on or before the start of the knockout phase." };
    }

    const { data: existingRulesets, error: existingRulesetsError } = await adminSupabase
      .from("group_rulesets")
      .select("id,version,status,scoring_settings_locked_at")
      .eq("group_id", trimmedGroupId)
      .order("version", { ascending: false });

    if (existingRulesetsError) {
      return { ok: false, message: existingRulesetsError.message };
    }

    const latestRuleset = (((existingRulesets ?? []) as Array<{
      id: string;
      version: number;
      status: string;
      scoring_settings_locked_at?: string | null;
    }>)[0] ?? null);

    if (latestRuleset?.scoring_settings_locked_at) {
      return { ok: false, message: "This group’s scoring settings are already locked." };
    }

    const groupStageMode = MANAGER_COMPATIBLE_GROUP_SCORING_DEFAULTS.groupStageMode;
    const nextVersion = (latestRuleset?.version ?? 0) + 1;
    const lockedAt = new Date().toISOString();

    const { error: supersedeError } = await adminSupabase
      .from("group_rulesets")
      .update({
        status: "superseded",
        updated_at: new Date().toISOString()
      })
      .eq("group_id", trimmedGroupId)
      .in("status", ["active", "draft"]);

    if (supersedeError) {
      return { ok: false, message: supersedeError.message };
    }

    const { error: insertError } = await adminSupabase
      .from("group_rulesets")
      .insert({
        group_id: trimmedGroupId,
        version: nextVersion,
        status: "locked",
        group_stage_mode: groupStageMode,
        group_stage_prediction_depth: groupStagePredictionDepth,
        full_match_scoring_variant: null,
        group_bonus_mode: groupBonusMode,
        group_stage_picks_due_at: parsedGroupStageDueAt.toISOString(),
        knockout_picks_due_at: parsedKnockoutDueAt.toISOString(),
        scoring_settings_locked_at: lockedAt,
        early_group_stage_completion_bonus: groupBonusPreset.earlyGroupStageCompletionBonus,
        knockout_completion_bonus: groupBonusPreset.knockoutCompletionBonus,
        final_matchup_bonus: groupBonusPreset.finalMatchupBonus,
        exact_final_score_bonus: groupBonusPreset.exactFinalScoreBonus,
        side_pick_package_id: null,
        created_by_user_id: currentUser.userId
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return { ok: false, message: "This group’s scoring settings were already locked by another manager." };
      }

      return { ok: false, message: insertError.message };
    }

    await rebuildGroupCustomBonusScores(adminSupabase, [trimmedGroupId]);

    revalidatePath("/dashboard");
    revalidatePath("/groups");
    revalidatePath("/groups/scoring-setup");
    revalidatePath("/leaderboard");
    revalidatePath("/my-groups");

    return {
      ok: true,
      message: "Scoring settings saved and locked for this group."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save this group’s scoring settings."
    };
  }
}

export async function saveGroupSidePickEntryAction(
  input: SaveGroupSidePickEntryInput
): Promise<SaveGroupSidePickEntryResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const groupId = input.groupId.trim();
  const definitionId = input.definitionId.trim();
  if (!groupId || !definitionId) {
    return { ok: false, message: "Group and side-pick definition are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const visibleGroups = await fetchVisibleGroups(adminSupabase, currentUser);
    if (!visibleGroups.some((group) => group.id === groupId)) {
      return { ok: false, message: "You do not have access to that group." };
    }

    const { data: activeRulesets, error: activeRulesetsError } = await adminSupabase
      .from("group_rulesets")
      .select("side_pick_package_id")
      .eq("group_id", groupId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (activeRulesetsError) {
      return { ok: false, message: activeRulesetsError.message };
    }

    const activePackageId = (activeRulesets as { side_pick_package_id?: string | null } | null)?.side_pick_package_id ?? null;
    if (!activePackageId) {
      return { ok: false, message: "This group does not have an active side-pick package yet." };
    }

    const { data: definition, error: definitionError } = await adminSupabase
      .from("side_pick_definitions")
      .select("id,response_kind,package_id")
      .eq("id", definitionId)
      .eq("active", true)
      .maybeSingle();

    if (definitionError) {
      return { ok: false, message: definitionError.message };
    }

    if (!definition || definition.package_id !== activePackageId) {
      return { ok: false, message: "That side pick is not active for this group." };
    }

    const selectedText = input.selectedText?.trim() || null;
    const selectedTeamId = input.selectedTeamId?.trim() || null;
    if (definition.response_kind === "team" && !selectedTeamId) {
      return { ok: false, message: "Choose a team for that side pick." };
    }

    if (definition.response_kind === "text" && !selectedText) {
      return { ok: false, message: "Enter a response for that side pick." };
    }

    const { error: upsertError } = await adminSupabase
      .from("side_pick_entries")
      .upsert(
        {
          group_id: groupId,
          definition_id: definitionId,
          user_id: currentUser.userId,
          selected_team_id: selectedTeamId,
          selected_text: selectedText
        },
        { onConflict: "group_id,definition_id,user_id" }
      );

    if (upsertError) {
      return { ok: false, message: upsertError.message };
    }

    console.info("[side-pick-entry-saved]", {
      userId: currentUser.userId,
      groupId,
      definitionId
    });

    revalidatePath("/my-groups");
    return { ok: true, message: "Side pick saved." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save that side pick."
    };
  }
}

export async function scoreManagedGroupSidePickAction(
  input: ScoreManagedGroupSidePickInput
): Promise<ScoreManagedGroupSidePickResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  if (!canManageLeagueCustomScoring(currentUser)) {
    return {
      ok: false,
      message: "League custom side-pick scoring is not available in the current product offer."
    };
  }

  const groupId = input.groupId.trim();
  const definitionId = input.definitionId.trim();
  const userId = input.userId.trim();
  if (!groupId || !definitionId || !userId) {
    return { ok: false, message: "Group, player, and side-pick definition are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, groupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    const points = normalizeRulesetBonusValue(input.points);
    const note = input.note?.trim() || null;
    const { error: upsertError } = await adminSupabase
      .from("side_pick_scores")
      .upsert(
        {
          group_id: groupId,
          definition_id: definitionId,
          user_id: userId,
          scoring_scope: input.scoringScope,
          points,
          awarded_by_user_id: currentUser.userId,
          note
        },
        { onConflict: "group_id,definition_id,user_id,scoring_scope" }
      );

    if (upsertError) {
      return { ok: false, message: upsertError.message };
    }

    console.info("[side-pick-score-saved]", {
      actorUserId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId,
      definitionId,
      userId,
      scoringScope: input.scoringScope,
      points
    });

    revalidatePath("/leaderboard");
    revalidatePath("/my-groups");
    return { ok: true, message: "Side-pick score saved." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not score that side pick."
    };
  }
}

export async function updateGroupInviteNameAction(inviteId: string, suggestedDisplayName: string): Promise<UpdateGroupInviteNameResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedInviteId = inviteId.trim();
  if (!trimmedInviteId) {
    return { ok: false, message: "Invite id is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const invite = await getManagedGroupInvite(adminSupabase, trimmedInviteId, currentUser);
    if (!invite) {
      return { ok: false, message: "You do not manage that invite." };
    }

    if (invite.status !== "pending") {
      return { ok: false, message: "Only pending invites can be edited." };
    }

    const { error } = await adminSupabase
      .from("group_invites")
      .update({
        suggested_display_name: suggestedDisplayName.trim() || null
      })
      .eq("id", invite.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    console.info("[tier-access:group-invite-name-updated]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId: invite.group_id,
      inviteId: invite.id
    });

    revalidatePath("/my-groups");
    return { ok: true, message: "Suggested temporary invite name updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update that invite."
    };
  }
}

export async function deleteManagedGroupAction(groupId: string, confirmationName: string): Promise<DeleteManagedGroupResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  const trimmedGroupId = groupId.trim();
  const trimmedConfirmationName = confirmationName.trim();
  if (!trimmedGroupId || !trimmedConfirmationName) {
    return { ok: false, message: "Group id and confirmation name are required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const managedGroup = await getManagedGroup(adminSupabase, trimmedGroupId, currentUser);
    if (!managedGroup) {
      return { ok: false, message: "You do not manage that group." };
    }

    if (trimmedConfirmationName !== managedGroup.name.trim()) {
      return { ok: false, message: "Type the exact group name before deleting it." };
    }

    const { count: memberCount, error: memberCountError } = await adminSupabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", managedGroup.id)
      .neq("user_id", managedGroup.owner_user_id ?? "00000000-0000-0000-0000-000000000000");

    if (memberCountError) {
      return { ok: false, message: memberCountError.message };
    }

    if ((memberCount ?? 0) > 0) {
      return { ok: false, message: "Remove all members before deleting this group." };
    }

    const { error } = await adminSupabase
      .from("groups")
      .delete()
      .eq("id", managedGroup.id);

    if (error) {
      return { ok: false, message: error.message };
    }

    console.info("[tier-access:group-deleted]", {
      userId: currentUser.userId,
      accessLevel: currentUser.accessLevel,
      groupId: managedGroup.id
    });

    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message: "Group deleted. Players kept their accounts, invites, and predictions."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not delete that group."
    };
  }
}

export async function fetchMyGroupsAction(): Promise<FetchMyGroupsResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  try {
    const adminSupabase = createAdminClient();
    const [visibleGroups, joinedGroupCount] = await Promise.all([
      fetchVisibleGroups(adminSupabase, currentUser),
      fetchJoinedPlayerGroupCount(adminSupabase, currentUser.userId)
    ]);
    const groups = visibleGroups;
    const managedGroupCount = groups.filter((group) => group.canManage).length;

    return {
      ok: true,
      currentUser: {
        userId: currentUser.userId,
        email: currentUser.email,
        role: currentUser.role,
        planTier: currentUser.planTier,
        accessLevel: currentUser.accessLevel,
        preferredLanguage: currentUser.preferredLanguage
      },
      tierAccess: currentUser.tierAccess,
      groupAccess: {
        joinedGroupCount,
        managedGroupCount,
        hasAnyGroups: joinedGroupCount > 0 || groups.length > 0
      },
      groups
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load your groups."
    };
  }
}

export async function fetchDashboardGroupAccessDataForCurrentUser(): Promise<FetchDashboardGroupAccessResult> {
  const currentUser = await getCurrentUserContext();
  if (!currentUser.ok) {
    return currentUser;
  }

  try {
    const adminSupabase = createAdminClient();
    const [joinedGroupCount, groups, dashboardUiResetEpoch] = await Promise.all([
      fetchJoinedPlayerGroupCount(adminSupabase, currentUser.userId),
      fetchVisibleGroups(adminSupabase, currentUser),
      fetchIntegerAppSetting(DASHBOARD_UI_RESET_EPOCH_SETTING_KEY, 0)
    ]);
    const managedGroupCount = groups.filter((group) => group.canManage).length;

    return {
      ok: true,
      groupAccess: {
        joinedGroupCount,
        managedGroupCount,
        hasAnyGroups: joinedGroupCount > 0 || managedGroupCount > 0
      },
      dashboardUiResetEpoch
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load your group access."
    };
  }
}

export async function fetchDashboardGroupAccessAction(): Promise<FetchDashboardGroupAccessResult> {
  return fetchDashboardGroupAccessDataForCurrentUser();
}

export async function fetchGroupInvitePreviewAction(token: string): Promise<GroupInvitePreviewResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false, message: "Invite token is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const tokenHash = hashInviteToken(trimmedToken);
    const { data, error } = await adminSupabase
      .from("group_invites")
      .select("group_id,email,suggested_display_name,custom_message,language,helper_language,status,expires_at,groups(name),invited_by:users!group_invites_invited_by_user_id_fkey(name,email)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      return { ok: false, message: error.message };
    }

    if (!data) {
      return { ok: false, message: "That invite could not be found." };
    }

    const groupName =
      Array.isArray(data.groups) ? data.groups[0]?.name :
      (data.groups as { name?: string } | null)?.name;
    const invitedBy = Array.isArray(data.invited_by) ? data.invited_by[0] : data.invited_by;
    const inviterLabel = invitedBy?.name?.trim() || invitedBy?.email?.trim() || "A group manager";
    const existingAccount = Boolean(await findUserIdByEmail(adminSupabase, normalizeEmail(data.email)));

    return {
      ok: true,
      invite: {
        groupId: data.group_id,
        groupName: groupName ?? "Group",
        inviterLabel,
        email: data.email,
        existingAccount,
        suggestedDisplayName: data.suggested_display_name ?? null,
        customMessage: data.custom_message ?? null,
        language: normalizeLanguage((data as { language?: string | null }).language ?? null),
        helperLanguage: normalizeExplainerLanguage((data as { helper_language?: string | null }).helper_language ?? null),
        status: data.status,
        expiresAt: data.expires_at ?? null
      }
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load the invite."
    };
  }
}

async function getCurrentUserContext(): Promise<CurrentUserContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    return { ok: false, message: "You must be signed in to do that." };
  }

  const { data: profile, error: profileError } = await fetchCurrentUserContextProfile(supabase, user.id);

  if (profileError || !profile) {
    return { ok: false, message: "Your player profile could not be loaded." };
  }

  let managerLimits: ManagerLimitsRow | null = null;
  try {
    const adminSupabase = createAdminClient();
    managerLimits = await getManagerLimits(adminSupabase, profile.id);
  } catch (error) {
    console.warn("Could not load manager limit overrides for current user.", {
      userId: profile.id,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const tierAccess = resolveTierAccess({
    role: profile.role,
    planTier: (profile as { plan_tier?: string | null }).plan_tier ?? null,
    managerLimits: managerLimits
      ? {
          maxGroups: managerLimits.max_groups,
          maxMembersPerGroup: managerLimits.max_members_per_group
        }
      : null
  });

  return {
    ok: true,
    userId: profile.id,
    email: profile.email,
    role: profile.role,
    planTier: normalizeCommercialTier((profile as { plan_tier?: string | null }).plan_tier ?? null),
    accessLevel: tierAccess.accessLevel,
    tierAccess,
    managerLimits: managerLimits
      ? {
          maxGroups: managerLimits.max_groups,
          maxMembersPerGroup: managerLimits.max_members_per_group
        }
      : null,
    preferredLanguage: normalizeLanguage((profile as { preferred_language?: string | null }).preferred_language)
  };
}

async function fetchCurrentUserContextProfile(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
): Promise<{
  data: { id: string; email: string; role: PlatformRole; preferred_language?: string | null; plan_tier?: string | null } | null;
  error: { message: string } | null;
}> {
  const fullProfileQuery = await supabase
    .from("users")
    .select("id,email,role,preferred_language,plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (!fullProfileQuery.error) {
    return {
      data: (fullProfileQuery.data as {
        id: string;
        email: string;
        role: PlatformRole;
        preferred_language?: string | null;
        plan_tier?: string | null;
      } | null) ?? null,
      error: null
    };
  }

  const missingPreferredLanguage = isMissingColumnError(fullProfileQuery.error.message, "users", "preferred_language");
  const missingPlanTier = isMissingColumnError(fullProfileQuery.error.message, "users", "plan_tier");

  if (!missingPreferredLanguage && !missingPlanTier) {
    return { data: null, error: { message: fullProfileQuery.error.message } };
  }

  if (missingPreferredLanguage) {
    warnOptionalFeatureOnce(
      "my-groups-current-user-preferred-language-missing",
      "My Groups current-user context is loading without preferred_language because the live public.users schema is behind the app.",
      fullProfileQuery.error.message
    );
  }

  if (missingPlanTier) {
    warnOptionalFeatureOnce(
      "my-groups-current-user-plan-tier-missing",
      "My Groups current-user context is loading without plan_tier because the live public.users schema is behind the app.",
      fullProfileQuery.error.message
    );
  }

  const fallbackSelect = missingPreferredLanguage && missingPlanTier
    ? "id,email,role"
    : missingPreferredLanguage
      ? "id,email,role,plan_tier"
      : "id,email,role,preferred_language";
  const fallbackProfileQuery = await supabase
    .from("users")
    .select(fallbackSelect)
    .eq("id", userId)
    .maybeSingle();

  if (fallbackProfileQuery.error) {
    return { data: null, error: { message: fallbackProfileQuery.error.message } };
  }

  const fallbackRow = fallbackProfileQuery.data as {
    id: string;
    email: string;
    role: PlatformRole;
    preferred_language?: string | null;
    plan_tier?: string | null;
  } | null;
  return {
    data: fallbackRow
      ? {
          ...fallbackRow,
          preferred_language: fallbackRow.preferred_language ?? "en",
          plan_tier: fallbackRow.plan_tier ?? null
        }
      : null,
    error: null
  };
}

async function getManagerLimits(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await adminSupabase
    .from("manager_limits")
    .select("user_id,max_groups,max_members_per_group")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ManagerLimitsRow | null) ?? null;
}

async function fetchTierAccessForUser(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<ResolvedTierAccess | null> {
  const [{ data: userProfile, error: userError }, managerLimits] = await Promise.all([
    adminSupabase.from("users").select("id,role,plan_tier").eq("id", userId).maybeSingle(),
    getManagerLimits(adminSupabase, userId)
  ]);

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userProfile) {
    return null;
  }

  return resolveTierAccess({
    role: userProfile.role as PlatformRole,
    planTier: (userProfile as { plan_tier?: string | null }).plan_tier ?? null,
    managerLimits: managerLimits
      ? {
          maxGroups: managerLimits.max_groups,
          maxMembersPerGroup: managerLimits.max_members_per_group
        }
      : null
  });
}

async function getEffectiveGroupSeatLimit(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: Pick<GroupRow, "membership_limit" | "owner_user_id">,
  currentUser?: Extract<CurrentUserContext, { ok: true }>
) {
  if (!group.owner_user_id) {
    return group.membership_limit;
  }

  if (currentUser?.role === "admin") {
    return group.membership_limit;
  }

  const ownerTierAccess =
    currentUser?.userId === group.owner_user_id
      ? currentUser.tierAccess
      : await fetchTierAccessForUser(adminSupabase, group.owner_user_id);

  if (!ownerTierAccess) {
    return group.membership_limit;
  }

  return getEffectiveMembershipLimitForGroup(group.membership_limit, {
    role: ownerTierAccess.accessLevel === "super_admin" ? "admin" : "player",
    planTier: ownerTierAccess.commercialTier,
    managerLimits:
      ownerTierAccess.hasLegacyManagerOverride &&
      ownerTierAccess.limits.maxGroups !== null &&
      ownerTierAccess.limits.maxMembersPerGroup !== null
        ? {
            maxGroups: ownerTierAccess.limits.maxGroups,
            maxMembersPerGroup: ownerTierAccess.limits.maxMembersPerGroup
          }
        : null
  });
}

async function getAllowedMembershipLimitForGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: Pick<GroupRow, "membership_limit" | "owner_user_id">,
  currentUser?: Extract<CurrentUserContext, { ok: true }>
) {
  if (!group.owner_user_id) {
    return group.membership_limit;
  }

  if (currentUser?.role === "admin") {
    return group.membership_limit;
  }

  const ownerTierAccess =
    currentUser?.userId === group.owner_user_id
      ? currentUser.tierAccess
      : await fetchTierAccessForUser(adminSupabase, group.owner_user_id);

  if (!ownerTierAccess || ownerTierAccess.limits.isUnlimited || ownerTierAccess.limits.maxMembersPerGroup === null) {
    return group.membership_limit;
  }

  return ownerTierAccess.limits.maxMembersPerGroup;
}

async function getActiveOwnedGroupCount(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { count, error } = await adminSupabase
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId)
    .eq("group_kind", "standard")
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function fetchManagedGroupDetails(
  adminSupabase: ReturnType<typeof createAdminClient>,
  currentUser: Extract<CurrentUserContext, { ok: true }>
): Promise<ManagedGroupDetails[]> {
  const groups = await fetchVisibleGroups(adminSupabase, currentUser);
  if (groups.length === 0) {
    return [];
  }

  return fetchManagedGroupDetailRows(adminSupabase, groups, currentUser);
}

async function fetchManagedGroupDetail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  currentUser: Extract<CurrentUserContext, { ok: true }>,
  groupId: string
): Promise<ManagedGroupDetails | null> {
  const groups = await fetchVisibleGroups(adminSupabase, currentUser);
  const group = groups.find((entry) => entry.id === groupId);
  if (!group) {
    return null;
  }

  const [detail] = await fetchManagedGroupDetailRows(adminSupabase, [group], currentUser);
  return detail ?? null;
}

async function fetchManagedGroupDetailRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groups: MyManagedGroup[],
  currentUser: Extract<CurrentUserContext, { ok: true }>
): Promise<ManagedGroupDetails[]> {
  if (groups.length === 0) {
    return [];
  }

  const groupIds = groups.map((group) => group.id);
  const manageableGroupIds = groups.filter((group) => group.canManage).map((group) => group.id);
  const [memberResult, inviteResult, allowedEmailResult, focusTeamResult, captainPassResult, teamCatalogResult, trophyResult, inviteCodeResult, activeRulesetsByGroup, groupCustomPackages] = await Promise.all([
    adminSupabase
      .from("group_members")
      .select("id,group_id,user_id,role,join_source,joined_invite_id,joined_at,user:users!group_members_user_id_fkey(id,name,email,avatar_url,home_team_id)")
      .in("group_id", groupIds)
      .order("joined_at", { ascending: true }),
    manageableGroupIds.length > 0
      ? adminSupabase
          .from("group_invites")
          .select("id,group_id,email,normalized_email,invited_by_user_id,suggested_display_name,custom_message,language,helper_language,status,claim_token,expires_at,accepted_by_user_id,accepted_at,email_status,email_sent_at,email_provider_message_id,email_error,email_attempt_count,last_email_attempt_at,last_resent_by_user_id,last_sent_at,send_attempts,last_error,invite_source,captains_pass_id,invite_intent,captain_invite_allowance,created_at,invited_by:users!group_invites_invited_by_user_id_fkey(name,email)")
          .in("group_id", manageableGroupIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    manageableGroupIds.length > 0
      ? adminSupabase
          .from("group_allowed_emails")
          .select("id,group_id,email_normalized,display_name,created_by_user_id,created_at")
          .in("group_id", manageableGroupIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    manageableGroupIds.length > 0
      ? adminSupabase
          .from("group_focus_teams")
          .select("id,group_id,team_id,created_by_user_id,created_at,team:teams!group_focus_teams_team_id_fkey(id,name,short_name,group_name,flag_emoji)")
          .in("group_id", manageableGroupIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    groupIds.length > 0
      ? adminSupabase
          .from("captains_passes")
          .select("id,manager_group_id,captain_user_id,captain_email_normalized,issued_by_user_id,status,manager_group_invite_allowance,manager_group_invites_used,captain_private_group_id,created_at,claimed_at,expires_at,captain_user:users!captains_passes_captain_user_id_fkey(id,name,email),captain_private_group:groups!captains_passes_captain_private_group_id_fkey(id,name)")
          .in("manager_group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    manageableGroupIds.length > 0
      ? adminSupabase
          .from("teams")
          .select("id,name,short_name,group_name,flag_emoji")
          .order("group_name", { ascending: true })
          .order("fifa_rank", { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
    currentUser.role === "admin"
      ? adminSupabase
          .from("trophies")
          .select("id,key,name,description,icon,tier,award_source,created_by,group_id")
          .or(`group_id.in.(${groupIds.join(",")}),group_id.is.null`)
          .order("created_at", { ascending: true })
      : groupIds.length > 0
        ? adminSupabase
            .from("trophies")
            .select("id,key,name,description,icon,tier,award_source,created_by,group_id")
            .or(`group_id.in.(${groupIds.join(",")}),group_id.is.null`)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    manageableGroupIds.length > 0
      ? adminSupabase
          .from("access_codes")
          .select("id,code,active,max_uses,used_count,expires_at,group_id,default_language,created_at,updated_at")
          .in("group_id", manageableGroupIds)
          .eq("code_type", "standard")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    fetchActiveGroupRulesets(adminSupabase, manageableGroupIds),
    fetchSidePickPackageOptions(adminSupabase, "group_custom")
  ]);

  if (memberResult.error) {
    throw new Error(memberResult.error.message);
  }

  if (inviteResult.error) {
    throw new Error(inviteResult.error.message);
  }

  if (allowedEmailResult.error) {
    throw new Error(allowedEmailResult.error.message);
  }

  if (focusTeamResult.error) {
    throw new Error(focusTeamResult.error.message);
  }

  if (captainPassResult.error) {
    throw new Error(captainPassResult.error.message);
  }

  if (teamCatalogResult.error) {
    throw new Error(teamCatalogResult.error.message);
  }

  if (trophyResult.error) {
    throw new Error(trophyResult.error.message);
  }

  if (inviteCodeResult.error) {
    throw new Error(inviteCodeResult.error.message);
  }

  const membersByGroup = new Map<string, ManagedGroupMember[]>();
  const memberUserIds = new Set<string>();
  for (const row of ((memberResult.data ?? []) as GroupMemberRecord[])) {
    const userRow = Array.isArray(row.user) ? row.user[0] : row.user;
    const list = membersByGroup.get(row.group_id) ?? [];
    list.push({
      membershipId: row.id,
      userId: row.user_id,
      name: userRow?.name ?? "Player",
      email: userRow?.email ?? "",
      avatarUrl: userRow?.avatar_url ?? null,
      homeTeamId: userRow?.home_team_id ?? null,
      role: row.role,
      joinSource: normalizeGroupJoinSource(row.join_source),
      joinedAt: row.joined_at,
      trophies: []
    });
    memberUserIds.add(row.user_id);
    membersByGroup.set(row.group_id, list);
  }

  const invitesByGroup = new Map<string, ManagedGroupInvite[]>();
  const normalizedInviteEmails = new Set<string>();
  for (const row of ((inviteResult.data ?? []) as GroupInviteRecord[])) {
    normalizedInviteEmails.add(row.normalized_email);
  }
  const inviteAccountLookup = await findUsersByNormalizedEmails(
    adminSupabase,
    Array.from(normalizedInviteEmails)
  );
  for (const row of ((inviteResult.data ?? []) as GroupInviteRecord[])) {
    const inviterRow = Array.isArray(row.invited_by) ? row.invited_by[0] : row.invited_by;
    const list = invitesByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      email: row.email,
      existingAccount: inviteAccountLookup.has(row.normalized_email),
      suggestedDisplayName: row.suggested_display_name ?? undefined,
      customMessage: row.custom_message ?? undefined,
      invitedByLabel: inviterRow?.name ?? inviterRow?.email ?? undefined,
      status: row.status,
      emailStatus: deriveGroupInviteEmailStatus(row),
      expiresAt: row.expires_at ?? null,
      acceptedAt: row.accepted_at ?? null,
      acceptedByUserId: row.accepted_by_user_id ?? null,
      emailSentAt: row.email_sent_at ?? null,
      emailProviderMessageId: row.email_provider_message_id ?? null,
      emailError: row.email_error ?? null,
      emailAttemptCount: row.email_attempt_count ?? row.send_attempts ?? 0,
      lastEmailAttemptAt: row.last_email_attempt_at ?? null,
      lastResentByUserId: row.last_resent_by_user_id ?? null,
      lastSentAt: row.last_sent_at ?? null,
      sendAttempts: row.send_attempts ?? 0,
      lastError: row.last_error ?? null,
      inviteSource: normalizeGroupInviteSource(row.invite_source),
      inviteIntent: normalizeGroupInviteIntent(row.invite_intent),
      captainInviteAllowance: row.captain_invite_allowance ?? null,
      createdAt: row.created_at
    });
    invitesByGroup.set(row.group_id, list);
  }

  const allowedEmailsByGroup = new Map<string, ManagedGroupAllowedEmail[]>();
  for (const row of ((allowedEmailResult.data ?? []) as GroupAllowedEmailRow[])) {
    const normalizedEmail = normalizeEmail(row.email_normalized);
    const joinedMember = (membersByGroup.get(row.group_id) ?? []).find((member) => normalizeEmail(member.email) === normalizedEmail);
    const list = allowedEmailsByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      email: normalizedEmail,
      displayName: row.display_name ?? null,
      status: joinedMember ? "joined" : "allowed",
      joinedUserId: joinedMember?.userId ?? null,
      joinedUserName: joinedMember?.name ?? null,
      createdAt: row.created_at
    });
    allowedEmailsByGroup.set(row.group_id, list);
  }

  const focusTeamsByGroup = new Map<string, ManagedGroupFocusTeam[]>();
  for (const row of ((focusTeamResult.data ?? []) as GroupFocusTeamRow[])) {
    const teamRow = Array.isArray(row.team) ? row.team[0] : row.team;
    if (!teamRow) {
      continue;
    }

    const list = focusTeamsByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      teamId: row.team_id,
      name: teamRow.name,
      shortName: teamRow.short_name,
      groupName: teamRow.group_name,
      flagEmoji: teamRow.flag_emoji ?? null
    });
    focusTeamsByGroup.set(row.group_id, list);
  }

  const teamOptions = ((teamCatalogResult.data ?? []) as Array<{
    id: string;
    name: string;
    short_name: string;
    group_name: string;
    flag_emoji?: string | null;
  }>).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    flagEmoji: team.flag_emoji ?? null
  }));

  const captainPassByGroup = new Map<string, ManagedGroupCaptainPass>();
  const captainPassRows = (captainPassResult.data ?? []) as CaptainsPassRow[];

  const latestInviteCodeRowByGroup = new Map<string, AccessCodeRecord>();
  for (const row of ((inviteCodeResult.data ?? []) as AccessCodeRecord[])) {
    if (!row.group_id || latestInviteCodeRowByGroup.has(row.group_id)) {
      continue;
    }

    latestInviteCodeRowByGroup.set(row.group_id, row);
  }

  const trophyRows = ((trophyResult.data ?? []) as TrophyRecord[]).filter(Boolean);
  const trophyIds = trophyRows.map((trophy) => trophy.id);
  const awardsByUserId = new Map<string, Array<{ id: string; name: string; icon: string }>>();
  const awardCountsByTrophyId = new Map<string, number>();

  if (trophyIds.length > 0 && memberUserIds.size > 0) {
    const { data: userTrophies, error: userTrophiesError } = await adminSupabase
      .from("user_trophies")
      .select("user_id,trophy_id")
      .in("user_id", Array.from(memberUserIds))
      .in("trophy_id", trophyIds);

    if (userTrophiesError) {
      throw new Error(userTrophiesError.message);
    }

    const trophiesById = new Map(trophyRows.map((trophy) => [trophy.id, trophy]));
    for (const row of ((userTrophies ?? []) as UserTrophyRecord[])) {
      const trophy = trophiesById.get(row.trophy_id);
      if (!trophy) {
        continue;
      }

      const list = awardsByUserId.get(row.user_id) ?? [];
      list.push({
        id: trophy.id,
        name: trophy.name,
        icon: trophy.icon
      });
      awardsByUserId.set(row.user_id, list);
      awardCountsByTrophyId.set(row.trophy_id, (awardCountsByTrophyId.get(row.trophy_id) ?? 0) + 1);
    }
  }

  for (const [groupId, members] of membersByGroup.entries()) {
    membersByGroup.set(
      groupId,
      members.map((member) => ({
        ...member,
        trophies: awardsByUserId.get(member.userId) ?? []
      }))
    );
  }

  const memberCounts = new Map<string, number>();
  for (const [groupId, members] of membersByGroup.entries()) {
    memberCounts.set(groupId, members.length);
  }

  const pendingInviteCounts = new Map<string, number>();
  for (const [groupId, invites] of invitesByGroup.entries()) {
    pendingInviteCounts.set(
      groupId,
      invites.filter((invite) => invite.status === "pending").length
    );
  }

  const remainingSeatsByGroup = new Map<string, number>();
  for (const group of groups) {
    const usedSeats = (memberCounts.get(group.id) ?? 0) + (pendingInviteCounts.get(group.id) ?? 0);
    remainingSeatsByGroup.set(group.id, Math.max(0, group.membershipLimit - usedSeats));
  }

  for (const row of captainPassRows) {
    const status = normalizeCaptainsPassStatus(row.status);
    const captainUser = Array.isArray(row.captain_user) ? row.captain_user[0] : row.captain_user;
    const privateGroup = Array.isArray(row.captain_private_group) ? row.captain_private_group[0] : row.captain_private_group;
    const group = groups.find((entry) => entry.id === row.manager_group_id);
    if (!group) {
      continue;
    }

    const invitesRemaining = getRemainingCaptainsPassAllowance({
      allowance: row.manager_group_invite_allowance,
      invitesUsed: row.manager_group_invites_used,
      remainingSeats: remainingSeatsByGroup.get(row.manager_group_id) ?? 0
    });

    captainPassByGroup.set(row.manager_group_id, {
      id: row.id,
      status,
      statusLabel: getCaptainsPassStatusLabel(status),
      captainUserId: row.captain_user_id ?? null,
      captainName: captainUser?.name ?? null,
      captainEmail: captainUser?.email ?? row.captain_email_normalized ?? null,
      inviteAllowance: row.manager_group_invite_allowance,
      invitesUsed: row.manager_group_invites_used,
      invitesRemaining,
      captainPrivateGroupId: row.captain_private_group_id ?? null,
      captainPrivateGroupName: privateGroup?.name ?? null,
      canCurrentUserUseInvites:
        row.captain_user_id === currentUser.userId && (status === "claimed" || status === "exhausted"),
      isRestrictedByEmail: group.accessMode === "restricted_by_email",
      claimedAt: row.claimed_at ?? null,
      expiresAt: row.expires_at ?? null
    });
  }

  const trophiesByGroup = new Map<string, ManagedGroupDetails["trophies"]>();
  for (const trophy of trophyRows) {
    if (trophy.group_id) {
      const list = trophiesByGroup.get(trophy.group_id) ?? [];
      list.push({
        id: trophy.id,
        key: trophy.key,
        name: trophy.name,
        description: trophy.description,
        icon: trophy.icon,
        tier: trophy.tier ?? "special",
        awardSource: trophy.award_source ?? "manager",
        scope: "group",
        awardedCount: awardCountsByTrophyId.get(trophy.id) ?? 0
      });
      trophiesByGroup.set(trophy.group_id, list);
      continue;
    }

    const destinationGroupIds = currentUser.role === "admin" ? groupIds : manageableGroupIds;
    if (destinationGroupIds.length > 0) {
      for (const groupId of destinationGroupIds) {
        const list = trophiesByGroup.get(groupId) ?? [];
        list.push({
          id: trophy.id,
          key: trophy.key,
          name: trophy.name,
          description: trophy.description,
          icon: trophy.icon,
          tier: trophy.tier ?? "special",
          awardSource: trophy.award_source ?? "system",
          scope: trophy.award_source === "manager" ? "group" : "system",
          awardedCount: awardCountsByTrophyId.get(trophy.id) ?? 0
        });
        trophiesByGroup.set(groupId, list);
      }
    }
  }

  return groups.map((group) => {
    const latestInviteCode = latestInviteCodeRowByGroup.get(group.id) ?? null;
    const inviteCodeStatus = latestInviteCode ? getManagedGroupInviteCodeStatus(latestInviteCode) : "missing";

    return {
      ...group,
      memberCount: memberCounts.get(group.id) ?? 0,
      pendingInviteCount: group.canManage ? pendingInviteCounts.get(group.id) ?? 0 : 0,
      inviteCode: group.canManage && latestInviteCode ? mapManagedGroupInviteCode(latestInviteCode, group.name) : null,
      inviteCodeStatus,
      inviteCodeStatusLabel: getManagedGroupInviteCodeStatusLabel(inviteCodeStatus),
      allowedEmails: group.canManage ? allowedEmailsByGroup.get(group.id) ?? [] : [],
      focusTeams: group.canManage ? focusTeamsByGroup.get(group.id) ?? [] : [],
      teamOptions: group.canManage ? teamOptions : [],
      captainPass: captainPassByGroup.get(group.id) ?? null,
      activeRuleset: group.canManage ? activeRulesetsByGroup.get(group.id) ?? null : null,
      sidePickPackages: group.canManage ? groupCustomPackages : [],
      canManageRuleset: group.canManage && canManageLeagueCustomScoring(currentUser),
      canManageSidePicks: group.canManage && canManageLeagueCustomScoring(currentUser),
      scoringPreview: {
        standardScoringLabel: "Standard scoring applies to global rank and average group comparison.",
        groupScoringLabel: "Applies to this group only. Affects the group leaderboard only."
      },
      members: membersByGroup.get(group.id) ?? [],
      invites: invitesByGroup.get(group.id) ?? [],
      trophies: (trophiesByGroup.get(group.id) ?? []).sort((left, right) =>
        left.scope === right.scope ? left.name.localeCompare(right.name) : left.scope === "system" ? -1 : 1
      )
    };
  });
}

async function fetchPrimaryManagedGroupInviteCode(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  groupName: string
): Promise<ManagedGroupInviteCode | null> {
  const { data, error } = await adminSupabase
    .from("access_codes")
    .select("id,code,active,max_uses,used_count,expires_at,group_id,created_at,updated_at")
    .eq("group_id", groupId)
    .eq("code_type", "standard")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const row = ((data ?? []) as AccessCodeRecord[]).find((entry) => isManagedGroupInviteCodeUsable(entry));
  return row ? mapManagedGroupInviteCode(row, groupName) : null;
}

function isManagedGroupInviteCodeUsable(row: AccessCodeRecord) {
  if (!row.active) {
    return false;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return false;
  }

  if (row.max_uses !== null && row.max_uses !== undefined && row.used_count >= row.max_uses) {
    return false;
  }

  return true;
}

function getManagedGroupInviteCodeStatus(row: AccessCodeRecord): ManagedGroupDetails["inviteCodeStatus"] {
  if (!row.active) {
    return "inactive";
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return "expired";
  }

  if (row.max_uses !== null && row.max_uses !== undefined && row.used_count >= row.max_uses) {
    return "maxed_out";
  }

  return "active";
}

function getManagedGroupInviteCodeStatusLabel(status: ManagedGroupDetails["inviteCodeStatus"]) {
  switch (status) {
    case "inactive":
      return "Inactive";
    case "expired":
      return "Expired";
    case "maxed_out":
      return "Maxed out";
    case "missing":
      return "Missing";
    default:
      return "Active";
  }
}

function mapManagedGroupInviteCode(row: AccessCodeRecord, groupName: string): ManagedGroupInviteCode {
  const inviteLanguage = normalizeLanguage(row.default_language ?? null);
  const shareMessage = buildManagedGroupInviteCodeMessage({
    code: row.code,
    groupName,
    language: inviteLanguage
  });
  const shareSubject = buildManagedGroupInviteCodeEmailSubject(groupName, inviteLanguage);

  return {
    id: row.id,
    code: row.code,
    active: row.active,
    maxUses: row.max_uses ?? null,
    usedCount: row.used_count,
    expiresAt: row.expires_at ?? null,
    shareMessage,
    whatsAppUrl: buildManagedGroupInviteCodeWhatsAppUrl(shareMessage),
    emailUrl: buildManagedGroupInviteCodeEmailUrl(shareSubject, shareMessage)
  };
}

function buildManagedGroupInviteCodeValue(groupName: string) {
  const prefix =
    groupName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 17) || "GROUP";

  return `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function resolveManagedGroupInviteCodeInput(customCode?: string | null):
  | { ok: true; code: string | null }
  | { ok: false; message: string } {
  if (!customCode?.trim()) {
    return { ok: true, code: null };
  }

  const displayCode = customCode
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!MANAGED_GROUP_INVITE_CODE_PATTERN.test(displayCode)) {
    return {
      ok: false,
      message: "Invite code must be 4-24 characters and use only letters, numbers, or hyphens."
    };
  }

  return { ok: true, code: displayCode };
}

function isManagedGroupInviteCodeConflict(
  error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
  field: "normalized_code" | "group_id"
) {
  if (!error) {
    return false;
  }

  const haystack = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(field.toLowerCase());
}

async function deactivateActiveManagedGroupInviteCodes(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string
) {
  const { error } = await adminSupabase
    .from("access_codes")
    .update({
      active: false,
      updated_at: new Date().toISOString()
    })
    .eq("group_id", groupId)
    .eq("code_type", "standard")
    .eq("active", true);

  if (error) {
    throw new Error(error.message);
  }
}

function buildManagedGroupInviteCodeMessage(input: { groupName: string; code: string; language?: string | null }) {
  const appUrl = `${getPublicSiteUrl()}/login?mode=signup`;
  const copy = MANAGED_GROUP_INVITE_CODE_COPY[normalizeLanguage(input.language)] ?? MANAGED_GROUP_INVITE_CODE_COPY.en;

  return [
    copy.headline(input.groupName),
    "",
    copy.useCode,
    input.code,
    "",
    copy.signUpHere,
    appUrl,
    "",
    copy.enterCode
  ].join("\n");
}

function buildManagedGroupInviteCodeEmailSubject(groupName: string, language?: string | null) {
  const copy = MANAGED_GROUP_INVITE_CODE_COPY[normalizeLanguage(language)] ?? MANAGED_GROUP_INVITE_CODE_COPY.en;
  return copy.subject(groupName);
}

function buildManagedGroupInviteCodeWhatsAppUrl(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function buildManagedGroupInviteCodeEmailUrl(subject: string, message: string) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
}

const MANAGED_GROUP_INVITE_CODE_COPY = {
  en: {
    subject: (groupName: string) => `Join my PICK-IT! group: ${groupName}`,
    headline: (groupName: string) => `Join my PICK-IT! group: ${groupName}`,
    useCode: "Use invite code:",
    signUpHere: "Sign up or log in here:",
    enterCode: "Then enter the code to join the group."
  },
  es: {
    subject: (groupName: string) => `Únete a mi grupo de PICK-IT!: ${groupName}`,
    headline: (groupName: string) => `Únete a mi grupo de PICK-IT!: ${groupName}`,
    useCode: "Usa este código de invitación:",
    signUpHere: "Crea una cuenta o inicia sesión aquí:",
    enterCode: "Luego ingresa el código para unirte al grupo."
  },
  fr: {
    subject: (groupName: string) => `Rejoins mon groupe PICK-IT! : ${groupName}`,
    headline: (groupName: string) => `Rejoins mon groupe PICK-IT! : ${groupName}`,
    useCode: "Utilise ce code d'invitation :",
    signUpHere: "Crée un compte ou connecte-toi ici :",
    enterCode: "Puis saisis le code pour rejoindre le groupe."
  },
  pt: {
    subject: (groupName: string) => `Entra no meu grupo PICK-IT!: ${groupName}`,
    headline: (groupName: string) => `Entra no meu grupo PICK-IT!: ${groupName}`,
    useCode: "Use este código de convite:",
    signUpHere: "Crie uma conta ou entre aqui:",
    enterCode: "Depois introduza o código para entrar no grupo."
  },
  de: {
    subject: (groupName: string) => `Tritt meiner PICK-IT!-Gruppe bei: ${groupName}`,
    headline: (groupName: string) => `Tritt meiner PICK-IT!-Gruppe bei: ${groupName}`,
    useCode: "Nutze diesen Einladungscode:",
    signUpHere: "Erstelle ein Konto oder melde dich hier an:",
    enterCode: "Gib danach den Code ein, um der Gruppe beizutreten."
  }
} as const;

async function fetchVisibleGroups(
  adminSupabase: ReturnType<typeof createAdminClient>,
  currentUser: Pick<Extract<CurrentUserContext, { ok: true }>, "userId" | "role" | "tierAccess">
): Promise<MyManagedGroup[]> {
  const userId = currentUser.userId;
  const role = currentUser.role;
  const membershipGroupIds = await allVisibleGroupIdList(adminSupabase, userId);
  const membershipRoleByGroup = await fetchMembershipRolesByGroup(
    adminSupabase,
    userId,
    membershipGroupIds.length > 0 ? membershipGroupIds : undefined
  );

  const { data: groups, error: groupsError } = role === "admin"
    ? await adminSupabase
        .from("groups")
        .select("id,name,description,avatar_url,base_prediction_mode,home_team_advantage_enabled,access_mode,group_kind,parent_group_id,membership_limit,status,owner_user_id")
        .order("created_at", { ascending: false })
    : await adminSupabase
        .from("groups")
        .select("id,name,description,avatar_url,base_prediction_mode,home_team_advantage_enabled,access_mode,group_kind,parent_group_id,membership_limit,status,owner_user_id")
        .or(`owner_user_id.eq.${userId},id.in.(${membershipGroupIds.length > 0 ? membershipGroupIds.join(",") : "00000000-0000-0000-0000-000000000000"})`)
        .order("created_at", { ascending: false });

  if (groupsError) {
    throw new Error(groupsError.message);
  }

  const groupRows = (groups ?? []) as Array<{
    id: string;
    name: string;
    description?: string | null;
    avatar_url?: string | null;
    base_prediction_mode?: string | null;
    home_team_advantage_enabled?: boolean | null;
    access_mode?: string | null;
    group_kind?: string | null;
    parent_group_id?: string | null;
    membership_limit: number;
    status: GroupStatus;
    owner_user_id?: string | null;
  }>;

  if (groupRows.length === 0) {
    return [];
  }

  const baseGroups: MyManagedGroup[] = groupRows.map((group): MyManagedGroup => {
    const membershipRole = membershipRoleByGroup.get(group.id);
    const relation: GroupRelation = {
      isOwner: group.owner_user_id === userId,
      isGroupManager: membershipRole === "manager"
    };
    const groupKind = normalizeGroupKind(group.group_kind);
    const accessMode = normalizeGroupAccessMode(group.access_mode);
    const canManageCaptainPrivate = groupKind === "captain_private" && group.owner_user_id === userId;
    const canManage = role === "admin" || canManageCaptainPrivate || canManageGroup(currentUser, relation);

    return {
      id: group.id,
      name: group.name,
      description: group.description ?? null,
      avatarUrl: group.avatar_url ?? null,
      basePredictionMode: normalizeGroupBaseMode(group.base_prediction_mode),
      homeTeamAdvantageEnabled: Boolean(group.home_team_advantage_enabled),
      accessMode,
      groupKind,
      parentGroupId: group.parent_group_id ?? null,
      membershipLimit: group.membership_limit,
      status: group.status,
      canManage,
      userRole:
        role === "admin"
          ? "super_admin"
          : canManage
            ? membershipRole ?? "manager"
            : membershipRole ?? "viewer",
      currentUserGroupLevelLabel:
        role === "admin"
          ? "Admin View"
          : canManage
            ? "Manager"
            : membershipRole === "member"
              ? "Player"
              : "Viewer"
    };
  });

  const groupIds = baseGroups.map((group) => group.id);
  const manageableGroupIds = baseGroups.filter((group) => group.canManage).map((group) => group.id);
  const [memberRowsResult, pendingInviteRowsResult] = await Promise.all([
    adminSupabase
      .from("group_members")
      .select("group_id")
      .in("group_id", groupIds),
    manageableGroupIds.length > 0
      ? adminSupabase
          .from("group_invites")
          .select("group_id,status")
          .in("group_id", manageableGroupIds)
          .eq("status", "pending")
      : Promise.resolve({ data: [], error: null })
  ]);

  if (memberRowsResult.error) {
    throw new Error(memberRowsResult.error.message);
  }

  if (pendingInviteRowsResult.error) {
    throw new Error(pendingInviteRowsResult.error.message);
  }

  const memberCounts = new Map<string, number>();
  for (const row of ((memberRowsResult.data ?? []) as Array<{ group_id: string }>)) {
    memberCounts.set(row.group_id, (memberCounts.get(row.group_id) ?? 0) + 1);
  }

  const pendingInviteCounts = new Map<string, number>();
  for (const row of ((pendingInviteRowsResult.data ?? []) as Array<{ group_id: string }>)) {
    pendingInviteCounts.set(row.group_id, (pendingInviteCounts.get(row.group_id) ?? 0) + 1);
  }

  return baseGroups.map((group) => ({
    ...group,
    memberCount: memberCounts.get(group.id) ?? 0,
    pendingInviteCount: group.canManage ? pendingInviteCounts.get(group.id) ?? 0 : 0
  }));
}

async function allVisibleGroupIdList(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await adminSupabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Array<{ group_id: string }>).map((row) => row.group_id);
}

async function fetchMembershipRolesByGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  groupIds?: string[]
) {
  let query = adminSupabase
    .from("group_members")
    .select("group_id,role")
    .eq("user_id", userId);

  if (groupIds && groupIds.length > 0) {
    query = query.in("group_id", groupIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const roles = new Map<string, GroupMemberRole>();
  for (const row of ((data ?? []) as Array<{ group_id: string; role: GroupMemberRole }>)) {
    roles.set(row.group_id, row.role);
  }

  return roles;
}

async function getManagedGroup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string,
  currentUser: Extract<CurrentUserContext, { ok: true }>
) {
  const userId = currentUser.userId;
  const role = currentUser.role;
  const { data, error } = await adminSupabase
    .from("groups")
    .select("id,name,avatar_url,owner_user_id,created_by_user_id,description,access_mode,group_kind,parent_group_id,membership_limit,status,created_at,updated_at")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  if (role === "admin" || data.owner_user_id === userId) {
    return data as GroupRow;
  }

  const { data: membership, error: membershipError } = await adminSupabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (!membership) {
    return null;
  }

  const relation: GroupRelation = {
    isOwner: data.owner_user_id === userId,
    isGroupManager: true
  };

  return canManageGroup(currentUser, relation) ? (data as GroupRow) : null;
}

function canManageLeagueCustomScoring(currentUser: Extract<CurrentUserContext, { ok: true }>) {
  return currentUser.role === "admin";
}

function canManageInvitesForGroup(
  currentUser: Extract<CurrentUserContext, { ok: true }>,
  group: Pick<GroupRow, "owner_user_id" | "group_kind">
) {
  if (group.group_kind === "captain_private" && group.owner_user_id === currentUser.userId) {
    return true;
  }

  const relation: GroupRelation = {
    isOwner: group.owner_user_id === currentUser.userId,
    isGroupManager: true
  };

  return canInviteMember(currentUser, relation);
}

async function ensureGroupAllowsEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: Pick<GroupRow, "id" | "access_mode">,
  normalizedEmail: string,
  disallowedMessage = "This group only accepts approved emails. Ask the manager to add this email first."
): Promise<{ ok: true } | { ok: false; message: string }> {
  const accessMode = normalizeGroupAccessMode(group.access_mode);

  if (accessMode === "closed") {
    return { ok: false, message: "This group is closed to new members." };
  }

  if (accessMode !== "restricted_by_email") {
    return { ok: true };
  }

  const { data, error } = await adminSupabase
    .from("group_allowed_emails")
    .select("id")
    .eq("group_id", group.id)
    .eq("email_normalized", normalizedEmail)
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data) {
    return { ok: false, message: disallowedMessage };
  }

  return { ok: true };
}

async function ensureGroupHasOpenSeat(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: Pick<GroupRow, "id" | "membership_limit" | "owner_user_id">,
  currentUser?: Extract<CurrentUserContext, { ok: true }>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const effectiveMembershipLimit = await getEffectiveGroupSeatLimit(adminSupabase, group, currentUser);
  const { count, error } = await adminSupabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((count ?? 0) >= effectiveMembershipLimit) {
    return { ok: false, message: "This group is at its member limit." };
  }

  return { ok: true };
}

async function ensureGroupHasInviteCapacity(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: Pick<GroupRow, "id" | "membership_limit" | "owner_user_id">,
  currentUser?: Extract<CurrentUserContext, { ok: true }>,
  ignoreInviteId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const effectiveMembershipLimit = await getEffectiveGroupSeatLimit(adminSupabase, group, currentUser);
  const pendingInviteQuery = adminSupabase
    .from("group_invites")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id)
    .eq("status", "pending");

  if (ignoreInviteId) {
    pendingInviteQuery.neq("id", ignoreInviteId);
  }

  const [memberCountResult, pendingInviteCountResult] = await Promise.all([
    adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", group.id),
    pendingInviteQuery
  ]);

  if (memberCountResult.error || pendingInviteCountResult.error) {
    return {
      ok: false,
      message: memberCountResult.error?.message ?? pendingInviteCountResult.error?.message ?? "Could not check group capacity."
    };
  }

  const usedSeats = (memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0);
  if (usedSeats >= effectiveMembershipLimit) {
    return { ok: false, message: "This group is at its member limit." };
  }

  return { ok: true };
}

async function ensureGroupHasCaptainInviteCapacity(
  adminSupabase: ReturnType<typeof createAdminClient>,
  group: Pick<GroupRow, "id" | "membership_limit" | "owner_user_id">,
  requiredOpenSeats: number,
  ignoreInviteId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const effectiveMembershipLimit = await getEffectiveGroupSeatLimit(adminSupabase, group);
  const pendingInviteQuery = adminSupabase
    .from("group_invites")
    .select("id", { count: "exact", head: true })
    .eq("group_id", group.id)
    .eq("status", "pending");

  if (ignoreInviteId) {
    pendingInviteQuery.neq("id", ignoreInviteId);
  }

  const [memberCountResult, pendingInviteCountResult] = await Promise.all([
    adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", group.id),
    pendingInviteQuery
  ]);

  if (memberCountResult.error || pendingInviteCountResult.error) {
    return {
      ok: false,
      message: memberCountResult.error?.message ?? pendingInviteCountResult.error?.message ?? "Could not check Captain invite capacity."
    };
  }

  const usedSeats = (memberCountResult.count ?? 0) + (pendingInviteCountResult.count ?? 0);
  const openSeats = effectiveMembershipLimit - usedSeats;
  if (openSeats < requiredOpenSeats) {
    return {
      ok: false,
      message:
        requiredOpenSeats <= 1
          ? "This group does not have enough open seats for that Captain invite."
          : `This group needs ${requiredOpenSeats} open seats for that Captain invite and allowance.`
    };
  }

  return { ok: true };
}

async function findUserIdByEmail(adminSupabase: ReturnType<typeof createAdminClient>, normalizedEmail: string) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

async function findUsersByNormalizedEmails(
  adminSupabase: ReturnType<typeof createAdminClient>,
  normalizedEmails: string[]
) {
  const lookup = new Set<string>();
  if (normalizedEmails.length === 0) {
    return lookup;
  }

  const { data, error } = await adminSupabase
    .from("users")
    .select("email")
    .in("email", normalizedEmails);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of ((data ?? []) as Array<{ email: string }>)) {
    lookup.add(normalizeEmail(row.email));
  }

  return lookup;
}

function buildCustomTrophyKey(groupId: string | null, name: string) {
  const normalizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "trophy";
  const scopePrefix = groupId ? `group_${groupId.slice(0, 8)}` : "global";
  return `${scopePrefix}_${normalizedName}_${randomBytes(4).toString("hex")}`;
}

function getGroupActivityDayWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const dateKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    dateKey
  };
}

async function getManagedGroupInvite(
  adminSupabase: ReturnType<typeof createAdminClient>,
  inviteId: string,
  currentUser: Extract<CurrentUserContext, { ok: true }>
) {
  const { data, error } = await adminSupabase
    .from("group_invites")
    .select("id,group_id,email,normalized_email,invited_by_user_id,suggested_display_name,custom_message,language,helper_language,status,claim_token,expires_at,accepted_by_user_id,accepted_at,email_status,email_sent_at,email_provider_message_id,email_error,email_attempt_count,last_email_attempt_at,last_resent_by_user_id,last_sent_at,send_attempts,last_error")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const managedGroup = await getManagedGroup(adminSupabase, data.group_id, currentUser);
  return managedGroup ? (data as GroupInviteRow) : null;
}

async function getUserLabel(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("name,email")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    name: data?.name ?? null,
    email: data?.email ?? null
  };
}

function buildInviteTraceId() {
  return `group-invite-${randomBytes(6).toString("hex")}`;
}

function summarizeEmailError(message: string) {
  return message.trim().slice(0, 240);
}

function deriveGroupInviteEmailStatus(
  invite:
    | Pick<GroupInviteRow, "status" | "email_status" | "email_error" | "last_error" | "email_sent_at" | "last_sent_at">
    | Pick<GroupInviteRecord, "status" | "email_status" | "email_error" | "last_error" | "email_sent_at" | "last_sent_at">
): "pending" | "sent" | "failed" {
  if (invite.status === "accepted") {
    return "sent";
  }

  if (invite.email_status === "failed" || invite.email_error || invite.last_error) {
    return "failed";
  }

  if (invite.email_status === "sent" || invite.email_sent_at || invite.last_sent_at) {
    return "sent";
  }

  return "pending";
}

function canResendManagedGroupInvite(invite: GroupInviteRow) {
  if (invite.status === "accepted" || invite.status === "revoked" || invite.status === "expired") {
    return false;
  }

  const emailStatus = deriveGroupInviteEmailStatus(invite);
  return emailStatus === "pending" || emailStatus === "sent" || emailStatus === "failed";
}

function getResendCooldownRemainingMs(lastAttemptAt?: string | null) {
  if (!lastAttemptAt) {
    return 0;
  }

  const elapsed = Date.now() - new Date(lastAttemptAt).getTime();
  return Math.max(0, GROUP_INVITE_RESEND_COOLDOWN_MS - elapsed);
}

async function countGroupInviteEmailJobsToday(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    inviteId: string;
    managerUserId: string;
  }
) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();

  const [inviteJobsResult, managerJobsResult] = await Promise.all([
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "group_invite_email")
      .contains("payload", { groupInviteId: input.inviteId })
      .gte("created_at", since),
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .eq("kind", "group_invite_email")
      .eq("requested_by_admin_id", input.managerUserId)
      .gte("created_at", since)
  ]);

  if (inviteJobsResult.error) {
    throw new Error(inviteJobsResult.error.message);
  }

  if (managerJobsResult.error) {
    throw new Error(managerJobsResult.error.message);
  }

  return {
    inviteCount: inviteJobsResult.count ?? 0,
    managerCount: managerJobsResult.count ?? 0
  };
}

async function enqueueGroupInviteEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    email: string;
    groupInviteId: string;
    groupId: string;
    groupName: string;
    invitedByUserId: string;
    inviterName?: string | null;
    inviterEmail?: string | null;
    suggestedDisplayName?: string | null;
    customMessage?: string | null;
    language?: string | null;
    helperLanguage?: string | null;
    existingAccount?: boolean;
    claimUrl: string;
    traceId?: string;
    attemptAlreadyRecorded?: boolean;
  }
): Promise<EnqueueEmailJobResult> {
  const normalizedEmail = normalizeEmail(input.email);
  const preferredLanguage = getSafeEmailLanguage(input.language ?? null);
  const { error } = await adminSupabase.from("email_jobs").insert({
    kind: "group_invite_email",
    email: input.email,
    dedupe_key: `group_invite:${input.groupId}:${normalizedEmail}`,
    payload: {
      groupInviteId: input.groupInviteId,
      groupId: input.groupId,
      groupName: input.groupName,
      inviterName: input.inviterName ?? undefined,
      inviterEmail: input.inviterEmail ?? undefined,
      suggestedDisplayName: input.suggestedDisplayName ?? undefined,
      customMessage: input.customMessage ?? undefined,
      existingAccount: input.existingAccount ?? undefined,
      claimUrl: input.claimUrl,
      traceId: input.traceId ?? undefined,
      attemptAlreadyRecorded: input.attemptAlreadyRecorded ?? undefined,
      language: preferredLanguage,
      helperLanguage: input.helperLanguage ? normalizeExplainerLanguage(input.helperLanguage) : undefined
    },
    requested_by_admin_id: input.invitedByUserId
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyQueued: true, deliveryMethod: "queued" };
    }

    if (isMissingEmailJobsError(error.message)) {
      try {
        await sendGroupInviteEmailInline({
          to: input.email,
          groupName: input.groupName,
          invitedEmail: input.email,
          suggestedDisplayName: input.suggestedDisplayName ?? null,
          customMessage: input.customMessage ?? null,
          inviterName: input.inviterName ?? null,
          inviterEmail: input.inviterEmail ?? null,
          existingAccount: input.existingAccount ?? null,
          claimUrl: input.claimUrl,
          language: preferredLanguage
        });
        return { ok: true, alreadyQueued: false, deliveryMethod: "sent_inline" };
      } catch (inlineError) {
        return {
          ok: false,
          message: inlineError instanceof Error ? inlineError.message : "Could not send the group invite email."
        };
      }
    }

    return { ok: false, message: error.message };
  }

  return { ok: true, alreadyQueued: false, deliveryMethod: "queued" };
}

type TriggerEmailWorkerResult =
  | { ok: true; status: number }
  | { ok: false; message: string };

async function triggerEmailWorkerNow(): Promise<TriggerEmailWorkerResult> {
  const secret = process.env.EMAIL_JOB_SECRET ?? process.env.CRON_SECRET;
  const workerUrl = `${getSiteUrl()}/api/email-jobs/process`;

  try {
    const headers: Record<string, string> = {};
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    const response = await fetch(workerUrl, {
      method: "POST",
      headers,
      cache: "no-store"
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return {
        ok: false,
        message: `Worker responded with ${response.status}.${bodyText ? ` ${bodyText}` : ""}`.trim()
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown worker trigger error."
    };
  }
}

async function markGroupInviteEmailFailure(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupInviteId: string,
  message: string
) {
  const safeMessage = summarizeEmailError(message);
  await adminSupabase
    .from("group_invites")
    .update({
      email_status: "failed",
      email_error: safeMessage,
      last_error: safeMessage
    })
    .eq("id", groupInviteId);
}

async function sendGroupInviteEmailInline(input: {
  to: string;
  groupName: string;
  invitedEmail: string;
  suggestedDisplayName?: string | null;
  customMessage?: string | null;
  inviterName?: string | null;
  inviterEmail?: string | null;
  existingAccount?: boolean | null;
  claimUrl: string;
  language?: string | null;
}) {
  const emailCopy = buildGroupInviteEmailCopy({
    language: input.language,
    groupName: input.groupName,
    invitedEmail: input.invitedEmail,
    suggestedDisplayName: input.suggestedDisplayName ?? null,
    customMessage: input.customMessage ?? null,
    inviterLabel: input.inviterName?.trim() || input.inviterEmail?.trim() || null,
    existingAccount: input.existingAccount ?? null,
    claimUrl: input.claimUrl
  });

  await sendTransactionalEmail({
    to: input.to,
    subject: emailCopy.subject,
    html: emailCopy.html,
    text: emailCopy.text,
    replyTo: input.inviterEmail?.trim() || undefined
  });
}

function isMissingEmailJobsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("email_jobs") &&
    ((normalized.includes("schema cache")) ||
      (normalized.includes("relation") && normalized.includes("does not exist")) ||
      (normalized.includes("table") && normalized.includes("does not exist")))
  );
}

function normalizeRequestedMembershipLimit(value?: number) {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_GROUP_MEMBERSHIP_LIMIT;
  }

  return Math.max(1, Math.floor(value));
}

function parseMidnightGmtDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

async function fetchTournamentPickLockDeadlines(adminSupabase: ReturnType<typeof createAdminClient>) {
  const [groupDeadlineResult, knockoutDeadlineResult] = await Promise.all([
    adminSupabase
      .from("matches")
      .select("kickoff_time")
      .eq("stage", "group")
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from("matches")
      .select("kickoff_time")
      .in("stage", ["r32", "round_of_32"])
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle()
  ]);

  if (groupDeadlineResult.error) {
    throw new Error(groupDeadlineResult.error.message);
  }

  if (knockoutDeadlineResult.error) {
    throw new Error(knockoutDeadlineResult.error.message);
  }

  return {
    groupStageDeadline: (groupDeadlineResult.data as { kickoff_time?: string | null } | null)?.kickoff_time ?? null,
    knockoutDeadline: (knockoutDeadlineResult.data as { kickoff_time?: string | null } | null)?.kickoff_time ?? null
  };
}

function parseInviteEmailInput(value?: string | null):
  | { ok: true; emails: string[] }
  | { ok: false; message: string } {
  const rawValue = value?.trim() ?? "";
  if (!rawValue) {
    return { ok: true, emails: [] };
  }

  const emails = Array.from(
    new Set(
      rawValue
        .split(/[\n,]+/)
        .map((entry) => normalizeEmail(entry))
        .filter(Boolean)
    )
  );

  const invalidEmails = emails.filter((email) => !BASIC_EMAIL_PATTERN.test(email));
  if (invalidEmails.length > 0) {
    return {
      ok: false,
      message: `Enter valid email addresses only. Problem entries: ${invalidEmails.join(", ")}`
    };
  }

  return { ok: true, emails };
}

async function createPendingGroupInvites(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    groupId: string;
    groupName: string;
    normalizedEmails: string[];
    invitedByUserId: string;
    inviteLanguage: SupportedLanguage;
    helperLanguage: ExplainerLanguage;
  }
) {
  if (input.normalizedEmails.length === 0) {
    return { failedEmails: [] as string[] };
  }

  const expiresAt = new Date(Date.now() + DEFAULT_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const existingUsersByEmail = await findUsersByNormalizedEmails(adminSupabase, input.normalizedEmails);
  const inviterProfile = await getUserLabel(adminSupabase, input.invitedByUserId);
  const inviteLanguage = normalizeLanguage(input.inviteLanguage);
  const helperLanguage = normalizeExplainerLanguage(input.helperLanguage);

  const preparedInvites = input.normalizedEmails.map((email) => {
    const token = randomBytes(24).toString("hex");
    const existingAccount = existingUsersByEmail.has(email);

    return {
      email,
      existingAccount,
      claimUrl: buildGroupInviteClaimUrl(
        token,
        inviteLanguage,
        helperLanguage,
        existingAccount ? "login" : "signup"
      ),
      row: {
        group_id: input.groupId,
        email,
        normalized_email: email,
        invited_by_user_id: input.invitedByUserId,
        suggested_display_name: null,
        custom_message: null,
        language: inviteLanguage,
        helper_language: helperLanguage,
        status: "pending" as const,
        claim_token: token,
        token_hash: hashInviteToken(token),
        email_status: "pending" as const,
        expires_at: expiresAt
      }
    };
  });

  const { data, error } = await adminSupabase
    .from("group_invites")
    .insert(preparedInvites.map((invite) => invite.row))
    .select("id,email,normalized_email");
  if (error) {
    throw new Error(error.message);
  }

  const inviteMetaByEmail = new Map(preparedInvites.map((invite) => [invite.email, invite]));
  const failedEmails: string[] = [];
  let hasQueuedDelivery = false;

  for (const invite of (data ?? []) as Array<{ id: string; email: string; normalized_email: string }>) {
    const preparedInvite = inviteMetaByEmail.get(normalizeEmail(invite.normalized_email || invite.email));
    if (!preparedInvite) {
      failedEmails.push(invite.email);
      await markGroupInviteEmailFailure(
        adminSupabase,
        invite.id,
        "Invite email metadata was missing before delivery could be queued."
      );
      continue;
    }

    const enqueueResult = await enqueueGroupInviteEmail(adminSupabase, {
      email: preparedInvite.email,
      groupInviteId: invite.id,
      groupId: input.groupId,
      groupName: input.groupName,
      invitedByUserId: input.invitedByUserId,
      inviterName: inviterProfile.name,
      inviterEmail: inviterProfile.email,
      language: inviteLanguage,
      helperLanguage,
      existingAccount: preparedInvite.existingAccount,
      claimUrl: preparedInvite.claimUrl
    });

    if (!enqueueResult.ok) {
      failedEmails.push(preparedInvite.email);
      await markGroupInviteEmailFailure(adminSupabase, invite.id, enqueueResult.message);
      continue;
    }

    if (enqueueResult.deliveryMethod === "queued") {
      hasQueuedDelivery = true;
    }
  }

  if (hasQueuedDelivery) {
    await triggerEmailWorkerNow();
  }

  console.info("Group email allowlist invites created.", {
    managerUserId: input.invitedByUserId,
    groupId: input.groupId,
    groupName: input.groupName,
    inviteCount: input.normalizedEmails.length,
    existingUserCount: input.normalizedEmails.filter((email) => existingUsersByEmail.has(email)).length,
    failedEmailCount: failedEmails.length
  });

  return {
    failedEmails
  };
}

function normalizeExpiryDays(value?: number) {
  if (!value || Number.isNaN(value)) {
    return DEFAULT_INVITE_EXPIRY_DAYS;
  }

  return Math.max(1, Math.floor(value));
}

function normalizeCaptainInviteAllowance(value?: number | null) {
  if (!value || Number.isNaN(value)) {
    return 1;
  }

  return Math.max(1, Math.min(MAX_CAPTAINS_PASS_ALLOWANCE, Math.floor(value)));
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeGroupInviteCustomMessage(value?: string | null) {
  return value?.trim() ?? "";
}

function normalizeGroupDescription(value?: string | null) {
  return value?.trim() ?? "";
}

function buildManagedGroupAvatarObjectPath(groupId: string, extension: string) {
  return `${groupId}/${Date.now()}-${randomBytes(6).toString("hex")}.${extension}`;
}

async function removeKnownGroupAvatarObjects(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupId: string
) {
  const { data, error } = await adminSupabase.storage.from(GROUP_AVATAR_BUCKET).list(groupId, {
    limit: 100
  });

  if (error) {
    if (isMissingStorageBucketError(error.message, GROUP_AVATAR_BUCKET)) {
      return;
    }

    console.warn("Could not list group avatar objects.", {
      bucket: GROUP_AVATAR_BUCKET,
      groupId,
      message: error.message
    });
    return;
  }

  const storagePaths = (data ?? [])
    .map((entry) => entry.name?.trim())
    .filter(Boolean)
    .map((name) => `${groupId}/${name}`);

  if (storagePaths.length === 0) {
    return;
  }

  const { error: removeError } = await adminSupabase.storage.from(GROUP_AVATAR_BUCKET).remove(storagePaths);
  if (removeError && !removeError.message.toLowerCase().includes("not found") && !isMissingStorageBucketError(removeError.message, GROUP_AVATAR_BUCKET)) {
    console.warn("Could not remove previous group avatar objects.", {
      bucket: GROUP_AVATAR_BUCKET,
      groupId,
      message: removeError.message
    });
  }
}

function buildCaptainPrivateGroupName(name: string) {
  const baseName = `${name.trim() || "Captain"}'s Captain Group`;
  return baseName.length <= MAX_GROUP_NAME_LENGTH ? baseName : `${baseName.slice(0, MAX_GROUP_NAME_LENGTH - 1).trim()}…`;
}

function normalizeRulesetBonusValue(value?: number | null, max = 50) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(max, Math.floor(value)));
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildGroupInviteClaimUrl(
  token: string,
  language?: string | null,
  helperLanguage?: string | null,
  authMode: "login" | "signup" = "signup"
) {
  const inviteReturnPath = appendExplainerLanguageToPath(
    appendLanguageToPath(`/my-groups?invite=${token}`, language),
    helperLanguage
  );
  const loginPath = appendLanguageToPath(
    `/login?mode=${authMode}&flow=invite&next=${encodeURIComponent(inviteReturnPath)}`,
    language
  );
  return `${getPublicSiteUrl()}${loginPath}`;
}

function buildWhatsAppShareUrl(input: {
  claimUrl: string;
  groupName: string;
  invitedEmail: string;
  existingAccount?: boolean;
}) {
  const text = `Join ${input.groupName} on PICK-IT! This invite is for ${input.invitedEmail}. Use this link to ${
    input.existingAccount ? "log in and join" : "sign up"
  }: ${input.claimUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
