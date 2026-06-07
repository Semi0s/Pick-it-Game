"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { showAppToast } from "@/lib/app-toast";
import type { UgcReportReason, UgcReportTargetType } from "@/lib/ugc-safety";

export type ReportTargetOption = {
  type: UgcReportTargetType;
  id: string;
  label: string;
  groupId?: string | null;
  canBlock?: boolean;
};

type ReportBlockDialogProps = {
  open: boolean;
  title?: string;
  targets: ReportTargetOption[];
  initialTargetId?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

const REPORT_REASON_OPTIONS: Array<{ value: UgcReportReason; label: string }> = [
  { value: "abusive_or_harassing", label: "Abusive or harassing" },
  { value: "inappropriate_image_or_name", label: "Inappropriate image/name" },
  { value: "spam_or_scam", label: "Spam or scam" },
  { value: "impersonation", label: "Impersonation" },
  { value: "cheating_or_tampering", label: "Cheating/tampering concern" },
  { value: "other", label: "Other" }
];

export function ReportBlockDialog({
  open,
  title = "Report / block",
  targets,
  initialTargetId,
  onClose,
  onSubmitted
}: ReportBlockDialogProps) {
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [reason, setReason] = useState<UgcReportReason>("abusive_or_harassing");
  const [details, setDetails] = useState("");
  const [shouldBlock, setShouldBlock] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetOptions = useMemo(
    () => targets.map((target) => ({ ...target, key: getTargetKey(target) })),
    [targets]
  );
  const selectedTarget = targetOptions.find((target) => target.key === selectedTargetKey) ?? targetOptions[0] ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const preferredTarget =
      targetOptions.find((target) => target.id === initialTargetId) ??
      targetOptions[0] ??
      null;
    setSelectedTargetKey(preferredTarget ? preferredTarget.key : "");
    setReason("abusive_or_harassing");
    setDetails("");
    setShouldBlock(false);
  }, [initialTargetId, open, targetOptions]);

  if (!open) {
    return null;
  }

  async function handleSubmit() {
    if (!selectedTarget) {
      showAppToast({ tone: "error", text: "Choose what you are reporting." });
      return;
    }

    setIsSubmitting(true);
    try {
      const reportResponse = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: selectedTarget.type,
          targetId: selectedTarget.id,
          groupId: selectedTarget.groupId ?? null,
          reason,
          details,
          contextUrl: typeof window !== "undefined" ? window.location.pathname + window.location.search : null
        })
      });
      const reportResult = (await reportResponse.json()) as { ok: boolean; message?: string };
      if (!reportResponse.ok || !reportResult.ok) {
        throw new Error(reportResult.message ?? "Could not submit that report.");
      }

      if (shouldBlock && selectedTarget.type === "user") {
        const blockResponse = await fetch("/api/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: selectedTarget.id })
        });
        const blockResult = (await blockResponse.json()) as { ok: boolean; message?: string };
        if (!blockResponse.ok || !blockResult.ok) {
          throw new Error(blockResult.message ?? "Report submitted, but the player could not be muted.");
        }
      }

      showAppToast({ tone: "success", text: shouldBlock && selectedTarget.type === "user" ? "Report submitted and player muted." : "Report submitted." });
      onSubmitted?.();
      onClose();
    } catch (error) {
      showAppToast({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not submit that report."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-gray-950/45 px-3 py-4 sm:items-center">
      <div className="w-full max-w-lg rounded-[1.25rem] border border-gray-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-accent-dark">Safety</p>
            <h2 className="mt-1 text-xl font-black text-gray-950">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-600">
              Reports go to moderators. The reported player is not notified.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            aria-label="Close report dialog"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-gray-500">Target</span>
            <select
              value={selectedTargetKey}
              onChange={(event) => {
                setSelectedTargetKey(event.target.value);
                setShouldBlock(false);
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-bold text-gray-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              {targetOptions.map((target) => (
                <option key={target.key} value={target.key}>
                  {target.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-gray-500">Reason</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as UgcReportReason)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-bold text-gray-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              {REPORT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-gray-500">Details optional</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              placeholder="Add context for moderators."
            />
          </label>

          {selectedTarget?.type === "user" && selectedTarget.canBlock ? (
            <label className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-3">
              <input
                type="checkbox"
                checked={shouldBlock}
                onChange={(event) => setShouldBlock(event.target.checked)}
                className="mt-1"
              />
              <span className="text-sm font-semibold text-gray-700">
                Also mute this player’s social content for me. Scores, ranks, and group membership stay unchanged.
              </span>
            </label>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || !selectedTarget}
            className="rounded-lg bg-accent px-4 py-3 text-sm font-bold text-accent-text hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isSubmitting ? "Submitting..." : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getTargetKey(target: ReportTargetOption) {
  return `${target.type}:${target.id}:${target.groupId ?? "global"}`;
}
