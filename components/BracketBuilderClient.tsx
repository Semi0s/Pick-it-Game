"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp, GripVertical, TriangleAlert, X } from "lucide-react";
import { saveLightSeedBuilderAction } from "@/app/groups/actions";
import { ActionButton, InlineDisclosureButton } from "@/components/player-management/Shared";
import { useAppLanguage } from "@/lib/app-language";
import { showAppToast } from "@/lib/app-toast";
import { formatDate, formatTime } from "@/lib/i18n-format";
import { storeGroupsEntryIntent } from "@/lib/groups-entry-intent";
import {
  buildDefaultLightSeedBuilderSnapshot,
  type LightSeedBuilderSnapshot,
  type UserGroupProjectionSource
} from "@/lib/group-stage-modes";
import { getGroupTopTwoCompletionStatus } from "@/lib/group-stage-third-place-gate";
import { formatGroupName, normalizeGroupKey } from "@/lib/group-standings";
import {
  buildProjectedGroupStandingsFromSeedRankings,
  buildUserProjectedRoundOf32,
  type GroupSeedRankingInput,
  type KnockoutPlaceholderMatch
} from "@/lib/knockout-seeding";
import type { KnockoutBracketEditorView } from "@/lib/bracket-predictions";
import type { MatchWithTeams, Team } from "@/lib/types";
import { getLocalGroupMatches } from "@/lib/group-matches";
import { t } from "@/lib/strings";

type RankedTeam = {
  id: string;
  name: string;
  shortName: string;
  groupName: string;
  flagEmoji: string;
};

type BracketBuilderClientProps = {
  initialMatches?: MatchWithTeams[];
  initialKnockoutSeeded?: boolean;
  initialSnapshot?: LightSeedBuilderSnapshot | null;
  hasSavedSnapshot?: boolean;
  initialGroupProjectionSources?: Record<string, UserGroupProjectionSource>;
  requiredThirdPlaceQualifierCount?: number;
  roundOf32Placeholders: KnockoutPlaceholderMatch[];
  groupStageDueAt?: string | null;
  knockoutProjectedPreview?: KnockoutBracketEditorView | null;
  fullScoresEnabled?: boolean;
  language?: string | null;
};

type CustomDragGhost = {
  kind: "group" | "third";
  teamId: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type BracketPreviewSide = {
  teamId: string | null;
  shortLabel: string;
  flagEmoji: string | null;
  slotComparisonState: "match" | "miss" | null;
};

type BracketPreviewMatch = {
  matchId: string;
  stage: string;
  home: BracketPreviewSide;
  away: BracketPreviewSide;
};

const KNOCKOUT_COMPARE_VIEW_STATE_STORAGE_KEY = "knockout-compare-view-state";
const BRACKET_BUILDER_COMPLETION_SEEN_STORAGE_KEY = "bracket-builder-completion-seen";

const SWIPE_THRESHOLD_PX = 42;
const GROUP_SWIPE_EXIT_MS = 190;
const NEAR_DEADLINE_WINDOW_MS = 48 * 60 * 60 * 1000;
const CUSTOM_TOUCH_DRAG_HOLD_MS = 155;
const CUSTOM_TOUCH_DRAG_MOVE_THRESHOLD_PX = 20;

function formatProjectedSeedLabel(sourceLabel: string | null | undefined) {
  if (!sourceLabel) {
    return "TBD";
  }

  const normalized = sourceLabel.trim();
  const compactSourceMatch = normalized.match(/^([123])([A-L])$/i);
  if (compactSourceMatch) {
    const rank = compactSourceMatch[1] === "1" ? "1st" : compactSourceMatch[1] === "2" ? "2nd" : "3rd";
    return `${compactSourceMatch[2].toUpperCase()}-${rank}`;
  }

  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return `${groupMatch[1].toUpperCase()}-${groupMatch[2].toLowerCase() === "winner" ? "1st" : "2nd"}`;
  }

  const bestThirdFromMatch = normalized.match(/^Best\s+3(?:rd)?\s+from\s+([A-L](?:\/[A-L])*)$/i);
  if (bestThirdFromMatch) {
    return `3rd ${bestThirdFromMatch[1].toUpperCase()}`;
  }

  return normalized;
}

function formatSavedTimeLabel(timestamp: string, language?: string | null) {
  return formatTime(timestamp, language);
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
  return nextItems;
}

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function getBracketLayout(matchCount: number) {
  const rowHeight = 16;
  const teamGap = 0;
  const setGap = 18;
  const matchBlockHeight = rowHeight * 2 + teamGap + setGap;
  const positions = Array.from({ length: matchCount }, (_, index) => index * matchBlockHeight);
  const rounds: number[][] = [];
  let current = positions.map((position) => position + rowHeight / 2 + 2);

  while (current.length > 1) {
    rounds.push(current);
    const nextRound: number[] = [];
    for (let index = 0; index < current.length; index += 2) {
      nextRound.push((current[index] + current[index + 1]) / 2);
    }
    current = nextRound;
  }

  return {
    rowHeight,
    pairGap: teamGap,
    matchBlockHeight,
    totalHeight: matchCount * matchBlockHeight - setGap,
    rounds
  };
}

