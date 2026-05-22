"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canActivateTournamentEntry,
  type TournamentEntryState
} from "@/lib/play-mode";
import { clampGroupStrategyAdjustments, normalizeGroupStrategyAdjustments, type GroupStrategyAdjustmentMap } from "@/lib/global-challenge";
import { fetchTournamentEntrySettings, saveTournamentEntrySettings } from "@/lib/tournament-entry";
import { getCurrentUserId } from "@/app/groups/actions";

export async function saveStrategyModeEntryAction(input: {
  adjustments: GroupStrategyAdjustmentMap;
  heartPickTeamId?: string | null;
  activate: boolean;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();
  const adjustments = clampGroupStrategyAdjustments(normalizeGroupStrategyAdjustments(input.adjustments));
  const heartPickTeamId = typeof input.heartPickTeamId === "string" && input.heartPickTeamId.trim().length > 0
    ? input.heartPickTeamId.trim()
    : null;

  try {
    const existingSettings = await fetchTournamentEntrySettings(adminSupabase, userResult.userId);

    if (input.activate && !canActivateTournamentEntry()) {
      return { ok: false, message: "Tournament entries are locked. You can still preview this mode, but it will not count." };
    }

    await saveTournamentEntrySettings(adminSupabase, userResult.userId, {
      groupStrategyAdjustments: adjustments,
      groupStrategyHeartPickTeamId: heartPickTeamId,
      tournamentEntryMode: input.activate
        ? "strategy_mode"
        : existingSettings.tournamentEntryMode === "strategy_mode" || !existingSettings.tournamentEntryMode
          ? "strategy_mode"
          : existingSettings.tournamentEntryMode,
      tournamentEntryState: (input.activate
        ? "active"
        : existingSettings.tournamentEntryMode === "strategy_mode" || !existingSettings.tournamentEntryMode
          ? "draft"
          : existingSettings.tournamentEntryState) as TournamentEntryState | null,
      tournamentEntrySubmittedAt: input.activate ? new Date().toISOString() : existingSettings.tournamentEntrySubmittedAt
    });

    revalidatePath("/strategy");
    revalidatePath("/dashboard");
    revalidatePath("/leaderboard");

    return {
      ok: true,
      message: input.activate
        ? "Group Strategy submitted. This will count on the Global Leaderboard."
        : "Group Strategy draft saved."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save Group Strategy right now."
    };
  }
}
