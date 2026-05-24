"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Trophy, X } from "lucide-react";
import { AppUpdatesCard } from "@/components/AppUpdatesCard";
import { GroupStandingsMiniTable } from "@/components/GroupStandingsMiniTable";
import { DashboardAdminPanel } from "@/components/dashboard/DashboardAdminPanel";
import { DashboardCommandCenter } from "@/components/dashboard/DashboardCommandCenter";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DashboardNoGroupsPanel } from "@/components/dashboard/DashboardNoGroupsPanel";
import {
  InlineDisclosureButton,
  WindowChoiceRail,
  useSessionDisclosureState,
  useSessionJsonState
} from "@/components/player-management/Shared";
import {
  dismissMessageId,
  getDashboardHomeMessageStorageKey,
  isMessageDismissed,
  parseDismissedMessageIds,
  serializeDismissedMessageIds,
  type DashboardCommandCenterSummary
} from "@/lib/dashboard-home";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import {
  getGroupShortLabel,
  normalizeGroupKey,
  resolvePreferredStandingsGroupSelection
} from "@/lib/group-standings";
import { buildGroupStandingsByGroup, buildQualifiedTeamSeeds } from "@/lib/knockout-seeding";
import { fetchAdminCounts, type AdminCounts } from "@/lib/admin-data";
import { shouldHideStrategyModeForLaunch } from "@/lib/group-prediction-mode";
import { normalizeInviteTokenInput } from "@/components/player-management/Shared";
import {
  getExplainerLanguageForUser,
  normalizeExplainerLanguage,
  PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY,
  type ExplainerLanguage
} from "@/lib/i18n";
import type { MatchWithTeams } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";

const DASHBOARD_DISPLAY_COPY: Record<ExplainerLanguage, { hello: string; help: string }> = {
  en: { hello: "Hello", help: "RULES" },
  es: { hello: "Hola", help: "RULES" },
  fr: { hello: "Bonjour", help: "RULES" },
  pt: { hello: "Olá", help: "RULES" },
  de: { hello: "Hallo", help: "RULES" }
};

const DASHBOARD_LOGO_HINT_MESSAGE_ID = "dashboard-logo-hint-v2";
const DASHBOARD_LOGO_HINT_DISMISSED_STORAGE_KEY_PREFIX = "pickit:dashboard-logo-hint-dismissed";
const DASHBOARD_LOGO_HINT_DISMISSED_SESSION_KEY_PREFIX = "pickit:dashboard-logo-hint-dismissed-session";
const DASHBOARD_STANDINGS_GROUP_STORAGE_KEY = "dashboard-standings-group";
const DASHBOARD_STANDINGS_DISCLOSURE_STORAGE_KEY = "dashboard-standings-disclosure";
const DASHBOARD_HOW_TO_PLAY_DISCLOSURE_STORAGE_KEY = "dashboard-how-to-play-disclosure";
const DASHBOARD_LOGO_HINT_COPY: Record<ExplainerLanguage, string> = {
  en: "Tap the PICK-IT logo above to return to this page again.",
  es: "Toca el logo de PICK-IT! para volver aquí.",
  fr: "Touchez le logo PICK-IT! pour revenir ici.",
  pt: "Toque no logo do PICK-IT! para voltar aqui.",
  de: "Tippe auf das PICK-IT!-Logo, um hierher zurückzukehren."
};
const DASHBOARD_GROUP_MATCH_REFRESH_INTERVAL_MS = 15000;
type DashboardGroupAccessResponse = {
  ok: true;
  groupAccess: {
    hasAnyGroups: boolean;
    joinedGroupCount: number;
    managedGroupCount: number;
  };
  dashboardUiResetEpoch: number;
} | {
  ok: false;
  message: string;
};

function isDashboardGroupAccessResponse(value: unknown): value is DashboardGroupAccessResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "ok" in value;
}

