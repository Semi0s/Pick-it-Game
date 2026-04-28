"use server";

import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { saveBracketPrediction } from "@/lib/bracket-predictions";
import type { BracketPrediction } from "@/lib/types";

type SaveBracketPredictionInput = {
  matchId: string;
  teamId: string;
};

export type SaveBracketPredictionResult =
  | { ok: true; prediction: BracketPrediction }
  | { ok: false; message: string };

export async function saveBracketPredictionAction(
  input: SaveBracketPredictionInput
): Promise<SaveBracketPredictionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in to save knockout picks." };
  }

  try {
    const prediction = await saveBracketPrediction(user.id, input.matchId, input.teamId);
    return { ok: true, prediction };
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not save the knockout pick.";
    return { ok: false, message };
  }
}
