"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  PUBLIC_PLAYER_SIGNUP_ENABLED_KEY,
  fetchBooleanAppSetting,
  fetchIntegerAppSetting,
  fetchLeaderboardFeatureSettings,
  updateBooleanAppSetting,
  updateIntegerAppSetting,
  updateLeaderboardFeatureSetting,
  type LeaderboardFeatureSettingKey,
  type LeaderboardFeatureSettings
} from "@/lib/app-settings";
import {
  DEFAULT_LEGAL_DOCUMENT_TYPE,
  getRequiredLegalDocument,
  upsertRequiredLegalDocument,
  type LegalDocument
} from "@/lib/legal";
import { fetchAdminPlayerHealthRows, type AdminPlayerHealthRow } from "@/lib/admin-player-health";
import { sendTransactionalEmail } from "@/lib/email-sender";
import {
  buildAdminAccessLevelChangeEmailCopy,
  buildAdminRecoveryEmailCopy,
  getSafeEmailLanguage
} from "@/lib/email-copy";
import { ensureUserCanJoinAnotherGroup } from "@/lib/group-membership-limits";
import { appendLanguageToPath, normalizeLanguage } from "@/lib/i18n";
import { fetchGlobalLeaderboardRankMovement, fetchGroupLeaderboardRankMovement } from "@/lib/leaderboard-movement";
import { fetchDailyWinners } from "@/lib/leaderboard-highlights";
import { createNotificationsForLeaderboardEvents, createTrophyEarnedNotifications, type NotificationEventSeed } from "@/lib/notifications";
import { canScoreKnockoutMatch } from "@/lib/bracket-scoring";
import {
  resetKnockoutMatchScoring,
  scoreFinalizedKnockoutMatchWithClient
} from "@/lib/bracket-predictions";
import { rebuildKnockoutAdvancementWithClient as rebuildKnockoutAdvancementSharedWithClient } from "@/lib/knockout-advancement";
import { canScoreGroupMatch, scoreGroupStagePrediction } from "@/lib/group-scoring";
import { isKnockoutStage } from "@/lib/match-stage";
import { appendMatchEvent } from "@/lib/match-events";
import { syncMatches } from "@/lib/match-sync/syncMatches";
import {
  clearKnockoutSeedingFlags,
  fetchKnockoutSeedingAdminStatus,
  seedOfficialKnockoutFromFinalGroupResults,
  type KnockoutSeedingAdminStatus
} from "@/lib/knockout-seeding-runtime";
import { getPublicSiteUrl, getSiteUrl } from "@/lib/site-url";
import {
  ADMIN_RESET_TOOL_DEFINITIONS,
  type AdminRecoveryScope,
  getResetDiagnostics,
  isSelfServiceTestResetEnabled,
  getTestingResetAvailability,
  logTestingResetEnvDiagnostics
} from "@/lib/admin/destructive-tools";
import {
  compareAccessLevels,
  getAccessLevelDisplayLabel,
  normalizeAccessLevel,
  normalizeCommercialTier,
  resolveTierAccess,
  type AccessLevel,
  type CommercialTier
} from "@/lib/tier-access";
import {
  rebuildScopedLeaderboardState
} from "@/lib/scoped-scoring";
import {
  runReadOnlyAdminScoringAudit,
  type AdminScoringAuditReport
} from "@/lib/admin-scoring-audit";
import {
  fetchProjectedLeaderboardAudit,
  type ProjectedLeaderboardAuditBreakdown,
  type ProjectedLeaderboardAuditRow
} from "@/lib/projected-leaderboard";
import {
  DASHBOARD_UI_RESET_EPOCH_SETTING_KEY,
  LEADERBOARD_SOCIAL_RESET_AT_SETTING_KEY
} from "@/lib/ui-storage-keys";
import type { MatchNextSlot, MatchStage, UserRole } from "@/lib/types";

type MatchRow = {
  id: string;
  stage: MatchStage;
  group_name?: string | null;
  status: "scheduled" | "locked" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
  kickoff_at?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  finalized_at?: string | null;
  last_synced_at?: string | null;
  external_id?: string | null;
  is_manual_override?: boolean | null;
  sync_status?: "ok" | "skipped" | "error" | null;
  sync_error?: string | null;
  next_match_id?: string | null;
  next_match_slot?: MatchNextSlot | null;
  updated_at?: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  predicted_is_draw: boolean;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
};

type ScoredPrediction = {
  predictionId: string;
  userId: string;
  matchId: string;
  scoreBreakdown: {
    points: number;
    outcome_points: number;
    exact_score_points: number;
    goal_difference_points: number;
  };
};

type LeaderboardEventInsert = {
  event_type: "points_awarded" | "perfect_pick" | "rank_moved_up" | "rank_moved_down";
  scope_type: "global" | "group";
  group_id: string | null;
  match_id: string;
  user_id: string;
  related_user_id: null;
  points_delta: number | null;
  rank_delta: number | null;
  message: string;
  metadata: Record<string, unknown>;
  created_at?: string;
};

type InsertedLeaderboardEventRow = NotificationEventSeed;
type TrophyRow = {
  id: string;
};

type InviteLookupRow = {
  email: string;
  display_name: string;
  language?: string | null;
  role: UserRole;
  plan_tier?: CommercialTier | null;
  accepted_at?: string | null;
  status?: "pending" | "accepted" | "revoked" | "expired" | "failed" | null;
  last_sent_at?: string | null;
  send_attempts?: number | null;
  last_error?: string | null;
};

type EmailJobKind = "access_email" | "password_recovery";
type GroupMemberRole = "manager" | "member";
type GroupStatus = "active" | "archived";

type EmailJobPayload = {
  displayName?: string;
  language?: string;
  role?: UserRole;
  planTier?: CommercialTier;
  source?: "admin_invites" | "admin_players";
};

type AuthUserSummary = {
  id: string;
  email?: string | null;
  emailConfirmedAt?: string | null;
  confirmationSentAt?: string | null;
  lastSignInAt?: string | null;
};

type EnqueueEmailJobResult =
  | { ok: true; alreadyQueued: boolean }
  | { ok: false; message: string };

export type ScoreMatchResult =
  | {
      ok: true;
      scored: boolean;
      predictionsScored: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

type SkippedScoreMatchResult = {
  ok: true;
  scored: false;
  predictionsScored: number;
  message: string;
};

export type UpdateMatchResultInput = {
  id: string;
  status: MatchRow["status"];
  homeScore?: number;
  awayScore?: number;
  winnerTeamId?: string | null;
};

export type UpdateMatchResult =
  | {
      ok: true;
      match: ReturnType<typeof mapMatchRow>;
    }
    | {
      ok: false;
      message: string;
    };

export type RescoreKnockoutScoresResult =
  | {
      ok: true;
      rescoredMatches: number;
      rescoredPredictions: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type RunAdminScoringAuditResult =
  | {
      ok: true;
      report: AdminScoringAuditReport;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type BatchFinalizeMatchScope =
  | "group-only"
  | "knockout-only"
  | "all"
  | "open-only"
  | "locked-live-only"
  | "open-locked-live";

export type BatchFinalizeMatchResultStyle =
  | "realistic"
  | "fun"
  | "favorites"
  | "draw-heavy"
  | "knockout-no-draw";

export type BatchFinalizeMatchOverwriteMode = "skip-finalized" | "overwrite-test-results";

export type BatchFinalizeMatchResultsInput = {
  fromDate: string;
  toDate: string;
  scope: BatchFinalizeMatchScope;
  resultStyle: BatchFinalizeMatchResultStyle;
  overwriteMode: BatchFinalizeMatchOverwriteMode;
  confirmationText: string;
};

export type BatchFinalizeMatchResultsResult =
  | {
      ok: true;
      processed: number;
      finalized: number;
      skipped: number;
      overwritten: number;
      scoringJobsTriggered: number;
      errors: string[];
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type BatchClearMatchResultsInput = {
  fromDate: string;
  toDate: string;
  scope: BatchFinalizeMatchScope;
  confirmationText: string;
};

export type BatchClearMatchResultsResult =
  | {
      ok: true;
      processed: number;
      cleared: number;
      skipped: number;
      repairedKnockoutMatches: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type RepairKnockoutAdvancementResult =
  | {
      ok: true;
      populatedSlots: number;
      updatedSlots: number;
      touchedMatches: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type SyncMatchesNowResult =
  | {
      ok: true;
      lockedMatches: number;
      fetchedMatches: number;
      finalizedMatches: number;
      skippedManualOverride: number;
      skippedUnresolvedTeams: number;
      skippedUnmatched: number;
      errors: number;
      latestSyncedAt: string | null;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ResetTestingDataInput = {
  confirmationText: string;
  scope: string;
  reason?: string;
};

export type DestructiveAdminToolStatusResult =
  | {
      ok: true;
      scopes: Record<AdminRecoveryScope, ReturnType<typeof getTestingResetAvailability>>;
      diagnostics: ReturnType<typeof getResetDiagnostics>;
      toolDefinitions: typeof ADMIN_RESET_TOOL_DEFINITIONS;
    }
  | {
      ok: false;
      message: string;
    };

type ResetOperationResultBase = {
  ok: true;
  warning?: false;
  resetMatchCount: number;
  deletedPredictions: number;
  deletedPredictionScores: number;
  deletedLeaderboardEvents: number;
  deletedLeaderboardSnapshots: number;
  deletedUserNotifications: number;
  message: string;
};

type ResetOperationWarningResultBase = {
  ok: true;
  warning: true;
  resetMatchCount: number;
  deletedPredictions: number;
  deletedPredictionScores: number;
  deletedLeaderboardEvents: number;
  deletedLeaderboardSnapshots: number;
  deletedUserNotifications: number;
  message: string;
};

export type ResetKnockoutTestingDataResult =
  | {
      deletedBracketPredictions: number;
      deletedBracketScores: number;
    } & ResetOperationResultBase
  | {
      deletedBracketPredictions: number;
      deletedBracketScores: number;
    } & ResetOperationWarningResultBase
  | {
      ok: false;
      message: string;
    };

export type ResetGroupStageTestingDataResult =
  | ({
      ok: true;
      warning?: false;
      resetMatchCount: number;
      deletedPredictions: number;
      deletedPredictionScores: number;
      deletedLeaderboardEvents: number;
      deletedLeaderboardSnapshots: number;
      deletedUserNotifications: number;
      deletedCounts: {
        groupPredictions: number;
        predictionScores: number;
        leaderboardEntries: number;
        leaderboardEvents: number;
        groupStandingsOrDerivedRows: number;
        knockoutSeededRowsIfApplicable: number;
      };
      message: string;
    })
  | ({
      ok: true;
      warning: true;
      resetMatchCount: number;
      deletedPredictions: number;
      deletedPredictionScores: number;
      deletedLeaderboardEvents: number;
      deletedLeaderboardSnapshots: number;
      deletedUserNotifications: number;
      deletedCounts: {
        groupPredictions: number;
        predictionScores: number;
        leaderboardEntries: number;
        leaderboardEvents: number;
        groupStandingsOrDerivedRows: number;
        knockoutSeededRowsIfApplicable: number;
      };
      message: string;
    })
  | {
      ok: false;
      message: string;
    };

export type ClearBracketBuilderSnapshotDataResult =
  | {
      ok: true;
      deletedGroupSeedRankings: number;
      deletedBestThirdRankings: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

type ResetOperationSummary = {
  targetMatchCount: number;
  statusBreakdown: Record<string, number>;
  resetMatchCount: number;
  deletedPredictions: number;
  deletedPredictionScores: number;
  deletedLeaderboardEvents: number;
  deletedLeaderboardSnapshots: number;
  deletedUserNotifications: number;
  deletedGeneratedArtifacts?: number;
  deletedKnockoutSeedArtifacts?: number;
  postResetStatusBreakdown?: Record<string, number>;
  lingeringNonOpenMatchCount?: number;
  lingeringScoredMatchCount?: number;
};

export type ClearUserTestPredictionsInput = {
  userId: string;
  expectedEmail: string;
  reason: string;
};

export type ClearUserTestPredictionsResult =
  | {
      ok: true;
      affectedPredictionCount: number;
      affectedBracketPredictionCount: number;
      affectedProjectedBracketPredictionCount: number;
      affectedLegacyBracketPickCount: number;
      affectedBracketScoreCount: number;
      affectedPredictionScoreCount: number;
      affectedLeaderboardEventCount: number;
      affectedLeaderboardSnapshotCount: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type SelfServiceClearCurrentUserTestPredictionsInput = {
  confirmationText: string;
  acknowledged: boolean;
  reason: string;
};

export type ResetGroupLocalStateInput = {
  groupId: string;
  expectedGroupName: string;
  reason: string;
};

export type ResetGroupLocalStateResult =
  | {
      ok: true;
      clearedLeaderboardEvents: number;
      clearedLeaderboardSnapshots: number;
      clearedGroupBonusScores: number;
      clearedSidePickScores: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ResetMatchToOpenInput = {
  matchId: string;
  expectedMatchId: string;
  reason: string;
};

export type ResetMatchToOpenResult =
  | {
      ok: true;
      clearedPredictionScores: number;
      clearedBracketScores: number;
      clearedLeaderboardEvents: number;
      clearedLeaderboardSnapshots: number;
      clearedDownstreamPredictions: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type RepairLeaderboardStateInput = {
  reason: string;
};

export type RepairLeaderboardStateResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type FullPreLaunchTestResetInput = {
  confirmationText: string;
  reason: string;
};

export type FullPreLaunchTestResetResult =
  | {
      ok: true;
      groupResetMatchCount: number;
      knockoutResetMatchCount: number;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CreateInviteInput = {
  email: string;
  displayName?: string;
  language?: string;
  role?: UserRole;
  accessLevel?: AccessLevel | string;
};

export type CreateInviteResult =
  | {
      ok: true;
      created: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type ResetUserAccessInput = {
  userId: string;
  email: string;
};

export type ResetUserAccessResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type DemotionImpactOwnedGroup = {
  id: string;
  name: string;
  status: GroupStatus;
  membershipLimit: number;
  memberCount: number;
  activeInviteCodeCount: number;
  pendingInviteCount: number;
  exceedsTargetMemberLimit: boolean;
  blockerReason: string | null;
};

export type DemotionCleanupOption =
  | "remove_manager_limits"
  | "downgrade_legacy_manager_memberships"
  | "deactivate_created_access_codes";

export type DemotionCleanupOptionDetail = {
  key: DemotionCleanupOption;
  label: string;
  description: string;
  selectedByDefault: boolean;
};

export type DemotionImpactSummary = {
  userId: string;
  email: string;
  displayName: string;
  currentRole: UserRole;
  currentPlanTier: CommercialTier | null;
  currentAccessLevel: AccessLevel;
  targetRole: UserRole;
  targetPlanTier: CommercialTier;
  targetAccessLevel: AccessLevel;
  ownedGroupCount: number;
  managedGroupCount: number;
  groupsThatWouldExceedTarget: DemotionImpactOwnedGroup[];
  ownedGroups: DemotionImpactOwnedGroup[];
  activeInviteCodeCount: number;
  pendingInviteCount: number;
  hasManagerLimits: boolean;
  managerLimits: { maxGroups: number; maxMembersPerGroup: number } | null;
  legacyManagedGroupCount: number;
  activeCreatedAccessCodeCount: number;
  organizationOwnershipCount: number;
  organizationBrandingCount: number;
  customTrophyOwnershipCount: number;
  sidePickOwnershipCount: number;
  isSuperAdmin: boolean;
  status: "safe" | "blocked" | "cleanup_required";
  blockers: string[];
  cleanupActions: string[];
  cleanupOptions: DemotionCleanupOptionDetail[];
};

export type FetchUserDemotionImpactResult =
  | {
      ok: true;
      impact: DemotionImpactSummary;
    }
  | {
      ok: false;
      message: string;
    };

export type DemoteUserWithImpactResolutionInput = {
  userId: string;
  targetAccessLevel: AccessLevel;
  expectedEmail: string;
  reason: string;
  resolutionPlan?: Partial<Record<DemotionCleanupOption, boolean>>;
};

export type DemoteUserWithImpactResolutionResult = ResetUserAccessResult;

export type DeactivateOrganizerAccessInput = {
  userId: string;
  expectedEmail: string;
  reason: string;
  resolutionPlan?: Partial<Record<DemotionCleanupOption, boolean>>;
};

export type DeactivateOrganizerAccessResult = ResetUserAccessResult;
export type UpdateUserCommercialTierInput = {
  userId: string;
  targetAccessLevel: AccessLevel;
};
export type UpdateUserCommercialTierResult = ResetUserAccessResult;

export type FetchAdminPlayerHealthResult =
  | {
      ok: true;
      players: AdminPlayerHealthRow[];
    }
  | {
      ok: false;
      message: string;
    };

export type ResendConfirmationNudgeResult = ResetUserAccessResult;
export type ResetOnboardingStateResult = ResetUserAccessResult;
export type DeleteUserAndStartOverResult = ResetUserAccessResult;
export type FetchLeaderboardFeatureSettingsResult =
  | {
      ok: true;
      settings: LeaderboardFeatureSettings;
    }
  | {
      ok: false;
      message: string;
    };
export type UpdateLeaderboardFeatureSettingResult = ResetUserAccessResult;
export type FetchProjectedLeaderboardAuditResult =
  | {
      ok: true;
      projectionKey: string | null;
      generatedAt: string;
      topRows: ProjectedLeaderboardAuditRow[];
      selectedRow: ProjectedLeaderboardAuditRow | null;
      selectedBreakdown: ProjectedLeaderboardAuditBreakdown | null;
    }
  | {
      ok: false;
      message: string;
    };
export type FetchPublicSignupSettingResult =
  | {
      ok: true;
      enabled: boolean;
    }
  | {
      ok: false;
      message: string;
    };
export type UpdatePublicSignupSettingResult = ResetUserAccessResult;
export type FetchRequiredLegalDocumentResult =
  | {
      ok: true;
      document: LegalDocument | null;
    }
  | {
      ok: false;
      message: string;
    };
export type ForceLegalReacceptanceResult = ResetUserAccessResult;
export type ResetTestingSocialStateResult = ResetUserAccessResult;

export type UpsertManagerLimitsInput = {
  userId: string;
  maxGroups: number;
  maxMembersPerGroup: number;
};

export type UpsertManagerLimitsResult =
  | {
      ok: true;
      managerLimits: {
        userId: string;
        maxGroups: number;
        maxMembersPerGroup: number;
      };
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export type RemoveManagerAccessResult = ResetUserAccessResult;
export type UpdateUserDisplayNameResult = ResetUserAccessResult;
export type RepairPendingInviteResult = ResetUserAccessResult;
export type UpdateManagerLimitsResult = UpsertManagerLimitsResult;
export type SeedKnockoutFromGroupStageResult =
  | {
      ok: true;
      seededMatches: number;
      alreadySeeded: boolean;
      forced: boolean;
      message: string;
    }
  | {
      ok: false;
      alreadySeeded?: boolean;
      message: string;
    };

export type KnockoutSeedingStatusResult =
  | { ok: true; status: KnockoutSeedingAdminStatus }
  | { ok: false; message: string };

export type AdminGroupSummary = {
  id: string;
  name: string;
  status: GroupStatus;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  membershipLimit: number;
  memberCount: number;
  activeAccessCodeCount: number;
  pendingInviteCount: number;
  staleInviteCount: number;
  members: Array<{
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    homeTeamId?: string | null;
    role: GroupMemberRole;
    joinedAt: string;
  }>;
};

export type AdminManagerSummary = {
  userId: string;
  name: string;
  email: string;
  maxGroups: number;
  maxMembersPerGroup: number;
  currentGroupsUsed: number;
};

export type FetchAdminGroupsResult =
  | {
      ok: true;
      groups: AdminGroupSummary[];
      managers: AdminManagerSummary[];
    }
  | {
      ok: false;
      message: string;
    };

export type AddUserToGroupInput = {
  userId: string;
  groupId: string;
  role?: GroupMemberRole;
  overrideCapacity?: boolean;
};

export type AddUserToGroupResult = ResetUserAccessResult;
export type RemoveUserFromGroupResult = ResetUserAccessResult;

export type UpdateGroupLimitResult = ResetUserAccessResult;
export type ChangeGroupOwnerResult = ResetUserAccessResult;

export async function createAdminInviteAction(input: CreateInviteInput): Promise<CreateInviteResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedDisplayName = derivePlaceholderDisplayName(normalizedEmail, input.displayName);
  const { data: adminProfile } = await adminSupabase
    .from("users")
    .select("preferred_language")
    .eq("id", adminCheck.userId)
    .maybeSingle();
  const inviteLanguage = normalizeLanguage(
    input.language ??
      ((adminProfile as { preferred_language?: string | null } | null)?.preferred_language ?? null)
  );

  if (!normalizedEmail) {
    return { ok: false, message: "Email is required." };
  }

  const normalizedAccessLevel =
    normalizeAccessLevel(input.accessLevel ?? (input.role === "admin" ? "super_admin" : "player")) ?? "player";
  const inviteRole: UserRole = normalizedAccessLevel === "super_admin" ? "admin" : "player";
  const invitePlanTier: CommercialTier = normalizedAccessLevel === "super_admin" ? "player" : normalizedAccessLevel;

  const [
    { data: existingInvite, error: inviteLookupError },
    { data: existingUser, error: userLookupError },
    authUser
  ] =
    await Promise.all([
      fetchInviteLookup(adminSupabase, normalizedEmail),
      adminSupabase.from("users").select("id,email,name,preferred_language,role,plan_tier").eq("email", normalizedEmail).maybeSingle(),
      findAuthUserByEmail(adminSupabase, normalizedEmail)
    ]);

  if (inviteLookupError) {
    return { ok: false, message: inviteLookupError.message };
  }

  if (userLookupError) {
    return { ok: false, message: userLookupError.message };
  }

  const rateLimitResult = await enforceEmailRateLimits(adminSupabase, adminCheck.userId, normalizedEmail);
  if (!rateLimitResult.ok) {
    return { ok: false, message: rateLimitResult.message };
  }

  if (authUser && existingUser) {
    const existingUserRow = existingUser as {
      id: string;
      email?: string | null;
      name?: string | null;
      preferred_language?: string | null;
      role?: UserRole | null;
      plan_tier?: string | null;
    };
    const currentAccessLevel =
      normalizeAccessLevel(existingUserRow.role === "admin" ? "super_admin" : existingUserRow.plan_tier ?? "player") ?? "player";

    if (existingUserRow.id === adminCheck.userId && currentAccessLevel !== normalizedAccessLevel) {
      return { ok: false, message: "Use a different super admin account before changing your own access level here." };
    }

    if (compareAccessLevels(normalizedAccessLevel, currentAccessLevel) < 0) {
      return {
        ok: false,
        message: `Direct demotion from ${getAccessLevelDisplayLabel(currentAccessLevel)} to ${getAccessLevelDisplayLabel(normalizedAccessLevel)} is handled in the Super Admin Demote / Remove Access workflow on the player card.`
      };
    }

    const { error: updateUserError } = await adminSupabase
      .from("users")
      .update({
        role: inviteRole,
        plan_tier: invitePlanTier,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingUserRow.id);

    if (updateUserError) {
      return { ok: false, message: updateUserError.message };
    }

    const inviteUpsertResult = await upsertInviteRow(adminSupabase, {
      email: normalizedEmail,
      displayName: trimmedDisplayName,
      language: inviteLanguage,
      role: inviteRole,
      planTier: invitePlanTier,
      status: "accepted",
      lastError: null,
      preserveAcceptedAt:
        (existingInvite as InviteLookupRow | null)?.accepted_at ?? new Date().toISOString()
    });

    if (!inviteUpsertResult.ok) {
      return { ok: false, message: inviteUpsertResult.message };
    }

    const loginUrl = buildAccessLevelLoginUrl(inviteLanguage, normalizedAccessLevel);
    try {
      const emailCopy = buildAdminAccessLevelChangeEmailCopy({
        language:
          inviteLanguage ??
          ((existingUserRow.preferred_language ?? null) as string | null),
        recipientLabel: existingUserRow.name?.trim() || normalizedEmail,
        accessLevel: normalizedAccessLevel,
        loginUrl
      });

      await sendTransactionalEmail({
        to: normalizedEmail,
        subject: emailCopy.subject,
        html: emailCopy.html,
        text: emailCopy.text
      });
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : `Could not send the ${getAccessLevelDisplayLabel(normalizedAccessLevel)} access update email.`
      };
    }

    console.info("[admin-player-access-level-updated]", {
      adminUserId: adminCheck.userId,
      targetUserId: existingUserRow.id,
      email: normalizedEmail,
      previousAccessLevel: currentAccessLevel,
      nextAccessLevel: normalizedAccessLevel
    });

    revalidatePath("/admin");
    revalidatePath("/admin/invites");
    revalidatePath("/admin/players");
    revalidatePath("/my-groups");

    return {
      ok: true,
      created: true,
      message:
        currentAccessLevel === normalizedAccessLevel
          ? `${normalizedEmail} already has ${getAccessLevelDisplayLabel(normalizedAccessLevel)} access. A fresh sign-in email was sent.`
          : `${normalizedEmail} is now ${getAccessLevelDisplayLabel(normalizedAccessLevel)}. An access update email was sent.`
    };
  }

  const sendKind: EmailJobKind = authUser && existingUser ? "password_recovery" : "access_email";
  const supportsEmailJobs = await hasEmailJobsTable(adminSupabase);
  const inviteUpsertResult = await upsertInviteRow(adminSupabase, {
    email: normalizedEmail,
    displayName: trimmedDisplayName,
    language: inviteLanguage,
    role: inviteRole,
    planTier: invitePlanTier,
    status: (existingInvite as InviteLookupRow | null)?.accepted_at ? "accepted" : "pending",
    lastError: null,
    preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
  });

  if (!inviteUpsertResult.ok) {
    return { ok: false, message: inviteUpsertResult.message };
  }

  if (!supportsEmailJobs) {
    const sendResult = await sendAdminEmailInline(adminSupabase, {
      kind: sendKind,
      email: normalizedEmail,
      language: inviteLanguage
    });

    if (!sendResult.ok) {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        language: inviteLanguage,
        role: inviteRole,
        planTier: invitePlanTier,
        status: "failed",
        lastError: sendResult.message,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
      });
      return { ok: false, message: sendResult.message };
    }

    if (sendKind === "access_email") {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        language: inviteLanguage,
        role: inviteRole,
        planTier: invitePlanTier,
        status: (existingInvite as InviteLookupRow | null)?.accepted_at ? "accepted" : "pending",
        lastError: null,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at,
        incrementAttempts: true,
        setLastSentAt: true
      });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/invites");
    revalidatePath("/admin/players");
    return {
      ok: true,
      created: true,
      message:
        sendKind === "password_recovery"
          ? "Account already exists. Password reset email sent instead."
          : (existingInvite as InviteLookupRow | null)
            ? "Invite email sent again."
            : "Invite email sent."
    };
  }

  const enqueueResult = await enqueueEmailJob(adminSupabase, {
    kind: sendKind,
    email: normalizedEmail,
    requestedByAdminId: adminCheck.userId,
    payload: {
      displayName: trimmedDisplayName,
      language: inviteLanguage,
      role: inviteRole,
      planTier: invitePlanTier,
      source: "admin_invites"
    }
  });

  if (!enqueueResult.ok && isMissingEmailJobsError(enqueueResult.message)) {
    const sendResult = await sendAdminEmailInline(adminSupabase, {
      kind: sendKind,
      email: normalizedEmail,
      language: inviteLanguage
    });

    if (!sendResult.ok) {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        language: inviteLanguage,
        role: inviteRole,
        planTier: invitePlanTier,
        status: "failed",
        lastError: sendResult.message,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
      });
      return { ok: false, message: sendResult.message };
    }

    if (sendKind === "access_email") {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        language: inviteLanguage,
        role: inviteRole,
        planTier: invitePlanTier,
        status: (existingInvite as InviteLookupRow | null)?.accepted_at ? "accepted" : "pending",
        lastError: null,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at,
        incrementAttempts: true,
        setLastSentAt: true
      });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/invites");
    revalidatePath("/admin/players");
    return {
      ok: true,
      created: true,
      message:
        sendKind === "password_recovery"
          ? "Account already exists. Password reset email sent instead."
          : (existingInvite as InviteLookupRow | null)
            ? "Invite email sent again."
            : "Invite email sent."
    };
  }

  if (!enqueueResult.ok) {
    await upsertInviteRow(adminSupabase, {
      email: normalizedEmail,
      displayName: trimmedDisplayName,
      language: inviteLanguage,
      role: inviteRole,
      planTier: invitePlanTier,
      status: "failed",
      lastError: enqueueResult.message,
      preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at
    });
    return { ok: false, message: enqueueResult.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invites");
  revalidatePath("/admin/players");

  const workerTriggerResult = sendKind === "access_email" ? await triggerEmailWorkerNow() : null;

  return {
    ok: true,
    created: true,
    message:
      enqueueResult.alreadyQueued
        ? "A matching access email is already queued."
        : sendKind === "password_recovery"
          ? "Account already exists. Password recovery email queued instead."
          : (existingInvite as InviteLookupRow | null)
            ? workerTriggerResult?.ok === false
              ? `Access email queued again. Delivery will continue on the worker schedule. ${workerTriggerResult.message}`
              : "Access email queued again."
            : workerTriggerResult?.ok === false
              ? `Invite queued. Delivery will continue on the worker schedule. ${workerTriggerResult.message}`
              : "Invite queued and ready to send."
  };
}

export async function resetUserAccess(input: ResetUserAccessInput): Promise<ResetUserAccessResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const userId = input.userId?.trim();
  const email = input.email?.trim().toLowerCase();

  if (!userId || !email) {
    return { ok: false, message: "A valid user and email are required to reset access." };
  }

  const authUser = await findAuthUserByEmail(adminSupabase, email);
  if (!authUser || authUser.id !== userId) {
    return {
      ok: false,
      message: "This user has not activated their account yet. Resend invite instead."
    };
  }

  const { error: signOutError } = await adminSupabase.auth.admin.signOut(userId);
  if (signOutError) {
    console.warn("Admin reset could not revoke active sessions before sending recovery email.", {
      userId,
      email,
      message: signOutError.message
    });
  }

  const { data: appUser } = await adminSupabase.from("users").select("preferred_language").eq("id", userId).maybeSingle();
  const sendResult = await sendAdminEmailInline(adminSupabase, {
    kind: "password_recovery",
    email,
    language: (appUser as { preferred_language?: string | null } | null)?.preferred_language ?? undefined
  });

  if (!sendResult.ok) {
    return { ok: false, message: sendResult.message };
  }

  revalidatePath("/admin/players");
  return {
    ok: true,
    message: signOutError
      ? `Password reset email sent to ${email}. Active sessions could not be revoked automatically, so the user should use the new reset link to regain access.`
      : `User access reset. A password reset email was sent to ${email}.`
  };
}

export async function repairPendingInviteAction(email: string): Promise<RepairPendingInviteResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, message: "A valid email is required." };
  }

  const adminSupabase = createAdminClient();
  const inviteLookup = await fetchInviteLookup(adminSupabase, normalizedEmail);
  if (inviteLookup.error) {
    return { ok: false, message: inviteLookup.error.message };
  }

  if (!inviteLookup.data) {
    return { ok: false, message: "No pending app invite was found for that email." };
  }

  const authUser = await findAuthUserByEmail(adminSupabase, normalizedEmail);
  if (authUser) {
    return {
      ok: false,
      message: "This user already has a Supabase auth account. Use Reset User Access or ask them to finish confirming their email."
    };
  }

  const repairResult = await createAdminInviteAction({
    email: normalizedEmail,
    accessLevel:
      inviteLookup.data.role === "admin"
        ? "super_admin"
        : inviteLookup.data.plan_tier ?? "player",
    displayName: inviteLookup.data.display_name ?? normalizedEmail.split("@")[0]
  });

  return {
    ok: repairResult.ok,
    message: repairResult.ok ? `Invite repaired for ${normalizedEmail}. ${repairResult.message}` : repairResult.message
  };
}

export async function resendConfirmationOrOnboardingNudgeAction(
  email: string
): Promise<ResendConfirmationNudgeResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, message: "A valid email is required." };
  }

  const adminSupabase = createAdminClient();
  const authUser = await findAuthUserByEmail(adminSupabase, normalizedEmail);
  if (!authUser) {
    return { ok: false, message: "This user does not have a Supabase auth account yet. Use Repair Invite / Resend Invite instead." };
  }

  const { data: appUser, error: appUserError } = await adminSupabase
    .from("users")
    .select("id,name,email,username,needs_profile_setup,preferred_language")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (appUserError) {
    return { ok: false, message: appUserError.message };
  }

  const isConfirmed = Boolean(authUser.emailConfirmedAt);
  const needsProfileSetup = Boolean(appUser?.needs_profile_setup || !appUser?.username?.trim());
  const preferredLanguage = getSafeEmailLanguage(
    (appUser as { preferred_language?: string | null } | null)?.preferred_language ?? null
  );
  const redirectTarget = isConfirmed
    ? appendLanguageToPath("/profile-setup", preferredLanguage)
    : appendLanguageToPath("/login?confirmed=1&flow=invite&mode=signup", preferredLanguage);
  const redirectUrl = new URL("/auth/callback", getPublicSiteUrl());
  redirectUrl.searchParams.set("next", redirectTarget);
  redirectUrl.searchParams.set("lang", preferredLanguage);
  const redirectTo = redirectUrl.toString();
  const { data: linkData, error: linkError } = isConfirmed
    ? await adminSupabase.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo
        }
      })
    : await adminSupabase.auth.admin.generateLink({
        type: "invite",
        email: normalizedEmail,
        options: {
          redirectTo
        }
      });

  if (linkError || !linkData?.properties?.action_link) {
    return { ok: false, message: linkError?.message ?? "Could not generate a fresh auth link for this user." };
  }

  try {
    const emailCopy = buildAdminRecoveryEmailCopy({
      language: preferredLanguage,
      isConfirmed,
      recipientLabel: appUser?.name?.trim() || normalizedEmail,
      email: normalizedEmail,
      actionUrl: linkData.properties.action_link
    });

    await sendTransactionalEmail({
      to: normalizedEmail,
      subject: emailCopy.subject,
      html: emailCopy.html,
      text: emailCopy.text
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send the confirmation/onboarding nudge."
    };
  }

  revalidatePath("/admin/players");
  return {
    ok: true,
    message: isConfirmed
      ? needsProfileSetup
        ? `Onboarding reminder sent to ${normalizedEmail}.`
        : `Sign-in reminder sent to ${normalizedEmail}.`
      : `A fresh confirmation email was sent to ${normalizedEmail}.`
  };
}

