"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Flag, X } from "lucide-react";
import { InlineDisclosureButton, WindowChoiceRail, useSessionDisclosureState, useSessionJsonState } from "@/components/player-management/Shared";
import {
  awardManagedGroupTrophyAction,
  listManagedGroupPlayersAction,
  type ManagedGroupDetails
} from "@/app/my-groups/actions";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { LeaderboardPlayerLocalizationBackground } from "@/components/localized-card/LeaderboardPlayerLocalizationBackground";
import { LocalizedCardBackground } from "@/components/localized-card/LocalizedCardBackground";
import { ManagedTrophyAwardSheet } from "@/components/ManagedTrophyAwardSheet";
import { ReportBlockDialog, type ReportTargetOption } from "@/components/ReportBlockDialog";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { useAppLanguage } from "@/lib/app-language";
import { parseJsonResponse } from "@/lib/fetch-json";
import type { LeaderboardActivityItem } from "@/lib/leaderboard-activity";
import type {
  GroupStandingItem,
  LeaderboardPhase,
  LeaderboardGroupNavItem,
  LeaderboardListItem,
  LeaderboardPageData,
  TeamStandingItem,
  LeaderboardSwitcherContext,
  LeaderboardSwitcherView
} from "@/lib/leaderboard-data";
import type { DailyWinner } from "@/lib/leaderboard-highlights";
import { getLocalizedCardCssVars, getLocalizedCardThemeForUserSurface } from "@/lib/localized-card-themes";
import { getTeam } from "@/lib/mock-data";
import { t } from "@/lib/strings";
import { hasDirectorAccess } from "@/lib/tier-access";
import { ADMIN_UI_RESET_SIGNAL_STORAGE_KEY, LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY } from "@/lib/ui-storage-keys";
import { useCurrentUser } from "@/lib/use-current-user";
import { buildSessionViewStateStorageKey } from "@/lib/session-view-state";

const DEFAULT_SWITCHER_STATE = {
  activeView: "my_groups" as LeaderboardSwitcherView,
  selectedGroupId: "",
  selectedManagerId: ""
};

const DEFAULT_LEADERBOARD_PHASE: LeaderboardPhase = "group_phase";
const LEADERBOARD_PHASE_RAIL_ITEMS: Array<{ value: LeaderboardPhase; disabled?: boolean }> = [
  { value: "group_phase" },
  { value: "knockout_phase", disabled: true },
  { value: "global_top10" }
];

type LeaderboardSubselectionState = {
  groupByPhaseAndView?: Partial<Record<LeaderboardPhase, Partial<Record<LeaderboardSwitcherView, string>>>>;
  managerByPhaseAndView?: Partial<Record<LeaderboardPhase, Partial<Record<LeaderboardSwitcherView, string>>>>;
  groupByView?: Partial<Record<LeaderboardSwitcherView, string>>;
  managerByView?: Partial<Record<LeaderboardSwitcherView, string>>;
};

type LeaderboardStoredSwitcherState = {
  activePhase?: LeaderboardPhase;
  phaseViewByPhase?: Partial<Record<LeaderboardPhase, LeaderboardSwitcherView>>;
  activeView?: LeaderboardSwitcherView;
  selectedGroupId?: string;
  selectedManagerId?: string;
};

type PhaseNavItem = {
  key: string;
  label: string;
  view: LeaderboardSwitcherView;
  groupId?: string;
  phase?: LeaderboardPhase;
};

function getAvailableLeaderboardPhase(phase?: LeaderboardPhase | null): LeaderboardPhase {
  return phase === "knockout_phase" ? DEFAULT_LEADERBOARD_PHASE : phase ?? DEFAULT_LEADERBOARD_PHASE;
}

const DEFAULT_SUBSELECTION_STATE: LeaderboardSubselectionState = {
  groupByPhaseAndView: {},
  managerByPhaseAndView: {}
};

const LEADERBOARD_TIME_ZONE = "America/New_York";
const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const LEADERBOARD_STABLE_CONTENT_MIN_HEIGHT = "clamp(24rem, 54vh, 38rem)";
const LEADERBOARD_STABLE_ROW_TARGET = 8;
const LEADERBOARD_STABLE_ROW_DEPTH_PX = 96;
const LEADERBOARD_COCKPIT_BUTTON_CLASS =
  "ui-cockpit-button";
const LEADERBOARD_COCKPIT_TRIGGER_CLASS =
  "ui-cockpit-trigger";
const TWO_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical" as const,
  overflow: "hidden"
};

function LeaderboardPlayerRow({
  profile,
  index,
  currentUserId,
  scoreLabel,
  scoreValue,
  canAwardManagedTrophies,
  canSelfAwardTrophies,
  managedAwardGroup,
  onOpenTrophySheet
}: {
  profile: LeaderboardListItem;
  index: number;
  currentUserId?: string;
  scoreLabel: string;
  scoreValue: number | string;
  canAwardManagedTrophies: boolean;
  canSelfAwardTrophies: boolean;
  managedAwardGroup: ManagedGroupDetails | null;
  onOpenTrophySheet: (userId: string) => void;
}) {
  const isCurrentUser = profile.id === currentUserId;
  const isLightlyHighlighted = index < 3;
  const localizedTheme = getLocalizedCardThemeForUserSurface({
    visualThemeId: profile.visualThemeId ?? null,
    homeTeamId: profile.homeTeamId ?? null
  });
  const homeTeam = getTeam(profile.homeTeamId ?? undefined);
  const localizedCardVars = getLocalizedCardCssVars(localizedTheme);
  const rowTone = isCurrentUser
    ? "border-accent/60 bg-white shadow-[0_10px_24px_rgba(16,185,129,0.12)]"
    : isLightlyHighlighted
      ? "border-gray-300 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.06)]"
      : "border-gray-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)]";
  const rankTone = isCurrentUser ? "text-accent-dark" : isLightlyHighlighted ? "text-gray-800" : "text-gray-700";
  const canShowTrophyAwardAction = canAwardManagedTrophies && (profile.id !== currentUserId || canSelfAwardTrophies);
  const rowContentPadding = canShowTrophyAwardAction ? "pr-32" : "pr-20";

  const rowContent = (
    <>
      <span
        className={`flex min-w-[2.15rem] flex-col items-center justify-center px-0.5 py-1 text-center ${rankTone}`}
      >
        <span className="text-lg font-black leading-none">{profile.rank ?? index + 1}</span>
        <span className="mt-0.5 inline-block origin-top scale-[0.62] text-[8px] font-black uppercase tracking-wide leading-none">
          Place
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <Avatar
          name={profile.name}
          avatarUrl={profile.avatarUrl}
          size="md"
          className="h-[3.45rem] w-[3.45rem] text-base"
        />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 self-center">
            <span className="min-w-0 truncate text-sm font-black text-gray-950 sm:text-[0.95rem]">
              {profile.name}
              {isCurrentUser ? " (You)" : ""}
            </span>
          </span>
        </span>
      </span>
    </>
  );

  return (
    <div
      key={profile.id}
      className={`relative isolate overflow-hidden rounded-[1.2rem] border bg-white px-3 py-2 ${rowTone}`}
      style={localizedCardVars}
    >
      <LeaderboardPlayerLocalizationBackground theme={localizedTheme} />
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5">
        {canShowTrophyAwardAction ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!managedAwardGroup) {
                return;
              }
              onOpenTrophySheet(profile.id);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-sm shadow-[0_6px_16px_rgba(15,23,42,0.12)] transition hover:border-accent hover:bg-accent-light focus:outline-none focus:ring-2 focus:ring-accent-light"
            aria-label={`Award trophy to ${profile.name}`}
          >
            🏆
          </button>
        ) : null}
        <span className="leaderboard-score-chip ui-chip-sm border border-gray-200 bg-white/95 px-1.5 text-[9px] font-black text-gray-950">
          {homeTeam?.flagEmoji ? (
            <span
              aria-hidden
              title={homeTeam.name}
              className="leaderboard-score-android-home-flag native-flag-emoji"
            >
              <span aria-hidden className="block leading-none">
                {homeTeam.flagEmoji}
              </span>
            </span>
          ) : null}
          {scoreLabel}: {scoreValue}
        </span>
      </div>
      {isCurrentUser ? (
        <div className={`relative z-10 grid min-h-[3.65rem] min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 ${rowContentPadding}`}>
          {rowContent}
        </div>
      ) : (
        <Link
          href={`/leaderboard/${profile.id}`}
          className={`relative z-10 grid min-h-[3.65rem] min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 ${rowContentPadding}`}
        >
          {rowContent}
        </Link>
      )}
    </div>
  );
}

