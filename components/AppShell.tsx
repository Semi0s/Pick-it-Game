"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, CircleUserRound, Globe } from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { TierIconBadge } from "@/components/TierIconBadge";
import { ThemedPickItLogo } from "@/components/ThemedPickItLogo";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { AppLanguageProvider, useResolvedAppLanguage } from "@/lib/app-language";
import { APP_TOAST_EVENT, markAppToastsReady, showAppToast, type AppToastDetail, type AppToastEventDetail, type AppToastTone } from "@/lib/app-toast";
import { getStrings, t } from "@/lib/strings";
import { getAppAccentCssVars, getLocalizedCardThemeForUserSurface } from "@/lib/localized-card-themes";
import { type ExplainerLanguage } from "@/lib/i18n";
import { shouldHideDockForPath } from "@/lib/play-mode";
import { getConfiguredGroupPredictionMode, isFullScoresModeEnabled } from "@/lib/group-prediction-mode";
import {
  fetchCurrentUserTrophies,
  fetchPendingTrophyCelebrations,
  markTrophyCelebrationRead,
  updateCurrentUserPreferredLanguage,
  type PendingTrophyCelebration
} from "@/lib/auth-client";
import { getAccessLevel, shouldShowAccessBadge } from "@/lib/access-levels";
import { compareAccessLevels, normalizeAccessLevel, type AccessLevel } from "@/lib/tier-access";
import { getStartupReadinessSummary, type SystemReadinessReport } from "@/lib/system-readiness";
import {
  shouldForceDashboardStartThisSession,
  shouldShowReturnToDashboardIndicator,
  type TournamentTransitionSettings
} from "@/lib/tournament-transition-helpers";
import { ADMIN_UI_RESET_SIGNAL_STORAGE_KEY } from "@/lib/ui-storage-keys";
import { parseJsonResponse } from "@/lib/fetch-json";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { useCurrentUser } from "@/lib/use-current-user";
import { useViewportAwarePopoverPlacement } from "@/lib/use-viewport-aware-popover-placement";
import type { UserTrophy } from "@/lib/types";
import type { MutableRefObject } from "react";

type AppShellProps = {
  children: ReactNode;
};

const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const TROPHY_POLL_INTERVAL_MS = 4000;
const DEFAULT_TOAST_DURATION_MS = 4200;
const TIP_TOAST_DURATION_MS = 6200;
const ERROR_TOAST_DURATION_MS = 7600;
const ACCESS_LEVEL_WELCOME_STORAGE_PREFIX = "pickit:last-seen-access-level";
const DASHBOARD_SESSION_LANDING_STORAGE_PREFIX = "pickit:dashboard-session-landing";
const EXPLAINER_LANGUAGE_LABELS: Record<ExplainerLanguage, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  de: "Deutsch"
};

const GLOBAL_NAV_ICONS = {
  groupStage: "/images/nav/group-stage.png",
  sidePicks: "/images/nav/side-picks.png",
  knockout: "/images/nav/knockout.png",
  leaderboards: "/images/nav/leaderboards.png",
  myGroups: "/images/nav/my-groups.png"
} as const;

function getAccessLevelLabelKey(accessLevel: AccessLevel) {
  switch (accessLevel) {
    case "captain":
      return "groups.levelCaptainTitle";
    case "manager":
      return "groups.levelManagerTitle";
    case "director":
      return "groups.levelLeagueTitle";
    case "managing_director":
      return "groups.levelLeaguePlusTitle";
    case "super_admin":
      return "groups.levelSuperAdminTitle";
    case "player":
    default:
      return "groups.levelPlayerTitle";
  }
}

function GlobalNavIcon({ src, className }: { src: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain"
      }}
    />
  );
}

function isGlobalNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const { activeLanguage, setActiveLanguage } = useResolvedAppLanguage(user, isLoading);
  const dockLanguage = activeLanguage;
  const displayLanguage = activeLanguage;
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const copy = getStrings(dockLanguage);
  const accentTheme = getLocalizedCardThemeForUserSurface({
    visualThemeId: user?.visualThemeId ?? null,
    homeTeamId: user?.homeTeamId ?? null,
    preferredLanguage: user?.preferredLanguage ?? null
  });
  const groupPredictionMode = getConfiguredGroupPredictionMode();
  const navItems = [
    {
      href: "/side-picks",
      label: copy.mySidePicks,
      ariaLabel: copy.mySidePicks,
      iconSrc: GLOBAL_NAV_ICONS.sidePicks,
      desktopIconClass: "h-10 w-10",
      dockIconClass: "h-[2.1rem] w-[2.1rem]"
    },
    ...(isFullScoresModeEnabled(groupPredictionMode)
      ? [
          {
            href: "/groups",
            label: copy.myPicks,
            ariaLabel: copy.myPicks,
            iconSrc: GLOBAL_NAV_ICONS.groupStage,
            desktopIconClass: "h-10 w-10",
            dockIconClass: "h-[2.1rem] w-[2.1rem]"
          }
        ]
      : []),
    {
      href: "/knockout",
      label: copy.knockoutPicks,
      ariaLabel: copy.knockoutPicks,
      iconSrc: GLOBAL_NAV_ICONS.knockout,
      desktopIconClass: "h-[3.125rem] w-[3.125rem]",
      dockIconClass: "bottom-nav-icon-bumped h-[2.625rem] w-[2.625rem]"
    },
    {
      href: "/leaderboard",
      label: copy.results,
      ariaLabel: copy.results,
      iconSrc: GLOBAL_NAV_ICONS.leaderboards,
      desktopIconClass: "h-10 w-10",
      dockIconClass: "h-[2.1rem] w-[2.1rem]"
    },
    {
      href: "/my-groups",
      label: copy.myGroups,
      ariaLabel: copy.myGroups,
      iconSrc: GLOBAL_NAV_ICONS.myGroups,
      desktopIconClass: "h-[3.125rem] w-[3.125rem]",
      dockIconClass: "bottom-nav-icon-bumped h-[2.625rem] w-[2.625rem]"
    }
  ];
  const [pendingCelebrationQueue, setPendingCelebrationQueue] = useState<PendingTrophyCelebration[]>([]);
  const [activeCelebration, setActiveCelebration] = useState<PendingTrophyCelebration | null>(null);
  const [readinessBanner, setReadinessBanner] = useState<string | null>(null);
  const [tournamentTransitionSettings, setTournamentTransitionSettings] = useState<TournamentTransitionSettings | null>(null);
  const [toasts, setToasts] = useState<Array<{
    id: string;
    tone: AppToastTone;
    text: string;
    dismissLabel?: string;
    dismissStorageKey?: string;
  }>>([]);
  const lastTrophySignatureRef = useRef<string>("");
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const languagePopoverPlacement = useViewportAwarePopoverPlacement({
    isOpen: isLanguageMenuOpen,
    anchorRef: languageMenuRef,
    maxHeight: 260,
    minUsefulHeight: 148
  });
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(72);
  const isOnboardingExperience = shouldHideDockForPath(pathname);
  const onboardingExitHref = "/start-playing";
  const onboardingExitLabel = t(displayLanguage, "common.back");
  const shouldShowOnboardingHeaderExit = isOnboardingExperience;
  const shouldShowAccountButton = true;

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
    const dismissToastLater = (id: string, durationMs?: number) => {
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, durationMs ?? DEFAULT_TOAST_DURATION_MS);
    };

    const enqueueToast = (detail: AppToastDetail) => {
      if (!detail?.text) {
        return;
      }

      if (detail.dismissStorageKey) {
        try {
          if (window.localStorage.getItem(detail.dismissStorageKey) === "dismissed") {
            return;
          }
        } catch {
          // Storage can be unavailable in private or constrained browser contexts.
        }
      }

      const id = detail.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [
        ...current.filter((toast) => toast.id !== id),
        {
          id,
          tone: detail.tone,
          text: detail.text,
          dismissLabel: detail.dismissLabel,
          dismissStorageKey: detail.dismissStorageKey
        }
      ]);
      const fallbackDuration =
        detail.tone === "error"
          ? ERROR_TOAST_DURATION_MS
          : detail.tone === "tip"
            ? TIP_TOAST_DURATION_MS
            : DEFAULT_TOAST_DURATION_MS;
      if (detail.durationMs !== null) {
        dismissToastLater(id, detail.durationMs ?? fallbackDuration);
      }
    };

    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<AppToastEventDetail>;
      const detail = customEvent.detail;
      if ("action" in detail) {
        setToasts((current) => current.filter((toast) => toast.id !== detail.id));
        return;
      }

      enqueueToast(detail);
    };

    window.addEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    const pendingToasts = markAppToastsReady();
    pendingToasts.forEach(enqueueToast);
    return () => {
      window.removeEventListener(APP_TOAST_EVENT, handleToast as EventListener);
    };
  }, []);

  function handleDismissToast(id: string, dismissStorageKey?: string) {
    if (dismissStorageKey) {
      try {
        window.localStorage.setItem(dismissStorageKey, "dismissed");
      } catch {
        // Dismissing the visible toast is still useful if persistence fails.
      }
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

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
    if (isLoading || !user || user.needsLegalAcceptance || user.needsProfileSetup) {
      return;
    }

    let isMounted = true;

    const loadTournamentTransitionSettings = async () => {
      try {
        const response = await fetch("/api/tournament-transition", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        });
        const result = await parseJsonResponse<
          | { ok: true; settings: TournamentTransitionSettings }
          | { ok: false; message?: string }
        >(response, "Could not load tournament transition settings.", "tournament transition settings");

        if (!isMounted || !response.ok || !result.ok) {
          return;
        }

        setTournamentTransitionSettings(result.settings);
      } catch {
        if (isMounted) {
          setTournamentTransitionSettings(null);
        }
      }
    };

    void loadTournamentTransitionSettings();

    return () => {
      isMounted = false;
    };
  }, [isLoading, user, user?.id, user?.needsLegalAcceptance, user?.needsProfileSetup]);

  useEffect(() => {
    if (typeof window === "undefined" || isLoading || !user?.id) {
      return;
    }

    const currentAccessLevel = getAccessLevel(user);
    const storageKey = `${ACCESS_LEVEL_WELCOME_STORAGE_PREFIX}:${user.id}`;

    try {
      const previousAccessLevel = normalizeAccessLevel(window.localStorage.getItem(storageKey));

      if (!previousAccessLevel) {
        window.localStorage.setItem(storageKey, currentAccessLevel);
        return;
      }

      const isUpgrade = compareAccessLevels(currentAccessLevel, previousAccessLevel) > 0;
      const shouldWelcome = isUpgrade && currentAccessLevel !== "super_admin";
      window.localStorage.setItem(storageKey, currentAccessLevel);

      if (shouldWelcome) {
        showAppToast({
          tone: "success",
          text: t(displayLanguage, "profile.levelUpToast", {
            level: t(displayLanguage, getAccessLevelLabelKey(currentAccessLevel))
          }),
          durationMs: 7600
        });
      }
    } catch (error) {
      console.warn("Could not persist access-level welcome state.", error);
    }
  }, [displayLanguage, isLoading, user]);

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
    if (
      typeof window === "undefined" ||
      isLoading ||
      !user?.id ||
      !tournamentTransitionSettings
    ) {
      return;
    }

    const sessionKey = [
      DASHBOARD_SESSION_LANDING_STORAGE_PREFIX,
      user.id,
      tournamentTransitionSettings.modality
    ].join(":");

    try {
      if (pathname === "/dashboard") {
        window.sessionStorage.setItem(sessionKey, "1");
        return;
      }

      const hasSeenSessionLanding = window.sessionStorage.getItem(sessionKey) === "1";
      if (!shouldForceDashboardStartThisSession({ pathname, hasSeenSessionLanding, settings: tournamentTransitionSettings })) {
        return;
      }

      window.sessionStorage.setItem(sessionKey, "1");
      router.replace("/dashboard");
    } catch {
      router.replace("/dashboard");
    }
  }, [isLoading, pathname, router, tournamentTransitionSettings, user]);

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
      <main className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-white px-5">
        <div className="rounded-[1rem] bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
          {t(displayLanguage, "common.loading")}
        </div>
      </main>
    );
  }

  const showReturnToDashboardIndicator =
    Boolean(user) &&
    shouldShowReturnToDashboardIndicator({
      pathname,
      settings: tournamentTransitionSettings
    });

  return (
    <AppLanguageProvider activeLanguage={activeLanguage} setActiveLanguage={setActiveLanguage}>
      <div
        className="app-shell min-h-screen min-h-[100dvh] overflow-x-clip bg-white text-gray-950"
        style={
          {
            ...(isOnboardingExperience ? { "--app-shell-padding-bottom": "0px" } : {}),
            "--app-header-height": `${headerHeight}px`,
            ...getAppAccentCssVars(accentTheme)
          } as CSSProperties
        }
      >
      <header ref={headerRef} className="app-header sticky top-0 z-40 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2.5 pl-5 pr-3 sm:pl-6 sm:pr-4">
          <Link href="/dashboard" className="shrink-0" aria-label={t(displayLanguage, "dashboard.homeAria")}>
            <ThemedPickItLogo
              alt="PICK-IT! World Cup 2026"
              src="/images/pickit-header-logo-v4.svg"
              sizes="(max-width: 767px) 92px, (max-width: 1199px) 97px, 121px"
              priority
              className="app-header-logo shrink-0"
            />
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 max-[430px]:gap-1">
            {shouldShowOnboardingHeaderExit ? (
              <Link
                href={onboardingExitHref}
                className="inline-flex h-8 items-center rounded-[0.85rem] border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light max-[399px]:px-2.5 max-[399px]:text-[10px] sm:h-9 sm:px-3"
              >
                {onboardingExitLabel}
              </Link>
            ) : null}
            {shouldShowAccessBadge(user) ? (
              <TierIconBadge accessLevel={getAccessLevel(user)} size={24} />
            ) : null}
            <NotificationsBell />
            <div ref={languageMenuRef} className="relative z-[55]">
              <button
                type="button"
                onClick={() => setIsLanguageMenuOpen((current) => !current)}
                className="inline-flex h-8 items-center gap-1 rounded-[0.85rem] border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light max-[399px]:h-8 max-[399px]:gap-1.5 max-[399px]:px-2.5 max-[399px]:text-[10px] sm:h-9 sm:px-2"
                aria-haspopup="menu"
                aria-expanded={isLanguageMenuOpen}
                aria-label={t(displayLanguage, "common.language")}
              >
                <Globe aria-hidden className="h-[18px] w-[18px] text-accent-dark max-[399px]:h-[15px] max-[399px]:w-[15px]" />
                <span>{displayLanguage.toUpperCase()}</span>
                <ChevronDown aria-hidden className="h-3 w-3 text-gray-500 max-[399px]:h-2.5 max-[399px]:w-2.5" />
              </button>
              {isLanguageMenuOpen ? (
                <div
                  style={languagePopoverPlacement.style}
                  className={`absolute right-0 z-[70] min-w-40 overflow-y-auto rounded-[1rem] border border-gray-200 bg-white p-1 shadow-xl shadow-slate-950/12 ${languagePopoverPlacement.className}`}
                >
                  {(Object.keys(EXPLAINER_LANGUAGE_LABELS) as ExplainerLanguage[]).map((language) => (
                    <button
                      key={language}
                      type="button"
                      disabled={isUpdatingLanguage}
                      onClick={async () => {
                        setActiveLanguage(language);
                        setIsLanguageMenuOpen(false);

                        if (user) {
                          setIsUpdatingLanguage(true);
                          const result = await updateCurrentUserPreferredLanguage(language);
                          if (!result.ok) {
                            showAppToast({ tone: "error", text: result.message });
                          } else {
                            router.refresh();
                          }
                          setIsUpdatingLanguage(false);
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-[0.75rem] px-3 py-2 text-left text-sm font-semibold transition ${
                        language === displayLanguage ? "bg-accent-light text-accent-dark" : "text-gray-700 hover:bg-gray-50"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
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
                aria-label={copy.myProfile}
                className="inline-flex items-center gap-1.5 rounded-[0.85rem] border border-gray-300 px-2 py-1.5 text-[11px] font-semibold text-gray-700 max-[399px]:h-8 max-[399px]:gap-1 max-[399px]:px-2.25 max-[399px]:py-0 max-[399px]:text-[10px] sm:px-2.5"
              >
                <CircleUserRound aria-hidden className="h-[17.5px] w-[17.5px] max-[399px]:h-[15px] max-[399px]:w-[15px]" />
                <span className="nonessential-header-copy max-[430px]:hidden">{t(dockLanguage, "profile.profile")}</span>
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {isOnboardingExperience ? null : (
        <nav
          className="sticky z-30 hidden w-full bg-white/95 px-4 py-2 backdrop-blur lg:block"
          style={{ top: "var(--app-header-height)" }}
          aria-label="Primary navigation"
        >
          <div
            className="mx-auto grid w-full max-w-4xl gap-2"
            style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
          >
            {navItems.map((item) => {
              const isActive = isGlobalNavItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.ariaLabel}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex min-h-[4.8rem] min-w-0 items-center justify-center gap-3.5 rounded-[0.95rem] border px-4 py-3 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 ${
                    isActive
                      ? "border-gray-300 bg-gray-100 text-gray-950 shadow-sm"
                      : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-100/70 hover:text-gray-950"
                  }`}
                >
                  <GlobalNavIcon
                    src={item.iconSrc}
                    className={`${item.desktopIconClass} ${isActive ? "text-accent-dark" : "text-gray-500 group-hover:text-gray-800"}`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <main className="main-content mx-auto w-full max-w-4xl px-4 pb-5 pt-6">
        {readinessBanner ? (
          <div className="mb-4 rounded-[1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {readinessBanner}
          </div>
        ) : null}
        {showReturnToDashboardIndicator ? (
          <div className="mb-4 flex justify-end">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-gray-700 shadow-sm transition hover:border-accent hover:bg-accent-light hover:text-accent-dark"
            >
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              <span>{t(displayLanguage, "dashboard.title")}</span>
            </Link>
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
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">{toast.text}</span>
                  {toast.dismissLabel ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] opacity-80 transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                      onClick={() => handleDismissToast(toast.id, toast.dismissStorageKey)}
                    >
                      {toast.dismissLabel}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isOnboardingExperience ? null : (
        <nav
          className="bottom-nav-dock fixed inset-x-0 bottom-0 z-30 border-t border-neutral-700 bg-neutral-900 lg:hidden"
        >
          <div
            className="bottom-nav-dock-inner relative mx-auto grid w-full max-w-4xl items-center gap-0.5 px-2 py-1.5"
            style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
          >
            {navItems.map((item) => {
              const isActive = isGlobalNavItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.ariaLabel}
                  aria-current={isActive ? "page" : undefined}
                  className={`bottom-nav-dock-item relative flex min-h-[4.45rem] w-full min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[10px] font-semibold leading-none transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-100/20 active:scale-[0.985] sm:text-[11px] ${
                    isActive
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  {isActive ? (
                    <span
                      aria-hidden
                      className="bottom-nav-active-indicator absolute inset-x-4 top-0.5 h-0.5 rounded-full bg-accent/85"
                    />
                  ) : null}
                  <GlobalNavIcon
                    src={item.iconSrc}
                    className={`bottom-nav-icon ${item.dockIconClass} ${isActive ? "text-accent-light" : ""}`}
                  />
                  <span className="bottom-nav-dock-label block max-w-full text-center leading-tight whitespace-normal">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
    </AppLanguageProvider>
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
