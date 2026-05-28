"use client";

import { DEFAULT_LEGAL_DOCUMENT_TYPE } from "@/lib/legal";
import { getAccessCodeBlockedMessage, getAccessCodeFailureReasonFromMessage } from "@/lib/access-codes";
import { getPromoManagerInviteReasonFromMessage } from "@/lib/promo-manager-invite-codes";
import {
  APP_LANGUAGE_COOKIE_KEY,
  APP_LANGUAGE_STORAGE_KEY,
  HELPER_LANGUAGE_CHANGED_EVENT,
  PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY,
  appendLanguageToPath,
  defaultLanguage,
  normalizeLanguage,
  type SupportedLanguage
} from "@/lib/i18n";
import { teams } from "@/lib/mock-data";
import { getPublicWebPushVapidKey } from "@/lib/push-config";
import { normalizeCommercialTier, resolveAccessLevel } from "@/lib/tier-access";
import {
  isMissingColumnError,
  isMissingAnyRelationError,
  isMissingRelationError,
  isMissingStorageBucketError,
  warnOptionalFeatureOnce
} from "@/lib/schema-safety";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getSafeSupabaseErrorInfo } from "@/lib/supabase-errors";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/client";
import { parseJsonResponse } from "@/lib/fetch-json";
import { notifyCurrentUserProfileChanged } from "@/lib/current-user-events";
import { demoSignIn, demoSignOut, demoSignUp, getDemoCurrentUser } from "@/lib/demo-auth-fallback";
import { isSpecialVisualThemeId } from "@/lib/localized-card-themes";
import { getLanguageLabel } from "@/lib/strings";
import type { UserProfile, UserTrophy } from "@/lib/types";

type AuthMode = "login" | "signup";

export type AuthResult =
  | { ok: true; user?: UserProfile | null; needsEmailConfirmation?: boolean; message?: string }
  | { ok: false; message: string };

export type AvatarUploadResult =
  | { ok: true; avatarUrl: string; message: string }
  | { ok: false; message: string };

export type PushRegistrationResult = AuthResult;
export type DisplayNameUpdateResult = AuthResult;

type AuthOptions = {
  nextPath?: string;
  flow?: string;
  language?: string;
  accessCode?: string;
  promoManagerCode?: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
  preferred_language?: string | null;
  role: UserProfile["role"];
  plan_tier?: string | null;
  username?: string | null;
  username_set_at?: string | null;
  needs_profile_setup?: boolean | null;
  total_points: number;
};

type ManagerLimitsRow = {
  max_groups: number;
  max_members_per_group: number;
};

type UserSettingsRow = {
  notifications_enabled?: boolean | null;
  followed_team_ids?: string[] | null;
  visual_theme_id?: string | null;
  dismissed_message_ids?: string[] | null;
};

type PushTokenRow = {
  id: string;
};

type UserTrophyRow = {
  awarded_at: string;
  trophies:
    | {
        id: string;
        key: string;
        name: string;
        description: string;
        icon: string;
        tier?: "bronze" | "silver" | "gold" | "special" | null;
      }
    | {
        id: string;
        key: string;
        name: string;
        description: string;
        icon: string;
        tier?: "bronze" | "silver" | "gold" | "special" | null;
      }[]
    | null;
};

type TrophyNotificationRow = {
  id: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type LegalDocumentRow = {
  language: string;
  required_version: string;
  title: string;
  body: string;
};

export type CurrentLegalDocument = {
  language: SupportedLanguage;
  requiredVersion: string;
  title: string;
  body: string;
};

export type CurrentBracketScoreSummary = {
  bracketPoints: number;
  correctPicks: number;
};

type UserLegalAcceptanceRow = {
  language: string;
  document_version: string;
  accepted_at: string;
};

const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
const AVATAR_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
};

export async function authenticateWithEmail(
  mode: AuthMode,
  email: string,
  password: string,
  options?: AuthOptions
): Promise<AuthResult> {
  if (
    mode === "signup" &&
    options?.flow !== "invite" &&
    !options?.promoManagerCode?.trim() &&
    !options?.accessCode?.trim()
  ) {
    return { ok: false, message: "Enter the access code from your group organizer to create your account." };
  }

  if (!hasSupabaseConfig()) {
    const result = mode === "login" ? demoSignIn(email, password) : demoSignUp(email, password);
    return result.ok ? { ok: true, user: result.user } : result;
  }

  const supabase = createClient();
  const normalizedEmail = email.trim().toLowerCase();
  const loginReturnPath = buildLoginReturnPath({
    confirmed: true,
    nextPath: options?.nextPath,
    flow: options?.flow,
    language: options?.language,
    mode: options?.flow === "invite" ? "login" : undefined
  });
  const signupRedirectUrl = buildAuthCallbackUrl(loginReturnPath, options?.language);
  if (mode === "signup") {
    console.info("Starting signup with confirmation redirect.", {
      email: normalizedEmail,
      redirectTo: signupRedirectUrl
    });
  }
  const response =
    mode === "login"
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await signUpWithInviteContext(
          supabase,
          normalizedEmail,
          password,
          signupRedirectUrl,
          options?.accessCode,
          options?.promoManagerCode,
          options?.language
        );

  if (response.error) {
    const metadataKeys = getSignupMetadataKeys(options?.accessCode, options?.promoManagerCode, options?.language);
    const safeAuthError = getSafeSupabaseErrorInfo(response.error, "Supabase auth returned an unknown error.");
    const authErrorRecord = response.error as Record<string, unknown>;

    console.error("[access-code:signup] Supabase auth returned an error.", {
      authErrorCode: safeAuthError.code,
      authErrorConstructor: safeAuthError.constructorName,
      authErrorDetails: safeAuthError.details,
      authErrorHint: safeAuthError.hint,
      authErrorJson: safeSerializeAuthError(response.error),
      authErrorKeys: Object.keys(authErrorRecord),
      mode,
      hadAccessCode: Boolean(options?.accessCode?.trim()),
      hadPromoManagerCode: Boolean(options?.promoManagerCode?.trim()),
      isAuthError:
        typeof authErrorRecord.__isAuthError === "boolean" ? authErrorRecord.__isAuthError : null,
      message: safeAuthError.message,
      metadataKeys,
      name: safeAuthError.name,
      ownPropertyNames: safeAuthError.ownPropertyNames,
      signupPayloadMode: mode === "signup" ? "email_password_with_metadata" : "email_password",
      status: typeof authErrorRecord.status === "number" ? authErrorRecord.status : null
    });

    return {
      ok: false,
      message: getFriendlyAuthError(safeAuthError.message, mode, {
        hadAccessCode: Boolean(options?.accessCode?.trim()),
        hadPromoManagerCode: Boolean(options?.promoManagerCode?.trim())
      })
    };
  }

  if (mode === "signup" && response.data.user && !response.data.session) {
    return {
      ok: true,
      needsEmailConfirmation: true,
      message: "Check your email to confirm your account, then sign in."
    };
  }

  if (mode === "login" && options?.accessCode?.trim()) {
    const redemptionResult = await redeemAccessCodeForCurrentUser(options.accessCode);
    if (!redemptionResult.ok) {
      return redemptionResult;
    }
  }

  if (mode === "login") {
    try {
      const reconcileResponse = await fetch("/api/auth/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const reconcileResult = await parseJsonResponse<unknown>(
        reconcileResponse,
        "Could not reconcile post-login invites.",
        "auth reconcile"
      );
      console.info("Post-login invite reconciliation completed.", reconcileResult);
    } catch (reconcileError) {
      console.error("Post-login invite reconciliation failed.", reconcileError);
    }
  }

  const profile = response.data.user ? await fetchCurrentProfile() : null;
  return { ok: true, user: profile };
}

