"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction, type TouchEvent, type WheelEvent } from "react";
import { X } from "lucide-react";
import { AppUpdatesCard } from "@/components/AppUpdatesCard";
import { GroupStandingsMiniTable } from "@/components/GroupStandingsMiniTable";
import { SidePicksIcon } from "@/components/SidePicksIcon";
import { DashboardAdminPanel } from "@/components/dashboard/DashboardAdminPanel";
import { DashboardCommandCenter } from "@/components/dashboard/DashboardCommandCenter";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { DashboardNoGroupsPanel } from "@/components/dashboard/DashboardNoGroupsPanel";
import {
  InlineDisclosureButton,
  WindowChoiceRail
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
  resolvePreferredStandingsGroupSelection,
  shouldPreferPredictedStandingsOrder,
  shouldUseOfficialGroupStandingsOrder
} from "@/lib/group-standings";
import { orderRowsByPredictionSlots } from "@/lib/group-stage-mini-table-order";
import {
  getThirdPlaceCandidatePoolFromGroupRankings,
  getPickProbabilityForTeam,
  shouldShowMiniTablePickProbability,
  type PickProbabilityPlace,
  type PickProbabilityTeam
} from "@/lib/group-pick-probability";
import { buildGroupStandingsByGroup, buildQualifiedTeamSeeds } from "@/lib/knockout-seeding";
import { fetchAdminCounts, type AdminCounts } from "@/lib/admin-data";
import { shouldHideStrategyModeForLaunch } from "@/lib/group-prediction-mode";
import { normalizeInviteTokenInput } from "@/components/player-management/Shared";
import { useAppLanguage } from "@/lib/app-language";
import { formatNumber } from "@/lib/i18n-format";
import { t } from "@/lib/strings";
import { dismissCurrentUserMessageId } from "@/lib/auth-client";
import {
  buildTournamentTransitionMessageId,
  type TournamentTransitionSettings
} from "@/lib/tournament-transition-helpers";
import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import type { MatchWithTeams } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";
import { useSessionViewState } from "@/lib/session-view-state";

const DASHBOARD_LOGO_HINT_MESSAGE_ID = "dashboard-logo-hint-v2";
const DASHBOARD_LOGO_HINT_DISMISSED_STORAGE_KEY_PREFIX = "pickit:dashboard-logo-hint-dismissed";
const DASHBOARD_LOGO_HINT_DISMISSED_SESSION_KEY_PREFIX = "pickit:dashboard-logo-hint-dismissed-session";
const DASHBOARD_GROUP_MATCH_REFRESH_INTERVAL_MS = 15000;
const DASHBOARD_STANDINGS_SWIPE_THRESHOLD_PX = 42;
const DASHBOARD_STANDINGS_SWIPE_EXIT_MS = 190;
const DASHBOARD_STANDINGS_WHEEL_COOLDOWN_MS = 760;

type DashboardViewState = {
  selectedStandingsGroup: string;
  isStandingsOpen: boolean;
  isHowToPlayOpen: boolean;
};

const DEFAULT_DASHBOARD_VIEW_STATE: DashboardViewState = {
  selectedStandingsGroup: "",
  isStandingsOpen: true,
  isHowToPlayOpen: false
};
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

function validateDashboardViewState(value: unknown): DashboardViewState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<DashboardViewState>;
  return {
    selectedStandingsGroup:
      typeof candidate.selectedStandingsGroup === "string"
        ? normalizeGroupKey(candidate.selectedStandingsGroup) ?? candidate.selectedStandingsGroup
        : DEFAULT_DASHBOARD_VIEW_STATE.selectedStandingsGroup,
    isStandingsOpen:
      typeof candidate.isStandingsOpen === "boolean"
        ? candidate.isStandingsOpen
        : DEFAULT_DASHBOARD_VIEW_STATE.isStandingsOpen,
    isHowToPlayOpen:
      typeof candidate.isHowToPlayOpen === "boolean"
        ? candidate.isHowToPlayOpen
        : DEFAULT_DASHBOARD_VIEW_STATE.isHowToPlayOpen
  };
}

