"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Network, Sparkles, Trophy } from "lucide-react";
import { fetchDashboardGroupAccessAction } from "@/app/my-groups/actions";
import { AppUpdatesCard } from "@/components/AppUpdatesCard";
import { GroupStandingsMiniTable } from "@/components/GroupStandingsMiniTable";
import { DashboardAdminPanel } from "@/components/dashboard/DashboardAdminPanel";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DashboardNoGroupsPanel } from "@/components/dashboard/DashboardNoGroupsPanel";
import {
  InlineDisclosureButton,
  WindowChoiceRail,
  useSessionDisclosureState,
  useSessionJsonState
} from "@/components/player-management/Shared";
import { fetchNextAutoPick, storeAutoPickDraft } from "@/lib/auto-pick-client";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { buildFinalGroupStandings, getGroupShortLabel } from "@/lib/group-standings";
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
  en: { hello: "Hello", help: "RULES" },
  es: { hello: "Hola", help: "RULES" },
  fr: { hello: "Bonjour", help: "RULES" },
  pt: { hello: "Olá", help: "RULES" },
  de: { hello: "Hallo", help: "RULES" }
};

const DASHBOARD_LOGO_HINT_STORAGE_KEY_PREFIX = "pickit:dashboard-logo-hint-shown";
const DASHBOARD_STANDINGS_GROUP_STORAGE_KEY = "dashboard-standings-group";
const DASHBOARD_STANDINGS_DISCLOSURE_STORAGE_KEY = "dashboard-standings-disclosure";

const DASHBOARD_LOGO_HINT_COPY: Record<ExplainerLanguage, string> = {
  en: "Tap the PICK-IT logo above to return to this page again.",
  es: "Toca el logo de PICK-IT! para volver aquí.",
  fr: "Touchez le logo PICK-IT! pour revenir ici.",
  pt: "Toque no logo do PICK-IT! para voltar aqui.",
  de: "Tippe auf das PICK-IT!-Logo, um hierher zurückzukehren."
};

const AUTO_PICK_LABEL_COPY = {
  en: "Auto Pick Next Match",
  es: "Auto Elegir Próximo Partido"
} as const;

const AUTO_PICK_LOADING_COPY = {
  en: "Auto Picking...",
  es: "Eligiendo..."
} as const;