async function redeemAccessCodeForCurrentUser(accessCode: string): Promise<AuthResult> {
  const response = await fetch("/api/access-codes/redeem", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code: accessCode })
  });

  const result = await parseJsonResponse<{ ok: true; message?: string } | { ok: false; message?: string }>(
    response,
    "Could not redeem that invite code right now.",
    "access-code redemption"
  );

  if (!response.ok || !result.ok) {
    return {
      ok: false,
      message: result.ok ? "Could not redeem that invite code right now." : result.message ?? "Could not redeem that invite code right now."
    };
  }

  return {
    ok: true,
    message: result.message
  };
}

export async function fetchCurrentProfile(): Promise<UserProfile | null> {
  if (!hasSupabaseConfig()) {
    return getDemoCurrentUser();
  }

  const supabase = createClient();
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    if (isInvalidRefreshTokenError(sessionError.message)) {
      await supabase.auth.signOut({ scope: "local" });
      return null;
    }

    return null;
  }

  if (!session?.user) {
    return null;
  }

  const [profileResult, { data: managerLimits }, userSettingsResult, pushTokensResult, legalDocumentResult, legalAcceptanceResult] = await Promise.all([
    fetchCurrentUserProfileRow(supabase, session.user.id),
    supabase
      .from("manager_limits")
      .select("max_groups,max_members_per_group")
      .eq("user_id", session.user.id)
      .maybeSingle(),
    fetchCurrentUserSettingsRow(supabase, session.user.id),
    supabase
      .from("push_tokens")
      .select("id")
      .eq("user_id", session.user.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("legal_documents")
      .select("language,required_version,title,body")
      .eq("document_type", DEFAULT_LEGAL_DOCUMENT_TYPE)
      .eq("is_active", true),
    supabase
      .from("user_legal_acceptances")
      .select("language,document_version,accepted_at")
      .eq("user_id", session.user.id)
      .eq("document_type", DEFAULT_LEGAL_DOCUMENT_TYPE)
      .order("accepted_at", { ascending: false })
      .limit(10)
  ]);

  if (profileResult.error) {
    console.error("Could not load current user profile from public.users.", {
      userId: session.user.id,
      message: profileResult.error.message
    });
    return null;
  }

  const profileRow = profileResult.data;
  if (!profileRow) {
    console.error("Authenticated user session exists without a matching public.users profile.", {
      userId: session.user.id,
      email: session.user.email ?? null
    });
    return null;
  }

  const preferredLanguage = normalizeLanguage(profileRow?.preferred_language);
  const notificationsEnabled = isMissingUserSettingsTableError(userSettingsResult.error?.message)
    ? false
    : ((userSettingsResult.data as UserSettingsRow | null)?.notifications_enabled ?? false);
  const followedTeamIds = isMissingUserSettingsTableError(userSettingsResult.error?.message)
    ? []
    : normalizeFollowedTeamIds((userSettingsResult.data as UserSettingsRow | null)?.followed_team_ids ?? []);
  const visualThemeId = isMissingUserSettingsTableError(userSettingsResult.error?.message)
    ? null
    : normalizeVisualThemeId((userSettingsResult.data as UserSettingsRow | null)?.visual_theme_id ?? null);
  const dismissedMessageIds = isMissingUserSettingsTableError(userSettingsResult.error?.message)
    ? []
    : normalizeDismissedMessageIds((userSettingsResult.data as UserSettingsRow | null)?.dismissed_message_ids ?? []);
  const pushNotificationsEnabled = isMissingPushTokensTableError(pushTokensResult.error?.message)
    ? false
    : Boolean((pushTokensResult.data as PushTokenRow | null)?.id);
  const requiredLegalDocuments = isMissingLegalTablesError(legalDocumentResult.error?.message)
    ? []
    : ((legalDocumentResult.data as LegalDocumentRow[] | null) ?? []);
  const resolvedLegalDocument = resolvePreferredLegalDocument(requiredLegalDocuments, preferredLanguage);
  const legalAcceptances = isMissingLegalTablesError(legalAcceptanceResult.error?.message)
    ? []
    : ((legalAcceptanceResult.data as UserLegalAcceptanceRow[] | null) ?? []);
  const latestLegalAcceptance = resolvedLegalDocument
    ? legalAcceptances.find((acceptance) => normalizeLanguage(acceptance.language) === resolvedLegalDocument.language) ?? null
    : null;
  const requiredEulaVersion = resolvedLegalDocument?.required_version ?? null;
  const needsLegalAcceptance = Boolean(
    requiredEulaVersion &&
      (!latestLegalAcceptance || latestLegalAcceptance.document_version !== requiredEulaVersion)
  );

  return mapUserRow(
    profileRow,
    (managerLimits as ManagerLimitsRow | null) ?? null,
    notificationsEnabled,
    followedTeamIds,
    visualThemeId,
    dismissedMessageIds,
    pushNotificationsEnabled,
    {
      needsLegalAcceptance,
      requiredEulaVersion,
      acceptedEulaVersion: latestLegalAcceptance?.document_version ?? null,
      acceptedEulaAt: latestLegalAcceptance?.accepted_at ?? null,
      currentEulaLanguage: resolvedLegalDocument ? normalizeLanguage(resolvedLegalDocument.language) : null,
      currentEulaTitle: resolvedLegalDocument?.title ?? null,
      currentEulaBody: resolvedLegalDocument?.body ?? null
    }
  );
}

