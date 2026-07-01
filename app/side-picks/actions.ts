"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/app/groups/actions";
import { savePredictionLabSettings } from "@/lib/prediction-lab-data";
import { normalizePredictionLabSettings, type PredictionLabSettings } from "@/lib/prediction-lab";

export async function savePredictionLabSettingsAction(input: {
  tournamentId?: string | null;
  groupId: string | null;
  settings: Partial<PredictionLabSettings>;
}): Promise<
  | {
      ok: true;
      messageKey: string;
      settings: PredictionLabSettings;
      averageSummary: Awaited<ReturnType<typeof savePredictionLabSettings>>["averageSummary"];
    }
  | {
      ok: false;
      messageKey?: string;
      message: string;
    }
> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return {
      ok: false,
      message: userResult.message
    };
  }

  try {
    const result = await savePredictionLabSettings({
      userId: userResult.userId,
      groupId: input.groupId,
      settings: normalizePredictionLabSettings(input.settings)
    });

    revalidatePath("/side-picks");
    revalidatePath("/last-chance-picks");

    return {
      ok: true,
      messageKey: "predictionLab.saveSuccess",
      settings: result.settings,
      averageSummary: result.averageSummary
    };
  } catch (error) {
    return {
      ok: false,
      messageKey: "predictionLab.saveError",
      message: error instanceof Error ? error.message : "Could not save Prediction Lab settings."
    };
  }
}
