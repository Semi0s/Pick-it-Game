"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ListOrdered, Network, Sparkles, Trophy } from "lucide-react";
import { fetchDashboardGroupAccessAction } from "@/app/my-groups/actions";
import { AppUpdatesCard } from "@/components/AppUpdatesCard";
import { DashboardAdminPanel } from "@/components/dashboard/DashboardAdminPanel";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DashboardNoGroupsPanel } from "@/components/dashboard/DashboardNoGroupsPanel";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { fetchAdminCounts, type AdminCounts } from "@/lib/admin-data";
import { showAppToast } from "@/lib/app-toast";
import { normalizeInviteTokenInput } from "@/components/player-management/Shared";
import {
  getExplainerLanguageForUser,
  normalizeExplainerLanguage,
  PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY,
  type ExplainerLanguage
} from "@/lib/i18n";
import { fetchPlayerPredictions } from "@/lib/player-predictions";
import { canEditPrediction } from "@/lib/prediction-state";
import { getStoredPredictions } from "@/lib/prediction-store";
import type { MatchWithTeams, Prediction } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";

const DASHBOARD_DISPLAY_COPY: Record<ExplainerLanguage, { hello: string; help: string }> = {
  en: { hello: "Hello", help: "Help" },
  es: { hello: "Hola", help: "Ayuda" },
  fr: { hello: "Bonjour", help: "Aide" },
  pt: { hello: "Olá", help: "Ajuda" },
  de: { hello: "Hallo", help: "Hilfe" }
};

const DASHBOARD_LOGO_HINT_STORAGE_KEY_PREFIX = "pickit:dashboard-logo-hint-shown";

const DASHBOARD_LOGO_HINT_COPY: Record<ExplainerLanguage, string> = {
  en: "Tap the PICK-IT logo above to return to this page again.",
  es: "Toca el logo de PICK-IT! para volver aquí.",
  fr: "Touchez le logo PICK-IT! pour revenir ici.",
  pt: "Toque no logo do PICK-IT! para voltar aqui.",
  de: "Tippe auf das PICK-IT!-Logo, um hierher zurückzukehren."
};

