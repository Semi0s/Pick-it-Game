import {
  fetchCommentsForEvents,
  type LeaderboardEventComment
} from "@/lib/leaderboard-comments";
import { fetchDailyWinners } from "@/lib/leaderboard-highlights";
import { fetchLeaderboardEventReactions, type LeaderboardReactionSummary } from "@/lib/leaderboard-reactions";
import { createAdminClient } from "@/lib/supabase/admin";

type LeaderboardEventRow = {
  id: string;
  event_type: "points_awarded" | "perfect_pick" | "rank_moved_up" | "rank_moved_down" | "daily_winner" | "trophy_awarded";
  scope_type: "global" | "group";
  group_id: string | null;
  match_id: string | null;
  user_id: string | null;
  related_user_id: string | null;
  points_delta: number | null;
  rank_delta: number | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user?:
    | { id: string; name: string; avatar_url?: string | null; home_team_id?: string | null }
    | Array<{ id: string; name: string; avatar_url?: string | null; home_team_id?: string | null }>
    | null;
};

export type LeaderboardActivityItem = {
  id: string;
  eventId: string | null;
  eventType: LeaderboardEventRow["event_type"];
  message: string;
  createdAt: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  userHomeTeamId?: string | null;
  reactions: LeaderboardReactionSummary[];
  comments: LeaderboardEventComment[];
  canReact: boolean;
  canComment: boolean;
};

const RECENT_EVENT_LIMIT = 10;

export async function fetchRecentGlobalLeaderboardActivity(options?: {
  includeDailyWinner?: boolean;
}): Promise<LeaderboardActivityItem[]> {
  return fetchRecentLeaderboardActivity({ scopeType: "global", includeDailyWinner: options?.includeDailyWinner });
}

export async function fetchGroupLeaderboardActivity(groupId: string): Promise<LeaderboardActivityItem[]> {
  if (!groupId.trim()) {
    return [];
  }

  return fetchRecentLeaderboardActivity({ scopeType: "group", groupId });
}

async function fetchRecentLeaderboardActivity(options: {
  scopeType: "global" | "group";
  groupId?: string;
  includeDailyWinner?: boolean;
}): Promise<LeaderboardActivityItem[]> {
  const adminSupabase = createAdminClient();
  const includeDailyWinner = options.includeDailyWinner ?? false;

  let query = adminSupabase
    .from("leaderboard_events")
    .select(
      "id,event_type,scope_type,group_id,match_id,user_id,related_user_id,points_delta,rank_delta,message,metadata,created_at,user:users!leaderboard_events_user_id_fkey(id,name,avatar_url,home_team_id)"
    )
    .eq("scope_type", options.scopeType)
    .order("created_at", { ascending: false })
    .limit(RECENT_EVENT_LIMIT);

  query = options.scopeType === "group" ? query.eq("group_id", options.groupId!) : query.is("group_id", null);

  const { data, error } = await query;

  if (error) {
    if (isMissingLeaderboardEventsTableError(error.message)) {
      return includeDailyWinner ? await buildDailyWinnerActivityItems() : [];
    }

    throw new Error(error.message);
  }

  const persistedEvents = (data as LeaderboardEventRow[] | null) ?? [];
  const reactionsByEventId = await fetchLeaderboardEventReactions(persistedEvents.map((event) => event.id));
  const commentableEventIds = persistedEvents
    .filter((event) => event.event_type === "daily_winner" || event.event_type === "trophy_awarded")
    .map((event) => event.id);
  const commentsByEventId = await fetchCommentsForEvents(commentableEventIds);
  const persistedItems = persistedEvents.map((event, index) => {
    const userRow = Array.isArray(event.user) ? event.user[0] : event.user;
    return {
      id: `${event.id}:${index}`,
      eventId: event.id,
      eventType: event.event_type,
      message: event.message ?? formatFallbackMessage(event),
      createdAt: event.created_at,
      userName: userRow?.name ?? null,
      userAvatarUrl: userRow?.avatar_url ?? null,
      userHomeTeamId: userRow?.home_team_id ?? null,
      reactions: reactionsByEventId.get(event.id) ?? [],
      comments: commentsByEventId.get(event.id) ?? [],
      canReact: true,
      canComment: event.event_type === "daily_winner" || event.event_type === "trophy_awarded"
    };
  });

  if (!includeDailyWinner) {
    return pinDailyWinnerToTop(persistedItems);
  }

  if (persistedItems.some((item) => item.eventType === "daily_winner")) {
    return pinDailyWinnerToTop(persistedItems);
  }

  const dailyWinnerItems = await buildDailyWinnerActivityItems();
  return pinDailyWinnerToTop([...dailyWinnerItems, ...persistedItems]).slice(0, RECENT_EVENT_LIMIT);
}

async function buildDailyWinnerActivityItems(): Promise<LeaderboardActivityItem[]> {
  const winners = await fetchDailyWinners();
  const createdAt = new Date().toISOString();

  return winners.map((winner) => ({
    id: `daily_winner:${winner.userId}:${createdAt}`,
    eventId: null,
    eventType: "daily_winner",
    message: `${winner.name} is today's Daily Winner`,
    createdAt,
    userName: winner.name,
    userAvatarUrl: null,
    userHomeTeamId: null,
    reactions: [],
    comments: [],
    canReact: false,
    canComment: false
  }));
}

function formatFallbackMessage(event: LeaderboardEventRow) {
  if (event.event_type === "perfect_pick") {
    return "A player nailed a Perfect Pick";
  }

  if (event.event_type === "rank_moved_up") {
    return `A player moved up ${Math.abs(event.rank_delta ?? 0)} spots`;
  }

  if (event.event_type === "rank_moved_down") {
    return `A player dropped ${Math.abs(event.rank_delta ?? 0)} spots`;
  }

  if (event.event_type === "daily_winner") {
    return "A player is today's Daily Winner";
  }

  if (event.event_type === "trophy_awarded") {
    return "A player earned a trophy";
  }

  return `A player earned +${event.points_delta ?? 0} points`;
}

function isMissingLeaderboardEventsTableError(message: string) {
  return message.includes("leaderboard_events") && message.includes("schema cache");
}

function pinDailyWinnerToTop(items: LeaderboardActivityItem[]) {
  return [...items].sort((left, right) => {
    if (left.eventType === "daily_winner" && right.eventType !== "daily_winner") {
      return -1;
    }

    if (left.eventType !== "daily_winner" && right.eventType === "daily_winner") {
      return 1;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}
