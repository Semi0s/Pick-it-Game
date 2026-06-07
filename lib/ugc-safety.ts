import { fetchBooleanAppSetting } from "@/lib/app-settings";
import { isMissingColumnError, isMissingRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { hasManagerAccess, resolveAccessLevel, type AccessLevel, type PlatformRole } from "@/lib/tier-access";
export { shouldIncludeLeaderboardComments } from "@/lib/ugc-safety-policy";

export const UGC_REPORT_TARGET_TYPES = ["user", "group", "image_avatar", "comment", "reaction", "other"] as const;
export type UgcReportTargetType = (typeof UGC_REPORT_TARGET_TYPES)[number];

export const UGC_REPORT_REASONS = [
  "abusive_or_harassing",
  "inappropriate_image_or_name",
  "spam_or_scam",
  "impersonation",
  "cheating_or_tampering",
  "other"
] as const;
export type UgcReportReason = (typeof UGC_REPORT_REASONS)[number];

export type UgcReportStatus = "open" | "reviewed" | "dismissed";

export type SubmitUgcReportInput = {
  targetType: UgcReportTargetType;
  targetId: string;
  groupId?: string | null;
  reason: UgcReportReason;
  details?: string | null;
  contextUrl?: string | null;
};

export type UgcReportSummary = {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: UgcReportTargetType;
  targetId: string;
  targetSummary: string;
  groupId: string | null;
  groupName: string | null;
  reason: UgcReportReason;
  details: string | null;
  status: UgcReportStatus;
  moderationNote: string | null;
  contextUrl: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
};

export type RecordReportModerationActionInput = {
  adminSupabase: ReturnType<typeof createAdminClient>;
  reportId: string;
  actorUserId: string | null;
  actionType: string;
  oldStatus?: UgcReportStatus | null;
  newStatus?: UgcReportStatus | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
};

export type ModerationScope =
  | { ok: true; userId: string; accessLevel: AccessLevel; isGlobal: boolean; groupIds: string[] }
  | { ok: false; message: string };

type UserReportRow = {
  id: string;
  reporter_id: string;
  target_type: UgcReportTargetType;
  target_id: string;
  group_id?: string | null;
  reason: UgcReportReason;
  details?: string | null;
  status: UgcReportStatus;
  moderation_note?: string | null;
  context_url?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

type GroupRow = {
  id: string;
  name: string;
};

type UserRow = {
  id: string;
  name: string;
  email?: string | null;
};

const REPORT_DETAILS_MAX_LENGTH = 1000;
const REPORT_NOTE_MAX_LENGTH = 500;
const REPORT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_RATE_LIMIT_MAX = 5;

export async function submitUgcReport(input: SubmitUgcReportInput): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const reporter = await getCurrentUserId("report content");
  if (!reporter.ok) {
    return reporter;
  }

  const targetType = normalizeReportTargetType(input.targetType);
  if (!targetType) {
    return { ok: false, message: "Choose what you are reporting." };
  }

  const reason = normalizeReportReason(input.reason);
  if (!reason) {
    return { ok: false, message: "Choose a report reason." };
  }

  const targetId = normalizeShortText(input.targetId, 120);
  if (!targetId) {
    return { ok: false, message: "Choose a report target." };
  }

  if (targetType === "user" && targetId === reporter.userId) {
    return { ok: false, message: "You cannot report yourself." };
  }

  const adminSupabase = createAdminClient();
  const rateLimitResult = await enforceReportRateLimit(adminSupabase, reporter.userId);
  if (!rateLimitResult.ok) {
    return rateLimitResult;
  }

  const existingResult = await findOpenDuplicateReport(adminSupabase, reporter.userId, targetType, targetId);
  if (!existingResult.ok) {
    return existingResult;
  }
  if (existingResult.exists) {
    return { ok: true, message: "You already reported this. A moderator can review it." };
  }

  const { error } = await adminSupabase.from("user_reports").insert({
    reporter_id: reporter.userId,
    target_type: targetType,
    target_id: targetId,
    group_id: normalizeUuidLike(input.groupId),
    reason,
    details: normalizeOptionalText(input.details, REPORT_DETAILS_MAX_LENGTH),
    context_url: normalizeOptionalText(input.contextUrl, 400),
    status: "open"
  });

  if (error) {
    if (isMissingReportsTableError(error.message)) {
      return { ok: false, message: "Reports are not available yet. Apply the UGC safety migration first." };
    }

    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Report submitted. A moderator can review it." };
}

export async function blockUser(targetUserId: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const blocker = await getCurrentUserId("block a player");
  if (!blocker.ok) {
    return blocker;
  }

  const blockedId = normalizeUuidLike(targetUserId);
  if (!blockedId) {
    return { ok: false, message: "Choose a player to block." };
  }

  if (blockedId === blocker.userId) {
    return { ok: false, message: "You cannot block yourself." };
  }

  const adminSupabase = createAdminClient();
  const { data: targetUser, error: targetError } = await adminSupabase
    .from("users")
    .select("id")
    .eq("id", blockedId)
    .maybeSingle();

  if (targetError || !targetUser) {
    return { ok: false, message: targetError?.message ?? "That player could not be found." };
  }

  const { error } = await adminSupabase.from("user_blocks").upsert(
    {
      blocker_id: blocker.userId,
      blocked_user_id: blockedId
    },
    { onConflict: "blocker_id,blocked_user_id", ignoreDuplicates: true }
  );

  if (error) {
    if (isMissingBlocksTableError(error.message)) {
      return { ok: false, message: "Blocking is not available yet. Apply the UGC safety migration first." };
    }

    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Player muted. Scores and ranks are unchanged." };
}

export async function unblockUser(targetUserId: string): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const blocker = await getCurrentUserId("unblock a player");
  if (!blocker.ok) {
    return blocker;
  }

  const blockedId = normalizeUuidLike(targetUserId);
  if (!blockedId) {
    return { ok: false, message: "Choose a player to unblock." };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", blocker.userId)
    .eq("blocked_user_id", blockedId);

  if (error) {
    if (isMissingBlocksTableError(error.message)) {
      return { ok: false, message: "Blocking is not available yet. Apply the UGC safety migration first." };
    }

    return { ok: false, message: error.message };
  }

  return { ok: true, message: "Player unmuted." };
}

export async function fetchBlockedUserIds(
  adminSupabase: ReturnType<typeof createAdminClient>,
  blockerId?: string | null
): Promise<Set<string>> {
  if (!blockerId) {
    return new Set();
  }

  const { data, error } = await adminSupabase
    .from("user_blocks")
    .select("blocked_user_id")
    .eq("blocker_id", blockerId);

  if (error) {
    if (isMissingBlocksTableError(error.message)) {
      warnOptionalFeatureOnce(
        "user-blocks-missing",
        "User block filtering is unavailable until the UGC safety migration is applied.",
        error.message
      );
      return new Set();
    }

    throw new Error(error.message);
  }

  return new Set(((data as Array<{ blocked_user_id: string }> | null) ?? []).map((row) => row.blocked_user_id));
}

export async function getCurrentModerationScope(): Promise<ModerationScope> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in to review reports." };
  }

  const adminSupabase = createAdminClient();
  const { data: profile, error: profileError } = await adminSupabase
    .from("users")
    .select("id,role,plan_tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { ok: false, message: profileError?.message ?? "Your profile could not be loaded." };
  }

  const accessLevel = resolveAccessLevel({
    role: (profile as { role?: PlatformRole | null }).role,
    planTier: (profile as { plan_tier?: string | null }).plan_tier ?? null
  });

  if (accessLevel === "super_admin") {
    return { ok: true, userId: user.id, accessLevel, isGlobal: true, groupIds: [] };
  }

  if (!hasManagerAccess(accessLevel)) {
    return { ok: false, message: "You do not have a moderation scope." };
  }

  const [ownedGroupsResult, managedGroupsResult] = await Promise.all([
    adminSupabase.from("groups").select("id").eq("owner_user_id", user.id),
    adminSupabase.from("group_members").select("group_id").eq("user_id", user.id).eq("role", "manager")
  ]);

  if (ownedGroupsResult.error) {
    return { ok: false, message: ownedGroupsResult.error.message };
  }

  if (managedGroupsResult.error) {
    return { ok: false, message: managedGroupsResult.error.message };
  }

  const groupIds = Array.from(
    new Set([
      ...(((ownedGroupsResult.data as Array<{ id: string }> | null) ?? []).map((row) => row.id)),
      ...(((managedGroupsResult.data as Array<{ group_id: string }> | null) ?? []).map((row) => row.group_id))
    ])
  );

  if (groupIds.length === 0) {
    return { ok: false, message: "You do not have a moderation scope." };
  }

  return { ok: true, userId: user.id, accessLevel, isGlobal: false, groupIds };
}

export async function fetchReportsForModeration(): Promise<
  | { ok: true; reports: UgcReportSummary[]; scope: Extract<ModerationScope, { ok: true }> }
  | { ok: false; message: string }
> {
  const scope = await getCurrentModerationScope();
  if (!scope.ok) {
    return scope;
  }

  const adminSupabase = createAdminClient();
  let query = adminSupabase
    .from("user_reports")
    .select("id,reporter_id,target_type,target_id,group_id,reason,details,status,moderation_note,context_url,created_at,reviewed_at,reviewed_by")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!scope.isGlobal) {
    query = query.in("group_id", scope.groupIds);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingReportsTableError(error.message)) {
      return { ok: true, reports: [], scope };
    }

    return { ok: false, message: error.message };
  }

  const rows = (data as UserReportRow[] | null) ?? [];
  const summaries = await buildReportSummaries(adminSupabase, rows);
  return { ok: true, reports: summaries, scope };
}