export function BracketBuilderClient({
  initialMatches,
  initialKnockoutSeeded = false,
  initialSnapshot,
  hasSavedSnapshot = false,
  initialGroupProjectionSources = {},
  requiredThirdPlaceQualifierCount = 0,
  roundOf32Placeholders,
  groupStageDueAt = null,
  knockoutProjectedPreview = null,
  fullScoresEnabled = true,
  language: initialLanguage = null
}: BracketBuilderClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeLanguage } = useAppLanguage();
  const language = activeLanguage ?? initialLanguage;
  const groupSwipeTouchRef = useRef<{
    startX: number | null;
    startY: number | null;
    enabled: boolean;
    isSwiping: boolean;
  }>({
    startX: null,
    startY: null,
    enabled: true,
    isSwiping: false
  });
  const customDragHoldTimeoutRef = useRef<number | null>(null);
  const customDragStateRef = useRef<{
    kind: "group" | "third";
    teamId: string;
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    isDragging: boolean;
    isGroupSwipe: boolean;
    targetId: string;
  } | null>(null);
  const hasMountedRef = useRef(false);
  const completionWasValidRef = useRef(false);
  const groupRowRefs = useRef(new Map<string, HTMLDivElement>());
  const previousGroupRowTopsRef = useRef(new Map<string, number>());
  const thirdPlaceRowRefs = useRef(new Map<string, HTMLDivElement>());
  const previousThirdPlaceRowTopsRef = useRef(new Map<string, number>());
  const groupSwipeAnimationTimeoutRef = useRef<number | null>(null);
  const matches = initialMatches ?? getLocalGroupMatches();
  const teams = useMemo(
    () =>
      Array.from(
        new Map(
          matches.flatMap((match) => {
            const entries: Array<[string, Team]> = [];
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
    [matches]
  );
  const defaultSnapshot = useMemo(() => buildDefaultLightSeedBuilderSnapshot(teams), [teams]);
  const persistedGroupKeys = useMemo(
    () =>
      new Set(
        (initialSnapshot?.groupRankings ?? []).map((ranking) => normalizeGroupKey(ranking.groupName) ?? ranking.groupName)
      ),
    [initialSnapshot]
  );
  const initialDisplayGroupRankings = useMemo(() => {
    const savedRankingsByGroup = new Map(
      (initialSnapshot?.groupRankings ?? []).map((ranking) => [
        normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
        ranking.rankedTeamIds
      ])
    );

    return defaultSnapshot.groupRankings.map((ranking) => {
      const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
      const savedRankedTeamIds = savedRankingsByGroup.get(groupName);
      return savedRankedTeamIds?.length
        ? { ...ranking, rankedTeamIds: savedRankedTeamIds }
        : ranking;
    });
  }, [defaultSnapshot.groupRankings, initialSnapshot]);
  const [groupRankings, setGroupRankings] = useState<LightSeedBuilderSnapshot["groupRankings"]>(
    initialDisplayGroupRankings
  );
  const [thirdPlaceRankings, setThirdPlaceRankings] = useState<string[]>(
    initialSnapshot?.thirdPlaceRankings?.length
      ? [...initialSnapshot.thirdPlaceRankings].sort((left, right) => left.rank - right.rank).map((row) => row.teamId)
      : []
  );
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [touchedGroups, setTouchedGroups] = useState<Set<string>>(persistedGroupKeys);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, setSaveMessage] = useState("Saves automatically");
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [draggedTeamId, setDraggedTeamId] = useState<string | null>(null);
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null);
  const [draggedThirdPlaceTeamId, setDraggedThirdPlaceTeamId] = useState<string | null>(null);
  const [dragOverThirdPlaceTeamId, setDragOverThirdPlaceTeamId] = useState<string | null>(null);
  const [customDragGhost, setCustomDragGhost] = useState<CustomDragGhost | null>(null);
  const [groupSwipeOffsetX, setGroupSwipeOffsetX] = useState(0);
  const [isGroupSurfaceSwiping, setIsGroupSurfaceSwiping] = useState(false);
  const [supportsNativeRowDrag, setSupportsNativeRowDrag] = useState(false);
  const [isThirdPlaceListOpen, setIsThirdPlaceListOpen] = useState(false);
  const [groupProjectionSources, setGroupProjectionSources] = useState<Record<string, UserGroupProjectionSource>>(initialGroupProjectionSources);
  const [isFinalizingBracket, setIsFinalizingBracket] = useState(false);
  const [finalBracketSavedAt, setFinalBracketSavedAt] = useState<string | null>(null);
  const [hasTouchedThirdPlaceRanking, setHasTouchedThirdPlaceRanking] = useState(
    (initialSnapshot?.thirdPlaceRankings?.length ?? 0) >= requiredThirdPlaceQualifierCount &&
      requiredThirdPlaceQualifierCount > 0
  );
  const [hasSeenCompletionThisSession, setHasSeenCompletionThisSession] = useState(false);
  const onboardingQuery = searchParams.get("onboarding") === "1" ? "&onboarding=1" : "";

  const teamsById = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          team.id,
          {
            id: team.id,
            name: team.name,
            shortName: team.shortName,
            groupName: normalizeGroupKey(team.groupName) ?? team.groupName,
            flagEmoji: team.flagEmoji
          } satisfies RankedTeam
        ])
      ),
    [teams]
  );
  const teamIdsByGroup = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const team of teams) {
      const groupName = normalizeGroupKey(team.groupName) ?? team.groupName;
      const current = groups.get(groupName) ?? new Set<string>();
      current.add(team.id);
      groups.set(groupName, current);
    }
    return groups;
  }, [teams]);
  const customDragGhostTeam = customDragGhost ? teamsById.get(customDragGhost.teamId) ?? null : null;

  const sortedGroupNames = useMemo(
    () =>
      groupRankings
        .map((ranking) => normalizeGroupKey(ranking.groupName) ?? ranking.groupName)
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    [groupRankings]
  );

  const groupRankingsByGroup = useMemo(
    () =>
      new Map(
        groupRankings.map((ranking) => [
          normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
          ranking.rankedTeamIds
        ])
      ),
    [groupRankings]
  );

  const derivedThirdPlacePool = useMemo(
    () =>
      sortedGroupNames
        .map((groupName) => {
          if (!touchedGroups.has(groupName)) {
            return null;
          }
          const rankedTeamIds = groupRankingsByGroup.get(groupName) ?? [];
          const thirdPlaceTeamId = rankedTeamIds[2] ?? null;
          return thirdPlaceTeamId ? teamsById.get(thirdPlaceTeamId) ?? null : null;
        })
        .filter((team): team is RankedTeam => Boolean(team)),
    [groupRankingsByGroup, sortedGroupNames, teamsById, touchedGroups]
  );

  const normalizedThirdPlaceRankings = useMemo(() => {
    const poolIds = new Set(derivedThirdPlacePool.map((team) => team.id));
    const preserved = thirdPlaceRankings.filter((teamId) => poolIds.has(teamId));
    const missing = derivedThirdPlacePool.map((team) => team.id).filter((teamId) => !preserved.includes(teamId));
    return [...preserved, ...missing];
  }, [derivedThirdPlacePool, thirdPlaceRankings]);

  const topTwoCompletionStatus = useMemo(
    () =>
      getGroupTopTwoCompletionStatus({
        groupNames: sortedGroupNames,
        rankings: groupRankings,
        teamIdsByGroup,
        touchedGroupNames: touchedGroups
      }),
    [groupRankings, sortedGroupNames, teamIdsByGroup, touchedGroups]
  );
  const hasUnlockedThirdPlacePhase = topTwoCompletionStatus.isComplete;
  const isThirdPlacePhase = hasUnlockedThirdPlacePhase && requiredThirdPlaceQualifierCount > 0;
  const hasCommittedThirdPlaceSelection =
    isThirdPlacePhase &&
    requiredThirdPlaceQualifierCount > 0 &&
    ((initialSnapshot?.thirdPlaceRankings?.length ?? 0) >= requiredThirdPlaceQualifierCount || hasTouchedThirdPlaceRanking);
  const committedThirdPlaceRankingIds = useMemo(
    () =>
      hasCommittedThirdPlaceSelection
        ? normalizedThirdPlaceRankings.slice(0, requiredThirdPlaceQualifierCount)
        : [],
    [hasCommittedThirdPlaceSelection, normalizedThirdPlaceRankings, requiredThirdPlaceQualifierCount]
  );
  const isComplete =
    isThirdPlacePhase &&
    committedThirdPlaceRankingIds.length >= requiredThirdPlaceQualifierCount;
  const isFinishButtonQuiet =
    Boolean(finalBracketSavedAt) && isComplete && !isFinalizingBracket;
  const canOpenProjectedKnockoutMatches = hasSavedSnapshot || Boolean(finalBracketSavedAt);
  const canAdvanceFromEasyBracket = hasSavedSnapshot || Boolean(finalBracketSavedAt);
  const activeGroupName = sortedGroupNames[activeGroupIndex] ?? null;
  const isActiveGroupScoreApplied = activeGroupName ? groupProjectionSources[activeGroupName] === "score_applied" : false;
  const activeGroupTeams = useMemo(
    () =>
      activeGroupName
        ? (groupRankingsByGroup.get(activeGroupName) ?? [])
            .map((teamId) => teamsById.get(teamId) ?? null)
            .filter((team): team is RankedTeam => Boolean(team))
        : [],
    [activeGroupName, groupRankingsByGroup, teamsById]
  );

  const currentRankingsInput = useMemo<GroupSeedRankingInput[]>(
    () =>
      groupRankings.map((ranking) => ({
        groupName: normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
        rankedTeamIds: ranking.rankedTeamIds
      })),
    [groupRankings]
  );
  const touchedRankingsInput = useMemo<GroupSeedRankingInput[]>(
    () =>
      currentRankingsInput.filter((ranking) =>
        touchedGroups.has(normalizeGroupKey(ranking.groupName) ?? ranking.groupName)
      ),
    [currentRankingsInput, touchedGroups]
  );
  const previewRankingsInput = useMemo<GroupSeedRankingInput[]>(
    () => (hasSavedSnapshot || hasInteracted ? touchedRankingsInput : []),
    [hasInteracted, hasSavedSnapshot, touchedRankingsInput]
  );

  const projectedStandings = useMemo(
    () => buildProjectedGroupStandingsFromSeedRankings(teams, previewRankingsInput),
    [previewRankingsInput, teams]
  );

  const projectedBracket = useMemo(
    () =>
      buildUserProjectedRoundOf32({
        groupMatches: [],
        teams,
        predictions: [],
        roundOf32Placeholders,
        standingsByGroupOverride: projectedStandings,
        rankedThirdPlaceTeamIdsOverride: isThirdPlacePhase && hasCommittedThirdPlaceSelection
          ? committedThirdPlaceRankingIds
          : null
      }),
    [
      committedThirdPlaceRankingIds,
      hasCommittedThirdPlaceSelection,
      isThirdPlacePhase,
      projectedStandings,
      roundOf32Placeholders,
      teams
    ]
  );
  const projectedComparisonRound = useMemo(
    () => knockoutProjectedPreview?.stages.find((stage) => stage.stage === "r32")?.matches ?? null,
    [knockoutProjectedPreview]
  );
  const bracketPreviewMatches = useMemo<BracketPreviewMatch[]>(() => {
    if (initialKnockoutSeeded && projectedComparisonRound?.length) {
      return projectedComparisonRound.map((match) => ({
        matchId: match.matchId,
        stage: match.stage,
        home: {
          teamId: match.homeTeam?.id ?? null,
          shortLabel: match.homeTeam?.shortName ?? formatProjectedSeedLabel(match.homeSourceLabel),
          flagEmoji: match.homeTeam?.flagEmoji ?? null,
          slotComparisonState: match.seededHomeTeam
            ? match.homeTeam
              ? match.homeTeam.id === match.seededHomeTeam.id
                ? "match"
                : "miss"
              : null
            : null
        },
        away: {
          teamId: match.awayTeam?.id ?? null,
          shortLabel: match.awayTeam?.shortName ?? formatProjectedSeedLabel(match.awaySourceLabel),
          flagEmoji: match.awayTeam?.flagEmoji ?? null,
          slotComparisonState: match.seededAwayTeam
            ? match.awayTeam
              ? match.awayTeam.id === match.seededAwayTeam.id
                ? "match"
                : "miss"
              : null
            : null
        }
      }));
    }

    return projectedBracket.matches.map((match) => {
      const homeTeam = match.home.teamId ? teamsById.get(match.home.teamId) ?? null : null;
      const awayTeam = match.away.teamId ? teamsById.get(match.away.teamId) ?? null : null;
      return {
        matchId: match.matchId,
        stage: "r32",
        home: {
          teamId: homeTeam?.id ?? null,
          shortLabel: homeTeam?.shortName ?? formatProjectedSeedLabel(match.home.sourceLabel),
          flagEmoji: homeTeam?.flagEmoji ?? null,
          slotComparisonState: null
        },
        away: {
          teamId: awayTeam?.id ?? null,
          shortLabel: awayTeam?.shortName ?? formatProjectedSeedLabel(match.away.sourceLabel),
          flagEmoji: awayTeam?.flagEmoji ?? null,
          slotComparisonState: null
        }
      };
    });
  }, [initialKnockoutSeeded, projectedBracket.matches, projectedComparisonRound, teamsById]);

  const isReadOnly = useMemo(() => {
    if (initialKnockoutSeeded) {
      return true;
    }

    if (!groupStageDueAt) {
      return false;
    }

    return new Date(groupStageDueAt).getTime() <= Date.now();
  }, [groupStageDueAt, initialKnockoutSeeded]);

  const nearDeadlineMessage = useMemo(() => {
    if (!groupStageDueAt || isReadOnly || isComplete) {
      return null;
    }

    const deadline = new Date(groupStageDueAt).getTime();
    const now = Date.now();
    if (deadline <= now || deadline - now > NEAR_DEADLINE_WINDOW_MS) {
      return null;
    }

    return formatDate(deadline, language, { month: "short", day: "numeric", timeZone: "UTC" });
  }, [groupStageDueAt, isComplete, isReadOnly, language]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setHasSeenCompletionThisSession(window.sessionStorage.getItem(BRACKET_BUILDER_COMPLETION_SEEN_STORAGE_KEY) === "1");
    } catch {
      setHasSeenCompletionThisSession(false);
    }
  }, []);

  useEffect(() => {
    if (isThirdPlacePhase) {
      setIsThirdPlaceListOpen(true);
    }
  }, [isThirdPlacePhase]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updateSupport = () => {
      setSupportsNativeRowDrag(mediaQuery.matches);
    };

    updateSupport();
    mediaQuery.addEventListener("change", updateSupport);
    return () => {
      if (customDragHoldTimeoutRef.current !== null) {
        window.clearTimeout(customDragHoldTimeoutRef.current);
      }
      if (groupSwipeAnimationTimeoutRef.current !== null) {
        window.clearTimeout(groupSwipeAnimationTimeoutRef.current);
      }
      mediaQuery.removeEventListener("change", updateSupport);
    };
  }, []);

  function clearCustomTouchDragState(options?: { preserveGroupSwipe?: boolean }) {
    if (customDragHoldTimeoutRef.current !== null) {
      window.clearTimeout(customDragHoldTimeoutRef.current);
      customDragHoldTimeoutRef.current = null;
    }
    customDragStateRef.current = null;
    setDraggedTeamId(null);
    setDragOverTeamId(null);
    setDraggedThirdPlaceTeamId(null);
    setDragOverThirdPlaceTeamId(null);
    setCustomDragGhost(null);
    if (!options?.preserveGroupSwipe) {
      setIsGroupSurfaceSwiping(false);
      setGroupSwipeOffsetX(0);
    }
  }

  function activateCustomTouchDrag(state: NonNullable<typeof customDragStateRef.current>) {
    state.isDragging = true;
    if (state.kind === "group") {
      setDraggedTeamId(state.teamId);
    } else {
      setDraggedThirdPlaceTeamId(state.teamId);
    }

    setCustomDragGhost({
      kind: state.kind,
      teamId: state.teamId,
      x: state.currentX,
      y: state.currentY,
      offsetX: state.offsetX,
      offsetY: state.offsetY,
      width: state.width,
      height: state.height
    });
  }

  function beginCustomTouchDrag(
    event: React.PointerEvent<HTMLDivElement>,
    kind: "group" | "third",
    teamId: string,
    disabled: boolean
  ) {
    if (supportsNativeRowDrag || disabled || event.pointerType === "mouse") {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-no-row-drag='true']")) {
      return;
    }

    event.preventDefault();
    clearCustomTouchDragState();
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    customDragStateRef.current = {
      kind,
      teamId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      offsetY: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
      width: rect.width,
      height: rect.height,
      isDragging: false,
      isGroupSwipe: false,
      targetId: teamId
    };

    customDragHoldTimeoutRef.current = window.setTimeout(() => {
      const state = customDragStateRef.current;
      if (!state || state.pointerId !== event.pointerId || state.teamId !== teamId || state.kind !== kind) {
        return;
      }

      activateCustomTouchDrag(state);
    }, CUSTOM_TOUCH_DRAG_HOLD_MS);
  }

  function handleCustomTouchDragMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = customDragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    if (state.isGroupSwipe) {
      event.preventDefault();
      state.currentX = event.clientX;
      state.currentY = event.clientY;
      updateGroupSurfaceSwipe(event.clientX - state.startX);
      return;
    }

    if (!state.isDragging) {
      const deltaX = Math.abs(event.clientX - state.startX);
      const deltaY = Math.abs(event.clientY - state.startY);
      if (state.kind === "group" && deltaX > 10 && deltaX > deltaY * 1.15) {
        if (customDragHoldTimeoutRef.current !== null) {
          window.clearTimeout(customDragHoldTimeoutRef.current);
          customDragHoldTimeoutRef.current = null;
        }

        state.isGroupSwipe = true;
        state.currentX = event.clientX;
        state.currentY = event.clientY;
        event.preventDefault();
        updateGroupSurfaceSwipe(event.clientX - state.startX);
        return;
      }

      if (deltaY > CUSTOM_TOUCH_DRAG_MOVE_THRESHOLD_PX || (deltaX > CUSTOM_TOUCH_DRAG_MOVE_THRESHOLD_PX && deltaY >= deltaX)) {
        if (customDragHoldTimeoutRef.current !== null) {
          window.clearTimeout(customDragHoldTimeoutRef.current);
          customDragHoldTimeoutRef.current = null;
        }

        state.currentX = event.clientX;
        state.currentY = event.clientY;
        activateCustomTouchDrag(state);
      } else {
        return;
      }
    }

    event.preventDefault();
    state.currentX = event.clientX;
    state.currentY = event.clientY;
    setCustomDragGhost((current) =>
      current
        ? {
            ...current,
            x: event.clientX,
            y: event.clientY
          }
        : current
    );
    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    if (!element) {
      return;
    }

    if (state.kind === "group") {
      const targetRow = element.closest<HTMLElement>("[data-group-team-id]");
      const targetId = targetRow?.dataset.groupTeamId ?? state.teamId;
      state.targetId = targetId;
      setDragOverTeamId(targetId);
      return;
    }

    const targetRow = element.closest<HTMLElement>("[data-third-team-id]");
    const targetId = targetRow?.dataset.thirdTeamId ?? state.teamId;
    state.targetId = targetId;
    setDragOverThirdPlaceTeamId(targetId);
  }

  function handleCustomTouchDragEnd(event: React.PointerEvent<HTMLDivElement>) {
    const state = customDragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }

    if (state.isGroupSwipe) {
      finishGroupSurfaceSwipe(event.clientX - state.startX);
      clearCustomTouchDragState({ preserveGroupSwipe: true });
      return;
    }

    const { isDragging, kind, targetId } = state;
    if (!isDragging) {
      clearCustomTouchDragState();
      return;
    }

    if (kind === "group") {
      handleDropReorder(targetId);
    } else {
      handleDropThirdPlaceReorder(targetId);
    }

    clearCustomTouchDragState();
  }

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      completionWasValidRef.current = isComplete;
      return;
    }

    if (!hasInteracted || isReadOnly) {
      return;
    }

    setSaveState("saving");
    setSaveMessage("Saving automatically...");
    const timeout = window.setTimeout(async () => {
      const result = await saveLightSeedBuilderAction({
        groupRankings: touchedRankingsInput,
        rankedThirdPlaceTeamIds: committedThirdPlaceRankingIds,
        commitThirdPlaceRankings: isThirdPlacePhase && hasTouchedThirdPlaceRanking
      });

      if (result.ok) {
        setSaveState("saved");
        setSaveMessage("Saved automatically");
        completionWasValidRef.current = isComplete;
        return;
      }

      setSaveState("error");
      setSaveMessage(result.message);
      showAppToast({ tone: "error", text: result.message });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [
    hasInteracted,
    hasSeenCompletionThisSession,
    hasTouchedThirdPlaceRanking,
    isComplete,
    isThirdPlacePhase,
    isReadOnly,
    committedThirdPlaceRankingIds,
    requiredThirdPlaceQualifierCount,
    touchedRankingsInput
  ]);

  function updateGroupRanking(groupName: string, nextRankedTeamIds: string[]) {
    if (groupProjectionSources[groupName] === "score_applied") {
      return;
    }
    setFinalBracketSavedAt(null);
    setHasInteracted(true);
    setSaveState("saving");
    setSaveMessage("Saving automatically...");
    setGroupProjectionSources((current) => ({
      ...current,
      [groupName]: "builder_manual"
    }));
    setTouchedGroups((current) => {
      if (current.has(groupName)) {
        return current;
      }

      const next = new Set(current);
      next.add(groupName);
      return next;
    });
    setGroupRankings((current) =>
      current.map((ranking) =>
        (normalizeGroupKey(ranking.groupName) ?? ranking.groupName) === groupName
          ? { ...ranking, rankedTeamIds: nextRankedTeamIds }
          : ranking
      )
    );
  }

  function acceptCurrentGroupRanking(groupName: string) {
    const currentOrder = groupRankingsByGroup.get(groupName) ?? [];
    if (currentOrder.length === 0) {
      return;
    }

    updateGroupRanking(groupName, currentOrder);
  }

  function moveThirdPlaceTeam(index: number, direction: -1 | 1) {
    setFinalBracketSavedAt(null);
    setHasInteracted(true);
    setHasTouchedThirdPlaceRanking(true);
    setSaveState("saving");
    setSaveMessage("Saving automatically...");
    setThirdPlaceRankings(moveItem(normalizedThirdPlaceRankings, index, direction));
  }

  function handleDropThirdPlaceReorder(targetTeamId: string) {
    if (isReadOnly || !draggedThirdPlaceTeamId || draggedThirdPlaceTeamId === targetTeamId) {
      setDraggedThirdPlaceTeamId(null);
      setDragOverThirdPlaceTeamId(null);
      return;
    }

    const fromIndex = normalizedThirdPlaceRankings.indexOf(draggedThirdPlaceTeamId);
    const toIndex = normalizedThirdPlaceRankings.indexOf(targetTeamId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedThirdPlaceTeamId(null);
      setDragOverThirdPlaceTeamId(null);
      return;
    }

    setFinalBracketSavedAt(null);
    setHasInteracted(true);
    setHasTouchedThirdPlaceRanking(true);
    setSaveState("saving");
    setSaveMessage("Saving automatically...");
    setThirdPlaceRankings(reorderItems(normalizedThirdPlaceRankings, fromIndex, toIndex));
    setDraggedThirdPlaceTeamId(null);
    setDragOverThirdPlaceTeamId(null);
  }

  function handleDropReorder(targetTeamId: string) {
    if (isReadOnly || !activeGroupName || isActiveGroupScoreApplied || !draggedTeamId || draggedTeamId === targetTeamId) {
      setDraggedTeamId(null);
      setDragOverTeamId(null);
      return;
    }

    const currentOrder = groupRankingsByGroup.get(activeGroupName) ?? [];
    const fromIndex = currentOrder.indexOf(draggedTeamId);
    const toIndex = currentOrder.indexOf(targetTeamId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedTeamId(null);
      setDragOverTeamId(null);
      return;
    }

    updateGroupRanking(activeGroupName, reorderItems(currentOrder, fromIndex, toIndex));
    setDraggedTeamId(null);
    setDragOverTeamId(null);
  }

  function goToGroup(nextIndex: number) {
    const boundedIndex = Math.max(0, Math.min(sortedGroupNames.length - 1, nextIndex));
    setActiveGroupIndex(boundedIndex);
  }

  function getGroupSwipeTravelDistance() {
    if (typeof window === "undefined") {
      return 360;
    }

    return Math.max(320, Math.min(window.innerWidth * 0.9, 540));
  }

  function getBoundedGroupSwipeOffset(deltaX: number) {
    const isPullingPastStart = deltaX > 0 && activeGroupIndex === 0;
    const isPullingPastEnd = deltaX < 0 && activeGroupIndex === sortedGroupNames.length - 1;
    const resistedDelta = isPullingPastStart || isPullingPastEnd ? deltaX * 0.28 : deltaX;
    return Math.max(-118, Math.min(118, resistedDelta));
  }

  function updateGroupSurfaceSwipe(deltaX: number) {
    setIsGroupSurfaceSwiping(true);
    setGroupSwipeOffsetX(getBoundedGroupSwipeOffset(deltaX));
  }

  function finishGroupSurfaceSwipe(deltaX: number) {
    setIsGroupSurfaceSwiping(false);

    const targetIndex = deltaX < 0 ? activeGroupIndex + 1 : activeGroupIndex - 1;
    const boundedTargetIndex = Math.max(0, Math.min(sortedGroupNames.length - 1, targetIndex));
    const shouldChangeGroup = Math.abs(deltaX) >= SWIPE_THRESHOLD_PX && boundedTargetIndex !== activeGroupIndex;

    if (!shouldChangeGroup) {
      setGroupSwipeOffsetX(0);
      return;
    }

    if (groupSwipeAnimationTimeoutRef.current !== null) {
      window.clearTimeout(groupSwipeAnimationTimeoutRef.current);
    }

    const swipeDirection = deltaX < 0 ? -1 : 1;
    const travelDistance = getGroupSwipeTravelDistance();

    setGroupSwipeOffsetX(swipeDirection * travelDistance);
    groupSwipeAnimationTimeoutRef.current = window.setTimeout(() => {
      groupSwipeAnimationTimeoutRef.current = null;
      setIsGroupSurfaceSwiping(true);
      setActiveGroupIndex(boundedTargetIndex);
      setGroupSwipeOffsetX(-swipeDirection * travelDistance);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setIsGroupSurfaceSwiping(false);
          setGroupSwipeOffsetX(0);
        });
      });
    }, GROUP_SWIPE_EXIT_MS);
  }

  function handleGroupSwipeTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    const target = event.target as HTMLElement | null;
    groupSwipeTouchRef.current = {
      startX: touch?.clientX ?? null,
      startY: touch?.clientY ?? null,
      enabled: !Boolean(target?.closest("[data-disable-group-swipe='true']")),
      isSwiping: false
    };
  }

  function handleGroupSwipeTouchMove(event: TouchEvent<HTMLElement>) {
    const { startX, startY, enabled } = groupSwipeTouchRef.current;
    if (!enabled || customDragStateRef.current?.isDragging || startX === null || startY === null) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!groupSwipeTouchRef.current.isSwiping) {
      if (Math.abs(deltaX) < 10 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
        return;
      }

      groupSwipeTouchRef.current.isSwiping = true;
    }

    event.preventDefault();
    updateGroupSurfaceSwipe(deltaX);
  }

  function handleGroupSwipeTouchEnd(event: TouchEvent<HTMLElement>) {
    const { startX, startY, enabled, isSwiping } = groupSwipeTouchRef.current;
    groupSwipeTouchRef.current = { startX: null, startY: null, enabled: true, isSwiping: false };
    if (!enabled || customDragStateRef.current?.isDragging || startX === null || startY === null) {
      setIsGroupSurfaceSwiping(false);
      setGroupSwipeOffsetX(0);
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (!isSwiping && (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY))) {
      setIsGroupSurfaceSwiping(false);
      setGroupSwipeOffsetX(0);
      return;
    }

    finishGroupSurfaceSwipe(deltaX);
  }

  function handleGoToFullScoring() {
    storeGroupsEntryIntent({
      source: "dashboard",
      target: "next-pick"
    });
    router.push(`/groups${onboardingQuery ? `?${onboardingQuery.slice(1)}` : ""}`);
  }

  function primeKnockoutProjectedCompareView() {
    try {
      window.sessionStorage.setItem(
        KNOCKOUT_COMPARE_VIEW_STATE_STORAGE_KEY,
        JSON.stringify({ hasInteracted: true, lastBias: 0 })
      );
    } catch {
      // Ignore storage failures and let the knockout page fall back to its remembered view.
    }
  }

  async function handleFinalizeBracket() {
    if (isReadOnly || !isComplete || isFinalizingBracket) {
      return;
    }

    setIsFinalizingBracket(true);
    setSaveState("saving");
    setSaveMessage(t(language, "common.saving"));

    const result = await saveLightSeedBuilderAction({
      groupRankings: touchedRankingsInput,
      rankedThirdPlaceTeamIds: committedThirdPlaceRankingIds,
      commitThirdPlaceRankings: true,
      finalizeTournamentEntry: true
    });

    setIsFinalizingBracket(false);

    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      showAppToast({ tone: "error", text: result.message });
      return;
    }

    setSaveState("saved");
    setSaveMessage(t(language, "bracket.savedAutomatically"));
    setFinalBracketSavedAt(new Date().toISOString());

    if (!hasSeenCompletionThisSession) {
      setShowCompletionScreen(true);
      try {
        window.sessionStorage.setItem(BRACKET_BUILDER_COMPLETION_SEEN_STORAGE_KEY, "1");
        setHasSeenCompletionThisSession(true);
      } catch {
        // Ignore storage failures and just show the CTA for this pass.
      }
      return;
    }

    showAppToast({ tone: "tip", text: t(language, "bracket.completionTitle") });
  }

  const leftBracketMatches = bracketPreviewMatches.slice(0, 8);
  const rightBracketMatches = bracketPreviewMatches.slice(8, 16);
  const leftBracketLayout = getBracketLayout(leftBracketMatches.length);
  const rightBracketLayout = getBracketLayout(rightBracketMatches.length);

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();

    activeGroupTeams.forEach((team) => {
      const row = groupRowRefs.current.get(team.id);
      if (!row) {
        return;
      }

      const nextTop = row.getBoundingClientRect().top;
      const previousTop = previousGroupRowTopsRef.current.get(team.id);
      nextTops.set(team.id, nextTop);

      if (previousTop === undefined || previousTop === nextTop) {
        return;
      }

      const deltaY = previousTop - nextTop;
      row.style.transition = "none";
      row.style.transform = `translateY(${deltaY}px)`;
      row.getBoundingClientRect();
      requestAnimationFrame(() => {
        row.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.transform = "translateY(0)";
      });
    });

    previousGroupRowTopsRef.current = nextTops;
  }, [activeGroupTeams]);

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();

    normalizedThirdPlaceRankings.forEach((teamId) => {
      const row = thirdPlaceRowRefs.current.get(teamId);
      if (!row) {
        return;
      }

      const nextTop = row.getBoundingClientRect().top;
      const previousTop = previousThirdPlaceRowTopsRef.current.get(teamId);
      nextTops.set(teamId, nextTop);

      if (previousTop === undefined || previousTop === nextTop) {
        return;
      }

      const deltaY = previousTop - nextTop;
      row.style.transition = "none";
      row.style.transform = `translateY(${deltaY}px)`;
      row.getBoundingClientRect();
      requestAnimationFrame(() => {
        row.style.transition = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.transform = "translateY(0)";
      });
    });

    previousThirdPlaceRowTopsRef.current = nextTops;
  }, [normalizedThirdPlaceRankings]);

  if (showCompletionScreen) {
    return (
      <div className="pb-6 pt-3">
        <section className="mx-auto w-full max-w-xl rounded-[2rem] border border-accent-light bg-white px-6 py-10 text-center shadow-soft">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-light text-accent-dark">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-3xl font-black text-gray-950">{t(language, "bracket.completionTitle")}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
            {t(language, "bracket.completionBody")}
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <ActionButton fullWidth onClick={() => setShowCompletionScreen(false)}>
              {t(language, "bracket.stayHere")}
            </ActionButton>
            <ActionButton fullWidth tone="accent" onClick={() => router.push("/dashboard")}>
              <span className="block w-full text-center">{t(language, "common.home")}</span>
            </ActionButton>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 pb-4">
      {customDragGhost && customDragGhostTeam ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[100] grid grid-cols-[1.55rem_2.2rem_minmax(0,1fr)] items-center gap-x-1 rounded-[1rem] border border-accent/30 bg-white/95 px-2 py-1.5 text-gray-950 shadow-2xl shadow-black/20 ring-1 ring-white/70 backdrop-blur-sm"
          style={{
            left: customDragGhost.x - customDragGhost.offsetX,
            top: customDragGhost.y - customDragGhost.offsetY,
            width: customDragGhost.width,
            minHeight: customDragGhost.height,
            transform: "scale(1.025)",
            transformOrigin: `${customDragGhost.offsetX}px ${customDragGhost.offsetY}px`
          }}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-black text-accent-text">
            {customDragGhost.kind === "group"
              ? (activeGroupTeams.findIndex((team) => team.id === customDragGhost.teamId) + 1 || "")
              : normalizedThirdPlaceRankings.indexOf(customDragGhost.teamId) + 1}
          </span>
          <span className="flex items-center justify-center text-[1.6rem] leading-none">{customDragGhostTeam.flagEmoji}</span>
          <span className="block truncate text-[11px] font-black">{customDragGhostTeam.name}</span>
        </div>
      ) : null}
      {nearDeadlineMessage ? (
        <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-4 text-center text-amber-950">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <TriangleAlert className="h-7 w-7" />
          </div>
          <p className="mt-3 text-xl font-black leading-tight">
            {t(language, "bracket.finishBeforeDeadline", { deadline: nearDeadlineMessage })}
          </p>
        </section>
      ) : null}

      {isReadOnly ? (
        <section className="rounded-[1.05rem] border border-gray-200 bg-gray-50 px-3 py-2 text-center text-[11px] font-semibold text-gray-600">
          {initialKnockoutSeeded
            ? t(language, "bracket.groupLockedSeeded")
            : t(language, "bracket.groupLockedStarted")}
        </section>
      ) : null}

      <section className={`rounded-[1rem] border px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.08em] ${isThirdPlacePhase ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
        {isComplete
          ? t(language, "bracket.topTwoQualify")
          : isThirdPlacePhase
            ? t(language, "bracket.pickThirdPlaceQualifiers", { count: requiredThirdPlaceQualifierCount })
            : t(language, "bracket.topTwoQualify")}
      </section>

      <section className="space-y-2.5 px-0 pb-0 pt-1.5">
        <div className="space-y-2">
          <div
            className={`flex items-start justify-between gap-2 select-none ${isGroupSurfaceSwiping ? "" : "transition-transform duration-200 ease-out"}`}
            style={{
              transform: groupSwipeOffsetX ? `translate3d(${groupSwipeOffsetX}px, 0, 0)` : undefined
            }}
            onTouchStart={handleGroupSwipeTouchStart}
            onTouchMove={handleGroupSwipeTouchMove}
            onTouchEnd={handleGroupSwipeTouchEnd}
          >
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black leading-tight text-gray-950 text-left">
                {activeGroupName ? formatGroupName(activeGroupName) : t(language, "dashboard.groupLabel")}
              </h1>
              {isActiveGroupScoreApplied ? (
                <div className="mt-1 space-y-1">
                  <span className="inline-flex rounded-md bg-cyan-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-900">
                    {t(language, "bracket.fromScores")}
                  </span>
                  <p className="text-[10px] font-semibold text-gray-500">{t(language, "bracket.updateGroupThroughScores")}</p>
                </div>
              ) : null}
            </div>
            <div className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${isReadOnly ? "bg-gray-100 text-gray-600" : "bg-cyan-50 text-accent-dark"}`}>
              {t(language, "common.groupCount", { count: sortedGroupNames.length })}
            </div>
          </div>
          <div className="grid grid-cols-[1.9rem_minmax(0,1fr)_1.9rem] items-center gap-0">
            <button
              type="button"
              onClick={() => goToGroup(activeGroupIndex - 1)}
              disabled={activeGroupIndex === 0}
              className="inline-flex h-8 w-[1.9rem] items-center justify-center text-accent-dark disabled:opacity-30"
              aria-label={t(language, "bracket.previousGroup")}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center justify-center">
              <div
                aria-hidden
                className="grid w-[7.6rem] grid-cols-12 gap-[2px]"
              >
                {sortedGroupNames.map((groupName, index) => {
                  const isComplete = topTwoCompletionStatus.completeGroupNames.has(groupName);
                  const isActive = index === activeGroupIndex;
                  return (
                    <span
                      key={groupName}
                      className={`h-1.5 min-w-0 ${
                        index === 0 ? "rounded-l-full" : ""
                      } ${
                        index === sortedGroupNames.length - 1 ? "rounded-r-full" : ""
                      } ${
                        isActive
                          ? "bg-accent-dark"
                          : isComplete
                            ? "bg-accent-light"
                            : "bg-gray-200"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => goToGroup(activeGroupIndex + 1)}
              disabled={activeGroupIndex === sortedGroupNames.length - 1}
              className="inline-flex h-8 w-[1.9rem] items-center justify-center text-accent-dark disabled:opacity-30"
              aria-label={t(language, "bracket.nextGroup")}
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className={`overflow-hidden rounded-[1.15rem] border border-gray-200 ${isGroupSurfaceSwiping ? "" : "transition-transform duration-200 ease-out"}`}
          style={{
            transform: groupSwipeOffsetX ? `translate3d(${groupSwipeOffsetX}px, 0, 0)` : undefined
          }}
        >
          {activeGroupTeams.map((team, index) => {
            const isTopTwo = index < 2;
            const isThirdPlaceTeam = index === 2;
            const isGroupCommitted = activeGroupName ? touchedGroups.has(activeGroupName) : false;
            const canAcceptCurrentQualifyingOrder =
              !isReadOnly && !isActiveGroupScoreApplied && Boolean(activeGroupName) && isTopTwo && !touchedGroups.has(activeGroupName);
            const isThirdPlaceQualified =
              isThirdPlacePhase &&
              hasCommittedThirdPlaceSelection &&
              isThirdPlaceTeam &&
              normalizedThirdPlaceRankings.slice(0, requiredThirdPlaceQualifierCount).includes(team.id);
            const highlightClass = isThirdPlaceQualified
              ? "bg-accent-light/40"
              : isTopTwo
                ? isGroupCommitted
                  ? "bg-accent-light/40"
                  : "bg-gray-100"
                : "bg-white";
            const teamOrder = activeGroupName ? groupRankingsByGroup.get(activeGroupName) ?? [] : [];
            const canMoveUp = !isReadOnly && !isActiveGroupScoreApplied && index > 0;
            const canMoveDown = !isReadOnly && !isActiveGroupScoreApplied && index < activeGroupTeams.length - 1;
            return (
                <div
                  data-group-team-id={team.id}
                  data-disable-group-swipe="true"
                  key={team.id}
                  ref={(node) => {
                    if (node) {
                      groupRowRefs.current.set(team.id, node);
                  } else {
                    groupRowRefs.current.delete(team.id);
                    previousGroupRowTopsRef.current.delete(team.id);
                  }
                }}
                draggable={!isReadOnly && !isActiveGroupScoreApplied && supportsNativeRowDrag}
                onPointerDown={(event) =>
                  beginCustomTouchDrag(event, "group", team.id, isReadOnly || isActiveGroupScoreApplied)
                }
                onPointerMove={handleCustomTouchDragMove}
                onPointerUp={handleCustomTouchDragEnd}
                onPointerCancel={() => clearCustomTouchDragState()}
                onDragStart={(event) => {
                  if (isReadOnly || isActiveGroupScoreApplied || !supportsNativeRowDrag) {
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", team.id);
                  setDraggedTeamId(team.id);
                }}
                onDragEnd={() => {
                  setDraggedTeamId(null);
                  setDragOverTeamId(null);
                }}
                onDragOver={(event) => {
                  if (isReadOnly || !draggedTeamId) {
                    return;
                  }
                  event.preventDefault();
                  setDragOverTeamId(team.id);
                }}
                onDragLeave={() => {
                  if (dragOverTeamId === team.id) {
                    setDragOverTeamId(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDropReorder(team.id);
                }}
                className={`grid grid-cols-[1.55rem_2.2rem_minmax(0,1fr)_3.6rem_2rem] items-center gap-x-0.5 border-b border-gray-200 px-1.5 py-1 last:border-b-0 transition-shadow select-none [-webkit-touch-callout:none] ${!supportsNativeRowDrag && !isReadOnly && !isActiveGroupScoreApplied ? "[touch-action:none]" : "[touch-action:manipulation]"} ${highlightClass} ${dragOverTeamId === team.id ? "ring-1 ring-accent ring-inset" : ""} ${draggedTeamId === team.id ? "z-10 shadow-md opacity-40" : ""} ${isReadOnly || isActiveGroupScoreApplied || !supportsNativeRowDrag ? "" : "cursor-grab active:cursor-grabbing"}`}
              >
                <div className="flex justify-start pl-1">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-black text-accent-text">
                    {index + 1}
                  </span>
                </div>
                <div className="flex items-center justify-center px-1.5">
                  <span aria-hidden className="text-[1.6rem] leading-none">{team.flagEmoji}</span>
                </div>
                <div className="min-w-0">
                  {canAcceptCurrentQualifyingOrder && activeGroupName ? (
                    <button
                      type="button"
                      onClick={() => acceptCurrentGroupRanking(activeGroupName)}
                      data-no-row-drag="true"
                      className="block w-full truncate text-left text-[11px] font-black text-gray-950"
                      aria-label={`Accept ${team.name} in ${index + 1}${index === 0 ? "st" : "nd"} place`}
                    >
                      {team.name}
                    </button>
                  ) : (
                    <span className="block truncate text-[11px] font-black text-gray-950">{team.name}</span>
                  )}
                </div>
                  <div className="flex items-center justify-end">
                    <div className="grid grid-cols-2 overflow-hidden rounded-[0.9rem] border border-gray-200 bg-white">
                      <button
                        type="button"
                        draggable={false}
                      data-no-row-drag="true"
                      aria-label={t(language, "bracket.moveTeamUp", { teamName: team.name })}
                      disabled={!canMoveUp}
                      onClick={() => activeGroupName && updateGroupRanking(activeGroupName, moveItem(teamOrder, index, -1))}
                        className="inline-flex h-7 w-7 items-center justify-center border-r border-gray-200 text-accent-dark disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        <ChevronUp className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        draggable={false}
                        data-no-row-drag="true"
                      aria-label={t(language, "bracket.moveTeamDown", { teamName: team.name })}
                      disabled={!canMoveDown}
                      onClick={() => activeGroupName && updateGroupRanking(activeGroupName, moveItem(teamOrder, index, 1))}
                        className="inline-flex h-7 w-7 items-center justify-center text-accent-dark disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        <ChevronDown className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <span
                      aria-hidden
                      className={`inline-flex h-7 w-7 items-center justify-center text-gray-400 ${isReadOnly ? "opacity-60" : ""}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  </div>
              </div>
            );
          })}
        </div>

        {isThirdPlacePhase ? (
          <div className="rounded-[1rem] border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[10px] font-bold leading-snug text-amber-900">
            <span className="block">{t(language, "bracket.thirdPlaceRuleInfo", { count: requiredThirdPlaceQualifierCount })}</span>
            <span className="block">{t(language, "bracket.thirdPlaceRulePickBelow")}</span>
          </div>
        ) : null}

        {isThirdPlacePhase ? (
          <div className="rounded-[1.15rem] border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent-dark">{t(language, "bracket.thirdPlaceQualifiers")}</p>
              <InlineDisclosureButton
                isOpen={isThirdPlaceListOpen}
                onClick={() => setIsThirdPlaceListOpen((current) => !current)}
                variant="subtle"
              />
            </div>
            {isThirdPlaceListOpen ? <div className="mt-3 space-y-1.5">
              {normalizedThirdPlaceRankings.map((teamId, index) => {
                const team = teamsById.get(teamId);
                if (!team) {
                  return null;
                }

                const isAboveCutoff = hasCommittedThirdPlaceSelection && index < requiredThirdPlaceQualifierCount;
                return (
                  <div
                    data-third-team-id={team.id}
                    data-disable-group-swipe="true"
                    key={team.id}
                    ref={(node) => {
                      if (node) {
                        thirdPlaceRowRefs.current.set(team.id, node);
                      } else {
                        thirdPlaceRowRefs.current.delete(team.id);
                        previousThirdPlaceRowTopsRef.current.delete(team.id);
                      }
                    }}
                    draggable={!isReadOnly && supportsNativeRowDrag}
                    onPointerDown={(event) => beginCustomTouchDrag(event, "third", team.id, isReadOnly)}
                    onPointerMove={handleCustomTouchDragMove}
                    onPointerUp={handleCustomTouchDragEnd}
                    onPointerCancel={() => clearCustomTouchDragState()}
                    onDragStart={(event) => {
                      if (isReadOnly || !supportsNativeRowDrag) {
                        return;
                      }
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", team.id);
                      setDraggedThirdPlaceTeamId(team.id);
                    }}
                    onDragEnd={() => {
                      setDraggedThirdPlaceTeamId(null);
                      setDragOverThirdPlaceTeamId(null);
                    }}
                    onDragOver={(event) => {
                      if (isReadOnly || !draggedThirdPlaceTeamId) {
                        return;
                      }
                      event.preventDefault();
                      setDragOverThirdPlaceTeamId(team.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverThirdPlaceTeamId === team.id) {
                        setDragOverThirdPlaceTeamId(null);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDropThirdPlaceReorder(team.id);
                    }}
                  >
                    {index === requiredThirdPlaceQualifierCount ? (
                      <div className="pb-1 pt-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-rose-600">
                        {t(language, "bracket.cutoff")}
                      </div>
                    ) : null}
                    <div className={`grid grid-cols-[1.7rem_minmax(0,1fr)_3.6rem_2.1rem] items-center gap-1 rounded-[1rem] border px-2 py-1 transition-shadow select-none [-webkit-touch-callout:none] ${!supportsNativeRowDrag && !isReadOnly ? "[touch-action:none]" : "[touch-action:manipulation]"} ${isAboveCutoff ? "border-accent-light bg-accent-light/40" : "border-gray-200 bg-gray-100"} ${dragOverThirdPlaceTeamId === team.id ? "ring-1 ring-accent ring-inset" : ""} ${draggedThirdPlaceTeamId === team.id ? "z-10 shadow-md opacity-40" : ""} ${isReadOnly || !supportsNativeRowDrag ? "" : "cursor-grab active:cursor-grabbing"}`}>
                      <div className="flex justify-start">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-black text-accent-text">
                          {index + 1}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span aria-hidden className="text-[1.6rem] leading-none">{team.flagEmoji}</span>
                          <span className="truncate text-xs font-black text-gray-950">{team.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <div className="grid grid-cols-2 overflow-hidden rounded-[0.9rem] border border-gray-200 bg-white">
                          <button
                            type="button"
                            draggable={false}
                            data-no-row-drag="true"
                            disabled={isReadOnly || index === 0}
                            onClick={() => moveThirdPlaceTeam(index, -1)}
                            className="inline-flex h-7 w-7 items-center justify-center border-r border-gray-200 text-accent-dark disabled:cursor-not-allowed disabled:text-gray-300"
                            aria-label={t(language, "bracket.moveTeamUp", { teamName: team.name })}
                          >
                            <ChevronUp className="h-4.5 w-4.5" />
                          </button>
                          <button
                            type="button"
                            draggable={false}
                            data-no-row-drag="true"
                            disabled={isReadOnly || index === normalizedThirdPlaceRankings.length - 1}
                            onClick={() => moveThirdPlaceTeam(index, 1)}
                            className="inline-flex h-7 w-7 items-center justify-center text-accent-dark disabled:cursor-not-allowed disabled:text-gray-300"
                            aria-label={t(language, "bracket.moveTeamDown", { teamName: team.name })}
                          >
                            <ChevronDown className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-center">
                        <span
                          aria-hidden
                          className={`inline-flex h-8 w-8 items-center justify-center text-gray-400 ${isReadOnly ? "opacity-60" : ""}`}
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div> : null}
            <div className="mt-3">
              <ActionButton
                fullWidth
                tone={isFinishButtonQuiet ? "neutral" : isComplete ? "accent" : "neutral"}
                disabled={isReadOnly || !isComplete || isFinalizingBracket || isFinishButtonQuiet}
                onClick={handleFinalizeBracket}
              >
                {isFinalizingBracket
                  ? t(language, "bracket.finishingBracket")
                  : isFinishButtonQuiet && finalBracketSavedAt
                    ? t(language, "bracket.savedAt", { time: formatSavedTimeLabel(finalBracketSavedAt, language) })
                    : t(language, "bracket.finishBracket")}
              </ActionButton>
            </div>
          </div>
        ) : null}
      </section>

      <section className="px-0 pt-3 pb-0">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">{t(language, "bracket.projectedBracket")}</p>
        </div>

        <div className="mt-2 px-0 py-2">
          <div className="mx-auto grid max-w-[22rem] grid-cols-[minmax(0,1fr)_0.5rem_minmax(0,1fr)] gap-0">
            <div className="relative" style={{ height: `${leftBracketLayout.totalHeight}px` }}>
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 160 ${leftBracketLayout.totalHeight}`}
                preserveAspectRatio="none"
              >
                {leftBracketLayout.rounds.map((round, roundIndex) => {
                  if (roundIndex === leftBracketLayout.rounds.length - 1) {
                    return null;
                  }
                  const xStart = 78 + roundIndex * 22;
                  const xJoin = xStart + 18;
                  const nextRound = leftBracketLayout.rounds[roundIndex + 1];
                  return round.flatMap((y, index) => {
                    const pairIndex = Math.floor(index / 2);
                    const targetY = nextRound[pairIndex];
                    return [
                      <g key={`left-${roundIndex}-${index}`} className="stroke-gray-200">
                        <line x1={xStart} y1={y} x2={xJoin} y2={y} strokeWidth="1.25" />
                        <line x1={xJoin} y1={Math.min(y, targetY)} x2={xJoin} y2={Math.max(y, targetY)} strokeWidth="1.25" />
                        <line x1={xJoin} y1={targetY} x2={xJoin + 12} y2={targetY} strokeWidth="1.25" />
                      </g>
                    ];
                  });
                })}
              </svg>
              {leftBracketMatches.map((match, index) => {
                const content = (
                  <>
                    {[match.home, match.away].map((side, sideIndex) => (
                      <div
                        key={`${match.matchId}-${sideIndex}`}
                        className={`grid min-h-[16px] grid-cols-[1.15rem_minmax(0,1fr)] items-center gap-1.5 px-1 py-0 ${side.teamId ? "text-gray-900" : "text-gray-400"}`}
                      >
                        <span aria-hidden className="text-xs">{side.flagEmoji ?? " "}</span>
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="truncate text-[11px] font-black">
                            {side.shortLabel}
                          </span>
                          {side.slotComparisonState === "match" ? (
                            <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark" />
                          ) : side.slotComparisonState === "miss" ? (
                            <X aria-hidden className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                          ) : null}
                        </span>
                      </div>
                    ))}
                  </>
                );

                const sharedClassName = `absolute left-0 right-0 block space-y-0 rounded-md px-1 py-0 transition ${canOpenProjectedKnockoutMatches ? "hover:bg-gray-50" : ""}`;
                const sharedStyle = { top: `${index * leftBracketLayout.matchBlockHeight}px` };

                if (!canOpenProjectedKnockoutMatches) {
                  return (
                    <div key={match.matchId} className={sharedClassName} style={sharedStyle}>
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={match.matchId}
                    href={`/knockout?stage=${match.stage}&matchId=${match.matchId}&compare=projected${onboardingQuery}`}
                    onClick={primeKnockoutProjectedCompareView}
                    className={sharedClassName}
                    style={sharedStyle}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>

            <div aria-hidden />

            <div className="relative" style={{ height: `${rightBracketLayout.totalHeight}px` }}>
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 160 ${rightBracketLayout.totalHeight}`}
                preserveAspectRatio="none"
              >
                {rightBracketLayout.rounds.map((round, roundIndex) => {
                  if (roundIndex === rightBracketLayout.rounds.length - 1) {
                    return null;
                  }
                  const xStart = 82 - roundIndex * 22;
                  const xJoin = xStart - 18;
                  const nextRound = rightBracketLayout.rounds[roundIndex + 1];
                  return round.flatMap((y, index) => {
                    const pairIndex = Math.floor(index / 2);
                    const targetY = nextRound[pairIndex];
                    return [
                      <g key={`right-${roundIndex}-${index}`} className="stroke-gray-200">
                        <line x1={xStart} y1={y} x2={xJoin} y2={y} strokeWidth="1.25" />
                        <line x1={xJoin} y1={Math.min(y, targetY)} x2={xJoin} y2={Math.max(y, targetY)} strokeWidth="1.25" />
                        <line x1={xJoin} y1={targetY} x2={xJoin - 12} y2={targetY} strokeWidth="1.25" />
                      </g>
                    ];
                  });
                })}
              </svg>
              {rightBracketMatches.map((match, index) => {
                const content = (
                  <>
                    {[match.home, match.away].map((side, sideIndex) => (
                      <div
                        key={`${match.matchId}-${sideIndex}`}
                        className={`grid min-h-[16px] grid-cols-[minmax(0,1fr)_1.15rem] items-center gap-1.5 px-1 py-0 text-right ${side.teamId ? "text-gray-900" : "text-gray-400"}`}
                      >
                        <span className="inline-flex min-w-0 items-center justify-end gap-1">
                          {side.slotComparisonState === "match" ? (
                            <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark" />
                          ) : side.slotComparisonState === "miss" ? (
                            <X aria-hidden className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                          ) : null}
                          <span className="truncate text-[11px] font-black">
                            {side.shortLabel}
                          </span>
                        </span>
                        <span aria-hidden className="text-xs">{side.flagEmoji ?? " "}</span>
                      </div>
                    ))}
                  </>
                );

                const sharedClassName = `absolute left-0 right-0 block space-y-0 rounded-md px-1 py-0 transition ${canOpenProjectedKnockoutMatches ? "hover:bg-gray-50" : ""}`;
                const sharedStyle = { top: `${index * rightBracketLayout.matchBlockHeight}px` };

                if (!canOpenProjectedKnockoutMatches) {
                  return (
                    <div key={match.matchId} className={sharedClassName} style={sharedStyle}>
                      {content}
                    </div>
                  );
                }

                return (
                  <Link
                    key={match.matchId}
                    href={`/knockout?stage=${match.stage}&matchId=${match.matchId}&compare=projected${onboardingQuery}`}
                    onClick={primeKnockoutProjectedCompareView}
                    className={sharedClassName}
                    style={sharedStyle}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
            {fullScoresEnabled ? t(language, "bracket.pickScoresEarnMorePoints") : t(language, "bracket.finishGroupThenKnockout")}
          </p>
          <div className={`grid gap-3 ${fullScoresEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
          <ActionButton fullWidth disabled={!canAdvanceFromEasyBracket} onClick={() => router.push("/dashboard")}>
            {t(language, "common.home")}
          </ActionButton>
          {fullScoresEnabled ? (
            <ActionButton fullWidth tone="accent" disabled={!canAdvanceFromEasyBracket} onClick={handleGoToFullScoring}>
              {t(language, "bracket.pickFullScores")}
            </ActionButton>
          ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
