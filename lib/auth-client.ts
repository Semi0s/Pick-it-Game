"use client";

import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/client";
import { demoSignIn, demoSignOut, demoSignUp, getDemoCurrentUser } from "@/lib/demo-auth-fallback";
import type { UserProfile } from "@/lib/types";

type AuthMode = "login" | "signup";

export type AuthResult =
  | { ok: true; user?: UserProfile | null; needsEmailConfirmation?: boolean; message?: string }
  | { ok: false; message: string };

type AuthOptions = {
  nextPath?: string;
  flow?: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: UserProfile["role"];
  total_points: number;
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
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id,name,email,avatar_url,role,total_points")
    .eq("id", authData.user.id)
    .single();

  if (profile) {
    return mapUserRow(profile as UserRow);
  }

  return {
    id: authData.user.id,
    name: authData.user.email?.split("@")[0] ?? "Player",
    email: authData.user.email ?? "",
    role: "player",
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

export function isUsingDemoAuthFallback() {
  return !hasSupabaseConfig();
}

function mapUserRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    role: row.role,
    totalPoints: row.total_points
  };
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

function buildLoginReturnPath(input: { confirmed?: boolean; nextPath?: string; flow?: string }) {
  const params = new URLSearchParams();

  if (input.confirmed) {
    params.set("confirmed", "1");
  }

  if (input.flow) {
    params.set("flow", input.flow);
  }

  if (input.nextPath?.startsWith("/")) {
    params.set("next", input.nextPath);
  }

  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
