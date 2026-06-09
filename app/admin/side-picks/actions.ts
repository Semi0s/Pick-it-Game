"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import {
  SIDE_PICKS_TRIPTYCH_PREVIEW_ENABLED_KEY,
  fetchBooleanAppSetting,
  updateBooleanAppSetting
} from "@/lib/app-settings";
import {
  createTournamentPlayer,
  fetchSidePicksAdminData,
  recomputeSidePickScores,
  updateSidePickOfficialPlayerResult,
  updateSidePicksConfig,
  updateTournamentPlayerActive,
  type SidePickAuditSummary
} from "@/lib/side-picks-data";
import { SIDE_PICK_PUBLIC_NAME, type SidePickPlayerDefinitionKey } from "@/lib/side-picks";

export async function fetchAdminSidePicksAction() {
  const admin = await requireSuperAdmin();
  if (!admin.ok) {
    return admin;
  }

  try {
    const [data, triptychPreviewEnabled] = await Promise.all([
      fetchSidePicksAdminData(),
      fetchBooleanAppSetting(SIDE_PICKS_TRIPTYCH_PREVIEW_ENABLED_KEY, false)
    ]);

    return {
      ok: true as const,
      data: {
        ...data,
        triptychPreviewEnabled
      }
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : `Could not load ${SIDE_PICK_PUBLIC_NAME} admin settings.`
    };
  }
}

export async function updateAdminSidePicksConfigAction(input: {
  active: boolean;
  lockAt: string | null;
  darkHorseEligibleTeamIds: string[];
  favoriteFlopEligibleTeamIds: string[];
}) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) {
    return admin;
  }

  try {
    const data = await updateSidePicksConfig({
      active: input.active,
      lockAt: normalizeLockAt(input.lockAt),
      darkHorseEligibleTeamIds: normalizeTeamIds(input.darkHorseEligibleTeamIds),
      favoriteFlopEligibleTeamIds: normalizeTeamIds(input.favoriteFlopEligibleTeamIds)
    });

    revalidatePath("/admin/side-picks");
    revalidatePath("/side-picks");
    revalidatePath("/last-chance-picks");
    revalidatePath("/dashboard");

    return {
      ok: true as const,
      message: `${SIDE_PICK_PUBLIC_NAME} settings saved.`,
      data
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : `Could not save ${SIDE_PICK_PUBLIC_NAME} settings.`
    };
  }
}

export async function updateAdminSidePicksTriptychPreviewAction(enabled: boolean) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) {
    return admin;
  }

  try {
    await updateBooleanAppSetting(SIDE_PICKS_TRIPTYCH_PREVIEW_ENABLED_KEY, enabled);
    revalidatePath("/admin/side-picks");
    revalidatePath("/dashboard");

    return {
      ok: true as const,
      message: `${SIDE_PICK_PUBLIC_NAME} dashboard triptych preview ${enabled ? "enabled" : "disabled"}.`
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : `Could not update ${SIDE_PICK_PUBLIC_NAME} dashboard preview.`
    };
  }
}

export async function createAdminTournamentPlayerAction(input: {
  fullName: string;
  teamId: string | null;
}) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) {
    return admin;
  }

  try {
    const data = await createTournamentPlayer({
      fullName: input.fullName,
      teamId: input.teamId
    });

    revalidatePath("/admin/side-picks");
    revalidatePath("/side-picks");
    revalidatePath("/last-chance-picks");

    return {
      ok: true as const,
      message: "Tournament player saved.",
      data
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Could not save tournament player."
    };
  }
}

export async function updateAdminTournamentPlayerActiveAction(input: {
  playerId: string;
  active: boolean;
}) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) {
    return admin;
  }

  try {
    const data = await updateTournamentPlayerActive(input);
    revalidatePath("/admin/side-picks");
    revalidatePath("/side-picks");
    revalidatePath("/last-chance-picks");

    return {
      ok: true as const,
      message: `Tournament player ${input.active ? "activated" : "hidden"}.`,
      data
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Could not update tournament player."
    };
  }
}

export async function updateAdminSidePickOfficialPlayerResultAction(input: {
  key: SidePickPlayerDefinitionKey;
  playerId: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
}) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) {
    return admin;
  }

  try {
    const data = await updateSidePickOfficialPlayerResult({
      ...input,
      confirmedByUserId: admin.userId
    });

    revalidatePath("/admin/side-picks");
    revalidatePath("/side-picks");
    revalidatePath("/last-chance-picks");
    revalidatePath("/leaderboard");

    return {
      ok: true as const,
      message: "Official Side Pick result saved.",
      data
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Could not save official Side Pick result."
    };
  }
}

export async function recomputeAdminSidePickScoresAction(): Promise<
  { ok: true; message: string; summary: SidePickAuditSummary } | { ok: false; message: string }
> {
  const admin = await requireSuperAdmin();
  if (!admin.ok) {
    return admin;
  }

  try {
    const summary = await recomputeSidePickScores();
    revalidatePath("/admin/side-picks");
    revalidatePath("/side-picks");
    revalidatePath("/last-chance-picks");
    revalidatePath("/dashboard");

    return {
      ok: true,
      message: `${SIDE_PICK_PUBLIC_NAME} scoring recomputed for ${summary.usersScored} users.`,
      summary
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : `Could not recompute ${SIDE_PICK_PUBLIC_NAME} scoring.`
    };
  }
}

async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: `Sign in as Super Admin to manage ${SIDE_PICK_PUBLIC_NAME}.` };
  }

  const adminSupabase = createAdminClient();
  const { data, error: userError } = await adminSupabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (userError) {
    return { ok: false, message: userError.message };
  }

  if ((data as { role?: string | null } | null)?.role !== "admin") {
    return { ok: false, message: `You do not have permission to manage ${SIDE_PICK_PUBLIC_NAME}.` };
  }

  return { ok: true, userId: user.id };
}

function normalizeTeamIds(teamIds: string[]) {
  return Array.from(new Set(teamIds.map((teamId) => teamId.trim()).filter(Boolean)));
}

function normalizeLockAt(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
