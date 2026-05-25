"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState, type CSSProperties, type SVGProps } from "react";
import { ChevronDown, CircleUserRound, Globe } from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { TierIconBadge } from "@/components/TierIconBadge";
import { PickItLogo } from "@/components/PickItLogo";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { APP_TOAST_EVENT, markAppToastsReady, type AppToastDetail } from "@/lib/app-toast";
import { getStrings } from "@/lib/strings";
import { getAppAccentCssVars, getLocalizedCardThemeForUserSurface } from "@/lib/localized-card-themes";
import { PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, normalizeExplainerLanguage, type ExplainerLanguage, type SupportedLanguage } from "@/lib/i18n";
import { shouldHideDockForPath } from "@/lib/play-mode";
import { getConfiguredGroupPredictionMode, isFullScoresModeEnabled } from "@/lib/group-prediction-mode";
import {
  fetchCurrentUserTrophies,
  fetchPendingTrophyCelebrations,
  markTrophyCelebrationRead,
  type PendingTrophyCelebration
} from "@/lib/auth-client";
import { getAccessLevel, shouldShowAccessBadge } from "@/lib/access-levels";
import { getStartupReadinessSummary, type SystemReadinessReport } from "@/lib/system-readiness";
import { ADMIN_UI_RESET_SIGNAL_STORAGE_KEY } from "@/lib/ui-storage-keys";
import { parseJsonResponse } from "@/lib/fetch-json";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { useCurrentUser } from "@/lib/use-current-user";
import type { UserTrophy } from "@/lib/types";
import type { MutableRefObject } from "react";

type AppShellProps = {
  children: ReactNode;
};

function GroupStageDockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="10" rx="2.5" />
      <path d="M9 14v5" />
      <path d="M15 14v5" />
      <path d="M6 19h12" />
      <path d="M8 9h3" />
      <path d="M13 9h3" />
      <path d="M10 7.5v3" />
      <path d="M14.5 7.5v3" />
    </svg>
  );
}

function KnockoutDockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="6" height="4" rx="1" />
      <rect x="3" y="16" width="6" height="4" rx="1" />
      <rect x="15" y="10" width="6" height="4" rx="1" />
      <path d="M9 6h3.5a1.5 1.5 0 0 1 1.5 1.5V12" />
      <path d="M9 18h3.5a1.5 1.5 0 0 0 1.5-1.5V12" />
      <path d="M14 12h1" />
    </svg>
  );
}

function LeaderboardDockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 4h6" />
      <path d="M10 4v2.5c0 1.2.9 2.3 2 2.5 1.1-.2 2-1.3 2-2.5V4" />
      <path d="M8 4H6.5c0 1.8 1.1 3.2 2.8 3.6" />
      <path d="M16 4h1.5c0 1.8-1.1 3.2-2.8 3.6" />
      <path d="M12 9v2" />
      <path d="M10 11h4v2H10z" />
      <path d="M4 18.5v-3a1.5 1.5 0 0 1 1.5-1.5H11v4.5Z" />
      <path d="M13 18.5V14h5.5A1.5 1.5 0 0 1 20 15.5v3Z" />
      <path d="M11 18.5v-6h2v6" />
      <path d="M4 18.5h16" />
    </svg>
  );
}

function MyGroupsDockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="6" cy="10" r="2" />
      <circle cx="12" cy="11" r="2.2" />
      <circle cx="18" cy="10" r="2" />
      <path d="M4.5 19v-2.2A2.3 2.3 0 0 1 6.8 14.5h.7" />
      <path d="M9.2 19v-2.5A2.7 2.7 0 0 1 11.9 13.8h.2a2.7 2.7 0 0 1 2.7 2.7V19" />
      <path d="M16.5 14.5h.7a2.3 2.3 0 0 1 2.3 2.3V19" />
      <path d="M10.5 4.5l.2 4.2" />
      <path d="M10.7 4.7c1.5-.6 3.1-.6 4.6.1l-.2 2.4c-1.4-.6-2.9-.6-4.4-.1Z" />
    </svg>
  );
}

function MyPicksDockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M8 9h4" />
      <path d="M8 13h4" />
      <path d="M8 17h4" />
      <path d="m14.5 10.5 1.5 1.5 3-3" />
      <path d="m14.5 14.5 1.5 1.5 3-3" />
    </svg>
  );
}

