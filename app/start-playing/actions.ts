"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { setUserPredictionStartMode } from "@/lib/easy-bracket-gate";
import { markLaunchOnboardingSeen } from "@/lib/launch-onboarding-gate";
import type { PredictionStartMode } from "@/lib/play-mode";

type StartModeResult =
  | { ok: true }
  | { ok: false; message: string };

export async function savePlayerStartModeAction(mode: PredictionStartMode): Promise<StartModeResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "You must be signed in to continue." };
  }

  try {
    const adminSupabase = createAdminClient();
    await setUserPredictionStartMode(adminSupabase, user.id, mode);
    await markLaunchOnboardingSeen(adminSupabase, user.id);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save your start mode right now."
    };
  }
}

export async function completeLaunchOnboardingAction(): Promise<StartModeResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "You must be signed in to continue." };
  }

  try {
    await markLaunchOnboardingSeen(createAdminClient(), user.id);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not finish onboarding right now."
    };
  }
}
