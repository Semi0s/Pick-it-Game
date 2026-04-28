"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { BarChart3, CircleUserRound, SquareCheckBig, UsersRound } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { NotificationsBell } from "@/components/NotificationsBell";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { getStrings } from "@/lib/strings";
import {
  fetchCurrentUserTrophies,
  fetchPendingTrophyCelebrations,
  markTrophyCelebrationRead,
  signOutCurrentUser,
  type PendingTrophyCelebration
} from "@/lib/auth-client";
import { getAccessLevelLabel, shouldShowAccessBadge } from "@/lib/access-levels";
import { getStartupReadinessSummary, type SystemReadinessReport } from "@/lib/system-readiness";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { useCurrentUser } from "@/lib/use-current-user";
import type { UserTrophy } from "@/lib/types";
import type { MutableRefObject } from "react";

type AppShellProps = {
  children: ReactNode;
};

const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const TROPHY_POLL_INTERVAL_MS = 4000;

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const copy = getStrings(user?.preferredLanguage);
  const navItems = [
    { href: "/groups", label: copy.myPicks, ariaLabel: copy.myPicks, icon: SquareCheckBig },
    { href: "/my-groups", label: copy.myGroups, ariaLabel: copy.myGroups, icon: UsersRound },
    { href: "/leaderboard", label: copy.results, ariaLabel: copy.results, icon: BarChart3 },
    { href: "/profile", label: copy.myProfile, ariaLabel: copy.myProfile, icon: CircleUserRound }
  ];
  const [pendingCelebrationQueue, setPendingCelebrationQueue] = useState<PendingTrophyCelebration[]>([]);
  const [activeCelebration, setActiveCelebration] = useState<PendingTrophyCelebration | null>(null);
  const [readinessBanner, setReadinessBanner] = useState<string | null>(null);
  const lastTrophySignatureRef = useRef<string>("");

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && user?.needsLegalAcceptance) {
      const nextPath = pathname?.startsWith("/") ? pathname : "/dashboard";
      router.replace(`/legal/accept?next=${encodeURIComponent(nextPath)}`);
    }
  }, [isLoading, pathname, router, user]);

  useEffect(() => {
    if (!isLoading && user && !user.needsLegalAcceptance && user.needsProfileSetup) {
      router.replace("/profile-setup");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!activeCelebration && pendingCelebrationQueue.length > 0) {
      const [nextCelebration, ...remaining] = pendingCelebrationQueue;
      setActiveCelebration(nextCelebration ?? null);
      setPendingCelebrationQueue(remaining);
      if (nextCelebration) {
        void markTrophyCelebrationRead(nextCelebration.notificationId);
      }
    }
  }, [activeCelebration, pendingCelebrationQueue]);

  useEffect(() => {
    if (isLoading || !user || user.needsLegalAcceptance || user.needsProfileSetup) {
      return;
    }

    let isMounted = true;

    const refreshTrophyState = async () => {
      const [pendingCelebrations, trophies] = await Promise.all([
        fetchPendingTrophyCelebrations(),
        fetchCurrentUserTrophies()
      ]);
      if (!isMounted) {
        return;
      }

      dispatchTrophyStateChangedIfNeeded(trophies, lastTrophySignatureRef);

      setPendingCelebrationQueue((currentQueue) => {
        const queuedNotificationIds = new Set(currentQueue.map((trophy) => trophy.notificationId));
        if (activeCelebration) {
          queuedNotificationIds.add(activeCelebration.notificationId);
        }

        const additions = pendingCelebrations.filter((trophy) => !queuedNotificationIds.has(trophy.notificationId));
        return additions.length > 0 ? [...currentQueue, ...additions] : currentQueue;
      });
    };

    void refreshTrophyState();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshTrophyState();
      }
    };

    const pollWhenVisible = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshTrophyState();
      }
    }, TROPHY_POLL_INTERVAL_MS);

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.clearInterval(pollWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [
    activeCelebration,
    isLoading,
    router,
    user,
    user?.needsLegalAcceptance,
    user?.needsProfileSetup
  ]);

  useEffect(() => {
    if (
      !hasSupabaseConfig() ||
      isLoading ||
      !user ||
      user.needsLegalAcceptance ||
      user.needsProfileSetup
    ) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`user-trophies:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_trophies",
          filter: `user_id=eq.${user.id}`
        },
        async () => {
          const [pendingCelebrations, trophies] = await Promise.all([
            waitForPendingTrophyCelebrations(),
            fetchCurrentUserTrophies()
          ]);

          dispatchTrophyStateChangedIfNeeded(trophies, lastTrophySignatureRef);

          setPendingCelebrationQueue((currentQueue) => {
            const queuedNotificationIds = new Set(currentQueue.map((trophy) => trophy.notificationId));
            if (activeCelebration) {
              queuedNotificationIds.add(activeCelebration.notificationId);
            }

            const additions = pendingCelebrations.filter((trophy) => !queuedNotificationIds.has(trophy.notificationId));
            return additions.length > 0 ? [...currentQueue, ...additions] : currentQueue;
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    activeCelebration,
    isLoading,
    user,
    user?.id,
    user?.needsLegalAcceptance,
    user?.needsProfileSetup
  ]);

  useEffect(() => {
    if (isLoading || !user || user.needsLegalAcceptance || user.needsProfileSetup) {
      return;
    }

    let isMounted = true;

    const loadReadiness = async () => {
      try {
        const response = await fetch("/api/admin/system-readiness", { cache: "no-store" });
        const result = (await response.json()) as
          | { ok: true; report: SystemReadinessReport }
          | { ok: false; message?: string };

        if (!isMounted || !response.ok || !result.ok) {
          return;
        }

        const summary = getStartupReadinessSummary(result.report);
        if (isMounted) {
          setReadinessBanner(summary.hasCriticalIssues ? summary.message : null);
        }
      } catch {
        if (isMounted) {
          setReadinessBanner(null);
        }
      }
    };

    void loadReadiness();

    return () => {
      isMounted = false;
    };
  }, [isLoading, user, user?.needsLegalAcceptance, user?.needsProfileSetup]);

  if (isLoading || !user || user.needsProfileSetup || user.needsLegalAcceptance) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5">
        <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
          Loading PICK-IT!...
        </div>
      </main>
    );
  }

  return (
    <div
      className="min-h-screen bg-white text-gray-950"
      style={{ paddingBottom: "calc(6.35rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="min-w-0">
            <h1 className="truncate text-xl font-black leading-tight">{APP_NAME}</h1>
            <p className="truncate text-xs font-semibold text-accent-dark">{APP_TAGLINE}</p>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            {shouldShowAccessBadge(user) ? (
              <span className="rounded-md bg-accent-light px-2 py-1 text-xs font-bold uppercase text-accent-dark">
                {getAccessLevelLabel(user)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await signOutCurrentUser();
                router.replace("/login");
                router.refresh();
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">
        {readinessBanner ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {readinessBanner}
          </div>
        ) : null}
        {children}
      </main>

      <TrophyCelebration
        open={Boolean(activeCelebration)}
        trophy={activeCelebration}
        onDismiss={() => setActiveCelebration(null)}
      />

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white shadow-[0_-10px_24px_rgba(15,23,42,0.05)]">
        <div
          className="grid w-full grid-cols-4 gap-1.5 px-2 pt-2 md:mx-auto md:max-w-4xl"
          style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.ariaLabel}
                className={`flex min-h-[4.75rem] w-full min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-md px-2 py-3 text-xs font-bold leading-none transition-[background-color,color,transform] duration-150 active:scale-[0.98] sm:text-sm ${
                  isActive ? "bg-accent-light text-accent-dark" : "text-gray-600"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Icon aria-hidden className="h-5 w-5 shrink-0" />
                <span className="truncate text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

async function waitForPendingTrophyCelebrations() {
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  return fetchPendingTrophyCelebrations();
}

function dispatchTrophyStateChanged(trophies: UserTrophy[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(TROPHY_STATE_CHANGED_EVENT, {
      detail: { trophies }
    })
  );
}

function dispatchTrophyStateChangedIfNeeded(
  trophies: UserTrophy[],
  lastTrophySignatureRef: MutableRefObject<string>
) {
  const nextSignature = buildTrophySignature(trophies);
  if (lastTrophySignatureRef.current === nextSignature) {
    return;
  }

  lastTrophySignatureRef.current = nextSignature;
  dispatchTrophyStateChanged(trophies);
}

function buildTrophySignature(trophies: UserTrophy[]) {
  return trophies.map((trophy) => `${trophy.id}:${trophy.awardedAt}`).join("|");
}
