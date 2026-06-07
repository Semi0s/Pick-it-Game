import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push-notifications";
import { isMissingColumnError } from "@/lib/schema-safety";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export type NotificationType =
  | "perfect_pick"
  | "daily_winner"
  | "big_rank_movement"
  | "event_comment"
  | "trophy_earned"
  | "media_moderation";

export type MediaModerationNotificationStatus =
  | "approved"
  | "rejected"
  | "removed"
  | "disabled"
  | "needs_revision";

export type MediaModerationNotificationTarget =
  | "profile_avatar"
  | "group_avatar"
  | "organization_branding";

type NotificationSettingRow = {
  user_id: string;
  notifications_enabled: boolean;
  notify_picks_lock_reminders?: boolean | null;
  notify_match_finalized?: boolean | null;
  notify_leaderboard_updates?: boolean | null;
  notify_group_activity?: boolean | null;
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
      notifications_enabled: enabled,
      notify_picks_lock_reminders: enabled,
      notify_match_finalized: enabled,
      notify_leaderboard_updates: enabled,
      notify_group_activity: enabled
    },
    { onConflict: "user_id" }
  );

  if (error && isMissingNotificationPreferenceColumnError(error.message)) {
    const { error: fallbackError } = await adminSupabase.from("user_settings").upsert(
      {
        user_id: userResult.userId,
        notifications_enabled: enabled
      },
      { onConflict: "user_id" }
    );

    if (!fallbackError) {
      return {
        ok: true as const,
        notificationsEnabled: enabled,
        message: enabled ? "Notifications turned on." : "Notifications turned off."
      };
    }

    if (isMissingUserSettingsTableError(fallbackError.message)) {
      return {
        ok: false as const,
        message: "Notification preferences are not available yet. Apply the user_notifications migration first."
      };
    }

    return { ok: false as const, message: fallbackError.message };
  }

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
    message: enabled ? "Notifications turned on." : "Notifications turned off."
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
      .is("read_at", null)
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

export async function markCurrentUserNotificationsRead(notificationId?: string) {
  const userResult = await getCurrentNotificationViewerId();
  if (!userResult.ok) {
    return { ok: false as const, message: userResult.message };
  }

  const adminSupabase = createAdminClient();
  let query = adminSupabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userResult.userId)
    .is("read_at", null);

  query = notificationId?.trim() ? query.eq("id", notificationId.trim()) : query;

  const { error } = await query;

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
  const groupNamesById = await fetchGroupNamesByIds(
    adminSupabase,
    events.map((event) => event.group_id).filter(Boolean) as string[]
  );
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
        const groupName = event.group_id ? groupNamesById.get(event.group_id) ?? null : null;
        return [
          {
            user_id: event.user_id,
            event_id: event.id,
            type: "daily_winner",
            payload: {
              title: "🏆 Daily Winner",
              body: groupName ? groupName : "Global standings",
              scopeType: event.scope_type,
              groupId: event.group_id,
              groupName,
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
  commentId: string;
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
        commentId: input.commentId,
        commenterName: input.commenterName,
        commentBody: input.body,
        scopeType: input.scopeType,
        groupId: input.groupId
      }
    }
  ]);
}

export async function createTrophyEarnedNotifications(input: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  awards: Array<{
    userId: string;
    trophyId: string;
    trophyName: string;
    trophyIcon: string;
    trophyTier?: "bronze" | "silver" | "gold" | "special" | null;
    trophyDescription?: string | null;
    awardedAt: string;
    groupName?: string | null;
  }>;
}) {
  const inserts: NotificationInsert[] = input.awards.map((award) => ({
    user_id: award.userId,
    event_id: null,
    type: "trophy_earned",
    read_at: null,
    payload: {
      title: "🏆 Trophy Earned",
      body: award.groupName ? award.groupName : "Trophy earned",
      trophyId: award.trophyId,
      trophyName: award.trophyName,
      trophyIcon: award.trophyIcon,
      trophyTier: award.trophyTier ?? "special",
      trophyDescription: award.trophyDescription ?? "",
      awardedAt: award.awardedAt,
      groupName: award.groupName ?? null
    }
  }));

  await insertNotificationBatch(input.adminSupabase, inserts, { requireNotificationsEnabled: false });
}

