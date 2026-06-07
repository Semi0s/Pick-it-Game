"use server";

import { revalidatePath } from "next/cache";
import { removeUserAvatarAsAdminAction } from "@/app/admin/media/actions";
import {
  fetchReportsForModeration,
  recordReportModerationAction,
  requireReportModerationAccess,
  updateReportReviewStatus,
  type UgcReportSummary
} from "@/lib/ugc-safety";

const GROUP_AVATAR_BUCKET = "group-avatars";

export type FetchModerationReportsResult =
  | {
      ok: true;
      reports: UgcReportSummary[];
      scopeLabel: string;
      isGlobal: boolean;
    }
  | { ok: false; message: string };

export type ModerationReportActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function fetchModerationReportsAction(): Promise<FetchModerationReportsResult> {
  const result = await fetchReportsForModeration();
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    reports: result.reports,
    scopeLabel: result.scope.isGlobal
      ? "Global report queue"
      : `Scoped report queue: ${result.scope.groupIds.length} managed group${result.scope.groupIds.length === 1 ? "" : "s"}`,
    isGlobal: result.scope.isGlobal
  };
}

export async function markReportReviewedAction(reportId: string, note: string): Promise<ModerationReportActionResult> {
  const result = await updateReportReviewStatus(reportId, "reviewed", note);
  revalidatePath("/admin/reports");
  return result;
}

export async function dismissReportAction(reportId: string, note: string): Promise<ModerationReportActionResult> {
  const result = await updateReportReviewStatus(reportId, "dismissed", note);
  revalidatePath("/admin/reports");
  return result;
}

export async function disableReportedGroupCommentsAction(reportId: string, note: string): Promise<ModerationReportActionResult> {
  const access = await requireReportModerationAccess(reportId);
  if (!access.ok) {
    return access;
  }

  const groupId = access.report.group_id ?? (access.report.target_type === "group" ? access.report.target_id : null);
  if (!groupId) {
    return { ok: false, message: "This report is not tied to a group." };
  }

  const { error } = await access.adminSupabase
    .from("groups")
    .update({ comments_enabled: false, updated_at: new Date().toISOString() })
    .eq("id", groupId);

  if (error) {
    return { ok: false, message: error.message };
  }

  const logResult = await recordReportModerationAction({
    adminSupabase: access.adminSupabase,
    reportId,
    actorUserId: access.scope.userId,
    actionType: "disable_group_comments",
    oldStatus: access.report.status,
    newStatus: "reviewed",
    note: note || "Group comments disabled.",
    metadata: { groupId }
  });
  if (!logResult.ok) {
    return logResult;
  }

  await updateReportReviewStatus(reportId, "reviewed", note || "Group comments disabled.");
  revalidatePath("/admin/reports");
  revalidatePath("/leaderboard");
  return { ok: true, message: "Group comments disabled." };
}

export async function removeReportedCommentAction(reportId: string, note: string): Promise<ModerationReportActionResult> {
  const access = await requireReportModerationAccess(reportId);
  if (!access.ok) {
    return access;
  }

  if (access.report.target_type !== "comment") {
    return { ok: false, message: "This report is not tied to a comment." };
  }

  const { error } = await access.adminSupabase
    .from("leaderboard_event_comments")
    .update({ is_deleted: true })
    .eq("id", access.report.target_id);

  if (error) {
    return { ok: false, message: error.message };
  }

  const logResult = await recordReportModerationAction({
    adminSupabase: access.adminSupabase,
    reportId,
    actorUserId: access.scope.userId,
    actionType: "remove_comment",
    oldStatus: access.report.status,
    newStatus: "reviewed",
    note: note || "Comment removed.",
    metadata: { commentId: access.report.target_id }
  });
  if (!logResult.ok) {
    return logResult;
  }

  await updateReportReviewStatus(reportId, "reviewed", note || "Comment removed.");
  revalidatePath("/admin/reports");
  revalidatePath("/leaderboard");
  return { ok: true, message: "Comment removed." };
}