const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const TROPHY_POLL_INTERVAL_MS = 4000;
const DEFAULT_TOAST_DURATION_MS = 4200;
const TIP_TOAST_DURATION_MS = 6200;
const ERROR_TOAST_DURATION_MS = 7600;
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
  const [onboardingFlag, setOnboardingFlag] = useState<string | null>(null);
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
  const accentTheme = getLocalizedCardThemeForUserSurface({
    homeTeamId: user?.homeTeamId ?? null,
    preferredLanguage: user?.preferredLanguage ?? null
  });
  const groupPredictionMode = getConfiguredGroupPredictionMode();
  const navItems = [
    { href: "/bracket-builder", label: copy.myBracket, ariaLabel: copy.myBracket, icon: GroupStageDockIcon },
    ...(isFullScoresModeEnabled(groupPredictionMode)
      ? [{ href: "/groups", label: copy.myPicks, ariaLabel: copy.myPicks, icon: MyPicksDockIcon }]
      : []),
    { href: "/knockout", label: copy.knockoutPicks, ariaLabel: copy.knockoutPicks, icon: KnockoutDockIcon },
    { href: "/leaderboard", label: copy.results, ariaLabel: copy.results, icon: LeaderboardDockIcon },
    { href: "/my-groups", label: copy.myGroups, ariaLabel: copy.myGroups, icon: MyGroupsDockIcon }
  ];
  const [pendingCelebrationQueue, setPendingCelebrationQueue] = useState<PendingTrophyCelebration[]>([]);
  const [activeCelebration, setActiveCelebration] = useState<PendingTrophyCelebration | null>(null);
  const [readinessBanner, setReadinessBanner] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; tone: AppToastDetail["tone"]; text: string }>>([]);
  const lastTrophySignatureRef = useRef<string>("");
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(72);
  const isOnboardingExperience = shouldHideDockForPath(pathname, onboardingFlag);
  const onboardingExitHref = pathname === "/start-playing" ? "/dashboard" : "/start-playing";
  const onboardingExitLabel = pathname === "/start-playing" ? "Exit" : "Back";
  const shouldShowOnboardingHeaderExit = isOnboardingExperience && pathname !== "/start-playing";
  const shouldShowAccountButton = pathname !== "/start-playing";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncOnboardingFlag = () => {
      try {
        const nextFlag = new URLSearchParams(window.location.search).get("onboarding");
        setOnboardingFlag(nextFlag);
      } catch {
        setOnboardingFlag(null);
      }
    };

    syncOnboardingFlag();
    window.addEventListener("popstate", syncOnboardingFlag);

    return () => {
      window.removeEventListener("popstate", syncOnboardingFlag);
    };
  }, [pathname]);

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
      const fallbackDuration =
        detail.tone === "error"
          ? ERROR_TOAST_DURATION_MS
          : detail.tone === "tip"
            ? TIP_TOAST_DURATION_MS
            : DEFAULT_TOAST_DURATION_MS;
      dismissToastLater(id, detail.durationMs ?? fallbackDuration);
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

    const handleAdminResetSignal = (event: StorageEvent) => {
      if (event.key !== ADMIN_UI_RESET_SIGNAL_STORAGE_KEY) {
        return;
      }

      setActiveCelebration(null);
      setPendingCelebrationQueue([]);
      void refreshTrophyState();
    };

    const pollWhenVisible = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshTrophyState();
      }
    }, TROPHY_POLL_INTERVAL_MS);

    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("storage", handleAdminResetSignal);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.clearInterval(pollWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("storage", handleAdminResetSignal);
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
        const result = await parseJsonResponse<
          | { ok: true; report: SystemReadinessReport }
          | { ok: false; message?: string }
        >(response, "Could not load the system readiness report.", "system readiness");

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
      className="min-h-screen overflow-x-clip bg-white text-gray-950"
      style={
        {
          paddingBottom: isOnboardingExperience ? "0px" : "calc(4.85rem + env(safe-area-inset-bottom, 0px))",
          "--app-header-height": `${headerHeight}px`,
          ...getAppAccentCssVars(accentTheme)
        } as CSSProperties
      }
    >
      <header ref={headerRef} className="sticky top-0 z-20 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2.5 px-3 py-2 sm:px-4">
          <Link href="/dashboard" className="shrink-0" aria-label="PICK-IT! World Cup 2026 home">
            <PickItLogo
              alt="PICK-IT! World Cup 2026"
              sizes="(max-width: 430px) 119px, (max-width: 640px) 148px, 187px"
              priority
              className="w-[clamp(7.425rem,30.6vw,11.7rem)] min-w-[7.425rem] max-w-[11.7rem] shrink-0"
            />
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 max-[430px]:gap-1">
            {shouldShowOnboardingHeaderExit ? (
              <Link
                href={onboardingExitHref}
                className="inline-flex h-8 items-center rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light max-[399px]:px-2.5 max-[399px]:text-[10px] sm:h-9 sm:px-3"
              >
                {onboardingExitLabel}
              </Link>
            ) : null}
            {shouldShowAccessBadge(user) ? (
              <TierIconBadge accessLevel={getAccessLevel(user)} size={24} />
            ) : null}
            <NotificationsBell />
            <div ref={languageMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsLanguageMenuOpen((current) => !current)}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light max-[399px]:h-8 max-[399px]:gap-1.5 max-[399px]:px-2.5 max-[399px]:text-[10px] sm:h-9 sm:px-2"
                aria-haspopup="menu"
                aria-expanded={isLanguageMenuOpen}
                aria-label={`Translate helper copy. Current language: ${EXPLAINER_LANGUAGE_LABELS[displayLanguage]}`}
              >
                <Globe aria-hidden className="h-[18px] w-[18px] text-accent-dark max-[399px]:h-[15px] max-[399px]:w-[15px]" />
                <span>{displayLanguage.toUpperCase()}</span>
                <ChevronDown aria-hidden className="h-3 w-3 text-gray-500 max-[399px]:h-2.5 max-[399px]:w-2.5" />
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
            {shouldShowAccountButton ? (
              <Link
                href="/profile"
                aria-label="Account"
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1.5 text-[11px] font-semibold text-gray-700 max-[399px]:h-8 max-[399px]:gap-1 max-[399px]:px-2.25 max-[399px]:py-0 max-[399px]:text-[10px] sm:px-2.5"
              >
                <CircleUserRound aria-hidden className="h-[17.5px] w-[17.5px] max-[399px]:h-[15px] max-[399px]:w-[15px]" />
                <span className="max-[430px]:hidden">Account</span>
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-5 pt-6">
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

      {isOnboardingExperience ? null : (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-700 bg-neutral-900"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <div
            className="relative mx-auto grid w-full max-w-4xl gap-0.5 px-2 pb-0.5 pt-1"
            style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
          >
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
                      className="absolute inset-x-4 top-0.5 h-0.5 rounded-full bg-accent/85"
                    />
                  ) : null}
                  <Icon
                    aria-hidden
                    className={`h-5 w-5 shrink-0 ${isActive ? "text-accent-light" : ""}`}
                  />
                  <span className="truncate text-center leading-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
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
