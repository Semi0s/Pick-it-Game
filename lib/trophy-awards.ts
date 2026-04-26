import { createAdminClient } from "@/lib/supabase/admin";

type TrophyRow = {
  id: string;
};

export async function awardFirstReactionTrophy(adminSupabase: ReturnType<typeof createAdminClient>, userId: string) {
  try {
    const trophyId = await fetchTrophyId(adminSupabase, "first_reaction");
    if (!trophyId) {
      return;
    }

    const [reactionsCountResult, commentsCountResult] = await Promise.all([
      adminSupabase
        .from("leaderboard_event_reactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      adminSupabase
        .from("leaderboard_event_comments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
    ]);

    if (reactionsCountResult.error) {
      if (isMissingSupportTableError(reactionsCountResult.error.message, "leaderboard_event_reactions")) {
        return;
      }

      console.error("Could not count leaderboard reactions for trophy award.", reactionsCountResult.error);
      return;
    }

    if (commentsCountResult.error) {
      if (isMissingSupportTableError(commentsCountResult.error.message, "leaderboard_event_comments")) {
        return;
      }

      console.error("Could not count leaderboard comments for trophy award.", commentsCountResult.error);
      return;
    }

    const totalInteractions = (reactionsCountResult.count ?? 0) + (commentsCountResult.count ?? 0);
    if (totalInteractions !== 1) {
      return;
    }

    const { error: awardError } = await adminSupabase.from("user_trophies").upsert(
      {
        user_id: userId,
        trophy_id: trophyId,
        awarded_at: new Date().toISOString()
      },
      { onConflict: "user_id,trophy_id" }
    );

    if (awardError && !isMissingTrophiesTableError(awardError.message)) {
      console.error("Could not award first_reaction trophy.", awardError);
    }
  } catch (error) {
    console.error("Unexpected first_reaction trophy award failure.", error);
  }
}

async function fetchTrophyId(
  adminSupabase: ReturnType<typeof createAdminClient>,
  trophyKey: string
): Promise<string | null> {
  const { data, error } = await adminSupabase
    .from("trophies")
    .select("id")
    .eq("key", trophyKey)
    .maybeSingle();

  if (error) {
    if (isMissingTrophiesTableError(error.message)) {
      return null;
    }

    console.error(`Could not load trophy ${trophyKey}.`, error);
    return null;
  }

  return (data as TrophyRow | null)?.id ?? null;
}

function isMissingTrophiesTableError(message?: string) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    (normalized.includes("user_trophies") || normalized.includes("trophies")) &&
    (
      normalized.includes("schema cache") ||
      normalized.includes("does not exist") ||
      normalized.includes("could not find the table")
    )
  );
}

function isMissingSupportTableError(message: string, tableName: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes(tableName.toLowerCase()) &&
    (
      normalized.includes("schema cache") ||
      normalized.includes("does not exist") ||
      normalized.includes("could not find the table")
    )
  );
}
