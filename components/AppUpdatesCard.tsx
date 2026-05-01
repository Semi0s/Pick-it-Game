"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchLandingUpdatesAction, markAppUpdateReadAction } from "@/app/dashboard/actions";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import type { AppUpdateCardTone, AppUpdateWithReadState } from "@/lib/types";

export function AppUpdatesCard() {
  const [updates, setUpdates] = useState<AppUpdateWithReadState[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useSessionDisclosureState("dashboard-updates-card-disclosure", false);

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

  const activeUpdate = updates[activeIndex] ?? null;
  const hasUnreadImportantUpdate = useMemo(
    () => updates.some((update) => update.importance === "important" && !update.isRead),
    [updates]
  );

  useEffect(() => {
    if (!activeUpdate || activeUpdate.isRead) {
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
  }, [activeUpdate]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
        <p className="mt-1.5 text-[10px] text-gray-600">Loading updates...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
          <InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />
        </div>
        {isOpen ? <p className="mt-1.5 text-[10px] text-gray-600">Updates will appear here soon</p> : null}
      </section>
    );
  }

  if (!activeUpdate) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
          <InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />
        </div>
        {isOpen ? (
          <>
            <p className="mt-1.5 text-[10px] leading-5 text-gray-600">
              Thank you for your support. We&apos;ll keep this space ready for important dates, feature notes, and
              tournament updates.
            </p>
            <p className="mt-1.5 text-[10px] leading-5 text-gray-600">
              If you need to request an invite or send feedback please go{" "}
              <a
                href="https://www.semiosdesign.com/pick-it-game"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-accent-dark underline decoration-accent/40 underline-offset-2 transition hover:decoration-accent"
              >
                here
              </a>
              .
            </p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-accent-dark">
              Don&apos;t forget to check often for the latest news. Especially as the tournament is about to start.
            </p>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`border ${
        isOpen ? "rounded-lg p-3" : "rounded-md px-3 py-2"
      } ${getUpdateCardSurfaceClasses(activeUpdate.cardTone, hasUnreadImportantUpdate)}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">Updates</p>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
              isOpen ? "sm:px-2.5 sm:py-1.5" : ""
            } ${getUpdateDateChipClasses(
              activeUpdate.cardTone,
              activeUpdate.importance
            )}`}
          >
            {formatUpdateTimestamp(activeUpdate.publishedAt)}
          </div>
          <InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />
        </div>
      </div>

      {isOpen ? (
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
