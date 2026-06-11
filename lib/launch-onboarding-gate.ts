import "server-only";

import { redirect } from "next/navigation";
import { REQUIRED_LAUNCH_ONBOARDING_VERSION, shouldRequireLaunchOnboarding } from "@/lib/launch-onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTournamentTransitionSettings } from "@/lib/tournament-transition";
import { shouldSkipLegacyLaunchOnboarding } from "@/lib/tournament-transition-helpers";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type UserSettingsOnboardingRow = {
  onboarding_version_seen?: number | null;
};

export async function redirectIfLaunchOnboardingRequired({
  userId
}: {
  userId: string;
}): Promise<void> {
  const tournamentTransitionSettings = await fetchTournamentTransitionSettings().catch(() => null);
  if (tournamentTransitionSettings && shouldSkipLegacyLaunchOnboarding(tournamentTransitionSettings.modality)) {
    return;
  }

  const state = await fetchLaunchOnboardingGateState(createAdminClient(), userId);
  if (!state.supported) {
    return;
  }

  if (shouldRequireLaunchOnboarding(state.seenVersion)) {
    redirect("/start-playing");
  }
}

export async function markLaunchOnboardingSeen(adminSupabase: AdminSupabaseClient, userId: string): Promise<void> {
  const { error } = await adminSupabase.from("user_settings").upsert(
    {
      user_id: userId,
      onboarding_version_seen: REQUIRED_LAUNCH_ONBOARDING_VERSION
    },
    { onConflict: "user_id" }
  );

  if (error && !isMissingLaunchOnboardingSchemaError(error.message)) {
    throw new Error(error.message);
  }
}

async function fetchLaunchOnboardingGateState(adminSupabase: AdminSupabaseClient, userId: string) {
  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("onboarding_version_seen")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingLaunchOnboardingSchemaError(error.message)) {
      return {
        supported: false as const,
        seenVersion: null
      };
    }

    throw new Error(error.message);
  }

  const row = (data as UserSettingsOnboardingRow | null) ?? null;

  return {
    supported: true as const,
    seenVersion: typeof row?.onboarding_version_seen === "number" ? row.onboarding_version_seen : null
  };
}

function isMissingLaunchOnboardingSchemaError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("user_settings") && normalized.includes("schema cache")) ||
    normalized.includes("relation \"user_settings\" does not exist") ||
    normalized.includes("relation \"public.user_settings\" does not exist") ||
    normalized.includes("column \"onboarding_version_seen\" does not exist") ||
    normalized.includes("column user_settings.onboarding_version_seen does not exist") ||
    normalized.includes("column public.user_settings.onboarding_version_seen does not exist")
  );
}
