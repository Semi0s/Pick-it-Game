"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CircleHelp, ListOrdered, Network, Sparkles, SquareCheckBig, Trophy } from "lucide-react";
import { fetchDashboardGroupAccessAction } from "@/app/my-groups/actions";
import { AdminStatsSection, AdminToolsSection, AdminMessage } from "@/components/admin/AdminHomeClient";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { fetchAdminCounts, type AdminCounts } from "@/lib/admin-data";
import { showAppToast } from "@/lib/app-toast";
import { InviteEntryForm, normalizeInviteTokenInput } from "@/components/player-management/Shared";
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

  const openMatches = groupMatches.filter((match) => canEditPrediction(match.status));
  const completedCount = groupMatches.filter((match) =>
    predictions.some((prediction) => prediction.matchId === match.id)
  ).length;
  const nextOpenMatch = [...openMatches].sort((left, right) => +new Date(left.kickoffTime) - +new Date(right.kickoffTime))[0] ?? null;
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
      <section
        className="relative rounded-lg bg-gray-100 p-5"
      >
        <div>
          <Link
            href="/help"
            className="absolute right-2 top-0 inline-flex items-center gap-2 px-2 py-2 text-sm font-bold text-gray-800 transition hover:text-accent-dark sm:right-3"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-accent-dark">
              <CircleHelp aria-hidden className="h-4 w-4" />
            </span>
            {dashboardCopy.help}
          </Link>
          <p className="text-4xl font-black uppercase leading-none tracking-wide text-accent-dark">{dashboardCopy.hello}</p>
          <h2 className="mt-2 text-4xl font-black leading-tight text-gray-950 sm:text-5xl">
            {user?.name ?? "Player"}
          </h2>
          <Link
            href={heroCtaHref}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-3 text-base font-bold text-white transition hover:bg-accent-dark sm:w-auto"
          >
            <SquareCheckBig aria-hidden className="h-4 w-4 text-white" />
            {heroCtaLabel}
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Updates</p>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Upcoming important news and information will be presented in this card, including testing days and new feature announcements. Stay in tune and visit often for the latest updates.
        </p>
      </section>

      {user?.role === "admin" ? (
        <section className="space-y-3 rounded-lg border border-accent-light bg-accent-light/40 p-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Admin</p>
            <h3 className="mt-1 text-xl font-black text-gray-950">Manage the challenge.</h3>
          </div>
          {adminError ? <AdminMessage tone="error" message={adminError} /> : null}
          <AdminToolsSection />
          <AdminStatsSection counts={adminCounts} />
        </section>
      ) : null}

      {user && groupAccess && !groupAccess.hasAnyGroups ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-800">Group Access</p>
          <h3 className="mt-1 text-xl font-black text-gray-950">You are not in any groups right now.</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
            Your account and predictions are still here. Ask a manager for a new invite link to join another group, or jump back into scoring while you wait.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/my-groups"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
            >
              Open My Groups
            </Link>
            <Link
              href="/groups"
              className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-dark"
            >
              Go to Score Picks
            </Link>
          </div>
          <div className="mt-4">
            <InviteEntryForm
              value={inviteEntryValue}
              onValueChange={(value) => {
                setInviteEntryValue(value);
                if (inviteEntryError) {
                  setInviteEntryError(null);
                }
              }}
              onSubmit={handleInviteEntrySubmit}
              submitLabel="Open Invite"
              description="Paste a fresh group invite link or token to jump straight back into signup or joining."
            />
          </div>
          {inviteEntryError ? <div className="mt-3"><AdminMessage tone="error" message={inviteEntryError} /></div> : null}
        </section>
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
