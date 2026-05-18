"use server";

import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchKnockoutBracketEditorView,
  fetchProjectedKnockoutBracketPreview,
  fetchUserBracketPredictions,
  fetchUserProjectedBracketPredictions,
  isDownstreamConfirmationRequiredError,
  previewBracketPredictionImpact,
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
  confirmClearDownstream?: boolean;
};

export type SaveBracketPredictionResult =
  | {
      ok: true;
      prediction: BracketPrediction;
      predictions: BracketPrediction[];
      view?: KnockoutBracketEditorView | null;
      clearedDescendantCount: number;
    }
  | {
      ok: false;
      message: string;
      requiresConfirmation: true;
      affectedCount: number;
    }
  | { ok: false; message: string };

export async function previewBracketPredictionImpactAction(
  input: SaveBracketPredictionInput
): Promise<{ ok: true; affectedCount: number } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in to review knockout picks." };
  }

  try {
    const impact = await previewBracketPredictionImpact(user.id, {
      matchId: input.matchId,
      teamId: input.teamId ?? null,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      mode: input.mode === "projected" ? "projected" : "official"
    });
    return { ok: true, affectedCount: impact.affectedCount };
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Could not review the knockout change.";
    return { ok: false, message };
  }
}

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
    const saveResult = isProjected
      ? await saveProjectedBracketPrediction(user.id, {
          matchId: input.matchId,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          teamId: input.teamId ?? null,
          confirmClearDownstream: input.confirmClearDownstream
        })
      : await saveBracketPrediction(user.id, {
          matchId: input.matchId,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          teamId: input.teamId ?? null,
          confirmClearDownstream: input.confirmClearDownstream
        });
    const predictions = isProjected
      ? await fetchUserProjectedBracketPredictions(user.id)
      : await fetchUserBracketPredictions(user.id);
    const view = isProjected
      ? await fetchProjectedKnockoutBracketPreview(user.id)
      : await fetchKnockoutBracketEditorView(user.id);
    return {
      ok: true,
      prediction: saveResult.prediction,
      predictions,
      view,
      clearedDescendantCount: saveResult.clearedDescendantCount
    };
  } catch (caughtError) {
    if (isDownstreamConfirmationRequiredError(caughtError)) {
      return {
        ok: false,
        message:
          caughtError.affectedCount > 0
            ? `This will clear ${caughtError.affectedCount} future ${caughtError.affectedCount === 1 ? "pick" : "picks"}.`
            : "This change may clear future-round picks that depend on your previous winner.",
        requiresConfirmation: true,
        affectedCount: caughtError.affectedCount
      };
    }
    const message = caughtError instanceof Error ? caughtError.message : "Could not save the knockout pick.";
    return { ok: false, message };
  }
}