export async function updateReportReviewStatus(
  reportId: string,
  status: Extract<UgcReportStatus, "reviewed" | "dismissed">,
  note?: string | null
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const access = await requireReportModerationAccess(reportId);
  if (!access.ok) {
    return access;
  }

  const { adminSupabase, scope } = access;
  const logResult = await recordReportModerationAction({
    adminSupabase,
    reportId,
    actorUserId: scope.userId,
    actionType: status === "dismissed" ? "dismiss_report" : "mark_report_reviewed",
    oldStatus: access.report.status,
    newStatus: status,
    note
  });
  if (!logResult.ok) {
    return logResult;
  }

  const { error } = await adminSupabase
    .from("user_reports")
    .update({
      status,
      moderation_note: normalizeOptionalText(note, REPORT_NOTE_MAX_LENGTH),
      reviewed_by: scope.userId,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", reportId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, message: status === "dismissed" ? "Report dismissed." : "Report marked reviewed." };
}

export async function recordReportModerationAction({
  adminSupabase,
  reportId,
  actorUserId,
  actionType,
  oldStatus,
  newStatus,
  note,
  metadata
}: RecordReportModerationActionInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const normalizedActionType = normalizeShortText(actionType, 80);
  if (!normalizedActionType) {
    return { ok: false, message: "Moderation action type is required." };
  }

  const { error } = await adminSupabase.from("user_report_actions").insert({
    report_id: reportId,
    actor_user_id: actorUserId,
    action_type: normalizedActionType,
    old_status: oldStatus ?? null,
    new_status: newStatus ?? null,
    note: normalizeOptionalText(note, REPORT_NOTE_MAX_LENGTH),
    metadata: metadata ?? {}
  });

  if (error) {
    if (isMissingRelationError(error.message, "user_report_actions")) {
      return { ok: false, message: "Report action logging is not available yet. Apply the UGC safety migration first." };
    }

    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export async function requireReportModerationAccess(reportId: string): Promise<
  | {
      ok: true;
      adminSupabase: ReturnType<typeof createAdminClient>;
      scope: Extract<ModerationScope, { ok: true }>;
      report: UserReportRow;
    }
  | { ok: false; message: string }
> {
  const scope = await getCurrentModerationScope();
  if (!scope.ok) {
    return scope;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("user_reports")
    .select("id,reporter_id,target_type,target_id,group_id,reason,details,status,moderation_note,context_url,created_at,reviewed_at,reviewed_by")
    .eq("id", reportId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "That report could not be found." };
  }

  const report = data as UserReportRow;
  if (!scope.isGlobal && (!report.group_id || !scope.groupIds.includes(report.group_id))) {
    return { ok: false, message: "That report is outside your moderation scope." };
  }

  return { ok: true, adminSupabase, scope, report };
}

export async function areLeaderboardCommentsEnabledForScope(
  scopeType: "global" | "group",
  groupId?: string | null
) {
  const globalEnabled = await fetchBooleanAppSetting("leaderboard_comments_enabled", false);
  if (!globalEnabled) {
    return false;
  }

  if (scopeType !== "group" || !groupId) {
    return false;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("groups")
    .select("comments_enabled")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error.message, "groups", "comments_enabled")) {
      warnOptionalFeatureOnce(
        "group-comments-enabled-missing",
        "Group-level comments are unavailable until the UGC safety migration is applied.",
        error.message
      );
      return false;
    }

    throw new Error(error.message);
  }

  return Boolean((data as { comments_enabled?: boolean | null } | null)?.comments_enabled);
}

async function buildReportSummaries(
  adminSupabase: ReturnType<typeof createAdminClient>,
  rows: UserReportRow[]
): Promise<UgcReportSummary[]> {
  const userIds = new Set<string>();
  const groupIds = new Set<string>();
  const commentIds: string[] = [];

  for (const row of rows) {
    userIds.add(row.reporter_id);
    if (row.reviewed_by) {
      userIds.add(row.reviewed_by);
    }
    if (row.target_type === "user" || row.target_type === "image_avatar") {
      userIds.add(row.target_id);
    }
    if (row.group_id) {
      groupIds.add(row.group_id);
    }
    if (row.target_type === "group") {
      groupIds.add(row.target_id);
    }
    if (row.target_type === "comment") {
      commentIds.push(row.target_id);
    }
  }

  const [usersById, groupsById, commentsById] = await Promise.all([
    fetchUsersByIds(adminSupabase, Array.from(userIds)),
    fetchGroupsByIds(adminSupabase, Array.from(groupIds)),
    fetchCommentsByIds(adminSupabase, commentIds)
  ]);

  return rows.map((row) => {
    const reporter = usersById.get(row.reporter_id);
    const reviewedBy = row.reviewed_by ? usersById.get(row.reviewed_by) : null;
    const group = row.group_id ? groupsById.get(row.group_id) : null;

    return {
      id: row.id,
      reporterId: row.reporter_id,
      reporterName: reporter?.name ?? "Player",
      targetType: row.target_type,
      targetId: row.target_id,
      targetSummary: getTargetSummary(row, usersById, groupsById, commentsById),
      groupId: row.group_id ?? null,
      groupName: group?.name ?? null,
      reason: row.reason,
      details: row.details ?? null,
      status: row.status,
      moderationNote: row.moderation_note ?? null,
      contextUrl: row.context_url ?? null,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at ?? null,
      reviewedByName: reviewedBy?.name ?? null
    };
  });
}

async function fetchUsersByIds(adminSupabase: ReturnType<typeof createAdminClient>, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, UserRow>();
  }

  const { data, error } = await adminSupabase.from("users").select("id,name").in("id", uniqueIds);
  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data as UserRow[] | null) ?? []).map((row) => [row.id, row]));
}