function getLeaderboardScoreDisplay(profile: LeaderboardListItem, activePhase: LeaderboardPhase) {
  const scoreValue = getLeaderboardNumericScore(profile, activePhase);

  if (activePhase === "group_phase") {
    return {
      scoreLabel: "Pts",
      scoreValue
    };
  }

  if (activePhase === "knockout_phase") {
    return {
      scoreLabel: "Pts",
      scoreValue
    };
  }

  return {
    scoreLabel: "Pts",
    scoreValue
  };
}

function getLeaderboardNumericScore(profile: LeaderboardListItem, activePhase: LeaderboardPhase) {
  if (activePhase === "group_phase") {
    return profile.groupPhasePoints ?? 0;
  }

  if (activePhase === "knockout_phase") {
    return profile.knockoutPhasePoints ?? 0;
  }

  return profile.globalTopTenPoints ?? profile.totalPoints ?? 0;
}

function SafetyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wide text-gray-600 shadow-sm transition hover:border-accent hover:bg-accent-light hover:text-accent-dark focus:outline-none focus:ring-2 focus:ring-accent-light"
      aria-label="Report or block"
    >
      <Flag className="h-3.5 w-3.5" aria-hidden />
      <span>Safety</span>
    </button>
  );
}

export function LeaderboardClient() {
  const { user, isLoading: isUserLoading } = useCurrentUser();
  const { activeLanguage: uiLanguage } = useAppLanguage();
  const searchParams = useSearchParams();
  const leaderboardViewStorageUserId = user?.id ?? null;
  const leaderboardSwitcherStorageKey = useMemo(
    () => buildSessionViewStateStorageKey({ key: "leaderboard:switcher", userId: leaderboardViewStorageUserId }),
    [leaderboardViewStorageUserId]
  );
  const leaderboardActivityDisclosureStorageKey = useMemo(
    () => buildSessionViewStateStorageKey({ key: "leaderboard:activity-disclosure", userId: leaderboardViewStorageUserId }),
    [leaderboardViewStorageUserId]
  );
  const leaderboardActivityMoreStorageKey = useMemo(
    () => buildSessionViewStateStorageKey({ key: "leaderboard:activity-more", userId: leaderboardViewStorageUserId }),
    [leaderboardViewStorageUserId]
  );
  const leaderboardLeaderSummaryStorageKey = useMemo(
    () => buildSessionViewStateStorageKey({ key: "leaderboard:leader-summary", userId: leaderboardViewStorageUserId }),
    [leaderboardViewStorageUserId]
  );
  const leaderboardSubselectionStorageKey = useMemo(
    () => buildSessionViewStateStorageKey({ key: "leaderboard:subselection", userId: leaderboardViewStorageUserId }),
    [leaderboardViewStorageUserId]
  );
  const [users, setUsers] = useState<LeaderboardListItem[]>([]);
  const [groupStandings, setGroupStandings] = useState<GroupStandingItem[]>([]);
  const [teamStandings, setTeamStandings] = useState<TeamStandingItem[]>([]);
  const [switcher, setSwitcher] = useState<LeaderboardSwitcherContext | null>(null);
  const [dailyWinners, setDailyWinners] = useState<DailyWinner[]>([]);
  const [activityFeed, setActivityFeed] = useState<LeaderboardActivityItem[]>([]);
  const [globalLeaderboardTotalPlayers, setGlobalLeaderboardTotalPlayers] = useState(0);
  const [activePhase, setActivePhase] = useState<LeaderboardPhase>(DEFAULT_LEADERBOARD_PHASE);
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
    leaderboardActivityDisclosureStorageKey,
    false
  );
  const [isActivityMoreOpen, setIsActivityMoreOpen] = useSessionDisclosureState(
    leaderboardActivityMoreStorageKey,
    false
  );
  const [isPhaseNavOpen, setIsPhaseNavOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [managedAwardGroup, setManagedAwardGroup] = useState<ManagedGroupDetails | null>(null);
  const [managedTrophySheetTarget, setManagedTrophySheetTarget] = useState<{ groupId: string; userId: string } | null>(null);
  const [activeManagedTrophyKey, setActiveManagedTrophyKey] = useState<string | null>(null);
  const [isSafetyReportOpen, setIsSafetyReportOpen] = useState(false);
  const [extraReportTarget, setExtraReportTarget] = useState<ReportTargetOption | null>(null);
  const [initialReportTargetId, setInitialReportTargetId] = useState<string | null>(null);
  const [celebrationTrophy, setCelebrationTrophy] = useState<{
    name: string;
    icon: string;
    tier?: "bronze" | "silver" | "gold" | "special" | null;
  } | null>(null);
  const [globalStandingLabel, setGlobalStandingLabel] = useState<string | null>(null);
  const [hasExplicitSwitcherPreference, setHasExplicitSwitcherPreference] = useState(false);
  const [hasRestoredSwitcherPreference, setHasRestoredSwitcherPreference] = useState(false);
  const [hasRestoredLeaderSummaryState, setHasRestoredLeaderSummaryState] = useState(false);
  const [rememberedViewByPhase, setRememberedViewByPhase] = useState<
    Partial<Record<LeaderboardPhase, LeaderboardSwitcherView>>
  >({});
  const [subselectionState, setSubselectionState] = useSessionJsonState<LeaderboardSubselectionState>(
    leaderboardSubselectionStorageKey,
    DEFAULT_SUBSELECTION_STATE
  );
  const [dismissedDailyWinnerKeys, setDismissedDailyWinnerKeys] = useState<string[]>([]);
  const [hasRestoredDailyWinnerDismissal, setHasRestoredDailyWinnerDismissal] = useState(false);
  const [restoredDailyWinnerDismissOwnerKey, setRestoredDailyWinnerDismissOwnerKey] = useState<string | null>(null);
  const [leaderSummaryStateByContext, setLeaderSummaryStateByContext] = useState<
    Record<string, { isOpen: boolean; showAllLeaders: boolean }>
  >({});
  const hasLoadedLeaderboardRef = useRef(false);
  const lastSelectedGroupIdRef = useRef("");
  const lastSelectedManagerIdRef = useRef("");
  const localizedTheme = getLocalizedCardThemeForUserSurface({
    visualThemeId: user?.visualThemeId ?? null,
    homeTeamId: user?.homeTeamId ?? null,
    preferredLanguage: user?.preferredLanguage ?? null
  });
  const localizedCardVars = getLocalizedCardCssVars(localizedTheme);
  const introChipStyle = {
    backgroundColor: "var(--localized-card-control-surface)",
    color: "var(--localized-card-control-text)"
  } as const;
  if (selectedGroupId) {
    lastSelectedGroupIdRef.current = selectedGroupId;
  }

  if (selectedManagerId) {
    lastSelectedManagerIdRef.current = selectedManagerId;
  }

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("phase", getAvailableLeaderboardPhase(activePhase));
    params.set("view", activeView);
    if (selectedGroupId) {
      params.set("groupId", selectedGroupId);
    }
    if (selectedManagerId) {
      params.set("managerId", selectedManagerId);
    }

    return `/api/leaderboard?${params.toString()}`;
  }, [activePhase, activeView, selectedGroupId, selectedManagerId]);
  const dailyWinnerDismissOwnerKey = user?.id ?? "anonymous";

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
      let storedSwitcherState: LeaderboardStoredSwitcherState | null = null;
      const storedValue = window.sessionStorage.getItem(leaderboardSwitcherStorageKey);
      if (storedValue) {
        storedSwitcherState = JSON.parse(storedValue) as LeaderboardStoredSwitcherState;
        if (storedSwitcherState.phaseViewByPhase) {
          setRememberedViewByPhase(storedSwitcherState.phaseViewByPhase);
        }
      }

      const queryPhase = searchParams.get("phase");
      const queryView = searchParams.get("view");
      const queryGroupId = searchParams.get("groupId");
      const queryManagerId = searchParams.get("managerId");
      if (queryPhase || queryView || queryGroupId || queryManagerId) {
        setHasExplicitSwitcherPreference(true);
        if (queryPhase === "knockout_phase" || queryPhase === "global_top10" || queryPhase === "group_phase") {
          setActivePhase(getAvailableLeaderboardPhase(queryPhase));
        }
        if (queryView) {
          setActiveView(queryView as LeaderboardSwitcherView);
        }
        if (queryGroupId) {
          setSelectedGroupId(queryGroupId);
        }
        if (queryManagerId) {
          setSelectedManagerId(queryManagerId);
        }
      } else if (storedSwitcherState) {
        setHasExplicitSwitcherPreference(true);
        const restoredPhase = getAvailableLeaderboardPhase(storedSwitcherState.activePhase ?? DEFAULT_LEADERBOARD_PHASE);
        setActivePhase(restoredPhase);

        const restoredView =
          storedSwitcherState.phaseViewByPhase?.[restoredPhase] ?? storedSwitcherState.activeView;
        if (restoredView) {
          setActiveView(restoredView);
        }
        if (storedSwitcherState.selectedGroupId) {
          setSelectedGroupId(storedSwitcherState.selectedGroupId);
        }
        if (storedSwitcherState.selectedManagerId) {
          setSelectedManagerId(storedSwitcherState.selectedManagerId);
        }
      } else {
        setHasExplicitSwitcherPreference(false);
        setRememberedViewByPhase({});
        setActivePhase(DEFAULT_LEADERBOARD_PHASE);
        setActiveView(DEFAULT_SWITCHER_STATE.activeView);
        setSelectedGroupId(DEFAULT_SWITCHER_STATE.selectedGroupId);
        setSelectedManagerId(DEFAULT_SWITCHER_STATE.selectedManagerId);
      }
    } catch (caughtError) {
      console.warn("Could not restore leaderboard switcher state.", caughtError);
    } finally {
      setHasRestoredSwitcherPreference(true);
    }
  }, [leaderboardSwitcherStorageKey, searchParams]);

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
    const handleAdminResetSignal = (event: StorageEvent) => {
      if (event.key !== ADMIN_UI_RESET_SIGNAL_STORAGE_KEY) {
        return;
      }

      setDismissedDailyWinnerKeys([]);
      try {
        window.localStorage.removeItem(LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY);
      } catch (caughtError) {
        console.warn("Could not clear Daily Winner dismissal state after admin reset.", caughtError);
      }
    };

    window.addEventListener("storage", handleAdminResetSignal);
    return () => {
      window.removeEventListener("storage", handleAdminResetSignal);
    };
  }, []);

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
      const storedValue = window.sessionStorage.getItem(leaderboardLeaderSummaryStorageKey);
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
  }, [leaderboardLeaderSummaryStorageKey]);

  useEffect(() => {
    if (!hasRestoredLeaderSummaryState) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        leaderboardLeaderSummaryStorageKey,
        JSON.stringify(leaderSummaryStateByContext)
      );
    } catch (caughtError) {
      console.warn("Could not save leaderboard leader summary state.", caughtError);
    }
  }, [hasRestoredLeaderSummaryState, leaderboardLeaderSummaryStorageKey, leaderSummaryStateByContext]);

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
          const result = await parseJsonResponse<
            | ({ ok: true } & LeaderboardPageData)
            | { ok: false; message?: string }
          >(response, "Could not load the live leaderboard right now.", "leaderboard");

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
          setTeamStandings(result.teamStandings);
          setSwitcher(result.switcher);
          setDailyWinners(result.dailyWinners);
          setActivityFeed(result.activityFeed);
          setGlobalLeaderboardTotalPlayers(result.globalLeaderboardTotalPlayers);
          setActivePhase(getAvailableLeaderboardPhase(result.phase));
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

    fetch("/api/leaderboard?phase=global_top10&view=global", { cache: "no-store" })
      .then(async (response) => {
        const result = await parseJsonResponse<
          | ({ ok: true } & LeaderboardPageData)
          | { ok: false; message?: string }
        >(response, "Could not load the live leaderboard right now.", "leaderboard");

        if (!response.ok || !result.ok) {
          throw new Error(result.ok ? "Could not load the live leaderboard right now." : result.message);
        }

        return result.currentUserRank ?? null;
      })
      .then((currentUserRank) => {
        if (!isMounted) {
          return;
        }

        setGlobalStandingLabel(
          currentUserRank
            ? `${t(uiLanguage, "leaderboard.global")}: #${currentUserRank}`
            : `${t(uiLanguage, "leaderboard.global")}: ${t(uiLanguage, "leaderboard.unranked")}`
        );
      })
      .catch(() => {
        if (isMounted) {
          setGlobalStandingLabel(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshNonce, uiLanguage, user?.id]);

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
    if (!hasRestoredSwitcherPreference) {
      return;
    }

    setRememberedViewByPhase((current) => {
      if (current[activePhase] === activeView) {
        return current;
      }

      return {
        ...current,
        [activePhase]: activeView
      };
    });
  }, [activePhase, activeView, hasRestoredSwitcherPreference]);

  useEffect(() => {
    if (!switcher) {
      return;
    }

    const preferredView = getRememberedLeaderboardViewForPhase(switcher, activePhase, rememberedViewByPhase);
    const phaseTabs = getPhaseViewTabs(switcher, activePhase, uiLanguage);

    if (!hasExplicitSwitcherPreference) {
      if (activeView !== preferredView) {
        setActiveView(preferredView);
      }
      return;
    }

    const allowedViews = new Set(phaseTabs.map((tab) => tab.value));
    if (!allowedViews.has(activeView)) {
      setActiveView(preferredView);
    }
  }, [activePhase, activeView, hasExplicitSwitcherPreference, rememberedViewByPhase, switcher, uiLanguage]);

  const availableGroupOptions = useMemo(
    () => (switcher ? getGroupOptionsForView(switcher, activeView) : []),
    [activeView, switcher]
  );

  useEffect(() => {
    if (!switcher || !shouldShowGroupSelector(activeView)) {
      return;
    }

    const rememberedGroupId =
      subselectionState.groupByPhaseAndView?.[activePhase]?.[activeView] ??
      subselectionState.groupByView?.[activeView];
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
  }, [activePhase, activeView, availableGroupOptions, selectedGroupId, subselectionState, switcher]);

  useEffect(() => {
    if (!switcher || !shouldShowManagerSelector(activeView)) {
      return;
    }

    const availableManagerIds = new Set(switcher.managers.map((manager) => manager.id));
    const rememberedManagerId =
      subselectionState.managerByPhaseAndView?.[activePhase]?.[activeView] ??
      subselectionState.managerByView?.[activeView] ??
      "";

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
  }, [activePhase, activeView, selectedManagerId, subselectionState, switcher]);

  useEffect(() => {
    if (!hasRestoredSwitcherPreference) {
      return;
    }

    const nextState = {
      activePhase: getAvailableLeaderboardPhase(activePhase),
      phaseViewByPhase: rememberedViewByPhase,
      activeView,
      selectedGroupId,
      selectedManagerId
    };

    try {
      window.sessionStorage.setItem(leaderboardSwitcherStorageKey, JSON.stringify(nextState));
    } catch (caughtError) {
      console.warn("Could not persist leaderboard switcher state.", caughtError);
    }
  }, [
    activePhase,
    activeView,
    hasRestoredSwitcherPreference,
    leaderboardSwitcherStorageKey,
    rememberedViewByPhase,
    selectedGroupId,
    selectedManagerId
  ]);

  useEffect(() => {
    if (!shouldShowGroupSelector(activeView) || !selectedGroupId) {
      return;
    }

    setSubselectionState((current) => {
      if (current.groupByPhaseAndView?.[activePhase]?.[activeView] === selectedGroupId) {
        return current;
      }

      return {
        ...current,
        groupByPhaseAndView: {
          ...current.groupByPhaseAndView,
          [activePhase]: {
            ...current.groupByPhaseAndView?.[activePhase],
            [activeView]: selectedGroupId
          }
        }
      };
    });
  }, [activePhase, activeView, selectedGroupId, setSubselectionState]);

  useEffect(() => {
    if (!shouldShowManagerSelector(activeView)) {
      return;
    }

    setSubselectionState((current) => {
      if (current.managerByPhaseAndView?.[activePhase]?.[activeView] === selectedManagerId) {
        return current;
      }

      return {
        ...current,
        managerByPhaseAndView: {
          ...current.managerByPhaseAndView,
          [activePhase]: {
            ...current.managerByPhaseAndView?.[activePhase],
            [activeView]: selectedManagerId
          }
        }
      };
    });
  }, [activePhase, activeView, selectedManagerId, setSubselectionState]);

  const selectedGroupLabel = useMemo(
    () => availableGroupOptions.find((group) => group.id === selectedGroupId)?.label ?? null,
    [availableGroupOptions, selectedGroupId]
  );
  const selectedManagerLabel = useMemo(
    () => switcher?.managers.find((manager) => manager.id === selectedManagerId)?.label ?? null,
    [selectedManagerId, switcher?.managers]
  );
  const selectedGroupSummary = useMemo(
    () => availableGroupOptions.find((group) => group.id === selectedGroupId) ?? null,
    [availableGroupOptions, selectedGroupId]
  );
  const phaseNavItems = useMemo(
    () => (switcher ? getPhaseNavItems(switcher, activePhase, uiLanguage) : []),
    [activePhase, switcher, uiLanguage]
  );
  const activePhaseNavKey = useMemo(() => {
    if (activePhase === "global_top10" && activeView === "groups") {
      return "groups";
    }

    if (activePhase === "global_top10" && activeView === "teams") {
      return "teams";
    }

    if (activePhase === "global_top10" || activeView === "global") {
      return "global";
    }

    if ((activeView === "managed_groups" || activeView === "my_groups") && selectedGroupId) {
      return `${activeView}:${selectedGroupId}`;
    }

    return "global";
  }, [activePhase, activeView, selectedGroupId]);
  const activePhaseNavLabel = useMemo(
    () =>
      phaseNavItems.find((item) => item.key === activePhaseNavKey)?.label ??
      (activePhase === "group_phase"
        ? t(uiLanguage, "leaderboard.groupStage")
        : activePhase === "knockout_phase"
          ? t(uiLanguage, "leaderboard.knockoutStage")
          : t(uiLanguage, "leaderboard.globalTop10")),
    [activePhase, activePhaseNavKey, phaseNavItems, uiLanguage]
  );
  const groupedPhaseNavItems = useMemo(() => {
    const globalItems = phaseNavItems.filter(
      (item) => item.view === "global" || item.view === "groups" || item.view === "teams"
    );
    const managedItems = phaseNavItems.filter((item) => item.view === "managed_groups");
    const invitedItems = phaseNavItems.filter((item) => item.view === "my_groups");

    return [
      { title: t(uiLanguage, "leaderboard.global"), items: globalItems },
      { title: t(uiLanguage, "leaderboard.managedGroups"), items: managedItems },
      { title: t(uiLanguage, "leaderboard.invitedGroups"), items: invitedItems }
    ].filter((section) => section.items.length > 0);
  }, [phaseNavItems, uiLanguage]);
  const shouldShowPhaseNavMenu = phaseNavItems.length > 1;

  useEffect(() => {
    if (!shouldShowPhaseNavMenu && isPhaseNavOpen) {
      setIsPhaseNavOpen(false);
    }
  }, [isPhaseNavOpen, shouldShowPhaseNavMenu]);

  const leaderboardTitle = useMemo(() => {
    if (activePhase === "global_top10" && activeView === "groups") {
      return t(uiLanguage, "leaderboard.globalTop10Groups");
    }

    if (activePhase === "global_top10" && activeView === "teams") {
      return t(uiLanguage, "leaderboard.globalTop10Teams");
    }

    if (activePhase === "global_top10") {
      return t(uiLanguage, "leaderboard.globalTop10");
    }

    if ((activeView === "managed_groups" || activeView === "my_groups") && selectedGroupLabel) {
      return selectedGroupLabel;
    }

    return activePhase === "group_phase" ? t(uiLanguage, "leaderboard.groupStageLeaderboard") : t(uiLanguage, "leaderboard.knockoutStageLeaderboard");
  }, [activePhase, activeView, selectedGroupLabel, uiLanguage]);
  const dailyWinnerContextLabel = useMemo(() => {
    if (activeView === "global") {
      return t(uiLanguage, "leaderboard.global");
    }

    if ((activeView === "managed_groups" || activeView === "my_groups") && selectedGroupLabel) {
      return selectedGroupLabel;
    }

    if (activeView === "groups") {
      return t(uiLanguage, "leaderboard.groupStandings");
    }

    if (activeView === "managers" && selectedManagerLabel) {
      return selectedManagerLabel;
    }

    return null;
  }, [activeView, selectedGroupLabel, selectedManagerLabel, uiLanguage]);
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
  const isTeamStandingsView = activeView === "teams";
  const displayedGroupStandings = useMemo(
    () => (activePhase === "global_top10" ? groupStandings.slice(0, 10) : groupStandings),
    [activePhase, groupStandings]
  );
  const displayedTeamStandings = useMemo(
    () => (activePhase === "global_top10" ? teamStandings.slice(0, 10) : teamStandings),
    [activePhase, teamStandings]
  );
  const isGlobalTopTenPlayerView = activePhase === "global_top10" && isGlobalView;
  const hasGlobalTopTenScoringStarted = users.some((profile) => getLeaderboardNumericScore(profile, activePhase) > 0);
  const shouldShowGlobalTopTenWaitingCard =
    isGlobalTopTenPlayerView && !isLoading && !error && users.length > 0 && !hasGlobalTopTenScoringStarted;
  const shouldRenderLeaderboardRows = (isGlobalView || isGroupView) && !shouldShowGlobalTopTenWaitingCard;
  const canAwardManagedTrophies =
    activeView === "managed_groups" &&
    hasDirectorAccess(switcher?.accessLevel ?? "player") &&
    Boolean(managedAwardGroup);
  const canSelfAwardTrophies = user?.role === "admin";
  const baseReportTargets = useMemo<ReportTargetOption[]>(() => {
    const targets: ReportTargetOption[] = [];
    if (isGroupView && selectedGroupSummary) {
      targets.push({
        type: "group",
        id: selectedGroupSummary.id,
        label: `Group: ${selectedGroupSummary.label}`,
        groupId: selectedGroupSummary.id
      });
    } else {
      targets.push({
        type: "other",
        id: "page",
        label: `Page: ${leaderboardTitle}`,
        groupId: null
      });
    }

    for (const profile of users) {
      if (profile.id === user?.id) {
        continue;
      }

      targets.push({
        type: "user",
        id: profile.id,
        label: `Player: ${profile.name}`,
        groupId: isGroupView ? selectedGroupId : null,
        canBlock: true
      });
    }

    return targets;
  }, [isGroupView, leaderboardTitle, selectedGroupId, selectedGroupSummary, user?.id, users]);
  const reportTargets = useMemo(() => {
    if (!extraReportTarget) {
      return baseReportTargets;
    }

    const extraKey = `${extraReportTarget.type}:${extraReportTarget.id}:${extraReportTarget.groupId ?? "global"}`;
    const hasExtra = baseReportTargets.some((target) => `${target.type}:${target.id}:${target.groupId ?? "global"}` === extraKey);
    return hasExtra ? baseReportTargets : [extraReportTarget, ...baseReportTargets];
  }, [baseReportTargets, extraReportTarget]);
  const shallowLeaderboardSpacerHeight = useMemo(() => {
    if (!shouldRenderLeaderboardRows || isLoading || Boolean(error) || users.length === 0) {
      return 0;
    }

    const missingRows = Math.max(0, LEADERBOARD_STABLE_ROW_TARGET - users.length);
    return missingRows * LEADERBOARD_STABLE_ROW_DEPTH_PX;
  }, [error, isLoading, shouldRenderLeaderboardRows, users.length]);
  const leaders = useMemo(() => users.filter((profile) => profile.rank === 1), [users]);
  const sharedLeaderScore = leaders[0] ? getLeaderboardNumericScore(leaders[0], activePhase) : null;
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
  const handleSelectPhase = useCallback((nextPhase: LeaderboardPhase) => {
    const availablePhase = getAvailableLeaderboardPhase(nextPhase);
    setHasExplicitSwitcherPreference(true);
    setIsPhaseNavOpen(false);
    setActivePhase(availablePhase);
    if (switcher) {
      setActiveView(getRememberedLeaderboardViewForPhase(switcher, availablePhase, rememberedViewByPhase));
    }
  }, [rememberedViewByPhase, switcher]);

  const handleSelectPhaseNavItem = useCallback((item: PhaseNavItem) => {
    setHasExplicitSwitcherPreference(true);
    setIsPhaseNavOpen(false);
    const nextPhase = item.phase ?? activePhase;
    if (item.phase) {
      setActivePhase(item.phase);
    }
    const nextView =
      item.phase && item.view === "global" && !item.groupId && switcher
        ? getRememberedLeaderboardViewForPhase(switcher, nextPhase, rememberedViewByPhase)
        : item.view;

    setActiveView(nextView);
    if (item.groupId) {
      setSelectedGroupId(item.groupId);
    }
  }, [activePhase, rememberedViewByPhase, switcher]);

  function renderActivityCard(event: LeaderboardActivityItem, isNewest: boolean) {
    const activityMessage = event.messageKey ? t(uiLanguage, event.messageKey, event.messageParams ?? {}) : event.message;
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
                      {activityMessage}
                    </p>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`ui-chip-sm font-black ${getActivityBadgeTone(event)}`}
                      >
                        {getActivityLabel(event, uiLanguage)}
                      </span>
                      {isNewest ? (
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t(uiLanguage, "leaderboard.newest")}</p>
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
                              ? `Hide comments for ${activityMessage}`
                              : `Open comments for ${activityMessage}`
                          }
                        >
                          {event.eventId && expandedComments[event.eventId] ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          )}
                          <span>💬 {event.comments.length > 0 ? t(uiLanguage, "leaderboard.commentCount", { count: event.comments.length }) : t(uiLanguage, "leaderboard.comments")}</span>
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
                  {activityMessage}
                </p>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span
                    className={`ui-chip-sm font-black ${getActivityBadgeTone(event)}`}
                  >
                    {getActivityLabel(event, uiLanguage)}
                  </span>
                  {isNewest ? (
                    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t(uiLanguage, "leaderboard.newest")}</p>
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
                          className={`ui-chip-sm border text-xs font-bold transition ${
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
                          <div className="flex items-center gap-2">
                            {!comment.isOwn && user ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openSafetyReport({
                                    type: "comment",
                                    id: comment.id,
                                    label: `Comment by ${comment.userName}`,
                                    groupId: isGroupView ? selectedGroupId : null
                                  })
                                }
                                className="text-[11px] font-bold text-gray-500 underline-offset-2 hover:text-accent-dark hover:underline"
                              >
                                Report
                              </button>
                            ) : null}
                            <p className="text-[11px] font-semibold text-gray-500">
                              {formatRelativeTime(comment.createdAt)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-gray-700">{comment.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-gray-500">{t(uiLanguage, "leaderboard.noCommentsYet")}</p>
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
                    placeholder={t(uiLanguage, "leaderboard.addComment")}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-gray-500">{t(uiLanguage, "leaderboard.commentGuidance")}</p>
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
                      className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-xs font-bold text-accent-text transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {activeCommentEventId === event.eventId ? t(uiLanguage, "leaderboard.posting") : t(uiLanguage, "leaderboard.postComment")}
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

  return (
    <div className="space-y-5">
      <section
        className="relative overflow-hidden rounded-[1.15rem] p-5"
        style={{
          ...localizedCardVars,
          backgroundColor: "var(--localized-card-bg)",
          borderColor: "var(--localized-card-border)",
          color: "var(--localized-card-text)"
        }}
      >
        <LocalizedCardBackground theme={localizedTheme} />
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-[color:var(--localized-card-secondary-text)]">
            {t(uiLanguage, "leaderboard.leaderboard")}
          </p>
          {globalStandingLabel ? (
            <div className="ui-chip-sm shrink-0 font-bold uppercase tracking-wide" style={introChipStyle}>
              {globalStandingLabel}
            </div>
          ) : null}
        </div>
        <h2 className="relative mt-3 text-xl font-black leading-tight text-[color:var(--localized-card-text)] sm:text-2xl">
          {t(uiLanguage, "leaderboard.seeHowYouRank")}
        </h2>
      </section>

      {!isLoading && !error && canEvaluateDailyWinnerDismissal && dailyWinners.length > 0 && !isDailyWinnerDismissed ? (
        <section className="relative overflow-hidden rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="relative">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="text-sm font-bold uppercase tracking-wide text-amber-700">🏆 {t(uiLanguage, "leaderboard.dailyWinnerTitle")}</p>
                  {dailyWinnerContextLabel ? (
                    <span className="ui-chip-sm border border-amber-200 bg-white/80 font-bold uppercase tracking-wide text-amber-800">
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
                      {t(uiLanguage, "leaderboard.seeInRecentActivity")}
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
                    aria-label={t(uiLanguage, "leaderboard.dismissDailyWinner")}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm font-semibold text-gray-600">
                {dailyWinners.length === 1 ? t(uiLanguage, "leaderboard.highestPointsToday") : t(uiLanguage, "leaderboard.tiedHighestPointsToday")}
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
                          <p className="mt-1 text-sm font-semibold text-amber-800">{t(uiLanguage, "leaderboard.pointsTodayFull", { points: winner.points })}</p>
                          {winner.homeTeamId ? (
                            <div className="mt-2">
                              <HomeTeamBadge teamId={winner.homeTeamId} label="" className="border-amber-200 bg-amber-50/80" />
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
                            <span>{winner.congratulated ? t(uiLanguage, "leaderboard.congratulated") : t(uiLanguage, "leaderboard.congratulate")}</span>
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
        className="compact-landscape-sticky-rail sticky z-[14] -mx-4 !overflow-visible bg-white px-4 pb-2 pt-1.5 shadow-[0_12px_22px_-18px_rgba(15,23,42,0.45)] sm:mx-0 sm:rounded-lg sm:!rounded-t-none sm:border sm:border-gray-200 sm:px-3"
        style={{ top: "calc(var(--app-header-sticky-offset, var(--app-header-height, 72px)) + var(--app-sticky-rail-gap, 1.5rem))" }}
      >
        {renderSwitcherControls("px-1")}
      </section>

      {!isLoading && !error && activityFeed.length > 0 ? (
        <section className="ui-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(uiLanguage, "leaderboard.recentActivity")}</p>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {t(uiLanguage, "leaderboard.activitySummary", { updateCount: activityFeed.length, mentionCount: activityMentionCount })}
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

      {shouldShowGlobalTopTenWaitingCard ? (
        <GlobalTopTenWaitingCard
          leaders={users}
          totalPlayers={globalLeaderboardTotalPlayers || users.length}
          language={uiLanguage}
        />
      ) : shouldRenderLeaderboardRows ? (
        <section className="space-y-2" style={{ minHeight: LEADERBOARD_STABLE_CONTENT_MIN_HEIGHT }}>
          {isGroupView && selectedGroupSummary ? (
            <div className="flex min-w-0 items-start gap-3 px-1 pt-1">
              <Avatar
                name={leaderboardTitle}
                avatarUrl={selectedGroupSummary.avatarUrl ?? undefined}
                size="lg"
                className="h-[4.5rem] w-[4.5rem] shrink-0 text-lg shadow-sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="min-w-0 truncate text-base font-black text-gray-950">{leaderboardTitle}</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    {user ? (
                      <SafetyButton onClick={() => openSafetyReport()} />
                    ) : null}
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-gray-700">
                      {selectedGroupSummary.context === "managed" ? t(uiLanguage, "leaderboard.managed") : t(uiLanguage, "leaderboard.invited")}
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[11px] font-semibold text-gray-600">
                  <div className="min-w-0 truncate">
                    <span className="font-black text-gray-900">{t(uiLanguage, "leaderboard.managedBy")}</span>{" "}
                    <span>{selectedGroupSummary.managerName ?? t(uiLanguage, "leaderboard.groupManager")}</span>
                  </div>
                  <div className="text-right font-black text-gray-900">
                    {t(uiLanguage, "leaderboard.playerCountFull", { count: selectedGroupSummary.totalPlayers })}
                  </div>
                  <div className="min-w-0">
                    <span className="font-black text-gray-900">{t(uiLanguage, "leaderboard.averagePoints")}</span>{" "}
                    {selectedGroupSummary.averagePoints !== null ? formatAveragePoints(selectedGroupSummary.averagePoints) : "—"}
                  </div>
                  <div className="text-right">
                    <span className="font-black text-gray-900">{t(uiLanguage, "leaderboard.globalRank")}</span>{" "}
                    {selectedGroupSummary.globalRank ? `#${selectedGroupSummary.globalRank}` : "—"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2 px-1 pt-1">
              <h3 className="text-base font-black text-gray-950">{leaderboardTitle}</h3>
              {user ? <SafetyButton onClick={() => openSafetyReport()} /> : null}
            </div>
          )}
          {!isLoading && !error && leaders.length > 1 ? (
            <LeaderSummaryCard
              leaders={leaders}
              sharedScore={sharedLeaderScore}
              isOpen={leaderSummaryState.isOpen}
              showAllLeaders={leaderSummaryState.showAllLeaders}
              language={uiLanguage}
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
          {isLoading ? (
            <p className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
              Loading leaderboard...
            </p>
          ) : null}

          {!isLoading && error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Could not load the live leaderboard right now: {error}
            </p>
          ) : null}

          {users.map((profile, index) => {
            const { scoreLabel, scoreValue } = getLeaderboardScoreDisplay(profile, activePhase);

            return (
              <LeaderboardPlayerRow
                key={profile.id}
                profile={profile}
                index={index}
                currentUserId={user?.id}
                scoreLabel={scoreLabel}
                scoreValue={scoreValue}
                canAwardManagedTrophies={canAwardManagedTrophies}
                canSelfAwardTrophies={canSelfAwardTrophies}
                managedAwardGroup={managedAwardGroup}
                onOpenTrophySheet={(userId) => {
                  if (!managedAwardGroup) {
                    return;
                  }

                  setManagedTrophySheetTarget({ groupId: managedAwardGroup.id, userId });
                }}
              />
            );
          })}

          {shallowLeaderboardSpacerHeight > 0 ? (
            <div aria-hidden className="pointer-events-none" style={{ height: `${shallowLeaderboardSpacerHeight}px` }} />
          ) : null}
        </section>
      ) : isGroupStandingsView ? (
        <GroupStandingsSection
          title={leaderboardTitle}
          groups={displayedGroupStandings}
          isLoading={isLoading}
          error={error}
          language={uiLanguage}
        />
      ) : isTeamStandingsView ? (
        <TeamStandingsSection
          title={leaderboardTitle}
          teams={displayedTeamStandings}
          isLoading={isLoading}
          error={error}
          language={uiLanguage}
        />
      ) : (
        <LeaderboardPlaceholder
          activeView={activeView}
          selectedGroupLabel={selectedGroupLabel}
          selectedManagerLabel={selectedManagerLabel}
          language={uiLanguage}
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

      <ReportBlockDialog
        open={isSafetyReportOpen}
        targets={reportTargets}
        initialTargetId={initialReportTargetId}
        onClose={() => {
          setIsSafetyReportOpen(false);
          setExtraReportTarget(null);
          setInitialReportTargetId(null);
        }}
        onSubmitted={() => setRefreshNonce((current) => current + 1)}
      />
    </div>
  );

  function openSafetyReport(target?: ReportTargetOption) {
    if (target) {
      setExtraReportTarget(target);
      setInitialReportTargetId(target.id);
    } else {
      setExtraReportTarget(null);
      setInitialReportTargetId(null);
    }
    setIsSafetyReportOpen(true);
  }

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

      const result = await parseJsonResponse<
        | { ok: true; reactions: LeaderboardActivityItem["reactions"] }
        | { ok: false; message?: string }
      >(response, "Could not update that reaction.", "leaderboard reactions");

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

      const result = await parseJsonResponse<
        | { ok: true; comments: LeaderboardActivityItem["comments"] }
        | { ok: false; message?: string }
      >(response, "Could not add that comment.", "leaderboard comments");

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
          prevLabel={t(uiLanguage, "leaderboard.showPreviousLeaderboardPhases")}
          nextLabel={t(uiLanguage, "leaderboard.showMoreLeaderboardPhases")}
          activeItemKey={getAvailableLeaderboardPhase(activePhase)}
          onActiveItemChange={(nextKey) => handleSelectPhase(nextKey as LeaderboardPhase)}
        >
          {LEADERBOARD_PHASE_RAIL_ITEMS.map((phase) => (
            <button
              key={phase.value}
              type="button"
              onClick={() => {
                if (!phase.disabled) {
                  handleSelectPhase(phase.value);
                }
              }}
              data-choice-key={phase.disabled ? undefined : phase.value}
              data-choice-active={getAvailableLeaderboardPhase(activePhase) === phase.value ? "true" : "false"}
              disabled={phase.disabled}
              aria-disabled={phase.disabled ? "true" : undefined}
              className={`shrink-0 ${LEADERBOARD_COCKPIT_BUTTON_CLASS} ${
                phase.disabled
                  ? "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400"
                  : getAvailableLeaderboardPhase(activePhase) === phase.value
                  ? "bg-accent text-accent-text"
                  : "border border-gray-300 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
              }`}
            >
              {phase.value === "group_phase"
                ? t(uiLanguage, "leaderboard.groupStage")
                : phase.value === "knockout_phase"
                  ? t(uiLanguage, "leaderboard.knockoutStage")
                  : t(uiLanguage, "leaderboard.global")}
            </button>
          ))}
        </LeaderboardChoiceRail>

        <p className="mx-auto max-w-[22rem] text-center text-[11px] font-semibold leading-4 text-gray-500">
          {t(uiLanguage, "leaderboard.knockoutLeaderboardComingSoon")}
        </p>

        {shouldShowPhaseNavMenu ? (
          <div className="relative mx-auto w-[87%]">
            <button
              type="button"
              onClick={() => setIsPhaseNavOpen((current) => !current)}
              className={LEADERBOARD_COCKPIT_TRIGGER_CLASS}
            >
              <span className="truncate text-[14px] font-bold text-gray-900">{activePhaseNavLabel}</span>
              {isPhaseNavOpen ? <ChevronUp className="h-4.5 w-4.5 text-gray-500" /> : <ChevronDown className="h-4.5 w-4.5 text-gray-500" />}
            </button>
            {isPhaseNavOpen ? (
              <div className="mt-1.5 w-full rounded-md border border-gray-200 bg-white p-1.5 shadow-lg">
                <div className="space-y-2">
                  {groupedPhaseNavItems.map((section) => (
                    <div key={section.title} className="space-y-1">
                      <p className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">{section.title}</p>
                      <div className="space-y-1">
                        {section.items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => handleSelectPhaseNavItem(item)}
                            className={`flex min-h-9 w-full items-center justify-between rounded-md border px-3 py-1.5 text-left text-[13px] font-bold transition ${
                              activePhaseNavKey === item.key
                                ? "border-accent-light bg-accent-light text-accent-dark"
                                : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                            }`}
                            title={item.label}
                          >
                            <span className="truncate text-[13px] font-bold">{item.label}</span>
                            {activePhaseNavKey === item.key ? (
                              <span className="ml-2 shrink-0 text-[10px] font-black uppercase tracking-wide">{t(uiLanguage, "leaderboard.open")}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
  selectedManagerLabel,
  language
}: {
  activeView: LeaderboardSwitcherView;
  selectedGroupLabel: string | null;
  selectedManagerLabel: string | null;
  language: string;
}) {
  return (
    <section className="ui-card-soft p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "leaderboard.leaderboardView")}</p>
      <h3 className="mt-2 text-2xl font-black text-gray-950">{getPlaceholderTitle(activeView, language)}</h3>
      <p className="mt-2 text-sm font-semibold text-gray-600">
        {getPlaceholderCopy(activeView, selectedGroupLabel, selectedManagerLabel, language)}
      </p>
      <p className="mt-2.5 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700">
        {t(language, "leaderboard.progressGlobalOnly")}
      </p>
      <p className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-700">
        {t(language, "leaderboard.groupLeaderboardComingNext")}
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

function getPhaseViewTabs(
  switcher: LeaderboardSwitcherContext,
  activePhase: LeaderboardPhase,
  language = "en"
): Array<{ value: LeaderboardSwitcherView; label: string }> {
  if (activePhase === "global_top10") {
    return [
      { value: "global", label: t(language, "leaderboard.globalTop10") },
      ...(switcher.tabs.some((tab) => tab.value === "groups")
        ? [{ value: "groups" as const, label: t(language, "leaderboard.globalTop10Groups") }]
        : []),
      ...(switcher.tabs.some((tab) => tab.value === "teams")
        ? [{ value: "teams" as const, label: t(language, "leaderboard.globalTop10Teams") }]
        : [])
    ];
  }

  const nextTabs: Array<{ value: LeaderboardSwitcherView; label: string }> = [
    {
      value: "global",
      label: activePhase === "group_phase" ? t(language, "leaderboard.groupStage") : t(language, "leaderboard.knockoutStage")
    }
  ];
  if (switcher.managedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "managed_groups")) {
    nextTabs.push({ value: "managed_groups", label: t(language, "leaderboard.managedGroups") });
  }
  if (switcher.joinedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "my_groups")) {
    nextTabs.push({ value: "my_groups", label: t(language, "leaderboard.invitedGroups") });
  }

  return nextTabs;
}

function getPhaseNavItems(
  switcher: LeaderboardSwitcherContext,
  activePhase: LeaderboardPhase,
  language: string
): PhaseNavItem[] {
  if (activePhase === "global_top10") {
    return [
      { key: "global", label: t(language, "leaderboard.globalTop10"), view: "global" },
      ...(switcher.tabs.some((tab) => tab.value === "groups")
        ? [{ key: "groups", label: t(language, "leaderboard.globalTop10Groups"), view: "groups" as const }]
        : []),
      ...(switcher.tabs.some((tab) => tab.value === "teams")
        ? [{ key: "teams", label: t(language, "leaderboard.globalTop10Teams"), view: "teams" as const }]
        : [])
    ];
  }

  const items: PhaseNavItem[] = [];

  const seenGroupIds = new Set<string>();

  for (const group of switcher.managedGroups) {
    items.push({
      key: `managed_groups:${group.id}`,
      label: group.label,
      view: "managed_groups",
      groupId: group.id
    });
    seenGroupIds.add(group.id);
  }

  for (const group of switcher.joinedGroups) {
    if (seenGroupIds.has(group.id)) {
      continue;
    }

    items.push({
      key: `my_groups:${group.id}`,
      label: group.label,
      view: "my_groups",
      groupId: group.id
    });
  }

  return items;
}

function getDefaultLeaderboardViewForPhase(
  switcher: LeaderboardSwitcherContext,
  activePhase: LeaderboardPhase
): LeaderboardSwitcherView {
  if (activePhase === "global_top10") {
    return "global";
  }

  if (switcher.managedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "managed_groups")) {
    return "managed_groups";
  }

  if (switcher.joinedGroups.length > 0 && switcher.tabs.some((tab) => tab.value === "my_groups")) {
    return "my_groups";
  }

  return "global";
}

function getRememberedLeaderboardViewForPhase(
  switcher: LeaderboardSwitcherContext,
  activePhase: LeaderboardPhase,
  rememberedViewByPhase: Partial<Record<LeaderboardPhase, LeaderboardSwitcherView>>
): LeaderboardSwitcherView {
  const rememberedView = rememberedViewByPhase[activePhase];
  if (rememberedView && getPhaseViewTabs(switcher, activePhase, "en").some((tab) => tab.value === rememberedView)) {
    return rememberedView;
  }

  return getDefaultLeaderboardViewForPhase(switcher, activePhase);
}

function shouldShowManagerSelector(activeView: LeaderboardSwitcherView) {
  return activeView === "managers";
}

function getPlaceholderTitle(activeView: LeaderboardSwitcherView, language: string) {
  if (activeView === "my_groups") {
    return t(language, "leaderboard.invitedJoinedGroups");
  }
  if (activeView === "managed_groups") {
    return t(language, "leaderboard.myManagedGroups");
  }
  if (activeView === "groups") {
    return t(language, "leaderboard.groupStandings");
  }
  if (activeView === "managers") {
    return t(language, "leaderboard.managers");
  }
  return t(language, "leaderboard.globalStandings");
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
  selectedManagerLabel: string | null,
  language: string
) {
  if (activeView === "managers") {
    return selectedManagerLabel
      ? t(language, "leaderboard.liningUpManagerContext", { label: selectedManagerLabel })
      : t(language, "leaderboard.chooseManagerContext");
  }

  if (shouldShowGroupSelector(activeView)) {
    return selectedGroupLabel
      ? t(language, "leaderboard.liningUpGroupContext", { label: selectedGroupLabel })
      : t(language, "leaderboard.chooseGroupContext");
  }

  if (activeView === "groups") {
    return t(language, "leaderboard.groupsYouJoinedManaged");
  }

  return t(language, "leaderboard.globalReady");
}

function GroupStandingsSection({
  title,
  groups,
  isLoading,
  error,
  language
}: {
  title: string;
  groups: GroupStandingItem[];
  isLoading: boolean;
  error: string | null;
  language: string;
}) {
  const isDirectoryView = groups.some((group) => group.visibility === "directory");
  const topAverage = groups[0]?.avgPoints ?? 0;
  const allGroupsAreScoreless = !isDirectoryView && groups.length > 0 && groups.every((group) => group.totalPoints <= 0);

  return (
      <section className="space-y-2">
          <div className="px-1 pt-1">
            <h3 className="text-base font-black text-gray-950">{title}</h3>
          </div>

      {isLoading ? (
        <p className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
          {t(language, "leaderboard.loadingGroupStandings")}
        </p>
      ) : null}

      {!isLoading && error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {t(language, "leaderboard.couldNotLoadGroupStandings", { error })}
        </p>
      ) : null}

      {!isLoading && !error && groups.length === 0 ? (
        <p className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
          {t(language, "leaderboard.noGroupStandings")}
        </p>
      ) : null}

      {!isLoading && !error && allGroupsAreScoreless ? (
        <p className="ui-card px-4 py-3 text-sm font-semibold text-gray-600">
          {t(language, "leaderboard.groupScoresPending")}
        </p>
      ) : null}

      {!isLoading && !error && isDirectoryView
        ? groups.map((group) => (
            <div key={group.id} className="ui-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-gray-950">{group.name}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-gray-600">
                    <span className="font-black text-gray-800">{t(language, "leaderboard.managedBy")}</span>{" "}
                    {group.managerName}
                  </p>
                </div>
                {group.tag ? (
                  <span className="ui-chip-sm shrink-0 border border-gray-200 bg-gray-50 font-black text-gray-700">
                    {group.tag}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        : null}

      {!isLoading && !error && !isDirectoryView
        ? groups.map((group) => {
            const isScoreless = group.totalPoints <= 0;
            const barWidth = topAverage > 0
              ? Math.min(100, Math.max(group.avgPoints > 0 ? 12 : 10, Math.round((group.avgPoints / topAverage) * 100)))
              : 10;

            return (
              <div key={group.id} className="ui-card p-3">
                <div className="flex items-start gap-3">
                  <div className="flex min-h-12 min-w-12 flex-col items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-center text-gray-700">
                    <span className="text-sm font-black leading-none">{group.rank}</span>
                    <span className="mt-1 text-[9px] font-black uppercase tracking-wide leading-none">{t(language, "leaderboard.rank")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-gray-950">{group.name}</p>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-600">{group.managerName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black text-accent-dark">{formatAveragePoints(group.avgPoints)}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t(language, "leaderboard.avgStandardPts")}</p>
                      </div>
                    </div>

                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${isScoreless ? "bg-gray-300" : "bg-accent"}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
                      <span>{t(language, "leaderboard.playerCountFull", { count: group.playerCount })}</span>
                      <span>•</span>
                      <span>{t(language, "leaderboard.totalPts", { points: group.totalPoints })}</span>
                      <span>•</span>
                      <span>{t(language, "leaderboard.topPlayer", { name: group.topPlayerName, points: group.topPlayerPoints })}</span>
                      {group.perfectPickCount !== null ? (
                        <>
                          <span>•</span>
                          <span>{t(language, "leaderboard.perfectPicks", { count: group.perfectPickCount })}</span>
                        </>
                      ) : null}
                      {group.recentActivityCount !== null ? (
                        <>
                          <span>•</span>
                          <span>{t(language, "leaderboard.recentMoments", { count: group.recentActivityCount })}</span>
                        </>
                      ) : null}
                      {isScoreless ? (
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-black text-gray-600">
                          {t(language, "leaderboard.noScoresYet")}
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

function TeamStandingsSection({
  title,
  teams,
  isLoading,
  error,
  language
}: {
  title: string;
  teams: TeamStandingItem[];
  isLoading: boolean;
  error: string | null;
  language: string;
}) {
  const topAverage = teams[0]?.avgPoints ?? 0;
  const allTeamsAreScoreless = teams.length > 0 && teams.every((team) => team.totalPoints <= 0);

  return (
    <section className="space-y-2">
      <div className="px-1 pt-1">
        <h3 className="text-base font-black text-gray-950">{title}</h3>
      </div>

      {isLoading ? (
        <p className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
          {t(language, "leaderboard.loadingTeamStandings")}
        </p>
      ) : null}

      {!isLoading && error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {t(language, "leaderboard.couldNotLoadTeamStandings", { error })}
        </p>
      ) : null}

      {!isLoading && !error && teams.length === 0 ? (
        <p className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
          {t(language, "leaderboard.noTeamStandings")}
        </p>
      ) : null}

      {!isLoading && !error && allTeamsAreScoreless ? (
        <p className="ui-card px-4 py-3 text-sm font-semibold text-gray-600">
          {t(language, "leaderboard.teamScoresPending")}
        </p>
      ) : null}

      {!isLoading && !error
        ? teams.map((team) => {
            const isScoreless = team.totalPoints <= 0;
            const barWidth = topAverage > 0
              ? Math.min(100, Math.max(team.avgPoints > 0 ? 12 : 10, Math.round((team.avgPoints / topAverage) * 100)))
              : 10;

            return (
              <div key={team.id} className="ui-card p-3">
                <div className="flex items-start gap-3">
                  <div className="flex min-h-12 min-w-12 flex-col items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-center text-gray-700">
                    <span className="text-sm font-black leading-none">{team.rank}</span>
                    <span className="mt-1 text-[9px] font-black uppercase tracking-wide leading-none">{t(language, "leaderboard.rank")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-base font-black text-gray-950">{team.name}</p>
                          <HomeTeamBadge teamId={team.id} label="" compact className="bg-gray-50" />
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-600">
                          {t(language, "leaderboard.playersBackingTeam", { count: team.playerCount, teamName: team.shortName })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black text-accent-dark">{formatAveragePoints(team.avgPoints)}</p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{t(language, "leaderboard.avgPts")}</p>
                      </div>
                    </div>

                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${isScoreless ? "bg-gray-300" : "bg-accent"}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
                      <span>{t(language, "leaderboard.totalPts", { points: team.totalPoints })}</span>
                      <span>•</span>
                      <span>{t(language, "leaderboard.topPlayer", { name: team.topPlayerName, points: team.topPlayerPoints })}</span>
                      {isScoreless ? (
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-black text-gray-600">
                          {t(language, "leaderboard.noScoresYet")}
                        </span>
                      ) : null}
                      {team.tag ? (
                        <span className="rounded-md bg-accent-light px-2 py-1 text-[11px] font-black text-accent-dark">
                          {team.tag}
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
  language,
  onToggleOpen,
  onShowAllLeaders,
  onShowFewerLeaders
}: {
  leaders: LeaderboardListItem[];
  sharedScore: number | null;
  isOpen: boolean;
  showAllLeaders: boolean;
  language: string;
  onToggleOpen: () => void;
  onShowAllLeaders: () => void;
  onShowFewerLeaders: () => void;
}) {
  const previewLeaders = showAllLeaders ? leaders : leaders.slice(0, 4);
  const hiddenLeaderCount = Math.max(0, leaders.length - previewLeaders.length);

  return (
    <div className="ui-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "leaderboard.whosNumberOne")}</h3>
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
              {t(language, "leaderboard.sharedScore", { score: sharedScore ?? "—" })}
            </div>
          </div>
          <p className="mt-0.5 min-w-0 text-sm leading-6 text-gray-600">
            {t(language, "leaderboard.playersShareRankOne", { count: leaders.length })}
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
                {t(language, "leaderboard.moreLeaders", { count: hiddenLeaderCount })}
              </button>
            ) : null}
            {showAllLeaders && leaders.length > 4 ? (
              <button
                type="button"
                onClick={onShowFewerLeaders}
                className="inline-flex items-center rounded-md bg-accent-light px-3 py-2 text-sm font-bold text-accent-dark transition hover:bg-accent/20"
              >
                {t(language, "leaderboard.showLess")}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function GlobalTopTenWaitingCard({
  leaders,
  totalPlayers,
  language
}: {
  leaders: LeaderboardListItem[];
  totalPlayers: number;
  language: string;
}) {
  const previewLeaders = leaders.slice(0, 30);
  const hiddenPlayerCount = Math.max(0, totalPlayers - previewLeaders.length);

  return (
    <section className="ui-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "leaderboard.whosNumberOne")}</h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(language, "leaderboard.noScoresYet")}</p>
        </div>
        <span className="ui-chip-sm border border-gray-200 bg-gray-50 font-black text-gray-800">
          {t(language, "leaderboard.sharedScore", { score: 0 })}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
        {t(language, "leaderboard.globalTop10Waiting")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {previewLeaders.map((leader) => (
          <Link
            key={leader.id}
            href={`/leaderboard/${leader.id}`}
            className="inline-flex max-w-full items-center gap-2 rounded-[0.85rem] border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            <Avatar name={leader.name} avatarUrl={leader.avatarUrl} size="sm" />
            <span className="truncate">{leader.name}</span>
          </Link>
        ))}
        {hiddenPlayerCount > 0 ? (
          <span className="inline-flex items-center rounded-[0.85rem] border border-gray-200 bg-white px-3 py-2 text-sm font-black text-gray-700">
            {t(language, "leaderboard.morePlayersJoining", { count: hiddenPlayerCount })}
          </span>
        ) : null}
      </div>
    </section>
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
      motionMode="anchored"
      allowAnchoredTouchScroll
    >
      {children}
    </WindowChoiceRail>
  );
}

function formatAveragePoints(value: number) {
  return value % 1 === 0 ? `${value}` : value.toFixed(1);
}

function getActivityLabel(event: LeaderboardActivityItem, language: string) {
  if (event.eventType === "perfect_pick") {
    return t(language, "leaderboard.activityPerfectPick");
  }

  if (event.eventType === "daily_winner") {
    return t(language, "leaderboard.activityDailyWinner");
  }

  if (event.eventType === "points_awarded" && event.pointsDelta === 8) {
    return "8 Pts";
  }

  if (event.eventType === "trophy_awarded") {
    return t(language, "leaderboard.activityTrophy");
  }

  if (event.eventType === "rank_moved_up") {
    return t(language, "leaderboard.activityRankUp");
  }

  if (event.eventType === "rank_moved_down") {
    return t(language, "leaderboard.activityRankMove");
  }

  return t(language, "leaderboard.activityPoints");
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
