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

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: UserProfile["role"];
  total_points: number;
};

export async function authenticateWithEmail(mode: AuthMode, email: string, password: string): Promise<AuthResult> {
  if (!hasSupabaseConfig()) {
    const result = mode === "login" ? demoSignIn(email, password) : demoSignUp(email, password);
    return result.ok ? { ok: true, user: result.user } : result;
  }

  const supabase = createClient();
  const normalizedEmail = email.trim().toLowerCase();
  const response =
    mode === "login"
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${getSiteUrl()}/login?confirmed=1`
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
    return "That email is not on the invite list yet. Ask the pool admin for an invite.";
  }

  if (normalized.includes("invalid login") || normalized.includes("invalid credentials")) {
    return "Email or password did not match. Try again.";
  }

  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "That email already has an account. Switch to sign in.";
  }

  return message || "Something went wrong. Please try again.";
}
