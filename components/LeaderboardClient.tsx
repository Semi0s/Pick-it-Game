"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { InlineDisclosureButton, useSessionDisclosureState, useSessionJsonState } from "@/components/player-management/Shared";
import type { ReactNode } from "react";
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
const LEADERBOARD_LEADER_SUMMARY_STORAGE_KEY = "leaderboard-leader-summary-state";
const LEADERBOARD_SUBSELECTION_STORAGE_KEY = "leaderboard-subselection-state";
const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const TWO_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden"
};

export function LeaderboardClient() {
  const { user } = useCurrentUser();
  const searchParams = useSearchParams();
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
  const [isActivityExpanded, setIsActivityExpanded] = useSessionDisclosureState(
    LEADERBOARD_ACTIVITY_DISCLOSURE_STORAGE_KEY,
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
            <p className="mt-3 text-sm leading-6 text-gray-600">
              A quick snapshot of your current rank, total points, and recent movement across global and group
              leaderboards.
            </p>
          ) : null}
        </div>
      </section>

      {!isLoading && !error && dailyWinners.length > 0 ? (
        <section className="relative overflow-hidden rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100 p-4 shadow-sm">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 text-xl text-amber-300/80"
          >
            ✦
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-10 top-7 text-sm text-amber-300/70"
          >
            ✦
          </div>
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-wide text-amber-700">🏆 Daily Winner</p>
                <p className="mt-2 text-base font-black text-gray-950">
                  {dailyWinners.length === 1 ? "Today's standout pick-maker." : "Today's standout group of pick-makers."}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-600">
                  {dailyWinners.length === 1 ? "Highest points scored today." : "Tied for the highest points scored today."}
                </p>
              </div>
              {dailyWinners[0]?.eventId ? (
                <a
                  href={`#activity-${dailyWinners[0].eventId}`}
                  className="shrink-0 text-xs font-bold text-amber-800 underline-offset-2 hover:underline"
                >
                  See in Recent Activity
                </a>
              ) : null}
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

      <section className="px-1">
        {renderSwitcherControls()}
      </section>

      {!isLoading && !error && activityFeed.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Recent Activity</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {activityFeed.length} recent update{activityFeed.length === 1 ? "" : "s"}
              </p>
            </div>
            <InlineDisclosureButton
              isOpen={isActivityExpanded}
              onClick={() => setIsActivityExpanded((current) => !current)}
            />
          </div>
          {isActivityExpanded ? (
            <div className="mt-2.5 space-y-2">
              {activityFeed.map((event, index) => (
              <div
                key={event.id}
                id={event.eventId ? `activity-${event.eventId}` : undefined}
                className={`rounded-md border px-3 py-3 ${
                  index === 0
                    ? `${getActivityCardTone(event.eventType)} shadow-sm`
                    : `${getActivityCardTone(event.eventType)}`
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-black ${getActivityIconTone(
                      event.eventType
                    )}`}
                    aria-hidden="true"
                  >
                    {getActivityIcon(event.eventType)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {event.userName ? (
                      <div className="mb-1 flex items-start gap-2">
                        <Avatar name={event.userName} avatarUrl={event.userAvatarUrl ?? undefined} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p
                              style={TWO_LINE_CLAMP_STYLE}
                              className={`min-w-0 flex-1 text-sm font-semibold leading-5 ${index === 0 ? "text-gray-900" : "text-gray-800"}`}
                            >
                              {event.message}
                            </p>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-black ${getActivityBadgeTone(
                                  event.eventType
                                )}`}
                              >
                                {getActivityLabel(event.eventType)}
                              </span>
                              {index === 0 ? (
                                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Newest</p>
                              ) : null}
                            </div>
                          </div>
                          {event.userHomeTeamId ? (
                            <div className="mt-1">
                              <HomeTeamBadge teamId={event.userHomeTeamId} label="" className="bg-white/75 py-0.5" />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {!event.userName ? (
                      <div className="flex items-start justify-between gap-3">
                        <p
                          style={TWO_LINE_CLAMP_STYLE}
                          className={`min-w-0 flex-1 text-sm font-semibold leading-5 ${index === 0 ? "text-gray-900" : "text-gray-800"}`}
                        >
                          {event.message}
                        </p>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-black ${getActivityBadgeTone(
                              event.eventType
                            )}`}
                          >
                            {getActivityLabel(event.eventType)}
                          </span>
                          {index === 0 ? (
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Newest</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {(event.canReact || event.canComment) && user ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          {event.canComment ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedComments((current) => ({
                                  ...current,
                                  [event.eventId!]: !current[event.eventId!]
                                }))
                              }
                              className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white/80 px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
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
                        {event.canReact ? (
                          <div className="flex shrink-0 flex-wrap justify-end gap-2">
                            {["🔥", "🎯", "👀", "👍"].map((emoji) => {
                              const reaction = event.reactions.find((item) => item.emoji === emoji);
                              const reactionKey = `${event.eventId}:${emoji}`;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    void handleReactionToggle(
                                      event.eventId,
                                      emoji,
                                      reaction?.reacted ?? false
                                    );
                                  }}
                                  disabled={!event.eventId || activeReactionKey === reactionKey}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold transition ${
                                    reaction?.reacted
                                      ? "border-accent bg-accent-light text-accent-dark"
                                      : "border-gray-200 bg-white text-gray-600 hover:border-accent-light hover:bg-gray-50"
                                  } disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                  <span>{emoji}</span>
                                  {reaction?.count ? <span>{reaction.count}</span> : null}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {event.canComment && event.eventId && expandedComments[event.eventId] ? (
                      <div className="mt-2 space-y-2 rounded-md border border-gray-200 bg-white/60 p-3">
                        {event.comments.length > 0 ? (
                          <div className="space-y-1.5">
                            {event.comments.map((comment) => (
                              <div key={comment.id} className="rounded-md bg-white/70 px-3 py-2">
                                <div className="flex items-start gap-2.5">
                                  <Avatar
                                    name={comment.userName}
                                    avatarUrl={comment.userAvatarUrl ?? undefined}
                                    size="sm"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                                      <span>{comment.userName}</span>
                                      {comment.isOwn ? <span>You</span> : null}
                                      {comment.userHomeTeamId ? (
                                        <HomeTeamBadge teamId={comment.userHomeTeamId} label="" className="bg-white py-0.5" />
                                      ) : null}
                                    </div>
                                    <p className="mt-0.5 text-sm font-semibold leading-5 text-gray-800">{comment.body}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs font-semibold text-gray-500">No comments yet.</p>
                        )}
                        <div className="space-y-1.5">
                          <textarea
                            value={commentDrafts[event.eventId] ?? ""}
                            maxLength={280}
                            rows={2}
                            onChange={(inputEvent) =>
                              setCommentDrafts((current) => ({
                                ...current,
                                [event.eventId!]: inputEvent.target.value
                              }))
                            }
                            placeholder="Add a quick comment"
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                          />
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold text-gray-500">
                              {(commentDrafts[event.eventId] ?? "").length}/280
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCommentSubmit(event.eventId)}
                              disabled={
                                activeCommentEventId === event.eventId ||
                                !(commentDrafts[event.eventId] ?? "").trim()
                              }
                              className="rounded-md bg-accent px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                            >
                              {activeCommentEventId === event.eventId ? "Posting..." : "Post"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              ))}
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
      <div className={className ?? ""}>
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
              className={`shrink-0 rounded-md px-3 py-2 text-sm font-bold ${
                activeView === tab.value ? "bg-accent text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </LeaderboardChoiceRail>

        {(shouldShowGroupSelector(activeView) || shouldShowManagerSelector(activeView)) && switcher ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {shouldShowGroupSelector(activeView) ? (
              <div className="overflow-hidden rounded-md sm:col-span-2">
                <LeaderboardChoiceRail
                  showControls={shouldShowGroupCarouselControls}
                  prevLabel="Show previous groups"
                  nextLabel="Show more groups"
                  contentClassName="flex gap-2 pb-1"
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
                        className={`w-[min(12.25rem,calc(100vw-7.25rem))] max-w-full shrink-0 rounded-lg border px-2.5 py-2 text-left transition sm:w-[196px] ${
                          selectedGroupId === group.id
                            ? "border-accent bg-accent-light"
                            : "border-gray-200 bg-gray-50 hover:border-accent-light hover:bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black leading-5 text-gray-950">{group.label}</p>
                          </div>
                          {group.rankDelta ? (
                            <span className={`text-[11px] font-black ${getMovementTone(group.rankDelta)}`}>
                              {formatRankMovement(group.rankDelta)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-gray-600">
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
                    <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-600">
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
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Manager</span>
                <select
                  value={selectedManagerId}
                  onChange={(event) => handleSelectManager(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
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
    return "My Groups";
  }
  if (activeView === "managed_groups") {
    return "My Managed Groups";
  }
  if (activeView === "groups") {
    return "My Group Scores";
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
    return "Group performance is ranked by average points per player.";
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
            <h3 className="text-base font-black text-gray-950">My Group Scores</h3>
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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const beltRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const EDGE_CONTROL_WIDTH = 24;
  const BELT_GUTTER_WIDTH = 40;
  const baseScrollerClassName =
    "flex min-w-max gap-2 px-1 pb-1";

  useEffect(() => {
    const viewport = viewportRef.current;
    const belt = beltRef.current;
    if (!viewport || !belt || !activeItemKey) {
      return;
    }

    const updateLayout = () => {
      const items = Array.from(belt.querySelectorAll<HTMLElement>("[data-choice-key]"));
      const activeIndex = items.findIndex((item) => item.dataset.choiceKey === activeItemKey);
      const activeItem = activeIndex >= 0 ? items[activeIndex] : null;
      if (!activeItem) {
        setOffsetX(0);
        setHasOverflow(false);
        setCanScrollPrev(false);
        setCanScrollNext(false);
        return;
      }

      const viewportWidth = viewport.clientWidth;
      const beltWidth = belt.scrollWidth;
      const minOffset = Math.min(0, viewportWidth - beltWidth);
      const desiredOffset = viewportWidth / 2 - (activeItem.offsetLeft + activeItem.offsetWidth / 2);
      const clampedOffset = Math.max(minOffset, Math.min(0, desiredOffset));
      setOffsetX(clampedOffset);
      setHasOverflow(beltWidth > viewportWidth + 1);
      setCanScrollPrev(activeIndex > 0);
      setCanScrollNext(activeIndex < items.length - 1);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateLayout);
      resizeObserver.observe(viewport);
      resizeObserver.observe(belt);
    }

    return () => {
      window.removeEventListener("resize", updateLayout);
      resizeObserver?.disconnect();
    };
  }, [activeItemKey, children]);

  function nudge(direction: "prev" | "next") {
    const belt = beltRef.current;
    if (!belt || !onActiveItemChange) {
      return;
    }

    const items = Array.from(belt.querySelectorAll<HTMLElement>("[data-choice-key]"));
    const activeIndex = activeItemKey ? items.findIndex((item) => item.dataset.choiceKey === activeItemKey) : -1;
    const targetIndex =
      direction === "next"
        ? Math.min(activeIndex >= 0 ? activeIndex + 1 : 0, items.length - 1)
        : Math.max(activeIndex >= 0 ? activeIndex - 1 : 0, 0);
    const targetKey = items[targetIndex]?.dataset.choiceKey;
    if (targetKey) {
      onActiveItemChange(targetKey);
    }
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !onActiveItemChange) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 32 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    nudge(deltaX < 0 ? "next" : "prev");
  }

  return (
    <div className={className ?? ""}>
      <div className="relative min-w-0">
        {showControls ? (
          <button
            type="button"
            onClick={() => nudge("prev")}
            disabled={!canScrollPrev}
            className="absolute inset-y-0 left-0 z-10 inline-flex w-6 items-center justify-center bg-white text-gray-700 transition active:scale-95 hover:bg-accent-light hover:text-accent-dark disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-white"
            style={{ width: EDGE_CONTROL_WIDTH }}
            aria-label={prevLabel}
          >
            <span aria-hidden>‹</span>
          </button>
        ) : null}
        <div ref={viewportRef} className="min-w-0 overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {showControls ? (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-6 top-0 z-[11] w-px bg-gray-200"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 right-6 top-0 z-[11] w-px bg-gray-200"
              />
            </>
          ) : null}
          <div
            ref={beltRef}
            className={contentClassName ? `${baseScrollerClassName} ${contentClassName}` : baseScrollerClassName}
            style={{
              transform: `translateX(${offsetX}px)`,
              transition: hasOverflow ? "transform 280ms ease" : undefined,
              willChange: "transform"
            }}
          >
            {showControls ? <div aria-hidden="true" className="shrink-0" style={{ width: BELT_GUTTER_WIDTH }} /> : null}
            {children}
            {showControls ? <div aria-hidden="true" className="shrink-0" style={{ width: BELT_GUTTER_WIDTH }} /> : null}
          </div>
        </div>
        {showControls ? (
          <button
            type="button"
            onClick={() => nudge("next")}
            disabled={!canScrollNext}
            className="absolute inset-y-0 right-0 z-10 inline-flex w-6 items-center justify-center bg-white text-gray-700 transition active:scale-95 hover:bg-accent-light hover:text-accent-dark disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-white"
            style={{ width: EDGE_CONTROL_WIDTH }}
            aria-label={nextLabel}
          >
            <span aria-hidden>›</span>
          </button>
        ) : null}
      </div>
    </div>
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

function getActivityLabel(eventType: LeaderboardActivityItem["eventType"]) {
  if (eventType === "perfect_pick") {
    return "Perfect Pick";
  }

  if (eventType === "daily_winner") {
    return "Daily Winner";
  }

  if (eventType === "trophy_awarded") {
    return "Trophy";
  }

  if (eventType === "rank_moved_up") {
    return "Rank Up";
  }

  if (eventType === "rank_moved_down") {
    return "Rank Move";
  }

  return "Points";
}

function getActivityCardTone(eventType: LeaderboardActivityItem["eventType"]) {
  if (eventType === "perfect_pick") {
    return "border-rose-200 bg-rose-50";
  }

  if (eventType === "daily_winner") {
    return "border-amber-200 bg-amber-50";
  }

  if (eventType === "trophy_awarded") {
    return "border-violet-200 bg-violet-50";
  }

  if (eventType === "rank_moved_up" || eventType === "rank_moved_down") {
    return "border-emerald-200 bg-emerald-50";
  }

  return "border-sky-200 bg-sky-50";
}

function getActivityBadgeTone(eventType: LeaderboardActivityItem["eventType"]) {
  if (eventType === "perfect_pick") {
    return "bg-rose-100 text-rose-700";
  }

  if (eventType === "daily_winner") {
    return "bg-amber-100 text-amber-700";
  }

  if (eventType === "trophy_awarded") {
    return "bg-violet-100 text-violet-700";
  }

  if (eventType === "rank_moved_up" || eventType === "rank_moved_down") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-sky-100 text-sky-700";
}

function getActivityIcon(eventType: LeaderboardActivityItem["eventType"]) {
  if (eventType === "perfect_pick") {
    return "🎯";
  }

  if (eventType === "daily_winner") {
    return "🏆";
  }

  if (eventType === "trophy_awarded") {
    return "🏅";
  }

  if (eventType === "rank_moved_up") {
    return "↑";
  }

  if (eventType === "rank_moved_down") {
    return "↓";
  }

  return "+";
}

function getActivityIconTone(eventType: LeaderboardActivityItem["eventType"]) {
  if (eventType === "perfect_pick") {
    return "bg-rose-100 text-rose-700";
  }

  if (eventType === "daily_winner") {
    return "bg-amber-100 text-amber-700";
  }

  if (eventType === "trophy_awarded") {
    return "bg-violet-100 text-violet-700";
  }

  if (eventType === "rank_moved_up" || eventType === "rank_moved_down") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-sky-100 text-sky-700";
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
