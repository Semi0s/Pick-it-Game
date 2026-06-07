"use client";

import { useEffect, useMemo, useState } from "react";
import {
  approveOrganizationBrandingFromMediaAction,
  disableOrganizationBrandingFromMediaAction,
  fetchAdminMediaReviewAction,
  rejectOrganizationBrandingFromMediaAction,
  removeGroupAvatarAsAdminAction,
  removeUserAvatarAsAdminAction,
  type AdminAvatarMediaItem
} from "@/app/admin/media/actions";
import { showAppToast } from "@/lib/app-toast";
import {
  ActionButton,
  ManagementBadge,
  ManagementCard,
  ManagementEmptyState,
  ManagementIntro
} from "@/components/player-management/Shared";

type AdminMediaState = Extract<Awaited<ReturnType<typeof fetchAdminMediaReviewAction>>, { ok: true }>;

export function AdminMediaClient() {
  const [mediaState, setMediaState] = useState<AdminMediaState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadMedia();
  }, []);

  async function loadMedia() {
    setIsLoading(true);
    const result = await fetchAdminMediaReviewAction();
    if (!result.ok) {
      showAppToast({ tone: "error", text: result.message });
      setMediaState(null);
      setIsLoading(false);
      return;
    }

    setMediaState(result);
    setIsLoading(false);
  }

  async function withAction(key: string, task: () => Promise<{ ok: boolean; message: string }>) {
    setActiveKey(key);
    try {
      const result = await task();
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        await loadMedia();
      }
    } finally {
      setActiveKey(null);
    }
  }

  const counts = useMemo(() => {
    const pending = mediaState?.organizationBranding.filter((item) => item.status === "pending_review").length ?? 0;
    return {
      pending,
      active:
        (mediaState?.userAvatars.length ?? 0) +
        (mediaState?.groupAvatars.length ?? 0) +
        (mediaState?.organizationBranding.filter((item) => item.status === "approved").length ?? 0),
      rejected: mediaState?.organizationBranding.filter((item) => item.status === "rejected" || item.status === "disabled").length ?? 0
    };
  }, [mediaState]);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <ManagementIntro
        eyebrow="Media Review"
        title="Uploaded image moderation"
        description="Review organization branding, active user avatars, and active group avatars. Pending or disabled organization branding is not shown on public portals."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Pending review" value={counts.pending} tone="warning" />
        <SummaryCard label="Active images" value={counts.active} tone="accent" />
        <SummaryCard label="Rejected / disabled" value={counts.rejected} tone="danger" />
      </div>

      {isLoading ? <ManagementEmptyState message="Loading media review..." /> : null}

      {!isLoading && mediaState ? (
        <>
          <ManagementCard title="Organization Branding Queue">
            {mediaState.organizationBranding.length === 0 ? (
              <ManagementEmptyState message="No organization branding rows found." />
            ) : (
              <div className="grid gap-3">
                {mediaState.organizationBranding.map((item) => {
                  const noteKey = `org:${item.organizationId}`;
                  return (
                    <div key={item.organizationId} className="rounded-[1rem] border border-gray-200 bg-white p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-black text-gray-950">{item.organizationName}</p>
                            <ManagementBadge label={formatStatus(item.status)} tone={getStatusTone(item.status)} />
                          </div>
                          <p className="mt-1 text-sm font-semibold text-gray-600">{item.ownerLabel}</p>
                          {item.reviewNote ? (
                            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                              {item.reviewNote}
                            </p>
                          ) : null}
                        </div>
                        {item.organizationSlug ? (
                          <a
                            href={`/o/${item.organizationSlug}?preview=1`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
                          >
                            Preview
                          </a>
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-4">
                        <MediaThumb label="Draft logo" imageUrl={item.draftLogoUrl} fit="contain" />
                        <MediaThumb label="Draft background" imageUrl={item.draftBackgroundUrl} fit="cover" />
                        <MediaThumb label="Live logo" imageUrl={item.liveLogoUrl} fit="contain" />
                        <MediaThumb label="Live background" imageUrl={item.liveBackgroundUrl} fit="cover" />
                      </div>

                      <label className="mt-3 block">
                        <span className="text-xs font-black uppercase tracking-[0.14em] text-gray-600">Moderation note</span>
                        <textarea
                          value={notesByKey[noteKey] ?? ""}
                          onChange={(event) => setNotesByKey((current) => ({ ...current, [noteKey]: event.target.value }))}
                          rows={2}
                          className="mt-2 w-full rounded-[0.85rem] border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-light"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ActionButton
                          tone="accent"
                          disabled={Boolean(activeKey)}
                          onClick={() =>
                            void withAction(`approve:${item.organizationId}`, () =>
                              approveOrganizationBrandingFromMediaAction(item.organizationId)
                            )
                          }
                        >
                          {activeKey === `approve:${item.organizationId}` ? "Approving..." : "Approve"}
                        </ActionButton>
                        <ActionButton
                          tone="danger"
                          disabled={Boolean(activeKey)}
                          onClick={() =>
                            void withAction(`reject:${item.organizationId}`, () =>
                              rejectOrganizationBrandingFromMediaAction(item.organizationId, notesByKey[noteKey] ?? "")
                            )
                          }
                        >
                          {activeKey === `reject:${item.organizationId}` ? "Rejecting..." : "Reject"}
                        </ActionButton>
                        <ActionButton
                          tone="danger"
                          disabled={Boolean(activeKey)}
                          onClick={() =>
                            void withAction(`disable:${item.organizationId}`, () =>
                              disableOrganizationBrandingFromMediaAction(item.organizationId, notesByKey[noteKey] ?? "")
                            )
                          }
                        >
                          {activeKey === `disable:${item.organizationId}` ? "Disabling..." : "Take down"}
                        </ActionButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ManagementCard>

          <AvatarMediaSection
            title="Active User Avatars"
            emptyMessage="No active user avatars found."
            items={mediaState.userAvatars}
            notesByKey={notesByKey}
            setNotesByKey={setNotesByKey}
            activeKey={activeKey}
            actionPrefix="user-avatar"
            actionLabel="Remove avatar"
            onRemove={(item, note) => withAction(`user-avatar:${item.id}`, () => removeUserAvatarAsAdminAction(item.id, note))}
          />

          <AvatarMediaSection
            title="Active Group Avatars"
            emptyMessage="No active group avatars found."
            items={mediaState.groupAvatars}
            notesByKey={notesByKey}
            setNotesByKey={setNotesByKey}
            activeKey={activeKey}
            actionPrefix="group-avatar"
            actionLabel="Reset to default"
            onRemove={(item, note) => withAction(`group-avatar:${item.id}`, () => removeGroupAvatarAsAdminAction(item.id, note))}
          />

          <ManagementCard title="Moderation History">
            {mediaState.auditLog.length === 0 ? (
              <ManagementEmptyState message="No media moderation history is available yet." />
            ) : (
              <div className="space-y-2">
                {mediaState.auditLog.map((entry) => (
                  <div key={entry.id} className="rounded-[0.85rem] border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-sm font-black text-gray-950">
                      {entry.action} · {entry.targetType}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-gray-600">
                      {entry.targetId} · {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    {entry.note ? <p className="mt-1 text-sm font-semibold text-gray-700">{entry.note}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </ManagementCard>
        </>
      ) : null}
    </section>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "accent" | "warning" | "danger" }) {
  const toneClass =
    tone === "accent"
      ? "border-accent-light bg-accent-light/30 text-accent-dark"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-[1rem] border px-4 py-4 ${toneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function MediaThumb({ label, imageUrl, fit }: { label: string; imageUrl: string | null; fit: "cover" | "contain" }) {
  return (
    <div className="rounded-[0.9rem] border border-gray-200 bg-gray-50 p-2">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <div className="mt-2 flex h-24 items-center justify-center overflow-hidden rounded-[0.7rem] bg-white">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={label} className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain p-2"}`} />
        ) : (
          <span className="text-xs font-bold text-gray-400">Default</span>
        )}
      </div>
    </div>
  );
}

function AvatarMediaSection({
  title,
  emptyMessage,
  items,
  notesByKey,
  setNotesByKey,
  activeKey,
  actionPrefix,
  actionLabel,
  onRemove
}: {
  title: string;
  emptyMessage: string;
  items: AdminAvatarMediaItem[];
  notesByKey: Record<string, string>;
  setNotesByKey: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  activeKey: string | null;
  actionPrefix: string;
  actionLabel: string;
  onRemove: (item: AdminAvatarMediaItem, note: string) => Promise<void>;
}) {
  return (
    <ManagementCard title={title}>
      {items.length === 0 ? (
        <ManagementEmptyState message={emptyMessage} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const noteKey = `${actionPrefix}:${item.id}`;
            return (
              <div key={item.id} className="rounded-[1rem] border border-gray-200 bg-white p-3">
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-gray-950">{item.label}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-gray-600">{item.context}</p>
                    {item.updatedAt ? (
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        Updated {new Date(item.updatedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </div>
                <label className="mt-3 block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-gray-600">Moderation note</span>
                  <input
                    value={notesByKey[noteKey] ?? ""}
                    onChange={(event) => setNotesByKey((current) => ({ ...current, [noteKey]: event.target.value }))}
                    className="mt-2 w-full rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>
                <div className="mt-3">
                  <ActionButton
                    tone="danger"
                    disabled={Boolean(activeKey)}
                    onClick={() => void onRemove(item, notesByKey[noteKey] ?? "")}
                  >
                    {activeKey === noteKey ? "Removing..." : actionLabel}
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ManagementCard>
  );
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function getStatusTone(status: string): "neutral" | "accent" | "danger" | "warning" {
  if (status === "approved") {
    return "accent";
  }
  if (status === "pending_review") {
    return "warning";
  }
  if (status === "rejected" || status === "disabled") {
    return "danger";
  }
  return "neutral";
}
