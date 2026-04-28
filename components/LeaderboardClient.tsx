"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";
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

const LEADERBOARD_SWITCHER_STORAGE_KEY = "leaderboard-switcher-state";
const LEADERBOARD_ACTIVITY_DISCLOSURE_STORAGE_KEY = "leaderboard-activity-disclosure";
const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const TWO_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden"
};

export function LeaderboardClient() {
  const { user } = useCurrentUser();
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
  const [isActivityExpanded, setIsActivityExpanded] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [managedAwardGroup, setManagedAwardGroup] = useState<ManagedGroupDetails | null>(null);
  const [managedTrophySheetTarget, setManagedTrophySheetTarget] = useState<{ groupId: string; userId: string } | null>(null);
  const [activeManagedTrophyKey, setActiveManagedTrophyKey] = useState<string | null>(null);
  const [celebrationTrophy, setCelebrationTrophy] = useState<{
    name: string;
    icon: string;
    tier?: "bronze" | "silver" | "gold" | "special" | null;
  } | null>(null);

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
    if (!shouldShowGroupSelector(activeView) || !selectedGroupId) {
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
      const storedValue = window.sessionStorage.getItem(LEADERBOARD_SWITCHER_STORAGE_KEY);
      if (storedValue) {
        const parsed = JSON.parse(storedValue) as typeof DEFAULT_SWITCHER_STATE;
        if (parsed.activeView === "global") {
          setActiveView(parsed.activeView);
        }
        if (parsed.selectedGroupId) {
          setSelectedGroupId(parsed.selectedGroupId);
        }
        if (parsed.selectedManagerId) {
          setSelectedManagerId(parsed.selectedManagerId);
        }
      }
    } catch (caughtError) {
      console.warn("Could not restore leaderboard switcher state.", caughtError);
    }
  }, []);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(LEADERBOARD_ACTIVITY_DISCLOSURE_STORAGE_KEY);
      if (!storedValue) {
        return;
      }

      setIsActivityExpanded(storedValue === "open");
    } catch (caughtError) {
      console.warn("Could not restore leaderboard activity disclosure state.", caughtError);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        LEADERBOARD_ACTIVITY_DISCLOSURE_STORAGE_KEY,
        isActivityExpanded ? "open" : "closed"
      );
    } catch (caughtError) {
      console.warn("Could not save leaderboard activity disclosure state.", caughtError);
    }
  }, [isActivityExpanded]);

  useEffect(() => {
    let isMounted = true;

    function loadLeaderboard(showLoading = false) {
      if (showLoading) {
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
          setIsLoading(false);
        })
        .catch((caughtError: Error) => {
          if (isMounted) {
            setUsers([]);
            setGroupStandings([]);
            setSwitcher(null);
            setDailyWinners([]);
            setActivityFeed([]);
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

    loadLeaderboard(true);
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
    void loadManagedAwardGroup();
  }, [loadManagedAwardGroup, refreshNonce]);

  useEffect(() => {
    if (!switcher) {
      return;
    }

    const allowedViews = new Set(switcher.tabs.map((tab) => tab.value));
    if (!allowedViews.has(activeView)) {
      setActiveView(switcher.tabs[0]?.value ?? "global");
    }
  }, [activeView, switcher]);

  useEffect(() => {
    if (!switcher || !shouldShowGroupSelector(activeView)) {
      return;
    }

    if (!selectedGroupId && switcher.groups.length > 0) {
      setSelectedGroupId(switcher.groups[0]!.id);
    }
  }, [activeView, selectedGroupId, switcher]);

  useEffect(() => {
    const nextState = {
      activeView: activeView === "global" ? activeView : DEFAULT_SWITCHER_STATE.activeView,
      selectedGroupId,
      selectedManagerId
    };

    try {
      window.sessionStorage.setItem(LEADERBOARD_SWITCHER_STORAGE_KEY, JSON.stringify(nextState));
    } catch (caughtError) {
      console.warn("Could not persist leaderboard switcher state.", caughtError);
    }
  }, [activeView, selectedGroupId, selectedManagerId]);

  const selectedGroupLabel = useMemo(
    () => switcher?.groups.find((group) => group.id === selectedGroupId)?.label ?? null,
    [selectedGroupId, switcher?.groups]
  );
  const selectedManagerLabel = useMemo(
    () => switcher?.managers.find((manager) => manager.id === selectedManagerId)?.label ?? null,
    [selectedManagerId, switcher?.managers]
  );

  const isGlobalView = activeView === "global";
  const isGroupView = shouldShowGroupSelector(activeView) && Boolean(selectedGroupId);
  const isGroupStandingsView = activeView === "groups";
  const shouldRenderLeaderboardRows = isGlobalView || isGroupView;
  const shouldShowPlayerSocialIndicators = !isGlobalView;
  const canAwardManagedTrophies = isGroupView && Boolean(managedAwardGroup);
  const canSelfAwardTrophies = user?.role === "admin";
  const activeManagedTrophyMember = managedAwardGroup && managedTrophySheetTarget
    ? managedAwardGroup.members.find((member) => member.userId === managedTrophySheetTarget.userId) ?? null
    : null;

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Leaderboard</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Your standing</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
          A quick snapshot of your current rank, total points, and recent movement across global and group
          leaderboards.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Link
            href="/groups?focus=next"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Next Pick
          </Link>
          <Link
            href="/trophies"
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            <Trophy aria-hidden className="h-4 w-4 text-accent-dark" />
            Trophies
          </Link>
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

      <section className="sticky top-[73px] z-10 rounded-lg border border-gray-200 bg-white/95 p-4 backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {(switcher?.tabs ?? [{ value: "global", label: "Global" }]).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveView(tab.value)}
              className={`rounded-md px-3 py-2 text-sm font-bold ${
                activeView === tab.value ? "bg-accent text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(shouldShowGroupSelector(activeView) || shouldShowManagerSelector(activeView)) && switcher ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {shouldShowGroupSelector(activeView) ? (
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Group</span>
                <select
                  value={selectedGroupId}
                  onChange={(event) => setSelectedGroupId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  <option value="">Choose a group</option>
                  {switcher.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {shouldShowManagerSelector(activeView) ? (
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Manager</span>
                <select
                  value={selectedManagerId}
                  onChange={(event) => setSelectedManagerId(event.target.value)}
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

        {switcher ? (
          <p className="mt-3 text-xs font-semibold text-gray-500">
            {getSwitcherSummary(activeView, switcher, selectedGroupLabel, selectedManagerLabel)}
          </p>
        ) : null}
      </section>

      {!isLoading && !error && activityFeed.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Recent Activity</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {activityFeed.length} recent update{activityFeed.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsActivityExpanded((current) => !current)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
              aria-expanded={isActivityExpanded}
              aria-label={isActivityExpanded ? "Hide recent activity" : "Show recent activity"}
            >
              {isActivityExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              {isActivityExpanded ? "Hide" : "Open"}
            </button>
          </div>
          {isActivityExpanded ? (
            <div className="mt-3 space-y-2">
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
            <div
              key={profile.id}
              className={`rounded-lg border p-4 ${
                index === 0
                  ? "border-amber-200 bg-amber-50"
                  : profile.id === user?.id
                    ? "border-accent bg-accent-light"
                    : "border-gray-200 bg-white"
              }`}
            >
              <Link
                href={`/leaderboard/${profile.id}`}
                className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 ${
                  canAwardManagedTrophies ? "pr-12" : ""
                }`}
              >
                <span
                  className={`flex min-h-12 min-w-12 flex-col items-center justify-center rounded-md px-2 py-1 text-center ${
                    index === 0
                      ? "bg-white text-amber-800"
                      : profile.id === user?.id
                        ? "bg-white text-accent-dark"
                        : "bg-gray-100 text-gray-700"
                  }`}
                >
                  <span className="text-sm font-black leading-none">{profile.rank ?? index + 1}</span>
                  <span className="mt-1 text-[9px] font-black uppercase tracking-wide leading-none">Place</span>
                </span>
                <span className="min-w-0 flex items-start gap-3">
                  <Avatar
                    name={profile.name}
                    avatarUrl={profile.avatarUrl}
                    size={index === 0 ? "lg" : "md"}
                    className={index === 0 ? "border-amber-200 bg-amber-100" : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        {index === 0 ? (
                          <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-amber-700">
                            Leading the board
                          </span>
                        ) : null}
                        <span
                          className={`min-w-0 truncate font-black text-gray-950 ${
                            index === 0 ? "text-lg" : "text-base"
                          }`}
                        >
                          {profile.name}
                          {profile.id === user?.id ? " (You)" : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`rounded-md px-2 py-1 text-sm font-black ${
                            index === 0
                              ? "bg-white text-amber-800"
                              : profile.id === user?.id
                                ? "bg-white text-accent-dark"
                                : "bg-accent-light text-accent-dark"
                          }`}
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
                    </span>
                    {shouldShowPlayerSocialIndicators ? (
                      <span
                        className={`mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold ${
                          index === 0 ? "text-amber-800" : profile.id === user?.id ? "text-gray-600" : "text-gray-500"
                        }`}
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
                                className={index === 0 ? "border-amber-200" : profile.id === user?.id ? "border-accent/40" : ""}
                              />
                            ))}
                          </span>
                        ) : null}
                        {profile.homeTeamId ? (
                          <HomeTeamBadge
                            teamId={profile.homeTeamId}
                            className={index === 0 ? "border-amber-200 bg-white/90" : "bg-white/70"}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
              <div className="mt-3 flex items-center justify-end gap-2">
                {canAwardManagedTrophies && (profile.id !== user?.id || canSelfAwardTrophies) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!managedAwardGroup) {
                        return;
                      }
                      setManagedTrophySheetTarget({ groupId: managedAwardGroup.id, userId: profile.id });
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-base transition hover:border-accent hover:bg-accent-light"
                    aria-label={`Award trophy to ${profile.name}`}
                  >
                    🏆
                  </button>
                ) : null}
              </div>
            </div>
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
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Leaderboard View</p>
      <h3 className="mt-2 text-2xl font-black text-gray-950">{getPlaceholderTitle(activeView)}</h3>
      <p className="mt-2 text-sm font-semibold text-gray-600">
        {getPlaceholderCopy(activeView, selectedGroupLabel, selectedManagerLabel)}
      </p>
      <p className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700">
        Progress indicators are currently available on the Global leaderboard. Group progress is coming next.
      </p>
      <p className="mt-4 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700">
        Group leaderboard coming next.
      </p>
    </section>
  );
}

