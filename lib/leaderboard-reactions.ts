import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { awardFirstReactionTrophy } from "@/lib/trophy-awards";

export const LEADERBOARD_REACTION_EMOJIS = ["🔥", "🎯", "👀", "👍", "👏"] as const;

type AllowedReactionEmoji = (typeof LEADERBOARD_REACTION_EMOJIS)[number];

type LeaderboardEventScopeRow = {
  id: string;
  scope_type: "global" | "group";
  group_id: string | null;
};

type LeaderboardEventReactionRow = {
  event_id: string;
  user_id: string;
  emoji: AllowedReactionEmoji;
};

export type LeaderboardReactionSummary = {
  emoji: AllowedReactionEmoji;
  count: number;
  reacted: boolean;
};

type ReactionMutationResult =
  | { ok: true; reactions: LeaderboardReactionSummary[] }
  | { ok: false; message: string };

export async function addLeaderboardEventReaction(
  eventId: string,
  emoji: string
): Promise<ReactionMutationResult> {
  const normalizedEmoji = normalizeEmoji(emoji);
  if (!normalizedEmoji) {
    return { ok: false, message: "That reaction is not supported." };
  }

  const userResult = await getCurrentLeaderboardViewerId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();
  const visibility = await assertUserCanSeeLeaderboardEvent(adminSupabase, userResult.userId, eventId);
  if (!visibility.ok) {
    return visibility;
  }

  const { error } = await adminSupabase
    .from("leaderboard_event_reactions")
    .upsert(
      {
        event_id: eventId,
        user_id: userResult.userId,
        emoji: normalizedEmoji
      },
      { onConflict: "event_id,user_id,emoji", ignoreDuplicates: true }
    );

  if (error) {
    return { ok: false, message: error.message };
  }

  await awardFirstReactionTrophy(adminSupabase, userResult.userId);

  const grouped = await fetchLeaderboardEventReactions([eventId], userResult.userId);
  return { ok: true, reactions: grouped.get(eventId) ?? [] };
}

export async function removeLeaderboardEventReaction(
  eventId: string,
  emoji: string
): Promise<ReactionMutationResult> {
  const normalizedEmoji = normalizeEmoji(emoji);
  if (!normalizedEmoji) {
    return { ok: false, message: "That reaction is not supported." };
  }

  const userResult = await getCurrentLeaderboardViewerId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();
  const visibility = await assertUserCanSeeLeaderboardEvent(adminSupabase, userResult.userId, eventId);
  if (!visibility.ok) {
    return visibility;
  }

  const { error } = await adminSupabase
    .from("leaderboard_event_reactions")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userResult.userId)
    .eq("emoji", normalizedEmoji);

  if (error) {
    return { ok: false, message: error.message };
  }

  const grouped = await fetchLeaderboardEventReactions([eventId], userResult.userId);
  return { ok: true, reactions: grouped.get(eventId) ?? [] };
}

export async function fetchLeaderboardEventReactions(
  eventIds: string[],
  currentUserId?: string | null
): Promise<Map<string, LeaderboardReactionSummary[]>> {
  const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
  if (uniqueEventIds.length === 0) {
    return new Map();
  }

  const adminSupabase = createAdminClient();
  let viewerId = currentUserId ?? null;
  if (viewerId === null || viewerId === undefined) {
    const userResult = await getCurrentLeaderboardViewerId();
    viewerId = userResult.ok ? userResult.userId : null;
  }
  const { data, error } = await adminSupabase
    .from("leaderboard_event_reactions")
    .select("event_id,user_id,emoji")
    .in("event_id", uniqueEventIds);

  if (error) {
    if (isMissingReactionsTableError(error.message)) {
      return new Map();
    }

    throw new Error(error.message);
  }

  const rows = (data as LeaderboardEventReactionRow[] | null) ?? [];
  const countsByEvent = new Map<string, Map<AllowedReactionEmoji, { count: number; reacted: boolean }>>();

  for (const row of rows) {
    const perEvent = countsByEvent.get(row.event_id) ?? new Map();
    const current = perEvent.get(row.emoji) ?? { count: 0, reacted: false };
    current.count += 1;
    if (viewerId && row.user_id === viewerId) {
      current.reacted = true;
    }
    perEvent.set(row.emoji, current);
    countsByEvent.set(row.event_id, perEvent);
  }

  return new Map(
    uniqueEventIds.map((eventId) => {
      const perEvent = countsByEvent.get(eventId) ?? new Map();
      const reactions = LEADERBOARD_REACTION_EMOJIS.map((emoji) => {
        const current = perEvent.get(emoji) ?? { count: 0, reacted: false };
        return {
          emoji,
          count: current.count,
          reacted: current.reacted
        };
      }).filter((reaction) => reaction.count > 0 || reaction.reacted);

      return [eventId, reactions];
    })
  );
}

export async function getCurrentLeaderboardViewerId(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in to react." };
  }

  return { ok: true, userId: user.id };
}

export async function assertUserCanSeeLeaderboardEvent(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  eventId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: event, error: eventError } = await adminSupabase
    .from("leaderboard_events")
    .select("id,scope_type,group_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return { ok: false, message: eventError.message };
  }

  const eventRow = event as LeaderboardEventScopeRow | null;
  if (!eventRow) {
    return { ok: false, message: "That activity event could not be found." };
  }

  if (eventRow.scope_type === "global") {
    return { ok: true };
  }

  const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] = await Promise.all([
    adminSupabase
      .from("group_members")
      .select("group_id")
      .eq("group_id", eventRow.group_id!)
      .eq("user_id", userId)
      .maybeSingle(),
    adminSupabase.from("users").select("role").eq("id", userId).maybeSingle()
  ]);

  if (membershipError) {
    return { ok: false, message: membershipError.message };
  }

  if (profileError) {
    return { ok: false, message: profileError.message };
  }

  if (membership || profile?.role === "admin") {
    return { ok: true };
  }

  return { ok: false, message: "You can only react to activity you are allowed to see." };
}

function normalizeEmoji(emoji: string): AllowedReactionEmoji | null {
  return LEADERBOARD_REACTION_EMOJIS.includes(emoji as AllowedReactionEmoji)
    ? (emoji as AllowedReactionEmoji)
    : null;
}

function isMissingReactionsTableError(message: string) {
  return message.includes("leaderboard_event_reactions") && message.includes("schema cache");
}
