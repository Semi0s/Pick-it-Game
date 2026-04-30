"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  archiveAppUpdateAction,
  fetchManagedAppUpdatesAction,
  upsertAppUpdateAction,
  type UpsertAppUpdateInput
} from "@/app/dashboard/actions";
import { showAppToast } from "@/lib/app-toast";
import type { AppUpdate, AppUpdateCardTone, AppUpdateImportance, AppUpdateType } from "@/lib/types";
import { AdminMessage } from "@/components/admin/AdminHomeClient";

const UPDATE_TYPE_OPTIONS: AppUpdateType[] = ["info", "feature", "warning", "tournament", "maintenance"];
const IMPORTANCE_OPTIONS: AppUpdateImportance[] = ["normal", "important"];
const CARD_TONE_OPTIONS: AppUpdateCardTone[] = ["neutral", "sky", "green", "amber", "rose"];

type UpdateDraft = {
  id?: string;
  title: string;
  body: string;
  updateType: AppUpdateType;
  importance: AppUpdateImportance;
  cardTone: AppUpdateCardTone;
  linkLabel: string;
  linkUrl: string;
  publishedAt: string;
  expiresAt: string;
};

const EMPTY_DRAFT: UpdateDraft = {
  title: "",
  body: "",
  updateType: "info",
  importance: "normal",
  cardTone: "neutral",
  linkLabel: "",
  linkUrl: "",
  publishedAt: toDateTimeLocal(new Date()),
  expiresAt: ""
};

export function AdminUpdatesManager() {
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [draft, setDraft] = useState<UpdateDraft>(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadUpdates() {
    setIsLoading(true);
    const result = await fetchManagedAppUpdatesAction();
    if (!result.ok) {
      setError(result.message);
      setUpdates([]);
      setIsLoading(false);
      return;
    }

    setUpdates(result.updates);
    setError(null);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadUpdates();
  }, []);

  const sortedUpdates = useMemo(
    () =>
      [...updates].sort(
        (left, right) =>
          new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
      ),
    [updates]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    const payload: UpsertAppUpdateInput = {
      id: draft.id,
      title: draft.title,
      body: draft.body,
      updateType: draft.updateType,
      importance: draft.importance,
      cardTone: draft.cardTone,
      linkLabel: draft.linkLabel || null,
      linkUrl: draft.linkUrl || null,
      publishedAt: draft.publishedAt,
      expiresAt: draft.expiresAt || null
    };
    const result = await upsertAppUpdateAction(payload);
    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      setDraft(EMPTY_DRAFT);
      await loadUpdates();
    }
    setIsSaving(false);
  }

  async function handleArchive(updateId: string) {
    setActiveArchiveId(updateId);
    const result = await archiveAppUpdateAction(updateId);
    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      await loadUpdates();
    }
    setActiveArchiveId(null);
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Updates</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">Manage dashboard updates</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Publish short notes, feature announcements, and important tournament messages for everyone on the landing page.
        </p>
      </div>

      {error ? <AdminMessage tone="error" message={error} /> : null}

      <form className="grid gap-3 rounded-lg border border-gray-200 p-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="text-sm font-bold text-gray-800">Title</span>
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-gray-800">Body</span>
          <textarea
            value={draft.body}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            rows={4}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Type</span>
            <select
              value={draft.updateType}
              onChange={(event) =>
                setDraft((current) => ({ ...current, updateType: event.target.value as AppUpdateType }))
              }
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              {UPDATE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Importance</span>
            <select
              value={draft.importance}
              onChange={(event) =>
                setDraft((current) => ({ ...current, importance: event.target.value as AppUpdateImportance }))
              }
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              {IMPORTANCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Card tone</span>
            <select
              value={draft.cardTone}
              onChange={(event) =>
                setDraft((current) => ({ ...current, cardTone: event.target.value as AppUpdateCardTone }))
              }
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              {CARD_TONE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Publish date</span>
            <input
              type="datetime-local"
              value={draft.publishedAt}
              onChange={(event) => setDraft((current) => ({ ...current, publishedAt: event.target.value }))}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Expiration date</span>
            <input
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(event) => setDraft((current) => ({ ...current, expiresAt: event.target.value }))}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Link label</span>
            <input
              value={draft.linkLabel}
              onChange={(event) => setDraft((current) => ({ ...current, linkLabel: event.target.value }))}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Link URL</span>
            <input
              value={draft.linkUrl}
              onChange={(event) => setDraft((current) => ({ ...current, linkUrl: event.target.value }))}
              placeholder="https://example.com or /help"
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
          >
            {isSaving ? "Saving..." : draft.id ? "Save update" : "Publish update"}
          </button>
          {draft.id ? (
            <button
              type="button"
              onClick={() => setDraft(EMPTY_DRAFT)}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-600">Loading updates...</p>
        ) : sortedUpdates.length === 0 ? (
          <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-600">No updates published yet</p>
        ) : (
          sortedUpdates.map((update) => {
            const isArchived = Boolean(update.expiresAt && new Date(update.expiresAt).getTime() <= Date.now());
            return (
              <div key={update.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-black text-gray-950">{update.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{update.body}</p>
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {formatOptionLabel(update.updateType)} · {formatPublishedSummary(update.publishedAt, update.expiresAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          id: update.id,
                          title: update.title,
                          body: update.body,
                          updateType: update.updateType,
                          importance: update.importance,
                          cardTone: update.cardTone,
                          linkLabel: update.linkLabel ?? "",
                          linkUrl: update.linkUrl ?? "",
                          publishedAt: toDateTimeLocal(update.publishedAt),
                          expiresAt: update.expiresAt ? toDateTimeLocal(update.expiresAt) : ""
                        })
                      }
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                    >
                      Edit
                    </button>
                    {!isArchived ? (
                      <button
                        type="button"
                        onClick={() => void handleArchive(update.id)}
                        disabled={activeArchiveId === update.id}
                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        {activeArchiveId === update.id ? "Archiving..." : "Archive"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function toDateTimeLocal(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatOptionLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPublishedSummary(publishedAt: string, expiresAt?: string | null) {
  const publishedLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(publishedAt));

  if (!expiresAt) {
    return `Published ${publishedLabel}`;
  }

  const expiresLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(expiresAt));

  return `Published ${publishedLabel} · Expires ${expiresLabel}`;
}
