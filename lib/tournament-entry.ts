import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGroupStrategyAdjustments, type GroupStrategyAdjustmentMap } from "@/lib/global-challenge";
import {
  normalizeTournamentEntryMode,
  normalizeTournamentEntryState,
  type TournamentEntryMode,
  type TournamentEntryState
} from "@/lib/play-mode";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type UserSettingsTournamentRow = {
  tournament_entry_mode?: string | null;
  tournament_entry_state?: string | null;
  tournament_entry_submitted_at?: string | null;
  strategy_mode_preset_key?: string | null;
  strategy_mode_levers?: unknown;
  group_strategy_adjustments?: unknown;
  group_strategy_heart_pick_team_id?: string | null;
};

export type TournamentEntrySettings = {
  tournamentEntryMode: TournamentEntryMode | null;
  tournamentEntryState: TournamentEntryState | null;
  tournamentEntrySubmittedAt: string | null;
  groupStrategyAdjustments: GroupStrategyAdjustmentMap;
  groupStrategyHeartPickTeamId: string | null;
};

export async function fetchTournamentEntrySettings(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<TournamentEntrySettings> {
  const { data, error } = await adminSupabase
    .from("user_settings")
    .select(
      "tournament_entry_mode,tournament_entry_state,tournament_entry_submitted_at,strategy_mode_preset_key,strategy_mode_levers,group_strategy_adjustments,group_strategy_heart_pick_team_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error && !isMissingTournamentModeSchemaError(error.message)) {
    throw new Error(error.message);
  }

  const row = (data as UserSettingsTournamentRow | null) ?? null;

  return {
    tournamentEntryMode: normalizeTournamentEntryMode(row?.tournament_entry_mode),
    tournamentEntryState: normalizeTournamentEntryState(row?.tournament_entry_state),
    tournamentEntrySubmittedAt: row?.tournament_entry_submitted_at ?? null,
    groupStrategyAdjustments: normalizeGroupStrategyAdjustments(row?.group_strategy_adjustments),
    groupStrategyHeartPickTeamId: row?.group_strategy_heart_pick_team_id ?? null
  };
}

export async function saveTournamentEntrySettings(
  adminSupabase: AdminSupabaseClient,
  userId: string,
  input: {
    tournamentEntryMode?: TournamentEntryMode | null;
    tournamentEntryState?: TournamentEntryState | null;
    tournamentEntrySubmittedAt?: string | null;
    groupStrategyAdjustments?: GroupStrategyAdjustmentMap | null;
    groupStrategyHeartPickTeamId?: string | null;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    user_id: userId
  };

  if ("tournamentEntryMode" in input) {
    payload.tournament_entry_mode = input.tournamentEntryMode ?? null;
  }

  if ("tournamentEntryState" in input) {
    payload.tournament_entry_state = input.tournamentEntryState ?? null;
  }

  if ("tournamentEntrySubmittedAt" in input) {
    payload.tournament_entry_submitted_at = input.tournamentEntrySubmittedAt ?? null;
  }

  if ("groupStrategyAdjustments" in input) {
    payload.group_strategy_adjustments = input.groupStrategyAdjustments ?? null;
  }

  if ("groupStrategyHeartPickTeamId" in input) {
    payload.group_strategy_heart_pick_team_id = input.groupStrategyHeartPickTeamId ?? null;
  }

  const { error } = await adminSupabase.from("user_settings").upsert(payload, { onConflict: "user_id" });

  if (error && !isMissingTournamentModeSchemaError(error.message)) {
    throw new Error(error.message);
  }
}

function isMissingTournamentModeSchemaError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("user_settings") && normalized.includes("schema cache")) ||
    normalized.includes("relation \"user_settings\" does not exist") ||
    normalized.includes("relation \"public.user_settings\" does not exist") ||
    normalized.includes("column \"tournament_entry_mode\" does not exist") ||
    normalized.includes("column \"tournament_entry_state\" does not exist") ||
    normalized.includes("column \"tournament_entry_submitted_at\" does not exist") ||
    normalized.includes("column \"strategy_mode_preset_key\" does not exist") ||
    normalized.includes("column \"strategy_mode_levers\" does not exist") ||
    normalized.includes("column \"group_strategy_adjustments\" does not exist") ||
    normalized.includes("column \"group_strategy_heart_pick_team_id\" does not exist")
  );
}
