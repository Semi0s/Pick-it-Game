import { createNotificationsForLeaderboardEvents, createTrophyEarnedNotifications } from "@/lib/notifications";
import { fetchLeaderboardEventReactions } from "@/lib/leaderboard-reactions";
import { isMissingAnyRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { createAdminClient } from "@/lib/supabase/admin";

type SnapshotMatchRow = {
  match_id: string;
  created_at: string;
};

type PredictionScoreRow = {
  user_id: string;
  points: number;
};

type UserRow = {
  id: string;
  name: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
};

type LeaderboardEventRow = {
  id: string;
  event_type: "daily_winner";
  scope_type: "global" | "group";
  group_id: string | null;
  user_id: string | null;
  points_delta: number | null;
  rank_delta: number | null;
  message: string | null;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
};

type TrophyRow = {
  id: string;
};

export type DailyWinner = {
  eventId?: string | null;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  homeTeamId?: string | null;
  points: number;
  congratulationsCount?: number;
  congratulated?: boolean;
};

export const LEADERBOARD_HIGHLIGHT_TIME_ZONE = "America/New_York";

export async function fetchPerfectPickUserIdsForLatestFinalizedMatch(groupId?: string): Promise<Set<string>> {
  const adminSupabase = createAdminClient();
  const trimmedGroupId = groupId?.trim();
  let snapshotQuery = adminSupabase
    .from("leaderboard_snapshots")
    .select("match_id,created_at")
    .eq("scope_type", trimmedGroupId ? "group" : "global")
    .order("created_at", { ascending: false })
    .limit(1);

  snapshotQuery = trimmedGroupId ? snapshotQuery.eq("group_id", trimmedGroupId) : snapshotQuery.is("group_id", null);

  const { data, error } = await snapshotQuery.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const latestMatchId = (data as SnapshotMatchRow | null)?.match_id ?? null;
  if (!latestMatchId) {
    return new Set();
  }

  let predictionScoresQuery = adminSupabase
    .from("prediction_scores")
    .select("user_id")
    .eq("match_id", latestMatchId)
    .gt("exact_score_points", 0);

  if (trimmedGroupId) {
    const { data: memberships, error: membershipsError } = await adminSupabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", trimmedGroupId);

    if (membershipsError) {
      throw new Error(membershipsError.message);
    }

    const memberUserIds = Array.from(
      new Set((((memberships as Array<{ user_id: string }> | null) ?? []).map((row) => row.user_id)))
    );

    if (memberUserIds.length === 0) {
      return new Set();
    }

    predictionScoresQuery = predictionScoresQuery.in("user_id", memberUserIds);
  }

  const { data: predictionScores, error: predictionScoresError } = await predictionScoresQuery;

  if (predictionScoresError) {
    throw new Error(predictionScoresError.message);
  }

  return new Set(
    (((predictionScores as Pick<PredictionScoreRow, "user_id">[] | null) ?? []).map((row) => row.user_id))
  );
}

export async function fetchDailyWinners(groupId?: string): Promise<DailyWinner[]> {
  const adminSupabase = createAdminClient();
  const { startIso, endIso, dateKey } = getCurrentDayBoundsInTimeZone(LEADERBOARD_HIGHLIGHT_TIME_ZONE);
  const trimmedGroupId = groupId?.trim();

  let dailyWinnerQuery = adminSupabase
    .from("prediction_scores")
    .select("user_id,points")
    .gte("scored_at", startIso)
    .lt("scored_at", endIso);

  if (trimmedGroupId) {
    const { data: memberships, error: membershipsError } = await adminSupabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", trimmedGroupId);

    if (membershipsError) {
      throw new Error(membershipsError.message);
    }

    const memberUserIds = Array.from(
      new Set((((memberships as Array<{ user_id: string }> | null) ?? []).map((row) => row.user_id)))
    );

    if (memberUserIds.length === 0) {
      return await syncDailyWinnerEvents({
        adminSupabase,
        winners: [],
        dateKey,
        scopeType: "group",
        groupId: trimmedGroupId
      });
    }

    dailyWinnerQuery = dailyWinnerQuery.in("user_id", memberUserIds);
  }

  const { data, error } = await dailyWinnerQuery;

  if (error) {
    throw new Error(error.message);
  }

  const totalsByUser = new Map<string, number>();
  for (const row of ((data as PredictionScoreRow[] | null) ?? [])) {
    totalsByUser.set(row.user_id, (totalsByUser.get(row.user_id) ?? 0) + row.points);
  }

  const highestPoints = Math.max(0, ...totalsByUser.values());
  if (highestPoints <= 0) {
    return await syncDailyWinnerEvents({
      adminSupabase,
      winners: [],
      dateKey,
      scopeType: trimmedGroupId ? "group" : "global",
      groupId: trimmedGroupId ?? null
    });
  }

  const winnerIds = Array.from(totalsByUser.entries())
    .filter(([, points]) => points === highestPoints)
    .map(([userId]) => userId);

  if (winnerIds.length === 0) {
    return await syncDailyWinnerEvents({
      adminSupabase,
      winners: [],
      dateKey,
      scopeType: trimmedGroupId ? "group" : "global",
      groupId: trimmedGroupId ?? null
    });
  }

  const { data: users, error: usersError } = await adminSupabase
    .from("users")
    .select("id,name,avatar_url,home_team_id")
    .in("id", winnerIds);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const usersById = new Map((((users as UserRow[] | null) ?? []).map((user) => [user.id, user])));
  const winners = winnerIds
    .map((userId) => {
      const user = usersById.get(userId);
      if (!user) {
        return null;
      }

      return {
        userId,
        name: user.name,
        avatarUrl: user.avatar_url ?? null,
        homeTeamId: user.home_team_id ?? null,
        points: highestPoints
      };
    })
    .filter(Boolean) as DailyWinner[];

  return await syncDailyWinnerEvents({
    adminSupabase,
    winners,
    dateKey,
    scopeType: trimmedGroupId ? "group" : "global",
    groupId: trimmedGroupId ?? null
  });
}

function getCurrentDayBoundsInTimeZone(timeZone: string) {
  const now = new Date();
  const currentDateParts = getDateParts(now, timeZone);
  const offset = getOffsetString(now, timeZone);

  const nextDaySeed = new Date(now);
  nextDaySeed.setUTCDate(nextDaySeed.getUTCDate() + 1);
  const nextDateParts = getDateParts(nextDaySeed, timeZone);
  const nextOffset = getOffsetString(nextDaySeed, timeZone);

  return {
    dateKey: `${currentDateParts.year}-${currentDateParts.month}-${currentDateParts.day}`,
    startIso: `${currentDateParts.year}-${currentDateParts.month}-${currentDateParts.day}T00:00:00${offset}`,
    endIso: `${nextDateParts.year}-${nextDateParts.month}-${nextDateParts.day}T00:00:00${nextOffset}`
  };
}

async function syncDailyWinnerEvents({
  adminSupabase,
  winners,
  dateKey,
  scopeType,
  groupId
}: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  winners: DailyWinner[];
  dateKey: string;
  scopeType: "global" | "group";
  groupId: string | null;
}): Promise<DailyWinner[]> {
  let existingEventsQuery = adminSupabase
    .from("leaderboard_events")
    .select("id,event_type,scope_type,group_id,user_id,points_delta,rank_delta,message,created_at,metadata")
    .eq("event_type", "daily_winner")
    .eq("scope_type", scopeType)
    .contains("metadata", { date: dateKey });

  existingEventsQuery = scopeType === "group" ? existingEventsQuery.eq("group_id", groupId) : existingEventsQuery.is("group_id", null);

  const { data: existingEventsData, error: existingEventsError } = await existingEventsQuery;
  if (existingEventsError) {
    throw new Error(existingEventsError.message);
  }

  const existingEvents = (existingEventsData as LeaderboardEventRow[] | null) ?? [];
  const hasMatchingWinners =
    existingEvents.length === winners.length &&
    winners.every((winner) =>
      existingEvents.some(
        (event) => event.user_id === winner.userId && (event.points_delta ?? 0) === winner.points
      )
    );

  if (!hasMatchingWinners) {
    let deleteQuery = adminSupabase
      .from("leaderboard_events")
      .delete()
      .eq("event_type", "daily_winner")
      .eq("scope_type", scopeType)
      .contains("metadata", { date: dateKey });

    deleteQuery = scopeType === "group" ? deleteQuery.eq("group_id", groupId) : deleteQuery.is("group_id", null);

    const { error: deleteError } = await deleteQuery;
    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (winners.length > 0) {
      const { error: insertError } = await adminSupabase.from("leaderboard_events").insert(
        winners.map((winner) => ({
          event_type: "daily_winner",
          scope_type: scopeType,
          group_id: groupId,
          match_id: null,
          user_id: winner.userId,
          related_user_id: null,
          points_delta: winner.points,
          rank_delta: null,
          message: `${winner.name} is today's Daily Winner`,
          metadata: {
            date: dateKey,
            daily_points: winner.points
          }
        }))
      );

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    return syncDailyWinnerEvents({
      adminSupabase,
      winners,
      dateKey,
      scopeType,
      groupId
    });
  }

  await createNotificationsForLeaderboardEvents(adminSupabase, existingEvents);
  await awardDailyWinnerTrophy(adminSupabase, winners);

  const eventIds = existingEvents.map((event) => event.id);
  const reactionsByEventId = await fetchLeaderboardEventReactions(eventIds);

  return winners.map((winner) => {
    const eventId = existingEvents.find((event) => event.user_id === winner.userId)?.id ?? null;
    const congratulateReaction = eventId
      ? (reactionsByEventId.get(eventId) ?? []).find((reaction) => reaction.emoji === "👏")
      : null;

    return {
      ...winner,
      eventId,
      congratulationsCount: congratulateReaction?.count ?? 0,
      congratulated: congratulateReaction?.reacted ?? false
    };
  });
}

function getDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  return {
    year: parts.find((part) => part.type === "year")?.value ?? "0000",
    month: parts.find((part) => part.type === "month")?.value ?? "01",
    day: parts.find((part) => part.type === "day")?.value ?? "01"
  };
}