export function onAuthStateChange(callback: () => void) {
  if (!hasSupabaseConfig()) {
    return { unsubscribe() {} };
  }

  const supabase = createClient();
  const { data } = supabase.auth.onAuthStateChange(() => {
    callback();
  });

  return data.subscription;
}

export async function signOutCurrentUser() {
  if (!hasSupabaseConfig()) {
    demoSignOut();
    return;
  }

  const supabase = createClient();
  await supabase.auth.signOut();
}

export async function sendCurrentUserPasswordReset(email: string): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    return {
      ok: false,
      message: "Password reset emails need a configured Supabase project."
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, message: "A valid email is required." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${getPublicSiteUrl()}/auth/confirm?next=/reset-password`
  });

  if (error) {
    return { ok: false, message: error.message || "Could not send the password reset email." };
  }

  return {
    ok: true,
    message: `Password reset email sent to ${normalizedEmail}.`
  };
}

export async function fetchCurrentUserTrophies(): Promise<UserTrophy[]> {
  if (!hasSupabaseConfig()) {
    return [];
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_trophies")
    .select("awarded_at,trophies(id,key,name,description,icon,tier)")
    .eq("user_id", user.id)
    .order("awarded_at", { ascending: false });

  if (error) {
    if (isMissingTrophiesTableError(error.message)) {
      return [];
    }

    console.error("Could not load current user trophies.", error);
    return [];
  }

  return ((data as unknown as UserTrophyRow[] | null) ?? [])
    .map((row) => ({
      ...row,
      trophies: Array.isArray(row.trophies) ? (row.trophies[0] ?? null) : row.trophies
    }))
    .filter((row) => row.trophies)
    .map((row) => ({
      id: row.trophies!.id,
      key: row.trophies!.key,
      name: row.trophies!.name,
      description: row.trophies!.description,
      icon: row.trophies!.icon,
      tier: row.trophies!.tier ?? "special",
      awardedAt: row.awarded_at
    }));
}

export type PendingTrophyCelebration = UserTrophy & {
  notificationId: string;
};

export async function fetchPendingTrophyCelebrations(): Promise<PendingTrophyCelebration[]> {
  if (!hasSupabaseConfig()) {
    return [];
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_notifications")
    .select("id,payload,created_at")
    .eq("user_id", user.id)
    .eq("type", "trophy_earned")
    .is("read_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingUserNotificationsTableError(error.message)) {
      return [];
    }

    console.error("Could not load pending trophy celebrations.", error);
    return [];
  }

  return (((data as TrophyNotificationRow[] | null) ?? [])
    .map((row) => mapPendingTrophyCelebration(row))
    .filter((row): row is PendingTrophyCelebration => Boolean(row)));
}

export async function fetchCurrentLegalDocumentForProfile(
  preferredLanguage?: string | null
): Promise<CurrentLegalDocument | null> {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("legal_documents")
    .select("language,required_version,title,body")
    .eq("document_type", DEFAULT_LEGAL_DOCUMENT_TYPE)
    .eq("is_active", true);

  if (error) {
    if (isMissingLegalTablesError(error.message)) {
      return null;
    }

    console.warn("Could not refresh current legal document for profile.", {
      message: error.message ?? null,
      details: error
    });
    return null;
  }

  const rows = ((data as LegalDocumentRow[] | null) ?? []).map((row) => ({
    language: normalizeLanguage(row.language),
    requiredVersion: row.required_version,
    title: row.title,
    body: row.body
  }));

  if (rows.length === 0) {
    return null;
  }

  const resolvedPreferredLanguage = normalizeLanguage(preferredLanguage);
  return (
    rows.find((row) => row.language === resolvedPreferredLanguage) ??
    rows.find((row) => row.language === defaultLanguage) ??
    rows[0] ??
    null
  );
}

export async function fetchCurrentBracketScoreSummary(): Promise<CurrentBracketScoreSummary> {
  if (!hasSupabaseConfig()) {
    return { bracketPoints: 0, correctPicks: 0 };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { bracketPoints: 0, correctPicks: 0 };
  }

  const { data, error } = await supabase
    .from("bracket_scores")
    .select("points,is_correct")
    .eq("user_id", user.id);

  if (error) {
    if (isMissingBracketScoresTableError(error.message)) {
      return { bracketPoints: 0, correctPicks: 0 };
    }

    console.error("Could not load current bracket score summary.", error);
    return { bracketPoints: 0, correctPicks: 0 };
  }

  const rows = (data ?? []) as Array<{ points: number | null; is_correct: boolean | null }>;
  return {
    bracketPoints: rows.reduce((sum, row) => sum + (row.points ?? 0), 0),
    correctPicks: rows.filter((row) => row.is_correct).length
  };
}

export async function markTrophyCelebrationRead(notificationId: string): Promise<boolean> {
  if (!hasSupabaseConfig()) {
    return false;
  }

  const trimmedNotificationId = notificationId.trim();
  if (!trimmedNotificationId) {
    return false;
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", trimmedNotificationId)
    .is("read_at", null);

  if (error) {
    if (isMissingUserNotificationsTableError(error.message)) {
      return false;
    }

    console.error("Could not mark trophy celebration as read.", error);
    return false;
  }

  return true;
}

export async function uploadCurrentUserAvatar(file: File): Promise<AvatarUploadResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Avatar uploads need a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to upload an avatar." };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "Choose an image file for your avatar." };
  }

  if (file.size > MAX_AVATAR_FILE_BYTES) {
    return { ok: false, message: "Choose an image smaller than 5 MB for your avatar." };
  }

  const extension = getAvatarExtension(file.type);
  if (!extension) {
    return { ok: false, message: "Use a JPG, PNG, WEBP, GIF, or AVIF image for your avatar." };
  }

  const objectPath = `${user.id}.${extension}`;
  await removeKnownAvatarObjects(supabase, user.id);
  const { error: uploadError } = await supabase.storage.from("avatars").upload(objectPath, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600"
  });

  if (uploadError) {
    if (isMissingStorageBucketError(uploadError.message, "avatars")) {
      return { ok: false, message: "Avatar uploads are not available yet. Apply the avatar storage migration first." };
    }
    return { ok: false, message: uploadError.message };
  }

  const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(objectPath);
  const avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: profileError } = await supabase
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (profileError) {
    return { ok: false, message: profileError.message };
  }

  notifyCurrentUserProfileChanged();

  return {
    ok: true,
    avatarUrl,
    message: "Avatar updated."
  };
}

export async function clearCurrentUserAvatar(): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Avatar editing needs a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to update your avatar." };
  }

  await removeKnownAvatarObjects(supabase, user.id);

  const { error } = await supabase
    .from("users")
    .update({ avatar_url: null })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  notifyCurrentUserProfileChanged();

  return {
    ok: true,
    message: "Avatar removed."
  };
}

export async function updateCurrentUserHomeTeam(homeTeamId: string | null): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Home team selection needs a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to update your home team." };
  }

  const normalizedTeamId = homeTeamId?.trim() || null;
  if (normalizedTeamId && !teams.some((team) => team.id === normalizedTeamId)) {
    return { ok: false, message: "Choose a valid home team." };
  }

  const { error } = await supabase
    .from("users")
    .update({ home_team_id: normalizedTeamId })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  notifyCurrentUserProfileChanged();

  return {
    ok: true,
    message: normalizedTeamId ? "Home team updated." : "Home team cleared."
  };
}

export async function updateCurrentUserVisualTheme(visualThemeId: string | null): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Visual theme selection needs a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to update your visual theme." };
  }

  const normalizedVisualThemeId = normalizeVisualThemeId(visualThemeId);
  if (visualThemeId?.trim() && !normalizedVisualThemeId) {
    return { ok: false, message: "Choose a valid visual theme." };
  }

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      visual_theme_id: normalizedVisualThemeId
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (isMissingUserSettingsTableError(error.message) || isMissingVisualThemeIdColumnError(error.message)) {
      return {
        ok: false,
        message: "Visual theme selection is not available yet. Apply the visual theme migration first."
      };
    }

    return { ok: false, message: error.message || "Could not update visual theme right now." };
  }

  notifyCurrentUserProfileChanged();

  return {
    ok: true,
    message: normalizedVisualThemeId ? "Visual theme updated." : "Visual theme reset to Auto/default."
  };
}

export async function updateCurrentUserFollowedTeams(teamIds: string[]): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Followed teams need a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to update followed teams." };
  }

  const normalizedTeamIds = normalizeFollowedTeamIds(teamIds);
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      followed_team_ids: normalizedTeamIds
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (isMissingUserSettingsTableError(error.message) || isMissingFollowedTeamIdsColumnError(error.message)) {
      return {
        ok: false,
        message: "Followed teams are not available yet. Apply the followed teams migration first."
      };
    }

    return { ok: false, message: error.message || "Could not update followed teams right now." };
  }

  notifyCurrentUserProfileChanged();

  return {
    ok: true,
    message: normalizedTeamIds.length > 0 ? "Followed teams updated." : "Followed teams cleared."
  };
}

export async function dismissCurrentUserMessageId(messageId: string): Promise<AuthResult> {
  if (!messageId.trim()) {
    return { ok: false, message: "Choose a valid message to dismiss." };
  }

  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Dismissed messages need a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to dismiss this message." };
  }

  const settingsResult = await supabase
    .from("user_settings")
    .select("dismissed_message_ids")
    .eq("user_id", user.id)
    .maybeSingle();

  if (settingsResult.error) {
    if (
      isMissingUserSettingsTableError(settingsResult.error.message) ||
      isMissingDismissedMessageIdsColumnError(settingsResult.error.message)
    ) {
      return {
        ok: false,
        message: "Dismissed message storage is not available yet. Apply the dismissed messages migration first."
      };
    }

    return { ok: false, message: settingsResult.error.message || "Could not read dismissed messages right now." };
  }

  const nextDismissedMessageIds = normalizeDismissedMessageIds([
    ...(((settingsResult.data as UserSettingsRow | null)?.dismissed_message_ids ?? []) as string[]),
    messageId
  ]);

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      dismissed_message_ids: nextDismissedMessageIds
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (isMissingUserSettingsTableError(error.message) || isMissingDismissedMessageIdsColumnError(error.message)) {
      return {
        ok: false,
        message: "Dismissed message storage is not available yet. Apply the dismissed messages migration first."
      };
    }

    return { ok: false, message: error.message || "Could not dismiss this message right now." };
  }

  notifyCurrentUserProfileChanged({ dismissedMessageIds: nextDismissedMessageIds });

  return {
    ok: true,
    message: "Message dismissed."
  };
}

export async function updateCurrentUserPreferredLanguage(language: string): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Language preferences need a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to update your language." };
  }

  const preferredLanguage = normalizeLanguage(language);
  const { error } = await supabase
    .from("users")
    .update({ preferred_language: preferredLanguage })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  try {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, preferredLanguage);
    window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, preferredLanguage);
    window.document.cookie = `${APP_LANGUAGE_COOKIE_KEY}=${preferredLanguage}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent(HELPER_LANGUAGE_CHANGED_EVENT));
  } catch (storageError) {
    console.warn("Could not persist preferred language locally.", storageError);
  }

  notifyCurrentUserProfileChanged({ preferredLanguage });

  return {
    ok: true,
    message: `Language updated to ${getLanguageLabel(preferredLanguage)}.`
  };
}

