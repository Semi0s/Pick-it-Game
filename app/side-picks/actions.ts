"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/app/groups/actions";
import { saveUserSidePicks } from "@/lib/side-picks-data";
import { SIDE_PICK_PUBLIC_NAME, normalizeSidePicksSubmission, type SidePicksSubmission } from "@/lib/side-picks";

export async function saveSidePicksAction(
  input: Partial<SidePicksSubmission>
): Promise<{ ok: true; message: string; receipt: SidePicksSubmission } | { ok: false; message: string }> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const result = await saveUserSidePicks({
    userId: userResult.userId,
    picks: normalizeSidePicksSubmission(input)
  });

  if (!result.ok) {
    return result;
  }

  revalidatePath("/side-picks");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `${SIDE_PICK_PUBLIC_NAME} saved. They score on their own leaderboard and do not change your main bracket score.`,
    receipt: result.receipt
  };
}