export async function resetOnboardingStateAction(userId: string): Promise<ResetOnboardingStateResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { ok: false, message: "A valid user is required." };
  }

  const adminSupabase = createAdminClient();
  const { data: existingUser, error: lookupError } = await adminSupabase
    .from("users")
    .select("id,name,email")
    .eq("id", trimmedUserId)
    .maybeSingle();

  if (lookupError) {
    return { ok: false, message: lookupError.message };
  }

  if (!existingUser) {
    return { ok: false, message: "That app profile could not be found." };
  }

  const { error: updateError } = await adminSupabase
    .from("users")
    .update({
      username: null,
      username_set_at: null,
      needs_profile_setup: true,
      updated_at: new Date().toISOString()
    })
    .eq("id", trimmedUserId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  revalidatePath("/profile-setup");
  revalidatePath("/profile");
  revalidatePath("/admin/players");
  return {
    ok: true,
    message: `Profile setup was reset for ${existingUser.email}. They can choose their username again on the next login.`
  };
}

export async function deleteUserAndStartOverAction(
  email: string,
  confirmationText: string
): Promise<DeleteUserAndStartOverResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, message: "A valid email is required." };
  }

  if (confirmationText.trim().toLowerCase() !== normalizedEmail) {
    return { ok: false, message: `Type ${normalizedEmail} to confirm this destructive reset.` };
  }

  const adminSupabase = createAdminClient();
  const authUser = await findAuthUserByEmail(adminSupabase, normalizedEmail);
  const [
    { data: appUser, error: appUserError },
    inviteCountResult,
    groupInviteCountResult,
    emailJobCountResult
  ] = await Promise.all([
    adminSupabase.from("users").select("id").eq("email", normalizedEmail).maybeSingle(),
    adminSupabase.from("invites").select("email", { count: "exact", head: true }).eq("email", normalizedEmail),
    adminSupabase.from("group_invites").select("id", { count: "exact", head: true }).eq("normalized_email", normalizedEmail),
    adminSupabase.from("email_jobs").select("id", { count: "exact", head: true }).eq("email", normalizedEmail)
  ]);

  if (appUserError) {
    return { ok: false, message: appUserError.message };
  }

  const cleanupSurfaceCount =
    (inviteCountResult.count ?? 0) +
    (groupInviteCountResult.count ?? 0) +
    (emailJobCountResult.count ?? 0);

  const cleanupCountError =
    inviteCountResult.error ?? groupInviteCountResult.error ?? emailJobCountResult.error ?? null;
  if (cleanupCountError) {
    return { ok: false, message: cleanupCountError.message };
  }

  if (!authUser && !appUser && cleanupSurfaceCount === 0) {
    return { ok: false, message: "No auth user, app profile, invite, group invite, or email job was found for that email." };
  }

  if (appUser?.id) {
    const [predictionsResult, bracketPredictionsResult, projectedBracketPredictionsResult, legacyBracketPicksResult, sidePicksResult] = await Promise.all([
      adminSupabase.from("predictions").select("id", { count: "exact", head: true }).eq("user_id", appUser.id),
      countOptionalGameplayRows(adminSupabase, "bracket_predictions", appUser.id),
      countOptionalGameplayRows(adminSupabase, "projected_bracket_predictions", appUser.id),
      countOptionalGameplayRows(adminSupabase, "bracket_picks", appUser.id),
      adminSupabase.from("side_picks").select("id", { count: "exact", head: true }).eq("user_id", appUser.id)
    ]);

    const gameplayCount =
      (predictionsResult.count ?? 0) +
      (bracketPredictionsResult.count ?? 0) +
      (projectedBracketPredictionsResult.count ?? 0) +
      (legacyBracketPicksResult.count ?? 0) +
      (sidePicksResult.count ?? 0);

    if (predictionsResult.error || bracketPredictionsResult.error || projectedBracketPredictionsResult.error || legacyBracketPicksResult.error || sidePicksResult.error) {
      return {
        ok: false,
        message:
          predictionsResult.error?.message ??
          bracketPredictionsResult.error?.message ??
          projectedBracketPredictionsResult.error?.message ??
          legacyBracketPicksResult.error?.message ??
          sidePicksResult.error?.message ??
          "Could not inspect the player's gameplay data."
      };
    }

    if (gameplayCount > 0) {
      return {
        ok: false,
        message: "This user already has gameplay data. To avoid deleting predictions or scores, use the non-destructive recovery actions instead."
      };
    }
  }

  const deleteOperations = await Promise.all([
    adminSupabase.from("group_invites").delete().eq("normalized_email", normalizedEmail),
    adminSupabase.from("invites").delete().eq("email", normalizedEmail),
    adminSupabase.from("email_jobs").delete().eq("email", normalizedEmail),
    appUser?.id
      ? adminSupabase.from("group_members").delete().eq("user_id", appUser.id)
      : Promise.resolve({ error: null }),
    authUser?.id && authUser.id !== appUser?.id
      ? adminSupabase.from("group_members").delete().eq("user_id", authUser.id)
      : Promise.resolve({ error: null })
  ]);

  const failedDelete = deleteOperations.find((result) => result.error);
  if (failedDelete?.error) {
    return { ok: false, message: failedDelete.error.message };
  }

  if (appUser?.id) {
    const { error: deleteProfileError } = await adminSupabase.from("users").delete().eq("id", appUser.id);
    if (deleteProfileError) {
      return { ok: false, message: deleteProfileError.message };
    }
  }

  if (authUser?.id) {
    const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(authUser.id);
    if (deleteAuthError) {
      return { ok: false, message: deleteAuthError.message };
    }
  }

  revalidatePath("/admin/players");
  revalidatePath("/my-groups");
  return {
    ok: true,
    message: `Deleted the auth/invite state for ${normalizedEmail}. The user can now start fresh.`
  };
}

export async function clearUserTestPredictionsAction(
  input: ClearUserTestPredictionsInput
): Promise<ClearUserTestPredictionsResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const trimmedUserId = input.userId.trim();
  if (!trimmedUserId) {
    return { ok: false, message: "A valid user is required." };
  }

  try {
    const trimmedReason = buildRequiredResetReason(input.reason);
    ensureRecoveryActionAllowed("user", "clearUserTestPredictionsAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });

    const adminSupabase = createAdminClient();
    const resetResult = await performClearUserPredictionReset(adminSupabase, {
      targetUserId: trimmedUserId,
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actorTier: "super_admin",
      reason: trimmedReason,
      actionKey: "clear_user_test_predictions",
      expectedEmail: input.expectedEmail
    });
    if (!resetResult.ok) {
      return resetResult;
    }

    revalidatePath("/admin/players");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    revalidatePath("/groups");
    revalidatePath("/knockout");
    revalidatePath("/profile");

    return {
      ok: true,
      affectedPredictionCount: resetResult.affectedCounts.predictions,
      affectedBracketPredictionCount: resetResult.affectedCounts.bracketPredictions,
      affectedProjectedBracketPredictionCount: resetResult.affectedCounts.projectedBracketPredictions,
      affectedLegacyBracketPickCount: resetResult.affectedCounts.legacyBracketPicks,
      affectedBracketScoreCount: resetResult.affectedCounts.bracketScores,
      affectedPredictionScoreCount: resetResult.affectedCounts.predictionScores,
      affectedLeaderboardEventCount: resetResult.affectedCounts.leaderboardEvents,
      affectedLeaderboardSnapshotCount: resetResult.affectedCounts.leaderboardSnapshots,
      message: resetResult.message
    };
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Could not clear that user's test data.") };
  }
}

export async function clearCurrentUserTestPredictionsAction(
  input: SelfServiceClearCurrentUserTestPredictionsInput
): Promise<ClearUserTestPredictionsResult> {
  if (!isSelfServiceTestResetEnabled()) {
    return { ok: false, message: "Testing reset tools are not enabled right now." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to clear your test predictions." };
  }

  if (!input.acknowledged) {
    return { ok: false, message: "Confirm that you understand this will clear your saved test predictions." };
  }

  if (input.confirmationText.trim().toUpperCase() !== "RESET MY PICKS") {
    return { ok: false, message: "Type RESET MY PICKS to confirm." };
  }

  try {
    const adminSupabase = createAdminClient();
    const { data: profile, error: profileError } = await adminSupabase
      .from("users")
      .select("id,email,role,plan_tier")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return { ok: false, message: profileError.message };
    }

    if (!profile) {
      return { ok: false, message: "Your player profile could not be found." };
    }

    const tierAccess = resolveTierAccess({
      role: profile.role,
      planTier: profile.plan_tier ?? null,
      managerLimits: null
    });
    if (tierAccess.accessLevel === "player") {
      return { ok: false, message: "Only Captain tier and above can use this testing reset." };
    }

    const trimmedReason = buildRequiredResetReason(input.reason);
    const resetResult = await performClearUserPredictionReset(adminSupabase, {
      targetUserId: profile.id,
      actorUserId: profile.id,
      actorEmail: profile.email ?? user.email ?? null,
      actorTier: tierAccess.accessLevel,
      reason: trimmedReason,
      actionKey: "self_service_prediction_reset"
    });
    if (!resetResult.ok) {
      return resetResult;
    }

    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    revalidatePath("/groups");
    revalidatePath("/knockout");
    revalidatePath("/profile");

    return {
      ok: true,
      affectedPredictionCount: resetResult.affectedCounts.predictions,
      affectedBracketPredictionCount: resetResult.affectedCounts.bracketPredictions,
      affectedProjectedBracketPredictionCount: resetResult.affectedCounts.projectedBracketPredictions,
      affectedLegacyBracketPickCount: resetResult.affectedCounts.legacyBracketPicks,
      affectedBracketScoreCount: resetResult.affectedCounts.bracketScores,
      affectedPredictionScoreCount: resetResult.affectedCounts.predictionScores,
      affectedLeaderboardEventCount: resetResult.affectedCounts.leaderboardEvents,
      affectedLeaderboardSnapshotCount: resetResult.affectedCounts.leaderboardSnapshots,
      message: "Your test predictions were cleared."
    };
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Could not clear your test predictions. Please try again.") };
  }
}

export async function resetGroupLocalDerivedStateAction(
  input: ResetGroupLocalStateInput
): Promise<ResetGroupLocalStateResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const trimmedGroupId = input.groupId.trim();
  if (!trimmedGroupId) {
    return { ok: false, message: "A valid group is required." };
  }

  try {
    const trimmedReason = buildRequiredResetReason(input.reason);
    ensureRecoveryActionAllowed("group", "resetGroupLocalDerivedStateAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });

    const adminSupabase = createAdminClient();
    const { data: groupRow, error: groupError } = await adminSupabase
      .from("groups")
      .select("id,name")
      .eq("id", trimmedGroupId)
      .maybeSingle();

    if (groupError) {
      return { ok: false, message: groupError.message };
    }

    if (!groupRow) {
      return { ok: false, message: "That group was not found." };
    }

    if (groupRow.name.trim().toLowerCase() !== input.expectedGroupName.trim().toLowerCase()) {
      return { ok: false, message: `Type ${groupRow.name} to confirm this group reset.` };
    }

    const [
      leaderboardEventsResult,
      leaderboardSnapshotsResult,
      groupBonusScoresResult,
      sidePickScoresResult
    ] = await Promise.all([
      adminSupabase.from("leaderboard_events").select("id", { count: "exact", head: true }).eq("group_id", trimmedGroupId),
      adminSupabase.from("leaderboard_snapshots").select("id", { count: "exact", head: true }).eq("group_id", trimmedGroupId),
      adminSupabase.from("group_bonus_scores").select("group_id", { count: "exact", head: true }).eq("group_id", trimmedGroupId),
      adminSupabase.from("side_pick_scores").select("group_id", { count: "exact", head: true }).eq("group_id", trimmedGroupId)
    ]);

    const deletionResults = await Promise.all([
      adminSupabase.from("leaderboard_events").delete().eq("group_id", trimmedGroupId),
      adminSupabase.from("leaderboard_snapshots").delete().eq("group_id", trimmedGroupId),
      adminSupabase.from("group_bonus_scores").delete().eq("group_id", trimmedGroupId),
      adminSupabase.from("side_pick_scores").delete().eq("group_id", trimmedGroupId)
    ]);

    const failedDeletion = deletionResults.find((result) => result.error && !isMissingRelationError(result.error.message, "public.side_pick_scores"));
    if (failedDeletion?.error) {
      return { ok: false, message: failedDeletion.error.message };
    }

    const leaderboardResult = await recalculateLeaderboard(adminSupabase);
    if (!leaderboardResult.ok) {
      return leaderboardResult;
    }

    const resetMarkerWarning = await bumpDashboardUiResetEpoch("group-local reset");
    await writeAdminResetAuditLog(adminSupabase, {
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actionKey: "reset_group_local_state",
      scope: "group",
      reason: trimmedReason,
      success: true,
      targetIds: [trimmedGroupId],
      affectedCounts: {
        leaderboardEvents: leaderboardEventsResult.count ?? 0,
        leaderboardSnapshots: leaderboardSnapshotsResult.count ?? 0,
        groupBonusScores: groupBonusScoresResult.count ?? 0,
        sidePickScores: sidePickScoresResult.count ?? 0
      }
    });

    revalidatePath("/admin/groups");
    revalidatePath("/my-groups");
    revalidatePath("/leaderboard");
    revalidatePath("/groups");

    return {
      ok: true,
      clearedLeaderboardEvents: leaderboardEventsResult.count ?? 0,
      clearedLeaderboardSnapshots: leaderboardSnapshotsResult.count ?? 0,
      clearedGroupBonusScores: groupBonusScoresResult.count ?? 0,
      clearedSidePickScores: sidePickScoresResult.count ?? 0,
      message: resetMarkerWarning
        ? `Cleared ${groupRow.name}'s local derived state and rebuilt leaderboard data. ${resetMarkerWarning}`
        : `Cleared ${groupRow.name}'s local derived state and rebuilt leaderboard data.`
    };
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Could not reset that group's local state.") };
  }
}

export async function resetMatchToOpenAction(
  input: ResetMatchToOpenInput
): Promise<ResetMatchToOpenResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const trimmedMatchId = input.matchId.trim();
  if (!trimmedMatchId) {
    return { ok: false, message: "A valid match is required." };
  }

  try {
    const trimmedReason = buildRequiredResetReason(input.reason);
    ensureRecoveryActionAllowed("match", "resetMatchToOpenAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });

    if (input.expectedMatchId.trim() !== trimmedMatchId) {
      return { ok: false, message: `Type ${trimmedMatchId} to confirm this match reset.` };
    }

    const adminSupabase = createAdminClient();
    const { data: matchRow, error: matchError } = await adminSupabase
      .from("matches")
      .select("id,stage,status,home_team_id,away_team_id,home_score,away_score,winner_team_id,finalized_at,is_manual_override")
      .eq("id", trimmedMatchId)
      .maybeSingle();

    if (matchError) {
      return { ok: false, message: matchError.message };
    }

    if (!matchRow) {
      return { ok: false, message: "That match was not found." };
    }

    const [
      predictionScoresResult,
      bracketScoresResult,
      leaderboardEventsResult,
      leaderboardSnapshotsResult
    ] = await Promise.all([
      adminSupabase.from("prediction_scores").select("prediction_id", { count: "exact", head: true }).eq("match_id", trimmedMatchId),
      adminSupabase.from("bracket_scores").select("id", { count: "exact", head: true }).eq("match_id", trimmedMatchId),
      adminSupabase.from("leaderboard_events").select("id", { count: "exact", head: true }).eq("match_id", trimmedMatchId),
      adminSupabase.from("leaderboard_snapshots").select("id", { count: "exact", head: true }).eq("match_id", trimmedMatchId)
    ]);

    const updateResult = await adminSupabase
      .from("matches")
      .update({
        status: "scheduled",
        home_score: null,
        away_score: null,
        winner_team_id: null,
        finalized_at: null,
        last_synced_at: null,
        is_manual_override: false,
        sync_status: null,
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", trimmedMatchId);

    if (updateResult.error && !isOptionalResetColumnError(updateResult.error.message)) {
      return { ok: false, message: updateResult.error.message };
    }

    if (updateResult.error) {
      const fallbackUpdate = await adminSupabase
        .from("matches")
        .update({
          status: "scheduled",
          home_score: null,
          away_score: null,
          winner_team_id: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", trimmedMatchId);
      if (fallbackUpdate.error) {
        return { ok: false, message: fallbackUpdate.error.message };
      }
    }

    let clearedDownstreamPredictions = 0;
    if ((matchRow as MatchRow).stage === "group") {
      const resetResult = await clearDerivedGroupMatchScoringState(adminSupabase, trimmedMatchId);
      if (!resetResult.ok) {
        return resetResult;
      }
    } else {
      await resetKnockoutMatchScoring(trimmedMatchId);
      const advancementSummary = await rebuildKnockoutAdvancementSharedWithClient(adminSupabase);
      clearedDownstreamPredictions = advancementSummary.clearedPredictions;
      const leaderboardResult = await recalculateLeaderboard(adminSupabase);
      if (!leaderboardResult.ok) {
        return leaderboardResult;
      }
    }

    await appendMatchEvent(adminSupabase, {
      matchId: trimmedMatchId,
      eventType: "reopen",
      payload: {
        source: "admin-reset-to-open",
        actorUserId: superAdminCheck.userId,
        previousStatus: (matchRow as MatchRow).status,
        nextStatus: "scheduled"
      }
    });

    const resetMarkerWarning = await bumpDashboardUiResetEpoch("match reset");
    await writeAdminResetAuditLog(adminSupabase, {
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actionKey: "reset_match_to_open",
      scope: "match",
      reason: trimmedReason,
      success: true,
      targetIds: [trimmedMatchId],
      affectedCounts: {
        predictionScores: predictionScoresResult.count ?? 0,
        bracketScores: bracketScoresResult.count ?? 0,
        leaderboardEvents: leaderboardEventsResult.count ?? 0,
        leaderboardSnapshots: leaderboardSnapshotsResult.count ?? 0,
        clearedDownstreamPredictions
      }
    });

    revalidatePath("/admin/matches");
    revalidatePath("/dashboard");
    revalidatePath("/groups");
    revalidatePath("/knockout");
    revalidatePath("/leaderboard");
    revalidatePath("/profile");

    return {
      ok: true,
      clearedPredictionScores: predictionScoresResult.count ?? 0,
      clearedBracketScores: bracketScoresResult.count ?? 0,
      clearedLeaderboardEvents: leaderboardEventsResult.count ?? 0,
      clearedLeaderboardSnapshots: leaderboardSnapshotsResult.count ?? 0,
      clearedDownstreamPredictions,
      message: resetMarkerWarning
        ? `Reset match ${trimmedMatchId} to open and repaired derived state. ${resetMarkerWarning}`
        : `Reset match ${trimmedMatchId} to open and repaired derived state.`
    };
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Could not reset that match to open.") };
  }
}

export async function repairLeaderboardStateAction(
  input: RepairLeaderboardStateInput
): Promise<RepairLeaderboardStateResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  try {
    const trimmedReason = buildRequiredResetReason(input.reason);
    ensureRecoveryActionAllowed("leaderboard", "repairLeaderboardStateAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });

    const adminSupabase = createAdminClient();
    const leaderboardResult = await recalculateLeaderboard(adminSupabase);
    if (!leaderboardResult.ok) {
      return leaderboardResult;
    }

    const resetMarkerWarning = await bumpDashboardUiResetEpoch("leaderboard repair");
    await writeAdminResetAuditLog(adminSupabase, {
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actionKey: "repair_leaderboards",
      scope: "leaderboard",
      reason: trimmedReason,
      success: true,
      targetIds: [],
      affectedCounts: {}
    });

    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");
    revalidatePath("/groups");
    revalidatePath("/knockout");
    revalidatePath("/my-groups");

    return {
      ok: true,
      message: resetMarkerWarning
        ? `Rebuilt leaderboard snapshots from persisted scores. ${resetMarkerWarning}`
        : "Rebuilt leaderboard snapshots from persisted scores."
    };
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Could not repair leaderboard state.") };
  }
}

export async function fetchAdminPlayerHealthAction(): Promise<FetchAdminPlayerHealthResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const players = await fetchAdminPlayerHealthRows();
    return { ok: true, players };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load admin player health right now."
    };
  }
}

export async function getUserDemotionImpactAction(
  userId: string,
  targetAccessLevel: AccessLevel
): Promise<FetchUserDemotionImpactResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const adminSupabase = createAdminClient();
    const impact = await buildUserDemotionImpact(adminSupabase, userId, targetAccessLevel);
    return { ok: true, impact };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not inspect the impact of that demotion."
    };
  }
}