export function isUsingDemoAuthFallback() {
  return !hasSupabaseConfig();
}

function mapUserRow(
  row: UserRow,
  managerLimits: ManagerLimitsRow | null,
  notificationsEnabled: boolean,
  followedTeamIds: string[],
  visualThemeId: string | null,
  dismissedMessageIds: string[],
  pushNotificationsEnabled: boolean,
  legalStatus?: {
    needsLegalAcceptance: boolean;
    requiredEulaVersion: string | null;
    acceptedEulaVersion: string | null;
    acceptedEulaAt: string | null;
    currentEulaLanguage?: SupportedLanguage | null;
    currentEulaTitle?: string | null;
    currentEulaBody?: string | null;
  }
): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    homeTeamId: row.home_team_id ?? null,
    visualThemeId,
    followedTeamIds,
    dismissedMessageIds,
    preferredLanguage: normalizeLanguage(row.preferred_language),
    role: row.role,
    accessLevel: resolveAccessLevel({
      role: row.role,
      planTier: row.plan_tier ?? null,
      managerLimits: managerLimits
        ? {
            maxGroups: managerLimits.max_groups,
            maxMembersPerGroup: managerLimits.max_members_per_group
          }
        : null
    }),
    planTier: normalizeCommercialTier(row.plan_tier ?? null),
    username: row.username ?? null,
    usernameSetAt: row.username_set_at ?? null,
    needsProfileSetup: row.needs_profile_setup ?? false,
    notificationsEnabled,
    pushNotificationsEnabled,
    needsLegalAcceptance: legalStatus?.needsLegalAcceptance ?? false,
    requiredEulaVersion: legalStatus?.requiredEulaVersion ?? null,
    acceptedEulaVersion: legalStatus?.acceptedEulaVersion ?? null,
    acceptedEulaAt: legalStatus?.acceptedEulaAt ?? null,
    currentEulaLanguage: legalStatus?.currentEulaLanguage ?? null,
    currentEulaTitle: legalStatus?.currentEulaTitle ?? null,
    currentEulaBody: legalStatus?.currentEulaBody ?? null,
    managerLimits: managerLimits
      ? {
          maxGroups: managerLimits.max_groups,
          maxMembersPerGroup: managerLimits.max_members_per_group
        }
      : null,
    totalPoints: row.total_points
  };
}