async function fetchGroupsByIds(adminSupabase: ReturnType<typeof createAdminClient>, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, GroupRow>();
  }

  const { data, error } = await adminSupabase.from("groups").select("id,name").in("id", uniqueIds);
  if (error) {
    throw new Error(error.message);
  }

  return new Map(((data as GroupRow[] | null) ?? []).map((row) => [row.id, row]));
}

async function fetchCommentsByIds(adminSupabase: ReturnType<typeof createAdminClient>, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map<string, { id: string; body: string; user_id: string }>();
  }

  const { data, error } = await adminSupabase
    .from("leaderboard_event_comments")
    .select("id,body,user_id")
    .in("id", uniqueIds);

  if (error) {
    if (isMissingRelationError(error.message, "leaderboard_event_comments")) {
      return new Map();
    }
    throw new Error(error.message);
  }

  return new Map(
    ((data as Array<{ id: string; body: string; user_id: string }> | null) ?? []).map((row) => [row.id, row])
  );
}

function getTargetSummary(
  row: UserReportRow,
  usersById: Map<string, UserRow>,
  groupsById: Map<string, GroupRow>,
  commentsById: Map<string, { id: string; body: string; user_id: string }>
) {
  if (row.target_type === "user" || row.target_type === "image_avatar") {
    return usersById.get(row.target_id)?.name ?? "Player";
  }

  if (row.target_type === "group") {
    return groupsById.get(row.target_id)?.name ?? "Group";
  }

  if (row.target_type === "comment") {
    const comment = commentsById.get(row.target_id);
    return comment ? `Comment: ${comment.body.slice(0, 80)}` : "Comment";
  }

  if (row.target_type === "reaction") {
    return "Leaderboard reaction";
  }

  return row.target_id === "page" ? "Page/context report" : row.target_id;
}

