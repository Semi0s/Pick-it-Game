"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { InlineDisclosureButton, WindowChoiceRail, useSessionDisclosureState, useSessionJsonState } from "@/components/player-management/Shared";
import {
  awardManagedGroupTrophyAction,
  listManagedGroupPlayersAction,
  type ManagedGroupDetails
} from "@/app/my-groups/actions";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { ManagedTrophyAwardSheet } from "@/components/ManagedTrophyAwardSheet";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { TrophyBadge } from "@/components/TrophyBadge";
import {
  DASHBOARD_ACTION_COPY,
  DASHBOARD_AUTO_PICK_EMPTY_COPY,
  DASHBOARD_AUTO_PICK_LABEL_COPY,
  DASHBOARD_AUTO_PICK_LOADING_COPY,
  DashboardHeroActionGrid
} from "@/components/dashboard/DashboardHeroActionGrid";
import { clearStoredAutoPickDraft, fetchNextAutoPick, storeAutoPickDraft } from "@/lib/auto-pick-client";
import { showAppToast } from "@/lib/app-toast";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { normalizeGroupKey } from "@/lib/group-standings";
import { clearGroupsEntryIntent, storeGroupsEntryIntent } from "@/lib/groups-entry-intent";
import type { LeaderboardActivityItem } from "@/lib/leaderboard-activity";
import type {
  GroupStandingItem,
  LeaderboardGroupNavItem,
  LeaderboardListItem,
  LeaderboardPageData,
  LeaderboardSwitcherContext,
  LeaderboardSwitcherView
} from "@/lib/leaderboard-data";
import type { DailyWinner } from "@/lib/leaderboard-highlights";
import { fetchPlayerPredictions } from "@/lib/player-predictions";
import { canEditPrediction } from "@/lib/prediction-state";
import { getStoredPredictions } from "@/lib/prediction-store";
import type { MatchWithTeams, Prediction } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";

const DEFAULT_SWITCHER_STATE = {
  activeView: "global" as LeaderboardSwitcherView,
  selectedGroupId: "",
  selectedManagerId: ""
};

type LeaderboardSubselectionState = {
  groupByView: Partial<Record<LeaderboardSwitcherView, string>>;
  managerByView: Partial<Record<LeaderboardSwitcherView, string>>;
};

const DEFAULT_SUBSELECTION_STATE: LeaderboardSubselectionState = {
  groupByView: {},
  managerByView: {}
};

const LEADERBOARD_SWITCHER_STORAGE_KEY = "leaderboard-switcher-state";
const LEADERBOARD_INTRO_DISCLOSURE_STORAGE_KEY = "leaderboard-intro-disclosure";
const LEADERBOARD_ACTIVITY_DISCLOSURE_STORAGE_KEY = "leaderboard-activity-disclosure";
const LEADERBOARD_ACTIVITY_MORE_STORAGE_KEY = "leaderboard-activity-more";
const LEADERBOARD_LEADER_SUMMARY_STORAGE_KEY = "leaderboard-leader-summary-state";
const LEADERBOARD_SUBSELECTION_STORAGE_KEY = "leaderboard-subselection-state";
const LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY = "leaderboard-daily-winner-dismissed";
const LEADERBOARD_TIME_ZONE = "America/New_York";
const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const TWO_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden"
};

