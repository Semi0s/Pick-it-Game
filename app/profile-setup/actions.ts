"use server";

import { revalidatePath } from "next/cache";
import { normalizeLanguage } from "@/lib/i18n";
import { isSpecialVisualThemeId } from "@/lib/localized-card-themes";
import { teams } from "@/lib/mock-data";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-safety";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9._ -]{2,30}$/;

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
  visualThemeId?: string | null;
  followedTeamIds?: string[];
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
  const normalizedVisualThemeId = input.visualThemeId?.trim().toLowerCase() || null;
  const normalizedFollowedTeamIds = normalizeFollowedTeamIds(input.followedTeamIds);
  const shouldPersistFollowedTeams = Array.isArray(input.followedTeamIds);

  if (!DISPLAY_NAME_PATTERN.test(normalizedDisplayName)) {
    return {
      ok: false,
      message: "Display name must be 2-30 characters and can use letters, numbers, spaces, periods, hyphens, and underscores."
    };
  }

  if (normalizedHomeTeamId && !teams.some((team) => team.id === normalizedHomeTeamId)) {
    return { ok: false, message: "Choose a valid home team." };
  }

  if (normalizedVisualThemeId && !isSpecialVisualThemeId(normalizedVisualThemeId)) {
    return { ok: false, message: "Choose a valid visual theme." };
  }

  let followedTeamsWarning: string | null = null;
  if (normalizedVisualThemeId || shouldPersistFollowedTeams) {
    const settingsPayload: {
      user_id: string;
      visual_theme_id?: string;
      followed_team_ids?: string[];
    } = {
      user_id: user.id
    };

    if (normalizedVisualThemeId) {
      settingsPayload.visual_theme_id = normalizedVisualThemeId;
    }

    if (shouldPersistFollowedTeams) {
      settingsPayload.followed_team_ids = normalizedFollowedTeamIds;
    }

    const { error: settingsError } = await supabase.from("user_settings").upsert(settingsPayload, { onConflict: "user_id" });

    if (settingsError) {
      if (shouldPersistFollowedTeams && isMissingFollowedTeamIdsColumnError(settingsError.message)) {
        followedTeamsWarning = " Followed teams can be added later from Profile.";

        if (normalizedVisualThemeId) {
          const { error: visualThemeRetryError } = await supabase.from("user_settings").upsert(
            {
              user_id: user.id,
              visual_theme_id: normalizedVisualThemeId
            },
            { onConflict: "user_id" }
          );

          if (visualThemeRetryError) {
            if (isMissingUserSettingsTableError(visualThemeRetryError.message) || isMissingVisualThemeIdColumnError(visualThemeRetryError.message)) {
              return {
                ok: false,
                message: "Visual theme selection is not available yet. Apply the visual theme migration first."
              };
            }

            return { ok: false, message: visualThemeRetryError.message };
          }
        }
      } else if (isMissingUserSettingsTableError(settingsError.message) || isMissingVisualThemeIdColumnError(settingsError.message)) {
        if (normalizedVisualThemeId) {
          return {
            ok: false,
            message: "Visual theme selection is not available yet. Apply the visual theme migration first."
          };
        }

        followedTeamsWarning = " Followed teams can be added later from Profile.";
      } else {
        return { ok: false, message: settingsError.message };
      }
    }
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
    message: `Profile setup complete.${followedTeamsWarning ?? ""}`
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

function isMissingUserSettingsTableError(message?: string) {
  return isMissingRelationError(message, "user_settings");
}

function isMissingVisualThemeIdColumnError(message?: string) {
  return isMissingColumnError(message, "user_settings", "visual_theme_id");
}

function isMissingFollowedTeamIdsColumnError(message?: string) {
  return isMissingColumnError(message, "user_settings", "followed_team_ids");
}