export async function updateUserCommercialTierAction(
  input: UpdateUserCommercialTierInput
): Promise<UpdateUserCommercialTierResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const trimmedUserId = input.userId.trim();
  const targetAccessLevel = normalizeAccessLevel(input.targetAccessLevel);

  if (!trimmedUserId) {
    return { ok: false, message: "A valid user is required." };
  }

  if (!targetAccessLevel || targetAccessLevel === "super_admin") {
    return { ok: false, message: "Choose a commercial tier. Super Admin is not assigned from the Users quick tier control." };
  }

  const targetPlanTier = normalizeCommercialTier(targetAccessLevel);
  if (!targetPlanTier) {
    return { ok: false, message: "Choose a valid commercial tier." };
  }

  const adminSupabase = createAdminClient();

  try {
    const { data: existingUser, error: existingUserError } = await adminSupabase
      .from("users")
      .select("id,email,name,preferred_language,role,plan_tier")
      .eq("id", trimmedUserId)
      .maybeSingle();

    if (existingUserError) {
      return { ok: false, message: existingUserError.message };
    }

    if (!existingUser) {
      return { ok: false, message: "That user was not found." };
    }

    const existingUserRow = existingUser as {
      id: string;
      email?: string | null;
      name?: string | null;
      preferred_language?: string | null;
      role?: UserRole | null;
      plan_tier?: string | null;
    };
    const { data: existingInvite, error: inviteLookupError } = existingUserRow.email
      ? await fetchInviteLookup(adminSupabase, existingUserRow.email)
      : { data: null, error: null };

    if (inviteLookupError) {
      return { ok: false, message: inviteLookupError.message };
    }

    const currentAccessLevel =
      normalizeAccessLevel(existingUserRow.role === "admin" ? "super_admin" : existingUserRow.plan_tier ?? "player") ?? "player";

    if (existingUserRow.id === adminCheck.userId && currentAccessLevel !== targetAccessLevel) {
      return { ok: false, message: "Use a different super admin account before changing your own access level here." };
    }

    if (currentAccessLevel === "super_admin") {
      return { ok: false, message: "Super Admin access cannot be changed from the Users quick tier control." };
    }

    if (compareAccessLevels(targetAccessLevel, currentAccessLevel) < 0) {
      return {
        ok: false,
        message: `Use the Demote / Remove Access review before lowering ${existingUserRow.email ?? "this user"} from ${getAccessLevelDisplayLabel(currentAccessLevel)} to ${getAccessLevelDisplayLabel(targetAccessLevel)}.`
      };
    }

    if (currentAccessLevel === targetAccessLevel) {
      return { ok: true, message: `${existingUserRow.email ?? "This user"} already has ${getAccessLevelDisplayLabel(targetAccessLevel)} access.` };
    }

    const { error: updateUserError } = await adminSupabase
      .from("users")
      .update({
        role: "player" as UserRole,
        plan_tier: targetPlanTier,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingUserRow.id);

    if (updateUserError) {
      return { ok: false, message: updateUserError.message };
    }

    if (existingUserRow.email) {
      const inviteUpsertResult = await upsertInviteRow(adminSupabase, {
        email: existingUserRow.email,
        displayName: existingUserRow.name?.trim() || existingUserRow.email,
        language: normalizeLanguage(existingUserRow.preferred_language),
        role: "player",
        planTier: targetPlanTier,
        status: "accepted",
        lastError: null,
        preserveAcceptedAt: (existingInvite as InviteLookupRow | null)?.accepted_at ?? new Date().toISOString()
      });

      if (!inviteUpsertResult.ok) {
        return { ok: false, message: inviteUpsertResult.message };
      }
    }

    await writeAdminQuickTierChangeAuditLog(adminSupabase, {
      actorUserId: adminCheck.userId,
      targetUserId: existingUserRow.id,
      targetEmail: existingUserRow.email ?? "unknown",
      previousRole: (existingUserRow.role ?? "player") as UserRole,
      previousPlanTier: normalizeCommercialTier(existingUserRow.plan_tier ?? null),
      previousAccessLevel: currentAccessLevel,
      newPlanTier: targetPlanTier,
      newAccessLevel: targetAccessLevel
    });

    console.info("[admin-player-quick-tier-updated]", {
      actorUserId: adminCheck.userId,
      targetUserId: existingUserRow.id,
      email: existingUserRow.email,
      previousAccessLevel: currentAccessLevel,
      nextAccessLevel: targetAccessLevel
    });

    revalidatePath("/admin");
    revalidatePath("/admin/invites");
    revalidatePath("/admin/players");
    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message: `${existingUserRow.name?.trim() || existingUserRow.email || "User"} is now ${getAccessLevelDisplayLabel(targetAccessLevel)}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update that user's tier."
    };
  }
}

export async function demoteUserWithImpactResolutionAction(
  input: DemoteUserWithImpactResolutionInput
): Promise<DemoteUserWithImpactResolutionResult> {
  return applyAccessChangeWithImpactResolution(input, "demote_access");
}

async function applyAccessChangeWithImpactResolution(
  input: DemoteUserWithImpactResolutionInput,
  action: "demote_access" | "deactivate_organizer_access"
): Promise<DemoteUserWithImpactResolutionResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const trimmedUserId = input.userId.trim();
  const normalizedExpectedEmail = input.expectedEmail.trim().toLowerCase();
  const trimmedReason = input.reason.trim();

  if (!trimmedUserId) {
    return { ok: false, message: "A valid user is required." };
  }

  if (!trimmedReason) {
    return { ok: false, message: "A reason is required before changing organizer access." };
  }

  if (input.targetAccessLevel === "super_admin") {
    return { ok: false, message: "Use promotion/access setup to grant Super Admin. Demotion flow cannot target Super Admin." };
  }

  const adminSupabase = createAdminClient();

  try {
    const impact = await buildUserDemotionImpact(adminSupabase, trimmedUserId, input.targetAccessLevel);

    if (impact.userId === adminCheck.userId) {
      return { ok: false, message: "Use a different super admin account before changing your own access level here." };
    }

    if (compareAccessLevels(impact.targetAccessLevel, impact.currentAccessLevel) >= 0) {
      return {
        ok: false,
        message: `This workflow is for demotions only. ${getAccessLevelDisplayLabel(impact.targetAccessLevel)} is not lower than ${getAccessLevelDisplayLabel(impact.currentAccessLevel)}.`
      };
    }

    if (impact.status === "blocked") {
      return {
        ok: false,
        message: impact.blockers[0] ?? "Resolve the listed blockers before changing this user's organizer access."
      };
    }

    if (normalizedExpectedEmail !== impact.email.trim().toLowerCase()) {
      return { ok: false, message: `Type ${impact.email} to confirm this access change.` };
    }

    const resolutionPlan = input.resolutionPlan ?? {};
    const resolutionPlanError = validateDemotionResolutionPlan(impact, resolutionPlan);
    if (resolutionPlanError) {
      return { ok: false, message: resolutionPlanError };
    }

    // Standard player participation should survive organizer access changes whenever possible.
    const cleanupSummary = await applyOrganizerAccessCleanup(adminSupabase, impact, resolutionPlan);

    const { error: updateUserError } = await adminSupabase
      .from("users")
      .update({
        role: impact.targetRole,
        plan_tier: impact.targetPlanTier,
        updated_at: new Date().toISOString()
      })
      .eq("id", impact.userId);

    if (updateUserError) {
      return { ok: false, message: updateUserError.message };
    }

    const inviteUpsertResult = await upsertInviteRow(adminSupabase, {
      email: impact.email,
      displayName: impact.displayName,
      language: "en",
      role: impact.targetRole,
      planTier: impact.targetPlanTier,
      status: "accepted",
      lastError: null,
      preserveAcceptedAt: new Date().toISOString()
    });

    if (!inviteUpsertResult.ok) {
      return { ok: false, message: inviteUpsertResult.message };
    }

    await sendAccessLevelChangeEmail(adminSupabase, impact, impact.targetAccessLevel);
    await writeAdminAccessChangeAuditLog(adminSupabase, {
      actorUserId: adminCheck.userId,
      targetUserId: impact.userId,
      targetEmail: impact.email,
      action,
      previousRole: impact.currentRole,
      previousPlanTier: impact.currentPlanTier,
      previousAccessLevel: impact.currentAccessLevel,
      newRole: impact.targetRole,
      newPlanTier: impact.targetPlanTier,
      newAccessLevel: impact.targetAccessLevel,
      impact,
      cleanupActionsTaken: cleanupSummary.actionsTaken,
      cleanupCounts: cleanupSummary.counts,
      reason: trimmedReason
    });

    console.info("[admin-player-access-demoted]", {
      actorUserId: adminCheck.userId,
      targetUserId: impact.userId,
      email: impact.email,
      previousRole: impact.currentRole,
      previousPlanTier: impact.currentPlanTier,
      previousAccessLevel: impact.currentAccessLevel,
      newRole: impact.targetRole,
      newPlanTier: impact.targetPlanTier,
      newAccessLevel: impact.targetAccessLevel,
      impactStatus: impact.status,
      impactSummary: {
        ownedGroupCount: impact.ownedGroupCount,
        managedGroupCount: impact.managedGroupCount,
        activeInviteCodeCount: impact.activeInviteCodeCount,
        pendingInviteCount: impact.pendingInviteCount,
        organizationOwnershipCount: impact.organizationOwnershipCount,
        organizationBrandingCount: impact.organizationBrandingCount,
        hasManagerLimits: impact.hasManagerLimits
      },
      cleanupActionsTaken: cleanupSummary.actionsTaken,
      cleanupCounts: cleanupSummary.counts,
      reason: trimmedReason
    });

    revalidatePath("/admin");
    revalidatePath("/admin/invites");
    revalidatePath("/admin/players");
    revalidatePath("/my-groups");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message:
        action === "deactivate_organizer_access"
          ? `Organizer access was removed for ${impact.displayName} while preserving player access where possible.`
          : `${impact.displayName}'s access was changed from ${getAccessLevelDisplayLabel(impact.currentAccessLevel)} to ${getAccessLevelDisplayLabel(impact.targetAccessLevel)}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not apply that demotion safely."
    };
  }
}

export async function deactivateOrganizerAccessAction(
  input: DeactivateOrganizerAccessInput
): Promise<DeactivateOrganizerAccessResult> {
  return applyAccessChangeWithImpactResolution({
    userId: input.userId,
    expectedEmail: input.expectedEmail,
    reason: input.reason,
    targetAccessLevel: "player",
    resolutionPlan: input.resolutionPlan
  }, "deactivate_organizer_access");
}

export async function fetchLeaderboardFeatureSettingsAction(): Promise<FetchLeaderboardFeatureSettingsResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const settings = await fetchLeaderboardFeatureSettings();
    return { ok: true, settings };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load leaderboard feature settings."
    };
  }
}

export async function updateLeaderboardFeatureSettingAction(
  key: LeaderboardFeatureSettingKey,
  enabled: boolean
): Promise<UpdateLeaderboardFeatureSettingResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    await updateLeaderboardFeatureSetting(key, enabled);
    revalidatePath("/leaderboard");
    revalidatePath("/admin/players");
    return {
      ok: true,
      message: `${formatLeaderboardFeatureSettingLabel(key)} ${enabled ? "enabled" : "disabled"}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update leaderboard feature settings."
    };
  }
}

export async function fetchProjectedLeaderboardAuditAction(input?: {
  selectedUserId?: string | null;
  limit?: number;
}): Promise<FetchProjectedLeaderboardAuditResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const audit = await fetchProjectedLeaderboardAudit(input);
    return {
      ok: true,
      projectionKey: audit.projectionKey,
      generatedAt: audit.generatedAt,
      topRows: audit.topRows,
      selectedRow: audit.selectedRow,
      selectedBreakdown: audit.selectedBreakdown
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load the projected leaderboard audit."
    };
  }
}

export async function fetchPublicSignupSettingAction(): Promise<FetchPublicSignupSettingResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const enabled = await fetchBooleanAppSetting(PUBLIC_PLAYER_SIGNUP_ENABLED_KEY, true);
    return { ok: true, enabled };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load public signup settings."
    };
  }
}

export async function updatePublicSignupSettingAction(enabled: boolean): Promise<UpdatePublicSignupSettingResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    await updateBooleanAppSetting(PUBLIC_PLAYER_SIGNUP_ENABLED_KEY, enabled);
    revalidatePath("/login");
    revalidatePath("/admin/players");
    return {
      ok: true,
      message: `Public Player signup ${enabled ? "enabled" : "disabled"}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update public signup settings."
    };
  }
}

export async function fetchRequiredLegalDocumentAction(
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE,
  language = "en"
): Promise<FetchRequiredLegalDocumentResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const document = await getRequiredLegalDocument(documentType, language);
    return { ok: true, document };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load the current legal document."
    };
  }
}

export async function forceLegalReacceptanceAction(
  documentType: string,
  language: string,
  newRequiredVersion: string,
  newTitle?: string,
  newBody?: string
): Promise<ForceLegalReacceptanceResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const normalizedDocumentType = documentType.trim().toLowerCase();
  const normalizedLanguage = language.trim().toLowerCase();
  const normalizedVersion = newRequiredVersion.trim();
  const normalizedTitle = newTitle?.trim() ?? "";
  const normalizedBody = newBody?.trim() ?? "";

  if (!normalizedDocumentType) {
    return { ok: false, message: "A legal document type is required." };
  }

  if (!normalizedLanguage) {
    return { ok: false, message: "A legal document language is required." };
  }

  if (!normalizedVersion) {
    return { ok: false, message: "A required version is required." };
  }

  if (!normalizedTitle) {
    return { ok: false, message: "A title is required." };
  }

  if (!normalizedBody) {
    return { ok: false, message: "Body text is required." };
  }

  try {
    await upsertRequiredLegalDocument({
      documentType: normalizedDocumentType,
      language: normalizedLanguage,
      requiredVersion: normalizedVersion,
      title: normalizedTitle,
      body: normalizedBody,
      isActive: true
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not update the required legal document."
    };
  }

  const adminSupabase = createAdminClient();
  const { data: userProfiles } = await adminSupabase.from("users").select("id,preferred_language");
  let revokedUsers = 0;
  let revokeFailed = false;
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      revokeFailed = true;
      break;
    }

    const users = data?.users ?? [];
    if (users.length === 0) {
      break;
    }

    for (const authUser of users) {
      const matchedProfile = ((userProfiles as Array<{ id: string; preferred_language?: string | null }> | null) ?? []).find(
        (profile) => profile.id === authUser.id
      );
      const preferredLanguage = (matchedProfile?.preferred_language ?? "en").trim().toLowerCase();
      const shouldRevoke =
        normalizedLanguage === "en"
          ? preferredLanguage === "en" || !["en", "es"].includes(preferredLanguage)
          : preferredLanguage === normalizedLanguage;

      if (!shouldRevoke) {
        continue;
      }

      try {
        // Supabase Admin session revocation support can vary by SDK version and backend behavior.
        // Even if this call fails, the server-side legal gate still blocks normal app usage until
        // the user accepts the new required version.
        const { error: signOutError } = await adminSupabase.auth.admin.signOut(authUser.id);
        if (signOutError) {
          revokeFailed = true;
          continue;
        }

        revokedUsers += 1;
      } catch {
        revokeFailed = true;
      }
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  revalidatePath("/admin/players");
  revalidatePath("/profile");
  revalidatePath("/legal/accept");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/my-groups");
  revalidatePath("/leaderboard");

  return {
    ok: true,
    message: revokeFailed
      ? `Required ${normalizedDocumentType.toUpperCase()} version ${normalizedVersion}. Some sessions could not be revoked automatically, but the server-side legal gate will still require re-acceptance.`
      : `Required ${normalizedDocumentType.toUpperCase()} version ${normalizedVersion} and revoked ${revokedUsers} active session${revokedUsers === 1 ? "" : "s"}.`
  };
}

export async function resetTestingSocialStateAction(): Promise<ResetTestingSocialStateResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const clearedCounts = await clearTestingSocialStateWithClient(adminSupabase);
  const resetMarkerWarning = await bumpDashboardUiResetEpoch("testing social reset");
  const socialResetMarkerWarning = await bumpLeaderboardSocialResetTimestamp("testing social reset");
  await writeAdminResetAuditLog(adminSupabase, {
    actorUserId: adminCheck.userId,
    actorEmail: null,
    actionKey: "reset_testing_social_state",
    scope: "social",
    reason: "Clear testing social state",
    success: true,
    targetIds: [],
    affectedCounts: clearedCounts,
    details: {
      preserves: ADMIN_RESET_TOOL_DEFINITIONS.reset_testing_social_state.preserves
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/my-groups");
  revalidatePath("/profile");
  revalidatePath("/trophies");
  revalidatePath("/admin/players");

  return {
    ok: true,
    message:
      [resetMarkerWarning, socialResetMarkerWarning]
        .filter(Boolean)
        .reduce<string>(
          (message, warning) => `${message} ${warning}`,
          "Testing notifications, leaderboard events, trophies, perfect-pick activity, and movement history were cleared."
        )
  };
}

export async function clearBracketBuilderSnapshotsAction(
  input: ResetTestingDataInput
): Promise<ClearBracketBuilderSnapshotDataResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  if (input.confirmationText !== "CLEAR EASY BRACKET SNAPSHOTS" || input.scope !== "bracket-builder-only") {
    return { ok: false, message: "Easy Bracket snapshot reset confirmation did not match. No data was changed." };
  }

  try {
    buildRequiredResetReason(input.reason ?? "Clear Easy Bracket snapshot data");
    ensureRecoveryActionAllowed("bracket_builder", "clearBracketBuilderSnapshotsAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });
  } catch (error) {
    return {
      ok: false,
      message: buildAdminActionErrorMessage(error, "Easy Bracket snapshot reset is disabled in this environment.")
    };
  }

  const adminSupabase = createAdminClient();

  try {
    const [groupSeedRankingsResult, bestThirdRankingsResult] = await Promise.all([
      countWholeTableRows(adminSupabase, "user_group_seed_rankings"),
      countWholeTableRows(adminSupabase, "user_best_third_rankings")
    ]);

    const [deleteGroupSeedRankingsResult, deleteBestThirdRankingsResult] = await Promise.all([
      deleteWholeTableRowsOptional(adminSupabase, "user_group_seed_rankings"),
      deleteWholeTableRowsOptional(adminSupabase, "user_best_third_rankings")
    ]);

    const failedDeletion = [deleteGroupSeedRankingsResult, deleteBestThirdRankingsResult].find((result) => result.error);
    if (failedDeletion?.error) {
      return { ok: false, message: failedDeletion.error.message };
    }

    const resetMarkerWarning = await bumpDashboardUiResetEpoch("easy bracket snapshot reset");

    await writeAdminResetAuditLog(adminSupabase, {
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actionKey: "clear_bracket_builder_snapshots",
      scope: "bracket_builder",
      reason: input.reason?.trim() || "Clear Easy Bracket snapshot data",
      success: true,
      targetIds: [],
      affectedCounts: {
        groupSeedRankings: groupSeedRankingsResult.count ?? 0,
        bestThirdRankings: bestThirdRankingsResult.count ?? 0
      },
      details: {
        preserves: ADMIN_RESET_TOOL_DEFINITIONS.clear_bracket_builder_snapshots.preserves
      }
    });

    revalidatePath("/bracket-builder");
    revalidatePath("/knockout");
    revalidatePath("/dashboard");
    revalidatePath("/groups");
    revalidatePath("/admin/matches");

    return {
      ok: true,
      deletedGroupSeedRankings: groupSeedRankingsResult.count ?? 0,
      deletedBestThirdRankings: bestThirdRankingsResult.count ?? 0,
      message: [
        `Easy Bracket snapshots were cleared. Removed ${groupSeedRankingsResult.count ?? 0} group seed rankings and ${bestThirdRankingsResult.count ?? 0} best-third selections.`,
        resetMarkerWarning
      ]
        .filter(Boolean)
        .join(" ")
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

async function clearTestingSocialStateWithClient(
  adminSupabase: ReturnType<typeof createAdminClient>
) {
  const [
    commentsCountResult,
    reactionsCountResult,
    notificationsCountResult,
    leaderboardEventsCountResult,
    userTrophiesCountResult,
    leaderboardSnapshotsCountResult
  ] = await Promise.all([
    countWholeTableRows(adminSupabase, "leaderboard_event_comments"),
    countWholeTableRows(adminSupabase, "leaderboard_event_reactions"),
    countWholeTableRows(adminSupabase, "user_notifications"),
    countWholeTableRows(adminSupabase, "leaderboard_events"),
    countWholeTableRows(adminSupabase, "user_trophies"),
    countWholeTableRows(adminSupabase, "leaderboard_snapshots")
  ]);

  const deleteCommentsResult = await adminSupabase
    .from("leaderboard_event_comments")
    .delete()
    .not("id", "is", null);
  if (deleteCommentsResult.error && !isMissingSocialResetTableError(deleteCommentsResult.error.message)) {
    throw new Error(deleteCommentsResult.error.message);
  }

  const deleteReactionsResult = await adminSupabase
    .from("leaderboard_event_reactions")
    .delete()
    .not("id", "is", null);
  if (deleteReactionsResult.error && !isMissingSocialResetTableError(deleteReactionsResult.error.message)) {
    throw new Error(deleteReactionsResult.error.message);
  }

  const deleteNotificationsResult = await adminSupabase
    .from("user_notifications")
    .delete()
    .not("id", "is", null);
  if (deleteNotificationsResult.error && !isMissingSocialResetTableError(deleteNotificationsResult.error.message)) {
    throw new Error(deleteNotificationsResult.error.message);
  }

  const deleteLeaderboardEventsResult = await adminSupabase
    .from("leaderboard_events")
    .delete()
    .not("id", "is", null);
  if (
    deleteLeaderboardEventsResult.error &&
    !isMissingSocialResetTableError(deleteLeaderboardEventsResult.error.message)
  ) {
    throw new Error(deleteLeaderboardEventsResult.error.message);
  }

  const deleteUserTrophiesResult = await adminSupabase
    .from("user_trophies")
    .delete()
    .not("id", "is", null);
  if (deleteUserTrophiesResult.error && !isMissingSocialResetTableError(deleteUserTrophiesResult.error.message)) {
    throw new Error(deleteUserTrophiesResult.error.message);
  }

  const deleteLeaderboardSnapshotsResult = await adminSupabase
    .from("leaderboard_snapshots")
    .delete()
    .not("id", "is", null);
  if (
    deleteLeaderboardSnapshotsResult.error &&
    !isMissingSocialResetTableError(deleteLeaderboardSnapshotsResult.error.message)
  ) {
    throw new Error(deleteLeaderboardSnapshotsResult.error.message);
  }

  return {
    deletedComments: commentsCountResult.count ?? 0,
    deletedReactions: reactionsCountResult.count ?? 0,
    deletedNotifications: notificationsCountResult.count ?? 0,
    deletedLeaderboardEvents: leaderboardEventsCountResult.count ?? 0,
    deletedUserTrophies: userTrophiesCountResult.count ?? 0,
    deletedLeaderboardSnapshots: leaderboardSnapshotsCountResult.count ?? 0
  };
}

async function performClearUserPredictionReset(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    targetUserId: string;
    actorUserId: string;
    actorEmail: string | null;
    actorTier: AccessLevel;
    reason: string;
    actionKey: "clear_user_test_predictions" | "self_service_prediction_reset";
    expectedEmail?: string;
  }
):
  Promise<
    | {
        ok: true;
        message: string;
        affectedCounts: {
          predictions: number;
          groupSeedRankings: number;
          bestThirdRankings: number;
          bracketPredictions: number;
          projectedBracketPredictions: number;
          legacyBracketPicks: number;
          bracketScores: number;
          predictionScores: number;
          leaderboardEvents: number;
          leaderboardSnapshots: number;
        };
      }
    | { ok: false; message: string }
  > {
  const { data: userProfile, error: userProfileError } = await adminSupabase
    .from("users")
    .select("id,email")
    .eq("id", input.targetUserId)
    .maybeSingle();

  if (userProfileError) {
    return { ok: false, message: userProfileError.message };
  }

  if (!userProfile) {
    return { ok: false, message: "That user was not found." };
  }

  const normalizedEmail = (userProfile.email ?? "").trim().toLowerCase();
  if (typeof input.expectedEmail === "string" && normalizedEmail !== input.expectedEmail.trim().toLowerCase()) {
    return { ok: false, message: `Type ${normalizedEmail} to confirm this user reset.` };
  }

  const [
    predictionsResult,
    groupSeedRankingsResult,
    bestThirdRankingsResult,
    bracketPredictionsResult,
    projectedBracketPredictionsResult,
    legacyBracketPicksResult,
    bracketScoresResult,
    predictionScoresResult,
    leaderboardEventsResult,
    leaderboardSnapshotsResult
  ] = await Promise.all([
    adminSupabase.from("predictions").select("id", { count: "exact", head: true }).eq("user_id", input.targetUserId),
    countOptionalGameplayRows(adminSupabase, "user_group_seed_rankings", input.targetUserId),
    countOptionalGameplayRows(adminSupabase, "user_best_third_rankings", input.targetUserId),
    countOptionalGameplayRows(adminSupabase, "bracket_predictions", input.targetUserId),
    countOptionalGameplayRows(adminSupabase, "projected_bracket_predictions", input.targetUserId),
    countOptionalGameplayRows(adminSupabase, "bracket_picks", input.targetUserId),
    adminSupabase.from("bracket_scores").select("id", { count: "exact", head: true }).eq("user_id", input.targetUserId),
    adminSupabase.from("prediction_scores").select("prediction_id", { count: "exact", head: true }).eq("user_id", input.targetUserId),
    adminSupabase.from("leaderboard_events").select("id", { count: "exact", head: true }).eq("user_id", input.targetUserId),
    adminSupabase.from("leaderboard_snapshots").select("id", { count: "exact", head: true }).eq("user_id", input.targetUserId)
  ]);

  const deletionResults = await Promise.all([
    adminSupabase.from("predictions").delete().eq("user_id", input.targetUserId),
    deleteOptionalGameplayRows(adminSupabase, "user_group_seed_rankings", input.targetUserId),
    deleteOptionalGameplayRows(adminSupabase, "user_best_third_rankings", input.targetUserId),
    deleteOptionalGameplayRows(adminSupabase, "bracket_predictions", input.targetUserId),
    deleteOptionalGameplayRows(adminSupabase, "projected_bracket_predictions", input.targetUserId),
    deleteOptionalGameplayRows(adminSupabase, "bracket_picks", input.targetUserId),
    adminSupabase.from("bracket_scores").delete().eq("user_id", input.targetUserId),
    adminSupabase.from("prediction_scores").delete().eq("user_id", input.targetUserId),
    adminSupabase.from("leaderboard_events").delete().eq("user_id", input.targetUserId),
    adminSupabase.from("leaderboard_snapshots").delete().eq("user_id", input.targetUserId)
  ]);

  const failedDeletion = deletionResults.find((result) => result.error);
  if (failedDeletion?.error) {
    return { ok: false, message: failedDeletion.error.message };
  }

  const leaderboardResult = await recalculateLeaderboard(adminSupabase);
  if (!leaderboardResult.ok) {
    return leaderboardResult;
  }

  const resetMarkerWarning = await bumpDashboardUiResetEpoch(input.actionKey);
  const affectedCounts = {
    predictions: predictionsResult.count ?? 0,
    groupSeedRankings: groupSeedRankingsResult.count ?? 0,
    bestThirdRankings: bestThirdRankingsResult.count ?? 0,
    bracketPredictions: bracketPredictionsResult.count ?? 0,
    projectedBracketPredictions: projectedBracketPredictionsResult.count ?? 0,
    legacyBracketPicks: legacyBracketPicksResult.count ?? 0,
    bracketScores: bracketScoresResult.count ?? 0,
    predictionScores: predictionScoresResult.count ?? 0,
    leaderboardEvents: leaderboardEventsResult.count ?? 0,
    leaderboardSnapshots: leaderboardSnapshotsResult.count ?? 0
  };

  await writeAdminResetAuditLog(adminSupabase, {
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    actionKey: input.actionKey,
    scope: "user",
    reason: input.reason,
    success: true,
    targetIds: [input.targetUserId],
    affectedCounts,
    details: {
      actorTier: input.actorTier,
      selfService: input.actionKey === "self_service_prediction_reset"
    }
  });

  return {
    ok: true,
    affectedCounts,
    message: resetMarkerWarning
      ? `Cleared ${userProfile.email}'s test predictions and rebuilt leaderboard state. ${resetMarkerWarning}`
      : `Cleared ${userProfile.email}'s test predictions and rebuilt leaderboard state.`
  };
}

async function bumpDashboardUiResetEpoch(reason: string) {
  try {
    const currentResetEpoch = await fetchIntegerAppSetting(DASHBOARD_UI_RESET_EPOCH_SETTING_KEY, 0);
    await updateIntegerAppSetting(DASHBOARD_UI_RESET_EPOCH_SETTING_KEY, currentResetEpoch + 1);
    return null;
  } catch (error) {
    console.warn(`Could not update dashboard reset epoch during ${reason}.`, error);
    return error instanceof Error ? error.message : "Dashboard reset marker could not be updated.";
  }
}

async function bumpLeaderboardSocialResetTimestamp(reason: string) {
  try {
    await updateIntegerAppSetting(LEADERBOARD_SOCIAL_RESET_AT_SETTING_KEY, Math.floor(Date.now() / 1000));
    return null;
  } catch (error) {
    console.warn(`Could not update leaderboard social reset timestamp during ${reason}.`, error);
    return error instanceof Error ? error.message : "Leaderboard social reset marker could not be updated.";
  }
}

async function writeAdminResetAuditLog(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    actorUserId: string;
    actorEmail: string | null;
    actionKey: string;
    scope: AdminRecoveryScope;
    reason: string;
    success: boolean;
    targetIds: string[];
    affectedCounts: Record<string, number>;
    details?: Record<string, unknown>;
  }
) {
  const { error } = await adminSupabase.from("admin_reset_audit_log").insert({
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail,
    action_key: input.actionKey,
    scope: input.scope,
    target_ids: input.targetIds,
    affected_counts: input.affectedCounts,
    reason: input.reason,
    success: input.success,
    details: input.details ?? {}
  });

  if (isMissingRelationError(error?.message ?? "", "public.admin_reset_audit_log")) {
    console.warn("Could not write admin reset audit log because the table is missing.", {
      actionKey: input.actionKey,
      scope: input.scope
    });
    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

function buildRequiredResetReason(reason: string) {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error("A reason is required before running this recovery action.");
  }

  return trimmedReason;
}

function ensureRecoveryActionAllowed(
  scope: AdminRecoveryScope,
  actionName: Parameters<typeof logTestingResetEnvDiagnostics>[0],
  actor: { adminUserId: string; adminEmail: string | null }
) {
  const availability = getTestingResetAvailability(scope);
  logTestingResetEnvDiagnostics(actionName, actor);
  if (!availability.canRun) {
    throw new Error(availability.disabledReason ?? "This recovery tool is disabled in the current environment.");
  }
}

export async function upsertManagerLimitsAction(
  input: UpsertManagerLimitsInput
): Promise<UpsertManagerLimitsResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const userId = input.userId?.trim();
  const maxGroups = Math.floor(input.maxGroups);
  const maxMembersPerGroup = Math.floor(input.maxMembersPerGroup);

  if (!userId) {
    return { ok: false, message: "A valid user is required." };
  }

  if (maxGroups <= 0 || maxMembersPerGroup <= 0) {
    return { ok: false, message: "Manager limits must be positive numbers." };
  }

  const adminSupabase = createAdminClient();
  const { data: existingUser, error: userError } = await adminSupabase
    .from("users")
    .select("id,role,plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    return { ok: false, message: userError.message };
  }

  if (!existingUser) {
    return { ok: false, message: "That user was not found." };
  }

  const existingPlanTier = normalizeCommercialTier(
    (existingUser as { plan_tier?: string | null }).plan_tier ?? null
  );
  const shouldPromotePlanTier =
    (existingUser as { role: UserRole }).role !== "admin" &&
    existingPlanTier !== "director" &&
    existingPlanTier !== "managing_director";

  console.info("[tier-access:manager-limits-upsert]", {
    adminUserId: adminCheck.userId,
    targetUserId: userId,
    maxGroups,
    maxMembersPerGroup,
    existingPlanTier,
    shouldPromotePlanTier
  });

  const [{ data, error }, planTierUpdateResult] = await Promise.all([
    adminSupabase
      .from("manager_limits")
      .upsert(
        {
          user_id: userId,
          max_groups: maxGroups,
          max_members_per_group: maxMembersPerGroup
        },
        { onConflict: "user_id" }
      )
      .select("user_id,max_groups,max_members_per_group")
      .single(),
    shouldPromotePlanTier
      ? adminSupabase
          .from("users")
          .update({ plan_tier: "manager", updated_at: new Date().toISOString() })
          .eq("id", userId)
      : Promise.resolve({ error: null })
  ]);

  if (error) {
    return { ok: false, message: error.message };
  }

  if (planTierUpdateResult.error) {
    return { ok: false, message: planTierUpdateResult.error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/players");

  return {
    ok: true,
    managerLimits: {
      userId: data.user_id,
      maxGroups: data.max_groups,
      maxMembersPerGroup: data.max_members_per_group
    },
    message: "Manager limits updated."
  };
}

export async function updateManagerLimitsAction(
  userId: string,
  maxGroups: number,
  maxMembersPerGroup: number
): Promise<UpdateManagerLimitsResult> {
  return upsertManagerLimitsAction({
    userId,
    maxGroups,
    maxMembersPerGroup
  });
}

export async function fetchAdminGroupsAction(): Promise<FetchAdminGroupsResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const [{ data: groups, error: groupsError }, { data: managerLimits, error: managerLimitsError }] = await Promise.all([
    adminSupabase
      .from("groups")
      .select(
        "id,name,status,owner_user_id,membership_limit,owner:users!groups_owner_user_id_fkey(id,name,email),members:group_members(id,user_id,role,joined_at,user:users!group_members_user_id_fkey(id,name,email,avatar_url,home_team_id)),access_codes(id,active,expires_at,max_uses,used_count),group_invites(id,status,expires_at)"
      )
      .order("created_at", { ascending: false }),
    adminSupabase
      .from("manager_limits")
      .select("user_id,max_groups,max_members_per_group,user:users!manager_limits_user_id_fkey(id,name,email)")
      .order("created_at", { ascending: false })
  ]);

  if (groupsError) {
    return { ok: false, message: groupsError.message };
  }

  if (managerLimitsError) {
    return { ok: false, message: managerLimitsError.message };
  }

  const groupsList = ((groups ?? []) as Array<{
    id: string;
    name: string;
    status: GroupStatus;
    owner_user_id: string | null;
    membership_limit: number;
    owner?: { id: string; name: string; email: string } | Array<{ id: string; name: string; email: string }> | null;
    members?: Array<{
      id: string;
      user_id: string;
      role: GroupMemberRole;
      joined_at: string;
      user?:
        | { id: string; name: string; email: string; avatar_url?: string | null; home_team_id?: string | null }
        | Array<{ id: string; name: string; email: string; avatar_url?: string | null; home_team_id?: string | null }>
        | null;
    }> | null;
    access_codes?: Array<{
      id: string;
      active: boolean;
      expires_at?: string | null;
      max_uses?: number | null;
      used_count?: number | null;
    }> | null;
    group_invites?: Array<{
      id: string;
      status: "pending" | "accepted" | "revoked" | "expired";
      expires_at?: string | null;
    }> | null;
  }>).map((group) => {
    const owner = unwrapRelation(group.owner);
    const members = (group.members ?? []).map((member) => {
      const user = unwrapRelation(member.user);
      return {
        membershipId: member.id,
        userId: member.user_id,
        name: user?.name ?? "Unknown user",
        email: user?.email ?? "Unknown email",
        avatarUrl: user?.avatar_url ?? null,
        homeTeamId: user?.home_team_id ?? null,
        role: member.role,
        joinedAt: member.joined_at
      };
    });
    const now = Date.now();
    const activeAccessCodeCount = (group.access_codes ?? []).filter((code) => {
      if (!code.active) {
        return false;
      }

      if (code.expires_at && new Date(code.expires_at).getTime() <= now) {
        return false;
      }

      if (code.max_uses != null && (code.used_count ?? 0) >= code.max_uses) {
        return false;
      }

      return true;
    }).length;
    const pendingInviteCount = (group.group_invites ?? []).filter((invite) => invite.status === "pending").length;
    const staleInviteCount = (group.group_invites ?? []).filter(
      (invite) => invite.status === "pending" && Boolean(invite.expires_at) && new Date(invite.expires_at as string).getTime() <= now
    ).length;

    return {
      id: group.id,
      name: group.name,
      status: group.status,
      ownerUserId: group.owner_user_id,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      membershipLimit: group.membership_limit,
      memberCount: members.length,
      activeAccessCodeCount,
      pendingInviteCount,
      staleInviteCount,
      members
    } satisfies AdminGroupSummary;
  });

  const currentGroupsUsedByManager = new Map<string, number>();
  for (const group of groupsList) {
    if (!group.ownerUserId) {
      continue;
    }

    currentGroupsUsedByManager.set(group.ownerUserId, (currentGroupsUsedByManager.get(group.ownerUserId) ?? 0) + 1);
  }

  const managers = ((managerLimits ?? []) as Array<{
    user_id: string;
    max_groups: number;
    max_members_per_group: number;
    user?: { id: string; name: string; email: string } | Array<{ id: string; name: string; email: string }> | null;
  }>).map((row) => {
    const user = unwrapRelation(row.user);
    return {
      userId: row.user_id,
      name: user?.name ?? "Unknown user",
      email: user?.email ?? "Unknown email",
      maxGroups: row.max_groups,
      maxMembersPerGroup: row.max_members_per_group,
      currentGroupsUsed: currentGroupsUsedByManager.get(row.user_id) ?? 0
    } satisfies AdminManagerSummary;
  });

  return { ok: true, groups: groupsList, managers };
}

export async function addUserToGroupAction(input: AddUserToGroupInput): Promise<AddUserToGroupResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const groupId = input.groupId.trim();
  const userIdentifier = input.userId.trim();
  const role = input.role ?? "member";
  const overrideCapacity = input.overrideCapacity ?? false;

  if (!groupId || !userIdentifier) {
    return { ok: false, message: "A valid group and user are required." };
  }

  if (role === "manager") {
    return { ok: false, message: "Each group has one manager. Use Change owner to transfer management." };
  }

  const targetUser = await findUserByIdOrEmail(adminSupabase, userIdentifier);
  if (!targetUser) {
    return { ok: false, message: "That user was not found." };
  }

  const { data: group, error: groupError } = await adminSupabase
    .from("groups")
    .select("id,name,membership_limit")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    return { ok: false, message: groupError.message };
  }

  if (!group) {
    return { ok: false, message: "That group was not found." };
  }

  const { data: existingMembership, error: membershipLookupError } = await adminSupabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", targetUser.id)
    .maybeSingle();

  if (membershipLookupError) {
    return { ok: false, message: membershipLookupError.message };
  }

  if (existingMembership) {
    return { ok: false, message: `${targetUser.name} is already in ${group.name}.` };
  }

  const { count: memberCount, error: memberCountError } = await adminSupabase
    .from("group_members")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);

  if (memberCountError) {
    return { ok: false, message: memberCountError.message };
  }

  if (!overrideCapacity && (memberCount ?? 0) >= group.membership_limit) {
    return { ok: false, message: `${group.name} is already full. Use override to add this player anyway.` };
  }

  if (role === "member") {
    const joinLimitResult = await ensureUserCanJoinAnotherGroup(adminSupabase, targetUser.id);
    if (!joinLimitResult.ok) {
      return joinLimitResult;
    }
  }

  const { error: insertError } = await adminSupabase.from("group_members").insert({
    group_id: groupId,
    user_id: targetUser.id,
    role
  });

  if (insertError) {
    return { ok: false, message: insertError.message };
  }

  revalidatePath("/admin/groups");
  revalidatePath("/my-groups");

  return {
    ok: true,
    message: `${targetUser.name} was added to ${group.name}${overrideCapacity ? " with capacity override." : "."}`
  };
}

export async function removeUserFromGroupAction(userId: string, groupId: string): Promise<RemoveUserFromGroupResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const trimmedUserId = userId.trim();
  const trimmedGroupId = groupId.trim();

  if (!trimmedUserId || !trimmedGroupId) {
    return { ok: false, message: "A valid group and user are required." };
  }

  const [{ data: membership, error: membershipError }, { data: group, error: groupError }, { data: user, error: userError }] =
    await Promise.all([
      adminSupabase
        .from("group_members")
        .select("id,role")
        .eq("group_id", trimmedGroupId)
        .eq("user_id", trimmedUserId)
        .maybeSingle(),
      adminSupabase
        .from("groups")
        .select("id,name,owner_user_id")
        .eq("id", trimmedGroupId)
        .maybeSingle(),
      adminSupabase
        .from("users")
        .select("id,name")
        .eq("id", trimmedUserId)
        .maybeSingle()
    ]);

  if (membershipError || groupError || userError) {
    return { ok: false, message: membershipError?.message ?? groupError?.message ?? userError?.message ?? "Lookup failed." };
  }

  if (!membership || !group || !user) {
    return { ok: false, message: "That group membership was not found." };
  }

  if (group.owner_user_id === trimmedUserId) {
    return { ok: false, message: "Change the group owner first before removing this user from the group." };
  }

  const { error: deleteError } = await adminSupabase
    .from("group_members")
    .delete()
    .eq("group_id", trimmedGroupId)
    .eq("user_id", trimmedUserId);

  if (deleteError) {
    return { ok: false, message: deleteError.message };
  }

  revalidatePath("/admin/groups");
  revalidatePath("/my-groups");

  return {
    ok: true,
    message: `${user.name} was removed from ${group.name}. Their account and predictions were left intact.`
  };
}

