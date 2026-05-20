import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePredictionStartMode, type PredictionStartMode } from "@/lib/play-mode";

type UserSettingsGateRow = {
  prediction_start_mode?: string | null;
  my_picks_acknowledged_at?: string | null;
};

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

export type MyPicksGateState = {
  predictionStartMode: PredictionStartMode | null;
  myPicksAcknowledgedAt: string | null;
  shouldGateMyPicks: boolean;
};

export type ResolveMyPicksGateInput = {
  predictionStartMode: PredictionStartMode | null;
  myPicksAcknowledgedAt: string | null;
  hasEasyBracketSnapshot: boolean;
  hasAnyGroupScorePredictions: boolean;
};

export async function fetchMyPicksGateState(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<MyPicksGateState> {
  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("prediction_start_mode,my_picks_acknowledged_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && !isMissingEasyBracketGateSchemaError(error.message)) {
    throw new Error(error.message);
  }

  const row = (data as UserSettingsGateRow | null) ?? null;
  const predictionStartMode = normalizePredictionStartMode(row?.prediction_start_mode);
  const myPicksAcknowledgedAt = row?.my_picks_acknowledged_at ?? null;

  return {
    predictionStartMode,
    myPicksAcknowledgedAt,
    shouldGateMyPicks: false
  };
}

export async function setUserPredictionStartMode(
  adminSupabase: AdminSupabaseClient,
  userId: string,
  mode: PredictionStartMode
): Promise<void> {
  const payload =
    mode === "full_scoring"
      ? {
          user_id: userId,
          prediction_start_mode: mode,
          my_picks_acknowledged_at: new Date().toISOString()
        }
      : {
          user_id: userId,
          prediction_start_mode: mode,
          my_picks_acknowledged_at: null
        };

  const { error } = await adminSupabase.from("user_settings").upsert(payload, { onConflict: "user_id" });

  if (error && !isMissingEasyBracketGateSchemaError(error.message)) {
    throw new Error(error.message);
  }
}

export async function acknowledgeMyPicksForEasyBracketPlayer(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await adminSupabase
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        my_picks_acknowledged_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );

  if (error && !isMissingEasyBracketGateSchemaError(error.message)) {
    throw new Error(error.message);
  }
}

export function resolveMyPicksGateState(input: ResolveMyPicksGateInput) {
  const effectiveStartMode = resolveEffectivePredictionStartMode(input);

  return {
    effectiveStartMode,
    shouldGateMyPicks: effectiveStartMode === "easy_bracket" && !input.myPicksAcknowledgedAt
  };
}

function resolveEffectivePredictionStartMode(input: ResolveMyPicksGateInput): PredictionStartMode | null {
  if (input.predictionStartMode) {
    return input.predictionStartMode;
  }

  if (input.myPicksAcknowledgedAt) {
    return "full_scoring";
  }

  if (input.hasEasyBracketSnapshot) {
    return "easy_bracket";
  }

  if (!input.hasAnyGroupScorePredictions) {
    return "easy_bracket";
  }

  return "full_scoring";
}

function isMissingEasyBracketGateSchemaError(message: string) {
  const normalized = message.toLowerCase();
  return (
    (normalized.includes("user_settings") && normalized.includes("schema cache")) ||
    normalized.includes("relation \"user_settings\" does not exist") ||
    normalized.includes("relation \"public.user_settings\" does not exist") ||
    normalized.includes("column \"prediction_start_mode\" does not exist") ||
    normalized.includes("column \"my_picks_acknowledged_at\" does not exist")
  );
}