async function awardDailyWinnerTrophy(
  adminSupabase: ReturnType<typeof createAdminClient>,
  winners: DailyWinner[]
) {
  const winnerUserIds = Array.from(new Set(winners.map((winner) => winner.userId)));
  if (winnerUserIds.length === 0) {
    return;
  }

  const { data: trophy, error: trophyError } = await adminSupabase
    .from("trophies")
    .select("id")
    .eq("key", "daily_winner")
    .maybeSingle();

  if (trophyError) {
    if (isMissingTrophiesTableError(trophyError.message)) {
      warnOptionalFeatureOnce(
        "daily-winner-trophies-missing",
        "Daily Winner trophies are unavailable until the trophies migrations are applied.",
        trophyError.message
      );
      return;
    }

    throw new Error(trophyError.message);
  }

  if (!(trophy as TrophyRow | null)?.id) {
    return;
  }

  const { data: existingAwards, error: existingAwardsError } = await adminSupabase
    .from("user_trophies")
    .select("user_id")
    .eq("trophy_id", (trophy as TrophyRow).id)
    .in("user_id", winnerUserIds);

  if (existingAwardsError) {
    if (isMissingTrophiesTableError(existingAwardsError.message)) {
      return;
    }

    throw new Error(existingAwardsError.message);
  }

  const existingAwardUserIds = new Set(((existingAwards ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));
  const newlyAwardedUserIds = winnerUserIds.filter((userId) => !existingAwardUserIds.has(userId));
  if (newlyAwardedUserIds.length === 0) {
    return;
  }

  const awardedAt = new Date().toISOString();

  const { error: awardError } = await adminSupabase.from("user_trophies").upsert(
    newlyAwardedUserIds.map((userId) => ({
      user_id: userId,
      trophy_id: (trophy as TrophyRow).id,
      awarded_at: awardedAt
    })),
    { onConflict: "user_id,trophy_id" }
  );

  if (awardError) {
    if (isMissingTrophiesTableError(awardError.message)) {
      return;
    }

    throw new Error(awardError.message);
  }

  await createTrophyEarnedNotifications({
    adminSupabase,
    awards: newlyAwardedUserIds.map((userId) => ({
      userId,
      trophyId: (trophy as TrophyRow).id,
      trophyName: "Daily Winner",
      trophyIcon: "🏆",
      trophyTier: "gold",
      trophyDescription: "Awarded for finishing the day on top.",
      awardedAt
    }))
  });
}

function isMissingTrophiesTableError(message?: string) {
  return isMissingAnyRelationError(message, ["user_trophies", "trophies"]);
}

function getOffsetString(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit"
  });

  const offsetLabel = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const normalizedOffset = offsetLabel.replace("GMT", "");

  if (normalizedOffset === "" || normalizedOffset === "+0" || normalizedOffset === "-0") {
    return "Z";
  }

  if (/^[+-]\d{2}:\d{2}$/.test(normalizedOffset)) {
    return normalizedOffset;
  }

  const match = normalizedOffset.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return "Z";
  }

  const [, sign, hours, minutes] = match;
  return `${sign}${hours.padStart(2, "0")}:${(minutes ?? "00").padStart(2, "0")}`;
}