export function DashboardOverview() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [groupMatches, setGroupMatches] = useState<MatchWithTeams[]>(() => getLocalGroupMatches());
  const [adminCounts, setAdminCounts] = useState<AdminCounts | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [groupAccess, setGroupAccess] = useState<{
    hasAnyGroups: boolean;
    joinedGroupCount: number;
    managedGroupCount: number;
  } | null>(null);
  const [inviteEntryValue, setInviteEntryValue] = useState("");
  const [inviteEntryError, setInviteEntryError] = useState<string | null>(null);
  const [displayLanguage] = usePersistentExplainerLanguage(user);
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  const refreshPredictions = useCallback(async () => {
    if (!user) {
      setPredictions([]);
      return;
    }

    try {
      const items = await fetchPlayerPredictions(user.id);
      setPredictions(items);
    } catch (error) {
      console.error("Could not refresh dashboard predictions.", { userId: user.id, error });
      setPredictions((currentPredictions) => currentPredictions);
    }
  }, [user]);

  useEffect(() => {
    let isMounted = true;

    fetchGroupMatchesForPredictions()
      .then((items) => {
        if (isMounted) {
          setGroupMatches(items);
        }
      })
      .catch(() => {
        if (isMounted) {
          setGroupMatches(getLocalGroupMatches());
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setPredictions([]);
      return;
    }

    setPredictions(getStoredPredictions(user.id));
    refreshPredictions()
      .catch(() => {
        setPredictions(getStoredPredictions(user.id));
      });
  }, [refreshPredictions, user]);

  useEffect(() => {
    if (typeof window === "undefined" || !user) {
      return;
    }

    function handleWindowFocus() {
      refreshPredictions().catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshPredictions().catch(() => undefined);
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshPredictions, user]);

  useEffect(() => {
    if (!user) {
      setGroupAccess(null);
      return;
    }

    let isMounted = true;
    fetchDashboardGroupAccessAction()
      .then((result) => {
        if (!isMounted || !result.ok) {
          return;
        }

        setGroupAccess({
          hasAnyGroups: result.groupAccess.hasAnyGroups,
          joinedGroupCount: result.groupAccess.joinedGroupCount,
          managedGroupCount: result.groupAccess.managedGroupCount
        });
      })
      .catch(() => {
        if (isMounted) {
          setGroupAccess(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (user?.role !== "admin") {
      return;
    }

    let isMounted = true;
    fetchAdminCounts()
      .then((counts) => {
        if (isMounted) {
          setAdminCounts(counts);
        }
      })
      .catch((error: Error) => {
        if (isMounted) {
          setAdminError(error.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user?.role]);

  const savedMatchIds = useMemo(() => new Set(predictions.map((prediction) => prediction.matchId)), [predictions]);
  const openMatches = useMemo(
    () => groupMatches.filter((match) => canEditPrediction(match.status)),
    [groupMatches]
  );
  const completedCount = useMemo(
    () => groupMatches.filter((match) => savedMatchIds.has(match.id)).length,
    [groupMatches, savedMatchIds]
  );
  const nextOpenMatch = useMemo(
    () =>
      [...openMatches].sort((left, right) => +new Date(left.kickoffTime) - +new Date(right.kickoffTime))[0] ?? null,
    [openMatches]
  );
  const heroCtaLabel = completedCount > 0 ? "My Next Pick" : "My Picks";
  const heroCtaHref = "/groups?focus=next";
  const dashboardCopy = DASHBOARD_DISPLAY_COPY[displayLanguage];

  useEffect(() => {
    if (typeof window === "undefined" || !user || groupMatches.length === 0) {
      return;
    }

    const hasReachedHalfway = completedCount >= Math.ceil(groupMatches.length / 2);
    if (hasReachedHalfway) {
      return;
    }

    const storageKey = `${DASHBOARD_LOGO_HINT_STORAGE_KEY_PREFIX}:${user.id}`;

    try {
      if (window.sessionStorage.getItem(storageKey) === "true") {
        return;
      }

      window.sessionStorage.setItem(storageKey, "true");
      showAppToast({ tone: "tip", text: DASHBOARD_LOGO_HINT_COPY[displayLanguage], durationMs: 5200 });
    } catch (error) {
      console.warn("Could not persist dashboard logo hint state.", error);
      showAppToast({ tone: "tip", text: DASHBOARD_LOGO_HINT_COPY[displayLanguage], durationMs: 5200 });
    }
  }, [completedCount, displayLanguage, groupMatches.length, user]);

  function handleInviteEntrySubmit() {
    const token = normalizeInviteTokenInput(inviteEntryValue);
    if (!token) {
      setInviteEntryError("Paste a valid invite link or token first.");
      return;
    }

    setInviteEntryError(null);
    router.push(`/my-groups?invite=${encodeURIComponent(token)}`);
  }

  return (
    <div className="space-y-5">
      <DashboardHero
        name={user?.name ?? "Player"}
        ctaHref={heroCtaHref}
        ctaLabel={heroCtaLabel}
        dashboardCopy={dashboardCopy}
      />

      <AppUpdatesCard />

      {user?.role === "admin" ? (
        <DashboardAdminPanel
          adminCounts={adminCounts}
          adminError={adminError}
          isSuperAdmin={user.accessLevel === "super_admin"}
        />
      ) : null}

      {user && groupAccess && !groupAccess.hasAnyGroups ? (
        <DashboardNoGroupsPanel
          inviteEntryValue={inviteEntryValue}
          inviteEntryError={inviteEntryError}
          onInviteEntryChange={(value) => {
            setInviteEntryValue(value);
            if (inviteEntryError) {
              setInviteEntryError(null);
            }
          }}
          onInviteEntrySubmit={handleInviteEntrySubmit}
        />
      ) : null}

      <section className="grid grid-cols-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <DashboardStatPane
          icon={<CalendarDays className="h-5 w-5" />}
          label="Group matches"
          value={String(groupMatches.length)}
        />
        <DashboardStatPane
          icon={<Sparkles className="h-5 w-5" />}
          label="Picks saved"
          value={`${completedCount}/${groupMatches.length}`}
        />
        <DashboardStatPane
          icon={<span className="text-xl leading-none">⏱</span>}
          label="Next match"
          value={formatNextMatchCountdown(nextOpenMatch?.kickoffTime ?? null)}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <DashboardLinkCard
          href="/leaderboard"
          icon={ListOrdered}
          title="Leaderboard"
          copy="Tap a player to compare group picks."
        />
        <DashboardLinkCard
          href="/knockout"
          icon={Network}
          title="Knockout Picks"
          copy="Bracket picks from the Round of 32 to the Final."
        />
        <DashboardLinkCard
          href="/trophies"
          icon={Trophy}
          title="Additional Trophies"
          copy="Tournament winner, Golden Boot, and MVP picks."
        />
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Phase 1 scoring preview</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Group-stage picks score 3 points for the correct outcome, plus 1 more for the exact goal difference,
          or 5 more for the exact score once results are entered.
        </p>
      </section>
    </div>
  );
}

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function DashboardStatPane({ icon, label, value }: StatCardProps) {
  return (
    <div className="flex min-h-[152px] flex-col items-center justify-center border-r border-gray-200 p-4 text-center last:border-r-0">
      <span className="inline-flex h-5 w-5 items-center justify-center text-accent-dark">{icon}</span>
      <p className="mt-4 text-2xl font-black">{value}</p>
      <p className="mt-1 text-sm font-semibold text-gray-600">{label}</p>
    </div>
  );
}

type DashboardLinkCardProps = {
  href: string;
  icon: typeof CalendarDays;
  title: string;
  copy: string;
};

function DashboardLinkCard({ href, icon: Icon, title, copy }: DashboardLinkCardProps) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-accent hover:bg-accent-light"
    >
      <Icon aria-hidden className="h-5 w-5 text-accent-dark" />
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600">{copy}</p>
    </Link>
  );
}

function usePersistentExplainerLanguage(user: { preferredLanguage?: string | null } | null | undefined) {
  const [displayLanguage, setDisplayLanguage] = useState<ExplainerLanguage>(() => {
    if (typeof window !== "undefined") {
      try {
        const storedValue = window.localStorage.getItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY);
        if (storedValue) {
          return normalizeExplainerLanguage(storedValue);
        }
      } catch (error) {
        console.warn("Could not restore dashboard helper language.", error);
      }
    }

    return getExplainerLanguageForUser(user);
  });

  useEffect(() => {
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
      console.warn("Could not restore dashboard helper language.", error);
    }

    setDisplayLanguage(getExplainerLanguageForUser(user));
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, displayLanguage);
      window.dispatchEvent(new CustomEvent("pickit:helper-language-changed"));
    } catch (error) {
      console.warn("Could not persist dashboard helper language.", error);
    }
  }, [displayLanguage]);

  return [displayLanguage, setDisplayLanguage] as const;
}

function formatNextMatchCountdown(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "TBD";
  }

  const diffMs = new Date(kickoffTime).getTime() - Date.now();
  if (diffMs <= 0) {
    return "Live";
  }

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