export async function updateGroupLimitAction(groupId: string, membershipLimit: number): Promise<UpdateGroupLimitResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const trimmedGroupId = groupId.trim();
  const nextLimit = Math.floor(membershipLimit);
  if (!trimmedGroupId || nextLimit <= 0) {
    return { ok: false, message: "A positive group limit is required." };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("groups")
    .update({
      membership_limit: nextLimit,
      updated_at: new Date().toISOString()
    })
    .eq("id", trimmedGroupId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin/groups");
  revalidatePath("/my-groups");

  return {
    ok: true,
    message: `Group limit updated to ${nextLimit}.`
  };
}

export async function changeGroupOwnerAction(groupId: string, newOwnerUserId: string): Promise<ChangeGroupOwnerResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const trimmedGroupId = groupId.trim();
  const ownerIdentifier = newOwnerUserId.trim();
  if (!trimmedGroupId || !ownerIdentifier) {
    return { ok: false, message: "A valid group and new owner are required." };
  }

  const nextOwner = await findUserByIdOrEmail(adminSupabase, ownerIdentifier);
  if (!nextOwner) {
    return { ok: false, message: "The new owner was not found." };
  }

  const { data: group, error: groupError } = await adminSupabase
    .from("groups")
    .select("id,name")
    .eq("id", trimmedGroupId)
    .maybeSingle();

  if (groupError) {
    return { ok: false, message: groupError.message };
  }

  if (!group) {
    return { ok: false, message: "That group was not found." };
  }

  const { error: updateGroupError } = await adminSupabase
    .from("groups")
    .update({
      owner_user_id: nextOwner.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", trimmedGroupId);

  if (updateGroupError) {
    return { ok: false, message: updateGroupError.message };
  }

  revalidatePath("/admin/groups");
  revalidatePath("/my-groups");

  return {
    ok: true,
    message: `${nextOwner.name} is now the owner of ${group.name}.`
  };
}

export async function removeManagerAccessAction(_userId: string): Promise<RemoveManagerAccessResult> {
  void _userId;
  return {
    ok: false,
    message: "Direct manager removal is disabled. Use the Super Admin Demote / Remove Access workflow on the player card instead."
  };
}

export async function updateUserDisplayNameAction(
  userId: string,
  displayName: string
): Promise<UpdateUserDisplayNameResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const trimmedUserId = userId.trim();
  const trimmedDisplayName = displayName.trim();
  if (!trimmedUserId || !trimmedDisplayName) {
    return { ok: false, message: "A valid user and display name are required." };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("users")
    .update({
      name: trimmedDisplayName,
      updated_at: new Date().toISOString()
    })
    .eq("id", trimmedUserId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/players");

  return {
    ok: true,
    message: "Display name updated."
  };
}

type KnockoutResetRpcRow = {
  targetMatchCount: number;
  statusBreakdown: Record<string, number>;
  reset_match_count: number;
  deleted_bracket_prediction_count: number;
  deleted_projected_bracket_prediction_count: number;
  deleted_bracket_score_count: number;
  deleted_legacy_bracket_pick_count: number;
  deleted_prediction_score_count: number;
  deleted_leaderboard_event_count: number;
  deleted_leaderboard_snapshot_count: number;
  deleted_user_notification_count: number;
};

export async function updateAdminMatchResultAction(input: UpdateMatchResultInput): Promise<UpdateMatchResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data: previousMatch, error: previousMatchError } = await adminSupabase
    .from("matches")
    .select("id,status,stage,home_score,away_score,winner_team_id")
    .eq("id", input.id)
    .single();

  if (previousMatchError) {
    return { ok: false, message: previousMatchError.message };
  }

  const isResettingToOpen = input.status === "scheduled";
  const { data, error } = await adminSupabase
    .from("matches")
    .update({
      status: input.status,
      home_score: isResettingToOpen ? null : input.homeScore ?? null,
      away_score: isResettingToOpen ? null : input.awayScore ?? null,
      winner_team_id: isResettingToOpen ? null : input.winnerTeamId ?? null,
      finalized_at: input.status === "final" ? new Date().toISOString() : null,
      last_synced_at: isResettingToOpen ? null : undefined,
      is_manual_override: !isResettingToOpen,
      sync_status: isResettingToOpen ? null : undefined,
      sync_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.id)
    .select(
      "id,stage,group_name,status,home_team_id,away_team_id,home_source,away_source,kickoff_time,kickoff_at,home_score,away_score,winner_team_id,finalized_at,last_synced_at,external_id,is_manual_override,sync_status,sync_error,next_match_id,next_match_slot,updated_at"
    )
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((previousMatch as MatchRow).status === "final" && input.status !== "final") {
    if ((previousMatch as MatchRow).stage === "group") {
      const resetResult = await clearDerivedGroupMatchScoringState(adminSupabase, input.id);
      if (!resetResult.ok) {
        return resetResult;
      }
    } else {
      try {
        await resetKnockoutMatchScoring(input.id);
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    }
  }

  let needsKnockoutLeaderboardRefresh = false;

  if ((data as MatchRow).status === "final" && (data as MatchRow).stage !== "group") {
    try {
      await scoreFinalizedKnockoutMatchWithClient(adminSupabase, input.id);
      await rebuildKnockoutAdvancementSharedWithClient(adminSupabase);
      needsKnockoutLeaderboardRefresh = true;
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  if ((previousMatch as MatchRow).status === "final" && input.status !== "final" && (previousMatch as MatchRow).stage !== "group") {
    needsKnockoutLeaderboardRefresh = true;
  }

  if (needsKnockoutLeaderboardRefresh) {
    const leaderboardResult = await recalculateLeaderboard(adminSupabase);
    if (!leaderboardResult.ok) {
      return leaderboardResult;
    }
  }

  const previous = previousMatch as MatchRow;
  const current = data as MatchRow;
  const eventType =
    current.status === "final"
      ? "finalize"
      : current.status === "scheduled" && previous.status !== "scheduled"
        ? "reopen"
        : current.status === "locked"
          ? "lock"
          : "override";
  await appendMatchEvent(adminSupabase, {
    matchId: input.id,
    eventType,
    payload: {
      source: "admin",
      previousStatus: previous.status,
      nextStatus: current.status,
      previousHomeScore: previous.home_score ?? null,
      previousAwayScore: previous.away_score ?? null,
      nextHomeScore: current.home_score ?? null,
      nextAwayScore: current.away_score ?? null,
      previousWinnerTeamId: previous.winner_team_id ?? null,
      nextWinnerTeamId: current.winner_team_id ?? null,
      actorUserId: adminCheck.userId
    }
  });

  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath("/leaderboard");
  revalidatePath("/knockout");
  revalidatePath("/admin/matches");
  revalidatePath("/profile");
  return { ok: true, match: mapMatchRow(data as MatchRow) };
}

export async function rescoreKnockoutScoresAction(): Promise<RescoreKnockoutScoresResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,status")
    .eq("status", "final")
    .neq("stage", "group");

  if (error) {
    return { ok: false, message: error.message };
  }

  const finalizedKnockoutMatches = ((data ?? []) as Array<Pick<MatchRow, "id" | "stage" | "status">>).filter((match) =>
    isKnockoutStage(match.stage)
  );

  let rescoredPredictions = 0;
  for (const match of finalizedKnockoutMatches) {
    rescoredPredictions += await scoreFinalizedKnockoutMatchWithClient(adminSupabase, match.id);
  }

  const leaderboardResult = await recalculateLeaderboard(adminSupabase);
  if (!leaderboardResult.ok) {
    return leaderboardResult;
  }

  console.info("[knockout-rescore]", {
    rescoredMatches: finalizedKnockoutMatches.length,
    rescoredPredictions
  });

  revalidatePath("/knockout");
  revalidatePath("/leaderboard");
  revalidatePath("/profile");
  revalidatePath("/admin/matches");

  return {
    ok: true,
    rescoredMatches: finalizedKnockoutMatches.length,
    rescoredPredictions,
    message: `Rescored ${rescoredPredictions} knockout predictions across ${finalizedKnockoutMatches.length} finalized matches.`
  };
}

export async function runAdminScoringAuditAction(): Promise<RunAdminScoringAuditResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  try {
    const adminSupabase = createAdminClient();
    const report = await runReadOnlyAdminScoringAudit(adminSupabase);

    return {
      ok: true,
      report,
      message:
        report.counts.mismatches === 0
          ? "Read-only scoring audit completed with no mismatches."
          : `Read-only scoring audit found ${report.counts.mismatches} mismatches.`
    };
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Could not run the read-only scoring audit.") };
  }
}

export async function batchFinalizeMatchResultsAction(
  input: BatchFinalizeMatchResultsInput
): Promise<BatchFinalizeMatchResultsResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  if (input.confirmationText !== "FINALIZE TEST MATCHES") {
    return { ok: false, message: "Batch finalization confirmation did not match. No matches were changed." };
  }

  try {
    ensureRecoveryActionAllowed("batch_finalize", "batchFinalizeMatchResultsAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Testing tools are disabled in this environment.") };
  }

  if (!input.fromDate || !input.toDate) {
    return { ok: false, message: "Choose both a from date and a to date." };
  }

  if (input.fromDate > input.toDate) {
    return { ok: false, message: "From date must be before or equal to the to date." };
  }

  const adminSupabase = createAdminClient();
  const fromIso = `${input.fromDate}T00:00:00.000Z`;
  const toIso = `${input.toDate}T23:59:59.999Z`;

  const { data: matches, error } = await adminSupabase
    .from("matches")
    .select(
      "id,stage,group_name,status,home_team_id,away_team_id,kickoff_time,home_score,away_score,winner_team_id,is_manual_override,home_team:teams!matches_home_team_id_fkey(id,name,fifa_rank),away_team:teams!matches_away_team_id_fkey(id,name,fifa_rank)"
    )
    .gte("kickoff_time", fromIso)
    .lte("kickoff_time", toIso)
    .order("kickoff_time", { ascending: true });

  if (error) {
    return { ok: false, message: error.message };
  }

  const candidateMatches = ((matches ?? []) as Array<
    MatchRow & {
      home_team?: { id: string; name: string; fifa_rank?: number | null } | Array<{ id: string; name: string; fifa_rank?: number | null }> | null;
      away_team?: { id: string; name: string; fifa_rank?: number | null } | Array<{ id: string; name: string; fifa_rank?: number | null }> | null;
    }
  >).filter((match) => isBatchFinalizeScopeMatch(match, input.scope));

  const maxBatchSize = 72;
  if (candidateMatches.length > maxBatchSize) {
    return {
      ok: false,
      message: `Batch finalization is limited to ${maxBatchSize} matches at a time. Narrow the date range or scope.`
    };
  }

  let processed = 0;
  let finalized = 0;
  let skipped = 0;
  let overwritten = 0;
  let scoringJobsTriggered = 0;
  const errors: string[] = [];

  for (const match of candidateMatches) {
    processed += 1;

    if (!match.home_team_id || !match.away_team_id) {
      skipped += 1;
      continue;
    }

    const isAlreadyFinal = match.status === "final";
    const hasExistingResult = isAlreadyFinal || match.home_score != null || match.away_score != null;

    if (isAlreadyFinal && input.overwriteMode === "skip-finalized") {
      skipped += 1;
      continue;
    }

    if (isAlreadyFinal && input.overwriteMode === "overwrite-test-results" && match.is_manual_override !== true) {
      skipped += 1;
      continue;
    }

    const generated = generateBatchFinalizeScore(match, input.resultStyle);
    if (!generated) {
      skipped += 1;
      continue;
    }

    if (hasExistingResult) {
      overwritten += 1;
    }

    const updateResult = await updateAdminMatchResultAction({
      id: match.id,
      status: "final",
      homeScore: generated.homeScore,
      awayScore: generated.awayScore,
      winnerTeamId: generated.winnerTeamId
    });

    if (!updateResult.ok) {
      skipped += 1;
      errors.push(`${match.id}: ${updateResult.message}`);
      continue;
    }

    if (match.stage === "group") {
      const scoringResult = await scoreFinalizedGroupMatch(match.id);
      if (!scoringResult.ok) {
        errors.push(`${match.id}: ${scoringResult.message}`);
      } else {
        scoringJobsTriggered += 1;
      }
    } else {
      scoringJobsTriggered += 1;
    }

    await appendMatchEvent(adminSupabase, {
      matchId: match.id,
      eventType: "batch_test_finalize",
      payload: {
        source: "admin-batch-finalize",
        actorUserId: superAdminCheck.userId,
        previousStatus: match.status,
        nextStatus: "final",
        previousHomeScore: match.home_score ?? null,
        previousAwayScore: match.away_score ?? null,
        nextHomeScore: generated.homeScore,
        nextAwayScore: generated.awayScore
      }
    });

    finalized += 1;
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/leaderboard");
  revalidatePath("/knockout");
  revalidatePath("/predictions");
  revalidatePath("/profile");
  revalidatePath("/admin/matches");
  revalidatePath("/my-groups");

  console.info("[batch-finalize-matches]", {
    adminUserId: superAdminCheck.userId,
    adminEmail: superAdminCheck.email,
    fromDate: input.fromDate,
    toDate: input.toDate,
    scope: input.scope,
    resultStyle: input.resultStyle,
    overwriteMode: input.overwriteMode,
    processed,
    finalized,
    skipped,
    overwritten,
    scoringJobsTriggered,
    errorCount: errors.length
  });
  await writeAdminResetAuditLog(adminSupabase, {
    actorUserId: superAdminCheck.userId,
    actorEmail: superAdminCheck.email,
    actionKey: "batch_finalize_test_matches",
    scope: "batch_finalize",
    reason: `Batch finalize ${input.scope} matches from ${input.fromDate} to ${input.toDate}`,
    success: true,
    targetIds: candidateMatches.map((match) => match.id),
    affectedCounts: {
      processed,
      finalized,
      skipped,
      overwritten,
      scoringJobsTriggered,
      errors: errors.length
    },
    details: {
      scope: input.scope,
      resultStyle: input.resultStyle,
      overwriteMode: input.overwriteMode
    }
  });

  return {
    ok: true,
    processed,
    finalized,
    skipped,
    overwritten,
    scoringJobsTriggered,
    errors,
    message: `Processed ${processed} matches. Finalized ${finalized}, skipped ${skipped}, overwrote ${overwritten}, triggered scoring for ${scoringJobsTriggered}.`
  };
}

export async function batchClearMatchResultsAction(
  input: BatchClearMatchResultsInput
): Promise<BatchClearMatchResultsResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  if (input.confirmationText !== "CLEAR TEST MATCH RESULTS") {
    return { ok: false, message: "Batch clear confirmation did not match. No matches were changed." };
  }

  try {
    ensureRecoveryActionAllowed("batch_finalize", "batchClearMatchResultsAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Testing tools are disabled in this environment.") };
  }

  if (!input.fromDate || !input.toDate) {
    return { ok: false, message: "Choose both a from date and a to date." };
  }

  if (input.fromDate > input.toDate) {
    return { ok: false, message: "From date must be before or equal to the to date." };
  }

  const adminSupabase = createAdminClient();
  const fromIso = `${input.fromDate}T00:00:00.000Z`;
  const toIso = `${input.toDate}T23:59:59.999Z`;

  const { data: matches, error } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_score,away_score,winner_team_id,finalized_at,last_synced_at,is_manual_override,kickoff_time")
    .gte("kickoff_time", fromIso)
    .lte("kickoff_time", toIso)
    .order("kickoff_time", { ascending: true });

  if (error) {
    return { ok: false, message: error.message };
  }

  const candidateMatches = ((matches ?? []) as MatchRow[]).filter(
    (match) => isBatchFinalizeScopeMatch(match, input.scope) && match.is_manual_override === true
  );
  const maxBatchSize = 72;
  if (candidateMatches.length > maxBatchSize) {
    return {
      ok: false,
      message: `Batch result clearing is limited to ${maxBatchSize} matches at a time. Narrow the date range or scope.`
    };
  }

  let processed = 0;
  let cleared = 0;
  let skipped = 0;
  const knockoutMatchIds: string[] = [];

  for (const match of candidateMatches) {
    processed += 1;
    const hasExistingResult =
      match.home_score != null ||
      match.away_score != null ||
      match.winner_team_id != null ||
      match.finalized_at != null ||
      match.last_synced_at != null ||
      match.status !== "scheduled";

    if (!hasExistingResult) {
      skipped += 1;
      continue;
    }

    const updateResult = await adminSupabase
      .from("matches")
      .update({
        status: "scheduled",
        home_score: null,
        away_score: null,
        winner_team_id: null,
        finalized_at: null,
        last_synced_at: null,
        is_manual_override: false,
        sync_status: null,
        sync_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", match.id);

    if (updateResult.error && !isOptionalResetColumnError(updateResult.error.message)) {
      return { ok: false, message: updateResult.error.message };
    }

    if (updateResult.error) {
      const fallbackUpdate = await adminSupabase
        .from("matches")
        .update({
          status: "scheduled",
          home_score: null,
          away_score: null,
          winner_team_id: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", match.id);
      if (fallbackUpdate.error) {
        return { ok: false, message: fallbackUpdate.error.message };
      }
    }

    if (match.stage === "group") {
      const resetResult = await clearDerivedGroupMatchScoringState(adminSupabase, match.id);
      if (!resetResult.ok) {
        return resetResult;
      }
    } else {
      await resetKnockoutMatchScoring(match.id);
      knockoutMatchIds.push(match.id);
    }

    await appendMatchEvent(adminSupabase, {
      matchId: match.id,
      eventType: "reopen",
      payload: {
        source: "admin-batch-clear",
        actorUserId: superAdminCheck.userId,
        previousStatus: match.status,
        nextStatus: "scheduled"
      }
    });

    cleared += 1;
  }

  if (cleared > 0) {
    if (knockoutMatchIds.length > 0) {
      const advancementSummary = await rebuildKnockoutAdvancementSharedWithClient(adminSupabase);
      const leaderboardResult = await recalculateLeaderboard(adminSupabase);
      if (!leaderboardResult.ok) {
        return leaderboardResult;
      }

      await writeAdminResetAuditLog(adminSupabase, {
        actorUserId: superAdminCheck.userId,
        actorEmail: superAdminCheck.email,
        actionKey: "batch_clear_test_matches",
        scope: "batch_finalize",
        reason: `Batch clear ${input.scope} matches from ${input.fromDate} to ${input.toDate}`,
        success: true,
        targetIds: candidateMatches.map((match) => match.id),
        affectedCounts: {
          processed,
          cleared,
          skipped,
          repairedKnockoutMatches: advancementSummary.touchedMatches
        },
        details: {
          scope: input.scope
        }
      });
    } else {
      const leaderboardResult = await recalculateLeaderboard(adminSupabase);
      if (!leaderboardResult.ok) {
        return leaderboardResult;
      }

      await writeAdminResetAuditLog(adminSupabase, {
        actorUserId: superAdminCheck.userId,
        actorEmail: superAdminCheck.email,
        actionKey: "batch_clear_test_matches",
        scope: "batch_finalize",
        reason: `Batch clear ${input.scope} matches from ${input.fromDate} to ${input.toDate}`,
        success: true,
        targetIds: candidateMatches.map((match) => match.id),
        affectedCounts: {
          processed,
          cleared,
          skipped,
          repairedKnockoutMatches: 0
        },
        details: {
          scope: input.scope
        }
      });
    }
  }

  const resetMarkerWarning = await bumpDashboardUiResetEpoch("batch clear match results");
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/leaderboard");
  revalidatePath("/knockout");
  revalidatePath("/predictions");
  revalidatePath("/profile");
  revalidatePath("/admin/matches");
  revalidatePath("/my-groups");

  return {
    ok: true,
    processed,
    cleared,
    skipped,
    repairedKnockoutMatches: knockoutMatchIds.length,
      message: resetMarkerWarning
      ? `Processed ${processed} pretend-result matches. Cleared ${cleared}, skipped ${skipped}. ${resetMarkerWarning}`
      : `Processed ${processed} pretend-result matches. Cleared ${cleared}, skipped ${skipped}.`
  };
}

export async function repairKnockoutAdvancementAction(): Promise<RepairKnockoutAdvancementResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();

  try {
    const summary = await rebuildKnockoutAdvancementSharedWithClient(adminSupabase);

    if (summary.clearedScores > 0) {
      const leaderboardResult = await recalculateLeaderboard(adminSupabase);
      if (!leaderboardResult.ok) {
        return leaderboardResult;
      }
    }

    revalidatePath("/knockout");
    revalidatePath("/admin/matches");
    revalidatePath("/profile");
    revalidatePath("/leaderboard");

    return {
      ok: true,
      populatedSlots: summary.populatedSlots,
      updatedSlots: summary.updatedSlots,
      touchedMatches: summary.touchedMatches,
      message:
        summary.touchedMatches === 0
          ? "Knockout bracket already matched finalized winners."
          : `Updated ${summary.populatedSlots + summary.updatedSlots} bracket slots across ${summary.touchedMatches} knockout matches and cleared ${summary.clearedPredictions} stale predictions.`
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function syncMatchesNowAction(): Promise<SyncMatchesNowResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const syncSecret = process.env.MATCH_SYNC_SECRET?.trim() ?? "";
    const syncBaseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

    const payload =
      syncSecret && syncBaseUrl
        ? await fetch(`${syncBaseUrl.replace(/\/$/, "")}/api/sync/matches`, {
            method: "POST",
            headers: {
              "x-match-sync-secret": syncSecret
            },
            cache: "no-store"
          }).then(async (response) => {
            const body = (await response.json()) as SyncMatchesNowResult | { ok: false; message: string };
            if (!response.ok || !body.ok) {
              throw new Error(body.message ?? "Match sync failed.");
            }
            return body;
          })
        : await syncMatches();

    revalidatePath("/");
    revalidatePath("/groups");
    revalidatePath("/leaderboard");
    revalidatePath("/knockout");
    revalidatePath("/admin/matches");
    revalidatePath("/profile");

    return {
      ...payload,
      message: "Match results synced."
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Match sync failed." };
  }
}

export async function resetKnockoutTestingDataAction(
  input: ResetTestingDataInput
): Promise<ResetKnockoutTestingDataResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  if (input.confirmationText !== "RESET KNOCKOUT TEST DATA" || input.scope !== "knockout-only") {
    return { ok: false, message: "Reset confirmation did not match. No data was changed." };
  }

  try {
    buildRequiredResetReason(input.reason ?? "Reset knockout test data");
    ensureRecoveryActionAllowed("knockout", "resetKnockoutTestingDataAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Knockout reset is disabled in this environment.") };
  }

  const adminSupabase = createAdminClient();

  try {
    const summary = await resetKnockoutTestingDataWithClient(adminSupabase);

    let leaderboardWarning = false;
    const leaderboardResult = await recalculateLeaderboard(adminSupabase);
    if (!leaderboardResult.ok) {
      leaderboardWarning = true;
      console.error("[knockout-reset:leaderboard-recalc-failed]", {
        adminUserId: superAdminCheck.userId,
        adminEmail: superAdminCheck.email,
        environment: process.env.NODE_ENV,
        error: leaderboardResult.message
      });
    }

    const resetMarkerWarning = await bumpDashboardUiResetEpoch("knockout reset");
    console.info("[knockout-reset]", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      resetType: "knockout",
      targetMatchCount: summary.targetMatchCount,
      statusBreakdownBeforeReset: summary.statusBreakdown,
      resetMatchCount: summary.reset_match_count,
      deletedPredictions: summary.deleted_bracket_prediction_count,
      deletedBracketPredictions: summary.deleted_bracket_prediction_count,
      deletedBracketScores: summary.deleted_bracket_score_count,
      deletedPredictionScores: summary.deleted_prediction_score_count,
      deletedLeaderboardEvents: summary.deleted_leaderboard_event_count,
      deletedLeaderboardSnapshots: summary.deleted_leaderboard_snapshot_count,
      deletedUserNotifications: summary.deleted_user_notification_count,
      leaderboardRecalculation: leaderboardWarning ? "failed" : "ok"
    });
    await writeAdminResetAuditLog(adminSupabase, {
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actionKey: "reset_knockout_test_data",
      scope: "knockout",
      reason: input.reason?.trim() || "Reset knockout test data",
      success: true,
      targetIds: [],
      affectedCounts: {
        targetMatchCount: summary.targetMatchCount,
        resetMatchCount: summary.reset_match_count,
        bracketPredictions: summary.deleted_bracket_prediction_count,
        bracketScores: summary.deleted_bracket_score_count,
        legacyBracketPicks: summary.deleted_legacy_bracket_pick_count ?? 0,
        predictionScores: summary.deleted_prediction_score_count,
        leaderboardEvents: summary.deleted_leaderboard_event_count,
        leaderboardSnapshots: summary.deleted_leaderboard_snapshot_count,
        userNotifications: summary.deleted_user_notification_count
      },
      details: {
        statusBreakdownBeforeReset: summary.statusBreakdown,
        leaderboardRecalculation: leaderboardWarning ? "failed" : "ok"
      }
    });

    revalidatePath("/admin/matches");
    revalidatePath("/knockout");
    revalidatePath("/leaderboard");
    revalidatePath("/profile");
    revalidatePath("/dashboard");

    if (leaderboardWarning) {
      return {
        ok: true,
        warning: true,
        resetMatchCount: summary.reset_match_count,
        deletedPredictions: summary.deleted_bracket_prediction_count,
        deletedBracketPredictions: summary.deleted_bracket_prediction_count,
        deletedBracketScores: summary.deleted_bracket_score_count,
        deletedPredictionScores: summary.deleted_prediction_score_count,
        deletedLeaderboardEvents: summary.deleted_leaderboard_event_count,
        deletedLeaderboardSnapshots: summary.deleted_leaderboard_snapshot_count,
        deletedUserNotifications: summary.deleted_user_notification_count,
        message:
          `Knockout testing data was reset across all statuses, including locked/live/final matches, but leaderboard recalculation failed. Run leaderboard repair manually.${resetMarkerWarning ? ` ${resetMarkerWarning}` : ""}`
      };
    }

    return {
      ok: true,
      warning: false,
      resetMatchCount: summary.reset_match_count,
      deletedPredictions: summary.deleted_bracket_prediction_count,
      deletedBracketPredictions: summary.deleted_bracket_prediction_count,
      deletedBracketScores: summary.deleted_bracket_score_count,
      deletedPredictionScores: summary.deleted_prediction_score_count,
      deletedLeaderboardEvents: summary.deleted_leaderboard_event_count,
      deletedLeaderboardSnapshots: summary.deleted_leaderboard_snapshot_count,
      deletedUserNotifications: summary.deleted_user_notification_count,
      message: `Knockout testing data was reset across all statuses, including locked/live/final matches. Group-stage data was not changed.${resetMarkerWarning ? ` ${resetMarkerWarning}` : ""}`
    };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

export async function resetGroupStageTestingDataAction(
  input: ResetTestingDataInput
): Promise<ResetGroupStageTestingDataResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  if (input.confirmationText !== "RESET GROUP TEST DATA" || input.scope !== "group-only") {
    return { ok: false, message: "Reset confirmation did not match. No data was changed." };
  }

  try {
    buildRequiredResetReason(input.reason ?? "Reset group-stage test data");
    ensureRecoveryActionAllowed("group_stage", "resetGroupStageTestingDataAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Group-stage reset is disabled in this environment.") };
  }

  const adminSupabase = createAdminClient();

  try {
    console.info("[group-reset] reset started", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV
    });
    const summary = await resetGroupStageTestingDataWithClient(adminSupabase);

    let leaderboardWarning = false;
    const leaderboardResult = await recalculateLeaderboard(adminSupabase);
    if (!leaderboardResult.ok) {
      leaderboardWarning = true;
      console.error("[group-reset:leaderboard-recalc-failed]", {
        adminUserId: superAdminCheck.userId,
        adminEmail: superAdminCheck.email,
        environment: process.env.NODE_ENV,
        error: leaderboardResult.message
      });
    }

    const resetMarkerWarning = await bumpDashboardUiResetEpoch("group-stage reset");
    console.info("[group-reset]", {
      resetType: "group",
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email,
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      targetMatchCount: summary.targetMatchCount,
      statusBreakdownBeforeReset: summary.statusBreakdown,
      generatedArtifactsDeleted: summary.deletedGeneratedArtifacts ?? 0,
      statusBreakdownAfterReset: summary.postResetStatusBreakdown ?? {},
      lingeringNonOpenMatchCount: summary.lingeringNonOpenMatchCount ?? 0,
      lingeringScoredMatchCount: summary.lingeringScoredMatchCount ?? 0,
      resetMatchCount: summary.resetMatchCount,
      deletedPredictions: summary.deletedPredictions,
      deletedPredictionScores: summary.deletedPredictionScores,
      deletedLeaderboardEvents: summary.deletedLeaderboardEvents,
      deletedLeaderboardSnapshots: summary.deletedLeaderboardSnapshots,
      deletedUserNotifications: summary.deletedUserNotifications,
      leaderboardRecalculation: leaderboardWarning ? "failed" : "ok"
    });
    await writeAdminResetAuditLog(adminSupabase, {
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actionKey: "reset_group_stage_test_data",
      scope: "group_stage",
      reason: input.reason?.trim() || "Reset group-stage test data",
      success: true,
      targetIds: [],
      affectedCounts: {
        targetMatchCount: summary.targetMatchCount,
        resetMatchCount: summary.resetMatchCount,
        predictions: summary.deletedPredictions,
        predictionScores: summary.deletedPredictionScores,
        leaderboardEvents: summary.deletedLeaderboardEvents,
        leaderboardSnapshots: summary.deletedLeaderboardSnapshots,
        generatedArtifacts: summary.deletedGeneratedArtifacts ?? 0,
        knockoutSeedArtifacts: summary.deletedKnockoutSeedArtifacts ?? 0,
        userNotifications: summary.deletedUserNotifications
      },
      details: {
        statusBreakdownBeforeReset: summary.statusBreakdown,
        statusBreakdownAfterReset: summary.postResetStatusBreakdown ?? {},
        lingeringNonOpenMatchCount: summary.lingeringNonOpenMatchCount ?? 0,
        lingeringScoredMatchCount: summary.lingeringScoredMatchCount ?? 0,
        leaderboardRecalculation: leaderboardWarning ? "failed" : "ok"
      }
    });

    revalidatePath("/");
    revalidatePath("/admin/matches");
    revalidatePath("/knockout");
    revalidatePath("/leaderboard");
    revalidatePath("/predictions");
    revalidatePath("/profile");
    revalidatePath("/dashboard");
    revalidatePath("/groups");
    revalidatePath("/my-groups");
    revalidatePath("/help");

    const deletedCounts = {
      groupPredictions: summary.deletedPredictions,
      predictionScores: summary.deletedPredictionScores,
      leaderboardEntries: summary.deletedLeaderboardSnapshots,
      leaderboardEvents: summary.deletedLeaderboardEvents,
      groupStandingsOrDerivedRows: summary.deletedGeneratedArtifacts ?? 0,
      knockoutSeededRowsIfApplicable: summary.deletedKnockoutSeedArtifacts ?? 0
    } as const;

    const hasLingeringArtifacts =
      (summary.lingeringNonOpenMatchCount ?? 0) > 0 || (summary.lingeringScoredMatchCount ?? 0) > 0;

    if (leaderboardWarning || hasLingeringArtifacts) {
      const result = {
        ok: true,
        warning: true,
        resetMatchCount: summary.resetMatchCount,
        deletedPredictions: summary.deletedPredictions,
        deletedPredictionScores: summary.deletedPredictionScores,
        deletedLeaderboardEvents: summary.deletedLeaderboardEvents,
        deletedLeaderboardSnapshots: summary.deletedLeaderboardSnapshots,
        deletedUserNotifications: summary.deletedUserNotifications,
        deletedCounts,
        message:
          leaderboardWarning
            ? `Group-stage testing data was reset, but leaderboard recalculation failed. Run leaderboard repair manually.${resetMarkerWarning ? ` ${resetMarkerWarning}` : ""}`
            : `Group-stage testing data was reset, but some matches or generated artifacts may still remain. Check logs.${resetMarkerWarning ? ` ${resetMarkerWarning}` : ""}`
      } satisfies ResetGroupStageTestingDataResult;
      console.info("[group-reset] reset completed", {
        ok: result.ok,
        warning: result.warning,
        deletedCounts
      });
      console.info("[group-reset] returned result", result);
      return result;
    }

    const result = {
      ok: true,
      warning: false,
      resetMatchCount: summary.resetMatchCount,
      deletedPredictions: summary.deletedPredictions,
      deletedPredictionScores: summary.deletedPredictionScores,
      deletedLeaderboardEvents: summary.deletedLeaderboardEvents,
      deletedLeaderboardSnapshots: summary.deletedLeaderboardSnapshots,
      deletedUserNotifications: summary.deletedUserNotifications,
      deletedCounts,
      message:
        `Group-stage testing data was reset. Group matches were returned to open, player predictions were cleared, and generated group standings/seed artifacts were removed.${resetMarkerWarning ? ` ${resetMarkerWarning}` : ""}`
    } satisfies ResetGroupStageTestingDataResult;
    console.info("[group-reset] reset completed", {
      ok: result.ok,
      warning: result.warning,
      deletedCounts
    });
    console.info("[group-reset] returned result", result);
    return result;
  } catch (error) {
    const message = buildAdminActionErrorMessage(error, "Group-stage reset failed before completion.");
    const result = { ok: false, message } satisfies ResetGroupStageTestingDataResult;
    console.error("[group-reset] reset failed", {
      message,
      error
    });
    return result;
  }
}

export async function fullPreLaunchTestResetAction(
  input: FullPreLaunchTestResetInput
): Promise<FullPreLaunchTestResetResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  if (input.confirmationText !== "FULL PRE-LAUNCH TEST RESET") {
    return { ok: false, message: "Full reset confirmation did not match. No data was changed." };
  }

  try {
    const trimmedReason = buildRequiredResetReason(input.reason);
    ensureRecoveryActionAllowed("full_test", "fullPreLaunchTestResetAction", {
      adminUserId: superAdminCheck.userId,
      adminEmail: superAdminCheck.email
    });

    const adminSupabase = createAdminClient();
    const groupSummary = await resetGroupStageTestingDataWithClient(adminSupabase);
    const knockoutSummary = await resetKnockoutTestingDataWithClient(adminSupabase);
    await clearTestingSocialStateWithClient(adminSupabase);
    const leaderboardResult = await recalculateLeaderboard(adminSupabase);
    if (!leaderboardResult.ok) {
      return leaderboardResult;
    }

    const resetMarkerWarning = await bumpDashboardUiResetEpoch("full pre-launch reset");
    const socialResetMarkerWarning = await bumpLeaderboardSocialResetTimestamp("full pre-launch reset");
    await writeAdminResetAuditLog(adminSupabase, {
      actorUserId: superAdminCheck.userId,
      actorEmail: superAdminCheck.email,
      actionKey: "full_prelaunch_test_reset",
      scope: "full_test",
      reason: trimmedReason,
      success: true,
      targetIds: [],
      affectedCounts: {
        groupResetMatchCount: groupSummary.resetMatchCount,
        knockoutResetMatchCount: knockoutSummary.reset_match_count,
        groupPredictions: groupSummary.deletedPredictions,
        groupPredictionScores: groupSummary.deletedPredictionScores,
        knockoutBracketPredictions: knockoutSummary.deleted_bracket_prediction_count,
        knockoutBracketScores: knockoutSummary.deleted_bracket_score_count,
        knockoutLegacyBracketPicks: knockoutSummary.deleted_legacy_bracket_pick_count ?? 0
      },
      details: {
        groupStatusBreakdownBeforeReset: groupSummary.statusBreakdown,
        knockoutStatusBreakdownBeforeReset: knockoutSummary.statusBreakdown
      }
    });

    revalidatePath("/");
    revalidatePath("/dashboard");
    revalidatePath("/groups");
    revalidatePath("/knockout");
    revalidatePath("/leaderboard");
    revalidatePath("/my-groups");
    revalidatePath("/profile");
    revalidatePath("/trophies");
    revalidatePath("/admin/matches");

    return {
      ok: true,
      groupResetMatchCount: groupSummary.resetMatchCount,
      knockoutResetMatchCount: knockoutSummary.reset_match_count,
      message: [resetMarkerWarning, socialResetMarkerWarning]
        .filter(Boolean)
        .reduce<string>(
          (message, warning) => `${message} ${warning}`,
          "Full pre-launch test reset completed. Group-stage, knockout, social, and derived leaderboard state were cleared."
        )
    };
  } catch (error) {
    return { ok: false, message: buildAdminActionErrorMessage(error, "Could not complete the full pre-launch test reset.") };
  }
}