async function getCurrentUserId(actionLabel: string): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: `You must be signed in to ${actionLabel}.` };
  }

  return { ok: true, userId: user.id };
}

async function enforceReportRateLimit(adminSupabase: ReturnType<typeof createAdminClient>, reporterId: string) {
  const windowStart = new Date(Date.now() - REPORT_RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await adminSupabase
    .from("user_reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", reporterId)
    .gte("created_at", windowStart);

  if (error) {
    if (isMissingReportsTableError(error.message)) {
      return { ok: true as const };
    }
    return { ok: false as const, message: error.message };
  }

  if ((count ?? 0) >= REPORT_RATE_LIMIT_MAX) {
    return { ok: false as const, message: "You have submitted several reports recently. Please wait before sending another." };
  }

  return { ok: true as const };
}

async function findOpenDuplicateReport(
  adminSupabase: ReturnType<typeof createAdminClient>,
  reporterId: string,
  targetType: UgcReportTargetType,
  targetId: string
) {
  const { data, error } = await adminSupabase
    .from("user_reports")
    .select("id")
    .eq("reporter_id", reporterId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .in("status", ["open"])
    .limit(1);

  if (error) {
    if (isMissingReportsTableError(error.message)) {
      return { ok: true as const, exists: false };
    }
    return { ok: false as const, message: error.message };
  }

  return { ok: true as const, exists: ((data as Array<{ id: string }> | null) ?? []).length > 0 };
}

function normalizeReportTargetType(value: unknown): UgcReportTargetType | null {
  return UGC_REPORT_TARGET_TYPES.includes(value as UgcReportTargetType) ? (value as UgcReportTargetType) : null;
}

function normalizeReportReason(value: unknown): UgcReportReason | null {
  return UGC_REPORT_REASONS.includes(value as UgcReportReason) ? (value as UgcReportReason) : null;
}

function normalizeShortText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const normalized = normalizeShortText(value, maxLength);
  return normalized || null;
}

function normalizeUuidLike(value: unknown) {
  const normalized = normalizeShortText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function isMissingReportsTableError(message: string) {
  return isMissingRelationError(message, "user_reports");
}

function isMissingBlocksTableError(message: string) {
  return isMissingRelationError(message, "user_blocks");
}