export async function createMediaModerationNotification(input: {
  adminSupabase: ReturnType<typeof createAdminClient>;
  recipientUserIds: string[];
  targetType: MediaModerationNotificationTarget;
  targetId: string;
  status: MediaModerationNotificationStatus;
  note?: string | null;
  href?: string | null;
}) {
  const recipientUserIds = Array.from(new Set(input.recipientUserIds.map((userId) => userId.trim()).filter(Boolean)));
  if (recipientUserIds.length === 0) {
    return;
  }

  const copy = buildMediaModerationNotificationCopy({
    targetType: input.targetType,
    status: input.status,
    note: input.note
  });
  const href = normalizeNotificationHref(input.href) ?? getDefaultMediaModerationHref(input.targetType);
  const moderationKey = `${input.targetType}:${input.targetId}:${input.status}:${Date.now().toString(36)}`;

  await insertNotificationBatch(
    input.adminSupabase,
    recipientUserIds.map((userId) => ({
      user_id: userId,
      event_id: null,
      type: "media_moderation",
      read_at: null,
      payload: {
        title: copy.title,
        body: copy.body,
        targetType: input.targetType,
        targetId: input.targetId,
        status: input.status,
        note: sanitizePublicModerationNote(input.note),
        href,
        moderationKey
      }
    })),
    { requireNotificationsEnabled: false, sendPush: false }
  );
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
  inserts: NotificationInsert[],
  options?: { requireNotificationsEnabled?: boolean; sendPush?: boolean }
) {
  const uniqueInserts = dedupeNotificationInserts(inserts);
  if (uniqueInserts.length === 0) {
    return;
  }

  const requireNotificationsEnabled = options?.requireNotificationsEnabled ?? true;
  let allowedInserts = uniqueInserts;

  if (requireNotificationsEnabled) {
    const enabledNotificationSettings = await fetchEnabledNotificationSettings(
      adminSupabase,
      uniqueInserts.map((item) => item.user_id)
    );

    allowedInserts = uniqueInserts.filter((item) =>
      isNotificationTypeEnabled(enabledNotificationSettings.get(item.user_id), item.type)
    );
  }

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

  if (options?.sendPush !== false) {
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
  }

  queueNotificationDeliveryStub(newInserts);
}

async function fetchEnabledNotificationSettings(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return new Map<string, NotificationSettingRow>();
  }

  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("user_id,notifications_enabled,notify_picks_lock_reminders,notify_match_finalized,notify_leaderboard_updates,notify_group_activity")
    .in("user_id", uniqueUserIds)
    .eq("notifications_enabled", true);

  if (error && isMissingNotificationPreferenceColumnError(error.message)) {
    const fallbackResult = await adminSupabase
      .from("user_settings")
      .select("user_id,notifications_enabled")
      .in("user_id", uniqueUserIds)
      .eq("notifications_enabled", true);

    if (fallbackResult.error) {
      if (isMissingUserSettingsTableError(fallbackResult.error.message)) {
        return new Map<string, NotificationSettingRow>();
      }

      throw new Error(fallbackResult.error.message);
    }

    return new Map(
      (((fallbackResult.data as NotificationSettingRow[] | null) ?? []).map((row) => [row.user_id, row]))
    );
  }

  if (error) {
    if (isMissingUserSettingsTableError(error.message)) {
      return new Map<string, NotificationSettingRow>();
    }

    throw new Error(error.message);
  }

  return new Map((((data as NotificationSettingRow[] | null) ?? []).map((row) => [row.user_id, row])));
}

function isNotificationTypeEnabled(settings: NotificationSettingRow | undefined, type: NotificationType) {
  if (!settings?.notifications_enabled) {
    return false;
  }

  if (type === "event_comment") {
    return settings.notify_group_activity ?? true;
  }

  return settings.notify_leaderboard_updates ?? true;
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
  const userIds = Array.from(new Set(inserts.map((item) => item.user_id)));
  const types = Array.from(new Set(inserts.map((item) => item.type)));

  let query = adminSupabase
    .from("user_notifications")
    .select("user_id,event_id,type,payload")
    .in("user_id", userIds)
    .in("type", types);

  const eventBackedInserts = inserts.filter((item) => item.event_id && item.type !== "event_comment");
  const nonEventBackedTypes = new Set(
    inserts
      .filter((item) => !item.event_id || item.type === "event_comment")
      .map((item) => item.type)
  );

  if (eventBackedInserts.length > 0 && nonEventBackedTypes.size === 0) {
    const eventIds = Array.from(new Set(eventBackedInserts.map((item) => item.event_id).filter(Boolean))) as string[];
    query = query.in("event_id", eventIds);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingUserNotificationsTableError(error.message)) {
      return new Set<string>();
    }

    throw new Error(error.message);
  }

  return new Set(
    (((data as Array<{
      user_id: string;
      event_id: string | null;
      type: NotificationType;
      payload?: Record<string, unknown> | null;
    }> | null) ?? []).map(
      (row) =>
        notificationInsertKey({
          user_id: row.user_id,
          event_id: row.event_id,
          type: row.type,
          payload: row.payload ?? undefined
        })
    ))
  );
}

