"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchLandingUpdatesAction,
  markAppUpdateReadAction,
  updateDashboardUpdatesEnabledAction
} from "@/app/dashboard/actions";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import { canManageAppUpdates, getAppUpdatesCardDisplayState } from "@/lib/dashboard-updates";
import type { AppUpdateCardTone, AppUpdateWithReadState } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";

export function AppUpdatesCard() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [updates, setUpdates] = useState<AppUpdateWithReadState[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useSessionDisclosureState("dashboard-updates-card-disclosure", false);
  const [isForcedOpen, setIsForcedOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [isUpdatingEnabled, setIsUpdatingEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    fetchLandingUpdatesAction()
      .then((result) => {
        if (!isMounted) {
          return;
        }

        if (!result.ok) {
          setError(result.message);
          setUpdates([]);
          setIsLoading(false);
          return;
        }

        setIsForcedOpen(result.forceOpen);
        setIsEnabled(result.enabled);
        setUpdates(result.updates);
        setActiveIndex(0);
        setError(null);
        setIsLoading(false);
      })
      .catch((caughtError: Error) => {
        if (isMounted) {
          setError(caughtError.message);
          setUpdates([]);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, updates.length - 1)));
  }, [updates.length]);

  const activeUpdate = updates[activeIndex] ?? null;
  const resolvedIsOpen = isForcedOpen || isOpen;
  const hasUnreadImportantUpdate = useMemo(
    () => updates.some((update) => update.importance === "important" && !update.isRead),
    [updates]
  );
  const canArchiveUpdates = canManageAppUpdates(user);

  useEffect(() => {
    if (!isEnabled || !activeUpdate || activeUpdate.isRead) {
      return;
    }

    void markAppUpdateReadAction(activeUpdate.id).then((result) => {
      if (!result.ok) {
        return;
      }

      setUpdates((currentUpdates) =>
        currentUpdates.map((update) =>
          update.id === activeUpdate.id ? { ...update, isRead: true, readAt: new Date().toISOString() } : update
        )
      );
    });
  }, [activeUpdate, isEnabled]);

  if (isLoading) {
    return null;
  }

  const displayState = getAppUpdatesCardDisplayState({
    canManageUpdates: canArchiveUpdates,
    isEnabled,
    hasActiveUpdate: Boolean(activeUpdate),
    hasError: Boolean(error)
  });

  if (displayState === "hidden") {
    return null;
  }

  if (displayState === "admin_error") {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">Admin only</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[10px] font-semibold text-amber-800">
            Hidden from users
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-amber-900">{error ?? "Could not load updates."}</p>
      </section>
    );
  }

  if (displayState === "admin_disabled") {
    return (
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Admin only</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (isUpdatingEnabled) {
                return;
              }

              setIsUpdatingEnabled(true);
              const result = await updateDashboardUpdatesEnabledAction(true);
              if (!result.ok) {
                setError(result.message);
                setIsUpdatingEnabled(false);
                return;
              }

              setIsEnabled(true);
              setError(null);
              setIsUpdatingEnabled(false);
              router.refresh();
            }}
            disabled={isUpdatingEnabled}
            className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUpdatingEnabled ? "Saving..." : "On"}
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-gray-600">
          This card is currently hidden from players.
          {activeUpdate ? ` Hidden update: ${activeUpdate.title}.` : ""}
        </p>
      </section>
    );
  }

  if (displayState === "admin_empty") {
    return (
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">Admin only</p>
          </div>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] font-semibold text-gray-700">
            No live update
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-5 text-gray-600">
          The Updates card is on, but there is no currently published message for players.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`border ${
        resolvedIsOpen ? "rounded-lg p-3" : "rounded-md px-3 py-1.5"
      } ${getUpdateCardSurfaceClasses(activeUpdate.cardTone, hasUnreadImportantUpdate)}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
        <div className="flex shrink-0 items-center gap-2">
          {canArchiveUpdates ? (
            <button
              type="button"
              onClick={async () => {
                if (isUpdatingEnabled) {
                  return;
                }

                setIsUpdatingEnabled(true);
                const result = await updateDashboardUpdatesEnabledAction(false);
                if (!result.ok) {
                  setError(result.message);
                  setIsUpdatingEnabled(false);
                  return;
                }

                setIsEnabled(false);
                setError(null);
                setIsUpdatingEnabled(false);
                router.refresh();
              }}
              disabled={isUpdatingEnabled}
              className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Turn this update off for everyone"
            >
              {isUpdatingEnabled ? "Saving..." : "Off"}
            </button>
          ) : null}
          <div
            className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
              resolvedIsOpen ? "sm:px-2.5 sm:py-1.5" : ""
            } ${getUpdateDateChipClasses(
              activeUpdate.cardTone,
              activeUpdate.importance
            )}`}
          >
            {formatUpdateTimestamp(activeUpdate.publishedAt)}
          </div>
          {isForcedOpen ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-dark">Pinned open</span>
          ) : (
            <InlineDisclosureButton isOpen={resolvedIsOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />
          )}
        </div>
      </div>

      {resolvedIsOpen ? (
        <>
          <h3 className="mt-1.5 text-base font-black text-gray-950 sm:text-lg">{activeUpdate.title}</h3>
          <p className="mt-1.5 text-[10px] leading-5 text-gray-600">{activeUpdate.body}</p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
                disabled={activeIndex === 0}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[10px] text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Show previous update"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((current) => Math.min(updates.length - 1, current + 1))}
                disabled={activeIndex === updates.length - 1}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-1.5 text-[10px] text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Show next update"
              >
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold text-gray-600">
                {activeIndex + 1} of {updates.length}
              </p>
            </div>

            {activeUpdate.linkUrl ? (
              activeUpdate.linkUrl.startsWith("/") ? (
                <Link
                  href={activeUpdate.linkUrl}
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3.5 py-1.5 text-[10px] font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                >
                  {activeUpdate.linkLabel || "Learn more"}
                </Link>
              ) : (
                <a
                  href={activeUpdate.linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-3.5 py-1.5 text-[10px] font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                >
                  {activeUpdate.linkLabel || "Learn more"}
                </a>
              )
            ) : null}
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-accent-dark">
            Don&apos;t forget to check often for the latest news. Especially as the tournament is about to start.
          </p>
        </>
      ) : null}
    </section>
  );
}

function formatUpdateTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function getUpdateCardSurfaceClasses(cardTone: AppUpdateCardTone, highlightImportantUnread: boolean) {
  const toneClassName =
    {
      neutral: "border-gray-200 bg-white",
      sky: "border-sky-200 bg-sky-50",
      green: "border-emerald-200 bg-emerald-50",
      amber: "border-amber-200 bg-amber-50",
      rose: "border-rose-200 bg-rose-50"
    }[cardTone] ?? "border-gray-200 bg-white";

  if (!highlightImportantUnread) {
    return toneClassName;
  }

  return `${toneClassName} ring-1 ring-amber-200`;
}

function getUpdateDateChipClasses(cardTone: AppUpdateCardTone, importance: AppUpdateWithReadState["importance"]) {
  if (importance === "important") {
    return "bg-amber-100 text-amber-800";
  }

  return (
    {
      neutral: "bg-gray-100 text-gray-700",
      sky: "bg-sky-100 text-sky-800",
      green: "bg-emerald-100 text-emerald-800",
      amber: "bg-amber-100 text-amber-800",
      rose: "bg-rose-100 text-rose-800"
    }[cardTone] ?? "bg-gray-100 text-gray-700"
  );
}
