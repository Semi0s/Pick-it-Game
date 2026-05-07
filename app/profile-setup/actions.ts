"use server";

import { revalidatePath } from "next/cache";
import { normalizeLanguage } from "@/lib/i18n";
import { teams } from "@/lib/mock-data";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9._ -]{3,24}$/;

export type CompleteProfileSetupResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function completeProfileSetupAction(input: {
  displayName: string;
  preferredLanguage?: string;
  homeTeamId?: string | null;
}): Promise<CompleteProfileSetupResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in to finish profile setup." };
  }

  const normalizedDisplayName = normalizeProfileText(input.displayName);
  const preferredLanguage = normalizeLanguage(input.preferredLanguage);
  const normalizedHomeTeamId = input.homeTeamId?.trim() || null;

  if (!DISPLAY_NAME_PATTERN.test(normalizedDisplayName)) {
    return {
      ok: false,
      message: "Display name must be 3-24 characters and can use letters, numbers, spaces, periods, hyphens, and underscores."
    };
  }

  if (normalizedHomeTeamId && !teams.some((team) => team.id === normalizedHomeTeamId)) {
    return { ok: false, message: "Choose a valid home team." };
  }
  const generatedUsername = buildProfileSetupUsername({
    displayName: normalizedDisplayName,
    email: user.email ?? "",
    userId: user.id
  });

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("users")
    .update({
      name: normalizedDisplayName,
      username: generatedUsername,
      username_set_at: now,
      preferred_language: preferredLanguage,
      home_team_id: normalizedHomeTeamId,
      needs_profile_setup: false,
      updated_at: now
    })
    .eq("id", user.id);

  if (updateError) {
    if (updateError.code === "23505") {
      return { ok: false, message: "We could not finish profile setup. Please try again." };
    }

    return { ok: false, message: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/groups");
  revalidatePath("/my-groups");
  revalidatePath("/profile");
  revalidatePath("/profile-setup");
  revalidatePath("/leaderboard");

  return {
    ok: true,
    message: "Profile setup complete."
  };
}

function normalizeProfileText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildProfileSetupUsername(input: { displayName: string; email: string; userId: string }) {
  const emailLocalPart = input.email.split("@")[0] ?? "";
  const normalizedBase =
    normalizeUsernameSegment(input.displayName) || normalizeUsernameSegment(emailLocalPart) || "player";
  const suffix = input.userId.replace(/-/g, "").slice(0, 6).toLowerCase();
  const maxBaseLength = Math.max(3, 24 - suffix.length - 1);
  const base = normalizedBase.slice(0, maxBaseLength).replace(/[-._ ]+$/g, "") || "player";

  return `${base}-${suffix}`;
}

function normalizeUsernameSegment(value: string) {
  return value
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, "-")
    .trim()
    .toLowerCase();
}
