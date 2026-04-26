"use client";

import { DEFAULT_LEGAL_DOCUMENT_TYPE } from "@/lib/legal";
import { teams } from "@/lib/mock-data";
import { getPublicWebPushVapidKey } from "@/lib/push-config";
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
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
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

type LegalDocumentRow = {
  required_version: string;
};

type UserLegalAcceptanceRow = {
  document_version: string;
  accepted_at: string;
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
    flow: options?.flow
  });
  const signupRedirectUrl = `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(loginReturnPath)}`;
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

  const [{ data: profile }, { data: managerLimits }, userSettingsResult, pushTokensResult, legalDocumentResult, legalAcceptanceResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,name,email,avatar_url,home_team_id,role,username,username_set_at,needs_profile_setup,total_points")
      .eq("id", session.user.id)
      .single(),
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
      .select("required_version")
      .eq("document_type", DEFAULT_LEGAL_DOCUMENT_TYPE)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("user_legal_acceptances")
      .select("document_version,accepted_at")
      .eq("user_id", session.user.id)
      .eq("document_type", DEFAULT_LEGAL_DOCUMENT_TYPE)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const notificationsEnabled = isMissingUserSettingsTableError(userSettingsResult.error?.message)
    ? false
    : ((userSettingsResult.data as UserSettingsRow | null)?.notifications_enabled ?? false);
  const pushNotificationsEnabled = isMissingPushTokensTableError(pushTokensResult.error?.message)
    ? false
    : Boolean((pushTokensResult.data as PushTokenRow | null)?.id);
  const requiredEulaVersion = isMissingLegalTablesError(legalDocumentResult.error?.message)
    ? null
    : ((legalDocumentResult.data as LegalDocumentRow | null)?.required_version ?? null);
  const latestLegalAcceptance = isMissingLegalTablesError(legalAcceptanceResult.error?.message)
    ? null
    : ((legalAcceptanceResult.data as UserLegalAcceptanceRow | null) ?? null);
  const needsLegalAcceptance = Boolean(
    requiredEulaVersion &&
      (!latestLegalAcceptance || latestLegalAcceptance.document_version !== requiredEulaVersion)
  );

  if (profile) {
    return mapUserRow(
      profile as UserRow,
      (managerLimits as ManagerLimitsRow | null) ?? null,
      notificationsEnabled,
      pushNotificationsEnabled,
      {
        needsLegalAcceptance,
        requiredEulaVersion,
        acceptedEulaVersion: latestLegalAcceptance?.document_version ?? null,
        acceptedEulaAt: latestLegalAcceptance?.accepted_at ?? null
      }
    );
  }

  return {
    id: session.user.id,
    name: session.user.email?.split("@")[0] ?? "Player",
    email: session.user.email ?? "",
    homeTeamId: null,
    role: "player",
    accessLevel: managerLimits ? "manager" : "player",
    username: null,
    usernameSetAt: null,
    needsProfileSetup: false,
    notificationsEnabled,
    pushNotificationsEnabled,
    needsLegalAcceptance,
    requiredEulaVersion,
    acceptedEulaVersion: latestLegalAcceptance?.document_version ?? null,
    acceptedEulaAt: latestLegalAcceptance?.accepted_at ?? null,
    managerLimits: managerLimits
      ? {
          maxGroups: managerLimits.max_groups,
          maxMembersPerGroup: managerLimits.max_members_per_group
        }
      : null,
    totalPoints: 0
  };
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

  const objectPath = `${user.id}.jpg`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(objectPath, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
    cacheControl: "3600"
  });

  if (uploadError) {
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
  }
): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    homeTeamId: row.home_team_id ?? null,
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
    managerLimits: managerLimits
      ? {
          maxGroups: managerLimits.max_groups,
          maxMembersPerGroup: managerLimits.max_members_per_group
        }
      : null,
    totalPoints: row.total_points
  };
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

function isInvalidRefreshTokenError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("invalid refresh token") || normalized.includes("refresh token not found");
}

function isMissingUserSettingsTableError(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.user_settings'") ||
    normalized.includes("relation \"public.user_settings\" does not exist") ||
    normalized.includes("relation \"user_settings\" does not exist") ||
    (normalized.includes("user_settings") && normalized.includes("schema cache"))
  );
}

function isMissingPushTokensTableError(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.push_tokens'") ||
    normalized.includes("relation \"public.push_tokens\" does not exist") ||
    normalized.includes("relation \"push_tokens\" does not exist") ||
    (normalized.includes("push_tokens") && normalized.includes("schema cache"))
  );
}

function isMissingTrophiesTableError(message?: string) {
  if (!message) {
    return false;
  }

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

function isMissingLegalTablesError(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    (normalized.includes("legal_documents") || normalized.includes("user_legal_acceptances")) &&
    (
      normalized.includes("schema cache") ||
      normalized.includes("does not exist") ||
      normalized.includes("could not find the table")
    )
  );
}

function buildLoginReturnPath(input: { confirmed?: boolean; nextPath?: string; flow?: string }) {
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
    params.set("next", input.nextPath);
  }

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