function resolvePreferredLegalDocument(rows: LegalDocumentRow[], preferredLanguage: SupportedLanguage) {
  const rowsByLanguage = new Map(rows.map((row) => [normalizeLanguage(row.language), row]));
  return rowsByLanguage.get(preferredLanguage) ?? rowsByLanguage.get(defaultLanguage) ?? null;
}

function getAvatarExtension(mimeType: string) {
  return AVATAR_EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase()] ?? null;
}

async function removeKnownAvatarObjects(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const paths = Object.values(AVATAR_EXTENSION_BY_MIME_TYPE).map((extension) => `${userId}.${extension}`);
  const uniquePaths = Array.from(new Set(paths));
  const { error } = await supabase.storage.from("avatars").remove(uniquePaths);
  if (error && !error.message.toLowerCase().includes("not found") && !isMissingStorageBucketError(error.message, "avatars")) {
    console.warn("Could not clear previous avatar objects.", error.message);
  }
}

export async function updateCurrentUserNotificationPreferences(enabled: boolean): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Notifications need a configured Supabase project." };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to update notifications." };
  }

  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      notifications_enabled: enabled
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (isMissingUserSettingsTableError(error.message)) {
      return {
        ok: false,
        message: "Notification preferences are not available yet. Apply the user notifications migration first."
      };
    }

    return { ok: false, message: error.message || "Could not update notifications right now." };
  }

  return {
    ok: true,
    message: enabled ? "Leaderboard notifications turned on." : "Leaderboard notifications turned off."
  };
}

export async function deleteCurrentUserAccount(confirmationText: string): Promise<AuthResult> {
  const response = await fetch("/api/profile/delete-account", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ confirmationText })
  });

  const result = await parseJsonResponse<{ ok: boolean; message?: string }>(
    response,
    "Could not delete your account.",
    "delete account"
  );

  if (!result.ok) {
    return { ok: false, message: result.message ?? "Could not delete your account." };
  }

  return { ok: true, message: result.message ?? "Your account was deleted." };
}

export async function registerCurrentBrowserPushNotifications(): Promise<PushRegistrationResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Push notifications need a configured Supabase project." };
  }

  if (
    typeof window === "undefined" ||
    typeof Notification === "undefined" ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return { ok: false, message: "This browser does not support push notifications." };
  }

  const publicVapidKey = getPublicWebPushVapidKey();
  if (!publicVapidKey) {
    return { ok: false, message: "Web push is not configured yet." };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { ok: false, message: "Push notification permission was not granted." };
  }

  try {
    const registration = await navigator.serviceWorker.register("/push-sw.js");
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64UrlToUint8Array(publicVapidKey)
      }));

    const response = await fetch("/api/push/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token: JSON.stringify(subscription.toJSON()),
        platform: "web"
      })
    });

    const result = await parseJsonResponse<{ ok: true; message?: string } | { ok: false; message?: string }>(
      response,
      "Could not register this browser for push notifications.",
      "push registration"
    );
    if (!response.ok || !result.ok) {
      throw new Error(result.ok ? "Could not register this browser for push notifications." : result.message);
    }

    return {
      ok: true,
      message: result.message ?? "Push notifications enabled for this browser."
    };
  } catch (error) {
    console.error("Failed to register browser push notifications.", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not register this browser for push notifications."
    };
  }
}

export async function updateCurrentUserDisplayName(displayName: string): Promise<DisplayNameUpdateResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, message: "Display name editing needs a configured Supabase project." };
  }

  const supabase = createClient();
  const normalizedDisplayName = normalizeDisplayNameValue(displayName);
  if (!isValidDisplayName(normalizedDisplayName)) {
    return {
      ok: false,
      message: "Display name must be 2-30 characters and can use letters, numbers, spaces, periods, hyphens, and underscores."
    };
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to update your display name." };
  }

  const { error } = await supabase
    .from("users")
    .update({
      name: normalizedDisplayName,
      updated_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: error.message || "Could not update your display name." };
  }

  return { ok: true, message: "Display name updated." };
}

