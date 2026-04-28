import { createAdminClient } from "@/lib/supabase/admin";
import { createCommentNotification } from "@/lib/notifications";
import {
  assertUserCanSeeLeaderboardEvent,
  getCurrentLeaderboardViewerId
} from "@/lib/leaderboard-reactions";
import { isMissingRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { awardFirstReactionTrophy } from "@/lib/trophy-awards";

const MAX_COMMENT_LENGTH = 280;

type LeaderboardEventCommentRow = {
  id: string;
  event_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user?:
    | { id: string; name: string; avatar_url?: string | null; home_team_id?: string | null }
    | Array<{ id: string; name: string; avatar_url?: string | null; home_team_id?: string | null }>
    | null;
};

type LeaderboardEventOwnerRow = {
  id: string;
  scope_type: "global" | "group";
  group_id: string | null;
  user_id: string | null;
};

export type LeaderboardEventComment = {
  id: string;
  userId: string;
  userName: string;
  userAvatarUrl?: string | null;
  userHomeTeamId?: string | null;
  body: string;
  createdAt: string;
  isOwn: boolean;
};

type CommentMutationResult =
  | { ok: true; comments: LeaderboardEventComment[] }
  | { ok: false; message: string };

export async function addLeaderboardEventComment(
  eventId: string,
  body: string
): Promise<CommentMutationResult> {
  const normalizedBody = normalizeCommentBody(body);
  if (!normalizedBody) {
    return { ok: false, message: "Comments cannot be empty." };
  }

  const userResult = await getCurrentLeaderboardViewerId();
  if (!userResult.ok) {
    return { ok: false, message: userResult.message.replace("react", "comment") };
  }

  const adminSupabase = createAdminClient();
  const visibility = await assertUserCanSeeLeaderboardEvent(adminSupabase, userResult.userId, eventId);
  if (!visibility.ok) {
    return visibility;
  }

  const [{ data: commenterProfile, error: commenterProfileError }, { data: eventRow, error: eventRowError }] =
    await Promise.all([
      adminSupabase.from("users").select("name").eq("id", userResult.userId).maybeSingle(),
      adminSupabase
        .from("leaderboard_events")
        .select("id,scope_type,group_id,user_id")
        .eq("id", eventId)
        .maybeSingle()
    ]);

  if (commenterProfileError) {
    return { ok: false, message: commenterProfileError.message };
  }

  if (eventRowError) {
    return { ok: false, message: eventRowError.message };
  }

  const { data: insertedComment, error } = await adminSupabase
    .from("leaderboard_event_comments")
    .insert({
      event_id: eventId,
      user_id: userResult.userId,
      body: normalizedBody
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, message: error.message };
  }

  await awardFirstReactionTrophy(adminSupabase, userResult.userId);

  const leaderboardEvent = eventRow as LeaderboardEventOwnerRow | null;
  if (leaderboardEvent?.user_id && leaderboardEvent.user_id !== userResult.userId) {
    await createCommentNotification({
      adminSupabase,
      recipientUserId: leaderboardEvent.user_id,
      eventId,
      commentId: ((insertedComment as { id: string } | null)?.id ?? ""),
      commenterName: commenterProfile?.name ?? "Player",
      body: normalizedBody,
      scopeType: leaderboardEvent.scope_type,
      groupId: leaderboardEvent.group_id
    });
  }

  const grouped = await fetchCommentsForEvents([eventId], userResult.userId);
  return { ok: true, comments: grouped.get(eventId) ?? [] };
}

export async function fetchCommentsForEvents(
  eventIds: string[],
  currentUserId?: string | null
): Promise<Map<string, LeaderboardEventComment[]>> {
  const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)));
  if (uniqueEventIds.length === 0) {
    return new Map();
  }

  let viewerId = currentUserId ?? null;
  if (viewerId === null || viewerId === undefined) {
    const userResult = await getCurrentLeaderboardViewerId();
    viewerId = userResult.ok ? userResult.userId : null;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("leaderboard_event_comments")
    .select("id,event_id,user_id,body,created_at,user:users!leaderboard_event_comments_user_id_fkey(id,name,avatar_url,home_team_id)")
    .in("event_id", uniqueEventIds)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingCommentsTableError(error.message)) {
      warnOptionalFeatureOnce(
        "leaderboard-comments-missing",
        "Leaderboard comments are unavailable until the comments migration is applied.",
        error.message
      );
      return new Map();
    }

    throw new Error(error.message);
  }

  const rows = (data as LeaderboardEventCommentRow[] | null) ?? [];
  const grouped = new Map<string, LeaderboardEventComment[]>();

  for (const row of rows) {
    const current = grouped.get(row.event_id) ?? [];
    const userRow = Array.isArray(row.user) ? row.user[0] : row.user;
    current.push({
      id: row.id,
      userId: row.user_id,
      userName: userRow?.name ?? "Player",
      userAvatarUrl: userRow?.avatar_url ?? null,
      userHomeTeamId: userRow?.home_team_id ?? null,
      body: row.body,
      createdAt: row.created_at,
      isOwn: viewerId === row.user_id
    });
    grouped.set(row.event_id, current);
  }

  return new Map(uniqueEventIds.map((eventId) => [eventId, grouped.get(eventId) ?? []]));
}

function normalizeCommentBody(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.slice(0, MAX_COMMENT_LENGTH);
}

function isMissingCommentsTableError(message: string) {
  return isMissingRelationError(message, "leaderboard_event_comments");
}