export function DashboardOverview({
  initialGlobalChallengeSummary,
  initialCommandCenterSummary,
  initialGroupAccess
}: {
  initialGlobalChallengeSummary?: {
    groupStrategy: { points: number | null; maxPoints: number; status: string };
    knockout: { points: number | null; maxPoints: number; status: string };
    totalPoints: number | null;
    totalMaxPoints: number;
    prompt: string | null;
  } | null;
  initialCommandCenterSummary: DashboardCommandCenterSummary;
  initialGroupAccess: {
    hasAnyGroups: boolean;
    joinedGroupCount: number;
    managedGroupCount: number;
    dashboardUiResetEpoch: number;
  } | null;
}) {
  const router = useRouter();
  const { user, isLoading: isCurrentUserLoading } = useCurrentUser();
  const currentUserId = user?.id ?? null;
  const [groupMatches, setGroupMatches] = useState<MatchWithTeams[]>(() => getLocalGroupMatches());
  const [adminCounts, setAdminCounts] = useState<AdminCounts | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [groupAccess, setGroupAccess] = useState<{
    hasAnyGroups: boolean;
    joinedGroupCount: number;
    managedGroupCount: number;
    dashboardUiResetEpoch: number;
  } | null>(initialGroupAccess);
  const [inviteEntryValue, setInviteEntryValue] = useState("");
  const [inviteEntryError, setInviteEntryError] = useState<string | null>(null);
  const [displayLanguage] = usePersistentExplainerLanguage(user);
  const [showDashboardLogoHint, setShowDashboardLogoHint] = useState(false);
  const [selectedStandingsGroup, setSelectedStandingsGroup, selectedStandingsGroupState] = useSessionJsonState<string>(
    DASHBOARD_STANDINGS_GROUP_STORAGE_KEY,
    ""
  );
  const [isStandingsOpen, setIsStandingsOpen] = useSessionDisclosureState(
    DASHBOARD_STANDINGS_DISCLOSURE_STORAGE_KEY,
    true
  );
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useSessionDisclosureState(
    DASHBOARD_HOW_TO_PLAY_DISCLOSURE_STORAGE_KEY,
    false
  );
  const refreshGroupAccess = useCallback(async () => {
    if (!user) {
      setGroupAccess(null);
      return;
    }

    try {
      const response = await fetch("/api/dashboard/group-access", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });
      const responseText = await response.text();
      if (!responseText) {
        return;
      }

      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(responseText);
      } catch (error) {
        console.warn("Could not parse dashboard group access response.", {
          status: response.status,
          contentType: response.headers.get("content-type"),
          preview: responseText.slice(0, 180),
          error
        });
        return;
      }

      if (!isDashboardGroupAccessResponse(parsedResult) || !parsedResult.ok) {
        return;
      }

      setGroupAccess({
        hasAnyGroups: parsedResult.groupAccess.hasAnyGroups,
        joinedGroupCount: parsedResult.groupAccess.joinedGroupCount,
        managedGroupCount: parsedResult.groupAccess.managedGroupCount,
        dashboardUiResetEpoch: parsedResult.dashboardUiResetEpoch
      });
    } catch {
      setGroupAccess((current) => current);
    }
  }, [user]);

  const refreshGroupMatches = useCallback(async () => {
    try {
      const items = await fetchGroupMatchesForPredictions();
      setGroupMatches(items);
    } catch (error) {
      console.error("Could not refresh dashboard group matches.", { error });
      setGroupMatches((currentMatches) => currentMatches);
    }
  }, []);

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
    if (typeof window === "undefined" || !user) {
      return;
    }

    function handleWindowFocus() {
      refreshGroupAccess().catch(() => undefined);
      refreshGroupMatches().catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshGroupAccess().catch(() => undefined);
        refreshGroupMatches().catch(() => undefined);
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const pollWhenVisible = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshGroupAccess().catch(() => undefined);
        refreshGroupMatches().catch(() => undefined);
      }
    }, DASHBOARD_GROUP_MATCH_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(pollWhenVisible);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshGroupAccess, refreshGroupMatches, user]);

  useEffect(() => {
    if (!user) {
      setGroupAccess(null);
      return;
    }

    refreshGroupAccess().catch(() => undefined);
  }, [refreshGroupAccess, user]);

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

  const availableStandingsGroups = useMemo(
    () =>
      Array.from(
        new Set(
          groupMatches
            .map((match) => normalizeGroupKey(match.groupName))
            .filter((groupName): groupName is string => Boolean(groupName))
        )
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

    return normalizeGroupKey(homeTeamMatch?.groupName) ?? null;
  }, [groupMatches, user?.homeTeamId]);
  const dashboardCopy = DASHBOARD_DISPLAY_COPY[displayLanguage];
  const { selectedGroup: resolvedStandingsGroup } = resolvePreferredStandingsGroupSelection({
    availableGroups: availableStandingsGroups,
    storedGroup: selectedStandingsGroup,
    homeTeamGroup: homeTeamGroupName
  });
  const allGroupTeams = useMemo(
    () =>
      Array.from(
        new Map(
          groupMatches.flatMap((match) => {
            const entries: Array<[string, NonNullable<MatchWithTeams["homeTeam"]>]> = [];
            if (match.homeTeam?.id) {
              entries.push([match.homeTeam.id, match.homeTeam]);
            }
            if (match.awayTeam?.id) {
              entries.push([match.awayTeam.id, match.awayTeam]);
            }
            return entries;
          })
        ).values()
      ),
    [groupMatches]
  );
  const standingsByGroup = useMemo(
    () =>
      buildGroupStandingsByGroup(
        groupMatches.map((match) => ({
          id: match.id,
          stage: match.stage,
          groupName: match.groupName,
          status: match.status,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          homeScore: match.homeScore ?? null,
          awayScore: match.awayScore ?? null
        })),
        allGroupTeams
      ),
    [allGroupTeams, groupMatches]
  );
  const qualifyingThirdPlaceTeamIds = useMemo(() => {
    const ids = new Set<string>();

    try {
      const { rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(standingsByGroup);
      for (const seed of rankedThirdPlaceTeams) {
        ids.add(seed.teamId);
      }
    } catch (error) {
      console.warn("Could not determine tournament third-place qualifiers for dashboard standings.", error);
    }

    return ids;
  }, [standingsByGroup]);
  const tournamentStandingsRows = useMemo(() => {
    const rows = resolvedStandingsGroup ? standingsByGroup.get(resolvedStandingsGroup) ?? [] : [];
    return rows.map((row, index) => ({
      ...row,
      teamCode: row.teamCode ?? row.teamName.slice(0, 3).toUpperCase(),
      rank: row.rank || index + 1,
      isHomeTeam: Boolean(user?.homeTeamId && row.teamId === user.homeTeamId),
      isQualifier: index < 2 || (index === 2 && qualifyingThirdPlaceTeamIds.has(row.teamId)),
      isPossibleQualifier: false
    }));
  }, [qualifyingThirdPlaceTeamIds, resolvedStandingsGroup, standingsByGroup, user?.homeTeamId]);
  useEffect(() => {
    if (!availableStandingsGroups.length) {
      return;
    }

    const hasValidStoredSelection =
      selectedStandingsGroupState.hasStoredValue && availableStandingsGroups.includes(selectedStandingsGroup);

    if (!hasValidStoredSelection && resolvedStandingsGroup !== selectedStandingsGroup) {
      setSelectedStandingsGroup(resolvedStandingsGroup);
    }
  }, [
    availableStandingsGroups.length,
    resolvedStandingsGroup,
    availableStandingsGroups,
    selectedStandingsGroup,
    selectedStandingsGroupState.hasStoredValue,
    setSelectedStandingsGroup
  ]);

  useEffect(() => {
    const messageStorageKey = getDashboardHomeMessageStorageKey({
      userId: currentUserId,
      isUserLoading: isCurrentUserLoading
    });

    if (typeof window === "undefined" || !messageStorageKey) {
      return;
    }

    const sharedPersistentStorageKey = DASHBOARD_LOGO_HINT_DISMISSED_STORAGE_KEY_PREFIX;
    const sharedSessionStorageKey = DASHBOARD_LOGO_HINT_DISMISSED_SESSION_KEY_PREFIX;
    const legacyPersistentStorageKey = currentUserId
      ? `${DASHBOARD_LOGO_HINT_DISMISSED_STORAGE_KEY_PREFIX}:${currentUserId}`
      : null;
    const legacySessionStorageKey = currentUserId
      ? `${DASHBOARD_LOGO_HINT_DISMISSED_SESSION_KEY_PREFIX}:${currentUserId}`
      : null;

    try {
      const dismissedIds = parseDismissedMessageIds(window.localStorage.getItem(messageStorageKey));
      const dismissedInLegacyStorage =
        window.localStorage.getItem(sharedPersistentStorageKey) === "true" ||
        window.sessionStorage.getItem(sharedSessionStorageKey) === "true" ||
        (legacyPersistentStorageKey ? window.localStorage.getItem(legacyPersistentStorageKey) === "true" : false) ||
        (legacySessionStorageKey ? window.sessionStorage.getItem(legacySessionStorageKey) === "true" : false);
      const nextDismissedIds = dismissedInLegacyStorage
        ? dismissMessageId(dismissedIds, DASHBOARD_LOGO_HINT_MESSAGE_ID)
        : dismissedIds;

      if (nextDismissedIds.length !== dismissedIds.length) {
        window.localStorage.setItem(messageStorageKey, serializeDismissedMessageIds(nextDismissedIds));
      }

      setShowDashboardLogoHint(!isMessageDismissed(nextDismissedIds, DASHBOARD_LOGO_HINT_MESSAGE_ID));
    } catch (error) {
      console.warn("Could not restore dashboard logo hint dismissal state.", error);
      setShowDashboardLogoHint(true);
    }
  }, [currentUserId, isCurrentUserLoading]);

  const dismissDashboardLogoHint = useCallback(() => {
    const messageStorageKey = getDashboardHomeMessageStorageKey({
      userId: currentUserId,
      isUserLoading: isCurrentUserLoading
    });
    if (!messageStorageKey) {
      return;
    }

    try {
      const dismissedIds = parseDismissedMessageIds(window.localStorage.getItem(messageStorageKey));
      const nextDismissedIds = dismissMessageId(dismissedIds, DASHBOARD_LOGO_HINT_MESSAGE_ID);
      window.localStorage.setItem(messageStorageKey, serializeDismissedMessageIds(nextDismissedIds));
    } catch (error) {
      console.warn("Could not persist dashboard logo hint dismissal state.", error);
    }

    setShowDashboardLogoHint(false);
  }, [currentUserId, isCurrentUserLoading]);

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
    <div className="-mt-1 space-y-4">
      {showDashboardLogoHint ? (
        <section className="rounded-md border border-amber-200 bg-amber-100 px-2.5 py-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-[11px] font-medium leading-4 text-amber-900">
              {DASHBOARD_LOGO_HINT_COPY[displayLanguage]}
            </p>
            <button
              type="button"
              onClick={dismissDashboardLogoHint}
              aria-label="Dismiss dashboard hint"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-amber-700 transition hover:bg-amber-200 hover:text-amber-900"
            >
              <X aria-hidden className="h-3 w-3" />
            </button>
          </div>
        </section>
      ) : null}

      <DashboardHero
        userId={user?.id ?? null}
        name={user?.name ?? "Player"}
        dashboardCopy={dashboardCopy}
        homeTeamId={user?.homeTeamId ?? null}
      />

      <AppUpdatesCard />

      {initialGlobalChallengeSummary && !shouldHideStrategyModeForLaunch() ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-emerald-800">Global Challenge</p>
              <h2 className="mt-2 text-xl font-black text-gray-950">Group Strategy + Knockout Picks</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
                {initialGlobalChallengeSummary.prompt ?? "Build a Group Strategy before kickoff, then score the knockout phase match by match."}
              </p>
            </div>
            <Link
              href="/strategy"
              className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-white transition hover:bg-accent/95"
            >
              {initialGlobalChallengeSummary.groupStrategy.status === "draft" ? "Build Group Strategy" : "Open Group Strategy"}
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">Group Strategy</p>
              <p className="mt-2 text-2xl font-black text-gray-950">
                {initialGlobalChallengeSummary.groupStrategy.points !== null
                  ? `${initialGlobalChallengeSummary.groupStrategy.points} / ${initialGlobalChallengeSummary.groupStrategy.maxPoints}`
                  : initialGlobalChallengeSummary.groupStrategy.status === "draft"
                    ? "Draft"
                    : "Pending"}
              </p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">Knockout Picks</p>
              <p className="mt-2 text-2xl font-black text-gray-950">
                {initialGlobalChallengeSummary.knockout.points !== null
                  ? `${initialGlobalChallengeSummary.knockout.points} / ${initialGlobalChallengeSummary.knockout.maxPoints}`
                  : "Pending"}
              </p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">Global Score</p>
              <p className="mt-2 text-2xl font-black text-gray-950">
                {initialGlobalChallengeSummary.totalPoints !== null
                  ? `${initialGlobalChallengeSummary.totalPoints} / ${initialGlobalChallengeSummary.totalMaxPoints}`
                  : "Pending"}
              </p>
            </div>
          </div>
        </section>
      ) : null}

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

      <DashboardCommandCenter summary={initialCommandCenterSummary} />

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
                  const isHighlighted = !isActive && homeTeamGroupName === groupName;

                  return (
                    <button
                      key={groupName}
                      type="button"
                      data-choice-key={groupName}
                      onClick={() => setSelectedStandingsGroup(groupName)}
                      className={`rounded-md border px-2 py-1.5 text-sm font-bold transition ${
                        isActive
                          ? "border-accent bg-accent text-white"
                          : isHighlighted
                            ? "border-amber-200 bg-amber-50 text-gray-800 hover:border-amber-300 hover:bg-amber-100"
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

              <GroupStandingsMiniTable
                rows={tournamentStandingsRows}
                emptyState="Standings will appear as group matches go final."
              />
              <p className="text-[11px] font-semibold text-gray-500">
                Top 2 + best 3rd-place teams advance
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      <section>
        <DashboardLinkCard
          href="/trophies"
          icon={Trophy}
          title="Additional Trophies"
          copy="Tournament winner, Golden Boot, and MVP picks."
        />
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">How To Play</p>
        {isHowToPlayOpen ? (
          <div className="mt-3 space-y-4 text-sm leading-6 text-gray-600">
            <div>
              <p className="font-bold text-gray-950">Start with Group Stage</p>
              <p>Rank each group and pick which teams qualify for the Round of 32.</p>
              <p>You can keep editing until the tournament starts.</p>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">Group Stage Scoring</p>
              <p>Each group is worth up to 14 points.</p>
              <div className="pl-4">
                <p>Correct winner: 5 points</p>
                <p>Correct runner-up: 3 points</p>
                <p>Correct third-place team: 2 points</p>
                <p>Correct top two teams, any order: 1 point</p>
                <p>Correct third-place qualification status: 1 point</p>
                <p>Correct full group order: 2 points</p>
              </div>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">Projected Bracket</p>
              <p>Your Group Stage picks build a projected Round of 32 path.</p>
              <p>That preview helps you see who your ladder sends into Knockout.</p>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">Knockout Stage</p>
              <p>Once the official bracket is seeded, you predict knockout winners and scores match by match.</p>
              <div className="pl-4">
                <p>Round of 32: 3 winner + 5 Perfect Pick = 8</p>
                <p>Round of 16: 5 winner + 5 Perfect Pick = 10</p>
                <p>Quarterfinals: 8 winner + 5 Perfect Pick = 13</p>
                <p>Semifinals: 10 winner + 5 Perfect Pick = 15</p>
                <p>Third-place: 5 winner + 5 Perfect Pick = 10</p>
                <p>Final: 15 winner + 10 Perfect Pick = 25</p>
              </div>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">Leaderboards</p>
              <p>Use Group Stage Leaderboard to compare ladder picks.</p>
              <p>Use Knockout Stage Leaderboard once the bracket opens.</p>
              <p>Global Top 10 shows the combined prestige board.</p>
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex justify-end">
          <InlineDisclosureButton
            isOpen={isHowToPlayOpen}
            onClick={() => setIsHowToPlayOpen((current) => !current)}
            label={isHowToPlayOpen ? "Less" : "More"}
            variant="subtle"
          />
        </div>
      </section>
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
      className="flex w-full flex-col rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-accent hover:bg-accent-light"
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