function notificationInsertKey(insert: {
  user_id: string;
  event_id: string | null;
  type: NotificationType;
  payload?: Record<string, unknown>;
}) {
  const commentId =
    insert.type === "event_comment" && "payload" in insert && typeof insert.payload?.commentId === "string"
      ? insert.payload.commentId
      : "none";
  const trophyId =
    insert.type === "trophy_earned" && "payload" in insert && typeof insert.payload?.trophyId === "string"
      ? insert.payload.trophyId
      : "none";
  const mediaModerationKey =
    insert.type === "media_moderation" && "payload" in insert && typeof insert.payload?.moderationKey === "string"
      ? insert.payload.moderationKey
      : "none";
  return `${insert.user_id}:${insert.event_id ?? "none"}:${insert.type}:${commentId}:${trophyId}:${mediaModerationKey}`;
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
    href: getNotificationHref(row.type, payload)
  };
}

async function fetchGroupNamesByIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(groupIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await adminSupabase.from("groups").select("id,name").in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((((data as Array<{ id: string; name: string }> | null) ?? []).map((group) => [group.id, group.name])));
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
    case "trophy_earned":
      return "🏆 Trophy Earned";
    case "media_moderation":
      return "Media status update";
    default:
      return "Leaderboard update";
  }
}

function getNotificationHref(type: NotificationType, payload: Record<string, unknown>) {
  const href = normalizeNotificationHref(typeof payload.href === "string" ? payload.href : null);
  if (href) {
    return href;
  }

  if (type === "media_moderation") {
    const targetType = typeof payload.targetType === "string" ? payload.targetType : "";
    return getDefaultMediaModerationHref(targetType as MediaModerationNotificationTarget);
  }

  return "/leaderboard";
}

function getDefaultMediaModerationHref(targetType: MediaModerationNotificationTarget) {
  if (targetType === "profile_avatar") {
    return "/profile";
  }

  return "/my-groups";
}

function buildMediaModerationNotificationCopy(input: {
  targetType: MediaModerationNotificationTarget;
  status: MediaModerationNotificationStatus;
  note?: string | null;
}) {
  const targetLabel = getMediaModerationTargetLabel(input.targetType);
  const note = sanitizePublicModerationNote(input.note);
  const reason = note ? `Reason: ${note}` : null;

  switch (input.status) {
    case "approved":
      return {
        title: `Your ${targetLabel} was approved.`,
        body: "No action needed."
      };
    case "rejected":
      return {
        title: `Your ${targetLabel} was rejected.`,
        body: reason ?? "Upload a new image when ready."
      };
    case "removed":
      return {
        title: `Your ${targetLabel} was removed.`,
        body: reason ?? "The default image is now being used."
      };
    case "disabled":
      return {
        title: `Your ${targetLabel} was disabled by Super Admin.`,
        body: reason ?? "The default image is now being used."
      };
    case "needs_revision":
      return {
        title: `Your ${targetLabel} needs revision.`,
        body: reason ?? "Update the image and submit it again."
      };
  }
}

function getMediaModerationTargetLabel(targetType: MediaModerationNotificationTarget) {
  if (targetType === "profile_avatar") {
    return "profile image";
  }

  if (targetType === "group_avatar") {
    return "group image";
  }

  return "league branding";
}

function sanitizePublicModerationNote(note?: string | null) {
  const trimmed = note?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed ? trimmed.slice(0, 180) : null;
}

function normalizeNotificationHref(href?: string | null) {
  const normalized = href?.trim() ?? "";
  return normalized.startsWith("/") && !normalized.startsWith("//") ? normalized : null;
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

function isMissingNotificationPreferenceColumnError(message: string) {
  return (
    isMissingColumnError(message, "user_settings", "notify_picks_lock_reminders") ||
    isMissingColumnError(message, "user_settings", "notify_match_finalized") ||
    isMissingColumnError(message, "user_settings", "notify_leaderboard_updates") ||
    isMissingColumnError(message, "user_settings", "notify_group_activity")
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