export async function getDestructiveAdminToolStatusAction(): Promise<DestructiveAdminToolStatusResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  logTestingResetEnvDiagnostics("getDestructiveAdminToolStatusAction", {
    adminUserId: superAdminCheck.userId,
    adminEmail: superAdminCheck.email
  });
  const diagnostics = getResetDiagnostics();
  return {
    ok: true,
    scopes: {
      user: getTestingResetAvailability("user"),
      group: getTestingResetAvailability("group"),
      match: getTestingResetAvailability("match"),
      group_stage: getTestingResetAvailability("group_stage"),
      bracket_builder: getTestingResetAvailability("bracket_builder"),
      knockout: getTestingResetAvailability("knockout"),
      leaderboard: getTestingResetAvailability("leaderboard"),
      social: getTestingResetAvailability("social"),
      full_test: getTestingResetAvailability("full_test"),
      batch_finalize: getTestingResetAvailability("batch_finalize")
    },
    diagnostics,
    toolDefinitions: ADMIN_RESET_TOOL_DEFINITIONS
  };
}

async function resetKnockoutTestingDataWithClient(adminSupabase: ReturnType<typeof createAdminClient>) {
  const { data: knockoutMatches, error: knockoutMatchesError } = await adminSupabase
    .from("matches")
    .select("id,stage,status")
    .neq("stage", "group");

  if (knockoutMatchesError) {
    throw knockoutMatchesError;
  }

  const mappedKnockoutMatches = (knockoutMatches ?? []) as Array<{
    id: string;
    stage: MatchStage | string;
    status?: string | null;
  }>;
  const unknownNonGroupMatches = mappedKnockoutMatches.filter((match) => !isKnockoutStage(match.stage));
  if (unknownNonGroupMatches.length > 0) {
    throw new Error("Found non-group matches with unknown knockout stages. Aborting knockout reset.");
  }

  const knockoutMatchIds = mappedKnockoutMatches.map((match) => match.id);
  const statusBreakdown = buildResetStatusBreakdown(mappedKnockoutMatches.map((match) => match.status ?? "unknown"));
  if (knockoutMatchIds.length === 0) {
    throw new Error("No knockout matches were found. Aborting knockout reset.");
  }

  const { data: leaderboardEventRows, error: leaderboardEventRowsError } = await adminSupabase
    .from("leaderboard_events")
    .select("id")
    .in("match_id", knockoutMatchIds);
  if (leaderboardEventRowsError) {
    throw leaderboardEventRowsError;
  }

  const leaderboardEventIds = (leaderboardEventRows ?? []).map((row) => row.id);

  const [
    bracketPredictionsResult,
    projectedBracketPredictionsResult,
    legacyBracketPicksResult,
    bracketScoresResult,
    predictionScoresResult,
    leaderboardEventsResult,
    leaderboardSnapshotsResult,
    userNotificationsResult
  ] = await Promise.all([
    adminSupabase.from("bracket_predictions").select("id", { count: "exact", head: true }).in("match_id", knockoutMatchIds),
    adminSupabase.from("projected_bracket_predictions").select("id", { count: "exact", head: true }).in("match_id", knockoutMatchIds),
    countOptionalLegacyBracketPickRows(adminSupabase, knockoutMatchIds),
    adminSupabase.from("bracket_scores").select("id", { count: "exact", head: true }).in("match_id", knockoutMatchIds),
    adminSupabase.from("prediction_scores").select("id", { count: "exact", head: true }).in("match_id", knockoutMatchIds),
    adminSupabase.from("leaderboard_events").select("id", { count: "exact", head: true }).in("match_id", knockoutMatchIds),
    adminSupabase.from("leaderboard_snapshots").select("id", { count: "exact", head: true }).in("match_id", knockoutMatchIds),
    leaderboardEventIds.length > 0
      ? adminSupabase.from("user_notifications").select("id", { count: "exact", head: true }).in("event_id", leaderboardEventIds)
      : Promise.resolve({ count: 0, error: null } as { count: number; error: null })
  ]);

  for (const result of [
    bracketPredictionsResult,
    projectedBracketPredictionsResult,
    legacyBracketPicksResult,
    bracketScoresResult,
    predictionScoresResult,
    leaderboardEventsResult,
    leaderboardSnapshotsResult,
    userNotificationsResult
  ]) {
    if (result.error) {
      throw result.error;
    }
  }

  const deletionResults = await Promise.all([
    leaderboardEventIds.length > 0
      ? adminSupabase.from("user_notifications").delete().in("event_id", leaderboardEventIds)
      : Promise.resolve({ error: null }),
    adminSupabase.from("bracket_predictions").delete().in("match_id", knockoutMatchIds),
    adminSupabase.from("projected_bracket_predictions").delete().in("match_id", knockoutMatchIds),
    deleteOptionalLegacyBracketPickRows(adminSupabase, knockoutMatchIds),
    adminSupabase.from("bracket_scores").delete().in("match_id", knockoutMatchIds),
    adminSupabase.from("prediction_scores").delete().in("match_id", knockoutMatchIds),
    adminSupabase.from("leaderboard_snapshots").delete().in("match_id", knockoutMatchIds),
    adminSupabase.from("leaderboard_events").delete().in("match_id", knockoutMatchIds)
  ]);

  const failedDeletion = deletionResults.find((result) => result.error);
  if (failedDeletion?.error) {
    throw failedDeletion.error;
  }

  await clearKnockoutSeedingFlags(adminSupabase);

  const fullUpdateResult = await adminSupabase
    .from("matches")
    .update({
      home_team_id: null,
      away_team_id: null,
      home_score: null,
      away_score: null,
      status: "scheduled",
      winner_team_id: null,
      finalized_at: null,
      last_synced_at: null,
      is_manual_override: false,
      sync_status: null,
      sync_error: null,
      updated_at: new Date().toISOString()
    })
    .in("id", knockoutMatchIds);
  if (fullUpdateResult.error && !isOptionalResetColumnError(fullUpdateResult.error.message)) {
    throw fullUpdateResult.error;
  }

  let updatedMatches: Array<{ id: string }> | null = null;
  if (fullUpdateResult.error) {
    const fallbackUpdateResult = await adminSupabase
      .from("matches")
      .update({
        home_team_id: null,
        away_team_id: null,
        home_score: null,
        away_score: null,
        status: "scheduled",
        winner_team_id: null,
        updated_at: new Date().toISOString()
      })
      .in("id", knockoutMatchIds)
      .select("id");
    if (fallbackUpdateResult.error) {
      throw fallbackUpdateResult.error;
    }

    updatedMatches = fallbackUpdateResult.data ?? [];
  } else {
    const verificationResult = await adminSupabase.from("matches").select("id").in("id", knockoutMatchIds);
    if (verificationResult.error) {
      throw verificationResult.error;
    }

    updatedMatches = verificationResult.data ?? [];
  }

  return {
    targetMatchCount: knockoutMatchIds.length,
    statusBreakdown,
    reset_match_count: (updatedMatches ?? []).length,
    deleted_bracket_prediction_count: bracketPredictionsResult.count ?? 0,
    deleted_projected_bracket_prediction_count: projectedBracketPredictionsResult.count ?? 0,
    deleted_bracket_score_count: bracketScoresResult.count ?? 0,
    deleted_legacy_bracket_pick_count: legacyBracketPicksResult.count ?? 0,
    deleted_prediction_score_count: predictionScoresResult.count ?? 0,
    deleted_leaderboard_event_count: leaderboardEventsResult.count ?? 0,
    deleted_leaderboard_snapshot_count: leaderboardSnapshotsResult.count ?? 0,
    deleted_user_notification_count: userNotificationsResult.count ?? 0
  } satisfies KnockoutResetRpcRow;
}

