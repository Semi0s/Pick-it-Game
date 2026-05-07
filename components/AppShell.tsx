"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, CircleUserRound, Globe, ListOrdered, SquareCheckBig, UsersRound } from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { APP_TOAST_EVENT, markAppToastsReady, type AppToastDetail } from "@/lib/app-toast";
import { getStrings } from "@/lib/strings";
import { PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, normalizeExplainerLanguage, type ExplainerLanguage, type SupportedLanguage } from "@/lib/i18n";
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
const DEFAULT_TOAST_DURATION_MS = 4200;
const DASHBOARD_LOGO_HINT_STORAGE_KEY_PREFIX = "pickit:dashboard-logo-hint-shown:";
const HELPER_LANGUAGE_CHANGED_EVENT = "pickit:helper-language-changed";
const EXPLAINER_LANGUAGE_LABELS: Record<ExplainerLanguage, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  de: "Deutsch"
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [dockLanguage, setDockLanguage] = useState<SupportedLanguage>(user?.preferredLanguage === "es" ? "es" : "en");
  const [displayLanguage, setDisplayLanguage] = useState<ExplainerLanguage>(() => {
    if (typeof window !== "undefined") {
      try {
        const storedValue = window.localStorage.getItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY);
        if (storedValue) {
          return normalizeExplainerLanguage(storedValue);
        }
      } catch (error) {
        console.warn("Could not restore helper language in app shell.", error);
      }
    }

    return "en";
  });
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const copy = getStrings(dockLanguage);
  const navItems = [
    { href: "/groups", label: copy.myPicks, ariaLabel: copy.myPicks, icon: SquareCheckBig },
    { href: "/my-groups", label: copy.myGroups, ariaLabel: copy.myGroups, icon: UsersRound },
    { href: "/leaderboard", label: copy.results, ariaLabel: copy.results, icon: ListOrdered },
    { href: "/profile", label: copy.myProfile, ariaLabel: copy.myProfile, icon: CircleUserRound }
  ];
  const [pendingCelebrationQueue, setPendingCelebrationQueue] = useState<PendingTrophyCelebration[]>([]);
  const [activeCelebration, setActiveCelebration] = useState<PendingTrophyCelebration | null>(null);
  const [readinessBanner, setReadinessBanner] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; tone: AppToastDetail["tone"]; text: string }>>([]);
  const lastTrophySignatureRef = useRef<string>("");
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(72);

  useEffect(() => {
    if (!isLanguageMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLanguageMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageMenuOpen]);

  useEffect(() => {
    if (!user) {
      setDisplayLanguage("en");
      return;
    }

    const syncDisplayLanguage = () => {
      if (typeof window === "undefined") {
        return;
      }

      try {
        const storedValue = window.localStorage.getItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY);
        if (storedValue) {
          setDisplayLanguage(normalizeExplainerLanguage(storedValue));
          return;
        }
      } catch (error) {
        console.warn("Could not read helper language in app shell.", error);
      }

      setDisplayLanguage(user.preferredLanguage === "es" ? "es" : "en");
    };

    syncDisplayLanguage();

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY) {
        syncDisplayLanguage();
      }
    };

    const handleHelperLanguageChange = () => {
      syncDisplayLanguage();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(HELPER_LANGUAGE_CHANGED_EVENT, handleHelperLanguageChange as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(HELPER_LANGUAGE_CHANGED_EVENT, handleHelperLanguageChange as EventListener);
    };
  }, [user]);

  useEffect(() => {
    const dismissToastLater = (id: string, durationMs?: number) => {
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, durationMs ?? DEFAULT_TOAST_DURATION_MS);
    };

    const enqueueToast = (detail: AppToastDetail) => {
      if (!detail?.text) {
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { id, tone: detail.tone, text: detail.text }]);
      dismissToastLater(id, detail.durationMs);
    };

    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<AppToastDetail>;
      enqueueToast(customEvent.detail);
    };

    window.addEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    const pendingToasts = markAppToastsReady();
    pendingToasts.forEach(enqueueToast);
    return () => {
      window.removeEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    };
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) {
      return;
    }

    const updateHeaderHeight = () => {
      setHeaderHeight(Math.round(header.getBoundingClientRect().height) || 72);
    };

    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateHeaderHeight);
      resizeObserver.observe(header);
    }

    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
      resizeObserver?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!user) {
      setDockLanguage("en");
      return;
    }

    const fallbackLanguage: SupportedLanguage = user.preferredLanguage === "es" ? "es" : "en";

    const syncDockLanguage = () => {
      if (typeof window === "undefined") {
        setDockLanguage(fallbackLanguage);
        return;
      }

      try {
        const helperLanguage = window.localStorage.getItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY);
        if (helperLanguage === "en" || helperLanguage === "es") {
          setDockLanguage(helperLanguage);
          return;
        }
      } catch (error) {
        console.warn("Could not read helper language for dock labels.", error);
      }

      setDockLanguage(fallbackLanguage);
    };

    syncDockLanguage();

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY) {
        syncDockLanguage();
      }
    };

    const handleHelperLanguageChange = () => {
      syncDockLanguage();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleHelperLanguageChange);
    window.addEventListener(HELPER_LANGUAGE_CHANGED_EVENT, handleHelperLanguageChange as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleHelperLanguageChange);
      window.removeEventListener(HELPER_LANGUAGE_CHANGED_EVENT, handleHelperLanguageChange as EventListener);
    };
  }, [user]);

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
      style={
        {
          paddingBottom: "calc(4.85rem + env(safe-area-inset-bottom, 0px))",
          "--app-header-height": `${headerHeight}px`
        } as CSSProperties
      }
    >
      <header ref={headerRef} className="sticky top-0 z-20 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2">
          <Link href="/dashboard" className="min-w-0" aria-label="PICK-IT! World Cup 2026 home">
            <Image
              src="/images/pickit-header-logo.png"
              alt="PICK-IT! World Cup 2026"
              width={648}
              height={220}
              priority
              className="h-[4.25rem] w-auto sm:h-[5.1rem]"
            />
          </Link>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            {shouldShowAccessBadge(user) ? (
              <span className="rounded-md bg-accent-light px-2 py-1 text-xs font-bold uppercase text-accent-dark">
                {getAccessLevelLabel(user)}
              </span>
            ) : null}
            <div ref={languageMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsLanguageMenuOpen((current) => !current)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light sm:h-9 sm:px-2"
                aria-haspopup="menu"
                aria-expanded={isLanguageMenuOpen}
                aria-label={`Translate helper copy. Current language: ${EXPLAINER_LANGUAGE_LABELS[displayLanguage]}`}
              >
                <Globe aria-hidden className="h-3 w-3 text-accent-dark" />
                <span>{displayLanguage.toUpperCase()}</span>
                <ChevronDown aria-hidden className="h-3 w-3 text-gray-500" />
              </button>
              {isLanguageMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 min-w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                  {(Object.keys(EXPLAINER_LANGUAGE_LABELS) as ExplainerLanguage[]).map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => {
                        setDisplayLanguage(language);
                        setIsLanguageMenuOpen(false);
                        try {
                          window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, language);
                          window.dispatchEvent(new CustomEvent(HELPER_LANGUAGE_CHANGED_EVENT));
                        } catch (error) {
                          console.warn("Could not persist helper language in app shell.", error);
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                        language === displayLanguage ? "bg-accent-light text-accent-dark" : "text-gray-700 hover:bg-gray-50"
                      }`}
                      role="menuitem"
                    >
                      <span>{EXPLAINER_LANGUAGE_LABELS[language]}</span>
                      <span className="text-xs font-black uppercase">{language}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={async () => {
                if (typeof window !== "undefined") {
                  try {
                    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
                      const key = window.sessionStorage.key(index);
                      if (key?.startsWith(DASHBOARD_LOGO_HINT_STORAGE_KEY_PREFIX)) {
                        window.sessionStorage.removeItem(key);
                      }
                    }
                  } catch (error) {
                    console.warn("Could not clear dashboard hint session state.", error);
                  }
                }
                await signOutCurrentUser();
                router.replace("/login");
                router.refresh();
              }}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 sm:px-3"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-5 pt-6">
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

      {toasts.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4">
          <div className="flex w-full max-w-md flex-col gap-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${
                  toast.tone === "success"
                    ? "border-accent-light bg-white text-accent-dark"
                    : toast.tone === "tip"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-red-200 bg-white text-red-700"
                }`}
              >
                {toast.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-700 bg-neutral-900"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="relative grid w-full grid-cols-4 gap-0.5 px-2 pb-0.5 pt-1 md:mx-auto md:max-w-4xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.ariaLabel}
                className={`relative flex min-h-[3.35rem] w-full min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1.5 text-[10px] font-semibold leading-none transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-100/20 active:scale-[0.985] sm:text-[11px] ${
                  isActive
                    ? "bg-neutral-800 text-neutral-50"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-4 top-0.5 h-0.5 rounded-full bg-emerald-300/85"
                  />
                ) : null}
                <Icon
                  aria-hidden
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-emerald-200" : ""}`}
                />
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