export function LeaderboardClient() {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const [groupMatches, setGroupMatches] = useState<MatchWithTeams[]>(() => getLocalGroupMatches());
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isHeroAutoPicking, setIsHeroAutoPicking] = useState(false);
  const [users, setUsers] = useState<LeaderboardListItem[]>([]);
  const [groupStandings, setGroupStandings] = useState<GroupStandingItem[]>([]);
  const [switcher, setSwitcher] = useState<LeaderboardSwitcherContext | null>(null);
  const [dailyWinners, setDailyWinners] = useState<DailyWinner[]>([]);
  const [activityFeed, setActivityFeed] = useState<LeaderboardActivityItem[]>([]);
  const [activeView, setActiveView] = useState<LeaderboardSwitcherView>(DEFAULT_SWITCHER_STATE.activeView);
  const [selectedGroupId, setSelectedGroupId] = useState(DEFAULT_SWITCHER_STATE.selectedGroupId);
  const [selectedManagerId, setSelectedManagerId] = useState(DEFAULT_SWITCHER_STATE.selectedManagerId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeReactionKey, setActiveReactionKey] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [activeCommentEventId, setActiveCommentEventId] = useState<string | null>(null);
  const [lastCommentAtByEvent, setLastCommentAtByEvent] = useState<Record<string, number>>({});
  const [pendingActivityAnchorId, setPendingActivityAnchorId] = useState<string | null>(null);
  const [isActivityExpanded, setIsActivityExpanded] = useSessionDisclosureState(
    LEADERBOARD_ACTIVITY_DISCLOSURE_STORAGE_KEY,
    false
  );
  const [isActivityMoreOpen, setIsActivityMoreOpen] = useSessionDisclosureState(
    LEADERBOARD_ACTIVITY_MORE_STORAGE_KEY,
    false
  );
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [managedAwardGroup, setManagedAwardGroup] = useState<ManagedGroupDetails | null>(null);
  const [managedTrophySheetTarget, setManagedTrophySheetTarget] = useState<{ groupId: string; userId: string } | null>(null);
  const [activeManagedTrophyKey, setActiveManagedTrophyKey] = useState<string | null>(null);
  const [celebrationTrophy, setCelebrationTrophy] = useState<{
    name: string;
    icon: string;
    tier?: "bronze" | "silver" | "gold" | "special" | null;
  } | null>(null);
  const [globalStandingLabel, setGlobalStandingLabel] = useState<string | null>(null);
  const [hasExplicitSwitcherPreference, setHasExplicitSwitcherPreference] = useState(false);
  const [hasRestoredSwitcherPreference, setHasRestoredSwitcherPreference] = useState(false);
  const [hasRestoredLeaderSummaryState, setHasRestoredLeaderSummaryState] = useState(false);
  const [subselectionState, setSubselectionState] = useSessionJsonState<LeaderboardSubselectionState>(
    LEADERBOARD_SUBSELECTION_STORAGE_KEY,
    DEFAULT_SUBSELECTION_STATE
  );
  const [dismissedDailyWinnerKeys, setDismissedDailyWinnerKeys] = useState<string[]>([]);
  const [hasRestoredDailyWinnerDismissal, setHasRestoredDailyWinnerDismissal] = useState(false);
  const [restoredDailyWinnerDismissOwnerKey, setRestoredDailyWinnerDismissOwnerKey] = useState<string | null>(null);
  const [isIntroMoreOpen, setIsIntroMoreOpen] = useSessionDisclosureState(
    LEADERBOARD_INTRO_DISCLOSURE_STORAGE_KEY,
    false
  );
  const [leaderSummaryStateByContext, setLeaderSummaryStateByContext] = useState<
    Record<string, { isOpen: boolean; showAllLeaders: boolean }>
  >({});
  const hasLoadedLeaderboardRef = useRef(false);
  const lastSelectedGroupIdRef = useRef("");
  const lastSelectedManagerIdRef = useRef("");

  if (selectedGroupId) {
    lastSelectedGroupIdRef.current = selectedGroupId;
  }

  if (selectedManagerId) {
    lastSelectedManagerIdRef.current = selectedManagerId;
  }

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("view", activeView);
    if (selectedGroupId) {
      params.set("groupId", selectedGroupId);
    }
    if (selectedManagerId) {
      params.set("managerId", selectedManagerId);
    }

    return `/api/leaderboard?${params.toString()}`;
  }, [activeView, selectedGroupId, selectedManagerId]);
  const dailyWinnerDismissOwnerKey = user?.id ?? "anonymous";
  const autoPickLanguage = user?.preferredLanguage === "es" ? "es" : "en";
  const actionCopy = DASHBOARD_ACTION_COPY[autoPickLanguage];
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
  const nextUnsavedOpenMatch = useMemo(
    () => openMatches.find((match) => !savedMatchIds.has(match.id)) ?? null,
    [openMatches, savedMatchIds]
  );
  const nextPrimaryMatch = nextUnsavedOpenMatch ?? nextOpenMatch;
  const heroCtaLabel = completedCount > 0 ? actionCopy.myNextPick : actionCopy.myPicks;

  const loadManagedAwardGroup = useCallback(async () => {
    if (activeView !== "managed_groups" || !selectedGroupId) {
      setManagedAwardGroup(null);
      return;
    }

    const result = await listManagedGroupPlayersAction();
    if (!result.ok) {
      setManagedAwardGroup(null);
      return;
    }

    const matchedGroup = result.groups.find((group) => group.id === selectedGroupId) ?? null;
    setManagedAwardGroup(matchedGroup);
  }, [activeView, selectedGroupId]);

  const refreshHeroGroupMatches = useCallback(async () => {
    try {
      const items = await fetchGroupMatchesForPredictions();
      setGroupMatches(items);
    } catch (error) {
      console.warn("Could not refresh leaderboard hero group matches.", { error });
      setGroupMatches((currentMatches) => currentMatches);
    }
  }, []);

  const refreshHeroPredictions = useCallback(async () => {
    if (!user) {
      setPredictions([]);
      return;
    }

    try {
      const items = await fetchPlayerPredictions(user.id);
      setPredictions(items);
    } catch (error) {
      console.warn("Could not refresh leaderboard hero predictions.", { userId: user.id, error });
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
    refreshHeroPredictions().catch(() => {
      setPredictions(getStoredPredictions(user.id));
    });
  }, [refreshHeroPredictions, user]);

  useEffect(() => {
    if (typeof window === "undefined" || !user) {
      return;
    }

    function handleWindowFocus() {
      refreshHeroGroupMatches().catch(() => undefined);
      refreshHeroPredictions().catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshHeroGroupMatches().catch(() => undefined);
        refreshHeroPredictions().catch(() => undefined);
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshHeroGroupMatches, refreshHeroPredictions, user]);

  useEffect(() => {
    try {
      const queryView = searchParams.get("view");
      const queryGroupId = searchParams.get("groupId");
      const queryManagerId = searchParams.get("managerId");
      if (queryView || queryGroupId || queryManagerId) {
        setHasExplicitSwitcherPreference(true);
        if (queryView) {
          setActiveView(queryView as LeaderboardSwitcherView);
        }
        if (queryGroupId) {
          setSelectedGroupId(queryGroupId);
        }
        if (queryManagerId) {
          setSelectedManagerId(queryManagerId);
        }
      } else {
        const storedValue = window.sessionStorage.getItem(LEADERBOARD_SWITCHER_STORAGE_KEY);
        if (storedValue) {
          setHasExplicitSwitcherPreference(true);
          const parsed = JSON.parse(storedValue) as typeof DEFAULT_SWITCHER_STATE;
          if (parsed.activeView) {
            setActiveView(parsed.activeView);
          }
          if (parsed.selectedGroupId) {
            setSelectedGroupId(parsed.selectedGroupId);
          }
          if (parsed.selectedManagerId) {
            setSelectedManagerId(parsed.selectedManagerId);
          }
        }
      }
    } catch (caughtError) {
      console.warn("Could not restore leaderboard switcher state.", caughtError);
    } finally {
      setHasRestoredSwitcherPreference(true);
    }
  }, [searchParams]);

  useEffect(() => {
    setHasRestoredDailyWinnerDismissal(false);
    setRestoredDailyWinnerDismissOwnerKey(null);

    try {
      const localValue = window.localStorage.getItem(LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY);
      if (localValue) {
        const parsed = JSON.parse(localValue) as Record<string, string[]> | string | null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setDismissedDailyWinnerKeys(parsed[dailyWinnerDismissOwnerKey] ?? []);
        } else if (typeof parsed === "string") {
          setDismissedDailyWinnerKeys([parsed]);
        } else {
          setDismissedDailyWinnerKeys([]);
        }
      } else {
        setDismissedDailyWinnerKeys([]);
      }

      const legacySessionValue = window.sessionStorage.getItem(LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY);
      if (legacySessionValue) {
        const parsed = JSON.parse(legacySessionValue) as string | null;
        if (parsed) {
          setDismissedDailyWinnerKeys((current) => (current.includes(parsed) ? current : [...current, parsed]));
        }
      }
    } catch (caughtError) {
      console.warn("Could not restore Daily Winner dismissal state.", caughtError);
    } finally {
      setRestoredDailyWinnerDismissOwnerKey(dailyWinnerDismissOwnerKey);
      setHasRestoredDailyWinnerDismissal(true);
    }
  }, [dailyWinnerDismissOwnerKey]);

  useEffect(() => {
    if (!hasRestoredDailyWinnerDismissal || restoredDailyWinnerDismissOwnerKey !== dailyWinnerDismissOwnerKey) {
      return;
    }

    try {
      const localValue = window.localStorage.getItem(LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY);
      const parsed = localValue ? (JSON.parse(localValue) as Record<string, string[]> | string | null) : null;
      const nextState =
        parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : ({} as Record<string, string[]>);

      if (dismissedDailyWinnerKeys.length > 0) {
        nextState[dailyWinnerDismissOwnerKey] = dismissedDailyWinnerKeys;
      } else {
        delete nextState[dailyWinnerDismissOwnerKey];
      }

      window.localStorage.setItem(LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY, JSON.stringify(nextState));
    } catch (caughtError) {
      console.warn("Could not persist Daily Winner dismissal state.", caughtError);
    }
  }, [
    dailyWinnerDismissOwnerKey,
    dismissedDailyWinnerKeys,
    hasRestoredDailyWinnerDismissal,
    restoredDailyWinnerDismissOwnerKey
  ]);

  useEffect(() => {
    try {
      const storedValue = window.sessionStorage.getItem(LEADERBOARD_LEADER_SUMMARY_STORAGE_KEY);
      if (!storedValue) {
        return;
      }

      const parsed = JSON.parse(storedValue) as Record<string, { isOpen?: boolean; showAllLeaders?: boolean }>;
      setLeaderSummaryStateByContext(
        Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            {
              isOpen: Boolean(value?.isOpen),
              showAllLeaders: Boolean(value?.showAllLeaders)
            }
          ])
        )
      );
    } catch (caughtError) {
      console.warn("Could not restore leaderboard leader summary state.", caughtError);
    } finally {
      setHasRestoredLeaderSummaryState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredLeaderSummaryState) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        LEADERBOARD_LEADER_SUMMARY_STORAGE_KEY,
        JSON.stringify(leaderSummaryStateByContext)
      );
    } catch (caughtError) {
      console.warn("Could not save leaderboard leader summary state.", caughtError);
    }
  }, [hasRestoredLeaderSummaryState, leaderSummaryStateByContext]);

  useEffect(() => {
    let isMounted = true;

    function loadLeaderboard() {
      const shouldShowLoading = !hasLoadedLeaderboardRef.current;

      if (shouldShowLoading) {
        setIsLoading(true);
      } else {
        setDailyWinners([]);
      }

      fetch(requestUrl, { cache: "no-store" })
        .then(async (response) => {
          const result = (await response.json()) as
            | ({ ok: true } & LeaderboardPageData)
            | { ok: false; message?: string };

          if (!response.ok || !result.ok) {
            throw new Error(result.ok ? "Could not load the live leaderboard right now." : result.message);
          }

          return result;
        })
        .then((result) => {
          if (!isMounted) {
            return;
          }

          setUsers(result.leaderboard);
          setGroupStandings(result.groupStandings);
          setSwitcher(result.switcher);
          setDailyWinners(result.dailyWinners);
          setActivityFeed(result.activityFeed);
          setError(null);
          hasLoadedLeaderboardRef.current = true;
          setIsLoading(false);
        })
        .catch((caughtError: Error) => {
          if (isMounted) {
            setError(caughtError.message);
            setIsLoading(false);
          }
        });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        loadLeaderboard();
      }
    }

    loadLeaderboard();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [requestUrl, refreshNonce]);

  useEffect(() => {
    const refreshForTrophyChange = () => {
      setRefreshNonce((current) => current + 1);
    };

    window.addEventListener(TROPHY_STATE_CHANGED_EVENT, refreshForTrophyChange as EventListener);

    return () => {
      window.removeEventListener(TROPHY_STATE_CHANGED_EVENT, refreshForTrophyChange as EventListener);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!user?.id) {
      setGlobalStandingLabel(null);
      return;
    }

    fetch("/api/leaderboard?view=global", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as
          | ({ ok: true } & LeaderboardPageData)
          | { ok: false; message?: string };

        if (!response.ok || !result.ok) {
          throw new Error(result.ok ? "Could not load the live leaderboard right now." : result.message);
        }

        return result.leaderboard.find((profile) => profile.id === user.id) ?? null;
      })
      .then((profile) => {
        if (!isMounted) {
          return;
        }

        setGlobalStandingLabel(profile?.rank ? `Global #${profile.rank}` : "Global unranked");
      })
      .catch(() => {
        if (isMounted) {
          setGlobalStandingLabel(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user?.id, refreshNonce]);

  useEffect(() => {
    if (!pendingActivityAnchorId || !isActivityExpanded) {
      return;
    }

    const anchorId = `activity-${pendingActivityAnchorId}`;
    const scrollToTarget = () => {
      const target = document.getElementById(anchorId);
      if (!target) {
        return false;
      }

      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", `#${anchorId}`);
      }
      setPendingActivityAnchorId(null);
      return true;
    };

    if (scrollToTarget()) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      scrollToTarget();
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [activityFeed, isActivityExpanded, pendingActivityAnchorId]);

  useEffect(() => {
    void loadManagedAwardGroup();
  }, [loadManagedAwardGroup, refreshNonce]);

  useEffect(() => {
    if (!switcher) {
      return;
    }

    if (!hasExplicitSwitcherPreference) {
      const preferredView = getDefaultLeaderboardViewLocal(switcher);
      if (activeView !== preferredView) {
        setActiveView(preferredView);
      }
      return;
    }

    const allowedViews = new Set(switcher.tabs.map((tab) => tab.value));
    if (!allowedViews.has(activeView)) {
      setActiveView(switcher.tabs[0]?.value ?? "global");
    }
  }, [activeView, hasExplicitSwitcherPreference, switcher]);

  const availableGroupOptions = useMemo(
    () => (switcher ? getGroupOptionsForView(switcher, activeView) : []),
    [activeView, switcher]
  );

  useEffect(() => {
    if (!switcher || !shouldShowGroupSelector(activeView)) {
      return;
    }

    const rememberedGroupId = subselectionState.groupByView[activeView];
    const currentGroupIsValid = selectedGroupId
      ? availableGroupOptions.some((group) => group.id === selectedGroupId)
      : false;

    if (currentGroupIsValid) {
      return;
    }

    if (rememberedGroupId && availableGroupOptions.some((group) => group.id === rememberedGroupId)) {
      setSelectedGroupId(rememberedGroupId);
      return;
    }

    if (availableGroupOptions.length > 0) {
      setSelectedGroupId(availableGroupOptions[0]!.id);
      return;
    }

    if (selectedGroupId) {
      setSelectedGroupId("");
    }
  }, [activeView, availableGroupOptions, selectedGroupId, subselectionState.groupByView, switcher]);

  useEffect(() => {
    if (!switcher || !shouldShowManagerSelector(activeView)) {
      return;
    }

    const availableManagerIds = new Set(switcher.managers.map((manager) => manager.id));
    const rememberedManagerId = subselectionState.managerByView[activeView] ?? "";

    if (selectedManagerId && availableManagerIds.has(selectedManagerId)) {
      return;
    }

    if (rememberedManagerId && availableManagerIds.has(rememberedManagerId)) {
      setSelectedManagerId(rememberedManagerId);
      return;
    }

    if (selectedManagerId) {
      setSelectedManagerId("");
    }
  }, [activeView, selectedManagerId, subselectionState.managerByView, switcher]);

  useEffect(() => {
    if (!hasRestoredSwitcherPreference) {
      return;
    }

    const nextState = {
      activeView,
      selectedGroupId,
      selectedManagerId
    };

    try {
      window.sessionStorage.setItem(LEADERBOARD_SWITCHER_STORAGE_KEY, JSON.stringify(nextState));
    } catch (caughtError) {
      console.warn("Could not persist leaderboard switcher state.", caughtError);
    }
  }, [activeView, hasRestoredSwitcherPreference, selectedGroupId, selectedManagerId]);

  useEffect(() => {
    if (!shouldShowGroupSelector(activeView) || !selectedGroupId) {
      return;
    }

    setSubselectionState((current) => {
      if (current.groupByView[activeView] === selectedGroupId) {
        return current;
      }

      return {
        ...current,
        groupByView: {
          ...current.groupByView,
          [activeView]: selectedGroupId
        }
      };
    });
  }, [activeView, selectedGroupId, setSubselectionState]);

  useEffect(() => {
    if (!shouldShowManagerSelector(activeView)) {
      return;
    }

    setSubselectionState((current) => {
      if (current.managerByView[activeView] === selectedManagerId) {
        return current;
      }

      return {
        ...current,
        managerByView: {
          ...current.managerByView,
          [activeView]: selectedManagerId
        }
      };
    });
  }, [activeView, selectedManagerId, setSubselectionState]);

  const selectedGroupLabel = useMemo(
    () => availableGroupOptions.find((group) => group.id === selectedGroupId)?.label ?? null,
    [availableGroupOptions, selectedGroupId]
  );
  const selectedManagerLabel = useMemo(
    () => switcher?.managers.find((manager) => manager.id === selectedManagerId)?.label ?? null,
    [selectedManagerId, switcher?.managers]
  );
  const dailyWinnerContextLabel = useMemo(() => {
    if (activeView === "global") {
      return "Global";
    }

    if ((activeView === "managed_groups" || activeView === "my_groups") && selectedGroupLabel) {
      return selectedGroupLabel;
    }

    if (activeView === "groups") {
      return "Group Standings";
    }

    if (activeView === "managers" && selectedManagerLabel) {
      return selectedManagerLabel;
    }

    return null;
  }, [activeView, selectedGroupLabel, selectedManagerLabel]);
  const stableLeaderSummaryGroupId = selectedGroupId || lastSelectedGroupIdRef.current;
  const stableLeaderSummaryManagerId = selectedManagerId || lastSelectedManagerIdRef.current;
  const leaderSummaryContextKey = useMemo(
    () => getLeaderSummaryContextKey(activeView, stableLeaderSummaryGroupId, stableLeaderSummaryManagerId),
    [activeView, stableLeaderSummaryGroupId, stableLeaderSummaryManagerId]
  );
  const leaderSummaryState = leaderSummaryStateByContext[leaderSummaryContextKey] ?? {
    isOpen: false,
    showAllLeaders: false
  };

  const isGlobalView = activeView === "global";
  const isGroupView = shouldShowGroupSelector(activeView) && Boolean(selectedGroupId);
  const isGroupStandingsView = activeView === "groups";
  const shouldRenderLeaderboardRows = isGlobalView || isGroupView;
  const shouldShowPlayerSocialIndicators = !isGlobalView;
  const canAwardManagedTrophies = activeView === "managed_groups" && Boolean(managedAwardGroup);
  const canSelfAwardTrophies = user?.role === "admin";
  const leaders = useMemo(() => users.filter((profile) => profile.rank === 1), [users]);
  const sharedLeaderScore = leaders[0]?.totalPoints ?? null;
  const activityMentionCount = useMemo(
    () =>
      activityFeed.filter(
        (event) =>
          event.eventType === "daily_winner" ||
          event.eventType === "perfect_pick" ||
          event.eventType === "trophy_awarded"
      ).length,
    [activityFeed]
  );
  const featuredActivityFeed = useMemo(
    () =>
      [...activityFeed]
        .filter((event) => getFeaturedActivityRank(event) < Number.POSITIVE_INFINITY)
        .sort((left, right) => {
          const rankDelta = getFeaturedActivityRank(left) - getFeaturedActivityRank(right);
          if (rankDelta !== 0) {
            return rankDelta;
          }

          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        }),
    [activityFeed]
  );
  const overflowActivityFeed = useMemo(
    () =>
      [...activityFeed]
        .filter((event) => getFeaturedActivityRank(event) === Number.POSITIVE_INFINITY)
        .sort((left, right) => {
          const leftPoints = left.eventType === "points_awarded" ? left.pointsDelta ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
          const rightPoints =
            right.eventType === "points_awarded" ? right.pointsDelta ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;

          if (leftPoints !== rightPoints) {
            return rightPoints - leftPoints;
          }

          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        }),
    [activityFeed]
  );
  const dailyWinnerScopeKey = useMemo(() => {
    if (activeView === "managed_groups" || activeView === "my_groups") {
      return `${activeView}:${selectedGroupId || "all"}`;
    }

    return activeView;
  }, [activeView, selectedGroupId]);
  const dailyWinnerDismissKey = useMemo(() => {
    if (dailyWinners.length === 0) {
      return "";
    }

    const dateKey = getCurrentDateKeyLocal(LEADERBOARD_TIME_ZONE);
    const winnerIds = dailyWinners
      .map((winner) => winner.userId)
      .sort()
      .join("|");

    return `${dailyWinnerScopeKey}:${dateKey}:${winnerIds}`;
  }, [dailyWinnerScopeKey, dailyWinners]);
  const isDailyWinnerDismissed =
    Boolean(dailyWinnerDismissKey) && dismissedDailyWinnerKeys.includes(dailyWinnerDismissKey);
  const canEvaluateDailyWinnerDismissal =
    !isUserLoading &&
    hasRestoredDailyWinnerDismissal &&
    restoredDailyWinnerDismissOwnerKey === dailyWinnerDismissOwnerKey;

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.info("[leaderboard] daily winner dismissal", {
      ownerKey: dailyWinnerDismissOwnerKey,
      eventKey: dailyWinnerDismissKey,
      dismissedKeys: dismissedDailyWinnerKeys,
      hiddenBecauseDismissed: isDailyWinnerDismissed,
      dailyWinnerCount: dailyWinners.length
    });
  }, [
    dailyWinnerDismissKey,
    dailyWinnerDismissOwnerKey,
    dailyWinners.length,
    dismissedDailyWinnerKeys,
    isDailyWinnerDismissed
  ]);
  const activeManagedTrophyMember = managedAwardGroup && managedTrophySheetTarget
    ? managedAwardGroup.members.find((member) => member.userId === managedTrophySheetTarget.userId) ?? null
    : null;
  const shouldShowGroupCarouselControls = shouldShowGroupSelector(activeView) && availableGroupOptions.length > 1;

  const handleSelectView = useCallback((nextView: LeaderboardSwitcherView) => {
    setHasExplicitSwitcherPreference(true);
    setActiveView(nextView);
  }, []);

  const handleSelectGroup = useCallback((nextGroupId: string) => {
    setHasExplicitSwitcherPreference(true);
    setSelectedGroupId(nextGroupId);
  }, []);

  const handleSelectManager = useCallback((nextManagerId: string) => {
    setHasExplicitSwitcherPreference(true);
    setSelectedManagerId(nextManagerId);
  }, []);

  function renderActivityCard(event: LeaderboardActivityItem, isNewest: boolean) {
    return (
      <div
        key={event.id}
        id={event.eventId ? `activity-${event.eventId}` : undefined}
        className={`rounded-md border px-3 py-3 ${isNewest ? `${getActivityCardTone(event)} shadow-sm` : `${getActivityCardTone(event)}`}`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-black ${getActivityIconTone(
              event
            )}`}
            aria-hidden="true"
          >
            {getActivityIcon(event)}
          </span>
          <div className="min-w-0 flex-1">
            {event.userName ? (
              <div className="mb-1 flex items-start gap-2">
                <Avatar name={event.userName} avatarUrl={event.userAvatarUrl ?? undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p
                      style={TWO_LINE_CLAMP_STYLE}
                      className={`min-w-0 flex-1 text-sm font-semibold leading-5 ${isNewest ? "text-gray-900" : "text-gray-800"}`}
                    >
                      {event.message}
                    </p>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-black ${getActivityBadgeTone(
                          event
                        )}`}
                      >
                        {getActivityLabel(event)}
                      </span>
                      {isNewest ? (
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Newest</p>
                      ) : null}
                    </div>
                  </div>
                  {event.userHomeTeamId || event.canComment ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {event.userHomeTeamId ? (
                        <HomeTeamBadge teamId={event.userHomeTeamId} label="" className="bg-white/75 py-0.5" />
                      ) : null}
                      {event.canComment ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedComments((current) => ({
                              ...current,
                              [event.eventId!]: !current[event.eventId!]
                            }))
                          }
                          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                          aria-expanded={Boolean(event.eventId && expandedComments[event.eventId])}
                          aria-label={
                            event.eventId && expandedComments[event.eventId]
                              ? `Hide comments for ${event.message}`
                              : `Open comments for ${event.message}`
                          }
                        >
                          {event.eventId && expandedComments[event.eventId] ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          )}
                          <span>💬 {event.comments.length > 0 ? `${event.comments.length} comments` : "Comments"}</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!event.userName ? (
              <div className="flex items-start justify-between gap-3">
                <p
                  style={TWO_LINE_CLAMP_STYLE}
                  className={`min-w-0 flex-1 text-sm font-semibold leading-5 ${isNewest ? "text-gray-900" : "text-gray-800"}`}
                >
                  {event.message}
                </p>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-black ${getActivityBadgeTone(
                      event
                    )}`}
                  >
                    {getActivityLabel(event)}
                  </span>
                  {isNewest ? (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Newest</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {event.canReact && user ? (
              <div className="mt-2 flex items-center justify-end gap-3">
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {["🔥", "🎯", "👀", "👍"].map((emoji) => {
                      const reaction = event.reactions.find((item) => item.emoji === emoji);
                      const reactionKey = `${event.eventId}:${emoji}`;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            void handleReactionToggle(event.eventId, emoji, reaction?.reacted ?? false);
                          }}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold transition ${
                            reaction?.reacted
                              ? "border-accent bg-accent-light text-accent-dark"
                              : "border-gray-200 bg-white text-gray-700 hover:border-accent hover:bg-accent-light"
                          }`}
                          disabled={activeReactionKey === reactionKey}
                        >
                          <span>{emoji}</span>
                          <span>{reaction?.count ?? 0}</span>
                        </button>
                      );
                    })}
                  </div>
              </div>
            ) : null}
            {event.canComment && event.eventId && expandedComments[event.eventId] ? (
              <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                {event.comments.length > 0 ? (
                  <div className="space-y-2">
                    {event.comments.map((comment) => (
                      <div key={comment.id} className="rounded-md bg-white/80 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-gray-800">{comment.userName}</p>
                          <p className="text-[11px] font-semibold text-gray-500">
                            {formatRelativeTime(comment.createdAt)}
                          </p>
                        </div>
                        <p className="mt-1 text-sm text-gray-700">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-gray-500">No comments yet.</p>
                )}
                <div className="space-y-2">
                  <textarea
                    value={event.eventId ? commentDrafts[event.eventId] ?? "" : ""}
                    onChange={(currentEvent) => {
                      const nextValue = currentEvent.target.value;
                      if (!event.eventId) {
                        return;
                      }

                      setCommentDrafts((current) => ({
                        ...current,
                        [event.eventId!]: nextValue
                      }));
                    }}
                    rows={3}
                    maxLength={280}
                    placeholder="Add a comment"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-gray-500">Keep it kind. 280 characters max.</p>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCommentSubmit(event.eventId!);
                      }}
                      disabled={
                        !event.eventId ||
                        activeCommentEventId === event.eventId ||
                        !(commentDrafts[event.eventId] ?? "").trim()
                      }
                      className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {activeCommentEventId === event.eventId ? "Posting..." : "Post comment"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  async function handleHeroAutoPickAction() {
    setIsHeroAutoPicking(true);

    try {
      clearGroupsEntryIntent();
      clearStoredAutoPickDraft();
      const suggestion = await fetchNextAutoPick();
      storeAutoPickDraft(suggestion);
      const targetMatch = groupMatches.find((match) => match.id === suggestion.matchId) ?? null;
      const groupKey = normalizeGroupKey(targetMatch?.groupName) ?? null;
      storeGroupsEntryIntent({
        source: "dashboard",
        target: "next-auto-pick",
        matchId: suggestion.matchId,
        groupKey
      });
      router.push("/groups");
    } catch (error) {
      const message = error instanceof Error ? error.message : DASHBOARD_AUTO_PICK_EMPTY_COPY[autoPickLanguage];
      const localizedMessage =
        message === DASHBOARD_AUTO_PICK_EMPTY_COPY.en ? DASHBOARD_AUTO_PICK_EMPTY_COPY[autoPickLanguage] : message;

      showAppToast({
        tone: localizedMessage === DASHBOARD_AUTO_PICK_EMPTY_COPY[autoPickLanguage] ? "tip" : "error",
        text: localizedMessage
      });
    } finally {
      setIsHeroAutoPicking(false);
    }
  }

  function handleHeroPrimaryAction() {
    if (completedCount > 0) {
      clearGroupsEntryIntent();
      clearStoredAutoPickDraft();
      storeGroupsEntryIntent({
        source: "dashboard",
        target: "next-pick",
        matchId: nextPrimaryMatch?.id ?? null,
        groupKey: normalizeGroupKey(nextPrimaryMatch?.groupName) ?? null
      });
    }

    router.push("/groups");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-gray-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Leaderboard</p>
          {globalStandingLabel ? (
            <div className="shrink-0 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:py-2">
              {globalStandingLabel}
            </div>
          ) : null}
        </div>
        <div className="mt-3 min-w-0">
          <h2 className="text-xl font-black leading-tight sm:text-2xl">Compare your standings against the rest</h2>
          <div className="mt-3 flex justify-start">
            <InlineDisclosureButton
              isOpen={isIntroMoreOpen}
              variant="subtle"
              onClick={() => setIsIntroMoreOpen((current) => !current)}
            />
          </div>
          {isIntroMoreOpen ? (
            <div className="mt-3 space-y-4">
              <p className="text-sm leading-6 text-gray-600">
                A quick snapshot of your current rank, total points, and recent movement across global and group
                leaderboards.
              </p>
              <div className="mx-auto max-w-xl">
                <DashboardHeroActionGrid
                  ctaLabel={heroCtaLabel}
                  onPrimaryAction={handleHeroPrimaryAction}
                  autoPickLabel={DASHBOARD_AUTO_PICK_LABEL_COPY[autoPickLanguage]}
                  autoPickLoadingLabel={DASHBOARD_AUTO_PICK_LOADING_COPY[autoPickLanguage]}
                  knockoutLabel={actionCopy.myKnockoutPicks}
                  sidePicksLabel={actionCopy.mySidePicks}
                  isAutoPicking={isHeroAutoPicking}
                  onAutoPick={handleHeroAutoPickAction}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {!isLoading && !error && canEvaluateDailyWinnerDismissal && dailyWinners.length > 0 && !isDailyWinnerDismissed ? (
        <section className="relative overflow-hidden rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100 p-4 shadow-sm">
          <div className="relative">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="text-sm font-bold uppercase tracking-wide text-amber-700">🏆 Daily Winner</p>
                  {dailyWinnerContextLabel ? (
                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-white/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                      {dailyWinnerContextLabel}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {dailyWinners[0]?.eventId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsActivityExpanded(true);
                        setPendingActivityAnchorId(dailyWinners[0]?.eventId ?? null);
                      }}
                      className="text-xs font-bold text-amber-800 underline-offset-2 hover:underline"
                    >
                      See in Recent Activity
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (!dailyWinnerDismissKey) {
                        return;
                      }

                      setDismissedDailyWinnerKeys((current) =>
                        current.includes(dailyWinnerDismissKey) ? current : [...current, dailyWinnerDismissKey]
                      );
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-white/90 text-amber-800 transition hover:border-amber-300 hover:bg-amber-50"
                    aria-label="Dismiss daily winner"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm font-semibold text-gray-600">
                {dailyWinners.length === 1 ? "Highest points today." : "Tied for the highest points today."}
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              {dailyWinners.map((winner) => {
                const reactionKey = winner.eventId ? `${winner.eventId}:👏` : null;
                return (
                  <div
                    key={winner.userId}
                    className="rounded-lg border border-amber-200/80 bg-white/85 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-3">
                        <Avatar
                          name={winner.name}
                          avatarUrl={winner.avatarUrl ?? undefined}
                          size="md"
                          className="border-amber-200"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-gray-950">{winner.name}</p>
                          <p className="mt-1 text-sm font-semibold text-amber-800">{winner.points} pts today</p>
                          {winner.homeTeamId ? (
                            <div className="mt-2">
                              <HomeTeamBadge teamId={winner.homeTeamId} className="border-amber-200 bg-amber-50/80" />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {user ? (
                        <button
                          type="button"
                          onClick={() => {
                            void handleReactionToggle(
                              winner.eventId ?? null,
                              "👏",
                              winner.congratulated ?? false
                            );
                          }}
                          disabled={!winner.eventId || activeReactionKey === reactionKey}
                          className={`shrink-0 rounded-full border px-3 py-2 text-sm font-bold transition ${
                            winner.congratulated
                              ? "border-amber-300 bg-amber-100 text-amber-900"
                              : "border-amber-200 bg-white text-gray-700 hover:border-amber-300 hover:bg-amber-50"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span>👏</span>
                            <span>{winner.congratulated ? "Congratulated" : "Congratulate"}</span>
                            {winner.congratulationsCount ? <span>{winner.congratulationsCount}</span> : null}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      <section
        className="sticky z-[14] -mx-4 bg-white px-4 pb-2 pt-1.5 shadow-[0_12px_22px_-18px_rgba(15,23,42,0.45)] sm:mx-0 sm:rounded-lg sm:border sm:border-gray-200 sm:px-3"
        style={{ top: "calc(var(--app-header-height, 72px) + env(safe-area-inset-top, 0px) + 10px)" }}
      >
        {renderSwitcherControls("px-1")}
      </section>

      {!isLoading && !error && activityFeed.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Recent Activity</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {activityFeed.length} recent update{activityFeed.length === 1 ? "" : "s"} · {activityMentionCount} mention
                {activityMentionCount === 1 ? "" : "s"}
              </p>
            </div>
            <InlineDisclosureButton
              isOpen={isActivityExpanded}
              onClick={() => setIsActivityExpanded((current) => !current)}
            />
          </div>
          {isActivityExpanded ? (
            <div className="mt-2.5 space-y-2">
              {featuredActivityFeed.map((event, index) => renderActivityCard(event, index === 0))}
              {overflowActivityFeed.length > 0 ? (
                <div className="pt-1">
                  <InlineDisclosureButton
                    isOpen={isActivityMoreOpen}
                    variant="subtle"
                    onClick={() => setIsActivityMoreOpen((current) => !current)}
                  />
                </div>
              ) : null}
              {isActivityMoreOpen ? overflowActivityFeed.map((event) => renderActivityCard(event, false)) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {shouldRenderLeaderboardRows ? (
        <section className="space-y-2">
          {!isLoading && !error && leaders.length > 1 ? (
            <LeaderSummaryCard
              leaders={leaders}
              sharedScore={sharedLeaderScore}
              isOpen={leaderSummaryState.isOpen}
              showAllLeaders={leaderSummaryState.showAllLeaders}
              onToggleOpen={() =>
                setLeaderSummaryStateByContext((current) => ({
                  ...current,
                  [leaderSummaryContextKey]: {
                    isOpen: !leaderSummaryState.isOpen,
                    showAllLeaders: leaderSummaryState.showAllLeaders
                  }
                }))
              }
              onShowAllLeaders={() =>
                setLeaderSummaryStateByContext((current) => ({
                  ...current,
                  [leaderSummaryContextKey]: {
                    isOpen: leaderSummaryState.isOpen,
                    showAllLeaders: true
                  }
                }))
              }
              onShowFewerLeaders={() =>
                setLeaderSummaryStateByContext((current) => ({
                  ...current,
                  [leaderSummaryContextKey]: {
                    isOpen: leaderSummaryState.isOpen,
                    showAllLeaders: false
                  }
                }))
              }
            />
          ) : null}

          <div className="px-1 pt-1">
            <h3 className="text-base font-black text-gray-950">Leaderboard</h3>
          </div>
          {isLoading ? (
            <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
              Loading leaderboard...
            </p>
          ) : null}

          {!isLoading && error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Could not load the live leaderboard right now: {error}
            </p>
          ) : null}

          {users.map((profile, index) => (
            (() => {
              const isCurrentUser = profile.id === user?.id;
              const isLightlyHighlighted = index < 3;
              const rowTone = isCurrentUser
                ? "border-accent bg-accent-light"
                : isLightlyHighlighted
                  ? "border-gray-300 bg-gray-50"
                  : "border-gray-200 bg-white";
              const rankTone = isCurrentUser
                ? "bg-white text-accent-dark"
                : isLightlyHighlighted
                  ? "bg-white text-gray-800"
                  : "bg-gray-100 text-gray-700";
              const pointsTone = isCurrentUser
                ? "bg-white text-accent-dark"
                : "bg-white text-gray-800";
              const socialTone = isCurrentUser ? "text-gray-600" : "text-gray-500";
              const badgeHomeTeamTone = isCurrentUser ? "bg-white/85" : "bg-white/70";

              return (
            <div
              key={profile.id}
              className={`rounded-lg border p-3 ${rowTone}`}
            >
              <Link
                href={`/leaderboard/${profile.id}`}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5"
              >
                <span
                  className={`flex min-h-12 min-w-12 flex-col items-center justify-center rounded-md px-2 py-1 text-center ${rankTone}`}
                >
                  <span className="text-sm font-black leading-none">{profile.rank ?? index + 1}</span>
                  <span className="mt-1 text-[9px] font-black uppercase tracking-wide leading-none">Place</span>
                </span>
                <span className="min-w-0 flex items-center gap-2.5">
                  <Avatar
                    name={profile.name}
                    avatarUrl={profile.avatarUrl}
                    size="md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span
                          className="min-w-0 truncate text-base font-black text-gray-950"
                        >
                          {profile.name}
                          {isCurrentUser ? " (You)" : ""}
                        </span>
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        <span className="flex flex-col items-end gap-1">
                          <span
                            className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-semibold ${pointsTone}`}
                          >
                            {profile.totalPoints} points
                          </span>
                          {profile.pointsDelta && profile.pointsDelta > 0 ? (
                            <span className="text-xs font-black text-accent-dark">
                              +{profile.pointsDelta} pts
                            </span>
                          ) : null}
                          {profile.rankDelta ? (
                            <span className={`text-xs font-black ${getMovementTone(profile.rankDelta)}`}>
                              {formatRankMovement(profile.rankDelta)}
                            </span>
                          ) : null}
                        </span>
                        {canAwardManagedTrophies && (profile.id !== user?.id || canSelfAwardTrophies) ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (!managedAwardGroup) {
                                return;
                              }
                              setManagedTrophySheetTarget({ groupId: managedAwardGroup.id, userId: profile.id });
                            }}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-base transition hover:border-accent hover:bg-accent-light"
                            aria-label={`Award trophy to ${profile.name}`}
                          >
                            🏆
                          </button>
                        ) : null}
                      </span>
                    </span>
                    {shouldShowPlayerSocialIndicators ? (
                      <span
                        className={`mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold ${socialTone}`}
                      >
                        {profile.hasPerfectPickHighlight ? (
                          <span className="rounded-md bg-rose-100 px-2 py-1 text-[11px] font-black text-rose-700">
                            🎯 Perfect Pick
                          </span>
                        ) : null}
                        {profile.trophies && profile.trophies.length > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            {profile.trophies.slice(0, 2).map((trophy) => (
                              <TrophyBadge
                                key={`${profile.id}-${trophy.id}`}
                                icon={trophy.icon}
                                tier={trophy.tier}
                                size="sm"
                                className={isCurrentUser ? "border-accent/40" : ""}
                              />
                            ))}
                          </span>
                        ) : null}
                        {profile.homeTeamId ? (
                          <HomeTeamBadge
                            teamId={profile.homeTeamId}
                            className={badgeHomeTeamTone}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </div>
              );
            })()
          ))}
        </section>
      ) : isGroupStandingsView ? (
        <GroupStandingsSection groups={groupStandings} isLoading={isLoading} error={error} />
      ) : (
        <LeaderboardPlaceholder
          activeView={activeView}
          selectedGroupLabel={selectedGroupLabel}
          selectedManagerLabel={selectedManagerLabel}
        />
      )}

      <ManagedTrophyAwardSheet
        open={Boolean(managedAwardGroup && activeManagedTrophyMember)}
        groupName={managedAwardGroup?.name ?? ""}
        member={activeManagedTrophyMember}
        trophies={managedAwardGroup?.trophies ?? []}
        pendingTrophyId={managedAwardGroup && activeManagedTrophyMember ? getPendingManagedTrophyId(activeManagedTrophyKey, managedAwardGroup.id, activeManagedTrophyMember.userId) : null}
        onAward={(trophyId) => {
          if (!managedAwardGroup || !activeManagedTrophyMember) {
            return;
          }

          void handleManagedLeaderboardTrophyAward(managedAwardGroup.id, activeManagedTrophyMember.userId, trophyId);
        }}
        onClose={() => setManagedTrophySheetTarget(null)}
      />

      <TrophyCelebration
        open={Boolean(celebrationTrophy)}
        trophy={celebrationTrophy}
        onDismiss={() => setCelebrationTrophy(null)}
      />
    </div>
  );

  async function handleReactionToggle(eventId: string | null, emoji: string, reacted: boolean) {
    if (!eventId || !user) {
      return;
    }

    const reactionKey = `${eventId}:${emoji}`;
    setActiveReactionKey(reactionKey);

    try {
      const response = await fetch("/api/leaderboard/reactions", {
        method: reacted ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ eventId, emoji })
      });

      const result = (await response.json()) as
        | { ok: true; reactions: LeaderboardActivityItem["reactions"] }
        | { ok: false; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? "Could not update that reaction." : result.message);
      }

      setActivityFeed((currentFeed) =>
        currentFeed.map((event) =>
          event.eventId === eventId
            ? {
                ...event,
                reactions: result.reactions
              }
            : event
        )
      );
      setDailyWinners((currentWinners) =>
        currentWinners.map((winner) => {
          if (winner.eventId !== eventId) {
            return winner;
          }

          const congratulateReaction = result.reactions.find((reaction) => reaction.emoji === "👏");
          return {
            ...winner,
            congratulationsCount: congratulateReaction?.count ?? 0,
            congratulated: congratulateReaction?.reacted ?? false
          };
        })
      );
    } catch (caughtError) {
      console.error("Failed to toggle leaderboard reaction.", caughtError);
    } finally {
      setActiveReactionKey(null);
    }
  }

  async function handleCommentSubmit(eventId: string | null) {
    if (!eventId || !user) {
      return;
    }

    const now = Date.now();
    if ((lastCommentAtByEvent[eventId] ?? 0) > now - 3000) {
      return;
    }

    const body = (commentDrafts[eventId] ?? "").trim();
    if (!body) {
      return;
    }

    setActiveCommentEventId(eventId);

    try {
      const response = await fetch("/api/leaderboard/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ eventId, body })
      });

      const result = (await response.json()) as
        | { ok: true; comments: LeaderboardActivityItem["comments"] }
        | { ok: false; message?: string };

      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? "Could not add that comment." : result.message);
      }

      setActivityFeed((currentFeed) =>
        currentFeed.map((event) =>
          event.eventId === eventId
            ? {
                ...event,
                comments: result.comments
              }
            : event
        )
      );
      setCommentDrafts((current) => ({ ...current, [eventId]: "" }));
      setExpandedComments((current) => ({ ...current, [eventId]: true }));
      setLastCommentAtByEvent((current) => ({ ...current, [eventId]: now }));
    } catch (caughtError) {
      console.error("Failed to add leaderboard comment.", caughtError);
    } finally {
      setActiveCommentEventId(null);
    }
  }

  async function handleManagedLeaderboardTrophyAward(groupId: string, userId: string, trophyId: string) {
    const actionKey = `award-managed-leaderboard-${groupId}:${userId}:${trophyId}`;
    setActiveManagedTrophyKey(actionKey);

    try {
      const result = await awardManagedGroupTrophyAction(groupId, userId, trophyId);
      if (!result.ok) {
        throw new Error(result.message);
      }

      if (!result.alreadyAwarded && result.trophy) {
        setCelebrationTrophy(result.trophy);
      }

      setManagedTrophySheetTarget(null);
      setRefreshNonce((current) => current + 1);
    } catch (caughtError) {
      console.error("Failed to award managed leaderboard trophy.", caughtError);
      setError(caughtError instanceof Error ? caughtError.message : "Could not award that trophy.");
    } finally {
      setActiveManagedTrophyKey(null);
    }
  }

  function renderSwitcherControls(className?: string) {
    return (
      <div className={className ? `${className} space-y-1.5` : "space-y-1.5"}>
        <LeaderboardChoiceRail
          prevLabel="Show previous leaderboard views"
          nextLabel="Show more leaderboard views"
          activeItemKey={activeView}
          onActiveItemChange={(nextKey) => handleSelectView(nextKey as LeaderboardSwitcherView)}
        >
          {(switcher?.tabs ?? [{ value: "global", label: "Global Standings" }]).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleSelectView(tab.value)}
              data-choice-key={tab.value}
              data-choice-active={activeView === tab.value ? "true" : "false"}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] font-bold leading-none ${
                activeView === tab.value ? "bg-accent text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </LeaderboardChoiceRail>

        {(shouldShowGroupSelector(activeView) || shouldShowManagerSelector(activeView)) && switcher ? (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {shouldShowGroupSelector(activeView) ? (
              <div className="overflow-hidden rounded-md sm:col-span-2">
                <LeaderboardChoiceRail
                  showControls={shouldShowGroupCarouselControls}
                  prevLabel="Show previous groups"
                  nextLabel="Show more groups"
                  contentClassName="flex gap-1.5 pb-0.5"
                  activeItemKey={selectedGroupId}
                  onActiveItemChange={(nextKey) => handleSelectGroup(nextKey)}
                >
                  {availableGroupOptions.length > 0 ? (
                    availableGroupOptions.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => handleSelectGroup(group.id)}
                        data-choice-key={group.id}
                        data-choice-active={selectedGroupId === group.id ? "true" : "false"}
                        className={`w-[min(12.25rem,calc(100vw-7.25rem))] max-w-full shrink-0 rounded-lg border px-2 py-1 text-left transition sm:w-[196px] ${
                          selectedGroupId === group.id
                            ? "border-accent bg-accent-light"
                            : "border-gray-200 bg-gray-50 hover:border-accent-light hover:bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-black leading-4 text-gray-950">{group.label}</p>
                          </div>
                          {group.rankDelta ? (
                            <span className={`text-[11px] font-black ${getMovementTone(group.rankDelta)}`}>
                              {formatRankMovement(group.rankDelta)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-gray-600">
                          <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-gray-800">
                            {group.rank ? `#${group.rank}` : "—"}
                          </span>
                          <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-gray-800">
                            {group.totalPlayers} players
                          </span>
                          <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-gray-800">
                            {group.points !== null ? `${group.points} pts` : "— pts"}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-600">
                      {activeView === "managed_groups"
                        ? "You are not managing any groups yet."
                        : "You have not joined any groups yet."}
                    </p>
                  )}
                </LeaderboardChoiceRail>
              </div>
            ) : null}

            {shouldShowManagerSelector(activeView) ? (
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Manager</span>
                <select
                  value={selectedManagerId}
                  onChange={(event) => handleSelectManager(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[13px] font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  <option value="">Choose a manager</option>
                  {switcher.managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
}

function LeaderboardPlaceholder({
  activeView,
  selectedGroupLabel,
  selectedManagerLabel
}: {
  activeView: LeaderboardSwitcherView;
  selectedGroupLabel: string | null;
  selectedManagerLabel: string | null;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Leaderboard View</p>
      <h3 className="mt-2 text-2xl font-black text-gray-950">{getPlaceholderTitle(activeView)}</h3>
      <p className="mt-2 text-sm font-semibold text-gray-600">
        {getPlaceholderCopy(activeView, selectedGroupLabel, selectedManagerLabel)}
      </p>
      <p className="mt-2.5 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700">
        Progress indicators are currently available on the Global leaderboard. Group progress is coming next.
      </p>
      <p className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700">
        Group leaderboard coming next.
      </p>
    </section>
  );
}

function shouldShowGroupSelector(activeView: LeaderboardSwitcherView) {
  return activeView === "my_groups" || activeView === "managed_groups";
}

function getCurrentDateKeyLocal(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function getGroupOptionsForView(
  switcher: LeaderboardSwitcherContext,
  activeView: LeaderboardSwitcherView
): LeaderboardGroupNavItem[] {
  if (activeView === "managed_groups") {
    return switcher.managedGroups;
  }

  if (activeView === "my_groups") {
    return switcher.joinedGroups;
  }

  return [];
}

function getDefaultLeaderboardViewLocal(switcher: LeaderboardSwitcherContext): LeaderboardSwitcherView {
  if (switcher.managedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "managed_groups")) {
    return "managed_groups";
  }

  if (switcher.joinedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "my_groups")) {
    return "my_groups";
  }

  return switcher.tabs[0]?.value ?? "global";
}

function shouldShowManagerSelector(activeView: LeaderboardSwitcherView) {
  return activeView === "managers";
}

function getPlaceholderTitle(activeView: LeaderboardSwitcherView) {
  if (activeView === "my_groups") {
    return "Invited / Joined Groups";
  }
  if (activeView === "managed_groups") {
    return "My Managed Groups";
  }
  if (activeView === "groups") {
    return "Group Standings";
  }
  if (activeView === "managers") {
    return "Managers";
  }
  return "Global Standings";
}

function getLeaderSummaryContextKey(
  activeView: LeaderboardSwitcherView,
  selectedGroupId: string,
  selectedManagerId: string
) {
  if (activeView === "my_groups" || activeView === "managed_groups") {
    return `${activeView}:${selectedGroupId || "none"}`;
  }

  if (activeView === "groups" || activeView === "managers") {
    return `${activeView}:${selectedManagerId || "none"}`;
  }

  return activeView;
}

function getPlaceholderCopy(
  activeView: LeaderboardSwitcherView,
  selectedGroupLabel: string | null,
  selectedManagerLabel: string | null
) {
  if (activeView === "managers") {
    return selectedManagerLabel
      ? `We are lining up ${selectedManagerLabel}'s leaderboard context next.`
      : "Choose a manager to preview that leaderboard context.";
  }

  if (shouldShowGroupSelector(activeView)) {
    return selectedGroupLabel
      ? `We are lining up ${selectedGroupLabel}'s leaderboard context next.`
      : "Choose a group to preview that leaderboard context.";
  }

  if (activeView === "groups") {
    return "Standings include groups you joined and groups you manage.";
  }

  return "Global leaderboard is ready now.";
}

function GroupStandingsSection({
  groups,
  isLoading,
  error
}: {
  groups: GroupStandingItem[];
  isLoading: boolean;
  error: string | null;
}) {
  const topAverage = groups[0]?.avgPoints ?? 0;
  const allGroupsAreScoreless = groups.length > 0 && groups.every((group) => group.totalPoints <= 0);

  return (
    <section className="space-y-2">
          <div className="px-1 pt-1">
            <h3 className="text-base font-black text-gray-950">Group Standings</h3>
          </div>

      {isLoading ? (
        <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
          Loading group standings...
        </p>
      ) : null}

      {!isLoading && error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          Could not load group standings right now: {error}
        </p>
      ) : null}

      {!isLoading && !error && groups.length === 0 ? (
        <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
          No group standings are ready yet.
        </p>
      ) : null}

      {!isLoading && !error && allGroupsAreScoreless ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600">
          Groups are set up, but no scores have landed yet.
        </p>
      ) : null}

      {!isLoading && !error
        ? groups.map((group) => {
            const isScoreless = group.totalPoints <= 0;
            const barWidth = topAverage > 0
              ? Math.min(100, Math.max(group.avgPoints > 0 ? 12 : 10, Math.round((group.avgPoints / topAverage) * 100)))
              : 10;

            return (
              <div key={group.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <div className="flex min-h-12 min-w-12 flex-col items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-center text-gray-700">
                    <span className="text-sm font-black leading-none">{group.rank}</span>
                    <span className="mt-1 text-[9px] font-black uppercase tracking-wide leading-none">Rank</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-gray-950">{group.name}</p>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-600">{group.managerName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black text-accent-dark">{formatAveragePoints(group.avgPoints)}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Avg points</p>
                      </div>
                    </div>

                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${isScoreless ? "bg-gray-300" : "bg-accent"}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
                      <span>{group.playerCount} players</span>
                      <span>•</span>
                      <span>{group.totalPoints} total pts</span>
                      <span>•</span>
                      <span>Top player: {group.topPlayerName} ({group.topPlayerPoints} pts)</span>
                      {group.perfectPickCount !== null ? (
                        <>
                          <span>•</span>
                          <span>{group.perfectPickCount} perfect picks</span>
                        </>
                      ) : null}
                      {group.recentActivityCount !== null ? (
                        <>
                          <span>•</span>
                          <span>{group.recentActivityCount} recent moments</span>
                        </>
                      ) : null}
                      {isScoreless ? (
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-black text-gray-600">
                          No scores yet
                        </span>
                      ) : null}
                      {group.tag ? (
                        <span className="rounded-md bg-accent-light px-2 py-1 text-[11px] font-black text-accent-dark">
                          {group.tag}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        : null}
    </section>
  );
}

function LeaderSummaryCard({
  leaders,
  sharedScore,
  isOpen,
  showAllLeaders,
  onToggleOpen,
  onShowAllLeaders,
  onShowFewerLeaders
}: {
  leaders: LeaderboardListItem[];
  sharedScore: number | null;
  isOpen: boolean;
  showAllLeaders: boolean;
  onToggleOpen: () => void;
  onShowAllLeaders: () => void;
  onShowFewerLeaders: () => void;
}) {
  const previewLeaders = showAllLeaders ? leaders : leaders.slice(0, 4);
  const hiddenLeaderCount = Math.max(0, leaders.length - previewLeaders.length);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-accent-dark">WHO&apos;S #1</h3>
        </div>
        <div className="flex shrink-0 items-center">
          <InlineDisclosureButton
            isOpen={isOpen}
            onClick={onToggleOpen}
          />
        </div>
      </div>

      {isOpen ? (
        <>
          <div className="mt-1.5">
            <div className="inline-flex shrink-0 rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:py-2">
              Shared score: {sharedScore ?? "—"} pts
            </div>
          </div>
          <p className="mt-0.5 min-w-0 text-sm leading-6 text-gray-600">
            {leaders.length > 1
              ? `${leaders.length} players are sharing rank 1 right now.`
              : "One player is holding rank 1 right now."}
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {previewLeaders.map((leader) => (
              <Link
                key={leader.id}
                href={`/leaderboard/${leader.id}`}
                className="inline-flex max-w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 transition hover:border-accent hover:bg-accent-light"
              >
                <Avatar name={leader.name} avatarUrl={leader.avatarUrl} size="sm" />
                <span className="truncate">{leader.name}</span>
              </Link>
            ))}
            {hiddenLeaderCount > 0 ? (
              <button
                type="button"
                onClick={onShowAllLeaders}
                className="inline-flex items-center rounded-md bg-accent-light px-3 py-2 text-sm font-bold text-accent-dark transition hover:bg-accent/20"
              >
                +{hiddenLeaderCount} more
              </button>
            ) : null}
            {showAllLeaders && leaders.length > 4 ? (
              <button
                type="button"
                onClick={onShowFewerLeaders}
                className="inline-flex items-center rounded-md bg-accent-light px-3 py-2 text-sm font-bold text-accent-dark transition hover:bg-accent/20"
              >
                Show less
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function LeaderboardChoiceRail({
  children,
  className,
  contentClassName,
  showControls = true,
  prevLabel = "Show previous options",
  nextLabel = "Show more options",
  activeItemKey,
  onActiveItemChange
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showControls?: boolean;
  prevLabel?: string;
  nextLabel?: string;
  activeItemKey?: string;
  onActiveItemChange?: (key: string) => void;
}) {
  return (
    <WindowChoiceRail
      className={className}
      contentClassName={contentClassName}
      showControls={showControls}
      prevLabel={prevLabel}
      nextLabel={nextLabel}
      activeItemKey={activeItemKey}
      onActiveItemChange={onActiveItemChange}
    >
      {children}
    </WindowChoiceRail>
  );
}

function formatAveragePoints(value: number) {
  return value % 1 === 0 ? `${value}` : value.toFixed(1);
}

function formatRankMovement(rankDelta: number | null) {
  if (!rankDelta) {
    return "—";
  }

  if (rankDelta > 0) {
    return `↑ ${rankDelta}`;
  }

  return `↓ ${Math.abs(rankDelta)}`;
}

function getMovementTone(rankDelta: number | null) {
  if (!rankDelta) {
    return "text-gray-500";
  }

  return rankDelta > 0 ? "text-accent-dark" : "text-gray-600";
}

function getActivityLabel(event: LeaderboardActivityItem) {
  if (event.eventType === "perfect_pick") {
    return "Perfect Pick";
  }

  if (event.eventType === "daily_winner") {
    return "Daily Winner";
  }

  if (event.eventType === "points_awarded" && event.pointsDelta === 8) {
    return "8 Pts";
  }

  if (event.eventType === "trophy_awarded") {
    return "Trophy";
  }

  if (event.eventType === "rank_moved_up") {
    return "Rank Up";
  }

  if (event.eventType === "rank_moved_down") {
    return "Rank Move";
  }

  return "Points";
}

function getActivityCardTone(event: LeaderboardActivityItem) {
  if (event.eventType === "perfect_pick") {
    return "border-rose-200 bg-rose-50";
  }

  if (event.eventType === "daily_winner") {
    return "border-amber-200 bg-amber-50";
  }

  if (event.eventType === "points_awarded" && event.pointsDelta === 8) {
    return "border-sky-200 bg-sky-50";
  }

  if (event.eventType === "trophy_awarded") {
    return "border-violet-200 bg-violet-50";
  }

  if (event.eventType === "rank_moved_up" || event.eventType === "rank_moved_down") {
    return "border-emerald-200 bg-emerald-50";
  }

  return "border-sky-200 bg-sky-50";
}

function getActivityBadgeTone(event: LeaderboardActivityItem) {
  if (event.eventType === "perfect_pick") {
    return "bg-rose-100 text-rose-700";
  }

  if (event.eventType === "daily_winner") {
    return "bg-amber-100 text-amber-700";
  }

  if (event.eventType === "points_awarded" && event.pointsDelta === 8) {
    return "bg-sky-100 text-sky-700";
  }

  if (event.eventType === "trophy_awarded") {
    return "bg-violet-100 text-violet-700";
  }

  if (event.eventType === "rank_moved_up" || event.eventType === "rank_moved_down") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-sky-100 text-sky-700";
}

function getActivityIcon(event: LeaderboardActivityItem) {
  if (event.eventType === "perfect_pick") {
    return "🎯";
  }

  if (event.eventType === "daily_winner") {
    return "🏆";
  }

  if (event.eventType === "trophy_awarded") {
    return "🏅";
  }

  if (event.eventType === "rank_moved_up") {
    return "↑";
  }

  if (event.eventType === "rank_moved_down") {
    return "↓";
  }

  return "+";
}

function getActivityIconTone(event: LeaderboardActivityItem) {
  if (event.eventType === "perfect_pick") {
    return "bg-rose-100 text-rose-700";
  }

  if (event.eventType === "daily_winner") {
    return "bg-amber-100 text-amber-700";
  }

  if (event.eventType === "trophy_awarded") {
    return "bg-violet-100 text-violet-700";
  }

  if (event.eventType === "rank_moved_up" || event.eventType === "rank_moved_down") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-sky-100 text-sky-700";
}

function getFeaturedActivityRank(event: LeaderboardActivityItem) {
  if (event.eventType === "daily_winner") {
    return 0;
  }

  if (event.eventType === "perfect_pick") {
    return 1;
  }

  if (event.eventType === "points_awarded" && event.pointsDelta === 8) {
    return 2;
  }

  return Number.POSITIVE_INFINITY;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function getPendingManagedTrophyId(
  activeActionKey: string | null,
  groupId: string,
  userId: string
) {
  const prefix = `award-managed-leaderboard-${groupId}:${userId}:`;
  if (!activeActionKey?.startsWith(prefix)) {
    return null;
  }

  return activeActionKey.slice(prefix.length) || null;
}