async function resetGroupStageTestingDataWithClient(adminSupabase: ReturnType<typeof createAdminClient>) {
  const groupMatchesResult = await selectGroupResetMatches(adminSupabase);
  const { data: groupMatches, error: groupMatchesError } = groupMatchesResult;

  if (groupMatchesError) {
    throw new Error(buildAdminActionErrorMessage(groupMatchesError, "Could not load group-stage matches for reset."));
  }

  const mappedGroupMatches = (groupMatches ?? []) as Array<{
    id: string;
    stage: MatchStage | string;
    status?: string | null;
  }>;
  if (mappedGroupMatches.some((match) => match.stage !== "group")) {
    throw new Error("Found non-group matches in the group reset target set. Aborting group-stage reset.");
  }

  const groupMatchIds = mappedGroupMatches.map((match) => match.id);
  const statusBreakdown = buildResetStatusBreakdown(mappedGroupMatches.map((match) => match.status ?? "unknown"));
  if (groupMatchIds.length === 0) {
    throw new Error("No group-stage matches were found. Aborting group-stage reset.");
  }

  const { data: knockoutMatches, error: knockoutMatchesError } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_team_id,away_team_id,home_score,away_score,winner_team_id")
    .neq("stage", "group");

  if (knockoutMatchesError) {
    throw new Error(buildAdminActionErrorMessage(knockoutMatchesError, "Could not load knockout matches for derived artifact reset."));
  }

  const mappedKnockoutMatches = ((knockoutMatches ?? []) as MatchRow[]).filter((match) => isKnockoutStage(match.stage));
  const knockoutMatchIds = mappedKnockoutMatches.map((match) => match.id);
  const knockoutSeededRowsIfApplicable = mappedKnockoutMatches.filter(
    (match) =>
      match.home_team_id != null ||
      match.away_team_id != null ||
      match.home_score != null ||
      match.away_score != null ||
      match.winner_team_id != null ||
      match.status !== "scheduled"
  );

  const scoredOrFinalizedBeforeReset = (groupMatches ?? []).filter((match) => {
    const row = match as MatchRow;
    return (
      row.status !== "scheduled" ||
      row.home_score != null ||
      row.away_score != null ||
      row.winner_team_id != null ||
      row.finalized_at != null ||
      row.is_manual_override === true
    );
  }).length;

  const { data: leaderboardEventRows, error: leaderboardEventRowsError } = await adminSupabase
    .from("leaderboard_events")
    .select("id")
    .in("match_id", groupMatchIds);
  if (leaderboardEventRowsError) {
    throw new Error(buildAdminActionErrorMessage(leaderboardEventRowsError, "Could not load group-stage leaderboard events for reset."));
  }

  const leaderboardEventIds = (leaderboardEventRows ?? []).map((row) => row.id);
  const { data: knockoutLeaderboardEventRows, error: knockoutLeaderboardEventRowsError } = knockoutMatchIds.length
    ? await adminSupabase.from("leaderboard_events").select("id").in("match_id", knockoutMatchIds)
    : { data: [], error: null };
  if (knockoutLeaderboardEventRowsError) {
    throw new Error(
      buildAdminActionErrorMessage(
        knockoutLeaderboardEventRowsError,
        "Could not load knockout leaderboard events for derived artifact reset."
      )
    );
  }
  const allAffectedEventIds = [
    ...leaderboardEventIds,
    ...((knockoutLeaderboardEventRows ?? []).map((row) => row.id))
  ];

  const [
    predictionsResult,
    predictionScoresResult,
    leaderboardEventsResult,
    leaderboardSnapshotsResult,
    userNotificationsResult,
    knockoutSeedArtifactCountResult,
    userGroupSeedRankingsResult,
    userBestThirdRankingsResult
  ] = await Promise.all([
    adminSupabase.from("predictions").select("id", { count: "exact", head: true }).in("match_id", groupMatchIds),
    countOptionalMatchRows(adminSupabase, "prediction_scores", groupMatchIds),
    countOptionalMatchRows(adminSupabase, "leaderboard_events", groupMatchIds),
    countOptionalMatchRows(adminSupabase, "leaderboard_snapshots", groupMatchIds),
    allAffectedEventIds.length > 0
      ? countOptionalEventNotificationRows(adminSupabase, allAffectedEventIds)
      : Promise.resolve({ count: 0, error: null } as { count: number; error: null }),
    Promise.resolve({ count: 0, error: null } as { count: number; error: null }),
    countWholeTableRows(adminSupabase, "user_group_seed_rankings"),
    countWholeTableRows(adminSupabase, "user_best_third_rankings")
  ]);

  const inspectionResults = [
    { label: "predictions", result: predictionsResult, optional: false },
    { label: "prediction_scores", result: predictionScoresResult, optional: true },
    { label: "leaderboard_events", result: leaderboardEventsResult, optional: true },
    { label: "leaderboard_snapshots", result: leaderboardSnapshotsResult, optional: true },
    { label: "user_notifications", result: userNotificationsResult, optional: true },
    { label: "knockout_seed_artifacts", result: knockoutSeedArtifactCountResult, optional: true },
    { label: "user_group_seed_rankings", result: userGroupSeedRankingsResult, optional: true },
    { label: "user_best_third_rankings", result: userBestThirdRankingsResult, optional: true }
  ] as const;

  for (const { label, result, optional } of inspectionResults) {
    if (result.error) {
      if (optional) {
        console.warn("[group-reset:optional-inspection-skipped]", {
          label,
          message: buildAdminActionErrorMessage(result.error, "Optional inspection failed.")
        });
        continue;
      }

      throw new Error(
        buildAdminActionErrorMessage(result.error, `Could not inspect required group-stage testing rows before reset (${label}).`)
      );
    }
  }

  console.info("[group-reset:before]", {
    targetMatchCount: groupMatchIds.length,
    statusBreakdownBeforeReset: statusBreakdown,
    scoredOrFinalizedBeforeReset,
    generatedArtifactRowsBeforeReset:
      (leaderboardSnapshotsResult.count ?? 0) + (knockoutSeedArtifactCountResult.count ?? 0),
    knockoutSeededRowsBeforeReset: knockoutSeededRowsIfApplicable.length
  });

  const deletionResults = await Promise.all([
    leaderboardEventIds.length > 0
      ? adminSupabase.from("user_notifications").delete().in("event_id", leaderboardEventIds)
      : Promise.resolve({ error: null }),
    adminSupabase.from("predictions").delete().in("match_id", groupMatchIds),
    deleteWholeTableRowsOptional(adminSupabase, "user_group_seed_rankings"),
    deleteWholeTableRowsOptional(adminSupabase, "user_best_third_rankings"),
    deleteOptionalMatchRows(adminSupabase, "prediction_scores", groupMatchIds),
    deleteOptionalMatchRows(adminSupabase, "leaderboard_snapshots", groupMatchIds),
    deleteOptionalMatchRows(adminSupabase, "leaderboard_events", groupMatchIds)
  ]);
  const failedDeletion = deletionResults.find((result) => result.error);
  if (failedDeletion?.error) {
    throw new Error(buildAdminActionErrorMessage(failedDeletion.error, "Could not delete group-stage testing rows."));
  }

  let deletedKnockoutSeedArtifacts = 0;
  if (knockoutMatchIds.length > 0) {
    const knockoutDeletionResults = await Promise.all([
      knockoutLeaderboardEventRows.length > 0
        ? adminSupabase.from("user_notifications").delete().in(
            "event_id",
            knockoutLeaderboardEventRows.map((row) => row.id)
          )
        : Promise.resolve({ error: null }),
      adminSupabase.from("bracket_predictions").delete().in("match_id", knockoutMatchIds),
      adminSupabase.from("projected_bracket_predictions").delete().in("match_id", knockoutMatchIds),
      deleteOptionalLegacyBracketPickRows(adminSupabase, knockoutMatchIds),
      adminSupabase.from("bracket_scores").delete().in("match_id", knockoutMatchIds),
      adminSupabase.from("prediction_scores").delete().in("match_id", knockoutMatchIds),
      adminSupabase.from("leaderboard_snapshots").delete().in("match_id", knockoutMatchIds),
      adminSupabase.from("leaderboard_events").delete().in("match_id", knockoutMatchIds),
      adminSupabase
        .from("matches")
        .update({
          home_team_id: null,
          away_team_id: null,
          home_score: null,
          away_score: null,
          status: "scheduled",
          winner_team_id: null,
          finalized_at: null,
          last_synced_at: null,
          is_manual_override: false,
          sync_status: null,
          sync_error: null,
          updated_at: new Date().toISOString()
        })
        .in("id", knockoutMatchIds)
    ]);
    const failedKnockoutDeletion = knockoutDeletionResults.find((result) => result.error);
    if (failedKnockoutDeletion?.error) {
      if (!isOptionalResetColumnError(failedKnockoutDeletion.error.message)) {
        throw new Error(
          buildAdminActionErrorMessage(failedKnockoutDeletion.error, "Could not clear knockout artifacts derived from group testing.")
        );
      }

      const fallbackKnockoutUpdate = await adminSupabase
        .from("matches")
        .update({
          home_team_id: null,
          away_team_id: null,
          home_score: null,
          away_score: null,
          status: "scheduled",
          winner_team_id: null,
          updated_at: new Date().toISOString()
        })
        .in("id", knockoutMatchIds);

      if (fallbackKnockoutUpdate.error) {
        throw new Error(
          buildAdminActionErrorMessage(fallbackKnockoutUpdate.error, "Could not clear derived knockout match state with fallback reset.")
        );
      }
    }

    deletedKnockoutSeedArtifacts = knockoutSeededRowsIfApplicable.length;
    await clearKnockoutSeedingFlags(adminSupabase);
  }

  await updateGroupResetMatches(adminSupabase, groupMatchIds);

  const postResetResult = await selectGroupResetMatches(adminSupabase);
  if (postResetResult.error) {
    throw new Error(buildAdminActionErrorMessage(postResetResult.error, "Could not verify group-stage reset state after update."));
  }

  let postResetRows = ((postResetResult.data ?? []) as Array<{
    id: string;
    stage?: string | null;
    status?: string | null;
    home_score?: number | null;
    away_score?: number | null;
    winner_team_id?: string | null;
    finalized_at?: string | null;
    is_manual_override?: boolean | null;
  }>).filter((match) => match.stage === "group");
  let postResetStatusBreakdown = buildResetStatusBreakdown(postResetRows.map((match) => match.status ?? "unknown"));
  let lingeringRows = postResetRows.filter(
    (match) =>
      match.status !== "scheduled" ||
      match.home_score != null ||
      match.away_score != null ||
      match.winner_team_id != null ||
      match.finalized_at != null ||
      match.is_manual_override === true
  );

  if (lingeringRows.length > 0) {
    await updateGroupResetMatches(
      adminSupabase,
      lingeringRows.map((match) => match.id)
    );

    const secondPostResetResult = await selectGroupResetMatches(adminSupabase);
    if (secondPostResetResult.error) {
      throw new Error(
        buildAdminActionErrorMessage(secondPostResetResult.error, "Could not verify lingering group-stage rows after fallback reset.")
      );
    }

    postResetRows = ((secondPostResetResult.data ?? []) as Array<{
      id: string;
      stage?: string | null;
      status?: string | null;
      home_score?: number | null;
      away_score?: number | null;
      winner_team_id?: string | null;
      finalized_at?: string | null;
      is_manual_override?: boolean | null;
    }>).filter((match) => match.stage === "group");
    postResetStatusBreakdown = buildResetStatusBreakdown(postResetRows.map((match) => match.status ?? "unknown"));
    lingeringRows = postResetRows.filter(
      (match) =>
        match.status !== "scheduled" ||
        match.home_score != null ||
        match.away_score != null ||
        match.winner_team_id != null ||
        match.finalized_at != null ||
        match.is_manual_override === true
    );
  }

  const lingeringNonOpenMatchCount = postResetRows.filter((match) => match.status !== "scheduled").length;
  const lingeringScoredMatchCount = lingeringRows.length;

  console.info("[group-reset:after]", {
    resetMatchCount: postResetRows.length,
    statusBreakdownAfterReset: postResetStatusBreakdown,
    lingeringNonOpenMatchCount,
    lingeringScoredMatchCount,
    deletedPredictions: predictionsResult.count ?? 0,
    deletedPredictionScores: predictionScoresResult.count ?? 0,
    deletedLeaderboardEvents: leaderboardEventsResult.count ?? 0,
    deletedLeaderboardSnapshots: leaderboardSnapshotsResult.count ?? 0,
    deletedGeneratedArtifacts:
      (leaderboardSnapshotsResult.count ?? 0) + (knockoutSeedArtifactCountResult.count ?? 0),
    deletedKnockoutSeedArtifacts
  });

  return {
    targetMatchCount: groupMatchIds.length,
    statusBreakdown,
    resetMatchCount: postResetRows.length,
    deletedPredictions: predictionsResult.count ?? 0,
    deletedPredictionScores: predictionScoresResult.count ?? 0,
    deletedLeaderboardEvents: leaderboardEventsResult.count ?? 0,
    deletedLeaderboardSnapshots: leaderboardSnapshotsResult.count ?? 0,
    deletedUserNotifications: userNotificationsResult.count ?? 0,
    deletedGeneratedArtifacts: (leaderboardSnapshotsResult.count ?? 0) + (knockoutSeedArtifactCountResult.count ?? 0),
    deletedKnockoutSeedArtifacts,
    postResetStatusBreakdown,
    lingeringNonOpenMatchCount,
    lingeringScoredMatchCount
  } satisfies ResetOperationSummary;
}

async function countOptionalMatchRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tableName: "prediction_scores" | "leaderboard_events" | "leaderboard_snapshots",
  matchIds: string[]
) {
  const result = await adminSupabase.from(tableName).select("id", { count: "exact", head: true }).in("match_id", matchIds);
  if (result.error && isMissingRelationError(result.error.message, `public.${tableName}`)) {
    return { count: 0, error: null };
  }

  return result;
}

async function deleteOptionalMatchRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tableName: "prediction_scores" | "leaderboard_events" | "leaderboard_snapshots",
  matchIds: string[]
) {
  const result = await adminSupabase.from(tableName).delete().in("match_id", matchIds);
  if (result.error && isMissingRelationError(result.error.message, `public.${tableName}`)) {
    return { error: null };
  }

  return result;
}

async function countOptionalEventNotificationRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  eventIds: string[]
) {
  const result = await adminSupabase.from("user_notifications").select("id", { count: "exact", head: true }).in("event_id", eventIds);
  if (result.error && isMissingRelationError(result.error.message, "public.user_notifications")) {
    return { count: 0, error: null };
  }

  return result;
}

async function countWholeTableRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tableName:
    | "leaderboard_event_comments"
    | "leaderboard_event_reactions"
    | "user_notifications"
    | "leaderboard_events"
    | "user_trophies"
    | "leaderboard_snapshots"
    | "user_group_seed_rankings"
    | "user_best_third_rankings"
) {
  const result = await adminSupabase.from(tableName).select("id", { count: "exact", head: true });
  if (result.error && isMissingSocialResetTableError(result.error.message)) {
    return { count: 0, error: null };
  }

  return result;
}

async function deleteWholeTableRowsOptional(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tableName:
    | "leaderboard_event_comments"
    | "leaderboard_event_reactions"
    | "user_notifications"
    | "leaderboard_events"
    | "user_trophies"
    | "leaderboard_snapshots"
    | "user_group_seed_rankings"
    | "user_best_third_rankings"
) {
  const result = await adminSupabase.from(tableName).delete().not("id", "is", null);
  if (result.error && isMissingSocialResetTableError(result.error.message)) {
    return { error: null };
  }

  return result;
}

function buildResetStatusBreakdown(statuses: string[]) {
  return statuses.reduce<Record<string, number>>((accumulator, status) => {
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});
}

async function selectGroupResetMatches(adminSupabase: ReturnType<typeof createAdminClient>) {
  const fullSelect = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_score,away_score,winner_team_id,finalized_at,is_manual_override")
    .eq("stage", "group");

  if (!fullSelect.error) {
    return fullSelect;
  }

  if (!isOptionalResetColumnError(fullSelect.error.message)) {
    return fullSelect;
  }

  return adminSupabase
    .from("matches")
    .select("id,stage,status,home_score,away_score,winner_team_id")
    .eq("stage", "group");
}

async function updateGroupResetMatches(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupMatchIds: string[]
) {
  const fullUpdate = await adminSupabase
    .from("matches")
    .update({
      home_score: null,
      away_score: null,
      status: "scheduled",
      winner_team_id: null,
      finalized_at: null,
      last_synced_at: null,
      is_manual_override: false,
      sync_status: null,
      sync_error: null,
      updated_at: new Date().toISOString()
    })
    .in("id", groupMatchIds);

  if (!fullUpdate.error) {
    return fullUpdate;
  }

  if (!isOptionalResetColumnError(fullUpdate.error.message)) {
    return fullUpdate;
  }

  return adminSupabase
    .from("matches")
    .update({
      home_score: null,
      away_score: null,
      status: "scheduled",
      winner_team_id: null,
      updated_at: new Date().toISOString()
    })
    .in("id", groupMatchIds);
}

function isOptionalResetColumnError(message: string) {
  const optionalColumns = [
    "finalized_at",
    "last_synced_at",
    "is_manual_override",
    "sync_status",
    "sync_error"
  ];

  return optionalColumns.some((column) => isSchemaColumnMissing(message, column));
}

function buildAdminActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message ? message : fallback;
  }

  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const parts = [fallback];

    if (typeof maybeError.message === "string" && maybeError.message.trim()) {
      parts.push(maybeError.message.trim());
    }

    if (typeof maybeError.details === "string" && maybeError.details.trim()) {
      parts.push(`Details: ${maybeError.details.trim()}`);
    }

    if (typeof maybeError.hint === "string" && maybeError.hint.trim()) {
      parts.push(`Hint: ${maybeError.hint.trim()}`);
    }

    if (typeof maybeError.code === "string" && maybeError.code.trim()) {
      parts.push(`Code: ${maybeError.code.trim()}`);
    }

    return parts.join(" ");
  }

  if (typeof error === "string" && error.trim()) {
    return `${fallback} ${error.trim()}`;
  }

  return fallback;
}

function isSchemaColumnMissing(message: string, column: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes(column.toLowerCase()) &&
    ((normalized.includes("column") && normalized.includes("does not exist")) || normalized.includes("schema cache"))
  );
}

export async function seedKnockoutFromGroupStageAction(
  force = false
): Promise<SeedKnockoutFromGroupStageResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const result = await seedOfficialKnockoutFromFinalGroupResults(adminSupabase, {
    force,
    source: "manual",
    actorUserId: adminCheck.userId
  });

  if (result.ok) {
    revalidatePath("/");
    revalidatePath("/knockout");
    revalidatePath("/leaderboard");
    revalidatePath("/predictions");
    revalidatePath("/admin");
    revalidatePath("/admin/matches");
  }

  return result;
}

export async function fetchKnockoutSeedingStatusAction(): Promise<KnockoutSeedingStatusResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const adminSupabase = createAdminClient();
    const status = await fetchKnockoutSeedingAdminStatus(adminSupabase);
    return { ok: true, status };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load knockout seeding status."
    };
  }
}

export async function scoreFinalizedGroupMatch(matchId: string): Promise<ScoreMatchResult> {
  const adminCheck = await assertCurrentUserIsSuperAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const scoreableMatchResult = await loadScoreableMatch(adminSupabase, matchId);
  if (!scoreableMatchResult.ok) {
    return scoreableMatchResult;
  }

  if (!scoreableMatchResult.scoreable) {
    return scoreableMatchResult.result;
  }

  if (scoreableMatchResult.kind === "knockout") {
    try {
      const predictionsScored = await scoreFinalizedKnockoutMatchWithClient(adminSupabase, matchId);
      const leaderboardResult = await recalculateLeaderboard(adminSupabase, matchId);
      if (!leaderboardResult.ok) {
        return leaderboardResult;
      }

      revalidatePath("/");
      revalidatePath("/dashboard");
      revalidatePath("/leaderboard");
      revalidatePath("/knockout");
      revalidatePath("/admin/matches");
      revalidatePath("/profile");

      return {
        ok: true,
        scored: true,
        predictionsScored,
        message:
          predictionsScored === 0
            ? `Knockout match saved as final, but no bracket picks were found for match ${matchId}.`
            : `Knockout match saved and ${predictionsScored} bracket picks scored.`
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }

  const predictionsResult = await loadPredictionsForMatch(adminSupabase, matchId);
  if (!predictionsResult.ok) {
    return predictionsResult;
  }

  const scoredPredictions = scorePredictionsForMatch(scoreableMatchResult.match, predictionsResult.predictions);

  const persistedScoresResult = await persistPredictionScores(adminSupabase, scoredPredictions);
  if (!persistedScoresResult.ok) {
    return persistedScoresResult;
  }

  const trophiesAndNotificationsResult = await awardScoringRelatedTrophiesAndNotifications(adminSupabase, matchId, scoredPredictions);
  if (!trophiesAndNotificationsResult.ok) {
    return trophiesAndNotificationsResult;
  }

  // Totals and snapshots must reflect the newly persisted prediction rows before movement-based events are rebuilt.
  const leaderboardResult = await recalculateLeaderboardWithSnapshots(adminSupabase, matchId);
  if (!leaderboardResult.ok) {
    return leaderboardResult;
  }

  const leaderboardEventsResult = await rebuildLeaderboardEventsForMatch(adminSupabase, matchId, scoredPredictions);
  if (!leaderboardEventsResult.ok) {
    return leaderboardEventsResult;
  }

  await seedOfficialKnockoutFromFinalGroupResults(adminSupabase, {
    source: "auto",
    actorUserId: adminCheck.userId
  });

  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath("/predictions");
  revalidatePath("/admin/matches");
  revalidatePath("/profile");
  revalidatePath("/trophies");

  return {
    ok: true,
    scored: true,
    predictionsScored: predictionsResult.predictions.length,
    message:
      predictionsResult.predictions.length === 0
        ? `Match saved as final, but no Supabase prediction rows were found for match ${matchId}.`
        : `Match saved and ${predictionsResult.predictions.length} predictions scored.`
  };
}

function isBatchFinalizeScopeMatch(
  match: MatchRow & { status?: string | null },
  scope: BatchFinalizeMatchScope
) {
  const isKnockout = isKnockoutStage(match.stage);
  const status = match.status ?? "scheduled";

  switch (scope) {
    case "group-only":
      return match.stage === "group";
    case "knockout-only":
      return isKnockout;
    case "open-only":
      return status === "scheduled";
    case "locked-live-only":
      return status === "locked" || status === "live";
    case "open-locked-live":
      return status === "scheduled" || status === "locked" || status === "live";
    case "all":
    default:
      return true;
  }
}

function generateBatchFinalizeScore(
  match: MatchRow & {
    home_team?: { id: string; name: string; fifa_rank?: number | null } | Array<{ id: string; name: string; fifa_rank?: number | null }> | null;
    away_team?: { id: string; name: string; fifa_rank?: number | null } | Array<{ id: string; name: string; fifa_rank?: number | null }> | null;
  },
  style: BatchFinalizeMatchResultStyle
): { homeScore: number; awayScore: number; winnerTeamId: string | null } | null {
  if (!match.home_team_id || !match.away_team_id) {
    return null;
  }

  const homeTeam = normalizeBatchFinalizeTeamJoin(match.home_team);
  const awayTeam = normalizeBatchFinalizeTeamJoin(match.away_team);
  const isKnockout = isKnockoutStage(match.stage);
  const drawAllowed = !isKnockout && style !== "knockout-no-draw";

  const realisticScores: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [2, 0],
    [0, 1],
    [1, 2],
    [3, 1],
    [3, 2]
  ];
  const funScores: Array<[number, number]> = [
    [0, 0],
    [2, 2],
    [3, 3],
    [4, 2],
    [5, 3],
    [4, 1],
    [1, 4],
    [3, 0],
    [0, 3]
  ];
  const drawHeavyScores: Array<[number, number]> = [
    [0, 0],
    [1, 1],
    [2, 2],
    [1, 0],
    [0, 1],
    [2, 1],
    [1, 2]
  ];

  let [homeScore, awayScore] = pickRandomScore(
    style === "fun" ? funScores : style === "draw-heavy" ? drawHeavyScores : realisticScores
  );

  if (style === "favorites") {
    const homeRank = homeTeam?.fifa_rank ?? 999;
    const awayRank = awayTeam?.fifa_rank ?? 999;
    const homeFavored = homeRank <= awayRank;
    [homeScore, awayScore] = pickFavoriteScore(homeFavored, drawAllowed);
  }

  if (!drawAllowed && homeScore === awayScore) {
    const boostHome = Math.random() >= 0.5;
    if (boostHome) {
      homeScore += 1;
    } else {
      awayScore += 1;
    }
  }

  const winnerTeamId =
    homeScore === awayScore ? null : homeScore > awayScore ? match.home_team_id ?? null : match.away_team_id ?? null;

  return { homeScore, awayScore, winnerTeamId };
}

function normalizeBatchFinalizeTeamJoin(
  value:
    | { id: string; name: string; fifa_rank?: number | null }
    | Array<{ id: string; name: string; fifa_rank?: number | null }>
    | null
    | undefined
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function pickRandomScore(scores: Array<[number, number]>) {
  return scores[Math.floor(Math.random() * scores.length)] ?? [1, 0];
}

function pickFavoriteScore(homeFavored: boolean, drawAllowed: boolean): [number, number] {
  const favoredWins: Array<[number, number]> = homeFavored
    ? [
        [1, 0],
        [2, 0],
        [2, 1],
        [3, 1]
      ]
    : [
        [0, 1],
        [0, 2],
        [1, 2],
        [1, 3]
      ];

  const draws: Array<[number, number]> = [
    [0, 0],
    [1, 1]
  ];

  if (drawAllowed && Math.random() < 0.2) {
    return pickRandomScore(draws);
  }

  return pickRandomScore(favoredWins);
}

async function loadScoreableMatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
):
  Promise<
    | { ok: false; message: string }
    | { ok: true; scoreable: false; kind: "skip"; result: SkippedScoreMatchResult }
    | { ok: true; scoreable: true; kind: "group" | "knockout"; match: ReturnType<typeof mapMatchRow> }
  > {
  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_team_id,away_team_id,home_score,away_score,winner_team_id")
    .eq("id", matchId)
    .single();

  if (matchError) {
    return { ok: false, message: matchError.message };
  }

  const mappedMatch = mapMatchRow(match as MatchRow);
  if (!canScoreGroupMatch(mappedMatch)) {
    if (canScoreKnockoutMatch(mappedMatch)) {
      return { ok: true, scoreable: true, kind: "knockout", match: mappedMatch };
    }

    return {
      ok: true,
      scoreable: false,
      kind: "skip",
      result: {
        ok: true,
        scored: false,
        predictionsScored: 0,
        message: "Match saved. Scoring skipped because this match is not scoreable yet."
      }
    };
  }

  return { ok: true, scoreable: true, kind: "group", match: mappedMatch };
}

async function loadPredictionsForMatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
): Promise<{ ok: true; predictions: PredictionRow[] } | { ok: false; message: string }> {
  const { data: predictions, error: predictionsError } = await adminSupabase
    .from("predictions")
    .select(
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score"
    )
    .eq("match_id", matchId);

  if (predictionsError) {
    return { ok: false, message: predictionsError.message };
  }

  return { ok: true, predictions: (predictions ?? []) as PredictionRow[] };
}

