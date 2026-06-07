"use client";

import { useEffect, useMemo, useState } from "react";
import {
  disableReportedGroupCommentsAction,
  dismissReportAction,
  fetchModerationReportsAction,
  markReportReviewedAction,
  neutralizeReportedDisplayNameAction,
  removeReportedCommentAction,
  resetReportedGroupAvatarAction,
  resetReportedUserAvatarAction
} from "@/app/admin/reports/actions";
import { showAppToast } from "@/lib/app-toast";
import type { UgcReportReason, UgcReportStatus, UgcReportTargetType } from "@/lib/ugc-safety";
import {
  ActionButton,
  ManagementBadge,
  ManagementCard,
  ManagementEmptyState,
  ManagementIntro
} from "@/components/player-management/Shared";

type ReportsState = Extract<Awaited<ReturnType<typeof fetchModerationReportsAction>>, { ok: true }>;

const STATUS_FILTERS: Array<UgcReportStatus | "all"> = ["open", "reviewed", "dismissed", "all"];

export function AdminReportsClient() {
  const [reportsState, setReportsState] = useState<ReportsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [notesByReportId, setNotesByReportId] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<UgcReportStatus | "all">("open");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadReports();
  }, []);

  const reports = useMemo(() => reportsState?.reports ?? [], [reportsState?.reports]);
  const visibleReports = useMemo(
    () => reports.filter((report) => statusFilter === "all" || report.status === statusFilter),
    [reports, statusFilter]
  );
  const openCount = reports.filter((report) => report.status === "open").length;

  async function loadReports() {
    setIsLoading(true);
    const result = await fetchModerationReportsAction();
    if (result.ok) {
      setReportsState(result);
      setError(null);
    } else {
      setReportsState(null);
      setError(result.message);
    }
    setIsLoading(false);
  }

  async function runReportAction(reportId: string, actionKey: string, action: (note: string) => Promise<{ ok: boolean; message: string }>) {
    const key = `${reportId}:${actionKey}`;
    setActiveKey(key);
    const note = notesByReportId[reportId] ?? "";
    const result = await action(note);
    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      await loadReports();
    }
    setActiveKey(null);
  }

  return (
    <div className="space-y-5">
      <ManagementIntro
        eyebrow="Reports"
        title="Review reports and scoped moderation."
        description="Super Admin sees all reports. Group managers and league organizers only see reports tied to groups they manage."
        statusChip={reportsState?.scopeLabel ?? "loading"}
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Open" value={openCount} tone="warning" />
        <SummaryCard label="Reviewed" value={reports.filter((report) => report.status === "reviewed").length} tone="neutral" />
        <SummaryCard label="Dismissed" value={reports.filter((report) => report.status === "dismissed").length} tone="neutral" />
        <SummaryCard label="Scope" value={reportsState?.isGlobal ? "Global" : "Scoped"} tone="accent" />
      </div>

      <ManagementCard
        title={<h3 className="text-lg font-black text-gray-950">Report queue</h3>}
        subtitle="Reports create review work only. They do not automatically punish or hide players."
      >
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
                  statusFilter === status
                    ? "border-accent bg-accent text-accent-text"
                    : "border-gray-200 bg-white text-gray-600 hover:border-accent"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-bold text-gray-600">Loading reports...</p>
          ) : null}

          {!isLoading && visibleReports.length === 0 ? (
            <ManagementEmptyState message="No reports in this view. Reports will appear here when players submit a safety report inside your moderation scope." />
          ) : null}

          {visibleReports.map((report) => {
            const note = notesByReportId[report.id] ?? "";
            return (
              <article key={report.id} className="rounded-[1rem] border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ManagementBadge label={getTargetTypeLabel(report.targetType)} tone="neutral" />
                      <ManagementBadge label={report.status} tone={getStatusTone(report.status)} />
                      {report.groupName ? <ManagementBadge label={report.groupName} tone="accent" /> : null}
                    </div>
                    <h4 className="mt-2 text-base font-black text-gray-950">{report.targetSummary}</h4>
                    <p className="mt-1 text-sm font-semibold text-gray-600">
                      Reported by {report.reporterName} · {getReasonLabel(report.reason)} · {formatDate(report.createdAt)}
                    </p>
                    {report.details ? <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">{report.details}</p> : null}
                    {report.contextUrl ? (
                      <p className="mt-2 truncate text-xs font-semibold text-gray-500">Context: {report.contextUrl}</p>
                    ) : null}
                    {report.moderationNote ? (
                      <p className="mt-2 text-xs font-bold text-gray-500">
                        Note: {report.moderationNote}
                        {report.reviewedByName ? ` · ${report.reviewedByName}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                <label className="mt-4 block">
                  <span className="text-xs font-black uppercase tracking-wide text-gray-500">Moderation note</span>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(event) =>
                      setNotesByReportId((current) => ({ ...current, [report.id]: event.target.value }))
                    }
                    maxLength={500}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                    placeholder="Optional note for the audit trail"
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    disabled={activeKey === `${report.id}:review`}
                    onClick={() => void runReportAction(report.id, "review", (nextNote) => markReportReviewedAction(report.id, nextNote))}
                  >
                    {activeKey === `${report.id}:review` ? "Saving..." : "Mark reviewed"}
                  </ActionButton>
                  <ActionButton
                    disabled={activeKey === `${report.id}:dismiss`}
                    onClick={() => void runReportAction(report.id, "dismiss", (nextNote) => dismissReportAction(report.id, nextNote))}
                  >
                    {activeKey === `${report.id}:dismiss` ? "Dismissing..." : "Dismiss"}
                  </ActionButton>
                  {report.groupId || report.targetType === "group" ? (
                    <>
                      <ActionButton
                        disabled={activeKey === `${report.id}:disable-comments`}
                        onClick={() =>
                          void runReportAction(report.id, "disable-comments", (nextNote) =>
                            disableReportedGroupCommentsAction(report.id, nextNote)
                          )
                        }
                      >
                        {activeKey === `${report.id}:disable-comments` ? "Disabling..." : "Disable comments"}
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        disabled={activeKey === `${report.id}:group-avatar`}
                        onClick={() =>
                          void runReportAction(report.id, "group-avatar", (nextNote) =>
                            resetReportedGroupAvatarAction(report.id, nextNote)
                          )
                        }
                      >
                        {activeKey === `${report.id}:group-avatar` ? "Resetting..." : "Reset group avatar"}
                      </ActionButton>
                    </>
                  ) : null}
                  {report.targetType === "comment" ? (
                    <ActionButton
                      tone="danger"
                      disabled={activeKey === `${report.id}:comment`}
                      onClick={() =>
                        void runReportAction(report.id, "comment", (nextNote) =>
                          removeReportedCommentAction(report.id, nextNote)
                        )
                      }
                    >
                      {activeKey === `${report.id}:comment` ? "Removing..." : "Remove comment"}
                    </ActionButton>
                  ) : null}
                  {reportsState?.isGlobal && (report.targetType === "user" || report.targetType === "image_avatar") ? (
                    <>
                      <ActionButton
                        tone="danger"
                        disabled={activeKey === `${report.id}:avatar`}
                        onClick={() =>
                          void runReportAction(report.id, "avatar", (nextNote) =>
                            resetReportedUserAvatarAction(report.id, nextNote)
                          )
                        }
                      >
                        {activeKey === `${report.id}:avatar` ? "Resetting..." : "Reset avatar"}
                      </ActionButton>
                      <ActionButton
                        tone="danger"
                        disabled={activeKey === `${report.id}:name`}
                        onClick={() =>
                          void runReportAction(report.id, "name", (nextNote) =>
                            neutralizeReportedDisplayNameAction(report.id, nextNote)
                          )
                        }
                      >
                        {activeKey === `${report.id}:name` ? "Updating..." : "Neutralize name"}
                      </ActionButton>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </ManagementCard>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string | number;
  tone: "accent" | "warning" | "neutral";
}) {
  const toneClassName =
    tone === "accent"
      ? "border-accent-light bg-accent-light/50 text-accent-dark"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-gray-200 bg-white text-gray-800";

  return (
    <div className={`rounded-[1rem] border p-4 ${toneClassName}`}>
      <p className="text-xs font-black uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function getStatusTone(status: UgcReportStatus) {
  if (status === "open") {
    return "warning";
  }

  if (status === "dismissed") {
    return "danger";
  }

  return "neutral";
}

function getTargetTypeLabel(targetType: UgcReportTargetType) {
  switch (targetType) {
    case "image_avatar":
      return "image/avatar";
    default:
      return targetType;
  }
}

function getReasonLabel(reason: UgcReportReason) {
  return reason.replace(/_/g, " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
