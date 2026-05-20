"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canActivateTournamentEntry,
  normalizeStrategyLevers,
  normalizeStrategyPresetKey,
  STRATEGY_PRESETS,
  type StrategyLeverState
} from "@/lib/play-mode";
import { fetchTournamentEntrySettings, saveTournamentEntrySettings } from "@/lib/tournament-entry";
import { getCurrentUserId } from "@/app/groups/actions";

export async function saveStrategyModeEntryAction(input: {
  presetKey: string;
  levers: StrategyLeverState;
  activate: boolean;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();
  const presetKey = normalizeStrategyPresetKey(input.presetKey);
  const levers = normalizeStrategyLevers(input.levers);

  try {
    const existingSettings = await fetchTournamentEntrySettings(adminSupabase, userResult.userId);

    if (input.activate && !canActivateTournamentEntry()) {
      return { ok: false, message: "Tournament entries are locked. You can still preview this mode, but it will not count." };
    }

    await saveTournamentEntrySettings(adminSupabase, userResult.userId, {
      strategyModePresetKey: presetKey,
      strategyModeLevers: levers,
      tournamentEntryMode: input.activate
        ? "strategy_mode"
        : existingSettings.tournamentEntryMode === "strategy_mode" || !existingSettings.tournamentEntryMode
          ? "strategy_mode"
          : existingSettings.tournamentEntryMode,
      tournamentEntryState: input.activate
        ? "active"
        : existingSettings.tournamentEntryMode === "strategy_mode" || !existingSettings.tournamentEntryMode
          ? "draft"
          : existingSettings.tournamentEntryState,
      tournamentEntrySubmittedAt: input.activate ? new Date().toISOString() : existingSettings.tournamentEntrySubmittedAt
    });

    revalidatePath("/strategy");
    revalidatePath("/dashboard");

    const preset = STRATEGY_PRESETS.find((entry) => entry.key === presetKey) ?? STRATEGY_PRESETS[0];

    return {
      ok: true,
      message: input.activate
        ? `Strategy Mode is active with ${preset.title}.`
        : `Strategy Mode draft saved with ${preset.title}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save Strategy Mode right now."
    };
  }
}