function scorePredictionsForMatch(match: ReturnType<typeof mapMatchRow>, predictions: PredictionRow[]): ScoredPrediction[] {
  return predictions.map((prediction) => {
    const scoreBreakdown = scoreGroupStagePrediction(
      {
        predictedWinnerTeamId: prediction.predicted_winner_team_id,
        predictedIsDraw: prediction.predicted_is_draw,
        predictedHomeScore: prediction.predicted_home_score,
        predictedAwayScore: prediction.predicted_away_score
      },
      match
    );

    return {
      predictionId: prediction.id,
      userId: prediction.user_id,
      matchId: prediction.match_id,
      scoreBreakdown
    };
  });
}

async function persistPredictionScores(
  adminSupabase: ReturnType<typeof createAdminClient>,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const predictionUpdates = scoredPredictions.map((prediction) =>
    adminSupabase
      .from("predictions")
      .update({
        points_awarded: prediction.scoreBreakdown.points
      })
      .eq("id", prediction.predictionId)
  );

  const updateResults = await Promise.all(predictionUpdates);
  const failedPredictionUpdate = updateResults.find((result) => result.error);
  if (failedPredictionUpdate?.error) {
    return { ok: false, message: failedPredictionUpdate.error.message };
  }

  if (scoredPredictions.length === 0) {
    return { ok: true };
  }

  const { error: predictionScoresError } = await adminSupabase
    .from("prediction_scores")
    .upsert(
      scoredPredictions.map((prediction) => ({
        prediction_id: prediction.predictionId,
        match_id: prediction.matchId,
        user_id: prediction.userId,
        points: prediction.scoreBreakdown.points,
        outcome_points: prediction.scoreBreakdown.outcome_points,
        exact_score_points: prediction.scoreBreakdown.exact_score_points,
        goal_difference_points: prediction.scoreBreakdown.goal_difference_points,
        scored_at: new Date().toISOString()
      })),
      { onConflict: "prediction_id,match_id" }
    );

  if (predictionScoresError) {
    return { ok: false, message: predictionScoresError.message };
  }

  return { ok: true };
}

async function recalculateLeaderboardWithSnapshots(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return recalculateLeaderboard(adminSupabase, matchId);
}

async function rebuildLeaderboardEventsForMatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const eventResult = await recreateGlobalLeaderboardEventsForMatch(adminSupabase, matchId, scoredPredictions);
  if (!eventResult.ok) {
    return eventResult;
  }

  return recreateGroupLeaderboardEventsForMatch(adminSupabase, matchId, scoredPredictions);
}

async function awardScoringRelatedTrophiesAndNotifications(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  void matchId;

  if (scoredPredictions.length === 0) {
    return { ok: true };
  }

  return awardPerfectPickFirstTrophy(adminSupabase, scoredPredictions);
}

async function awardPerfectPickFirstTrophy(
  adminSupabase: ReturnType<typeof createAdminClient>,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const socialResetCutoffIso = await fetchLeaderboardSocialResetCutoffIso();
  const qualifyingUserIds = Array.from(
    new Set(
      scoredPredictions
        .filter((prediction) => prediction.scoreBreakdown.exact_score_points > 0)
        .map((prediction) => prediction.userId)
    )
  );

  if (qualifyingUserIds.length === 0) {
    return { ok: true };
  }

  const { data: trophy, error: trophyError } = await adminSupabase
    .from("trophies")
    .select("id")
    .eq("key", "perfect_pick_first")
    .maybeSingle();

  if (trophyError) {
    if (isMissingTrophiesError(trophyError.message)) {
      return { ok: true };
    }

    return { ok: false, message: trophyError.message };
  }

  if (!(trophy as TrophyRow | null)?.id) {
    return { ok: true };
  }

  const { data: exactScoreRows, error: exactScoreRowsError } = await adminSupabase
    .from("prediction_scores")
    .select("user_id")
    .in("user_id", qualifyingUserIds)
    .gt("exact_score_points", 0)
    .gte("scored_at", socialResetCutoffIso ?? "1970-01-01T00:00:00.000Z");

  if (exactScoreRowsError) {
    if (isMissingTrophiesError(exactScoreRowsError.message)) {
      return { ok: true };
    }

    return { ok: false, message: exactScoreRowsError.message };
  }

  const exactScoreCounts = new Map<string, number>();
  for (const row of ((exactScoreRows ?? []) as Array<{ user_id: string }>)) {
    exactScoreCounts.set(row.user_id, (exactScoreCounts.get(row.user_id) ?? 0) + 1);
  }

  const firstPerfectPickUserIds = qualifyingUserIds.filter((userId) => (exactScoreCounts.get(userId) ?? 0) === 1);
  if (firstPerfectPickUserIds.length === 0) {
    return { ok: true };
  }

  const { data: existingAwards, error: existingAwardsError } = await adminSupabase
    .from("user_trophies")
    .select("user_id")
    .eq("trophy_id", (trophy as TrophyRow).id)
    .in("user_id", firstPerfectPickUserIds);

  if (existingAwardsError) {
    if (isMissingTrophiesError(existingAwardsError.message)) {
      return { ok: true };
    }

    return { ok: false, message: existingAwardsError.message };
  }

  const existingAwardUserIds = new Set(((existingAwards ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
  const newlyAwardedUserIds = firstPerfectPickUserIds.filter((userId) => !existingAwardUserIds.has(userId));
  if (newlyAwardedUserIds.length === 0) {
    return { ok: true };
  }

  const awardedAt = new Date().toISOString();

  const { error: awardError } = await adminSupabase.from("user_trophies").upsert(
    newlyAwardedUserIds.map((userId) => ({
      user_id: userId,
      trophy_id: (trophy as TrophyRow).id,
      awarded_at: awardedAt
    })),
    { onConflict: "user_id,trophy_id" }
  );

  if (awardError) {
    if (isMissingTrophiesError(awardError.message)) {
      return { ok: true };
    }

    return { ok: false, message: awardError.message };
  }

  await createTrophyEarnedNotifications({
    adminSupabase,
    awards: newlyAwardedUserIds.map((userId) => ({
      userId,
      trophyId: (trophy as TrophyRow).id,
      trophyName: "First Perfect Pick",
      trophyIcon: "🎯",
      trophyTier: "bronze",
      trophyDescription: "Awarded for landing your first exact score.",
      awardedAt
    }))
  });

  return { ok: true };
}

async function fetchLeaderboardSocialResetCutoffIso() {
  const resetAtValue = await fetchIntegerAppSetting(LEADERBOARD_SOCIAL_RESET_AT_SETTING_KEY, 0);
  if (resetAtValue <= 0) {
    return null;
  }

  const resetAtMs = resetAtValue >= 100_000_000_000 ? resetAtValue : resetAtValue * 1000;
  return new Date(resetAtMs).toISOString();
}

async function assertCurrentUserIsAdmin(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in as an admin to score matches." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false, message: "Only admins can score matches." };
  }

  return { ok: true, userId: user.id };
}

async function assertCurrentUserIsSuperAdmin(): Promise<
  { ok: true; userId: string; email: string | null } | { ok: false; message: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in as a super admin to use destructive admin tools." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role,email")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false, message: "Only super admins can use destructive admin tools." };
  }

  return { ok: true, userId: user.id, email: profile.email ?? user.email ?? null };
}

async function recalculateLeaderboard(
  adminSupabase: ReturnType<typeof createAdminClient>,
  triggeringMatchId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  // Admin finalization and automated match sync must share the same rebuild path.
  return rebuildScopedLeaderboardState(adminSupabase, {
    triggeringMatchId
  });
}

async function recreateGlobalLeaderboardEventsForMatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const globalEventTypes = ["points_awarded", "perfect_pick", "rank_moved_up", "rank_moved_down"] as const;
  const events: LeaderboardEventInsert[] = [];
  const eventTimestamp = await fetchLeaderboardEventTimestampForMatch(adminSupabase, matchId);

  for (const prediction of scoredPredictions) {
    if (prediction.scoreBreakdown.points > 0) {
      events.push({
        event_type: "points_awarded",
        scope_type: "global",
        group_id: null,
        match_id: matchId,
        user_id: prediction.userId,
        related_user_id: null,
        points_delta: prediction.scoreBreakdown.points,
        rank_delta: null,
        message: buildPointsAwardedMessage(prediction.scoreBreakdown.points),
        metadata: {
          predictionId: prediction.predictionId,
          outcomePoints: prediction.scoreBreakdown.outcome_points,
          exactScorePoints: prediction.scoreBreakdown.exact_score_points,
          goalDifferencePoints: prediction.scoreBreakdown.goal_difference_points
        },
        created_at: eventTimestamp
      });
    }

    if (prediction.scoreBreakdown.exact_score_points > 0) {
      events.push({
        event_type: "perfect_pick",
        scope_type: "global",
        group_id: null,
        match_id: matchId,
        user_id: prediction.userId,
        related_user_id: null,
        points_delta: prediction.scoreBreakdown.points,
        rank_delta: null,
        message: "nailed a Perfect Pick",
        metadata: {
          predictionId: prediction.predictionId,
          exactScorePoints: prediction.scoreBreakdown.exact_score_points
        },
        created_at: eventTimestamp
      });
    }
  }

  const movementRows = await fetchGlobalLeaderboardRankMovement(matchId);
  for (const movement of movementRows) {
    if ((movement.rank_delta ?? 0) > 0) {
      events.push({
        event_type: "rank_moved_up",
        scope_type: "global",
        group_id: null,
        match_id: matchId,
        user_id: movement.user_id,
        related_user_id: null,
        points_delta: movement.points_delta,
        rank_delta: movement.rank_delta,
        message: `moved up ${movement.rank_delta} ${movement.rank_delta === 1 ? "spot" : "spots"}`,
        metadata: {
          currentRank: movement.current_rank,
          previousRank: movement.previous_rank,
          currentPoints: movement.current_points,
          previousPoints: movement.previous_points
        },
        created_at: eventTimestamp
      });
    }

    if ((movement.rank_delta ?? 0) < 0) {
      const spotsDropped = Math.abs(movement.rank_delta ?? 0);
      events.push({
        event_type: "rank_moved_down",
        scope_type: "global",
        group_id: null,
        match_id: matchId,
        user_id: movement.user_id,
        related_user_id: null,
        points_delta: movement.points_delta,
        rank_delta: movement.rank_delta,
        message: `moved down ${spotsDropped} ${spotsDropped === 1 ? "spot" : "spots"}`,
        metadata: {
          currentRank: movement.current_rank,
          previousRank: movement.previous_rank,
          currentPoints: movement.current_points,
          previousPoints: movement.previous_points
        },
        created_at: eventTimestamp
      });
    }
  }

  const { error: deleteError } = await adminSupabase
    .from("leaderboard_events")
    .delete()
    .eq("scope_type", "global")
    .eq("match_id", matchId)
    .is("group_id", null)
    .in("event_type", [...globalEventTypes]);

  if (deleteError) {
    return { ok: false, message: deleteError.message };
  }

  if (events.length === 0) {
    return { ok: true };
  }

  const userIds = Array.from(new Set(events.map((event) => event.user_id)));
  const { data: users, error: usersError } = await adminSupabase.from("users").select("id,name").in("id", userIds);

  if (usersError) {
    return { ok: false, message: usersError.message };
  }

  const namesById = new Map((((users as Array<{ id: string; name: string }> | null) ?? []).map((user) => [user.id, user.name])));

  const { data: insertedEvents, error: insertError } = await adminSupabase
    .from("leaderboard_events")
    .insert(
      events.map((event) => ({
        ...event,
        message: `${namesById.get(event.user_id) ?? "A player"} ${event.message}`
      }))
    )
    .select("id,event_type,scope_type,group_id,user_id,points_delta,rank_delta,message");

  if (insertError) {
    return { ok: false, message: insertError.message };
  }

  await createNotificationsForLeaderboardEvents(
    adminSupabase,
    ((insertedEvents as InsertedLeaderboardEventRow[] | null) ?? [])
  );

  return { ok: true };
}

async function recreateGroupLeaderboardEventsForMatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const groupEventTypes = ["points_awarded", "perfect_pick", "rank_moved_up", "rank_moved_down"] as const;
  const eventTimestamp = await fetchLeaderboardEventTimestampForMatch(adminSupabase, matchId);
  const { data: memberships, error: membershipsError } = await adminSupabase
    .from("group_members")
    .select("group_id,user_id");

  if (membershipsError) {
    return { ok: false, message: membershipsError.message };
  }

  const groupIdsByUserId = new Map<string, string[]>();
  const memberUserIdsByGroupId = new Map<string, Set<string>>();

  for (const membership of ((memberships as Array<{ group_id: string; user_id: string }> | null) ?? [])) {
    const userGroups = groupIdsByUserId.get(membership.user_id) ?? [];
    userGroups.push(membership.group_id);
    groupIdsByUserId.set(membership.user_id, userGroups);

    const groupMembers = memberUserIdsByGroupId.get(membership.group_id) ?? new Set<string>();
    groupMembers.add(membership.user_id);
    memberUserIdsByGroupId.set(membership.group_id, groupMembers);
  }

  const eventsByGroupId = new Map<string, LeaderboardEventInsert[]>();

  for (const prediction of scoredPredictions) {
    const groupIds = groupIdsByUserId.get(prediction.userId) ?? [];

    for (const groupId of groupIds) {
      const events = eventsByGroupId.get(groupId) ?? [];

      if (prediction.scoreBreakdown.points > 0) {
        events.push({
          event_type: "points_awarded",
          scope_type: "group",
          group_id: groupId,
          match_id: matchId,
          user_id: prediction.userId,
          related_user_id: null,
          points_delta: prediction.scoreBreakdown.points,
          rank_delta: null,
          message: buildPointsAwardedMessage(prediction.scoreBreakdown.points),
          metadata: {
            predictionId: prediction.predictionId,
            outcomePoints: prediction.scoreBreakdown.outcome_points,
            exactScorePoints: prediction.scoreBreakdown.exact_score_points,
            goalDifferencePoints: prediction.scoreBreakdown.goal_difference_points
          },
          created_at: eventTimestamp
        });
      }

      if (prediction.scoreBreakdown.exact_score_points > 0) {
        events.push({
          event_type: "perfect_pick",
          scope_type: "group",
          group_id: groupId,
          match_id: matchId,
          user_id: prediction.userId,
          related_user_id: null,
          points_delta: prediction.scoreBreakdown.points,
          rank_delta: null,
          message: "nailed a Perfect Pick",
          metadata: {
            predictionId: prediction.predictionId,
            exactScorePoints: prediction.scoreBreakdown.exact_score_points
          },
          created_at: eventTimestamp
        });
      }

      eventsByGroupId.set(groupId, events);
    }
  }

  for (const [groupId, memberUserIds] of memberUserIdsByGroupId.entries()) {
    if (memberUserIds.size === 0) {
      continue;
    }

    const movementRows = await fetchGroupLeaderboardRankMovement(matchId, groupId);
    const events = eventsByGroupId.get(groupId) ?? [];

    for (const movement of movementRows) {
      if (!memberUserIds.has(movement.user_id)) {
        continue;
      }

      if ((movement.rank_delta ?? 0) > 0) {
        events.push({
          event_type: "rank_moved_up",
          scope_type: "group",
          group_id: groupId,
          match_id: matchId,
          user_id: movement.user_id,
          related_user_id: null,
          points_delta: movement.points_delta,
          rank_delta: movement.rank_delta,
          message: `moved up ${movement.rank_delta} ${movement.rank_delta === 1 ? "spot" : "spots"}`,
          metadata: {
            currentRank: movement.current_rank,
            previousRank: movement.previous_rank,
            currentPoints: movement.current_points,
            previousPoints: movement.previous_points
          },
          created_at: eventTimestamp
        });
      }

      if ((movement.rank_delta ?? 0) < 0) {
        const spotsDropped = Math.abs(movement.rank_delta ?? 0);
        events.push({
          event_type: "rank_moved_down",
          scope_type: "group",
          group_id: groupId,
          match_id: matchId,
          user_id: movement.user_id,
          related_user_id: null,
          points_delta: movement.points_delta,
          rank_delta: movement.rank_delta,
          message: `moved down ${spotsDropped} ${spotsDropped === 1 ? "spot" : "spots"}`,
          metadata: {
            currentRank: movement.current_rank,
            previousRank: movement.previous_rank,
            currentPoints: movement.current_points,
            previousPoints: movement.previous_points
          },
          created_at: eventTimestamp
        });
      }
    }

    eventsByGroupId.set(groupId, events);
  }

  const groupIds = Array.from(eventsByGroupId.keys());
  if (groupIds.length === 0) {
    return { ok: true };
  }

  const { error: deleteError } = await adminSupabase
    .from("leaderboard_events")
    .delete()
    .eq("scope_type", "group")
    .eq("match_id", matchId)
    .in("group_id", groupIds)
    .in("event_type", [...groupEventTypes]);

  if (deleteError) {
    return { ok: false, message: deleteError.message };
  }

  const allEvents = Array.from(eventsByGroupId.values()).flat();
  if (allEvents.length === 0) {
    return { ok: true };
  }

  const userIds = Array.from(new Set(allEvents.map((event) => event.user_id)));
  const { data: users, error: usersError } = await adminSupabase.from("users").select("id,name").in("id", userIds);

  if (usersError) {
    return { ok: false, message: usersError.message };
  }

  const namesById = new Map((((users as Array<{ id: string; name: string }> | null) ?? []).map((user) => [user.id, user.name])));

  const { data: insertedEvents, error: insertError } = await adminSupabase
    .from("leaderboard_events")
    .insert(
      allEvents.map((event) => ({
        ...event,
        message: `${namesById.get(event.user_id) ?? "A player"} ${event.message}`
      }))
    )
    .select("id,event_type,scope_type,group_id,user_id,points_delta,rank_delta,message");

  if (insertError) {
    return { ok: false, message: insertError.message };
  }

  await createNotificationsForLeaderboardEvents(
    adminSupabase,
    ((insertedEvents as InsertedLeaderboardEventRow[] | null) ?? [])
  );

  return { ok: true };
}

function buildPointsAwardedMessage(points: number) {
  return `earned +${points} ${points === 1 ? "point" : "points"}`;
}

async function fetchLeaderboardEventTimestampForMatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
) {
  const { data, error } = await adminSupabase
    .from("matches")
    .select("finalized_at,last_synced_at,kickoff_at,updated_at")
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const match = data as Pick<MatchRow, "finalized_at" | "last_synced_at" | "kickoff_at" | "updated_at"> | null;
  return match?.finalized_at ?? match?.last_synced_at ?? match?.kickoff_at ?? match?.updated_at ?? new Date().toISOString();
}

async function clearDerivedGroupMatchScoringState(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  // Preserve the pick inputs themselves. Only derived scoring state is cleared here.
  const [{ data: affectedPredictions, error: affectedPredictionsError }, { data: groupMemberships, error: groupMembershipsError }] =
    await Promise.all([
      adminSupabase.from("predictions").select("user_id").eq("match_id", matchId),
      adminSupabase.from("group_members").select("group_id,user_id")
    ]);

  if (affectedPredictionsError) {
    return { ok: false, message: affectedPredictionsError.message };
  }

  if (groupMembershipsError) {
    return { ok: false, message: groupMembershipsError.message };
  }

  const affectedUserIds = new Set(
    (((affectedPredictions as Array<{ user_id: string }> | null) ?? []).map((prediction) => prediction.user_id))
  );
  const affectedGroupIds = Array.from(
    new Set(
      (((groupMemberships as Array<{ group_id: string; user_id: string }> | null) ?? [])
        .filter((membership) => affectedUserIds.has(membership.user_id))
        .map((membership) => membership.group_id))
    )
  );

  const [
    predictionResetResult,
    predictionScoresDeleteResult,
    snapshotsDeleteResult,
    eventsDeleteResult
  ] = await Promise.all([
    adminSupabase
      .from("predictions")
      .update({ points_awarded: 0 })
      .eq("match_id", matchId),
    adminSupabase.from("prediction_scores").delete().eq("match_id", matchId),
    adminSupabase.from("leaderboard_snapshots").delete().eq("match_id", matchId),
    adminSupabase.from("leaderboard_events").delete().eq("match_id", matchId)
  ]);

  if (predictionResetResult.error) {
    return { ok: false, message: predictionResetResult.error.message };
  }

  if (predictionScoresDeleteResult.error) {
    return { ok: false, message: predictionScoresDeleteResult.error.message };
  }

  if (snapshotsDeleteResult.error) {
    return { ok: false, message: snapshotsDeleteResult.error.message };
  }

  if (eventsDeleteResult.error) {
    return { ok: false, message: eventsDeleteResult.error.message };
  }

  const leaderboardResult = await recalculateLeaderboard(adminSupabase);
  if (!leaderboardResult.ok) {
    return leaderboardResult;
  }

  await fetchDailyWinners();
  await Promise.all(affectedGroupIds.map((groupId) => fetchDailyWinners(groupId)));

  return { ok: true };
}

function mapMatchRow(row: MatchRow) {
  return {
    id: row.id,
    stage: row.stage,
    groupName: row.group_name ?? undefined,
    status: row.status,
    homeTeamId: row.home_team_id ?? undefined,
    awayTeamId: row.away_team_id ?? undefined,
    homeSource: row.home_source ?? undefined,
    awaySource: row.away_source ?? undefined,
    kickoffTime: row.kickoff_time ?? "",
    kickoffAt: row.kickoff_at ?? row.kickoff_time ?? null,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    winnerTeamId: row.winner_team_id ?? undefined,
    finalizedAt: row.finalized_at ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    externalId: row.external_id ?? null,
    isManualOverride: row.is_manual_override ?? false,
    syncStatus: row.sync_status ?? null,
    syncError: row.sync_error ?? null,
    nextMatchId: row.next_match_id ?? null,
    nextMatchSlot: row.next_match_slot ?? null,
    updatedAt: row.updated_at ?? undefined
  };
}

async function findAuthUserByEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  normalizedEmail: string
): Promise<AuthUserSummary | null> {
  let page = 1;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(error.message);
    }

    const matchedUser = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail
    );

    if (matchedUser) {
      return {
        id: matchedUser.id,
        email: matchedUser.email,
        emailConfirmedAt: matchedUser.email_confirmed_at ?? null,
        confirmationSentAt: matchedUser.confirmation_sent_at ?? null,
        lastSignInAt: matchedUser.last_sign_in_at ?? null
      };
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

function formatLeaderboardFeatureSettingLabel(key: LeaderboardFeatureSettingKey) {
  switch (key) {
    case "daily_winner_enabled":
      return "Daily Winner";
    case "perfect_pick_enabled":
      return "Perfect Pick";
    case "leaderboard_activity_enabled":
      return "Leaderboard activity";
    case "leaderboard_comments_enabled":
      return "Leaderboard comments";
    case "projected_leaderboard_enabled":
      return "Projected leaderboard";
    default:
      return "Leaderboard feature";
  }
}

async function enforceEmailRateLimits(
  adminSupabase: ReturnType<typeof createAdminClient>,
  adminUserId: string,
  normalizedEmail: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await hasEmailJobsTable(adminSupabase))) {
    return { ok: true };
  }

  const now = Date.now();
  const adminWindowStart = new Date(now - 60_000).toISOString();
  const emailWindowStart = new Date(now - 10 * 60_000).toISOString();
  const globalWindowStart = new Date(now - 60 * 60_000).toISOString();

  const [
    { count: adminCount, error: adminRateError },
    { count: emailCount, error: emailRateError },
    { count: globalCount, error: globalRateError }
  ] = await Promise.all([
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .eq("requested_by_admin_id", adminUserId)
      .gte("created_at", adminWindowStart),
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .eq("email", normalizedEmail)
      .gte("created_at", emailWindowStart),
    adminSupabase
      .from("email_jobs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", globalWindowStart)
  ]);

  if (adminRateError || emailRateError || globalRateError) {
    return {
      ok: false,
      message: adminRateError?.message ?? emailRateError?.message ?? globalRateError?.message ?? "Rate limit lookup failed."
    };
  }

  if ((adminCount ?? 0) >= 10) {
    return { ok: false, message: "You have reached the limit of 10 access emails per minute. Please wait a minute and try again." };
  }

  if ((emailCount ?? 0) >= 1) {
    return { ok: false, message: "That email was sent recently. Please wait 10 minutes before sending again." };
  }

  if ((globalCount ?? 0) >= 100) {
    return { ok: false, message: "Email sending is temporarily capped for the app. Please try again shortly." };
  }

  return { ok: true };
}

async function upsertInviteRow(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    email: string;
    displayName: string;
    language: string;
    role: UserRole;
    planTier: CommercialTier;
    status: "pending" | "accepted" | "revoked" | "expired" | "failed";
    lastError: string | null;
    preserveAcceptedAt?: string | null;
    incrementAttempts?: boolean;
    setLastSentAt?: boolean;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  let nextSendAttempts: number | undefined;

  if (input.incrementAttempts) {
    const { data: currentInvite, error: currentInviteError } = await adminSupabase
      .from("invites")
      .select("send_attempts")
      .eq("email", input.email)
      .maybeSingle();

    if (currentInviteError) {
      return { ok: false, message: currentInviteError.message };
    }

    nextSendAttempts = (currentInvite?.send_attempts ?? 0) + 1;
  }

  const fullPayload = {
    email: input.email,
    display_name: input.displayName,
    language: normalizeLanguage(input.language),
    role: input.role,
    plan_tier: input.planTier,
    accepted_at: input.preserveAcceptedAt ?? null,
    status: input.status,
    last_error: input.lastError,
    ...(nextSendAttempts !== undefined ? { send_attempts: nextSendAttempts } : {}),
    ...(input.setLastSentAt ? { last_sent_at: new Date().toISOString() } : {})
  };

  const { error } = await adminSupabase.from("invites").upsert(fullPayload, { onConflict: "email" });

  if (error) {
    if (!isMissingInviteLifecycleColumnError(error.message)) {
      return { ok: false, message: error.message };
    }

    const minimalPayload = {
      email: input.email,
      display_name: input.displayName,
      role: input.role,
      accepted_at: input.preserveAcceptedAt ?? null
    };

    const { error: fallbackError } = await adminSupabase.from("invites").upsert(minimalPayload, { onConflict: "email" });
    if (fallbackError) {
      return { ok: false, message: fallbackError.message };
    }
  }

  return { ok: true };
}

async function enqueueEmailJob(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    kind: EmailJobKind;
    email: string;
    requestedByAdminId: string;
    payload: EmailJobPayload;
  }
): Promise<EnqueueEmailJobResult> {
  const { error } = await adminSupabase.from("email_jobs").insert({
    kind: input.kind,
    email: input.email,
    dedupe_key: `${input.kind}:${input.email}`,
    payload: input.payload,
    requested_by_admin_id: input.requestedByAdminId
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, alreadyQueued: true };
    }

    return { ok: false, message: error.message };
  }

  return { ok: true, alreadyQueued: false };
}