export function DashboardOverview({
  initialGlobalChallengeSummary,
  initialCommandCenterSummary,
  initialGroupAccess,
  initialLightSeedSnapshot,
  tournamentTransitionSettings
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
  initialLightSeedSnapshot?: LightSeedBuilderSnapshot | null;
  tournamentTransitionSettings?: TournamentTransitionSettings | null;
}) {
  const router = useRouter();
  const { user, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { activeLanguage: displayLanguage } = useAppLanguage();
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
  const [showDashboardLogoHint, setShowDashboardLogoHint] = useState(false);
  const [showTournamentTransitionMessage, setShowTournamentTransitionMessage] = useState(
    Boolean(tournamentTransitionSettings?.dashboardMessage.active)
  );
  const [dashboardViewState, setDashboardViewState, dashboardViewStateMeta] = useSessionViewState<DashboardViewState>({
    key: "dashboard",
    userId: currentUserId,
    defaultValue: DEFAULT_DASHBOARD_VIEW_STATE,
    validate: validateDashboardViewState
  });
  const selectedStandingsGroup = dashboardViewState.selectedStandingsGroup;
  const isStandingsOpen = dashboardViewState.isStandingsOpen;
  const isHowToPlayOpen = dashboardViewState.isHowToPlayOpen;
  const tournamentTransitionMessageId = tournamentTransitionSettings
    ? buildTournamentTransitionMessageId(tournamentTransitionSettings)
    : null;
  const setSelectedStandingsGroup = useCallback(
    (nextValue: SetStateAction<string>) => {
      setDashboardViewState((current) => ({
        ...current,
        selectedStandingsGroup:
          typeof nextValue === "function" ? nextValue(current.selectedStandingsGroup) : nextValue
      }));
    },
    [setDashboardViewState]
  );
  const setIsStandingsOpen = useCallback(
    (nextValue: SetStateAction<boolean>) => {
      setDashboardViewState((current) => ({
        ...current,
        isStandingsOpen: typeof nextValue === "function" ? nextValue(current.isStandingsOpen) : nextValue
      }));
    },
    [setDashboardViewState]
  );
  const setIsHowToPlayOpen = useCallback(
    (nextValue: SetStateAction<boolean>) => {
      setDashboardViewState((current) => ({
        ...current,
        isHowToPlayOpen: typeof nextValue === "function" ? nextValue(current.isHowToPlayOpen) : nextValue
      }));
    },
    [setDashboardViewState]
  );
  const standingsSwipeTouchRef = useRef<{
    startX: number | null;
    startY: number | null;
    isSwiping: boolean;
  }>({ startX: null, startY: null, isSwiping: false });
  const standingsSwipeAnimationTimeoutRef = useRef<number | null>(null);
  const standingsSwipeWheelDeltaRef = useRef(0);
  const standingsSwipeWheelResetTimeoutRef = useRef<number | null>(null);
  const standingsSwipeWheelCooldownTimeoutRef = useRef<number | null>(null);
  const standingsSwipeWheelIsCoolingDownRef = useRef(false);
  const [standingsSwipeOffsetX, setStandingsSwipeOffsetX] = useState(0);
  const [isStandingsSurfaceSwiping, setIsStandingsSurfaceSwiping] = useState(false);
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
  const dashboardCopy = {
    hello: t(displayLanguage, "dashboard.hello"),
    help: t(displayLanguage, "dashboard.help")
  };
  const dashboardHeroCompactSummary = [
    user?.name ?? "Player",
    typeof initialCommandCenterSummary.performance.globalPoints === "number"
      ? `${formatNumber(initialCommandCenterSummary.performance.globalPoints, displayLanguage)} ${t(displayLanguage, "leaderboard.points")}`
      : null,
    typeof initialCommandCenterSummary.performance.globalRank === "number"
      ? `${t(displayLanguage, "leaderboard.rank")} ${formatNumber(initialCommandCenterSummary.performance.globalRank, displayLanguage)}`
      : null
  ].filter(Boolean).join(" · ");
  const dashboardLogoHintMessageId = DASHBOARD_LOGO_HINT_MESSAGE_ID;
  const legacyLanguageScopedLogoHintMessageId = `${DASHBOARD_LOGO_HINT_MESSAGE_ID}:${displayLanguage}`;
  const { selectedGroup: resolvedStandingsGroup } = resolvePreferredStandingsGroupSelection({
    availableGroups: availableStandingsGroups,
    storedGroup: selectedStandingsGroup,
    homeTeamGroup: homeTeamGroupName
  });
  const resolvedStandingsGroupIndex = Math.max(0, availableStandingsGroups.indexOf(resolvedStandingsGroup));
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
  const allGroupTeamsById = useMemo(
    () => new Map(allGroupTeams.map((team) => [team.id, team] as const)),
    [allGroupTeams]
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
  const predictedPlacementByTeamId = useMemo(() => {
    const placements = new Map<string, PickProbabilityPlace>();
    for (const ranking of initialLightSeedSnapshot?.groupRankings ?? []) {
      ranking.rankedTeamIds.slice(0, 4).forEach((teamId, index) => {
        if (teamId) {
          placements.set(teamId, (index + 1) as PickProbabilityPlace);
        }
      });
    }
    return placements;
  }, [initialLightSeedSnapshot]);
  const predictedThirdPlaceQualifierTeamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ranking of initialLightSeedSnapshot?.thirdPlaceRankings ?? []) {
      if (ranking.rank <= 8) {
        ids.add(ranking.teamId);
      }
    }
    return ids;
  }, [initialLightSeedSnapshot]);
  const predictedThirdPlaceRankingIndexByTeamId = useMemo(() => {
    const rankings = new Map<string, number>();
    for (const ranking of initialLightSeedSnapshot?.thirdPlaceRankings ?? []) {
      rankings.set(ranking.teamId, Math.max(0, ranking.rank - 1));
    }
    return rankings;
  }, [initialLightSeedSnapshot]);
  const predictedThirdPlaceCandidatePool = useMemo(
    () =>
      getThirdPlaceCandidatePoolFromGroupRankings(
        initialLightSeedSnapshot?.groupRankings ?? [],
        allGroupTeamsById
      ),
    [allGroupTeamsById, initialLightSeedSnapshot]
  );
  const hasGroupStageStarted = useMemo(() => shouldUseOfficialGroupStandingsOrder(groupMatches), [groupMatches]);
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
    const groupTeamsForProbability = rows
      .map((row) => allGroupTeamsById.get(row.teamId))
      .filter((team): team is PickProbabilityTeam => Boolean(team));
    const groupMatchesForStandings = groupMatches.filter(
      (match) => normalizeGroupKey(match.groupName) === resolvedStandingsGroup
    );
    const remainingMatches = groupMatches
      .filter((match) => normalizeGroupKey(match.groupName) === resolvedStandingsGroup && match.status !== "final")
      .map((match) => ({ status: match.status }));
    const groupIsFinal = rows.length > 0 && rows.every((row) => row.played >= 3);
    const hasPredictionForGroup = rows.some((row) => predictedPlacementByTeamId.has(row.teamId));
    const hasFinalizedResultInGroup = groupMatchesForStandings.some((match) => match.status === "final");
    const shouldUsePredictionOrder = shouldPreferPredictedStandingsOrder({
      hasTournamentStarted: hasGroupStageStarted,
      hasPredictionForGroup,
      hasFinalizedResultInGroup
    });
    const displayRows = shouldUsePredictionOrder
      ? orderRowsByPredictionSlots(rows, predictedPlacementByTeamId)
      : rows.map((row, index) => ({ row, displayRank: row.rank || index + 1 }));

    return displayRows.map(({ row, displayRank }, index) => {
      const predictedPlace = predictedPlacementByTeamId.get(row.teamId) ?? null;
      const isPredictedQualifier =
        predictedPlace === 1 ||
        predictedPlace === 2 ||
        predictedThirdPlaceQualifierTeamIds.has(row.teamId);
      const isQualifier = hasGroupStageStarted
        ? index < 2 || (index === 2 && qualifyingThirdPlaceTeamIds.has(row.teamId))
        : isPredictedQualifier;
      const shouldShowPickProbability = shouldShowMiniTablePickProbability({
        predictedPlace,
        isSelectedThirdPlaceQualifier: predictedThirdPlaceQualifierTeamIds.has(row.teamId)
      });
      return {
        ...row,
        teamCode: row.teamCode ?? row.teamName.slice(0, 3).toUpperCase(),
        rank: displayRank,
        isHomeTeam: Boolean(user?.homeTeamId && row.teamId === user.homeTeamId),
        isQualifier,
        isPossibleQualifier: false,
        isEliminated: groupIsFinal && !isQualifier,
        pickProbability: shouldShowPickProbability
          ? getPickProbabilityForTeam({
              rows,
              remainingMatches,
              teamId: row.teamId,
              team: allGroupTeamsById.get(row.teamId) ?? null,
              groupTeams: groupTeamsForProbability,
              thirdPlacePool: predictedThirdPlaceCandidatePool,
              thirdPlaceRankingIndex: predictedThirdPlaceRankingIndexByTeamId.get(row.teamId) ?? null,
              predictedPlace,
              isAdvancing: isQualifier
            })
          : null
      };
    });
  }, [
    groupMatches,
    allGroupTeamsById,
    hasGroupStageStarted,
    predictedPlacementByTeamId,
    predictedThirdPlaceQualifierTeamIds,
    predictedThirdPlaceCandidatePool,
    predictedThirdPlaceRankingIndexByTeamId,
    qualifyingThirdPlaceTeamIds,
    resolvedStandingsGroup,
    standingsByGroup,
    user?.homeTeamId
  ]);
  useEffect(() => {
    if (!availableStandingsGroups.length) {
      return;
    }

    const hasValidStoredSelection =
      dashboardViewStateMeta.hasStoredValue && availableStandingsGroups.includes(selectedStandingsGroup);

    if (!hasValidStoredSelection && resolvedStandingsGroup !== selectedStandingsGroup) {
      setSelectedStandingsGroup(resolvedStandingsGroup);
    }
  }, [
    availableStandingsGroups.length,
    resolvedStandingsGroup,
    availableStandingsGroups,
    selectedStandingsGroup,
    dashboardViewStateMeta.hasStoredValue,
    setSelectedStandingsGroup
  ]);

  useEffect(() => {
    return () => {
      if (standingsSwipeAnimationTimeoutRef.current !== null) {
        window.clearTimeout(standingsSwipeAnimationTimeoutRef.current);
      }
      if (standingsSwipeWheelResetTimeoutRef.current !== null) {
        window.clearTimeout(standingsSwipeWheelResetTimeoutRef.current);
      }
      if (standingsSwipeWheelCooldownTimeoutRef.current !== null) {
        window.clearTimeout(standingsSwipeWheelCooldownTimeoutRef.current);
      }
    };
  }, []);

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
      const dismissedIds = Array.from(
        new Set([
          ...parseDismissedMessageIds(window.localStorage.getItem(messageStorageKey)),
          ...(user?.dismissedMessageIds ?? [])
        ])
      );
      const dismissedInLegacyStorage =
        window.localStorage.getItem(sharedPersistentStorageKey) === "true" ||
        window.sessionStorage.getItem(sharedSessionStorageKey) === "true" ||
        (legacyPersistentStorageKey ? window.localStorage.getItem(legacyPersistentStorageKey) === "true" : false) ||
        (legacySessionStorageKey ? window.sessionStorage.getItem(legacySessionStorageKey) === "true" : false) ||
        isMessageDismissed(dismissedIds, legacyLanguageScopedLogoHintMessageId);
      const nextDismissedIds = dismissedInLegacyStorage || isMessageDismissed(dismissedIds, legacyLanguageScopedLogoHintMessageId)
        ? dismissMessageId(dismissedIds, dashboardLogoHintMessageId)
        : dismissedIds;

      if (nextDismissedIds.length !== dismissedIds.length) {
        window.localStorage.setItem(messageStorageKey, serializeDismissedMessageIds(nextDismissedIds));
      }

      if (currentUserId && dismissedInLegacyStorage && !isMessageDismissed(user?.dismissedMessageIds ?? [], dashboardLogoHintMessageId)) {
        void dismissCurrentUserMessageId(dashboardLogoHintMessageId);
      }

      setShowDashboardLogoHint(!isMessageDismissed(nextDismissedIds, dashboardLogoHintMessageId));
    } catch (error) {
      console.warn("Could not restore dashboard logo hint dismissal state.", error);
      setShowDashboardLogoHint(true);
    }
  }, [
    currentUserId,
    dashboardLogoHintMessageId,
    legacyLanguageScopedLogoHintMessageId,
    isCurrentUserLoading,
    user?.dismissedMessageIds
  ]);

  useEffect(() => {
    const messageStorageKey = getDashboardHomeMessageStorageKey({
      userId: currentUserId,
      isUserLoading: isCurrentUserLoading
    });

    if (
      typeof window === "undefined" ||
      !messageStorageKey ||
      !tournamentTransitionSettings?.dashboardMessage.active ||
      !tournamentTransitionMessageId
    ) {
      setShowTournamentTransitionMessage(Boolean(tournamentTransitionSettings?.dashboardMessage.active));
      return;
    }

    if (!tournamentTransitionSettings.dashboardMessage.dismissible) {
      setShowTournamentTransitionMessage(true);
      return;
    }

    try {
      const dismissedIds = Array.from(
        new Set([
          ...parseDismissedMessageIds(window.localStorage.getItem(messageStorageKey)),
          ...(user?.dismissedMessageIds ?? [])
        ])
      );
      setShowTournamentTransitionMessage(!isMessageDismissed(dismissedIds, tournamentTransitionMessageId));
    } catch {
      setShowTournamentTransitionMessage(true);
    }
  }, [
    currentUserId,
    isCurrentUserLoading,
    tournamentTransitionMessageId,
    tournamentTransitionSettings?.dashboardMessage.active,
    tournamentTransitionSettings?.dashboardMessage.dismissible,
    user?.dismissedMessageIds
  ]);

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
      const nextDismissedIds = dismissMessageId(dismissedIds, dashboardLogoHintMessageId);
      window.localStorage.setItem(messageStorageKey, serializeDismissedMessageIds(nextDismissedIds));
      if (currentUserId) {
        void dismissCurrentUserMessageId(dashboardLogoHintMessageId);
      }
    } catch (error) {
      console.warn("Could not persist dashboard logo hint dismissal state.", error);
    }

    setShowDashboardLogoHint(false);
  }, [currentUserId, dashboardLogoHintMessageId, isCurrentUserLoading]);

  const dismissTournamentTransitionMessage = useCallback(() => {
    const messageStorageKey = getDashboardHomeMessageStorageKey({
      userId: currentUserId,
      isUserLoading: isCurrentUserLoading
    });
    if (!messageStorageKey || !tournamentTransitionMessageId) {
      setShowTournamentTransitionMessage(false);
      return;
    }

    try {
      const dismissedIds = parseDismissedMessageIds(window.localStorage.getItem(messageStorageKey));
      const nextDismissedIds = dismissMessageId(dismissedIds, tournamentTransitionMessageId);
      window.localStorage.setItem(messageStorageKey, serializeDismissedMessageIds(nextDismissedIds));
      if (currentUserId) {
        void dismissCurrentUserMessageId(tournamentTransitionMessageId);
      }
    } catch (error) {
      console.warn("Could not persist tournament transition dismissal state.", error);
    }

    setShowTournamentTransitionMessage(false);
  }, [currentUserId, isCurrentUserLoading, tournamentTransitionMessageId]);

  function getStandingsSwipeTravelDistance() {
    if (typeof window === "undefined") {
      return 360;
    }

    return Math.max(320, Math.min(window.innerWidth * 0.9, 540));
  }

  function getBoundedStandingsSwipeOffset(deltaX: number) {
    const isPullingPastStart = deltaX > 0 && resolvedStandingsGroupIndex === 0;
    const isPullingPastEnd = deltaX < 0 && resolvedStandingsGroupIndex === availableStandingsGroups.length - 1;
    const resistedDelta = isPullingPastStart || isPullingPastEnd ? deltaX * 0.28 : deltaX;
    return Math.max(-118, Math.min(118, resistedDelta));
  }

  function updateStandingsSurfaceSwipe(deltaX: number) {
    setIsStandingsSurfaceSwiping(true);
    setStandingsSwipeOffsetX(getBoundedStandingsSwipeOffset(deltaX));
  }

  function finishStandingsSurfaceSwipe(deltaX: number) {
    setIsStandingsSurfaceSwiping(false);

    const targetIndex = deltaX < 0 ? resolvedStandingsGroupIndex + 1 : resolvedStandingsGroupIndex - 1;
    const boundedTargetIndex = Math.max(0, Math.min(availableStandingsGroups.length - 1, targetIndex));
    const shouldChangeGroup =
      Math.abs(deltaX) >= DASHBOARD_STANDINGS_SWIPE_THRESHOLD_PX && boundedTargetIndex !== resolvedStandingsGroupIndex;

    if (!shouldChangeGroup) {
      setStandingsSwipeOffsetX(0);
      return;
    }

    if (standingsSwipeAnimationTimeoutRef.current !== null) {
      window.clearTimeout(standingsSwipeAnimationTimeoutRef.current);
    }

    const swipeDirection = deltaX < 0 ? -1 : 1;
    const travelDistance = getStandingsSwipeTravelDistance();

    setStandingsSwipeOffsetX(swipeDirection * travelDistance);
    standingsSwipeAnimationTimeoutRef.current = window.setTimeout(() => {
      standingsSwipeAnimationTimeoutRef.current = null;
      setIsStandingsSurfaceSwiping(true);
      setSelectedStandingsGroup(availableStandingsGroups[boundedTargetIndex]);
      setStandingsSwipeOffsetX(-swipeDirection * travelDistance);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setIsStandingsSurfaceSwiping(false);
          setStandingsSwipeOffsetX(0);
        });
      });
    }, DASHBOARD_STANDINGS_SWIPE_EXIT_MS);
  }

  function coolDownStandingsWheelSwipe() {
    standingsSwipeWheelIsCoolingDownRef.current = true;
    if (standingsSwipeWheelCooldownTimeoutRef.current !== null) {
      window.clearTimeout(standingsSwipeWheelCooldownTimeoutRef.current);
    }
    standingsSwipeWheelCooldownTimeoutRef.current = window.setTimeout(() => {
      standingsSwipeWheelIsCoolingDownRef.current = false;
      standingsSwipeWheelCooldownTimeoutRef.current = null;
    }, DASHBOARD_STANDINGS_WHEEL_COOLDOWN_MS);
  }

  function handleStandingsSwipeTouchStart(event: TouchEvent<HTMLElement>) {
    if (availableStandingsGroups.length < 2) {
      standingsSwipeTouchRef.current = { startX: null, startY: null, isSwiping: false };
      return;
    }

    const touch = event.changedTouches[0];
    standingsSwipeTouchRef.current = {
      startX: touch?.clientX ?? null,
      startY: touch?.clientY ?? null,
      isSwiping: false
    };
  }

  function handleStandingsSwipeTouchMove(event: TouchEvent<HTMLElement>) {
    const { startX, startY } = standingsSwipeTouchRef.current;
    if (availableStandingsGroups.length < 2 || startX === null || startY === null) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!standingsSwipeTouchRef.current.isSwiping) {
      if (Math.abs(deltaX) < 10 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
        return;
      }

      standingsSwipeTouchRef.current.isSwiping = true;
    }

    event.preventDefault();
    updateStandingsSurfaceSwipe(deltaX);
  }

  function handleStandingsSwipeTouchEnd(event: TouchEvent<HTMLElement>) {
    const { startX, startY, isSwiping } = standingsSwipeTouchRef.current;
    standingsSwipeTouchRef.current = { startX: null, startY: null, isSwiping: false };

    if (availableStandingsGroups.length < 2 || startX === null || startY === null) {
      setIsStandingsSurfaceSwiping(false);
      setStandingsSwipeOffsetX(0);
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      setIsStandingsSurfaceSwiping(false);
      setStandingsSwipeOffsetX(0);
      return;
    }

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!isSwiping && (Math.abs(deltaX) < DASHBOARD_STANDINGS_SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY))) {
      setIsStandingsSurfaceSwiping(false);
      setStandingsSwipeOffsetX(0);
      return;
    }

    finishStandingsSurfaceSwipe(deltaX);
  }

  function handleStandingsSwipeTouchCancel() {
    standingsSwipeTouchRef.current = { startX: null, startY: null, isSwiping: false };
    setIsStandingsSurfaceSwiping(false);
    setStandingsSwipeOffsetX(0);
  }

  function handleStandingsSwipeWheel(event: WheelEvent<HTMLElement>) {
    if (
      availableStandingsGroups.length < 2 ||
      standingsSwipeWheelIsCoolingDownRef.current ||
      standingsSwipeAnimationTimeoutRef.current !== null
    ) {
      return;
    }

    if (Math.abs(event.deltaX) < 4 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.15) {
      return;
    }

    event.preventDefault();
    standingsSwipeWheelDeltaRef.current += event.deltaX;

    if (standingsSwipeWheelResetTimeoutRef.current !== null) {
      window.clearTimeout(standingsSwipeWheelResetTimeoutRef.current);
    }
    standingsSwipeWheelResetTimeoutRef.current = window.setTimeout(() => {
      standingsSwipeWheelDeltaRef.current = 0;
      standingsSwipeWheelResetTimeoutRef.current = null;
      setIsStandingsSurfaceSwiping(false);
      setStandingsSwipeOffsetX(0);
    }, 180);

    const gestureDeltaX = -standingsSwipeWheelDeltaRef.current;
    updateStandingsSurfaceSwipe(gestureDeltaX);

    if (Math.abs(gestureDeltaX) < DASHBOARD_STANDINGS_SWIPE_THRESHOLD_PX) {
      return;
    }

    standingsSwipeWheelDeltaRef.current = 0;
    if (standingsSwipeWheelResetTimeoutRef.current !== null) {
      window.clearTimeout(standingsSwipeWheelResetTimeoutRef.current);
      standingsSwipeWheelResetTimeoutRef.current = null;
    }
    coolDownStandingsWheelSwipe();
    finishStandingsSurfaceSwipe(gestureDeltaX);
  }

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
              {t(displayLanguage, "dashboard.logoHint")}
            </p>
            <button
              type="button"
              onClick={dismissDashboardLogoHint}
              aria-label={t(displayLanguage, "updates.dismiss")}
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
        compactSummary={dashboardHeroCompactSummary}
        dashboardCopy={dashboardCopy}
        visualThemeId={user?.visualThemeId ?? null}
        homeTeamId={user?.homeTeamId ?? null}
        preferredLanguage={user?.preferredLanguage ?? null}
      />

      {tournamentTransitionSettings?.dashboardMessage.active && showTournamentTransitionMessage ? (
        <section className="rounded-[1.15rem] border border-accent-light bg-accent-light/25 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">
                {t(displayLanguage, "dashboard.title")}
              </p>
              <h2 className="mt-2 text-xl font-black text-gray-950">
                {tournamentTransitionSettings.dashboardMessage.title}
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
                {tournamentTransitionSettings.dashboardMessage.body}
              </p>
            </div>
            {tournamentTransitionSettings.dashboardMessage.dismissible ? (
              <button
                type="button"
                onClick={dismissTournamentTransitionMessage}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 transition hover:border-accent hover:text-accent-dark"
                aria-label="Dismiss dashboard transition message"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <AppUpdatesCard />

      {initialGlobalChallengeSummary && !shouldHideStrategyModeForLaunch() ? (
        <section className="rounded-[1.15rem] border border-accent-light bg-accent-light/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(displayLanguage, "dashboard.globalChallenge")}</p>
              <h2 className="mt-2 text-xl font-black text-gray-950">{t(displayLanguage, "dashboard.globalChallengeTitle")}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
                {initialGlobalChallengeSummary.prompt ?? t(displayLanguage, "dashboard.globalChallengePrompt")}
              </p>
            </div>
            <Link
              href="/strategy"
              className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-accent-text transition hover:bg-accent/95"
            >
              {initialGlobalChallengeSummary.groupStrategy.status === "draft"
                ? t(displayLanguage, "dashboard.buildGroupStrategy")
                : t(displayLanguage, "dashboard.openGroupStrategy")}
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">{t(displayLanguage, "dashboard.groupStrategy")}</p>
              <p className="mt-2 text-2xl font-black text-gray-950">
                {initialGlobalChallengeSummary.groupStrategy.points !== null
                  ? `${initialGlobalChallengeSummary.groupStrategy.points} / ${initialGlobalChallengeSummary.groupStrategy.maxPoints}`
                  : initialGlobalChallengeSummary.groupStrategy.status === "draft"
                    ? t(displayLanguage, "dashboard.draft")
                    : t(displayLanguage, "dashboard.pending")}
              </p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">{t(displayLanguage, "dashboard.knockoutPicks")}</p>
              <p className="mt-2 text-2xl font-black text-gray-950">
                {initialGlobalChallengeSummary.knockout.points !== null
                  ? `${initialGlobalChallengeSummary.knockout.points} / ${initialGlobalChallengeSummary.knockout.maxPoints}`
                  : t(displayLanguage, "dashboard.pending")}
              </p>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3">
              <p className="text-xs font-black uppercase tracking-wide text-gray-500">{t(displayLanguage, "dashboard.globalScore")}</p>
              <p className="mt-2 text-2xl font-black text-gray-950">
                {initialGlobalChallengeSummary.totalPoints !== null
                  ? `${initialGlobalChallengeSummary.totalPoints} / ${initialGlobalChallengeSummary.totalMaxPoints}`
                  : t(displayLanguage, "dashboard.pending")}
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
          language={displayLanguage}
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

      <div className="pb-2">
        <DashboardCommandCenter
          summary={initialCommandCenterSummary}
          userId={currentUserId}
          language={displayLanguage}
          primaryView={tournamentTransitionSettings?.leftTriptych.primaryView}
          secondaryView={tournamentTransitionSettings?.leftTriptych.secondaryView}
        />
      </div>

      {availableStandingsGroups.length > 0 ? (
        <section className="space-y-3 pt-4 sm:pt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(displayLanguage, "dashboard.tournamentStandings")}</p>
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
                motionMode="anchored"
                allowAnchoredTouchScroll
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
                          ? "border-accent bg-accent text-accent-text"
                          : isHighlighted
                            ? "border-amber-200 bg-amber-50 text-gray-800 hover:border-amber-300 hover:bg-amber-100"
                            : "border-gray-300 bg-white text-gray-700 hover:border-accent hover:bg-accent-light"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 text-[12px] font-black leading-none">
                        <span>{t(displayLanguage, "dashboard.groupLabel")}</span>
                        <span>{getGroupShortLabel(groupName)}</span>
                      </span>
                    </button>
                  );
                })}
              </WindowChoiceRail>

              <div
                className="overflow-hidden select-none [touch-action:pan-y]"
                onTouchStart={handleStandingsSwipeTouchStart}
                onTouchMove={handleStandingsSwipeTouchMove}
                onTouchEnd={handleStandingsSwipeTouchEnd}
                onTouchCancel={handleStandingsSwipeTouchCancel}
                onWheel={handleStandingsSwipeWheel}
              >
                <div
                  className={isStandingsSurfaceSwiping ? "" : "transition-transform duration-200 ease-out"}
                  style={{
                    transform: standingsSwipeOffsetX ? `translate3d(${standingsSwipeOffsetX}px, 0, 0)` : undefined
                  }}
                >
                  <GroupStandingsMiniTable
                    rows={tournamentStandingsRows}
                    emptyState={t(displayLanguage, "dashboard.standingsEmpty")}
                    language={displayLanguage}
                  />
                </div>
              </div>
              <p className="text-center font-semibold uppercase tracking-[0.1em] text-gray-500">
                <span className="triptych-micro-copy">{t(displayLanguage, "dashboard.standingsAdvanceRule")}</span>
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      <section>
        <DashboardLinkCard
          href="/last-chance-picks"
          icon={SidePicksIcon}
          title={t(displayLanguage, "dashboard.additionalTrophies")}
          copy={t(displayLanguage, "dashboard.additionalTrophiesCopy")}
        />
      </section>

      <section className="ui-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(displayLanguage, "dashboard.howToPlay")}</p>
          <InlineDisclosureButton
            isOpen={isHowToPlayOpen}
            onClick={() => setIsHowToPlayOpen((current) => !current)}
            label={isHowToPlayOpen ? t(displayLanguage, "common.less") : t(displayLanguage, "common.more")}
            variant="subtle"
          />
        </div>
        {isHowToPlayOpen ? (
          <div className="mt-3 space-y-4 text-sm leading-6 text-gray-600">
            <div>
              <p className="font-bold text-gray-950">{t(displayLanguage, "dashboard.startWithGroupStage")}</p>
              <p>{t(displayLanguage, "dashboard.startWithGroupStageBody")}</p>
              <p>{t(displayLanguage, "dashboard.startWithGroupStageNote")}</p>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">{t(displayLanguage, "dashboard.groupStageScoring")}</p>
              <p>{t(displayLanguage, "dashboard.groupStageScoringIntro")}</p>
              <div className="pl-4">
                <p>{t(displayLanguage, "dashboard.scoringCorrectWinner")}</p>
                <p>{t(displayLanguage, "dashboard.scoringCorrectRunnerUp")}</p>
                <p>{t(displayLanguage, "dashboard.scoringCorrectThirdPlaceTeam")}</p>
                <p>{t(displayLanguage, "dashboard.scoringCorrectTopTwoAnyOrder")}</p>
                <p>{t(displayLanguage, "dashboard.scoringCorrectThirdPlaceQualification")}</p>
                <p>{t(displayLanguage, "dashboard.scoringCorrectFullGroupOrder")}</p>
              </div>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">{t(displayLanguage, "dashboard.projectedBracket")}</p>
              <p>{t(displayLanguage, "dashboard.projectedBracketBody1")}</p>
              <p>{t(displayLanguage, "dashboard.projectedBracketBody2")}</p>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">{t(displayLanguage, "dashboard.knockoutStage")}</p>
              <p>{t(displayLanguage, "dashboard.knockoutStageBody")}</p>
              <div className="pl-4">
                <p>{t(displayLanguage, "dashboard.knockoutScoringRoundOf32")}</p>
                <p>{t(displayLanguage, "dashboard.knockoutScoringRoundOf16")}</p>
                <p>{t(displayLanguage, "dashboard.knockoutScoringQuarterfinals")}</p>
                <p>{t(displayLanguage, "dashboard.knockoutScoringSemifinals")}</p>
                <p>{t(displayLanguage, "dashboard.knockoutScoringThirdPlace")}</p>
                <p>{t(displayLanguage, "dashboard.knockoutScoringFinal")}</p>
              </div>
            </div>

            <div>
              <p className="font-bold uppercase tracking-wide text-gray-950">{t(displayLanguage, "dashboard.leaderboardsTitle")}</p>
              <p>{t(displayLanguage, "dashboard.leaderboardsBody1")}</p>
              <p>{t(displayLanguage, "dashboard.leaderboardsBody2")}</p>
              <p>{t(displayLanguage, "dashboard.leaderboardsBody3")}</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

type DashboardLinkCardProps = {
  href: string;
  icon: (props: { className?: string; "aria-hidden"?: boolean }) => ReactNode;
  title: string;
  copy: string;
};

function DashboardLinkCard({ href, icon: Icon, title, copy }: DashboardLinkCardProps) {
  return (
    <Link
      href={href}
      className="ui-card flex w-full flex-col p-4 transition-colors hover:border-accent hover:bg-accent-light"
    >
      <Icon aria-hidden className="h-10 w-10 text-accent-dark" />
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600">{copy}</p>
    </Link>
  );
}
