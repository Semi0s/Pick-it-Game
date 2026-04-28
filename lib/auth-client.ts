"use client";

import { DEFAULT_LEGAL_DOCUMENT_TYPE } from "@/lib/legal";
import { appendLanguageToPath, defaultLanguage, normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";
import { teams } from "@/lib/mock-data";
import { getPublicWebPushVapidKey } from "@/lib/push-config";
import {
  isMissingColumnError,
  isMissingAnyRelationError,
  isMissingRelationError,
  isMissingStorageBucketError,
  warnOptionalFeatureOnce
} from "@/lib/schema-safety";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/client";
import { demoSignIn, demoSignOut, demoSignUp, getDemoCurrentUser } from "@/lib/demo-auth-fallback";
import type { UserProfile, UserTrophy } from "@/lib/types";

type AuthMode = "login" | "signup";

export type AuthResult =
  | { ok: true; user?: UserProfile | null; needsEmailConfirmation?: boolean; message?: string }
  | { ok: false; message: string };

export type AvatarUploadResult =
  | { ok: true; avatarUrl: string; message: string }
  | { ok: false; message: string };

export type PushRegistrationResult = AuthResult;

type AuthOptions = {
  nextPath?: string;
  flow?: string;
  language?: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
  preferred_language?: string | null;
  role: UserProfile["role"];
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
  notifications_enabled: boolean;
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
    language: options?.language
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
      : await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: signupRedirectUrl
          }
        });

  if (response.error) {
    return { ok: false, message: getFriendlyAuthError(response.error.message, mode) };
  }

  if (mode === "signup" && response.data.user && !response.data.session) {
    return {
      ok: true,
      needsEmailConfirmation: true,
      message: "Check your email to confirm your account, then sign in."
    };
  }

  if (mode === "login") {
    try {
      const reconcileResponse = await fetch("/api/auth/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const reconcileResult = await reconcileResponse.json();
      console.info("Post-login invite reconciliation completed.", reconcileResult);
    } catch (reconcileError) {
      console.error("Post-login invite reconciliation failed.", reconcileError);
    }
  }

  const profile = response.data.user ? await fetchCurrentProfile() : null;
  return { ok: true, user: profile };
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
    supabase
      .from("user_settings")
      .select("notifications_enabled")
      .eq("user_id", session.user.id)
      .maybeSingle(),
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
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reset-password`
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

    console.error("Could not load current legal document for profile.", error);
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

  return {
    ok: true,
    message: normalizedTeamId ? "Home team updated." : "Home team cleared."
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

  return {
    ok: true,
    message: preferredLanguage === "es" ? "Language updated to Spanish." : "Language updated to English."
  };
}

export function isUsingDemoAuthFallback() {
  return !hasSupabaseConfig();
}

function mapUserRow(
  row: UserRow,
  managerLimits: ManagerLimitsRow | null,
  notificationsEnabled: boolean,
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
    preferredLanguage: normalizeLanguage(row.preferred_language),
    role: row.role,
    accessLevel: row.role === "admin" ? "super_admin" : managerLimits ? "manager" : "player",
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

    const result = (await response.json()) as { ok: true; message?: string } | { ok: false; message?: string };
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

function decodeBase64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function getFriendlyAuthError(message: string, mode: AuthMode) {
  const normalized = message.toLowerCase();

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

async function fetchCurrentUserProfileRow(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ data: UserRow | null; error: { message: string } | null }> {
  const fullProfileQuery = await supabase
    .from("users")
    .select("id,name,email,avatar_url,home_team_id,preferred_language,role,username,username_set_at,needs_profile_setup,total_points")
    .eq("id", userId)
    .maybeSingle();

  if (!fullProfileQuery.error) {
    return {
      data: (fullProfileQuery.data as UserRow | null) ?? null,
      error: null
    };
  }

  if (!isMissingPreferredLanguageColumnError(fullProfileQuery.error.message)) {
    return { data: null, error: { message: fullProfileQuery.error.message } };
  }

  warnOptionalFeatureOnce(
    "current-user-profile-preferred-language-missing",
    "Current-user profile is loading without preferred_language because the live public.users schema is behind the app.",
    fullProfileQuery.error.message
  );

  const fallbackProfileQuery = await supabase
    .from("users")
    .select("id,name,email,avatar_url,home_team_id,role,username,username_set_at,needs_profile_setup,total_points")
    .eq("id", userId)
    .maybeSingle();

  if (fallbackProfileQuery.error) {
    return { data: null, error: { message: fallbackProfileQuery.error.message } };
  }

  const fallbackRow = fallbackProfileQuery.data as Omit<UserRow, "preferred_language"> | null;
  return {
    data: fallbackRow ? { ...fallbackRow, preferred_language: defaultLanguage } : null,
    error: null
  };
}

function isInvalidRefreshTokenError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("invalid refresh token") || normalized.includes("refresh token not found");
}

function isMissingUserSettingsTableError(message?: string) {
  return isMissingRelationError(message, "user_settings");
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

function isMissingPreferredLanguageColumnError(message?: string) {
  return isMissingColumnError(message, "users", "preferred_language");
}

function buildLoginReturnPath(input: { confirmed?: boolean; nextPath?: string; flow?: string; language?: string }) {
  const params = new URLSearchParams();

  if (input.confirmed) {
    params.set("confirmed", "1");
  }

  if (input.flow) {
    params.set("flow", input.flow);
    if (input.flow === "invite") {
      params.set("mode", "signup");
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
  const callbackUrl = new URL("/auth/callback", getSiteUrl());
  callbackUrl.searchParams.set("next", appendLanguageToPath(nextPath, language));
  if (language) {
    callbackUrl.searchParams.set("lang", normalizeLanguage(language));
  }

  return callbackUrl.toString();
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
