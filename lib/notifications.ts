import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push-notifications";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export type NotificationType = "perfect_pick" | "daily_winner" | "big_rank_movement" | "event_comment";

type NotificationSettingRow = {
  user_id: string;
  notifications_enabled: boolean;
};

type NotificationRow = {
  id: string;
  user_id: string;
  event_id: string | null;
  type: NotificationType;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type UserNotification = {
  id: string;
  eventId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  href: string;
};

export type NotificationEventSeed = {
  id: string;
  event_type: "perfect_pick" | "daily_winner" | "rank_moved_up";
  scope_type: "global" | "group";
  group_id: string | null;
  user_id: string | null;
  points_delta: number | null;
  rank_delta: number | null;
  message: string | null;
};

type NotificationInsert = {
  user_id: string;
  event_id: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at?: string | null;
};

const NOTIFICATION_LIMIT = 12;

export async function fetchCurrentUserNotificationPreferences() {
  const userResult = await getCurrentNotificationViewerId();
  if (!userResult.ok) {
    return { ok: false as const, message: userResult.message };
  }

  const adminSupabase = createAdminClient();
  const enabled = await fetchNotificationsEnabledForUser(adminSupabase, userResult.userId);
  return {
    ok: true as const,
    notificationsEnabled: enabled
  };
}

export async function updateCurrentUserNotificationPreferences(enabled: boolean) {
  const userResult = await getCurrentNotificationViewerId();
  if (!userResult.ok) {
    return { ok: false as const, message: userResult.message };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("user_settings").upsert(
    {
      user_id: userResult.userId,
      notifications_enabled: enabled
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (isMissingUserSettingsTableError(error.message)) {
      return {
        ok: false as const,
        message: "Notification preferences are not available yet. Apply the user_notifications migration first."
      };
    }

    return { ok: false as const, message: error.message };
  }

  return {
    ok: true as const,
    notificationsEnabled: enabled,
    message: enabled ? "Leaderboard notifications turned on." : "Leaderboard notifications turned off."
  };
}

export async function fetchCurrentUserNotifications() {
  const userResult = await getCurrentNotificationViewerId();
  if (!userResult.ok) {
    return { ok: false as const, message: userResult.message };
  }

  const adminSupabase = createAdminClient();
  const [notificationsResult, unreadCountResult] = await Promise.all([
    adminSupabase
      .from("user_notifications")
      .select("id,user_id,event_id,type,payload,read_at,created_at")
      .eq("user_id", userResult.userId)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_LIMIT),
    adminSupabase
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userResult.userId)
      .is("read_at", null)
  ]);

  if (notificationsResult.error) {
    if (isMissingUserNotificationsTableError(notificationsResult.error.message)) {
      return {
        ok: true as const,
        notifications: [] as UserNotification[],
        unreadCount: 0
      };
    }

    return { ok: false as const, message: notificationsResult.error.message };
  }

  if (unreadCountResult.error) {
    if (isMissingUserNotificationsTableError(unreadCountResult.error.message)) {
      return {
        ok: true as const,
        notifications: [] as UserNotification[],
        unreadCount: 0
      };
    }

    return { ok: false as const, message: unreadCountResult.error.message };
  }

  return {
    ok: true as const,
    notifications: (((notificationsResult.data as NotificationRow[] | null) ?? []).map(mapNotificationRow)),
    unreadCount: unreadCountResult.count ?? 0
  };
}

export async function markCurrentUserNotificationsRead() {
  const userResult = await getCurrentNotificationViewerId();
  if (!userResult.ok) {
    return { ok: false as const, message: userResult.message };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userResult.userId)
    .is("read_at", null);

  if (error) {
    if (isMissingUserNotificationsTableError(error.message)) {
      return { ok: true as const };
    }

    return { ok: false as const, message: error.message };
  }

  return { ok: true as const };
}

export async function createNotificationsForLeaderboardEvents(
  adminSupabase: ReturnType<typeof createAdminClient>,
  events: NotificationEventSeed[]
) {
  const inserts = selectPreferredNotificationEvents(events)
    .flatMap<NotificationInsert>((event) => {
      if (!event.user_id) {
        return [];
      }

      if (event.event_type === "perfect_pick") {
        return [
          {
            user_id: event.user_id,
            event_id: event.id,
            type: "perfect_pick",
            payload: {
              title: "🎯 Perfect Pick",
              body: "Perfect Pick! 🎯",
              scopeType: event.scope_type,
              groupId: event.group_id
            }
          }
        ];
      }

      if (event.event_type === "daily_winner") {
        return [
          {
            user_id: event.user_id,
            event_id: event.id,
            type: "daily_winner",
            payload: {
              title: "🏆 Daily Winner",
              body: "You're today's winner 🏆",
              scopeType: event.scope_type,
              groupId: event.group_id,
              dailyPoints: event.points_delta ?? 0
            }
          }
        ];
      }

      if (event.event_type === "rank_moved_up" && (event.rank_delta ?? 0) >= 3) {
        return [
          {
            user_id: event.user_id,
            event_id: event.id,
            type: "big_rank_movement",
            payload: {
              title: "📈 Big Rank Movement",
              body: `You moved up ${event.rank_delta} ${event.rank_delta === 1 ? "spot" : "spots"} 🔥`,
              scopeType: event.scope_type,
              groupId: event.group_id,
              rankDelta: event.rank_delta,
              pointsDelta: event.points_delta ?? 0
            }
          }
        ];
      }

      return [];
    })
    .filter(Boolean);

  await insertNotificationBatch(adminSupabase, inserts);
}

export async function createCommentNotification(input: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  recipientUserId: string;
  eventId: string;
  commenterName: string;
  body: string;
  scopeType: "global" | "group";
  groupId: string | null;
}) {
  await insertNotificationBatch(input.adminSupabase, [
    {
      user_id: input.recipientUserId,
      event_id: input.eventId,
      type: "event_comment",
      read_at: null,
      payload: {
        title: "💬 New Comment",
        body: "New comment on your activity 💬",
        commenterName: input.commenterName,
        commentBody: input.body,
        scopeType: input.scopeType,
        groupId: input.groupId
      }
    }
  ]);
}