const AUTO_PICK_EMPTY_COPY = {
  en: "No open matches available right now.",
  es: "No hay partidos disponibles en este momento."
} as const;

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
  const [isAutoPicking, setIsAutoPicking] = useState(false);
  const [selectedStandingsGroup, setSelectedStandingsGroup] = useSessionJsonState<string>(
    DASHBOARD_STANDINGS_GROUP_STORAGE_KEY,
    ""
  );
  const [isStandingsOpen, setIsStandingsOpen] = useSessionDisclosureState(
    DASHBOARD_STANDINGS_DISCLOSURE_STORAGE_KEY,
    false
  );

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
  const availableStandingsGroups = useMemo(
    () =>
      Array.from(
        new Set(groupMatches.map((match) => match.groupName).filter((groupName): groupName is string => Boolean(groupName)))
      ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    [groupMatches]
  );
  const homeTeamGroupName = useMemo(() => {
    if (!user?.homeTeamId) {
      return null;
    }

    const homeTeamMatch = groupMatches.find(
      (match) => match.homeTeam?.id === user.homeTeamId || match.awayTeam?.id === user.homeTeamId
    );

    return homeTeamMatch?.groupName ?? null;
  }, [groupMatches, user?.homeTeamId]);
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
  const autoPickLanguage = displayLanguage === "es" ? "es" : "en";
  const resolvedStandingsGroup =
    homeTeamGroupName && availableStandingsGroups.includes(homeTeamGroupName)
      ? homeTeamGroupName
      : selectedStandingsGroup && availableStandingsGroups.includes(selectedStandingsGroup)
        ? selectedStandingsGroup
        : availableStandingsGroups[0] ?? "";
  const tournamentStandingsRows = useMemo(
    () => (resolvedStandingsGroup ? buildFinalGroupStandings(groupMatches, resolvedStandingsGroup) : []),
    [groupMatches, resolvedStandingsGroup]
  );

  useEffect(() => {
    if (!availableStandingsGroups.length) {
      return;
    }

    if (resolvedStandingsGroup !== selectedStandingsGroup) {
      setSelectedStandingsGroup(resolvedStandingsGroup);
    }
  }, [availableStandingsGroups.length, resolvedStandingsGroup, selectedStandingsGroup, setSelectedStandingsGroup]);

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

  async function handleAutoPickAction() {
    setIsAutoPicking(true);

    try {
      const suggestion = await fetchNextAutoPick();
      storeAutoPickDraft(suggestion);
      router.push("/groups");
    } catch (error) {
      const message = error instanceof Error ? error.message : AUTO_PICK_EMPTY_COPY[autoPickLanguage];
      const localizedMessage =
        message === AUTO_PICK_EMPTY_COPY.en ? AUTO_PICK_EMPTY_COPY[autoPickLanguage] : message;

      showAppToast({
        tone: localizedMessage === AUTO_PICK_EMPTY_COPY[autoPickLanguage] ? "tip" : "error",
        text: localizedMessage
      });
    } finally {
      setIsAutoPicking(false);
    }
  }

  return (
    <div className="space-y-5">
      <DashboardHero
        name={user?.name ?? "Player"}
        ctaHref={heroCtaHref}
        ctaLabel={heroCtaLabel}
        autoPickLabel={AUTO_PICK_LABEL_COPY[autoPickLanguage]}
        autoPickLoadingLabel={AUTO_PICK_LOADING_COPY[autoPickLanguage]}
        isAutoPicking={isAutoPicking}
        onAutoPick={handleAutoPickAction}
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

      {availableStandingsGroups.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Tournament Standings</p>
            <InlineDisclosureButton
              isOpen={isStandingsOpen}
              variant="subtle"
              onClick={() => setIsStandingsOpen((current) => !current)}
            />
          </div>

          {isStandingsOpen ? (
            <>
              <WindowChoiceRail
                activeItemKey={resolvedStandingsGroup}
                onActiveItemChange={setSelectedStandingsGroup}
                showControls={availableStandingsGroups.length > 1}
              >
                {availableStandingsGroups.map((groupName) => {
                  const isActive = resolvedStandingsGroup === groupName;

                  return (
                    <button
                      key={groupName}
                      type="button"
                      data-choice-key={groupName}
                    onClick={() => setSelectedStandingsGroup(groupName)}
                      className={`rounded-md border px-2 py-1.5 text-sm font-bold transition ${
                        isActive
                          ? "border-accent bg-accent text-white"
                          : "border-gray-300 bg-white text-gray-700 hover:border-accent hover:bg-accent-light"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 text-[12px] font-black leading-none">
                        <span>Group</span>
                        <span>{getGroupShortLabel(groupName)}</span>
                      </span>
                    </button>
                  );
                })}
              </WindowChoiceRail>

              <GroupStandingsMiniTable rows={tournamentStandingsRows} homeTeamId={user?.homeTeamId ?? null} />
            </>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
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
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">How To Play</p>
        <div className="mt-3 space-y-4 text-sm leading-6 text-gray-600">
          <div>
            <p className="font-bold text-gray-950">Make Your Picks</p>
            <p>Predict the score of every match.</p>
            <p>You can edit your picks until kickoff.</p>
            <p>Once a match starts, it is locked and cannot be changed.</p>
          </div>

          <div>
            <p className="font-bold uppercase tracking-wide text-gray-950">Match Status</p>
            <p>Open — You can make or edit picks</p>
            <p>Locked — Match has started, picks are closed</p>
            <p>Final — Match is finished, points are awarded</p>
          </div>

          <div>
            <p className="font-bold uppercase tracking-wide text-gray-950">Scoring (Group Stage)</p>
            <p>For each match:</p>
            <div className="pl-4">
              <p>Correct winner or draw: +3 points</p>
              <p>Exact score: +8 points total</p>
              <p>Correct goal difference (but not exact): +4 points total</p>
              <p className="mt-2 font-bold text-gray-950">Examples:</p>
              <p>Pick 2–1, result 2–1 → 8 points</p>
              <p>Pick 2–1, result 3–2 → 4 points</p>
              <p>Pick 2–1, result 1–0 → 3 points</p>
              <p>Wrong outcome → 0 points</p>
            </div>
          </div>

          <div>
            <p className="font-bold uppercase tracking-wide text-gray-950">Group Standings (Prediction Mode)</p>
            <p>Standings are based on your picks, not real results, until matches are final.</p>
            <p>This helps you see which teams advance based on your predictions.</p>
          </div>

          <div>
            <p className="font-bold uppercase tracking-wide text-gray-950">Leaderboards</p>
            <p>Global leaderboard includes all players</p>
            <p>Group leaderboards include only your groups</p>
            <p>Rankings update after matches are final</p>
          </div>

          <div>
            <p className="font-bold uppercase tracking-wide text-gray-950">Knockout Stage</p>
            <p>You will predict who advances and the score</p>
            <p>Later rounds may be worth more points</p>
          </div>

          <div>
            <p className="font-bold uppercase tracking-wide text-gray-950">Side Picks</p>
            <p>Optional predictions like Champion, MVP, or Golden Boot</p>
            <p>These may add bonus points</p>
          </div>

          <div>
            <p className="font-bold uppercase tracking-wide text-gray-950">Key Tips</p>
            <p>No pick = 0 points</p>
            <p>Picks lock at kickoff</p>
            <p>Exact scores earn the most points</p>
            <p>Consistency matters more than randomness</p>
          </div>
        </div>
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
    <div className="flex min-h-[112px] flex-col items-center justify-center border-r border-gray-200 px-4 py-3.5 text-center last:border-r-0">
      <span className="inline-flex h-5 w-5 items-center justify-center text-accent-dark">{icon}</span>
      <p className="mt-3 text-2xl font-black">{value}</p>
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