function shouldShowGroupSelector(activeView: LeaderboardSwitcherView) {
  return activeView === "my_groups" || activeView === "managed_groups";
}

function shouldShowManagerSelector(activeView: LeaderboardSwitcherView) {
  return activeView === "managers";
}

function getSwitcherSummary(
  activeView: LeaderboardSwitcherView,
  switcher: LeaderboardSwitcherContext,
  selectedGroupLabel: string | null,
  selectedManagerLabel: string | null
) {
  if (activeView === "global") {
    return "Global rankings stay live by default.";
  }

  if (activeView === "managers") {
    return selectedManagerLabel
      ? `Manager focus: ${selectedManagerLabel}`
      : "Choose a manager to preview the next leaderboard view.";
  }

  if (shouldShowGroupSelector(activeView)) {
    return selectedGroupLabel
      ? `Group focus: ${selectedGroupLabel}`
      : `Choose from ${switcher.groups.length} available ${switcher.groups.length === 1 ? "group" : "groups"}.`;
  }

  if (activeView === "groups") {
    return switcher.accessLevel === "manager"
      ? "Compare the groups you manage by average points per player."
      : "Compare every group by average points per player.";
  }

  return "Leaderboard context switcher ready.";
}

function getPlaceholderTitle(activeView: LeaderboardSwitcherView) {
  if (activeView === "my_groups") {
    return "My Groups";
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
  return "Global";
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
              <div key={group.id} className="rounded-lg border border-gray-200 bg-white p-4">
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

                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${isScoreless ? "bg-gray-300" : "bg-accent"}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
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