function selectPreferredNotificationEvents(events: NotificationEventSeed[]) {
  const bestByKey = new Map<string, NotificationEventSeed>();

  for (const event of events) {
    if (!event.user_id) {
      continue;
    }

    const notificationType = getNotificationTypeForEvent(event);
    if (!notificationType) {
      continue;
    }

    const key = `${event.user_id}:${notificationType}`;
    const currentBest = bestByKey.get(key);
    if (!currentBest || compareNotificationPriority(event, currentBest) < 0) {
      bestByKey.set(key, event);
    }
  }

  return Array.from(bestByKey.values());
}

function getNotificationTypeForEvent(event: NotificationEventSeed): NotificationType | null {
  if (event.event_type === "perfect_pick") {
    return "perfect_pick";
  }

  if (event.event_type === "daily_winner") {
    return "daily_winner";
  }

  if (event.event_type === "rank_moved_up" && (event.rank_delta ?? 0) >= 3) {
    return "big_rank_movement";
  }

  return null;
}

function compareNotificationPriority(left: NotificationEventSeed, right: NotificationEventSeed) {
  const scopeScore = (event: NotificationEventSeed) => (event.scope_type === "group" ? 0 : 1);
  const magnitudeScore = (event: NotificationEventSeed) =>
    -Math.max(Math.abs(event.rank_delta ?? 0), Math.abs(event.points_delta ?? 0));

  return scopeScore(left) - scopeScore(right) || magnitudeScore(left) - magnitudeScore(right) || left.id.localeCompare(right.id);
}

export async function fetchNotificationsEnabledForUser(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("user_id,notifications_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingUserSettingsTableError(error.message)) {
      return false;
    }

    throw new Error(error.message);
  }

  return ((data as NotificationSettingRow | null)?.notifications_enabled ?? false);
}

async function insertNotificationBatch(
  adminSupabase: ReturnType<typeof createAdminClient>,
  inserts: NotificationInsert[]
) {
  const uniqueInserts = dedupeNotificationInserts(inserts);
  if (uniqueInserts.length === 0) {
    return;
  }

  const enabledUserIds = await fetchEnabledNotificationUserIds(
    adminSupabase,
    uniqueInserts.map((item) => item.user_id)
  );

  const allowedInserts = uniqueInserts.filter((item) => enabledUserIds.has(item.user_id));
  if (allowedInserts.length === 0) {
    return;
  }

  const existingKeys = await fetchExistingNotificationKeys(adminSupabase, allowedInserts);
  const newInserts = allowedInserts.filter((item) => !existingKeys.has(notificationInsertKey(item)));
  if (newInserts.length === 0) {
    return;
  }

  const { error } = await adminSupabase.from("user_notifications").insert(newInserts);

  if (error) {
    if (isMissingUserNotificationsTableError(error.message) || isMissingUserSettingsTableError(error.message)) {
      return;
    }

    throw new Error(error.message);
  }

  await Promise.all(
    newInserts.map((insert) =>
      sendPushNotification(
        adminSupabase,
        insert.user_id,
        typeof insert.payload.title === "string" ? insert.payload.title : fallbackTitle(insert.type),
        typeof insert.payload.body === "string" ? insert.payload.body : "",
        {
          eventId: insert.event_id,
          type: insert.type
        }
      )
    )
  );

  queueNotificationDeliveryStub(newInserts);
}

async function fetchEnabledNotificationUserIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("user_id,notifications_enabled")
    .in("user_id", uniqueUserIds)
    .eq("notifications_enabled", true);

  if (error) {
    if (isMissingUserSettingsTableError(error.message)) {
      return new Set<string>();
    }

    throw new Error(error.message);
  }

  return new Set(
    (((data as NotificationSettingRow[] | null) ?? []).map((row) => row.user_id))
  );
}

function dedupeNotificationInserts(inserts: NotificationInsert[]) {
  const byKey = new Map<string, NotificationInsert>();

  for (const insert of inserts) {
    const key = notificationInsertKey(insert);
    byKey.set(key, insert);
  }

  return Array.from(byKey.values());
}

async function fetchExistingNotificationKeys(
  adminSupabase: ReturnType<typeof createAdminClient>,
  inserts: NotificationInsert[]
) {
  const eventIds = Array.from(new Set(inserts.map((item) => item.event_id).filter(Boolean))) as string[];
  if (eventIds.length === 0) {
    return new Set<string>();
  }

  const userIds = Array.from(new Set(inserts.map((item) => item.user_id)));
  const types = Array.from(new Set(inserts.map((item) => item.type)));

  const { data, error } = await adminSupabase
    .from("user_notifications")
    .select("user_id,event_id,type")
    .in("user_id", userIds)
    .in("event_id", eventIds)
    .in("type", types);

  if (error) {
    if (isMissingUserNotificationsTableError(error.message)) {
      return new Set<string>();
    }

    throw new Error(error.message);
  }

  return new Set(
    (((data as Array<{ user_id: string; event_id: string | null; type: NotificationType }> | null) ?? []).map(
      (row) =>
        notificationInsertKey({
          user_id: row.user_id,
          event_id: row.event_id,
          type: row.type
        })
    ))
  );
}

function notificationInsertKey(insert: Pick<NotificationInsert, "user_id" | "event_id" | "type">) {
  return `${insert.user_id}:${insert.event_id ?? "none"}:${insert.type}`;
}

function mapNotificationRow(row: NotificationRow): UserNotification {
  const payload = row.payload ?? {};
  const title = typeof payload.title === "string" ? payload.title : fallbackTitle(row.type);
  const body = typeof payload.body === "string" ? payload.body : "";

  return {
    id: row.id,
    eventId: row.event_id,
    type: row.type,
    title,
    body,
    createdAt: row.created_at,
    readAt: row.read_at,
    href: "/leaderboard"
  };
}

function fallbackTitle(type: NotificationType) {
  switch (type) {
    case "perfect_pick":
      return "🎯 Perfect Pick";
    case "daily_winner":
      return "🏆 Daily Winner";
    case "big_rank_movement":
      return "📈 Big Rank Movement";
    case "event_comment":
      return "💬 New Comment";
    default:
      return "Leaderboard update";
  }
}

async function getCurrentNotificationViewerId(): Promise<
  { ok: true; userId: string } | { ok: false; message: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in." };
  }

  return { ok: true, userId: user.id };
}

function queueNotificationDeliveryStub(inserts: NotificationInsert[]) {
  void inserts;
}

function isMissingUserSettingsTableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.user_settings'") ||
    normalized.includes("relation \"public.user_settings\" does not exist") ||
    normalized.includes("relation \"user_settings\" does not exist") ||
    (normalized.includes("user_settings") && normalized.includes("schema cache"))
  );
}

function isMissingUserNotificationsTableError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.user_notifications'") ||
    normalized.includes("relation \"public.user_notifications\" does not exist") ||
    normalized.includes("relation \"user_notifications\" does not exist") ||
    (normalized.includes("user_notifications") && normalized.includes("schema cache"))
  );
}