export async function resetReportedGroupAvatarAction(reportId: string, note: string): Promise<ModerationReportActionResult> {
  const access = await requireReportModerationAccess(reportId);
  if (!access.ok) {
    return access;
  }

  const groupId = access.report.group_id ?? (access.report.target_type === "group" ? access.report.target_id : null);
  if (!groupId) {
    return { ok: false, message: "This report is not tied to a group avatar." };
  }

  const { error } = await access.adminSupabase
    .from("groups")
    .update({ avatar_url: null, updated_at: new Date().toISOString() })
    .eq("id", groupId);

  if (error) {
    return { ok: false, message: error.message };
  }

  const { data: objects, error: listError } = await access.adminSupabase.storage
    .from(GROUP_AVATAR_BUCKET)
    .list(groupId, { limit: 100 });

  if (!listError && objects && objects.length > 0) {
    await access.adminSupabase.storage
      .from(GROUP_AVATAR_BUCKET)
      .remove(objects.map((item) => `${groupId}/${item.name}`));
  }

  const logResult = await recordReportModerationAction({
    adminSupabase: access.adminSupabase,
    reportId,
    actorUserId: access.scope.userId,
    actionType: "reset_group_avatar",
    oldStatus: access.report.status,
    newStatus: "reviewed",
    note: note || "Group avatar reset.",
    metadata: { groupId }
  });
  if (!logResult.ok) {
    return logResult;
  }

  await updateReportReviewStatus(reportId, "reviewed", note || "Group avatar reset.");
  revalidatePath("/admin/reports");
  return { ok: true, message: "Group avatar reset." };
}

export async function resetReportedUserAvatarAction(reportId: string, note: string): Promise<ModerationReportActionResult> {
  const access = await requireReportModerationAccess(reportId);
  if (!access.ok) {
    return access;
  }

  if (!access.scope.isGlobal) {
    return { ok: false, message: "Only Super Admins can reset player avatars globally." };
  }

  if (access.report.target_type !== "user" && access.report.target_type !== "image_avatar") {
    return { ok: false, message: "This report is not tied to a player avatar." };
  }

  const result = await removeUserAvatarAsAdminAction(access.report.target_id, note || "Reset from report queue.");
  if (!result.ok) {
    return result;
  }

  const logResult = await recordReportModerationAction({
    adminSupabase: access.adminSupabase,
    reportId,
    actorUserId: access.scope.userId,
    actionType: "reset_user_avatar",
    oldStatus: access.report.status,
    newStatus: "reviewed",
    note: note || "Player avatar reset.",
    metadata: { userId: access.report.target_id }
  });
  if (!logResult.ok) {
    return logResult;
  }

  await updateReportReviewStatus(reportId, "reviewed", note || "Player avatar reset.");
  revalidatePath("/admin/reports");
  return { ok: true, message: "Player avatar reset." };
}

export async function neutralizeReportedDisplayNameAction(reportId: string, note: string): Promise<ModerationReportActionResult> {
  const access = await requireReportModerationAccess(reportId);
  if (!access.ok) {
    return access;
  }

  if (!access.scope.isGlobal) {
    return { ok: false, message: "Only Super Admins can neutralize player display names globally." };
  }

  if (access.report.target_type !== "user" && access.report.target_type !== "image_avatar") {
    return { ok: false, message: "This report is not tied to a player." };
  }

  const { error } = await access.adminSupabase
    .from("users")
    .update({ name: "PICK-IT Player", updated_at: new Date().toISOString() })
    .eq("id", access.report.target_id);

  if (error) {
    return { ok: false, message: error.message };
  }

  const logResult = await recordReportModerationAction({
    adminSupabase: access.adminSupabase,
    reportId,
    actorUserId: access.scope.userId,
    actionType: "neutralize_display_name",
    oldStatus: access.report.status,
    newStatus: "reviewed",
    note: note || "Display name neutralized.",
    metadata: { userId: access.report.target_id }
  });
  if (!logResult.ok) {
    return logResult;
  }

  await updateReportReviewStatus(reportId, "reviewed", note || "Display name neutralized.");
  revalidatePath("/admin/reports");
  revalidatePath("/leaderboard");
  return { ok: true, message: "Display name neutralized." };
}
