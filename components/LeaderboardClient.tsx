"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Trophy, X } from "lucide-react";
import {
  awardManagedGroupTrophyAction,
  listManagedGroupPlayersAction,
  type ManagedGroupDetails
} from "@/app/my-groups/actions";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { TrophyBadge } from "@/components/TrophyBadge";
import type { LeaderboardActivityItem } from "@/lib/leaderboard-activity";
import type {
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

export function LeaderboardClient() {
  const { user } = useCurrentUser();
  const [users, setUsers] = useState<LeaderboardListItem[]>([]);
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
          setSwitcher(result.switcher);
          setDailyWinners(result.dailyWinners);
          setActivityFeed(result.activityFeed);
          setError(null);
          setIsLoading(false);
        })
        .catch((caughtError: Error) => {
          if (isMounted) {
            setUsers([]);
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
  const shouldRenderLeaderboardRows = isGlobalView || isGroupView;
  const canAwardManagedTrophies = activeView === "managed_groups" && Boolean(managedAwardGroup);
  const activeManagedTrophyMember = managedAwardGroup && managedTrophySheetTarget
    ? managedAwardGroup.members.find((member) => member.userId === managedTrophySheetTarget.userId) ?? null
    : null;
  const availableManagedTrophies =
    managedAwardGroup && activeManagedTrophyMember
      ? managedAwardGroup.trophies.filter(
          (trophy) =>
            trophy.awardSource === "manager" &&
            !activeManagedTrophyMember.trophies.some((awarded) => awarded.id === trophy.id)
        )
      : [];

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
                      <div className="mb-0.5 flex items-start gap-2">
                        <Avatar name={event.userName} avatarUrl={event.userAvatarUrl ?? undefined} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className={`min-w-0 flex-1 text-sm font-semibold ${index === 0 ? "text-gray-900" : "text-gray-800"}`}>
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
                        <p className={`min-w-0 flex-1 text-sm font-semibold ${index === 0 ? "text-gray-900" : "text-gray-800"}`}>
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
                      <div className="mt-1 flex items-center justify-between gap-3">
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
                              className="text-xs font-bold text-gray-600 underline-offset-2 hover:text-accent-dark hover:underline"
                            >
                              💬 {event.comments.length > 0 ? `${event.comments.length} comments` : "Comment"}
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
                      <div className="mt-1 space-y-1.5">
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
                                    <p className="mt-0 text-sm font-semibold leading-5 text-gray-800">{comment.body}</p>
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
                profile.id === user?.id ? "border-emerald-800 bg-emerald-900" : "border-gray-200 bg-white"
              }`}
            >
              <Link
                href={`/leaderboard/${profile.id}`}
                className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 ${
                  canAwardManagedTrophies ? "pr-12" : ""
                }`}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-black ${
                    profile.id === user?.id ? "bg-emerald-800 text-white" : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {profile.rank ?? index + 1}
                </span>
                <span className="min-w-0 flex items-center gap-3">
                  <Avatar name={profile.name} avatarUrl={profile.avatarUrl} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex flex-wrap items-center gap-2">
                        <span
                          className={`min-w-0 truncate text-base font-black ${
                            profile.id === user?.id ? "text-white" : "text-gray-950"
                          }`}
                        >
                          {profile.name}
                          {profile.id === user?.id ? " (You)" : ""}
                        </span>
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
                                className={profile.id === user?.id ? "border-emerald-700" : ""}
                              />
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-2 py-1 text-sm font-black ${
                          profile.id === user?.id ? "bg-emerald-800 text-white" : "bg-accent-light text-accent-dark"
                        }`}
                      >
                        {profile.totalPoints} points
                      </span>
                    </span>
                    {profile.homeTeamId ? (
                      <span className="mt-2 block">
                        <HomeTeamBadge teamId={profile.homeTeamId} className="bg-white/70" />
                      </span>
                    ) : null}
                    <span
                      className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold ${
                        profile.id === user?.id ? "text-emerald-100" : "text-gray-500"
                      }`}
                    >
                      <span>{isGlobalView ? "View public picks" : "Group standing"}</span>
                      <span className={profile.id === user?.id ? "text-emerald-700" : "text-gray-300"}>•</span>
                      <span className={getMovementTone(profile.rankDelta)}>{formatRankMovement(profile.rankDelta)}</span>
                      {profile.pointsDelta && profile.pointsDelta > 0 ? (
                        <>
                          <span className={profile.id === user?.id ? "text-emerald-700" : "text-gray-300"}>•</span>
                          <span className={profile.id === user?.id ? "text-emerald-100" : "text-accent-dark"}>
                            +{profile.pointsDelta} pts
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                </span>
              </Link>
              <div className="mt-3 flex items-center justify-end gap-2">
                {canAwardManagedTrophies ? (
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
      ) : (
        <LeaderboardPlaceholder
          activeView={activeView}
          selectedGroupLabel={selectedGroupLabel}
          selectedManagerLabel={selectedManagerLabel}
        />
      )}

      {managedAwardGroup && activeManagedTrophyMember ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/35">
          <button
            type="button"
            aria-label="Close trophy sheet"
            onClick={() => setManagedTrophySheetTarget(null)}
            className="absolute inset-0"
          />
          <div className="relative w-full rounded-t-2xl bg-white p-4 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-gray-200" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Award Trophy</p>
                <div className="mt-2 flex items-start gap-3">
                  <Avatar
                    name={activeManagedTrophyMember.name}
                    avatarUrl={activeManagedTrophyMember.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-gray-950">{activeManagedTrophyMember.name}</p>
                    <p className="truncate text-sm font-semibold text-gray-600">{managedAwardGroup.name}</p>
                    {activeManagedTrophyMember.homeTeamId ? (
                      <div className="mt-2">
                        <HomeTeamBadge teamId={activeManagedTrophyMember.homeTeamId} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManagedTrophySheetTarget(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
                aria-label="Close trophy sheet"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Select Trophy</h4>
                <Trophy className="h-4 w-4 text-accent-dark" aria-hidden />
              </div>
              {availableManagedTrophies.length > 0 ? (
                <div className="grid gap-2">
                  {availableManagedTrophies.map((trophy) => {
                    const actionKey = `award-managed-leaderboard-${managedAwardGroup.id}:${activeManagedTrophyMember.userId}:${trophy.id}`;
                    return (
                      <button
                        key={trophy.id}
                        type="button"
                        onClick={() => void handleManagedLeaderboardTrophyAward(managedAwardGroup.id, activeManagedTrophyMember.userId, trophy.id)}
                        disabled={activeManagedTrophyKey === actionKey}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-gray-950">
                            {trophy.icon} {trophy.name}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-gray-500">
                            {trophy.description || "Preset manager trophy"}
                          </p>
                        </div>
                        <TrophyBadge icon={trophy.icon} tier={trophy.tier} size="sm" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">
                  This player already has all preset manager trophies.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

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
  return activeView === "my_groups" || activeView === "managed_groups" || activeView === "groups";
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
    return "Groups";
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

  return "Global leaderboard is ready now.";
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