function decodeBase64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function getFriendlyAuthError(message: string, mode: AuthMode, options?: { hadAccessCode?: boolean; hadPromoManagerCode?: boolean }) {
  const normalized = message.toLowerCase();
  const accessCodeFailure = getAccessCodeFailureReasonFromMessage(message);
  const promoManagerFailure = getPromoManagerInviteReasonFromMessage(message);

  if (accessCodeFailure) {
    return getAccessCodeBlockedMessage(accessCodeFailure);
  }

  if (promoManagerFailure) {
    if (promoManagerFailure === "full") {
      return "This manager promotion is full.";
    }

    if (promoManagerFailure === "paused") {
      return "This manager promotion is paused.";
    }

    if (promoManagerFailure === "expired" || promoManagerFailure === "archived") {
      return "This manager promotion is no longer available.";
    }

    if (promoManagerFailure === "not_started") {
      return "This manager promotion has not started yet.";
    }

    if (promoManagerFailure === "ineligible") {
      return "This account is not eligible for this manager promotion.";
    }

    return "That manager promo code is not valid or is no longer available.";
  }

  if (mode === "signup" && options?.hadAccessCode) {
    if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
      return "That email already has an account. Switch to sign in.";
    }

    if (normalized.includes("database error")) {
      return "That code looked valid, but we couldn't finish signup. Ask the pool admin to verify access-code setup.";
    }

    if (
      normalized.includes("email_not_invited") ||
      normalized.includes("email is not invited") ||
      normalized.includes("not invited")
    ) {
      return "That email is not directly invited, and this access code could not be redeemed.";
    }

    if (normalized.includes("trigger") || normalized.includes("unexpected_failure")) {
      return "That code looked valid, but signup could not be completed. Ask the pool admin to verify access-code setup.";
    }
  }

  if (mode === "signup" && options?.hadPromoManagerCode) {
    if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
      return "That email already has an account. Switch to sign in.";
    }

    if (normalized.includes("database error") || normalized.includes("trigger")) {
      return "That manager promo looked valid, but signup could not be completed. Try again or contact support.";
    }
  }

  if (mode === "signup" && (normalized.includes("not invited") || normalized.includes("database error"))) {
    return "That email is not eligible yet. Ask the pool admin for an invite to the app or the group.";
  }

  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) {
    return "Email or password did not match. Try again.";
  }

  if (normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed")) {
    return "Your email still needs confirmation. Open the confirmation email, then sign in again.";
  }

  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "That email already has an account. Switch to sign in.";
  }

  return message || "Something went wrong. Please try again.";
}

async function signUpWithInviteContext(
  supabase: ReturnType<typeof createClient>,
  email: string,
  password: string,
  signupRedirectUrl: string,
  accessCode?: string,
  promoManagerCode?: string,
  language?: string
) {
  const trimmedAccessCode = accessCode?.trim() ?? "";
  const trimmedPromoManagerCode = promoManagerCode?.trim() ?? "";
  const metadata = getSignupMetadata(trimmedAccessCode, trimmedPromoManagerCode, language);
  console.info("[access-code:signup] Starting signup flow.", {
    email,
    hasAccessCode: Boolean(trimmedAccessCode),
    hasPromoManagerCode: Boolean(trimmedPromoManagerCode),
    metadataKeys: Object.keys(metadata ?? {})
  });

  if (trimmedAccessCode && trimmedPromoManagerCode) {
    return {
      data: { user: null, session: null },
      error: { message: "Use either an access code or a promo manager invite code, not both." }
    };
  }

  if (trimmedAccessCode) {
    console.info("[access-code:signup] Prevalidating access code before auth signup.", {
      email,
      normalizedCodePreview: `${trimmedAccessCode.replace(/\s+/g, "").trim().toLowerCase().slice(0, 4)}...`
    });

    const validationResponse = await fetch("/api/access-codes/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code: trimmedAccessCode, email })
    });

    const validationResult = await parseJsonResponse<
      | { ok: true; existingAccount?: boolean }
      | { ok: false; message?: string }
    >(validationResponse, "Could not validate that code right now.", "access-code validation");

    if (!validationResponse.ok) {
      console.error("[access-code:signup] Access-code prevalidation failed.", {
        email,
        status: validationResponse.status,
        message: validationResult.ok ? "Could not validate that code right now." : validationResult.message
      });

      return {
        data: { user: null, session: null },
        error: { message: validationResult.ok ? "Could not validate that code right now." : validationResult.message ?? "Could not validate that code right now." }
      };
    }

    if (!validationResult.ok) {
      console.warn("[access-code:signup] Access-code prevalidation blocked signup.", {
        email,
        message: validationResult.message
      });

      return {
        data: { user: null, session: null },
        error: { message: validationResult.message ?? "That code is not valid or is no longer available." }
      };
    }

    if (validationResult.existingAccount) {
      return {
        data: { user: null, session: null },
        error: { message: "That email already has an account. Switch to sign in." }
      };
    }

    console.info("[access-code:signup] Access-code prevalidation passed. Submitting signup metadata.", {
      email,
      hasAccessCodeMetadata: true,
      metadataKeys: Object.keys(metadata ?? {})
    });
  }

  if (trimmedPromoManagerCode) {
    console.info("[promo-manager-invite:signup] Prevalidating promo manager invite code before auth signup.", {
      email,
      normalizedCodePreview: `${trimmedPromoManagerCode.replace(/\s+/g, "").trim().toLowerCase().slice(0, 4)}...`
    });

    const validationResponse = await fetch("/api/promo-manager-invite-codes/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code: trimmedPromoManagerCode, email })
    });

    const validationResult = await parseJsonResponse<
      | { ok: true }
      | { ok: false; message?: string }
    >(validationResponse, "Could not validate that promo code right now.", "promo-manager-invite validation");

    if (!validationResponse.ok || !validationResult.ok) {
      console.warn("[promo-manager-invite:signup] Promo manager invite prevalidation blocked signup.", {
        email,
        status: validationResponse.status,
        message: validationResult.ok ? null : validationResult.message
      });

      return {
        data: { user: null, session: null },
        error: {
          message: validationResult.ok
            ? "Could not validate that promo code right now."
            : validationResult.message ?? "That promo code is not valid or is no longer available."
        }
      };
    }

    console.info("[promo-manager-invite:signup] Promo manager invite prevalidation passed. Submitting signup metadata.", {
      email,
      metadataKeys: Object.keys(metadata ?? {})
    });
  }

  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: signupRedirectUrl,
      data: metadata
    }
  });
}

