"use client";

import { demoInvites, demoUsers } from "@/lib/mock-data";
import type { UserProfile } from "@/lib/types";

const SESSION_KEY = "pick-it-demo-session";

export type DemoAuthResult =
  | { ok: true; user: UserProfile }
  | { ok: false; message: string };

export function getDemoCurrentUser(): UserProfile | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawSession = window.localStorage.getItem(SESSION_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as UserProfile;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function demoSignIn(email: string, password: string): DemoAuthResult {
  const normalizedEmail = email.trim().toLowerCase();
  const invite = demoInvites.find((item) => item.email === normalizedEmail);

  if (!invite) {
    return { ok: false, message: "This email is not on the invite list yet." };
  }

  if (password.length < 6) {
    return { ok: false, message: "Use at least 6 characters for the demo password." };
  }

  const user = demoUsers.find((profile) => profile.email === normalizedEmail);
  if (!user) {
    return { ok: false, message: "Invite found, but no demo profile exists." };
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return { ok: true, user };
}

export function demoSignUp(email: string, password: string): DemoAuthResult {
  return demoSignIn(email, password);
}

export function demoSignOut() {
  window.localStorage.removeItem(SESSION_KEY);
}
