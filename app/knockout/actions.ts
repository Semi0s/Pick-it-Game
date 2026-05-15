"use server";

import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchProjectedKnockoutBracketPreview,
  fetchUserBracketPredictions,
  fetchUserProjectedBracketPredictions,
  saveBracketPrediction,
  saveProjectedBracketPrediction
} from "@/lib/bracket-predictions";
import type { KnockoutBracketEditorView } from "@/lib/bracket-predictions";
import type { BracketPrediction } from "@/lib/types";

type SaveBracketPredictionInput = {
  matchId: string;
  teamId?: string | null;
  homeScore: number;
  awayScore: number;
  mode?: "official" | "projected";
};

export type SaveBracketPredictionResult =
  | { ok: true; prediction: BracketPrediction; predictions: BracketPrediction[]; view?: KnockoutBracketEditorView | null }
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
    const isProjected = input.mode === "projected";
    const prediction = isProjected
      ? await saveProjectedBracketPrediction(user.id, {
          matchId: input.matchId,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          teamId: input.teamId ?? null
        })
      : await saveBracketPrediction(user.id, {
          matchId: input.matchId,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          teamId: input.teamId ?? null
        });
    const predictions = isProjected
      ? await fetchUserProjectedBracketPredictions(user.id)
      : await fetchUserBracketPredictions(user.id);
    const view = isProjected ? await fetchProjectedKnockoutBracketPreview(user.id) : null;
    return { ok: true, prediction, predictions, view };
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not save the knockout pick.";
    return { ok: false, message };
  }
}