async function buildUserDemotionImpact(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  targetAccessLevel: AccessLevel
): Promise<DemotionImpactSummary> {
  if (targetAccessLevel === "super_admin") {
    throw new Error("Use promotion/access setup to grant Super Admin. Demotion flow cannot target Super Admin.");
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    throw new Error("A valid user is required.");
  }

  const [
    { data: existingUser, error: existingUserError },
    managerLimitsResult,
    ownedGroupsResult,
    managedMembershipsResult,
    organizationsResult,
    customTrophiesResult,
    createdAccessCodesResult,
    sidePickPackagesResult,
    sidePickDefinitionsResult,
    groupRulesetsResult
  ] = await Promise.all([
    adminSupabase
      .from("users")
      .select("id,email,name,preferred_language,role,plan_tier")
      .eq("id", trimmedUserId)
      .maybeSingle(),
    adminSupabase.from("manager_limits").select("user_id,max_groups,max_members_per_group").eq("user_id", trimmedUserId).maybeSingle(),
    adminSupabase
      .from("groups")
      .select("id,name,status,membership_limit,group_members(count)")
      .eq("owner_user_id", trimmedUserId),
    adminSupabase
      .from("group_members")
      .select("id,group_id")
      .eq("user_id", trimmedUserId)
      .eq("role", "manager"),
    adminSupabase.from("organizations").select("id").eq("owner_user_id", trimmedUserId),
    adminSupabase
      .from("trophies")
      .select("id", { count: "exact", head: true })
      .eq("created_by", trimmedUserId)
      .not("group_id", "is", null),
    adminSupabase
      .from("access_codes")
      .select("id", { count: "exact", head: true })
      .eq("created_by", trimmedUserId)
      .eq("active", true),
    adminSupabase
      .from("side_pick_packages")
      .select("id", { count: "exact", head: true })
      .eq("created_by_user_id", trimmedUserId),
    adminSupabase
      .from("side_pick_definitions")
      .select("id", { count: "exact", head: true })
      .eq("created_by_user_id", trimmedUserId),
    adminSupabase
      .from("group_rulesets")
      .select("id", { count: "exact", head: true })
      .eq("created_by_user_id", trimmedUserId)
  ]);

  if (existingUserError) {
    throw new Error(existingUserError.message);
  }

  if (!existingUser) {
    throw new Error("That user was not found.");
  }

  if (managerLimitsResult.error) {
    throw new Error(managerLimitsResult.error.message);
  }

  if (ownedGroupsResult.error) {
    throw new Error(ownedGroupsResult.error.message);
  }

  if (managedMembershipsResult.error) {
    throw new Error(managedMembershipsResult.error.message);
  }

  let organizationOwnershipRows: Array<{ id: string }> = [];
  if (organizationsResult.error) {
    if (!isMissingRelationError(organizationsResult.error.message, "public.organizations")) {
      throw new Error(organizationsResult.error.message);
    }
  } else {
    organizationOwnershipRows = ((organizationsResult.data as Array<{ id: string }> | null) ?? []);
  }

  let customTrophyOwnershipCount = 0;
  if (customTrophiesResult.error) {
    if (!isMissingRelationError(customTrophiesResult.error.message, "public.trophies")) {
      throw new Error(customTrophiesResult.error.message);
    }
  } else {
    customTrophyOwnershipCount = customTrophiesResult.count ?? 0;
  }

  const activeCreatedAccessCodeCount = readOptionalExactCount(createdAccessCodesResult, "public.access_codes");
  const sidePickOwnershipCount =
    readOptionalExactCount(sidePickPackagesResult, "public.side_pick_packages") +
    readOptionalExactCount(sidePickDefinitionsResult, "public.side_pick_definitions") +
    readOptionalExactCount(groupRulesetsResult, "public.group_rulesets");

  const organizationIds = organizationOwnershipRows.map((organization) => organization.id);
  const organizationBrandingCount = organizationIds.length
    ? await countOrganizationBrandingRows(adminSupabase, organizationIds)
    : 0;

  const ownedGroups = ((ownedGroupsResult.data as Array<{
    id: string;
    name: string;
    status: GroupStatus;
    membership_limit: number;
    group_members?: Array<{ count: number | null }> | { count: number | null } | null;
  }> | null) ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    status: group.status,
    membershipLimit: group.membership_limit,
    memberCount: Array.isArray(group.group_members)
      ? (group.group_members[0]?.count ?? 0)
      : (group.group_members?.count ?? 0)
  }));

  const ownedGroupIds = ownedGroups.map((group) => group.id);
  const [accessCodeCountsByGroupId, pendingInviteCountsByGroupId] = await Promise.all([
    countActiveGroupAccessCodes(adminSupabase, ownedGroupIds),
    countPendingGroupInvites(adminSupabase, ownedGroupIds)
  ]);

  const currentPlanTier = normalizeCommercialTier(
    (existingUser as { plan_tier?: string | null }).plan_tier ?? null
  );
  const currentRole = ((existingUser as { role?: UserRole | null }).role ?? "player") as UserRole;
  const currentAccessLevel =
    normalizeAccessLevel(currentRole === "admin" ? "super_admin" : currentPlanTier ?? "player") ?? "player";
  const targetPlanTier: CommercialTier = targetAccessLevel;
  const targetRole: UserRole = "player";
  const targetTierAccess = resolveTierAccess({ role: targetRole, planTier: targetPlanTier });
  const targetMemberLimit = targetTierAccess.limits.maxMembersPerGroup;
  const targetGroupLimit = targetTierAccess.limits.maxGroups;
  const managerLimitsRow = managerLimitsResult.data as
    | { user_id: string; max_groups?: number | null; max_members_per_group?: number | null }
    | null;
  const managedMembershipGroupIds = new Set(
    (((managedMembershipsResult.data as Array<{ id: string; group_id: string }> | null) ?? []).map((row) => row.group_id))
  );
  const ownedGroupIdSet = new Set(ownedGroupIds);
  for (const groupId of ownedGroupIds) {
    managedMembershipGroupIds.add(groupId);
  }
  const managedGroupCount = managedMembershipGroupIds.size;
  const legacyManagedGroupCount = Array.from(managedMembershipGroupIds).filter((groupId) => !ownedGroupIdSet.has(groupId)).length;

  const ownedGroupsWithImpact: DemotionImpactOwnedGroup[] = ownedGroups.map((group) => {
    const exceedsTargetMemberLimit =
      typeof targetMemberLimit === "number" ? group.memberCount > targetMemberLimit : false;
    const blockerReason =
      targetAccessLevel === "player"
        ? "Transfer, archive, or remove this owned group before demoting to Player."
        : exceedsTargetMemberLimit
          ? `${group.name} has ${group.memberCount} members, which exceeds the ${targetMemberLimit ?? 0}-member limit for ${getAccessLevelDisplayLabel(targetAccessLevel)}.`
          : null;

    return {
      ...group,
      activeInviteCodeCount: accessCodeCountsByGroupId.get(group.id) ?? 0,
      pendingInviteCount: pendingInviteCountsByGroupId.get(group.id) ?? 0,
      exceedsTargetMemberLimit,
      blockerReason
    };
  });

  const groupsThatWouldExceedTarget =
    targetAccessLevel === "player"
      ? ownedGroupsWithImpact
      : ownedGroupsWithImpact.filter((group) => group.exceedsTargetMemberLimit);

  const blockers: string[] = [];
  const cleanupActions: string[] = [];

  if (currentAccessLevel === "super_admin") {
    blockers.push("Super Admin demotion is not available through this workflow.");
  }

  if (compareAccessLevels(targetAccessLevel, currentAccessLevel) >= 0) {
    blockers.push(
      `${getAccessLevelDisplayLabel(targetAccessLevel)} is not lower than ${getAccessLevelDisplayLabel(currentAccessLevel)}. Use the invite/access setup flow for promotions or lateral changes.`
    );
  }

  if (targetAccessLevel !== "managing_director" && organizationOwnershipRows.length > 0) {
    blockers.push("Transfer or archive the user's organization before lowering Managing Director access.");
  }

  if (targetAccessLevel === "player" && ownedGroupsWithImpact.length > 0) {
    blockers.push("Transfer, archive, or remove owned groups before demoting this organizer to Player.");
  }

  if (typeof targetGroupLimit === "number" && targetGroupLimit > 0 && ownedGroupsWithImpact.length > targetGroupLimit) {
    blockers.push(
      `${getAccessLevelDisplayLabel(targetAccessLevel)} supports ${targetGroupLimit} group${targetGroupLimit === 1 ? "" : "s"}, but this user owns ${ownedGroupsWithImpact.length}.`
    );
  }

  if (groupsThatWouldExceedTarget.length > 0 && targetAccessLevel !== "player") {
    blockers.push(
      `${groupsThatWouldExceedTarget.length} owned group${groupsThatWouldExceedTarget.length === 1 ? "" : "s"} exceed the member cap for ${getAccessLevelDisplayLabel(targetAccessLevel)}.`
    );
  }

  if (managerLimitsRow && targetAccessLevel !== "manager") {
    cleanupActions.push("Remove stale manager limit overrides.");
  }

  if (legacyManagedGroupCount > 0) {
    cleanupActions.push("Downgrade legacy manager memberships to member while preserving player access.");
  }

  if (targetAccessLevel === "player" && activeCreatedAccessCodeCount > 0) {
    cleanupActions.push("Deactivate active access codes created by this organizer.");
  }

  const cleanupOptions: DemotionCleanupOptionDetail[] = [];
  if (managerLimitsRow && targetAccessLevel !== "manager") {
    cleanupOptions.push({
      key: "remove_manager_limits",
      label: "Remove stale manager limits",
      description: "Delete the legacy manager_limits override so the user falls back to the lower tier cleanly.",
      selectedByDefault: true
    });
  }

  if (legacyManagedGroupCount > 0) {
    cleanupOptions.push({
      key: "downgrade_legacy_manager_memberships",
      label: "Downgrade organizer memberships",
      description: "Convert legacy manager memberships to member while keeping player membership intact.",
      selectedByDefault: true
    });
  }

  if (targetAccessLevel === "player" && activeCreatedAccessCodeCount > 0) {
    cleanupOptions.push({
      key: "deactivate_created_access_codes",
      label: "Deactivate created access codes",
      description: "Turn off any still-active access codes created by this organizer before removing organizer powers.",
      selectedByDefault: true
    });
  }

  const status =
    blockers.length > 0 ? "blocked" : cleanupActions.length > 0 ? "cleanup_required" : "safe";

  return {
    userId: trimmedUserId,
    email: (existingUser as { email?: string | null }).email?.trim() || "",
    displayName: (existingUser as { name?: string | null }).name?.trim() || (existingUser as { email?: string | null }).email?.trim() || "Unknown user",
    currentRole,
    currentPlanTier,
    currentAccessLevel,
    targetRole,
    targetPlanTier,
    targetAccessLevel,
    ownedGroupCount: ownedGroupsWithImpact.length,
    managedGroupCount,
    groupsThatWouldExceedTarget,
    ownedGroups: ownedGroupsWithImpact,
    activeInviteCodeCount: ownedGroupsWithImpact.reduce((sum, group) => sum + group.activeInviteCodeCount, 0),
    pendingInviteCount: ownedGroupsWithImpact.reduce((sum, group) => sum + group.pendingInviteCount, 0),
    hasManagerLimits: Boolean(managerLimitsRow),
    managerLimits: managerLimitsRow
      ? {
          maxGroups: managerLimitsRow.max_groups ?? 0,
          maxMembersPerGroup: managerLimitsRow.max_members_per_group ?? 0
        }
      : null,
    legacyManagedGroupCount,
    activeCreatedAccessCodeCount,
    organizationOwnershipCount: organizationOwnershipRows.length,
    organizationBrandingCount,
    customTrophyOwnershipCount,
    sidePickOwnershipCount,
    isSuperAdmin: currentAccessLevel === "super_admin",
    status,
    blockers,
    cleanupActions,
    cleanupOptions
  };
}

async function countActiveGroupAccessCodes(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds: string[]
) {
  const counts = new Map<string, number>();
  if (groupIds.length === 0) {
    return counts;
  }

  const { data, error } = await adminSupabase
    .from("access_codes")
    .select("group_id")
    .in("group_id", groupIds)
    .eq("active", true);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of ((data as Array<{ group_id?: string | null }> | null) ?? [])) {
    if (!row.group_id) {
      continue;
    }

    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  return counts;
}

function readOptionalExactCount(
  result: { count: number | null; error: { message?: string | null } | null },
  relationName: string
) {
  if (isMissingRelationError(result.error?.message ?? "", relationName)) {
    return 0;
  }

  if (result.error) {
    throw new Error(result.error.message ?? `Could not load ${relationName}.`);
  }

  return result.count ?? 0;
}

async function countPendingGroupInvites(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds: string[]
) {
  const counts = new Map<string, number>();
  if (groupIds.length === 0) {
    return counts;
  }

  const { data, error } = await adminSupabase
    .from("group_invites")
    .select("group_id,status")
    .in("group_id", groupIds)
    .eq("status", "pending");

  if (error) {
    throw new Error(error.message);
  }

  for (const row of ((data as Array<{ group_id?: string | null }> | null) ?? [])) {
    if (!row.group_id) {
      continue;
    }

    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }

  return counts;
}

async function countOrganizationBrandingRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  organizationIds: string[]
) {
  if (organizationIds.length === 0) {
    return 0;
  }

  const result = await adminSupabase
    .from("organization_branding")
    .select("organization_id", { count: "exact", head: true })
    .in("organization_id", organizationIds);

  if (isMissingRelationError(result.error?.message ?? "", "public.organization_branding")) {
    return 0;
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.count ?? 0;
}

async function applyOrganizerAccessCleanup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  impact: DemotionImpactSummary,
  resolutionPlan: Partial<Record<DemotionCleanupOption, boolean>>
) {
  const actionsTaken: string[] = [];
  const counts = {
    removedManagerLimits: 0,
    downgradedLegacyManagerMemberships: 0,
    deactivatedCreatedAccessCodes: 0
  };

  if (impact.targetAccessLevel !== "manager" && impact.hasManagerLimits && resolutionPlan.remove_manager_limits) {
    const { error } = await adminSupabase.from("manager_limits").delete().eq("user_id", impact.userId);
    if (error) {
      throw new Error(error.message);
    }

    actionsTaken.push("removed_manager_limits");
    counts.removedManagerLimits = 1;
  }

  if (resolutionPlan.downgrade_legacy_manager_memberships) {
    const { data: legacyManagerMemberships, error: legacyManagerMembershipsError } = await adminSupabase
      .from("group_members")
      .select("id,group_id,group:groups!group_members_group_id_fkey(owner_user_id)")
      .eq("user_id", impact.userId)
      .eq("role", "manager");

    if (legacyManagerMembershipsError) {
      throw new Error(legacyManagerMembershipsError.message);
    }

    const legacyMembershipIds = (((legacyManagerMemberships as Array<{
      id: string;
      group_id: string;
      group?: { owner_user_id?: string | null } | Array<{ owner_user_id?: string | null }> | null;
    }> | null) ?? []).filter((membership) => {
      const group = Array.isArray(membership.group) ? (membership.group[0] ?? null) : membership.group;
      return group?.owner_user_id !== impact.userId;
    })).map((membership) => membership.id);

    if (legacyMembershipIds.length > 0) {
      const { error } = await adminSupabase
        .from("group_members")
        .update({ role: "member" })
        .in("id", legacyMembershipIds);

      if (error) {
        throw new Error(error.message);
      }

      actionsTaken.push("downgraded_legacy_manager_memberships");
      counts.downgradedLegacyManagerMemberships = legacyMembershipIds.length;
    }
  }

  if (resolutionPlan.deactivate_created_access_codes) {
    const { data: createdAccessCodes, error: createdAccessCodesError } = await adminSupabase
      .from("access_codes")
      .select("id")
      .eq("created_by", impact.userId)
      .eq("active", true);

    if (createdAccessCodesError) {
      throw new Error(createdAccessCodesError.message);
    }

    const activeCodeIds = (((createdAccessCodes as Array<{ id: string }> | null) ?? [])).map((row) => row.id);
    if (activeCodeIds.length > 0) {
      const { error } = await adminSupabase
        .from("access_codes")
        .update({ active: false, updated_at: new Date().toISOString() })
        .in("id", activeCodeIds);

      if (error) {
        throw new Error(error.message);
      }

      actionsTaken.push("deactivated_created_access_codes");
      counts.deactivatedCreatedAccessCodes = activeCodeIds.length;
    }
  }

  return { actionsTaken, counts };
}

function buildRequiredDemotionCleanupPlan(
  impact: DemotionImpactSummary
): Partial<Record<DemotionCleanupOption, boolean>> {
  return {
    remove_manager_limits: impact.cleanupOptions.some((option) => option.key === "remove_manager_limits"),
    downgrade_legacy_manager_memberships: impact.cleanupOptions.some(
      (option) => option.key === "downgrade_legacy_manager_memberships"
    ),
    deactivate_created_access_codes: impact.cleanupOptions.some(
      (option) => option.key === "deactivate_created_access_codes"
    )
  };
}

function validateDemotionResolutionPlan(
  impact: DemotionImpactSummary,
  resolutionPlan: Partial<Record<DemotionCleanupOption, boolean>>
) {
  const requiredPlan = buildRequiredDemotionCleanupPlan(impact);
  const missingOption = (Object.entries(requiredPlan) as Array<[DemotionCleanupOption, boolean | undefined]>).find(
    ([key, isRequired]) => isRequired && !resolutionPlan[key]
  );

  if (!missingOption) {
    return null;
  }

  const option = impact.cleanupOptions.find((item) => item.key === missingOption[0]);
  return option
    ? `Select the cleanup step "${option.label}" before applying this access change.`
    : "Select every required cleanup step before applying this access change.";
}

async function writeAdminAccessChangeAuditLog(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    actorUserId: string;
    targetUserId: string;
    targetEmail: string;
    action: "demote_access" | "deactivate_organizer_access";
    previousRole: UserRole;
    previousPlanTier: CommercialTier | null;
    previousAccessLevel: AccessLevel;
    newRole: UserRole;
    newPlanTier: CommercialTier;
    newAccessLevel: AccessLevel;
    impact: DemotionImpactSummary;
    cleanupActionsTaken: string[];
    cleanupCounts: Record<string, number>;
    reason: string;
  }
) {
  const { error } = await adminSupabase.from("admin_access_change_audit_log").insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    target_email: input.targetEmail,
    action: input.action,
    previous_role: input.previousRole,
    previous_plan_tier: input.previousPlanTier,
    previous_access_level: input.previousAccessLevel,
    new_role: input.newRole,
    new_plan_tier: input.newPlanTier,
    new_access_level: input.newAccessLevel,
    impact_summary: {
      ownedGroupCount: input.impact.ownedGroupCount,
      managedGroupCount: input.impact.managedGroupCount,
      legacyManagedGroupCount: input.impact.legacyManagedGroupCount,
      activeInviteCodeCount: input.impact.activeInviteCodeCount,
      pendingInviteCount: input.impact.pendingInviteCount,
      activeCreatedAccessCodeCount: input.impact.activeCreatedAccessCodeCount,
      organizationOwnershipCount: input.impact.organizationOwnershipCount,
      organizationBrandingCount: input.impact.organizationBrandingCount,
      customTrophyOwnershipCount: input.impact.customTrophyOwnershipCount,
      sidePickOwnershipCount: input.impact.sidePickOwnershipCount,
      hasManagerLimits: input.impact.hasManagerLimits,
      blockers: input.impact.blockers,
      cleanupActions: input.impact.cleanupActions
    },
    cleanup_actions_taken: input.cleanupActionsTaken,
    cleanup_counts: input.cleanupCounts,
    reason: input.reason
  });

  if (isMissingRelationError(error?.message ?? "", "public.admin_access_change_audit_log")) {
    console.warn("Could not write admin access change audit log because the table is missing.", {
      targetUserId: input.targetUserId,
      action: input.action
    });
    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

async function writeAdminQuickTierChangeAuditLog(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: {
    actorUserId: string;
    targetUserId: string;
    targetEmail: string;
    previousRole: UserRole;
    previousPlanTier: CommercialTier | null;
    previousAccessLevel: AccessLevel;
    newPlanTier: CommercialTier;
    newAccessLevel: AccessLevel;
  }
) {
  const { error } = await adminSupabase.from("admin_access_change_audit_log").insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId,
    target_email: input.targetEmail,
    action: "quick_tier_change",
    previous_role: input.previousRole,
    previous_plan_tier: input.previousPlanTier,
    previous_access_level: input.previousAccessLevel,
    new_role: "player" as UserRole,
    new_plan_tier: input.newPlanTier,
    new_access_level: input.newAccessLevel,
    impact_summary: {
      source: "admin_users_quick_tier_control",
      note: "Upward commercial tier change. Downward changes use impact-checked demotion workflow."
    },
    cleanup_actions_taken: [],
    cleanup_counts: {},
    reason: "Super Admin quick tier change from Users tab."
  });

  if (isMissingRelationError(error?.message ?? "", "public.admin_access_change_audit_log")) {
    console.warn("Could not write admin quick tier change audit log because the table is missing.", {
      targetUserId: input.targetUserId
    });
    return;
  }

  if (error) {
    throw new Error(error.message);
  }
}

async function sendAccessLevelChangeEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  impact: DemotionImpactSummary,
  targetAccessLevel: AccessLevel
) {
  const { data: userProfile, error } = await adminSupabase
    .from("users")
    .select("preferred_language")
    .eq("id", impact.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const preferredLanguage = normalizeLanguage(
    ((userProfile as { preferred_language?: string | null } | null)?.preferred_language ?? null)
  );
  const loginUrl = buildAccessLevelLoginUrl(preferredLanguage, targetAccessLevel);
  const emailCopy = buildAdminAccessLevelChangeEmailCopy({
    language: preferredLanguage,
    recipientLabel: impact.displayName,
    accessLevel: targetAccessLevel,
    loginUrl
  });

  await sendTransactionalEmail({
    to: impact.email,
    subject: emailCopy.subject,
    html: emailCopy.html,
    text: emailCopy.text
  });
}

function buildAccessLevelLoginUrl(language: string | null | undefined, accessLevel: AccessLevel) {
  const normalizedLanguage = normalizeLanguage(language);
  const loginPath =
    accessLevel === "director" || accessLevel === "managing_director"
      ? "/login" // TODO(launch): switch organizer tiers to /organizer/login when that route exists.
      : "/login";

  return new URL(appendLanguageToPath(loginPath, normalizedLanguage), getPublicSiteUrl()).toString();
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

async function fetchInviteLookup(
  adminSupabase: ReturnType<typeof createAdminClient>,
  normalizedEmail: string
) {
  const fullResult = await adminSupabase
    .from("invites")
    .select("email,display_name,language,role,plan_tier,accepted_at,status,last_sent_at,send_attempts,last_error")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!fullResult.error || !isMissingInviteLifecycleColumnError(fullResult.error.message)) {
    return fullResult;
  }

  const fallbackResult = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at,status")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!fallbackResult.error) {
    return {
      data: {
        ...fallbackResult.data,
        language: "en",
        plan_tier: "player",
          last_sent_at: null,
          send_attempts: 0,
          last_error: null
      },
      error: null
    };
  }

  if (!isMissingInviteLifecycleColumnError(fallbackResult.error.message)) {
    return fallbackResult;
  }

  const minimalResult = await adminSupabase
    .from("invites")
    .select("email,display_name,role,accepted_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  return {
    data: minimalResult.data
      ? {
          ...minimalResult.data,
          language: "en",
          plan_tier: "player",
          status: minimalResult.data.accepted_at ? "accepted" : "pending",
          last_sent_at: null,
          send_attempts: 0,
          last_error: null
        }
      : null,
    error: minimalResult.error
  };
}

async function hasEmailJobsTable(adminSupabase: ReturnType<typeof createAdminClient>) {
  const { error } = await adminSupabase.from("email_jobs").select("id", { head: true, count: "exact" });
  if (!error) {
    return true;
  }

  if (isMissingEmailJobsError(error.message)) {
    return false;
  }

  return false;
}

async function sendAdminEmailInline(
  adminSupabase: ReturnType<typeof createAdminClient>,
  input: { kind: EmailJobKind; email: string; language?: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const preferredLanguage = normalizeLanguage(input.language);

  if (input.kind === "access_email") {
    const redirectUrl = new URL("/auth/callback", getPublicSiteUrl());
    redirectUrl.searchParams.set(
      "next",
      appendLanguageToPath("/login?confirmed=1&flow=invite&mode=signup", preferredLanguage)
    );
    redirectUrl.searchParams.set("lang", preferredLanguage);
    const { error } = await adminSupabase.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: redirectUrl.toString()
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  }

  const recoveryUrl = new URL("/auth/confirm", getPublicSiteUrl());
  recoveryUrl.searchParams.set("next", appendLanguageToPath("/reset-password", preferredLanguage));
  recoveryUrl.searchParams.set("lang", preferredLanguage);
  const { error } = await adminSupabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: recoveryUrl.toString()
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

function isMissingInviteLifecycleColumnError(message: string) {
  return (
    isMissingColumnError(message, "language") ||
    isMissingColumnError(message, "plan_tier") ||
    isMissingColumnError(message, "status") ||
    isMissingColumnError(message, "last_sent_at") ||
    isMissingColumnError(message, "send_attempts") ||
    isMissingColumnError(message, "last_error")
  );
}

function isMissingColumnError(message: string, column: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes(column.toLowerCase()) &&
    (
      (normalized.includes("column") && normalized.includes("does not exist")) ||
      normalized.includes("schema cache")
    )
  );
}

function isMissingRelationError(message: string, relation: string) {
  const normalized = message.toLowerCase();
  return normalized.includes(relation.toLowerCase()) && (normalized.includes("schema cache") || normalized.includes("does not exist"));
}

async function countOptionalLegacyBracketPickRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchIds: string[]
) {
  const result = await adminSupabase.from("bracket_picks").select("match_id", { count: "exact", head: true }).in("match_id", matchIds);
  if (result.error && isMissingRelationError(result.error.message, "public.bracket_picks")) {
    return { count: 0, error: null };
  }

  return result;
}

async function countOptionalGameplayRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tableName:
    | "bracket_predictions"
    | "projected_bracket_predictions"
    | "bracket_picks"
    | "user_group_seed_rankings"
    | "user_best_third_rankings",
  userId: string
) {
  const result = await adminSupabase.from(tableName).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (result.error && isMissingRelationError(result.error.message, `public.${tableName}`)) {
    return { count: 0, error: null };
  }

  return result;
}

async function deleteOptionalGameplayRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  tableName:
    | "bracket_predictions"
    | "projected_bracket_predictions"
    | "bracket_picks"
    | "user_group_seed_rankings"
    | "user_best_third_rankings",
  userId: string
) {
  const result = await adminSupabase.from(tableName).delete().eq("user_id", userId);
  if (result.error && isMissingRelationError(result.error.message, `public.${tableName}`)) {
    return { error: null };
  }

  return result;
}

async function deleteOptionalLegacyBracketPickRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchIds: string[]
) {
  const result = await adminSupabase.from("bracket_picks").delete().in("match_id", matchIds);
  if (result.error && isMissingRelationError(result.error.message, "public.bracket_picks")) {
    return { error: null };
  }

  return result;
}

function isMissingEmailJobsError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("email_jobs") && normalized.includes("schema cache")) ||
    (normalized.includes("email_jobs") && normalized.includes("does not exist")) ||
    isMissingRelationError(message, "public.email_jobs")
  );
}

function isMissingTrophiesError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("user_trophies") || normalized.includes("trophies")) &&
    (
      normalized.includes("schema cache") ||
      normalized.includes("does not exist") ||
      normalized.includes("could not find the table")
    )
  );
}

function isMissingSocialResetTableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("schema cache") ||
    normalized.includes("does not exist") ||
    normalized.includes("could not find the table")
  ) && (
    normalized.includes("leaderboard_event_comments") ||
    normalized.includes("leaderboard_event_reactions") ||
    normalized.includes("leaderboard_events") ||
    normalized.includes("user_notifications") ||
    normalized.includes("user_trophies")
  );
}

function unwrapRelation<T>(value?: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

async function findUserByIdOrEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIdentifier: string
): Promise<{ id: string; name: string; email: string } | null> {
  const trimmed = userIdentifier.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedEmail = trimmed.toLowerCase();
  const isEmail = normalizedEmail.includes("@");
  const query = adminSupabase.from("users").select("id,name,email");

  const { data, error } = isEmail
    ? await query.eq("email", normalizedEmail).maybeSingle()
    : await query.eq("id", trimmed).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function derivePlaceholderDisplayName(normalizedEmail: string, displayName?: string | null) {
  const trimmedDisplayName = displayName?.trim();
  if (trimmedDisplayName) {
    return trimmedDisplayName;
  }

  return normalizedEmail.split("@")[0] || "Player";
}