function getSignupMetadata(accessCode: string, promoManagerCode?: string, language?: string) {
  const metadata: Record<string, string> = {};
  if (accessCode) {
    metadata.access_code = accessCode;
  }

  if (promoManagerCode) {
    metadata.promo_manager_code = promoManagerCode;
  }

  if (language) {
    metadata.language = normalizeLanguage(language);
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function getSignupMetadataKeys(accessCode?: string, promoManagerCode?: string, language?: string) {
  return Object.keys(getSignupMetadata(accessCode?.trim() ?? "", promoManagerCode?.trim() ?? "", language) ?? {});
}

function safeSerializeAuthError(error: unknown) {
  try {
    if (!error || typeof error !== "object") {
      return String(error);
    }

    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  } catch {
    return null;
  }
}

async function fetchCurrentUserProfileRow(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ data: UserRow | null; error: { message: string } | null }> {
  const fullProfileQuery = await supabase
    .from("users")
    .select("id,name,email,avatar_url,home_team_id,preferred_language,role,plan_tier,username,username_set_at,needs_profile_setup,total_points")
    .eq("id", userId)
    .maybeSingle();

  if (!fullProfileQuery.error) {
    return {
      data: (fullProfileQuery.data as UserRow | null) ?? null,
      error: null
    };
  }

  const missingPreferredLanguage = isMissingPreferredLanguageColumnError(fullProfileQuery.error.message);
  const missingPlanTier = isMissingPlanTierColumnError(fullProfileQuery.error.message);
  const missingOtherUsersColumn = isLikelyMissingUsersProfileColumnError(fullProfileQuery.error.message);

  if (!missingPreferredLanguage && !missingPlanTier && !missingOtherUsersColumn) {
    return { data: null, error: { message: fullProfileQuery.error.message } };
  }

  if (missingPreferredLanguage) {
    warnOptionalFeatureOnce(
      "current-user-profile-preferred-language-missing",
      "Current-user profile is loading without preferred_language because the live public.users schema is behind the app.",
      fullProfileQuery.error.message
    );
  }

  if (missingPlanTier) {
    warnOptionalFeatureOnce(
      "current-user-profile-plan-tier-missing",
      "Current-user profile is loading without plan_tier because the live public.users schema is behind the app.",
      fullProfileQuery.error.message
    );
  }

  if (missingOtherUsersColumn && !missingPreferredLanguage && !missingPlanTier) {
    warnOptionalFeatureOnce(
      "current-user-profile-other-columns-missing",
      "Current-user profile is loading with a reduced public.users field set because the live schema is behind the app.",
      fullProfileQuery.error.message
    );
  }

  const fallbackSelect = missingOtherUsersColumn
    ? "id,name,email,role,total_points"
    : missingPreferredLanguage && missingPlanTier
      ? "id,name,email,avatar_url,home_team_id,role,username,username_set_at,needs_profile_setup,total_points"
      : missingPreferredLanguage
        ? "id,name,email,avatar_url,home_team_id,role,plan_tier,username,username_set_at,needs_profile_setup,total_points"
        : "id,name,email,avatar_url,home_team_id,preferred_language,role,username,username_set_at,needs_profile_setup,total_points";
  const fallbackProfileQuery = await supabase
    .from("users")
    .select(fallbackSelect)
    .eq("id", userId)
    .maybeSingle();

  if (fallbackProfileQuery.error) {
    return { data: null, error: { message: fallbackProfileQuery.error.message } };
  }

  const fallbackRow = fallbackProfileQuery.data as Partial<UserRow> | null;
  return {
    data: fallbackRow
      ? {
          ...fallbackRow,
          preferred_language: fallbackRow.preferred_language ?? defaultLanguage,
          plan_tier: fallbackRow.plan_tier ?? null
        } as UserRow
      : null,
    error: null
  };
}

async function fetchCurrentUserSettingsRow(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ data: UserSettingsRow | null; error: { message: string } | null }> {
  const fullSettingsQuery = await supabase
    .from("user_settings")
    .select("notifications_enabled,followed_team_ids,visual_theme_id,dismissed_message_ids")
    .eq("user_id", userId)
    .maybeSingle();

  if (!fullSettingsQuery.error) {
    return {
      data: (fullSettingsQuery.data as UserSettingsRow | null) ?? null,
      error: null
    };
  }

  if (isMissingUserSettingsTableError(fullSettingsQuery.error.message)) {
    return { data: null, error: { message: fullSettingsQuery.error.message } };
  }

  const missingFollowedTeamIds = isMissingFollowedTeamIdsColumnError(fullSettingsQuery.error.message);
  const missingVisualThemeId = isMissingVisualThemeIdColumnError(fullSettingsQuery.error.message);
  const missingDismissedMessageIds = isMissingDismissedMessageIdsColumnError(fullSettingsQuery.error.message);

  if (!missingFollowedTeamIds && !missingVisualThemeId && !missingDismissedMessageIds) {
    return { data: null, error: { message: fullSettingsQuery.error.message } };
  }

  if (missingFollowedTeamIds) {
    warnOptionalFeatureOnce(
      "current-user-settings-followed-teams-missing",
      "Current-user settings are loading without followed_team_ids because the live public.user_settings schema is behind the app.",
      fullSettingsQuery.error.message
    );
  }

  if (missingVisualThemeId) {
    warnOptionalFeatureOnce(
      "current-user-settings-visual-theme-missing",
      "Current-user settings are loading without visual_theme_id because the live public.user_settings schema is behind the app.",
      fullSettingsQuery.error.message
    );
  }

  if (missingDismissedMessageIds) {
    warnOptionalFeatureOnce(
      "current-user-settings-dismissed-messages-missing",
      "Current-user settings are loading without dismissed_message_ids because the live public.user_settings schema is behind the app.",
      fullSettingsQuery.error.message
    );
  }

  const fallbackColumns = [
    "notifications_enabled",
    ...(!missingFollowedTeamIds ? ["followed_team_ids"] : []),
    ...(!missingVisualThemeId ? ["visual_theme_id"] : []),
    ...(!missingDismissedMessageIds ? ["dismissed_message_ids"] : [])
  ];
  const fallbackSelect = fallbackColumns.join(",");

  const fallbackSettingsQuery = await supabase
    .from("user_settings")
    .select(fallbackSelect)
    .eq("user_id", userId)
    .maybeSingle();

  if (fallbackSettingsQuery.error) {
    return { data: null, error: { message: fallbackSettingsQuery.error.message } };
  }

  return {
    data: {
      notifications_enabled: (fallbackSettingsQuery.data as UserSettingsRow | null)?.notifications_enabled ?? false,
      followed_team_ids: missingFollowedTeamIds
        ? []
        : ((fallbackSettingsQuery.data as UserSettingsRow | null)?.followed_team_ids ?? []),
      visual_theme_id: missingVisualThemeId
        ? null
        : ((fallbackSettingsQuery.data as UserSettingsRow | null)?.visual_theme_id ?? null),
      dismissed_message_ids: missingDismissedMessageIds
        ? []
        : ((fallbackSettingsQuery.data as UserSettingsRow | null)?.dismissed_message_ids ?? [])
    },
    error: null
  };
}

function normalizeVisualThemeId(visualThemeId: string | null | undefined) {
  const normalizedVisualThemeId = visualThemeId?.trim().toLowerCase() || null;
  return isSpecialVisualThemeId(normalizedVisualThemeId) ? normalizedVisualThemeId : null;
}

function normalizeFollowedTeamIds(teamIds: string[] | null | undefined) {
  const validTeamIds = new Set(teams.map((team) => team.id));
  const normalized: string[] = [];

  for (const value of teamIds ?? []) {
    const normalizedTeamId = value?.trim().toLowerCase();
    if (!normalizedTeamId || !validTeamIds.has(normalizedTeamId) || normalized.includes(normalizedTeamId)) {
      continue;
    }

    normalized.push(normalizedTeamId);
  }

  return normalized;
}

function normalizeDismissedMessageIds(messageIds: string[] | null | undefined) {
  return Array.from(new Set((messageIds ?? []).map((messageId) => messageId.trim()).filter(Boolean))).slice(-48);
}

function isInvalidRefreshTokenError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("invalid refresh token") || normalized.includes("refresh token not found");
}

function isMissingUserSettingsTableError(message?: string) {
  return isMissingRelationError(message, "user_settings");
}

function isMissingFollowedTeamIdsColumnError(message?: string) {
  return isMissingColumnError(message, "user_settings", "followed_team_ids");
}

function isMissingVisualThemeIdColumnError(message?: string) {
  return isMissingColumnError(message, "user_settings", "visual_theme_id");
}

function isMissingDismissedMessageIdsColumnError(message?: string) {
  return isMissingColumnError(message, "user_settings", "dismissed_message_ids");
}

function isMissingPlanTierColumnError(message: string) {
  return isMissingColumnError(message, "users", "plan_tier");
}

function isLikelyMissingUsersProfileColumnError(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return normalized.includes("users") && normalized.includes("column");
}

function isMissingPushTokensTableError(message?: string) {
  return isMissingRelationError(message, "push_tokens");
}

function isMissingUserNotificationsTableError(message?: string) {
  return isMissingRelationError(message, "user_notifications");
}

function isMissingTrophiesTableError(message?: string) {
  if (isMissingAnyRelationError(message, ["user_trophies", "trophies"])) {
    warnOptionalFeatureOnce(
      "current-user-trophies-missing",
      "Current-user trophies are unavailable until the trophies migrations are applied.",
      message ?? undefined
    );
    return true;
  }

  return false;
}

function isMissingLegalTablesError(message?: string) {
  return isMissingAnyRelationError(message, ["legal_documents", "user_legal_acceptances"]);
}

function isMissingBracketScoresTableError(message?: string) {
  return isMissingRelationError(message, "bracket_scores");
}

function isMissingPreferredLanguageColumnError(message?: string) {
  return isMissingColumnError(message, "users", "preferred_language");
}

function buildLoginReturnPath(input: {
  confirmed?: boolean;
  nextPath?: string;
  flow?: string;
  language?: string;
  mode?: AuthMode;
}) {
  const params = new URLSearchParams();

  if (input.confirmed) {
    params.set("confirmed", "1");
  }

  if (input.flow) {
    params.set("flow", input.flow);
    if (input.flow === "invite") {
      params.set("mode", input.mode ?? "signup");
    }
  }

  if (input.nextPath?.startsWith("/")) {
    params.set("next", appendLanguageToPath(input.nextPath, input.language));
  }

  if (input.language) {
    params.set("lang", normalizeLanguage(input.language));
  }

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

function buildAuthCallbackUrl(nextPath: string, language?: string | null) {
  const callbackUrl = new URL("/auth/callback", getPublicSiteUrl());
  callbackUrl.searchParams.set("next", appendLanguageToPath(nextPath, language));
  if (language) {
    callbackUrl.searchParams.set("lang", normalizeLanguage(language));
  }

  return callbackUrl.toString();
}

function normalizeDisplayNameValue(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isValidDisplayName(value: string) {
  return /^[A-Za-z0-9._ -]{2,30}$/.test(value);
}

function mapPendingTrophyCelebration(row: TrophyNotificationRow): PendingTrophyCelebration | null {
  const payload = row.payload ?? {};
  const trophyId = typeof payload.trophyId === "string" ? payload.trophyId : null;
  const trophyName = typeof payload.trophyName === "string" ? payload.trophyName : null;
  const trophyIcon = typeof payload.trophyIcon === "string" ? payload.trophyIcon : null;

  if (!trophyId || !trophyName || !trophyIcon) {
    return null;
  }

  const tier = payload.trophyTier;
  return {
    notificationId: row.id,
    id: trophyId,
    key: typeof payload.trophyKey === "string" ? payload.trophyKey : trophyId,
    name: trophyName,
    description: typeof payload.trophyDescription === "string" ? payload.trophyDescription : "",
    icon: trophyIcon,
    tier: tier === "bronze" || tier === "silver" || tier === "gold" || tier === "special" ? tier : "special",
    awardedAt:
      typeof payload.awardedAt === "string" && payload.awardedAt.trim()
        ? payload.awardedAt
        : row.created_at
  };
}
