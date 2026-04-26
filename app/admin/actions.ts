"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchLeaderboardFeatureSettings,
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
import { escapeHtml, sendTransactionalEmail } from "@/lib/email-sender";
import { fetchGlobalLeaderboardRankMovement, fetchGroupLeaderboardRankMovement } from "@/lib/leaderboard-movement";
import { fetchDailyWinners } from "@/lib/leaderboard-highlights";
import { createNotificationsForLeaderboardEvents, type NotificationEventSeed } from "@/lib/notifications";
import { canScoreGroupMatch, scoreGroupStagePrediction } from "@/lib/group-scoring";
import { getSiteUrl } from "@/lib/site-url";
import type { UserRole } from "@/lib/types";

type MatchRow = {
  id: string;
  stage: "group" | "round_of_32" | "round_of_16" | "quarterfinal" | "semifinal" | "final";
  group_name?: string | null;
  status: "scheduled" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
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

type LeaderboardTotal = {
  user_id: string;
  total_points: number;
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
};

type InsertedLeaderboardEventRow = NotificationEventSeed;
type TrophyRow = {
  id: string;
};

type InviteLookupRow = {
  email: string;
  display_name: string;
  role: UserRole;
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
  role?: UserRole;
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

export type CreateInviteInput = {
  email: string;
  displayName?: string;
  role: UserRole;
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

export type AdminGroupSummary = {
  id: string;
  name: string;
  status: GroupStatus;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  membershipLimit: number;
  memberCount: number;
  members: Array<{
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
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

  if (!normalizedEmail) {
    return { ok: false, message: "Email is required." };
  }

  const [{ data: existingInvite, error: inviteLookupError }, { data: existingUser, error: userLookupError }, authUser] =
    await Promise.all([
      fetchInviteLookup(adminSupabase, normalizedEmail),
      adminSupabase.from("users").select("id").eq("email", normalizedEmail).maybeSingle(),
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

  const sendKind: EmailJobKind = authUser && existingUser ? "password_recovery" : "access_email";
  const supportsEmailJobs = await hasEmailJobsTable(adminSupabase);
  const inviteUpsertResult = await upsertInviteRow(adminSupabase, {
    email: normalizedEmail,
    displayName: trimmedDisplayName,
    role: input.role,
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
      email: normalizedEmail
    });

    if (!sendResult.ok) {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        role: input.role,
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
        role: input.role,
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
      role: input.role,
      source: "admin_invites"
    }
  });

  if (!enqueueResult.ok && isMissingEmailJobsError(enqueueResult.message)) {
    const sendResult = await sendAdminEmailInline(adminSupabase, {
      kind: sendKind,
      email: normalizedEmail
    });

    if (!sendResult.ok) {
      await upsertInviteRow(adminSupabase, {
        email: normalizedEmail,
        displayName: trimmedDisplayName,
        role: input.role,
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
        role: input.role,
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
      role: input.role,
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

  const sendResult = await sendAdminEmailInline(adminSupabase, {
    kind: "password_recovery",
    email
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
    role: inviteLookup.data.role ?? "player",
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
    .select("id,name,email,username,needs_profile_setup")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (appUserError) {
    return { ok: false, message: appUserError.message };
  }

  const isConfirmed = Boolean(authUser.emailConfirmedAt);
  const needsProfileSetup = Boolean(appUser?.needs_profile_setup || !appUser?.username?.trim());
  const redirectTo = isConfirmed
    ? `${getSiteUrl()}/auth/callback?next=${encodeURIComponent("/profile-setup")}`
    : `${getSiteUrl()}/auth/callback?next=${encodeURIComponent("/login?confirmed=1&flow=invite&mode=signup")}`;
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
    await sendTransactionalEmail({
      to: normalizedEmail,
      subject: isConfirmed
        ? "Finish your Pick-It profile setup"
        : "Confirm your Pick-It account",
      html: buildAdminRecoveryEmailHtml({
        heading: isConfirmed ? "Finish setting up your profile" : "Confirm your account",
        intro: isConfirmed
          ? `${escapeHtml(appUser?.name?.trim() || normalizedEmail)}, finish your profile setup so your groups, scores, and leaderboard name stay in sync.`
          : `Use the secure confirmation link below to finish creating your Pick-It account for ${escapeHtml(normalizedEmail)}.`,
        actionLabel: isConfirmed ? "Open Profile Setup" : "Confirm Account",
        actionUrl: linkData.properties.action_link,
        note: isConfirmed
          ? "This link signs the player in and sends them straight to profile setup."
          : "This link confirms the account first, then returns them to the app."
      }),
      text: buildAdminRecoveryEmailText({
        heading: isConfirmed ? "Finish your Pick-It profile setup" : "Confirm your Pick-It account",
        intro: isConfirmed
          ? `${appUser?.name?.trim() || normalizedEmail}, finish your profile setup so your groups, scores, and leaderboard name stay in sync.`
          : `Use the secure confirmation link below to finish creating your Pick-It account for ${normalizedEmail}.`,
        actionLabel: isConfirmed ? "Open Profile Setup" : "Confirm Account",
        actionUrl: linkData.properties.action_link,
        note: isConfirmed
          ? "This link signs the player in and sends them straight to profile setup."
          : "This link confirms the account first, then returns them to the app."
      })
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

  if (confirmationText.trim() !== "DELETE") {
    return { ok: false, message: "Type DELETE to confirm this destructive reset." };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, message: "A valid email is required." };
  }

  const adminSupabase = createAdminClient();
  const authUser = await findAuthUserByEmail(adminSupabase, normalizedEmail);
  const { data: appUser, error: appUserError } = await adminSupabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (appUserError) {
    return { ok: false, message: appUserError.message };
  }

  if (!authUser && !appUser) {
    return { ok: false, message: "No auth or app user was found for that email." };
  }

  if (appUser?.id) {
    const [predictionsResult, bracketResult, sidePicksResult] = await Promise.all([
      adminSupabase.from("predictions").select("id", { count: "exact", head: true }).eq("user_id", appUser.id),
      adminSupabase.from("bracket_picks").select("id", { count: "exact", head: true }).eq("user_id", appUser.id),
      adminSupabase.from("side_picks").select("id", { count: "exact", head: true }).eq("user_id", appUser.id)
    ]);

    const gameplayCount =
      (predictionsResult.count ?? 0) +
      (bracketResult.count ?? 0) +
      (sidePicksResult.count ?? 0);

    if (predictionsResult.error || bracketResult.error || sidePicksResult.error) {
      return {
        ok: false,
        message:
          predictionsResult.error?.message ??
          bracketResult.error?.message ??
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
    adminSupabase.from("email_jobs").delete().eq("email", normalizedEmail)
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

export async function fetchRequiredLegalDocumentAction(
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE
): Promise<FetchRequiredLegalDocumentResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  try {
    const document = await getRequiredLegalDocument(documentType);
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
  newRequiredVersion: string,
  newTitle?: string,
  newBody?: string
): Promise<ForceLegalReacceptanceResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const normalizedDocumentType = documentType.trim().toLowerCase();
  const normalizedVersion = newRequiredVersion.trim();
  const normalizedTitle = newTitle?.trim() ?? "";
  const normalizedBody = newBody?.trim() ?? "";

  if (!normalizedDocumentType) {
    return { ok: false, message: "A legal document type is required." };
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
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    return { ok: false, message: userError.message };
  }

  if (!existingUser) {
    return { ok: false, message: "That user was not found." };
  }

  const { data, error } = await adminSupabase
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
    .single();

  if (error) {
    return { ok: false, message: error.message };
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
        "id,name,status,owner_user_id,membership_limit,owner:users!groups_owner_user_id_fkey(id,name,email),members:group_members(id,user_id,role,joined_at,user:users!group_members_user_id_fkey(id,name,email,avatar_url))"
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
        | { id: string; name: string; email: string; avatar_url?: string | null }
        | Array<{ id: string; name: string; email: string; avatar_url?: string | null }>
        | null;
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
        role: member.role,
        joinedAt: member.joined_at
      };
    });

    return {
      id: group.id,
      name: group.name,
      status: group.status,
      ownerUserId: group.owner_user_id,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      membershipLimit: group.membership_limit,
      memberCount: members.length,
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

  if (membership.role === "manager") {
    const { count: managerCount, error: managerCountError } = await adminSupabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", trimmedGroupId)
      .eq("role", "manager");

    if (managerCountError) {
      return { ok: false, message: managerCountError.message };
    }

    if ((managerCount ?? 0) <= 1) {
      return { ok: false, message: "This is the only manager in the group. Add or assign another manager first." };
    }
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

  const { data: existingMembership, error: membershipLookupError } = await adminSupabase
    .from("group_members")
    .select("id,role")
    .eq("group_id", trimmedGroupId)
    .eq("user_id", nextOwner.id)
    .maybeSingle();

  if (membershipLookupError) {
    return { ok: false, message: membershipLookupError.message };
  }

  if (!existingMembership) {
    const { error: insertError } = await adminSupabase.from("group_members").insert({
      group_id: trimmedGroupId,
      user_id: nextOwner.id,
      role: "manager"
    });

    if (insertError) {
      return { ok: false, message: insertError.message };
    }
  } else if (existingMembership.role !== "manager") {
    const { error: updateMembershipError } = await adminSupabase
      .from("group_members")
      .update({ role: "manager" })
      .eq("group_id", trimmedGroupId)
      .eq("user_id", nextOwner.id);

    if (updateMembershipError) {
      return { ok: false, message: updateMembershipError.message };
    }
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

export async function removeManagerAccessAction(userId: string): Promise<RemoveManagerAccessResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return { ok: false, message: "A valid user is required." };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("manager_limits")
    .delete()
    .eq("user_id", trimmedUserId);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/players");

  return {
    ok: true,
    message: "Manager access removed."
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

export async function updateAdminMatchResultAction(input: UpdateMatchResultInput): Promise<UpdateMatchResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data: previousMatch, error: previousMatchError } = await adminSupabase
    .from("matches")
    .select("id,status,stage")
    .eq("id", input.id)
    .single();

  if (previousMatchError) {
    return { ok: false, message: previousMatchError.message };
  }

  const { data, error } = await adminSupabase
    .from("matches")
    .update({
      status: input.status,
      home_score: input.homeScore ?? null,
      away_score: input.awayScore ?? null,
      winner_team_id: input.winnerTeamId ?? null
    })
    .eq("id", input.id)
    .select(
      "id,stage,group_name,status,home_team_id,away_team_id,home_source,away_source,kickoff_time,home_score,away_score,winner_team_id,updated_at"
    )
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  if ((previousMatch as MatchRow).status === "final" && input.status !== "final") {
    const resetResult = await resetGroupMatchScoring(adminSupabase, input.id);
    if (!resetResult.ok) {
      return resetResult;
    }
  }

  revalidatePath("/");
  revalidatePath("/groups");
  revalidatePath("/leaderboard");
  revalidatePath("/admin/matches");
  return { ok: true, match: mapMatchRow(data as MatchRow) };
}

export async function scoreFinalizedGroupMatch(matchId: string): Promise<ScoreMatchResult> {
  const adminCheck = await assertCurrentUserIsAdmin();
  if (!adminCheck.ok) {
    return adminCheck;
  }

  const adminSupabase = createAdminClient();
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
    return {
      ok: true,
      scored: false,
      predictionsScored: 0,
      message: "Match saved. Scoring skipped because this is not a finalized group-stage match with scores."
    };
  }

  const { data: predictions, error: predictionsError } = await adminSupabase
    .from("predictions")
    .select(
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score"
    )
    .eq("match_id", matchId);

  if (predictionsError) {
    return { ok: false, message: predictionsError.message };
  }

  const predictionRows = (predictions ?? []) as PredictionRow[];
  const scoredPredictions = predictionRows.map((prediction) => {
    const scoreBreakdown = scoreGroupStagePrediction(
      {
        predictedWinnerTeamId: prediction.predicted_winner_team_id,
        predictedIsDraw: prediction.predicted_is_draw,
        predictedHomeScore: prediction.predicted_home_score,
        predictedAwayScore: prediction.predicted_away_score
      },
      mappedMatch
    );

    return {
      predictionId: prediction.id,
      userId: prediction.user_id,
      matchId: prediction.match_id,
      scoreBreakdown
    };
  });

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

  if (scoredPredictions.length > 0) {
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

    const trophyResult = await awardPerfectPickFirstTrophy(adminSupabase, scoredPredictions);
    if (!trophyResult.ok) {
      return trophyResult;
    }
  }

  const leaderboardResult = await recalculateLeaderboard(adminSupabase, matchId);
  if (!leaderboardResult.ok) {
    return leaderboardResult;
  }

  const eventResult = await recreateGlobalLeaderboardEventsForMatch(adminSupabase, matchId, scoredPredictions);
  if (!eventResult.ok) {
    return eventResult;
  }

  const groupEventResult = await recreateGroupLeaderboardEventsForMatch(adminSupabase, matchId, scoredPredictions);
  if (!groupEventResult.ok) {
    return groupEventResult;
  }

  revalidatePath("/");
  revalidatePath("/leaderboard");
  revalidatePath("/predictions");
  revalidatePath("/admin/matches");
  revalidatePath("/profile");
  revalidatePath("/trophies");

  return {
    ok: true,
    scored: true,
    predictionsScored: predictionRows.length,
    message:
      predictionRows.length === 0
        ? `Match saved as final, but no Supabase prediction rows were found for match ${matchId}.`
        : `Match saved and ${predictionRows.length} predictions scored.`
  };
}

async function awardPerfectPickFirstTrophy(
  adminSupabase: ReturnType<typeof createAdminClient>,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
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
    .gt("exact_score_points", 0);

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

  const { error: awardError } = await adminSupabase.from("user_trophies").upsert(
    firstPerfectPickUserIds.map((userId) => ({
      user_id: userId,
      trophy_id: (trophy as TrophyRow).id,
      awarded_at: new Date().toISOString()
    })),
    { onConflict: "user_id,trophy_id" }
  );

  if (awardError) {
    if (isMissingTrophiesError(awardError.message)) {
      return { ok: true };
    }

    return { ok: false, message: awardError.message };
  }

  return { ok: true };
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

async function recalculateLeaderboard(
  adminSupabase: ReturnType<typeof createAdminClient>,
  triggeringMatchId?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: predictionPoints, error: predictionPointsError } = await adminSupabase
    .from("predictions")
    .select("user_id,points_awarded");

  if (predictionPointsError) {
    return { ok: false, message: predictionPointsError.message };
  }

  const totalsByUser = new Map<string, number>();
  for (const row of predictionPoints as { user_id: string; points_awarded: number | null }[]) {
    totalsByUser.set(row.user_id, (totalsByUser.get(row.user_id) ?? 0) + (row.points_awarded ?? 0));
  }

  const { data: users, error: usersError } = await adminSupabase.from("users").select("id");
  if (usersError) {
    return { ok: false, message: usersError.message };
  }

  const totals = (users as { id: string }[])
    .map((user) => ({ user_id: user.id, total_points: totalsByUser.get(user.id) ?? 0 }))
    .sort((a, b) => b.total_points - a.total_points || a.user_id.localeCompare(b.user_id));

  const rankedEntries = assignRanks(totals).map((entry) => ({
    ...entry,
    updated_at: new Date().toISOString()
  }));

  if (rankedEntries.length > 0) {
    const { error: leaderboardError } = await adminSupabase
      .from("leaderboard_entries")
      .upsert(rankedEntries, { onConflict: "user_id" });

    if (leaderboardError) {
      return { ok: false, message: leaderboardError.message };
    }

    if (triggeringMatchId) {
      const { error: snapshotDeleteError } = await adminSupabase
        .from("leaderboard_snapshots")
        .delete()
        .eq("scope_type", "global")
        .eq("match_id", triggeringMatchId)
        .is("group_id", null);

      if (snapshotDeleteError) {
        return { ok: false, message: snapshotDeleteError.message };
      }

      const { error: snapshotError } = await adminSupabase.from("leaderboard_snapshots").insert(
        rankedEntries.map((entry) => ({
          scope_type: "global",
          group_id: null,
          match_id: triggeringMatchId,
          user_id: entry.user_id,
          rank: entry.rank,
          total_points: entry.total_points
        }))
      );

      if (snapshotError) {
        return { ok: false, message: snapshotError.message };
      }

      const { data: groupMembers, error: groupMembersError } = await adminSupabase
        .from("group_members")
        .select("group_id,user_id");

      if (groupMembersError) {
        return { ok: false, message: groupMembersError.message };
      }

      const membersByGroupId = new Map<string, string[]>();
      for (const membership of (groupMembers as { group_id: string; user_id: string }[] | null) ?? []) {
        const existing = membersByGroupId.get(membership.group_id) ?? [];
        existing.push(membership.user_id);
        membersByGroupId.set(membership.group_id, existing);
      }

      const groupSnapshotRows = Array.from(membersByGroupId.entries()).flatMap(([groupId, memberUserIds]) => {
        const rankedGroupEntries = assignRanks(
          Array.from(new Set(memberUserIds))
            .map((userId) => ({
              user_id: userId,
              total_points: totalsByUser.get(userId) ?? 0
            }))
            .sort((a, b) => b.total_points - a.total_points || a.user_id.localeCompare(b.user_id))
        );

        return rankedGroupEntries.map((entry) => ({
          scope_type: "group",
          group_id: groupId,
          match_id: triggeringMatchId,
          user_id: entry.user_id,
          rank: entry.rank,
          total_points: entry.total_points
        }));
      });

      const { error: groupSnapshotDeleteError } = await adminSupabase
        .from("leaderboard_snapshots")
        .delete()
        .eq("scope_type", "group")
        .eq("match_id", triggeringMatchId);

      if (groupSnapshotDeleteError) {
        return { ok: false, message: groupSnapshotDeleteError.message };
      }

      if (groupSnapshotRows.length > 0) {
        const { error: groupSnapshotInsertError } = await adminSupabase
          .from("leaderboard_snapshots")
          .insert(groupSnapshotRows);

        if (groupSnapshotInsertError) {
          return { ok: false, message: groupSnapshotInsertError.message };
        }
      }
    }
  }

  const userTotalUpdates = (users as { id: string }[]).map((user) =>
    adminSupabase
      .from("users")
      .update({ total_points: totalsByUser.get(user.id) ?? 0 })
      .eq("id", user.id)
  );

  const userUpdateResults = await Promise.all(userTotalUpdates);
  const failedUserUpdate = userUpdateResults.find((result) => result.error);
  if (failedUserUpdate?.error) {
    return { ok: false, message: failedUserUpdate.error.message };
  }

  return { ok: true };
}

async function recreateGlobalLeaderboardEventsForMatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string,
  scoredPredictions: ScoredPrediction[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const globalEventTypes = ["points_awarded", "perfect_pick", "rank_moved_up", "rank_moved_down"] as const;
  const events: LeaderboardEventInsert[] = [];

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
        }
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
        }
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
        }
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
        }
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
          }
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
          }
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
          }
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
          }
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

async function resetGroupMatchScoring(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
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

function assignRanks(totals: LeaderboardTotal[]) {
  let previousPoints: number | null = null;
  let previousRank = 0;

  return totals.map((entry, index) => {
    const rank = previousPoints === entry.total_points ? previousRank : index + 1;
    previousPoints = entry.total_points;
    previousRank = rank;
    return { ...entry, rank };
  });
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
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    winnerTeamId: row.winner_team_id ?? undefined,
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

function buildAdminRecoveryEmailHtml(input: {
  heading: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
}) {
  const escapedHeading = escapeHtml(input.heading);
  const escapedIntro = escapeHtml(input.intro);
  const escapedActionLabel = escapeHtml(input.actionLabel);
  const escapedActionUrl = escapeHtml(input.actionUrl);
  const escapedNote = escapeHtml(input.note);

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h1 style="font-size: 24px; margin-bottom: 16px;">${escapedHeading}</h1>
      <p style="margin-bottom: 16px;">${escapedIntro}</p>
      <p style="margin: 24px 0;">
        <a href="${escapedActionUrl}" style="display: inline-block; background: #1f8b4c; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 700;">
          ${escapedActionLabel}
        </a>
      </p>
      <p style="margin-bottom: 12px; font-size: 14px; color: #4b5563;">
        If the button does not work, paste this link into your browser:<br />
        <span style="word-break: break-all;">${escapedActionUrl}</span>
      </p>
      <p style="font-size: 14px; color: #6b7280;">${escapedNote}</p>
    </div>
  `;
}

function buildAdminRecoveryEmailText(input: {
  heading: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
}) {
  return [
    input.heading,
    "",
    input.intro,
    "",
    `${input.actionLabel}:`,
    input.actionUrl,
    "",
    input.note
  ].join("\n");
}

function formatLeaderboardFeatureSettingLabel(key: LeaderboardFeatureSettingKey) {
  switch (key) {
    case "daily_winner_enabled":
      return "Daily Winner";
    case "perfect_pick_enabled":
      return "Perfect Pick";
    case "leaderboard_activity_enabled":
      return "Leaderboard activity";
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
    role: UserRole;
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
    role: input.role,
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
    .select("email,display_name,role,accepted_at,status,last_sent_at,send_attempts,last_error")
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
  input: { kind: EmailJobKind; email: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.kind === "access_email") {
    const { error } = await adminSupabase.auth.admin.inviteUserByEmail(input.email, {
      redirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent("/login?confirmed=1&flow=invite&mode=signup")}`
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  }

  const { error } = await adminSupabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

function isMissingInviteLifecycleColumnError(message: string) {
  return (
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
  return normalized.includes(relation.toLowerCase()) && normalized.includes("schema cache");
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
