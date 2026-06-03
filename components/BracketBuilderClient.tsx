"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type SetStateAction, type TouchEvent, type WheelEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, GitFork, GripVertical, TriangleAlert, X } from "lucide-react";
import { saveLightSeedBuilderAction } from "@/app/groups/actions";
import { ActionButton, InlineDisclosureButton } from "@/components/player-management/Shared";
import { useAppLanguage } from "@/lib/app-language";
import { showAppToast } from "@/lib/app-toast";
import { formatDate, formatNumber, formatTime } from "@/lib/i18n-format";
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
import {
  calculateScenarioImpactFromProjectedMatches,
  formatSignedScenarioDelta,
  getScenarioSlotId
} from "@/lib/group-stage-scenario-impact";
import {
  getPickProbabilityForTeam,
  type PickProbabilityResult
} from "@/lib/group-pick-probability";
import type { KnockoutBracketEditorView } from "@/lib/bracket-predictions";
import type { MatchWithTeams, Team } from "@/lib/types";
import { getLocalGroupMatches } from "@/lib/group-matches";
import { t } from "@/lib/strings";
import { getTeamRating } from "@/lib/team-strength";
import {
  GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY,
  type UnsavedGroupStageDraft
} from "@/lib/group-stage-unsaved-draft";
import { useSessionViewState } from "@/lib/session-view-state";

type RankedTeam = {
  id: string;
  name: string;
  shortName: string;
  groupName: string;
  fifaRank: number;
  fifaPoints: number | null | undefined;
  flagEmoji: string;
};

type BracketBuilderClientProps = {
  initialMatches?: MatchWithTeams[];
  initialKnockoutSeeded?: boolean;
  initialSnapshot?: LightSeedBuilderSnapshot | null;
  hasSavedSnapshot?: boolean;
  initialGroupProjectionSources?: Record<string, UserGroupProjectionSource>;
  initialFinalBracketSavedAt?: string | null;
  initialGroupStageNeedsSave?: boolean;
  initialGroupStageChangedAt?: string | null;
  requiredThirdPlaceQualifierCount?: number;
  roundOf32Placeholders: KnockoutPlaceholderMatch[];
  groupStageDueAt?: string | null;
  knockoutProjectedPreview?: KnockoutBracketEditorView | null;
  fullScoresEnabled?: boolean;
  userId?: string | null;
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
  sourceLabel: string | null;
  slotComparisonState: "match" | "miss" | null;
};

type BracketPreviewMatch = {
  matchId: string;
  stage: string;
  home: BracketPreviewSide;
  away: BracketPreviewSide;
};

type BracketChangeDetails = {
  title: string;
  ariaLabel: string;
  rows: Array<{
    label: string;
    value: string;
  }>;
};

type GroupStageViewState = {
  activeGroupName: string;
  isThirdPlaceListOpen: boolean;
};

type TopTwoSlotDraft = {
  firstTeamId: string | null;
  secondTeamId: string | null;
};

const KNOCKOUT_COMPARE_VIEW_STATE_STORAGE_KEY = "knockout-compare-view-state";
const BRACKET_BUILDER_COMPLETION_SEEN_STORAGE_KEY = "bracket-builder-completion-seen";

const SWIPE_THRESHOLD_PX = 42;
const GROUP_SWIPE_EXIT_MS = 190;
const GROUP_SWIPE_WHEEL_COOLDOWN_MS = 760;
const NEAR_DEADLINE_WINDOW_MS = 48 * 60 * 60 * 1000;
const CUSTOM_TOUCH_DRAG_HOLD_MS = 245;
const CUSTOM_TOUCH_DRAG_HANDLE_HOLD_MS = 120;
const CUSTOM_TOUCH_DRAG_MOVE_HOLD_MS = 165;
const CUSTOM_TOUCH_DRAG_MOVE_THRESHOLD_PX = 28;
const CUSTOM_TOUCH_DRAG_HANDLE_MOVE_THRESHOLD_PX = 16;
const GROUP_TOP_SLOT_DROP_ID_PREFIX = "group-top-slot-";
const GROUP_AVAILABLE_POOL_DROP_ID = "group-available-pool";
const THIRD_PLACE_OPEN_SLOT_DROP_ID_PREFIX = "third-place-open-slot-";

const DEFAULT_GROUP_STAGE_VIEW_STATE: GroupStageViewState = {
  activeGroupName: "",
  isThirdPlaceListOpen: false
};

function validateGroupStageViewState(value: unknown): GroupStageViewState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<GroupStageViewState>;
  return {
    activeGroupName:
      typeof candidate.activeGroupName === "string"
        ? normalizeGroupKey(candidate.activeGroupName) ?? candidate.activeGroupName
        : "",
    isThirdPlaceListOpen: Boolean(candidate.isThirdPlaceListOpen)
  };
}

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

function clearUnsavedGroupStageDraft() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage failures. The server save remains the source of truth.
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function SelectionProbabilityBadge({
  probability,
  language
}: {
  probability: number | null | undefined;
  language?: string | null;
}) {
  if (probability === null || probability === undefined) {
    return null;
  }

  const normalizedProbability = clampNumber(Math.round(probability), 0, 100);

  return (
    <span
      className="group-stage-probability-badge inline-flex shrink-0 items-center gap-1 font-normal leading-none text-gray-500 sm:gap-1.5"
      aria-label={`${normalizedProbability}%`}
      title={`${normalizedProbability}%`}
    >
      <span>{formatNumber(normalizedProbability, language)}%</span>
      <span
        aria-hidden
        className="group-stage-probability-ring inline-flex shrink-0 rounded-full"
        style={{
          background: `conic-gradient(rgb(var(--app-accent-rgb)) ${normalizedProbability * 3.6}deg, #f3f4f6 0deg)`
        }}
      />
    </span>
  );
}

function ThirdPlaceAdvanceProbabilityBadge({
  pickProbability,
  language
}: {
  pickProbability: PickProbabilityResult | null;
  language?: string | null;
}) {
  if (!pickProbability || pickProbability.probability === null) {
    return <span className="text-[10px] font-semibold tabular-nums text-gray-300">—</span>;
  }

  const normalizedProbability = clampNumber(Math.round(pickProbability.probability), 0, 100);
  const label =
    pickProbability.mode === "advance_via_third"
      ? t(language, "dashboard.pickProbabilityViaThirdCompact")
      : t(language, "dashboard.pickProbabilityAdvanceCompact");

  return (
    <span
      className="group-stage-probability-badge inline-flex shrink-0 items-center gap-1 font-normal leading-none text-gray-500 sm:gap-1.5"
      aria-hidden
    >
      <span
        aria-hidden
        className="group-stage-probability-ring inline-flex shrink-0 rounded-full"
        style={{
          background: `conic-gradient(rgb(var(--app-accent-rgb)) ${normalizedProbability * 3.6}deg, #f3f4f6 0deg)`
        }}
      />
      <span className="whitespace-nowrap">
        {formatNumber(normalizedProbability, language)}% {label}
      </span>
    </span>
  );
}

function BracketChangePopover({
  details,
  align
}: {
  details: BracketChangeDetails;
  align: "left" | "right";
}) {
  return (
    <div
      data-bracket-change-popover="true"
      role="dialog"
      aria-label={details.ariaLabel}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className={`absolute top-full z-30 mt-1 w-36 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left shadow-lg shadow-gray-950/10 ${align === "right" ? "right-0" : "left-0"}`}
    >
      <p className="mb-1 text-[8px] font-black uppercase tracking-[0.12em] text-accent-dark">
        {details.title}
      </p>
      <dl className="space-y-0.5">
        {details.rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[2.65rem_minmax(0,1fr)] gap-1">
            <dt className="truncate text-[8px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              {row.label}
            </dt>
            <dd className="truncate text-[9px] font-bold text-gray-800">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function cloneLightSeedBuilderSnapshot(snapshot: LightSeedBuilderSnapshot): LightSeedBuilderSnapshot {
  return {
    groupRankings: snapshot.groupRankings.map((ranking) => ({
      groupName: normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
      rankedTeamIds: [...ranking.rankedTeamIds]
    })),
    thirdPlaceRankings: snapshot.thirdPlaceRankings.map((ranking) => ({
      teamId: ranking.teamId,
      rank: ranking.rank
    }))
  };
}

function getRankedThirdPlaceTeamIds(snapshot: LightSeedBuilderSnapshot) {
  return snapshot.thirdPlaceRankings
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((ranking) => ranking.teamId);
}

function haveSameOrderedIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((teamId, index) => teamId === right[index]);
}

function haveSameGroupRankings(
  currentRankings: GroupSeedRankingInput[],
  savedRankings: LightSeedBuilderSnapshot["groupRankings"]
) {
  const currentByGroup = new Map(
    currentRankings.map((ranking) => [
      normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
      ranking.rankedTeamIds
    ])
  );
  const savedByGroup = new Map(
    savedRankings.map((ranking) => [
      normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
      ranking.rankedTeamIds
    ])
  );

  if (currentByGroup.size !== savedByGroup.size) {
    return false;
  }

  for (const [groupName, savedTeamIds] of savedByGroup) {
    const currentTeamIds = currentByGroup.get(groupName);
    if (!currentTeamIds || !haveSameOrderedIds(currentTeamIds, savedTeamIds)) {
      return false;
    }
  }

  return true;
}

function hasLightSeedBuilderSnapshotChanges({
  currentGroupRankings,
  currentThirdPlaceTeamIds,
  savedSnapshot
}: {
  currentGroupRankings: GroupSeedRankingInput[];
  currentThirdPlaceTeamIds: string[];
  savedSnapshot: LightSeedBuilderSnapshot | null;
}) {
  if (!savedSnapshot) {
    return false;
  }

  return (
    !haveSameGroupRankings(currentGroupRankings, savedSnapshot.groupRankings) ||
    !haveSameOrderedIds(currentThirdPlaceTeamIds, getRankedThirdPlaceTeamIds(savedSnapshot))
  );
}

function getDragTransferTeamId(event: DragEvent<HTMLElement>) {
  return (
    event.dataTransfer.getData("application/x-pickit-team-id") ||
    event.dataTransfer.getData("text/plain") ||
    null
  );
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
  initialFinalBracketSavedAt = null,
  initialGroupStageNeedsSave = false,
  initialGroupStageChangedAt = null,
  requiredThirdPlaceQualifierCount = 0,
  roundOf32Placeholders,
  groupStageDueAt = null,
  knockoutProjectedPreview = null,
  fullScoresEnabled = true,
  userId = null,
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
  const hasRestoredUnsavedDraftRef = useRef(false);
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
    startedAt: number;
    isHandleDrag: boolean;
    isDragging: boolean;
    isGroupSwipe: boolean;
    targetId: string;
    tapAction?: "select-next";
  } | null>(null);
  const committedSnapshotRef = useRef<LightSeedBuilderSnapshot | null>(
    initialSnapshot && hasSavedSnapshot && !initialGroupStageNeedsSave
      ? cloneLightSeedBuilderSnapshot(initialSnapshot)
      : null
  );
  const committedSnapshotIsFinalRef = useRef(Boolean(initialFinalBracketSavedAt && committedSnapshotRef.current));
  const groupRowRefs = useRef(new Map<string, HTMLDivElement>());
  const previousGroupRowTopsRef = useRef(new Map<string, number>());
  const thirdPlaceRowRefs = useRef(new Map<string, HTMLDivElement>());
  const previousThirdPlaceRowTopsRef = useRef(new Map<string, number>());
  const bracketPreviewRef = useRef<HTMLElement | null>(null);
  const bracketImpactHighlightTimeoutRef = useRef<number | null>(null);
  const draggedTeamIdRef = useRef<string | null>(null);
  const draggedThirdPlaceTeamIdRef = useRef<string | null>(null);
  const thirdPlaceSectionRef = useRef<HTMLDivElement | null>(null);
  const previousThirdPlacePhaseRef = useRef(false);
  const groupSwipeAnimationTimeoutRef = useRef<number | null>(null);
  const groupSwipeWheelDeltaRef = useRef(0);
  const groupSwipeWheelResetTimeoutRef = useRef<number | null>(null);
  const groupSwipeWheelCooldownTimeoutRef = useRef<number | null>(null);
  const groupSwipeWheelIsCoolingDownRef = useRef(false);
  const hasAppliedGroupStageViewRestoreRef = useRef(false);
  const hasAppliedThirdPlaceListDefaultRef = useRef(false);
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
  const [topTwoSlotDraftsByGroup, setTopTwoSlotDraftsByGroup] = useState<Record<string, TopTwoSlotDraft>>({});
  const [thirdPlaceRankings, setThirdPlaceRankings] = useState<string[]>(
    initialSnapshot?.thirdPlaceRankings?.length
      ? [...initialSnapshot.thirdPlaceRankings].sort((left, right) => left.rank - right.rank).map((row) => row.teamId)
      : []
  );
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [touchedGroups, setTouchedGroups] = useState<Set<string>>(persistedGroupKeys);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, setSaveMessage] = useState("");
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [draggedTeamId, setDraggedTeamId] = useState<string | null>(null);
  const [dragOverTeamId, setDragOverTeamId] = useState<string | null>(null);
  const [draggedThirdPlaceTeamId, setDraggedThirdPlaceTeamId] = useState<string | null>(null);
  const [dragOverThirdPlaceTeamId, setDragOverThirdPlaceTeamId] = useState<string | null>(null);
  const [customDragGhost, setCustomDragGhost] = useState<CustomDragGhost | null>(null);
  const [topTwoAnnouncement, setTopTwoAnnouncement] = useState("");
  const [thirdPlaceReplacementCandidateId, setThirdPlaceReplacementCandidateId] = useState<string | null>(null);
  const [highlightedScenarioSlotIds, setHighlightedScenarioSlotIds] = useState<Set<string>>(() => new Set());
  const [openBracketChangeSlotId, setOpenBracketChangeSlotId] = useState<string | null>(null);
  const [groupSwipeOffsetX, setGroupSwipeOffsetX] = useState(0);
  const [isGroupSurfaceSwiping, setIsGroupSurfaceSwiping] = useState(false);
  const [supportsNativeRowDrag, setSupportsNativeRowDrag] = useState(false);
  const [groupStageViewState, setGroupStageViewState, groupStageViewStateMeta] = useSessionViewState<GroupStageViewState>({
    key: "group-stage",
    userId,
    defaultValue: DEFAULT_GROUP_STAGE_VIEW_STATE,
    validate: validateGroupStageViewState
  });
  const isThirdPlaceListOpen = groupStageViewState.isThirdPlaceListOpen;
  const setIsThirdPlaceListOpen = useCallback(
    (nextValue: SetStateAction<boolean>) => {
      setGroupStageViewState((current) => {
        const nextIsOpen =
          typeof nextValue === "function" ? nextValue(current.isThirdPlaceListOpen) : nextValue;
        return current.isThirdPlaceListOpen === nextIsOpen
          ? current
          : { ...current, isThirdPlaceListOpen: nextIsOpen };
      });
    },
    [setGroupStageViewState]
  );
  const [groupProjectionSources, setGroupProjectionSources] = useState<Record<string, UserGroupProjectionSource>>(initialGroupProjectionSources);
  const [isFinalizingBracket, setIsFinalizingBracket] = useState(false);
  const [isRestoringBracket, setIsRestoringBracket] = useState(false);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [finalBracketSavedAt, setFinalBracketSavedAt] = useState<string | null>(
    initialGroupStageNeedsSave ? null : initialFinalBracketSavedAt
  );
  const [committedBracketSavedAt, setCommittedBracketSavedAt] = useState<string | null>(initialFinalBracketSavedAt);
  const [changedSinceAt, setChangedSinceAt] = useState<string | null>(
    initialGroupStageNeedsSave ? initialGroupStageChangedAt : null
  );
  const [hasTouchedThirdPlaceRanking, setHasTouchedThirdPlaceRanking] = useState(
    (initialSnapshot?.thirdPlaceRankings?.length ?? 0) >= requiredThirdPlaceQualifierCount &&
      requiredThirdPlaceQualifierCount > 0
  );
  const [hasSeenCompletionThisSession, setHasSeenCompletionThisSession] = useState(Boolean(initialFinalBracketSavedAt));
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
            fifaRank: team.fifaRank,
            fifaPoints: team.fifaPoints,
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

  const topTwoCompletionRankings = useMemo(
    () =>
      groupRankings.map((ranking) => {
        const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
        const draft = topTwoSlotDraftsByGroup[groupName];
        return draft
          ? {
              ...ranking,
              rankedTeamIds: [draft.firstTeamId ?? "", draft.secondTeamId ?? ""]
            }
          : ranking;
      }),
    [groupRankings, topTwoSlotDraftsByGroup]
  );
  const topTwoCompletionTouchedGroups = useMemo(() => {
    const draftGroupNames = Object.keys(topTwoSlotDraftsByGroup);
    if (draftGroupNames.length === 0) {
      return touchedGroups;
    }

    const next = new Set(touchedGroups);
    for (const groupName of draftGroupNames) {
      next.add(groupName);
    }
    return next;
  }, [topTwoSlotDraftsByGroup, touchedGroups]);
  const topTwoCompletionStatus = useMemo(
    () =>
      getGroupTopTwoCompletionStatus({
        groupNames: sortedGroupNames,
        rankings: topTwoCompletionRankings,
        teamIdsByGroup,
        touchedGroupNames: topTwoCompletionTouchedGroups
      }),
    [sortedGroupNames, teamIdsByGroup, topTwoCompletionRankings, topTwoCompletionTouchedGroups]
  );
  const hasIncompleteTopTwoDraft = useMemo(
    () =>
      Object.values(topTwoSlotDraftsByGroup).some(
        (draft) => !draft.firstTeamId || !draft.secondTeamId
      ),
    [topTwoSlotDraftsByGroup]
  );
  const incompleteTopTwoDraftGroupNames = useMemo(
    () =>
      new Set(
        Object.entries(topTwoSlotDraftsByGroup)
          .filter(([, draft]) => !draft.firstTeamId || !draft.secondTeamId)
          .map(([groupName]) => groupName)
      ),
    [topTwoSlotDraftsByGroup]
  );

  const derivedThirdPlacePool = useMemo(
    () =>
      sortedGroupNames
        .map((groupName) => {
          if (!topTwoCompletionStatus.completeGroupNames.has(groupName)) {
            return null;
          }
          const rankedTeamIds = groupRankingsByGroup.get(groupName) ?? [];
          const thirdPlaceTeamId = rankedTeamIds[2] ?? null;
          return thirdPlaceTeamId ? teamsById.get(thirdPlaceTeamId) ?? null : null;
        })
        .filter((team): team is RankedTeam => Boolean(team)),
    [groupRankingsByGroup, sortedGroupNames, teamsById, topTwoCompletionStatus.completeGroupNames]
  );
  const derivedThirdPlacePoolIds = useMemo(
    () => new Set(derivedThirdPlacePool.map((team) => team.id)),
    [derivedThirdPlacePool]
  );
  const usesExplicitThirdPlaceSelection =
    Boolean(initialFinalBracketSavedAt) || (initialSnapshot?.thirdPlaceRankings?.length ?? 0) > 0;
  const explicitThirdPlaceSelectionIds = useMemo(
    () => Array.from(new Set(thirdPlaceRankings.filter((teamId) => derivedThirdPlacePoolIds.has(teamId)))),
    [derivedThirdPlacePoolIds, thirdPlaceRankings]
  );

  const normalizedThirdPlaceRankings = useMemo(() => {
    if (usesExplicitThirdPlaceSelection) {
      const missing = derivedThirdPlacePool
        .map((team) => team.id)
        .filter((teamId) => !explicitThirdPlaceSelectionIds.includes(teamId));
      return [...explicitThirdPlaceSelectionIds, ...missing];
    }

    const preserved = thirdPlaceRankings.filter((teamId) => derivedThirdPlacePoolIds.has(teamId));
    const missing = derivedThirdPlacePool.map((team) => team.id).filter((teamId) => !preserved.includes(teamId));
    // Freshly demoted third-place teams need immediate review, so surface them before
    // the player's existing qualifier order instead of hiding them at the bottom.
    return [...missing, ...preserved];
  }, [
    derivedThirdPlacePool,
    derivedThirdPlacePoolIds,
    explicitThirdPlaceSelectionIds,
    thirdPlaceRankings,
    usesExplicitThirdPlaceSelection
  ]);

  const hasUnlockedThirdPlacePhase = topTwoCompletionStatus.isComplete;
  const isThirdPlacePhase = hasUnlockedThirdPlacePhase && requiredThirdPlaceQualifierCount > 0;
  const shouldShowThirdPlaceCard = requiredThirdPlaceQualifierCount > 0;
  const hasCommittedThirdPlaceSelection =
    isThirdPlacePhase &&
    requiredThirdPlaceQualifierCount > 0 &&
    ((initialSnapshot?.thirdPlaceRankings?.length ?? 0) >= requiredThirdPlaceQualifierCount || hasTouchedThirdPlaceRanking);
  const committedThirdPlaceRankingIds = useMemo(
    () =>
      hasCommittedThirdPlaceSelection
        ? (usesExplicitThirdPlaceSelection ? explicitThirdPlaceSelectionIds : normalizedThirdPlaceRankings).slice(
            0,
            requiredThirdPlaceQualifierCount
          )
        : [],
    [
      explicitThirdPlaceSelectionIds,
      hasCommittedThirdPlaceSelection,
      normalizedThirdPlaceRankings,
      requiredThirdPlaceQualifierCount,
      usesExplicitThirdPlaceSelection
    ]
  );
  const openThirdPlaceQualifierSlots = Math.max(
    0,
    requiredThirdPlaceQualifierCount - committedThirdPlaceRankingIds.length
  );
  const isComplete =
    isThirdPlacePhase &&
    committedThirdPlaceRankingIds.length >= requiredThirdPlaceQualifierCount;
  const groupCompletionPercent =
    sortedGroupNames.length > 0
      ? Math.round((topTwoCompletionStatus.completeGroupNames.size / sortedGroupNames.length) * 100)
      : 0;
  const isFinishButtonQuiet =
    Boolean(finalBracketSavedAt) && isComplete && !isFinalizingBracket;
  const changedSinceLabel = changedSinceAt
    ? t(language, "bracket.changedSince", { time: formatSavedTimeLabel(changedSinceAt, language) })
    : null;
  const shouldShowThirdPlaceRuleInfo = isThirdPlacePhase && !finalBracketSavedAt;
  const finishBracketButtonLabel = isFinalizingBracket
    ? t(language, "bracket.finishingBracket")
    : isFinishButtonQuiet && finalBracketSavedAt
      ? t(language, "bracket.savedAt", { time: formatSavedTimeLabel(finalBracketSavedAt, language) })
      : t(language, "bracket.finishBracket");
  const isReadOnly = useMemo(() => {
    if (initialKnockoutSeeded) {
      return true;
    }

    if (!groupStageDueAt) {
      return false;
    }

    return new Date(groupStageDueAt).getTime() <= Date.now();
  }, [groupStageDueAt, initialKnockoutSeeded]);
  const canOpenProjectedKnockoutMatches = hasSavedSnapshot || Boolean(finalBracketSavedAt);
  const canAdvanceFromEasyBracket = hasSavedSnapshot || Boolean(finalBracketSavedAt);
  const activeGroupName = sortedGroupNames[activeGroupIndex] ?? null;
  const isActiveGroupScoreApplied = activeGroupName ? groupProjectionSources[activeGroupName] === "score_applied" : false;
  const activeGroupTeamIds = useMemo(
    () => (activeGroupName ? groupRankingsByGroup.get(activeGroupName) ?? [] : []),
    [activeGroupName, groupRankingsByGroup]
  );
  const activeGroupTeams = useMemo(
    () =>
      activeGroupTeamIds
        .map((teamId) => teamsById.get(teamId) ?? null)
        .filter((team): team is RankedTeam => Boolean(team)),
    [activeGroupTeamIds, teamsById]
  );
  const hasTouchedActiveGroup = activeGroupName ? touchedGroups.has(activeGroupName) : false;
  const activeTopTwoDraft = activeGroupName ? topTwoSlotDraftsByGroup[activeGroupName] ?? null : null;
  const shouldUseStoredActiveTopTwo =
    !activeTopTwoDraft && Boolean(activeGroupName) && (hasTouchedActiveGroup || isActiveGroupScoreApplied || isReadOnly);
  const selectedFirstTeamId = activeTopTwoDraft
    ? activeTopTwoDraft.firstTeamId
    : shouldUseStoredActiveTopTwo
      ? activeGroupTeamIds[0] ?? null
      : null;
  const selectedSecondTeamId = activeTopTwoDraft
    ? activeTopTwoDraft.secondTeamId
    : shouldUseStoredActiveTopTwo
      ? activeGroupTeamIds[1] ?? null
      : null;
  const selectedFirstTeam = selectedFirstTeamId ? teamsById.get(selectedFirstTeamId) ?? null : null;
  const selectedSecondTeam = selectedSecondTeamId ? teamsById.get(selectedSecondTeamId) ?? null : null;
  const availableGroupTeams = useMemo(
    () => activeGroupTeams.filter((team) => team.id !== selectedFirstTeamId && team.id !== selectedSecondTeamId),
    [activeGroupTeams, selectedFirstTeamId, selectedSecondTeamId]
  );
  const isActiveTopTwoComplete = Boolean(selectedFirstTeamId && selectedSecondTeamId);
  const availableGroupTeamColumnCount = Math.max(1, availableGroupTeams.length);
  const availableGroupTeamPoolMaxWidthRem = Math.min(34, Math.max(8.5, availableGroupTeamColumnCount * 8.5));

  useEffect(() => {
    if (!groupStageViewStateMeta.hasHydrated) {
      hasAppliedGroupStageViewRestoreRef.current = false;
      hasAppliedThirdPlaceListDefaultRef.current = false;
      return;
    }

    if (sortedGroupNames.length === 0) {
      return;
    }

    const queryGroup = normalizeGroupKey(searchParams.get("group"));
    const requestedGroup = queryGroup && sortedGroupNames.includes(queryGroup) ? queryGroup : null;
    if (hasAppliedGroupStageViewRestoreRef.current && !requestedGroup) {
      return;
    }

    const restoredGroup =
      !hasAppliedGroupStageViewRestoreRef.current &&
      groupStageViewState.activeGroupName &&
      sortedGroupNames.includes(groupStageViewState.activeGroupName)
        ? groupStageViewState.activeGroupName
        : null;
    const nextGroupName = requestedGroup ?? restoredGroup;

    if (!nextGroupName) {
      hasAppliedGroupStageViewRestoreRef.current = true;
      return;
    }

    const nextIndex = sortedGroupNames.indexOf(nextGroupName);
    if (nextIndex >= 0 && nextIndex !== activeGroupIndex) {
      setActiveGroupIndex(nextIndex);
    }
    hasAppliedGroupStageViewRestoreRef.current = true;
  }, [
    activeGroupIndex,
    groupStageViewState.activeGroupName,
    groupStageViewStateMeta.hasHydrated,
    searchParams,
    sortedGroupNames
  ]);

  useEffect(() => {
    if (!groupStageViewStateMeta.hasHydrated || !hasAppliedGroupStageViewRestoreRef.current || !activeGroupName) {
      return;
    }

    setGroupStageViewState((current) =>
      current.activeGroupName === activeGroupName ? current : { ...current, activeGroupName }
    );
  }, [activeGroupName, groupStageViewStateMeta.hasHydrated, setGroupStageViewState]);

  useEffect(() => {
    if (!groupStageViewStateMeta.hasHydrated) {
      return;
    }

    if (hasAppliedThirdPlaceListDefaultRef.current || groupStageViewStateMeta.hasStoredValue) {
      return;
    }

    if (isThirdPlacePhase) {
      setIsThirdPlaceListOpen(true);
      hasAppliedThirdPlaceListDefaultRef.current = true;
    }
  }, [
    groupStageViewStateMeta.hasHydrated,
    groupStageViewStateMeta.hasStoredValue,
    isThirdPlacePhase,
    setIsThirdPlaceListOpen
  ]);

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
  const saveableTouchedRankingsInput = useMemo<GroupSeedRankingInput[]>(
    () =>
      hasIncompleteTopTwoDraft
        ? touchedRankingsInput.filter(
            (ranking) =>
              !incompleteTopTwoDraftGroupNames.has(normalizeGroupKey(ranking.groupName) ?? ranking.groupName)
          )
        : touchedRankingsInput,
    [hasIncompleteTopTwoDraft, incompleteTopTwoDraftGroupNames, touchedRankingsInput]
  );
  const committedSnapshot = committedSnapshotRef.current;
  const hasRestorableBracketChanges = useMemo(
    () =>
      hasLightSeedBuilderSnapshotChanges({
        currentGroupRankings: saveableTouchedRankingsInput,
        currentThirdPlaceTeamIds: committedThirdPlaceRankingIds,
        savedSnapshot: committedSnapshot
      }),
    [committedSnapshot, committedThirdPlaceRankingIds, saveableTouchedRankingsInput]
  );
  const hasSaveableProgressChanges = Boolean(
    hasRestorableBracketChanges ||
      (!committedSnapshot && saveableTouchedRankingsInput.length > 0)
  );
  const canRestoreLastSavedBracket = Boolean(committedSnapshot) && (hasRestorableBracketChanges || hasIncompleteTopTwoDraft);
  const hasUncommittedFinalChanges = isComplete && hasRestorableBracketChanges;
  const previewRankingsInput = useMemo<GroupSeedRankingInput[]>(
    () => (hasSavedSnapshot || hasInteracted ? saveableTouchedRankingsInput : []),
    [hasInteracted, hasSavedSnapshot, saveableTouchedRankingsInput]
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
  const savedProjectedBracket = (() => {
    const committedSnapshot = committedSnapshotRef.current;
    if (!committedSnapshot) {
      return null;
    }

    const savedRankingsInput = committedSnapshot.groupRankings.map((ranking) => ({
      groupName: normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
      rankedTeamIds: ranking.rankedTeamIds
    }));
    const savedThirdPlaceTeamIds = committedSnapshot.thirdPlaceRankings
      .slice()
      .sort((left, right) => left.rank - right.rank)
      .map((ranking) => ranking.teamId);
    const savedStandings = buildProjectedGroupStandingsFromSeedRankings(teams, savedRankingsInput);

    return buildUserProjectedRoundOf32({
      groupMatches: [],
      teams,
      predictions: [],
      roundOf32Placeholders,
      standingsByGroupOverride: savedStandings,
      rankedThirdPlaceTeamIdsOverride: savedThirdPlaceTeamIds.length > 0 ? savedThirdPlaceTeamIds : null
    });
  })();
  const hasCompletedBracketOnce = Boolean(committedBracketSavedAt || finalBracketSavedAt || committedSnapshotRef.current);
  const scenarioImpact = useMemo(
    () =>
      calculateScenarioImpactFromProjectedMatches({
        savedMatches: savedProjectedBracket?.matches ?? null,
        scenarioMatches: projectedBracket.matches,
        activeGroupName,
        teamsById,
        openThirdPlaceSlots: usesExplicitThirdPlaceSelection ? openThirdPlaceQualifierSlots : 0
      }),
    [
      activeGroupName,
      openThirdPlaceQualifierSlots,
      projectedBracket.matches,
      savedProjectedBracket,
      teamsById,
      usesExplicitThirdPlaceSelection
    ]
  );
  const hasScenarioChanges = scenarioImpact.affectedPickCount > 0 || scenarioImpact.openThirdPlaceSlots > 0;
  const shouldShowScenarioImpact =
    hasCompletedBracketOnce &&
    Boolean(savedProjectedBracket) &&
    usesExplicitThirdPlaceSelection &&
    hasInteracted &&
    hasScenarioChanges;
  const showBracketImpactOverlay = shouldShowScenarioImpact;
  const scenarioAffectedSlotById = useMemo(
    () => new Map(scenarioImpact.affectedSlots.map((slot) => [slot.slotId, slot])),
    [scenarioImpact.affectedSlots]
  );
  const scenarioImpactPicksLabel = t(
    language,
    scenarioImpact.affectedPickCount === 1
      ? "bracket.scenarioPickAffected"
      : "bracket.scenarioPicksAffected",
    { count: scenarioImpact.affectedPickCount }
  );
  const scenarioImpactSummaryLabel = t(language, "bracket.scenarioImpactSummary", {
    risk: formatSignedScenarioDelta(scenarioImpact.riskDelta),
    upside: formatSignedScenarioDelta(scenarioImpact.upsideDelta),
    picksLabel: scenarioImpactPicksLabel
  });
  const scenarioImpactOpenSlotLabel = scenarioImpact.isScenarioValid
    ? null
    : t(
        language,
        scenarioImpact.openThirdPlaceSlots === 1
          ? "bracket.thirdPlacePoolOpenSlot"
          : "bracket.thirdPlacePoolOpenSlots",
        { count: scenarioImpact.openThirdPlaceSlots }
      );
  const scenarioImpactAriaLabel = t(language, "bracket.scenarioImpactAria", {
    risk: formatSignedScenarioDelta(scenarioImpact.riskDelta),
    upside: formatSignedScenarioDelta(scenarioImpact.upsideDelta),
    picksLabel: scenarioImpactPicksLabel
  });
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
          sourceLabel: match.homeSourceLabel ?? null,
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
          sourceLabel: match.awaySourceLabel ?? null,
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
          sourceLabel: match.home.sourceLabel,
          slotComparisonState: null
        },
        away: {
          teamId: awayTeam?.id ?? null,
          shortLabel: awayTeam?.shortName ?? formatProjectedSeedLabel(match.away.sourceLabel),
          flagEmoji: awayTeam?.flagEmoji ?? null,
          sourceLabel: match.away.sourceLabel,
          slotComparisonState: null
        }
      };
    });
  }, [initialKnockoutSeeded, projectedBracket.matches, projectedComparisonRound, teamsById]);

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
      setHasSeenCompletionThisSession(
        Boolean(initialFinalBracketSavedAt) ||
          window.sessionStorage.getItem(BRACKET_BUILDER_COMPLETION_SEEN_STORAGE_KEY) === "1"
      );
    } catch {
      setHasSeenCompletionThisSession(Boolean(initialFinalBracketSavedAt));
    }
  }, [initialFinalBracketSavedAt]);

  useEffect(() => {
    if (typeof window === "undefined" || isReadOnly || hasRestoredUnsavedDraftRef.current) {
      return;
    }

    hasRestoredUnsavedDraftRef.current = true;

    try {
      const rawDraft = window.sessionStorage.getItem(GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY);
      if (!rawDraft) {
        return;
      }

      const draft = JSON.parse(rawDraft) as Partial<UnsavedGroupStageDraft>;
      if (!Array.isArray(draft.groupRankings) || draft.groupRankings.length === 0) {
        return;
      }

      const changedSinceAt = typeof draft.changedSinceAt === "string" ? draft.changedSinceAt : new Date().toISOString();
      if (
        initialFinalBracketSavedAt &&
        Number.isFinite(new Date(changedSinceAt).getTime()) &&
        new Date(changedSinceAt).getTime() <= new Date(initialFinalBracketSavedAt).getTime()
      ) {
        clearUnsavedGroupStageDraft();
        return;
      }

      const draftRankingsByGroup = new Map(
        draft.groupRankings
          .filter((ranking): ranking is GroupSeedRankingInput =>
            typeof ranking?.groupName === "string" && Array.isArray(ranking.rankedTeamIds)
          )
          .map((ranking) => [
            normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
            ranking.rankedTeamIds.filter((teamId): teamId is string => typeof teamId === "string" && teamId.length > 0)
          ])
      );

      setGroupRankings(
        defaultSnapshot.groupRankings.map((ranking) => {
          const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
          const draftRankedTeamIds = draftRankingsByGroup.get(groupName);
          return draftRankedTeamIds?.length
            ? { ...ranking, rankedTeamIds: draftRankedTeamIds }
            : ranking;
        })
      );
      setThirdPlaceRankings(
        Array.isArray(draft.thirdPlaceRankings)
          ? draft.thirdPlaceRankings.filter((teamId): teamId is string => typeof teamId === "string" && teamId.length > 0)
          : []
      );
      setTopTwoSlotDraftsByGroup({});
      setTouchedGroups(
        new Set(
          Array.isArray(draft.touchedGroupNames)
            ? draft.touchedGroupNames
                .filter((groupName): groupName is string => typeof groupName === "string" && groupName.length > 0)
                .map((groupName) => normalizeGroupKey(groupName) ?? groupName)
            : Array.from(draftRankingsByGroup.keys())
        )
      );
      setHasTouchedThirdPlaceRanking(Boolean(draft.hasTouchedThirdPlaceRanking));
      setHasInteracted(true);
      setFinalBracketSavedAt(null);
      setChangedSinceAt(changedSinceAt);
      showAppToast({ tone: "tip", text: t(language, "bracket.unsavedDraftRestored") });
    } catch {
      clearUnsavedGroupStageDraft();
    }
  }, [defaultSnapshot.groupRankings, initialFinalBracketSavedAt, isReadOnly, language]);

  useEffect(() => {
    if (typeof window === "undefined" || isReadOnly || !hasInteracted || hasIncompleteTopTwoDraft) {
      return;
    }

    const draft: UnsavedGroupStageDraft = {
      groupRankings: currentRankingsInput,
      thirdPlaceRankings: usesExplicitThirdPlaceSelection ? explicitThirdPlaceSelectionIds : normalizedThirdPlaceRankings,
      touchedGroupNames: Array.from(touchedGroups),
      hasTouchedThirdPlaceRanking,
      changedSinceAt: changedSinceAt ?? new Date().toISOString()
    };

    try {
      window.sessionStorage.setItem(GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage failures. The explicit save button still persists to the server.
    }
  }, [
    changedSinceAt,
    currentRankingsInput,
    explicitThirdPlaceSelectionIds,
    hasInteracted,
    hasIncompleteTopTwoDraft,
    hasTouchedThirdPlaceRanking,
    isReadOnly,
    normalizedThirdPlaceRankings,
    touchedGroups,
    usesExplicitThirdPlaceSelection
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasInteracted || isReadOnly) {
      return;
    }

    const unsavedChangesPrompt = t(language, "bracket.unsavedChangesPrompt");
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]") ?? null;
      if (!anchor || (anchor.target && anchor.target !== "_self")) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const isSameDocument =
        nextUrl.origin === currentUrl.origin &&
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search;

      if (isSameDocument) {
        return;
      }

      if (!window.confirm(unsavedChangesPrompt)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasInteracted, isReadOnly, language]);

  useEffect(() => {
    if (!usesExplicitThirdPlaceSelection || thirdPlaceRankings.length === explicitThirdPlaceSelectionIds.length) {
      return;
    }

    setThirdPlaceRankings(explicitThirdPlaceSelectionIds);
  }, [explicitThirdPlaceSelectionIds, thirdPlaceRankings.length, usesExplicitThirdPlaceSelection]);

  useEffect(() => {
    if (!thirdPlaceReplacementCandidateId || derivedThirdPlacePoolIds.has(thirdPlaceReplacementCandidateId)) {
      return;
    }

    setThirdPlaceReplacementCandidateId(null);
  }, [derivedThirdPlacePoolIds, thirdPlaceReplacementCandidateId]);

  useEffect(() => {
    const wasThirdPlacePhase = previousThirdPlacePhaseRef.current;
    previousThirdPlacePhaseRef.current = isThirdPlacePhase;

    if (!isThirdPlacePhase || wasThirdPlacePhase || !hasInteracted || typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const target = thirdPlaceSectionRef.current;
      if (!target) {
        return;
      }

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.focus({ preventScroll: true });
      target.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion ? "auto" : "smooth"
      });
    });
  }, [hasInteracted, isThirdPlacePhase]);

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
      if (groupSwipeWheelResetTimeoutRef.current !== null) {
        window.clearTimeout(groupSwipeWheelResetTimeoutRef.current);
      }
      if (groupSwipeWheelCooldownTimeoutRef.current !== null) {
        window.clearTimeout(groupSwipeWheelCooldownTimeoutRef.current);
      }
      if (bracketImpactHighlightTimeoutRef.current !== null) {
        window.clearTimeout(bracketImpactHighlightTimeoutRef.current);
      }
      mediaQuery.removeEventListener("change", updateSupport);
    };
  }, []);

  useEffect(() => {
    if (!openBracketChangeSlotId || typeof window === "undefined") {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-bracket-change-popover]")) {
        return;
      }

      setOpenBracketChangeSlotId(null);
    }

    window.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      window.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, [openBracketChangeSlotId]);

  useEffect(() => {
    if (!showBracketImpactOverlay && openBracketChangeSlotId) {
      setOpenBracketChangeSlotId(null);
    }
  }, [openBracketChangeSlotId, showBracketImpactOverlay]);

  function clearCustomTouchDragState(options?: { preserveGroupSwipe?: boolean }) {
    if (customDragHoldTimeoutRef.current !== null) {
      window.clearTimeout(customDragHoldTimeoutRef.current);
      customDragHoldTimeoutRef.current = null;
    }
    customDragStateRef.current = null;
    draggedTeamIdRef.current = null;
    draggedThirdPlaceTeamIdRef.current = null;
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const clearStaleDragState = () => {
      clearCustomTouchDragState();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearStaleDragState();
      }
    };

    window.addEventListener("pointerup", clearStaleDragState);
    window.addEventListener("pointercancel", clearStaleDragState);
    window.addEventListener("blur", clearStaleDragState);
    window.addEventListener("pagehide", clearStaleDragState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pointerup", clearStaleDragState);
      window.removeEventListener("pointercancel", clearStaleDragState);
      window.removeEventListener("blur", clearStaleDragState);
      window.removeEventListener("pagehide", clearStaleDragState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearStaleDragState();
    };
  }, []);

  function activateCustomTouchDrag(state: NonNullable<typeof customDragStateRef.current>) {
    state.isDragging = true;
    if (state.kind === "group") {
      draggedTeamIdRef.current = state.teamId;
      setDraggedTeamId(state.teamId);
    } else {
      draggedThirdPlaceTeamIdRef.current = state.teamId;
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
    event: React.PointerEvent<HTMLElement>,
    kind: "group" | "third",
    teamId: string,
    disabled: boolean,
    tapAction?: "select-next"
  ) {
    if (supportsNativeRowDrag || disabled || event.pointerType === "mouse") {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-no-row-drag='true']")) {
      return;
    }

    const isHandleDrag = Boolean(target?.closest("[data-row-drag-handle='true']"));
    if (kind === "third" && !isHandleDrag) {
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
      startedAt: window.performance.now(),
      isHandleDrag,
      isDragging: false,
      isGroupSwipe: false,
      targetId: teamId,
      tapAction
    };

    customDragHoldTimeoutRef.current = window.setTimeout(() => {
      const state = customDragStateRef.current;
      if (!state || state.pointerId !== event.pointerId || state.teamId !== teamId || state.kind !== kind) {
        return;
      }

      activateCustomTouchDrag(state);
    }, isHandleDrag ? CUSTOM_TOUCH_DRAG_HANDLE_HOLD_MS : CUSTOM_TOUCH_DRAG_HOLD_MS);
  }

  function handleCustomTouchDragMove(event: React.PointerEvent<HTMLElement>) {
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
      const dragMoveThreshold = state.isHandleDrag
        ? CUSTOM_TOUCH_DRAG_HANDLE_MOVE_THRESHOLD_PX
        : CUSTOM_TOUCH_DRAG_MOVE_THRESHOLD_PX;
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

      if (deltaY > dragMoveThreshold || (deltaX > dragMoveThreshold && deltaY >= deltaX)) {
        const elapsedMs = window.performance.now() - state.startedAt;
        if (!state.isHandleDrag && elapsedMs < CUSTOM_TOUCH_DRAG_MOVE_HOLD_MS) {
          return;
        }

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
      const slot = element.closest<HTMLElement>("[data-group-slot-id]");
      if (slot?.dataset.groupSlotId) {
        const slotIndex = slot.dataset.groupSlotId === "1" ? "1" : "0";
        const targetId = `${GROUP_TOP_SLOT_DROP_ID_PREFIX}${slotIndex}`;
        state.targetId = targetId;
        setDragOverTeamId(targetId);
        return;
      }

      const pool = element.closest<HTMLElement>("[data-group-pool-dropzone]");
      if (pool) {
        state.targetId = GROUP_AVAILABLE_POOL_DROP_ID;
        setDragOverTeamId(GROUP_AVAILABLE_POOL_DROP_ID);
        return;
      }

      const targetRow = element.closest<HTMLElement>("[data-group-team-id]");
      const targetId = targetRow?.dataset.groupTeamId ?? state.teamId;
      state.targetId = targetId;
      setDragOverTeamId(targetId);
      return;
    }

    const openSlot = element.closest<HTMLElement>("[data-third-open-slot-id]");
    if (openSlot?.dataset.thirdOpenSlotId) {
      state.targetId = openSlot.dataset.thirdOpenSlotId;
      setDragOverThirdPlaceTeamId(openSlot.dataset.thirdOpenSlotId);
      return;
    }

    const targetRow = element.closest<HTMLElement>("[data-third-team-id]");
    const targetId = targetRow?.dataset.thirdTeamId ?? state.teamId;
    state.targetId = targetId;
    setDragOverThirdPlaceTeamId(targetId);
  }

  function handleCustomTouchDragEnd(event: React.PointerEvent<HTMLElement>) {
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
      if (kind === "group" && state.tapAction === "select-next") {
        selectGroupTeamIntoNextOpenSlot(state.teamId);
        clearCustomTouchDragState();
        return;
      }

      if (kind === "third") {
        acceptCurrentThirdPlaceRanking();
      }
      clearCustomTouchDragState();
      return;
    }

    if (kind === "group") {
      handleDropReorder(targetId);
    } else if (targetId.startsWith(THIRD_PLACE_OPEN_SLOT_DROP_ID_PREFIX)) {
      handleDropThirdPlaceOpenSlot();
    } else {
      handleDropThirdPlaceReorder(targetId);
    }

    clearCustomTouchDragState();
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const targetId = window.location.hash === "#group-stage-commit"
      ? "group-stage-commit"
      : window.location.hash === "#group-stage-picks"
        ? "group-stage-picks"
        : null;

    if (!targetId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.focus({ preventScroll: false });
    });
  }, []);

  function markBracketChanged() {
    setFinalBracketSavedAt(null);
    setChangedSinceAt((current) => current ?? new Date().toISOString());
  }

  function updateGroupRanking(groupName: string, nextRankedTeamIds: string[]) {
    if (groupProjectionSources[groupName] === "score_applied") {
      return;
    }
    markBracketChanged();
    setHasInteracted(true);
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

  function getTopTwoSlotsForGroup(groupName: string): TopTwoSlotDraft {
    const draft = topTwoSlotDraftsByGroup[groupName];
    if (draft) {
      return draft;
    }

    const shouldUseStoredSlots =
      touchedGroups.has(groupName) || groupProjectionSources[groupName] === "score_applied" || isReadOnly;
    const currentOrder = groupRankingsByGroup.get(groupName) ?? [];
    return {
      firstTeamId: shouldUseStoredSlots ? currentOrder[0] ?? null : null,
      secondTeamId: shouldUseStoredSlots ? currentOrder[1] ?? null : null
    };
  }

  function buildTopTwoRanking(groupName: string, firstTeamId: string, secondTeamId: string) {
    const currentOrder = groupRankingsByGroup.get(groupName) ?? [];
    return [
      firstTeamId,
      secondTeamId,
      ...currentOrder.filter((teamId) => teamId !== firstTeamId && teamId !== secondTeamId)
    ];
  }

  function clearTopTwoDraft(groupName: string) {
    setTopTwoSlotDraftsByGroup((current) => {
      if (!current[groupName]) {
        return current;
      }

      const next = { ...current };
      delete next[groupName];
      return next;
    });
  }

  function markTopTwoSlotDraftChanged(groupName: string) {
    markBracketChanged();
    setHasInteracted(true);
    setGroupProjectionSources((current) => ({
      ...current,
      [groupName]: "builder_manual"
    }));
  }

  function applyTopTwoSlots(groupName: string, firstTeamId: string | null, secondTeamId: string | null) {
    if (isReadOnly || groupProjectionSources[groupName] === "score_applied") {
      return;
    }

    const normalizedFirstTeamId = firstTeamId && teamsById.has(firstTeamId) ? firstTeamId : null;
    const normalizedSecondTeamId = secondTeamId && teamsById.has(secondTeamId) ? secondTeamId : null;
    if (normalizedFirstTeamId && normalizedSecondTeamId && normalizedFirstTeamId === normalizedSecondTeamId) {
      return;
    }

    if (normalizedFirstTeamId && normalizedSecondTeamId) {
      clearTopTwoDraft(groupName);
      updateGroupRanking(groupName, buildTopTwoRanking(groupName, normalizedFirstTeamId, normalizedSecondTeamId));
      return;
    }

    markTopTwoSlotDraftChanged(groupName);
    setTopTwoSlotDraftsByGroup((current) => ({
      ...current,
      [groupName]: {
        firstTeamId: normalizedFirstTeamId,
        secondTeamId: normalizedSecondTeamId
      }
    }));
  }

  function getTopTwoSlotPlaceLabel(slotIndex: 0 | 1) {
    return t(language, slotIndex === 0 ? "bracket.topTwoFirstPlaceShort" : "bracket.topTwoSecondPlaceShort");
  }

  function selectGroupTeamIntoNextOpenSlot(teamId: string) {
    if (!activeGroupName || isReadOnly || isActiveGroupScoreApplied) {
      return;
    }

    const team = teamsById.get(teamId);
    if (!team) {
      return;
    }

    const slots = getTopTwoSlotsForGroup(activeGroupName);
    if (!slots.firstTeamId) {
      applyTopTwoSlots(activeGroupName, teamId, slots.secondTeamId);
      setTopTwoAnnouncement(t(language, "bracket.topTwoTeamSelectedAnnouncement", {
        teamName: team.name,
        place: getTopTwoSlotPlaceLabel(0)
      }));
      return;
    }

    if (!slots.secondTeamId) {
      applyTopTwoSlots(activeGroupName, slots.firstTeamId, teamId);
      setTopTwoAnnouncement(t(language, "bracket.topTwoTeamSelectedAnnouncement", {
        teamName: team.name,
        place: getTopTwoSlotPlaceLabel(1)
      }));
      return;
    }

    showAppToast({ tone: "tip", text: t(language, "bracket.topTwoSlotsFull") });
  }

  function moveGroupTeamToTopTwoSlot(teamId: string, slotIndex: 0 | 1) {
    if (!activeGroupName || isReadOnly || isActiveGroupScoreApplied) {
      return;
    }

    const team = teamsById.get(teamId);
    if (!team) {
      return;
    }

    const slots = getTopTwoSlotsForGroup(activeGroupName);
    let nextFirstTeamId = slots.firstTeamId;
    let nextSecondTeamId = slots.secondTeamId;

    if (slotIndex === 0) {
      if (teamId === slots.firstTeamId) {
        return;
      }
      nextFirstTeamId = teamId;
      nextSecondTeamId = teamId === slots.secondTeamId ? slots.firstTeamId : slots.secondTeamId;
    } else {
      if (teamId === slots.secondTeamId) {
        return;
      }
      nextSecondTeamId = teamId;
      nextFirstTeamId = teamId === slots.firstTeamId ? slots.secondTeamId : slots.firstTeamId;
    }

    applyTopTwoSlots(activeGroupName, nextFirstTeamId, nextSecondTeamId);
    setTopTwoAnnouncement(t(language, "bracket.topTwoTeamSelectedAnnouncement", {
      teamName: team.name,
      place: getTopTwoSlotPlaceLabel(slotIndex)
    }));
  }

  function removeGroupTeamFromTopTwo(teamId: string) {
    if (!activeGroupName || isReadOnly || isActiveGroupScoreApplied) {
      return;
    }

    const team = teamsById.get(teamId);
    const slots = getTopTwoSlotsForGroup(activeGroupName);
    if (teamId !== slots.firstTeamId && teamId !== slots.secondTeamId) {
      return;
    }

    applyTopTwoSlots(
      activeGroupName,
      teamId === slots.firstTeamId ? null : slots.firstTeamId,
      teamId === slots.secondTeamId ? null : slots.secondTeamId
    );
    if (team) {
      setTopTwoAnnouncement(t(language, "bracket.topTwoTeamRemovedAnnouncement", {
        teamName: team.name,
        place: teamId === slots.firstTeamId ? getTopTwoSlotPlaceLabel(0) : getTopTwoSlotPlaceLabel(1)
      }));
    }
  }

  function acceptCurrentThirdPlaceRanking() {
    if (isReadOnly || !isThirdPlacePhase || hasCommittedThirdPlaceSelection) {
      return;
    }

    markBracketChanged();
    setHasInteracted(true);
    setHasTouchedThirdPlaceRanking(true);
  }

  function isActivationClickTarget(target: EventTarget | null) {
    return !(target instanceof Element && target.closest("[data-no-row-drag='true']"));
  }

  function markThirdPlaceSelectionChanged() {
    markBracketChanged();
    setHasInteracted(true);
    setHasTouchedThirdPlaceRanking(true);
  }

  function sortThirdPlaceSelectionByProbability(teamIds: string[]) {
    return Array.from(new Set(teamIds.filter((teamId) => derivedThirdPlacePoolIds.has(teamId)))).sort((left, right) => {
      const leftTeam = teamsById.get(left);
      const rightTeam = teamsById.get(right);
      if (!leftTeam || !rightTeam) {
        return left.localeCompare(right);
      }

      const ratingDiff = getTeamRating(rightTeam) - getTeamRating(leftTeam);
      return ratingDiff || leftTeam.name.localeCompare(rightTeam.name);
    });
  }

  function getProbabilityRowsForGroup(groupName: string) {
    const normalizedGroupName = normalizeGroupKey(groupName) ?? groupName;
    return (groupRankingsByGroup.get(normalizedGroupName) ?? []).map((teamId, index) => ({
      teamId,
      rank: index + 1,
      played: 0,
      goalsFor: 0,
      goalDifference: 0,
      points: 0
    }));
  }

  function getProbabilityTeamsForGroup(groupName: string) {
    const normalizedGroupName = normalizeGroupKey(groupName) ?? groupName;
    return (groupRankingsByGroup.get(normalizedGroupName) ?? [])
      .map((teamId) => teamsById.get(teamId) ?? null)
      .filter((team): team is RankedTeam => Boolean(team));
  }

  function getGroupStagePickProbability({
    team,
    predictedPlace,
    thirdPlaceRankingIndex
  }: {
    team: RankedTeam;
    predictedPlace: 1 | 2 | 3 | 4;
    thirdPlaceRankingIndex?: number | null;
  }) {
    const groupName = normalizeGroupKey(team.groupName) ?? team.groupName;
    return getPickProbabilityForTeam({
      rows: getProbabilityRowsForGroup(groupName),
      teamId: team.id,
      team,
      groupTeams: getProbabilityTeamsForGroup(groupName),
      thirdPlacePool: derivedThirdPlacePool,
      thirdPlaceRankingIndex,
      predictedPlace
    });
  }

  function getThirdPlaceAdvanceProbabilityResult(teamId: string) {
    if (!hasCompletedBracketOnce) {
      return null;
    }

    const team = teamsById.get(teamId);
    if (!team || !derivedThirdPlacePoolIds.has(teamId)) {
      return null;
    }

    const selectedIndex = committedThirdPlaceRankingIds.indexOf(teamId);
    const rankingIndex =
      selectedIndex >= 0
        ? selectedIndex
        : Math.max(0, sortThirdPlaceSelectionByProbability([...committedThirdPlaceRankingIds, teamId]).indexOf(teamId));

    return getGroupStagePickProbability({
      team,
      predictedPlace: 3,
      thirdPlaceRankingIndex: rankingIndex
    });
  }

  function getThirdPlaceReplacementIncomingAria(team: RankedTeam, pickProbability: PickProbabilityResult | null) {
    if (!pickProbability || pickProbability.probability === null) {
      return t(language, "bracket.thirdPlaceReplacementIncomingUnavailableAria", { teamName: team.name });
    }

    return t(language, "bracket.thirdPlaceReplacementIncomingProbabilityAria", {
      teamName: team.name,
      percent: formatNumber(pickProbability.probability, language)
    });
  }

  function getThirdPlaceReplacementRowAria(team: RankedTeam, incomingTeam: RankedTeam, pickProbability: PickProbabilityResult | null) {
    if (!pickProbability || pickProbability.probability === null) {
      return t(language, "bracket.thirdPlaceReplacementRowUnavailableAria", {
        teamName: team.name,
        incomingTeamName: incomingTeam.name
      });
    }

    return t(language, "bracket.thirdPlaceReplacementRowProbabilityAria", {
      teamName: team.name,
      incomingTeamName: incomingTeam.name,
      percent: formatNumber(pickProbability.probability, language)
    });
  }

  function addExplicitThirdPlaceQualifier(teamId: string, replacedTeamId?: string) {
    if (isReadOnly || !usesExplicitThirdPlaceSelection || !derivedThirdPlacePoolIds.has(teamId)) {
      return;
    }

    markThirdPlaceSelectionChanged();
    setThirdPlaceRankings((current) => {
      const currentSelection = Array.from(
        new Set(current.filter((candidateId) => derivedThirdPlacePoolIds.has(candidateId)))
      ).filter((candidateId) => candidateId !== teamId && candidateId !== replacedTeamId);
      return sortThirdPlaceSelectionByProbability([...currentSelection, teamId]);
    });
    setThirdPlaceReplacementCandidateId(null);
  }

  function moveThirdPlaceTeam(index: number, direction: -1 | 1) {
    if (usesExplicitThirdPlaceSelection) {
      const sourceTeamId = normalizedThirdPlaceRankings[index];
      if (!sourceTeamId || !committedThirdPlaceRankingIds.includes(sourceTeamId)) {
        return;
      }

      const selectedIndex = committedThirdPlaceRankingIds.indexOf(sourceTeamId);
      const nextIndex = selectedIndex + direction;
      if (nextIndex < 0 || nextIndex >= committedThirdPlaceRankingIds.length) {
        return;
      }

      markThirdPlaceSelectionChanged();
      setThirdPlaceRankings(moveItem(committedThirdPlaceRankingIds, selectedIndex, direction));
      return;
    }

    markBracketChanged();
    setHasInteracted(true);
    setHasTouchedThirdPlaceRanking(true);
    setThirdPlaceRankings(moveItem(normalizedThirdPlaceRankings, index, direction));
  }

  function handleDropThirdPlaceReorder(targetTeamId: string, sourceTeamIdOverride?: string | null) {
    const sourceTeamId = sourceTeamIdOverride ?? draggedThirdPlaceTeamIdRef.current ?? draggedThirdPlaceTeamId;

    if (isReadOnly || !sourceTeamId || sourceTeamId === targetTeamId) {
      draggedThirdPlaceTeamIdRef.current = null;
      setDraggedThirdPlaceTeamId(null);
      setDragOverThirdPlaceTeamId(null);
      return;
    }

    const fromIndex = normalizedThirdPlaceRankings.indexOf(sourceTeamId);
    const toIndex = normalizedThirdPlaceRankings.indexOf(targetTeamId);
    if (fromIndex === -1 || toIndex === -1) {
      draggedThirdPlaceTeamIdRef.current = null;
      setDraggedThirdPlaceTeamId(null);
      setDragOverThirdPlaceTeamId(null);
      return;
    }

    if (usesExplicitThirdPlaceSelection) {
      const sourceIsSelected = committedThirdPlaceRankingIds.includes(sourceTeamId);
      const targetSelectedIndex = committedThirdPlaceRankingIds.indexOf(targetTeamId);

      if (!sourceIsSelected) {
        if (openThirdPlaceQualifierSlots <= 0 || !derivedThirdPlacePoolIds.has(sourceTeamId)) {
          draggedThirdPlaceTeamIdRef.current = null;
          setDraggedThirdPlaceTeamId(null);
          setDragOverThirdPlaceTeamId(null);
          return;
        }

        const insertIndex = targetSelectedIndex >= 0 ? targetSelectedIndex : committedThirdPlaceRankingIds.length;
        const nextSelection = [...committedThirdPlaceRankingIds];
        nextSelection.splice(insertIndex, 0, sourceTeamId);
        markThirdPlaceSelectionChanged();
        setThirdPlaceRankings(nextSelection.slice(0, requiredThirdPlaceQualifierCount));
        draggedThirdPlaceTeamIdRef.current = null;
        setDraggedThirdPlaceTeamId(null);
        setDragOverThirdPlaceTeamId(null);
        return;
      }

      const selectedFromIndex = committedThirdPlaceRankingIds.indexOf(sourceTeamId);
      const selectedToIndex = targetSelectedIndex >= 0
        ? targetSelectedIndex
        : committedThirdPlaceRankingIds.length - 1;

      markThirdPlaceSelectionChanged();
      setThirdPlaceRankings(reorderItems(committedThirdPlaceRankingIds, selectedFromIndex, selectedToIndex));
      draggedThirdPlaceTeamIdRef.current = null;
      setDraggedThirdPlaceTeamId(null);
      setDragOverThirdPlaceTeamId(null);
      return;
    }

    markBracketChanged();
    setHasInteracted(true);
    setHasTouchedThirdPlaceRanking(true);
    setThirdPlaceRankings(reorderItems(normalizedThirdPlaceRankings, fromIndex, toIndex));
    draggedThirdPlaceTeamIdRef.current = null;
    setDraggedThirdPlaceTeamId(null);
    setDragOverThirdPlaceTeamId(null);
  }

  function handleDropThirdPlaceOpenSlot(sourceTeamIdOverride?: string | null) {
    const sourceTeamId = sourceTeamIdOverride ?? draggedThirdPlaceTeamIdRef.current ?? draggedThirdPlaceTeamId;

    if (
      isReadOnly ||
      !usesExplicitThirdPlaceSelection ||
      !sourceTeamId ||
      openThirdPlaceQualifierSlots <= 0 ||
      committedThirdPlaceRankingIds.includes(sourceTeamId) ||
      !derivedThirdPlacePoolIds.has(sourceTeamId)
    ) {
      draggedThirdPlaceTeamIdRef.current = null;
      setDraggedThirdPlaceTeamId(null);
      setDragOverThirdPlaceTeamId(null);
      return;
    }

    markThirdPlaceSelectionChanged();
    setThirdPlaceRankings([...committedThirdPlaceRankingIds, sourceTeamId].slice(0, requiredThirdPlaceQualifierCount));
    draggedThirdPlaceTeamIdRef.current = null;
    setDraggedThirdPlaceTeamId(null);
    setDragOverThirdPlaceTeamId(null);
  }

  function handleDropReorder(targetTeamId: string, sourceTeamIdOverride?: string | null) {
    const sourceTeamId = sourceTeamIdOverride ?? draggedTeamIdRef.current ?? draggedTeamId;

    if (isReadOnly || !activeGroupName || isActiveGroupScoreApplied || !sourceTeamId) {
      draggedTeamIdRef.current = null;
      setDraggedTeamId(null);
      setDragOverTeamId(null);
      return;
    }

    if (targetTeamId.startsWith(GROUP_TOP_SLOT_DROP_ID_PREFIX)) {
      moveGroupTeamToTopTwoSlot(
        sourceTeamId,
        targetTeamId.endsWith("1") ? 1 : 0
      );
      draggedTeamIdRef.current = null;
      setDraggedTeamId(null);
      setDragOverTeamId(null);
      return;
    }

    if (targetTeamId === GROUP_AVAILABLE_POOL_DROP_ID) {
      removeGroupTeamFromTopTwo(sourceTeamId);
      draggedTeamIdRef.current = null;
      setDraggedTeamId(null);
      setDragOverTeamId(null);
      return;
    }

    if (sourceTeamId === targetTeamId) {
      draggedTeamIdRef.current = null;
      setDraggedTeamId(null);
      setDragOverTeamId(null);
      return;
    }

    const currentOrder = groupRankingsByGroup.get(activeGroupName) ?? [];
    const fromIndex = currentOrder.indexOf(sourceTeamId);
    const toIndex = currentOrder.indexOf(targetTeamId);
    if (fromIndex === -1 || toIndex === -1) {
      draggedTeamIdRef.current = null;
      setDraggedTeamId(null);
      setDragOverTeamId(null);
      return;
    }

    updateGroupRanking(activeGroupName, reorderItems(currentOrder, fromIndex, toIndex));
    draggedTeamIdRef.current = null;
    setDraggedTeamId(null);
    setDragOverTeamId(null);
  }

  function handleGroupPoolDragOver(event: DragEvent<HTMLElement>) {
    const sourceTeamId = draggedTeamIdRef.current ?? draggedTeamId;
    if (isReadOnly || isActiveGroupScoreApplied || !sourceTeamId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTeamId(GROUP_AVAILABLE_POOL_DROP_ID);
  }

  function handleGroupPoolDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    handleDropReorder(GROUP_AVAILABLE_POOL_DROP_ID, getDragTransferTeamId(event));
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

  function coolDownGroupWheelSwipe() {
    groupSwipeWheelIsCoolingDownRef.current = true;
    if (groupSwipeWheelCooldownTimeoutRef.current !== null) {
      window.clearTimeout(groupSwipeWheelCooldownTimeoutRef.current);
    }
    groupSwipeWheelCooldownTimeoutRef.current = window.setTimeout(() => {
      groupSwipeWheelIsCoolingDownRef.current = false;
      groupSwipeWheelCooldownTimeoutRef.current = null;
    }, GROUP_SWIPE_WHEEL_COOLDOWN_MS);
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

  function handleGroupSwipeWheel(event: WheelEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (
      sortedGroupNames.length < 2 ||
      customDragStateRef.current?.isDragging ||
      groupSwipeWheelIsCoolingDownRef.current ||
      groupSwipeAnimationTimeoutRef.current !== null ||
      target?.closest("[data-disable-group-swipe='true']")
    ) {
      return;
    }

    if (Math.abs(event.deltaX) < 4 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.15) {
      return;
    }

    event.preventDefault();
    groupSwipeWheelDeltaRef.current += event.deltaX;

    if (groupSwipeWheelResetTimeoutRef.current !== null) {
      window.clearTimeout(groupSwipeWheelResetTimeoutRef.current);
    }
    groupSwipeWheelResetTimeoutRef.current = window.setTimeout(() => {
      groupSwipeWheelDeltaRef.current = 0;
      groupSwipeWheelResetTimeoutRef.current = null;
      setIsGroupSurfaceSwiping(false);
      setGroupSwipeOffsetX(0);
    }, 180);

    const gestureDeltaX = -groupSwipeWheelDeltaRef.current;
    updateGroupSurfaceSwipe(gestureDeltaX);

    if (Math.abs(gestureDeltaX) < SWIPE_THRESHOLD_PX) {
      return;
    }

    groupSwipeWheelDeltaRef.current = 0;
    if (groupSwipeWheelResetTimeoutRef.current !== null) {
      window.clearTimeout(groupSwipeWheelResetTimeoutRef.current);
      groupSwipeWheelResetTimeoutRef.current = null;
    }
    coolDownGroupWheelSwipe();
    finishGroupSurfaceSwipe(gestureDeltaX);
  }

  function handleGoToFullScoring() {
    storeGroupsEntryIntent({
      source: "dashboard",
      target: "next-pick"
    });
    router.push(`/groups${onboardingQuery ? `?${onboardingQuery.slice(1)}` : ""}`);
  }

  function handleViewBracketImpact() {
    const target = bracketPreviewRef.current;
    if (!target || typeof window === "undefined") {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      block: "start",
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });

    if (!showBracketImpactOverlay) {
      setHighlightedScenarioSlotIds(new Set());
      return;
    }

    const affectedSlotIds = new Set(scenarioImpact.affectedSlots.map((slot) => slot.slotId));
    setHighlightedScenarioSlotIds(affectedSlotIds);

    if (bracketImpactHighlightTimeoutRef.current !== null) {
      window.clearTimeout(bracketImpactHighlightTimeoutRef.current);
    }

    if (affectedSlotIds.size === 0) {
      return;
    }

    bracketImpactHighlightTimeoutRef.current = window.setTimeout(() => {
      bracketImpactHighlightTimeoutRef.current = null;
      setHighlightedScenarioSlotIds(new Set());
    }, 1800);
  }

  function handleBracketChangeMarkerClick(event: ReactMouseEvent<HTMLButtonElement>, slotId: string) {
    event.preventDefault();
    event.stopPropagation();
    setOpenBracketChangeSlotId((currentSlotId) => currentSlotId === slotId ? null : slotId);
  }

  function getBracketChangeTeamLabel(teamId: string | null | undefined, fallback: string) {
    if (!teamId) {
      return fallback;
    }

    const team = teamsById.get(teamId);
    return team?.shortName ?? team?.name ?? fallback;
  }

  function getBracketChangeDetails({
    slotId,
    side
  }: {
    slotId: string;
    side: BracketPreviewSide;
  }) {
    const affectedSlot = scenarioAffectedSlotById.get(slotId);
    if (!affectedSlot) {
      return null;
    }

    const currentLabel = getBracketChangeTeamLabel(affectedSlot.currentTeamId, side.shortLabel);
    const previousLabel = getBracketChangeTeamLabel(affectedSlot.previousTeamId, "TBD");
    const sourceLabel = side.sourceLabel ? formatProjectedSeedLabel(side.sourceLabel) : null;
    const affectsLabel = t(
      language,
      scenarioImpact.affectedPickCount === 1
        ? "bracket.scenarioPickAffected"
        : "bracket.scenarioPicksAffected",
      { count: scenarioImpact.affectedPickCount }
    );
    const rows = [
      { label: t(language, "bracket.bracketChangeNow"), value: currentLabel },
      { label: t(language, "bracket.bracketChangeWas"), value: previousLabel },
      ...(sourceLabel ? [{ label: t(language, "bracket.bracketChangeSource"), value: sourceLabel }] : []),
      { label: t(language, "bracket.bracketChangeAffects"), value: affectsLabel }
    ];

    return {
      title: t(language, "bracket.bracketChangeTitle"),
      currentLabel,
      previousLabel,
      rows,
      ariaLabel: t(language, "bracket.bracketChangeAria", {
        current: currentLabel,
        previous: previousLabel
      })
    };
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

  async function handleSaveProgress() {
    if (
      isReadOnly ||
      isSavingProgress ||
      isFinalizingBracket ||
      isRestoringBracket ||
      !hasSaveableProgressChanges
    ) {
      return;
    }

    const remainingTopTwoDrafts = Object.fromEntries(
      Object.entries(topTwoSlotDraftsByGroup).filter(([, draft]) => !draft.firstTeamId || !draft.secondTeamId)
    );
    const hasRemainingTopTwoDrafts = Object.keys(remainingTopTwoDrafts).length > 0;

    setIsSavingProgress(true);
    setSaveState("saving");
    setSaveMessage(t(language, "common.saving"));

    const result = await saveLightSeedBuilderAction({
      groupRankings: saveableTouchedRankingsInput,
      rankedThirdPlaceTeamIds: committedThirdPlaceRankingIds,
      commitThirdPlaceRankings: isThirdPlacePhase && hasTouchedThirdPlaceRanking
    });

    setIsSavingProgress(false);

    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      showAppToast({ tone: "error", text: result.message });
      return;
    }

    const savedAt = new Date().toISOString();
    setCommittedBracketSavedAt(savedAt);
    committedSnapshotRef.current = cloneLightSeedBuilderSnapshot({
      groupRankings: saveableTouchedRankingsInput,
      thirdPlaceRankings: committedThirdPlaceRankingIds.map((teamId, index) => ({
        teamId,
        rank: index + 1
      }))
    });
    committedSnapshotIsFinalRef.current = false;
    setTopTwoSlotDraftsByGroup(remainingTopTwoDrafts);
    setHasInteracted(hasRemainingTopTwoDrafts);
    setChangedSinceAt(hasRemainingTopTwoDrafts ? changedSinceAt ?? new Date().toISOString() : null);
    if (!hasRemainingTopTwoDrafts) {
      clearUnsavedGroupStageDraft();
    }
    setSaveState("saved");
    setSaveMessage(t(language, "bracket.progressSaved"));
    showAppToast({ tone: "tip", text: t(language, "bracket.progressSaved") });
  }

  async function handleFinalizeBracket() {
    if (isReadOnly || !isComplete || isFinalizingBracket || hasIncompleteTopTwoDraft) {
      return;
    }

    setIsFinalizingBracket(true);
    setSaveState("saving");
    setSaveMessage(t(language, "common.saving"));

    const result = await saveLightSeedBuilderAction({
      groupRankings: saveableTouchedRankingsInput,
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
    setSaveMessage(t(language, "bracket.progressSaved"));
    const savedAt = new Date().toISOString();
    setFinalBracketSavedAt(savedAt);
    setCommittedBracketSavedAt(savedAt);
    setChangedSinceAt(null);
    committedSnapshotRef.current = cloneLightSeedBuilderSnapshot({
      groupRankings: saveableTouchedRankingsInput,
      thirdPlaceRankings: committedThirdPlaceRankingIds.map((teamId, index) => ({
        teamId,
        rank: index + 1
      }))
    });
    committedSnapshotIsFinalRef.current = true;
    setHasInteracted(false);
    setTopTwoSlotDraftsByGroup({});
    clearUnsavedGroupStageDraft();

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

  async function handleRestoreLastSavedBracket() {
    const committedSnapshot = committedSnapshotRef.current;
    if (!committedSnapshot || isRestoringBracket || isFinalizingBracket || isReadOnly) {
      return;
    }

    setIsRestoringBracket(true);
    setSaveState("saving");
    setSaveMessage(t(language, "common.saving"));

    const shouldRestoreFinalizedEntry = committedSnapshotIsFinalRef.current;
    const restoredThirdPlaceIds = getRankedThirdPlaceTeamIds(committedSnapshot);
    const result = await saveLightSeedBuilderAction({
      groupRankings: committedSnapshot.groupRankings,
      rankedThirdPlaceTeamIds: restoredThirdPlaceIds,
      commitThirdPlaceRankings: restoredThirdPlaceIds.length > 0,
      finalizeTournamentEntry: shouldRestoreFinalizedEntry
    });

    setIsRestoringBracket(false);

    if (!result.ok) {
      setSaveState("error");
      setSaveMessage(result.message);
      showAppToast({ tone: "error", text: result.message });
      return;
    }

    const restoredRankingsByGroup = new Map(
      committedSnapshot.groupRankings.map((ranking) => [
        normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
        ranking.rankedTeamIds
      ])
    );
    setGroupRankings(
      defaultSnapshot.groupRankings.map((ranking) => {
        const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
        const restoredRankedTeamIds = restoredRankingsByGroup.get(groupName);
        return restoredRankedTeamIds?.length
          ? { ...ranking, rankedTeamIds: [...restoredRankedTeamIds] }
          : ranking;
      })
    );
    setThirdPlaceRankings(restoredThirdPlaceIds);
    setTopTwoSlotDraftsByGroup({});
    setTouchedGroups(new Set(committedSnapshot.groupRankings.map((ranking) => normalizeGroupKey(ranking.groupName) ?? ranking.groupName)));
    setHasTouchedThirdPlaceRanking(restoredThirdPlaceIds.length >= requiredThirdPlaceQualifierCount && requiredThirdPlaceQualifierCount > 0);
    setHasInteracted(false);
    const restoredAt = new Date().toISOString();
    setFinalBracketSavedAt(shouldRestoreFinalizedEntry ? restoredAt : null);
    setCommittedBracketSavedAt(restoredAt);
    committedSnapshotIsFinalRef.current = shouldRestoreFinalizedEntry;
    setChangedSinceAt(null);
    clearUnsavedGroupStageDraft();
    setSaveState("saved");
    setSaveMessage(t(language, "bracket.progressSaved"));
  }

  function renderManualProgressSaveControl() {
    const savedProgressLabel =
      !hasInteracted && !changedSinceAt && committedBracketSavedAt
        ? t(language, "bracket.savedAt", { time: formatSavedTimeLabel(committedBracketSavedAt, language) })
        : t(language, "bracket.saveProgress");

    return (
      <div className="group-stage-save-restore-control space-y-1">
        <div className={`group-stage-save-restore-grid grid gap-2 ${canRestoreLastSavedBracket ? "grid-cols-2" : "grid-cols-1"}`}>
          <ActionButton
            fullWidth
            tone={hasSaveableProgressChanges ? "accent" : "neutral"}
            disabled={
              isReadOnly ||
              isSavingProgress ||
            isFinalizingBracket ||
            isRestoringBracket ||
            !hasSaveableProgressChanges
          }
          onClick={handleSaveProgress}
        >
            {isSavingProgress ? t(language, "common.saving") : savedProgressLabel}
          </ActionButton>
          {canRestoreLastSavedBracket ? (
            <ActionButton
              fullWidth
              tone="neutral"
              disabled={isReadOnly || isSavingProgress || isFinalizingBracket || isRestoringBracket}
              onClick={handleRestoreLastSavedBracket}
            >
              {t(language, "bracket.restoreLastSaved")}
            </ActionButton>
          ) : null}
        </div>
        {changedSinceLabel ? (
          <p className="text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-500">
            {changedSinceLabel}
          </p>
        ) : null}
      </div>
    );
  }

  function renderBracketCommitControls() {
    if (!isComplete) {
      return null;
    }

    if (hasUncommittedFinalChanges) {
      return (
        <div className="group-stage-save-restore-control space-y-1">
          <div className={`group-stage-save-restore-grid grid gap-2 ${canRestoreLastSavedBracket ? "grid-cols-2" : "grid-cols-1"}`}>
            <ActionButton
              fullWidth
              tone="accent"
              disabled={isReadOnly || isFinalizingBracket || isRestoringBracket}
              onClick={handleFinalizeBracket}
            >
              {isFinalizingBracket ? t(language, "common.saving") : t(language, "bracket.saveChanges")}
            </ActionButton>
            {canRestoreLastSavedBracket ? (
              <ActionButton
                fullWidth
                tone="neutral"
                disabled={isReadOnly || isFinalizingBracket || isRestoringBracket}
                onClick={handleRestoreLastSavedBracket}
              >
                {t(language, "bracket.restoreLastSaved")}
              </ActionButton>
            ) : null}
          </div>
          {changedSinceLabel ? (
            <p className="text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-500">
              {changedSinceLabel}
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <ActionButton
        fullWidth
        tone={isFinishButtonQuiet ? "neutral" : isComplete ? "accent" : "neutral"}
        disabled={isReadOnly || !isComplete || isFinalizingBracket || isRestoringBracket || isFinishButtonQuiet}
        onClick={handleFinalizeBracket}
      >
        {finishBracketButtonLabel}
      </ActionButton>
    );
  }

  const leftBracketMatches = bracketPreviewMatches.slice(0, 8);
  const rightBracketMatches = bracketPreviewMatches.slice(8, 16);
  const leftBracketLayout = getBracketLayout(leftBracketMatches.length);
  const rightBracketLayout = getBracketLayout(rightBracketMatches.length);
  const replacementCandidateTeam = thirdPlaceReplacementCandidateId
    ? teamsById.get(thirdPlaceReplacementCandidateId) ?? null
    : null;
  const thirdPlacePoolStateLabel = openThirdPlaceQualifierSlots === 0
    ? t(language, "bracket.thirdPlacePoolFull")
    : t(
        language,
        openThirdPlaceQualifierSlots === 1
          ? "bracket.thirdPlacePoolOpenSlot"
          : "bracket.thirdPlacePoolOpenSlots",
        { count: openThirdPlaceQualifierSlots }
      );
  const thirdPlaceProgressSegmentCount = 8;
  const thirdPlaceProgressCompletedCount = clampNumber(
    committedThirdPlaceRankingIds.length,
    0,
    thirdPlaceProgressSegmentCount
  );
  const thirdPlaceProgressLabel = `${t(language, "bracket.thirdPlacePoolStatus", {
    selected: committedThirdPlaceRankingIds.length,
    required: requiredThirdPlaceQualifierCount
  })}. ${thirdPlacePoolStateLabel}`;

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
      {replacementCandidateTeam ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/25 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:items-center sm:pb-0"
          role="dialog"
          aria-modal="true"
          aria-label={t(language, "bracket.thirdPlaceReplacementAria")}
        >
          <div className="w-full max-w-sm rounded-[1.4rem] border border-gray-200 bg-white p-3 text-gray-950 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-600">
                  {t(language, "bracket.thirdPlaceReplacementTitle", { teamName: replacementCandidateTeam.name })}
                </p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
                  {t(language, "bracket.thirdPlaceReplacementBody")}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500"
                onClick={() => setThirdPlaceReplacementCandidateId(null)}
                aria-label={t(language, "common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(() => {
              const incomingProbability = getThirdPlaceAdvanceProbabilityResult(replacementCandidateTeam.id);
              return (
                <div
                  className="mt-3 rounded-[1rem] border border-accent-light bg-accent-light/15 px-3 py-2"
                  aria-label={getThirdPlaceReplacementIncomingAria(replacementCandidateTeam, incomingProbability)}
                >
                  <p className="mb-1 text-[9px] font-black uppercase tracking-[0.14em] text-accent-dark">
                    {t(language, "bracket.thirdPlaceReplacementIncoming")}
                  </p>
                  <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2">
                    <span className="text-[1.35rem] leading-none">{replacementCandidateTeam.flagEmoji}</span>
                    <span className="block min-w-0 truncate text-xs font-black text-gray-950">
                      {replacementCandidateTeam.name}
                    </span>
                    {hasCompletedBracketOnce ? (
                      <ThirdPlaceAdvanceProbabilityBadge pickProbability={incomingProbability} language={language} />
                    ) : null}
                  </div>
                </div>
              );
            })()}
            <div className="mt-3 space-y-1.5">
              {committedThirdPlaceRankingIds.map((teamId) => {
                const selectedTeam = teamsById.get(teamId);
                if (!selectedTeam) {
                  return null;
                }
                const probability = getThirdPlaceAdvanceProbabilityResult(teamId);

                return (
                  <button
                    key={teamId}
                    type="button"
                    className="grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-[0.95rem] border border-gray-200 bg-gray-50 px-3 py-2 text-left transition hover:border-accent-light hover:bg-accent-light/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={() => addExplicitThirdPlaceQualifier(replacementCandidateTeam.id, teamId)}
                    aria-label={getThirdPlaceReplacementRowAria(selectedTeam, replacementCandidateTeam, probability)}
                  >
                    <span className="text-[1.35rem] leading-none">{selectedTeam.flagEmoji}</span>
                    <span className="block min-w-0 truncate text-xs font-black text-gray-950">
                      {selectedTeam.name}
                    </span>
                    {hasCompletedBracketOnce ? (
                      <ThirdPlaceAdvanceProbabilityBadge pickProbability={probability} language={language} />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-full border border-gray-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-gray-500"
              onClick={() => setThirdPlaceReplacementCandidateId(null)}
            >
              {t(language, "bracket.thirdPlaceReplacementCancel")}
            </button>
          </div>
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

      {isComplete ? (
        <section
          id="group-stage-commit"
          tabIndex={-1}
          className="scroll-mt-[calc(var(--app-header-height)+0.75rem)] focus:outline-none"
        >
          {renderBracketCommitControls()}
        </section>
      ) : (
        <section
          id="group-stage-commit"
          tabIndex={-1}
          className={`scroll-mt-[calc(var(--app-header-height)+0.75rem)] rounded-[1rem] border px-3 py-2 text-center focus:outline-none ${isThirdPlacePhase ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-500"}`}
        >
          {isThirdPlacePhase ? (
            <p className="text-[10px] font-black uppercase tracking-[0.08em]">
              {t(language, "bracket.pickThirdPlaceQualifiers", { count: requiredThirdPlaceQualifierCount })}
            </p>
          ) : null}
          <div className={isThirdPlacePhase ? "mt-2" : ""}>
            {renderManualProgressSaveControl()}
          </div>
        </section>
      )}

      <section
        id="group-stage-picks"
        tabIndex={-1}
        className="scroll-mt-[calc(var(--app-header-height)+0.75rem)] space-y-2.5 px-0 pb-0 pt-1.5 focus:outline-none"
      >
        <div className="space-y-2">
          <div
            className="flex items-center justify-center px-0 select-none [touch-action:pan-y]"
            onTouchStart={handleGroupSwipeTouchStart}
            onTouchMove={handleGroupSwipeTouchMove}
            onTouchEnd={handleGroupSwipeTouchEnd}
            onWheel={handleGroupSwipeWheel}
          >
	            {shouldShowScenarioImpact ? (
	              <div
	                className="flex w-full max-w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-500 shadow-sm sm:w-auto sm:max-w-full"
                aria-label={scenarioImpactAriaLabel}
                title={scenarioImpactAriaLabel}
              >
                <span className="hidden shrink-0 font-black text-accent-dark sm:inline">
                  {t(language, "bracket.scenarioImpactLabel")}
                </span>
                <span className="min-w-0 truncate">
                  {scenarioImpactSummaryLabel}
                  {scenarioImpactOpenSlotLabel ? (
                    <>
                      <span className="mx-1 text-gray-300">·</span>
                      <span className="text-rose-600">{scenarioImpactOpenSlotLabel}</span>
                    </>
                  ) : null}
                </span>
                <button
                  type="button"
                  data-no-row-drag="true"
                  onClick={handleViewBracketImpact}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent-light bg-accent-light/20 text-accent-dark"
                  title={t(language, "bracket.viewBracketImpact")}
                  aria-label={t(language, "bracket.viewAffectedBracketPicks")}
                >
                  <GitFork className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className={`shrink-0 rounded px-1 py-[1px] text-[8px] font-black uppercase tracking-[0.1em] ${isReadOnly ? "bg-gray-100 text-gray-600" : "bg-cyan-50 text-accent-dark"}`}>
                {t(language, "common.groupCount", { count: sortedGroupNames.length })}
              </div>
            )}
          </div>
          <div
            className={`relative flex min-h-9 items-center justify-center gap-2 select-none [touch-action:pan-y] ${isGroupSurfaceSwiping ? "" : "transition-transform duration-200 ease-out"}`}
            style={{
              transform: groupSwipeOffsetX ? `translate3d(${groupSwipeOffsetX}px, 0, 0)` : undefined
            }}
            onTouchStart={handleGroupSwipeTouchStart}
            onTouchMove={handleGroupSwipeTouchMove}
            onTouchEnd={handleGroupSwipeTouchEnd}
            onWheel={handleGroupSwipeWheel}
          >
            <button
              type="button"
              onClick={() => goToGroup(activeGroupIndex - 1)}
              disabled={activeGroupIndex === 0}
              className="absolute left-0 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center text-accent-dark disabled:opacity-30"
              aria-label={t(language, "bracket.previousGroup")}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="mx-20 min-w-0 text-center">
              <h1 className="truncate text-xl font-black leading-tight text-gray-950">
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
            <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <button
                type="button"
                onClick={() => goToGroup(activeGroupIndex + 1)}
                disabled={activeGroupIndex === sortedGroupNames.length - 1}
                className="inline-flex h-8 w-8 items-center justify-center text-accent-dark disabled:opacity-30"
                aria-label={t(language, "bracket.nextGroup")}
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div
            className="flex items-center justify-center pb-4 select-none [touch-action:pan-y]"
            onTouchStart={handleGroupSwipeTouchStart}
            onTouchMove={handleGroupSwipeTouchMove}
            onTouchEnd={handleGroupSwipeTouchEnd}
            onWheel={handleGroupSwipeWheel}
          >
            <div
              role="progressbar"
              aria-label={t(language, "bracket.percentComplete", {
                percent: formatNumber(groupCompletionPercent, language)
              })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={groupCompletionPercent}
              className="grid w-[7.6rem] grid-cols-12 gap-[2px]"
            >
              {sortedGroupNames.map((groupName, index) => {
                const isSegmentComplete = topTwoCompletionStatus.completeGroupNames.has(groupName);
                const isActive = index === activeGroupIndex;
                return (
                  <span
                    key={groupName}
                    className={`h-1.5 min-w-0 [transform:translateZ(0)] ${
                      index === 0 ? "rounded-l-full" : ""
                    } ${
                      index === sortedGroupNames.length - 1 ? "rounded-r-full" : ""
                    } ${
                      isActive
                        ? "bg-accent-dark"
                        : isSegmentComplete
                          ? "bg-accent-light"
                          : "bg-gray-100"
                    }`}
                  />
                );
              })}
            </div>
          </div>
          <div className="px-1 text-center">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-accent-dark">
              {isActiveTopTwoComplete
                ? t(language, "bracket.topTwoGroupCompletePrompt")
                : t(language, "bracket.topTwoInstruction")}
            </p>
          </div>
        </div>

        <div
          className={`overflow-hidden rounded-[1.15rem] border border-gray-200 bg-white shadow-sm ${isGroupSurfaceSwiping ? "" : "transition-transform duration-200 ease-out"}`}
          style={{
            transform: groupSwipeOffsetX ? `translate3d(${groupSwipeOffsetX}px, 0, 0)` : undefined
          }}
          data-disable-group-swipe="true"
        >
          <span aria-live="polite" className="sr-only">{topTwoAnnouncement}</span>
          {[0, 1].map((slotIndexValue) => {
            const slotIndex = slotIndexValue as 0 | 1;
            const slotId = `${GROUP_TOP_SLOT_DROP_ID_PREFIX}${slotIndex}`;
            const team = slotIndex === 0 ? selectedFirstTeam : selectedSecondTeam;
            const placeLabel = getTopTwoSlotPlaceLabel(slotIndex);
            const pickProbability = team && hasCompletedBracketOnce
              ? getGroupStagePickProbability({
                  team,
                  predictedPlace: slotIndex === 0 ? 1 : 2
                })
              : null;
            const isDragOverSlot = dragOverTeamId === slotId;
            return (
              <div
                key={slotId}
                data-group-slot-id={String(slotIndex)}
                data-group-team-id={team?.id}
                data-disable-group-swipe="true"
                ref={(node) => {
                  if (node && team) {
                    groupRowRefs.current.set(team.id, node);
                  } else if (team) {
                    groupRowRefs.current.delete(team.id);
                    previousGroupRowTopsRef.current.delete(team.id);
                  }
                }}
                draggable={Boolean(team) && !isReadOnly && !isActiveGroupScoreApplied && supportsNativeRowDrag}
                onPointerDown={(event) => {
                  if (team) {
                    beginCustomTouchDrag(event, "group", team.id, isReadOnly || isActiveGroupScoreApplied);
                  }
                }}
                onPointerMove={handleCustomTouchDragMove}
                onPointerUp={handleCustomTouchDragEnd}
                onPointerCancel={() => clearCustomTouchDragState()}
                onDragStart={(event) => {
                  if (!team || isReadOnly || isActiveGroupScoreApplied || !supportsNativeRowDrag) {
                    return;
                  }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-pickit-team-id", team.id);
                  event.dataTransfer.setData("text/plain", team.id);
                  draggedTeamIdRef.current = team.id;
                  setDraggedTeamId(team.id);
                }}
                onDragEnd={() => {
                  draggedTeamIdRef.current = null;
                  setDraggedTeamId(null);
                  setDragOverTeamId(null);
                }}
                onDragOver={(event) => {
                  const sourceTeamId = draggedTeamIdRef.current ?? draggedTeamId;
                  if (isReadOnly || isActiveGroupScoreApplied || !sourceTeamId) {
                    return;
                  }
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverTeamId(slotId);
                }}
                onDragLeave={() => {
                  if (dragOverTeamId === slotId) {
                    setDragOverTeamId(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDropReorder(slotId, getDragTransferTeamId(event));
                }}
                role="group"
                aria-label={t(language, "bracket.topTwoSlotAria", { place: placeLabel })}
                className={`grid min-h-[3.15rem] grid-cols-[2.1rem_minmax(0,1fr)_auto] items-center gap-2 border-b px-2 py-1.5 transition select-none last:border-b-0 sm:grid-cols-[2.3rem_minmax(0,1fr)_auto] sm:px-3 ${
                  team
                    ? "border-accent-light bg-accent-light/35 text-gray-950"
                    : "border-gray-100 bg-white text-gray-400"
                } ${isDragOverSlot ? "ring-2 ring-accent ring-inset" : ""} ${draggedTeamId && team?.id === draggedTeamId ? "opacity-45" : ""} ${
                  team && !supportsNativeRowDrag && !isReadOnly && !isActiveGroupScoreApplied
                    ? "[touch-action:none]"
                    : "[touch-action:manipulation]"
                } ${team && supportsNativeRowDrag && !isReadOnly && !isActiveGroupScoreApplied ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                <div className="flex justify-center">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[12px] font-black text-accent-text">
                    {slotIndex + 1}
                  </span>
                </div>
                {team ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="text-[1.55rem] leading-none">{team.flagEmoji}</span>
                    <span className="min-w-0 truncate text-[12px] font-black text-gray-950 sm:text-[13px]">
                      {team.name}
                    </span>
                  </div>
                ) : (
                  <div className="min-w-0 truncate text-center text-[11px] font-semibold text-gray-300">
                    {t(language, slotIndex === 0 ? "bracket.topTwoPickFirst" : "bracket.topTwoPickSecond")}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1.5">
                  {pickProbability ? (
                    <SelectionProbabilityBadge probability={pickProbability.probability} language={language} />
                  ) : null}
                  {team && !isReadOnly && !isActiveGroupScoreApplied ? (
                    <button
                      type="button"
                      draggable={false}
                      data-no-row-drag="true"
                      onClick={() => removeGroupTeamFromTopTwo(team.id)}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 transition hover:border-accent-light hover:text-accent-dark"
                      aria-label={t(language, "bracket.topTwoRemoveTeamAria", {
                        teamName: team.name,
                        place: placeLabel
                      })}
                      title={t(language, "bracket.topTwoRemoveTeamAria", {
                        teamName: team.name,
                        place: placeLabel
                      })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div
            data-group-pool-dropzone="true"
            className={`px-2 pb-2 pt-2 sm:px-3 ${dragOverTeamId === GROUP_AVAILABLE_POOL_DROP_ID ? "bg-accent-light/20" : "bg-white"}`}
            onDragOver={handleGroupPoolDragOver}
            onDragLeave={() => {
              if (dragOverTeamId === GROUP_AVAILABLE_POOL_DROP_ID) {
                setDragOverTeamId(null);
              }
            }}
            onDrop={handleGroupPoolDrop}
          >
            <p className="mb-1 hidden text-center text-[8px] font-black uppercase tracking-[0.16em] text-gray-400 sm:block">
              {t(language, "bracket.availableTeams")}
            </p>
            <div
              className="mx-auto grid w-full gap-1.5 pb-1 sm:gap-2 sm:pb-0"
              style={{
                gridTemplateColumns: `repeat(${availableGroupTeamColumnCount}, minmax(0, 1fr))`,
                maxWidth: `${availableGroupTeamPoolMaxWidthRem}rem`
              }}
            >
              {availableGroupTeams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  data-group-team-id={team.id}
                  data-disable-group-swipe="true"
                  draggable={!isReadOnly && !isActiveGroupScoreApplied && supportsNativeRowDrag}
                  onClick={() => selectGroupTeamIntoNextOpenSlot(team.id)}
                  onPointerDown={(event) =>
                    beginCustomTouchDrag(event, "group", team.id, isReadOnly || isActiveGroupScoreApplied, "select-next")
                  }
                  onPointerMove={handleCustomTouchDragMove}
                  onPointerUp={handleCustomTouchDragEnd}
                  onPointerCancel={() => clearCustomTouchDragState()}
                  onDragStart={(event) => {
                    if (isReadOnly || isActiveGroupScoreApplied || !supportsNativeRowDrag) {
                      return;
                    }
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-pickit-team-id", team.id);
                    event.dataTransfer.setData("text/plain", team.id);
                    draggedTeamIdRef.current = team.id;
                    setDraggedTeamId(team.id);
                  }}
                  onDragEnd={() => {
                    draggedTeamIdRef.current = null;
                    setDraggedTeamId(null);
                    setDragOverTeamId(null);
                  }}
                  onDragOver={handleGroupPoolDragOver}
                  onDrop={handleGroupPoolDrop}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[0.85rem] border border-gray-100 bg-white px-1.5 py-2 text-center shadow-[0_1px_5px_rgba(15,23,42,0.04)] transition hover:border-accent-light hover:bg-accent-light/10 focus:outline-none focus:ring-2 focus:ring-accent-light sm:px-2 ${
                    draggedTeamId === team.id ? "opacity-45" : ""
                  } ${
                    !supportsNativeRowDrag && !isReadOnly && !isActiveGroupScoreApplied
                      ? "[touch-action:none]"
                      : "[touch-action:manipulation]"
                  } ${supportsNativeRowDrag && !isReadOnly && !isActiveGroupScoreApplied ? "cursor-grab active:cursor-grabbing" : ""}`}
                  aria-label={t(language, "bracket.topTwoAvailableTeamAria", { teamName: team.name })}
                >
                  <span aria-hidden className="text-[1.2rem] leading-none sm:text-[1.35rem]">{team.flagEmoji}</span>
                  <span className="w-full max-w-full truncate text-[9px] font-black text-gray-800 sm:text-[10px]">
                    {team.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {shouldShowThirdPlaceCard ? (
	          <div
	            ref={thirdPlaceSectionRef}
	            tabIndex={-1}
	            className="scroll-mt-[calc(var(--app-header-height)+0.75rem)] rounded-[1.15rem] border border-gray-200 bg-white px-3 py-3 shadow-sm focus:outline-none"
	            aria-label={t(language, "bracket.thirdPlaceQualifiers")}
	          >
	            <div className="px-0 py-1 pt-2">
	            {isThirdPlacePhase ? (
	              <div className="space-y-3">
	                <div className={shouldShowThirdPlaceRuleInfo ? "pt-1" : "pt-0"}>
	                  <div
	                    className="flex items-center justify-between gap-3"
	                  >
		                    <p
		                      className={`${shouldShowThirdPlaceRuleInfo ? "text-[10px] leading-snug" : "text-[11px]"} font-bold uppercase tracking-[0.14em] text-accent-dark`}
		                    >
                      {shouldShowThirdPlaceRuleInfo
                        ? t(language, "bracket.thirdPlaceRulePrompt")
                        : t(language, "bracket.thirdPlaceQualifiers")}
                    </p>
                    <InlineDisclosureButton
                      isOpen={isThirdPlaceListOpen}
                      onClick={() => setIsThirdPlaceListOpen((current) => !current)}
                      variant="subtle"
	                    />
	                  </div>
	                </div>
			                {usesExplicitThirdPlaceSelection ? (
			                  <div className="flex justify-center" title={thirdPlaceProgressLabel}>
		                    <div
		                      role="progressbar"
		                      aria-label={thirdPlaceProgressLabel}
		                      aria-valuemin={0}
		                      aria-valuemax={thirdPlaceProgressSegmentCount}
		                      aria-valuenow={thirdPlaceProgressCompletedCount}
		                      className="grid w-[7.6rem] grid-cols-8 gap-[2px]"
		                    >
		                      {Array.from({ length: thirdPlaceProgressSegmentCount }).map((_, index) => (
		                        <span
		                          key={index}
		                          className={`h-1.5 min-w-0 [transform:translateZ(0)] ${
		                            index === 0 ? "rounded-l-full" : ""
		                          } ${
		                            index === thirdPlaceProgressSegmentCount - 1 ? "rounded-r-full" : ""
		                          } ${
		                            index < thirdPlaceProgressCompletedCount ? "bg-accent-light" : "bg-gray-100"
		                          }`}
		                        />
		                      ))}
		                    </div>
			                  </div>
	                ) : null}
	              </div>
            ) : null}
            {isThirdPlacePhase && isThirdPlaceListOpen ? (
              <>
                <div className="mt-3 space-y-1.5">
                  {normalizedThirdPlaceRankings.map((teamId, index) => {
                    const team = teamsById.get(teamId);
                    if (!team) {
                      return null;
                    }

                    const selectedThirdPlaceIndex = committedThirdPlaceRankingIds.indexOf(team.id);
                    const isSelectedThirdPlaceQualifier = usesExplicitThirdPlaceSelection
                      ? selectedThirdPlaceIndex >= 0
                      : hasCommittedThirdPlaceSelection && index < requiredThirdPlaceQualifierCount;
                    const isAboveCutoff = isSelectedThirdPlaceQualifier;
                    const isThirdPlaceDemotedTeam = !isSelectedThirdPlaceQualifier;
                    const canDragThirdPlaceRow =
                      !isReadOnly &&
                      (!usesExplicitThirdPlaceSelection ||
                        isSelectedThirdPlaceQualifier ||
                        openThirdPlaceQualifierSlots > 0);
                    const shouldShowCutoff = usesExplicitThirdPlaceSelection
                      ? index === committedThirdPlaceRankingIds.length && committedThirdPlaceRankingIds.length < normalizedThirdPlaceRankings.length
                      : index === requiredThirdPlaceQualifierCount;
                    const displayedThirdPlaceRank =
                      usesExplicitThirdPlaceSelection && !isSelectedThirdPlaceQualifier
                        ? index + openThirdPlaceQualifierSlots + 1
                        : index + 1;
                    const probabilityIndex = selectedThirdPlaceIndex >= 0 ? selectedThirdPlaceIndex : index;
                    const thirdPlacePickProbability = getGroupStagePickProbability({
                      team,
                      predictedPlace: 3,
                      thirdPlaceRankingIndex: probabilityIndex
                    });
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
                        draggable={supportsNativeRowDrag && canDragThirdPlaceRow}
                        onPointerDown={(event) => beginCustomTouchDrag(event, "third", team.id, !canDragThirdPlaceRow)}
                        onPointerMove={handleCustomTouchDragMove}
                        onPointerUp={handleCustomTouchDragEnd}
                        onPointerCancel={() => clearCustomTouchDragState()}
                        onDragStart={(event) => {
                          if (!supportsNativeRowDrag || !canDragThirdPlaceRow) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("application/x-pickit-team-id", team.id);
                          event.dataTransfer.setData("text/plain", team.id);
                          draggedThirdPlaceTeamIdRef.current = team.id;
                          setDraggedThirdPlaceTeamId(team.id);
                        }}
                        onDragEnd={() => {
                          draggedThirdPlaceTeamIdRef.current = null;
                          setDraggedThirdPlaceTeamId(null);
                          setDragOverThirdPlaceTeamId(null);
                        }}
                        onDragOver={(event) => {
                          const sourceTeamId = draggedThirdPlaceTeamIdRef.current ?? draggedThirdPlaceTeamId;
                          if (
                            isReadOnly ||
                            !sourceTeamId ||
                            (usesExplicitThirdPlaceSelection &&
                              !committedThirdPlaceRankingIds.includes(sourceTeamId) &&
                              openThirdPlaceQualifierSlots <= 0)
                          ) {
                            return;
                          }
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverThirdPlaceTeamId(team.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverThirdPlaceTeamId === team.id) {
                            setDragOverThirdPlaceTeamId(null);
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleDropThirdPlaceReorder(team.id, getDragTransferTeamId(event));
                        }}
                        onClick={(event) => {
                          if (!isActivationClickTarget(event.target)) {
                            return;
                          }

                          acceptCurrentThirdPlaceRanking();
                        }}
                      >
                        {shouldShowCutoff && usesExplicitThirdPlaceSelection && openThirdPlaceQualifierSlots > 0 ? (
                          <div className="space-y-1 pb-1">
                            {Array.from({ length: openThirdPlaceQualifierSlots }).map((_, slotIndex) => {
                              const openSlotId = `${THIRD_PLACE_OPEN_SLOT_DROP_ID_PREFIX}${slotIndex}`;
                              const slotNumber = committedThirdPlaceRankingIds.length + slotIndex + 1;
                              const isDragOverOpenSlot = dragOverThirdPlaceTeamId === openSlotId;

                              return (
                                <div
                                  key={openSlotId}
                                  data-third-open-slot-id={openSlotId}
                                  data-disable-group-swipe="true"
                                  onDragOver={(event) => {
                                    const sourceTeamId = draggedThirdPlaceTeamIdRef.current ?? draggedThirdPlaceTeamId;
                                    if (
                                      isReadOnly ||
                                      !usesExplicitThirdPlaceSelection ||
                                      !sourceTeamId ||
                                      committedThirdPlaceRankingIds.includes(sourceTeamId) ||
                                      !derivedThirdPlacePoolIds.has(sourceTeamId)
                                    ) {
                                      return;
                                    }

                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "move";
                                    setDragOverThirdPlaceTeamId(openSlotId);
                                  }}
                                  onDragLeave={() => {
                                    if (dragOverThirdPlaceTeamId === openSlotId) {
                                      setDragOverThirdPlaceTeamId(null);
                                    }
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    handleDropThirdPlaceOpenSlot(getDragTransferTeamId(event));
                                  }}
                                  className={`grid grid-cols-[1.7rem_minmax(0,1fr)_2.1rem] items-center gap-1 rounded-[1rem] border border-dashed px-2 py-1.5 text-gray-400 transition-shadow select-none [-webkit-touch-callout:none] ${
                                    isDragOverOpenSlot
                                      ? "border-accent bg-accent-light/20 ring-1 ring-accent ring-inset"
                                      : "border-gray-200 bg-gray-50/90"
                                  }`}
                                >
                                  <div className="flex justify-start">
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[11px] font-black text-gray-400">
                                      {slotNumber}
                                    </span>
                                  </div>
                                  <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.12em]">
                                    {t(language, "bracket.emptyThirdPlaceQualifierSlot")}
                                  </span>
                                  <span
                                    aria-hidden
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs font-semibold text-gray-400"
                                  >
                                    +
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {shouldShowCutoff ? (
                          <div className="pb-1 pt-1 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-rose-600">
                            {t(language, "bracket.cutoff")}
                          </div>
                        ) : null}
                        <div
                          onDragOver={(event) => {
                            const sourceTeamId = draggedThirdPlaceTeamIdRef.current ?? draggedThirdPlaceTeamId;
                            if (
                              isReadOnly ||
                              !sourceTeamId ||
                              (usesExplicitThirdPlaceSelection &&
                                !committedThirdPlaceRankingIds.includes(sourceTeamId) &&
                                openThirdPlaceQualifierSlots <= 0)
                            ) {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            event.dataTransfer.dropEffect = "move";
                            setDragOverThirdPlaceTeamId(team.id);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleDropThirdPlaceReorder(team.id, getDragTransferTeamId(event));
                          }}
                          className={`grid grid-cols-[1.7rem_minmax(0,1fr)_5.45rem_2.1rem] items-center gap-1 rounded-[1rem] border px-2 py-1 transition-shadow select-none [-webkit-touch-callout:none] sm:grid-cols-[1.7rem_minmax(0,1fr)_6.35rem_2.1rem] sm:gap-1.5 sm:px-2.5 [touch-action:manipulation] ${isAboveCutoff ? "border-accent-light bg-accent-light/40" : "border-gray-200 bg-white"} ${dragOverThirdPlaceTeamId === team.id ? "ring-1 ring-accent ring-inset" : ""} ${draggedThirdPlaceTeamId === team.id ? "z-10 shadow-md opacity-40" : ""} ${supportsNativeRowDrag && canDragThirdPlaceRow ? "cursor-grab active:cursor-grabbing" : ""}`}
                        >
                          <div className="flex justify-start">
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black ${
                                isSelectedThirdPlaceQualifier ? "bg-accent text-accent-text" : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              {displayedThirdPlaceRank}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <span aria-hidden className={`text-[1.6rem] leading-none transition ${isThirdPlaceDemotedTeam ? "opacity-35 grayscale" : ""}`}>{team.flagEmoji}</span>
                              <span className={`truncate text-xs font-black ${isThirdPlaceDemotedTeam ? "text-gray-400" : "text-gray-950"}`}>{team.name}</span>
                            </div>
                          </div>
		                          <div className="flex items-center justify-end gap-1 sm:gap-2">
	                            {isSelectedThirdPlaceQualifier ? (
	                              <SelectionProbabilityBadge
	                                probability={thirdPlacePickProbability?.probability}
	                                language={language}
	                              />
	                            ) : null}
		                            <div className="grid shrink-0 grid-cols-2 overflow-hidden rounded-[0.9rem] border border-gray-200 bg-white">
                              <button
                                type="button"
                                draggable={false}
                                data-no-row-drag="true"
                                disabled={isReadOnly || index === 0 || (usesExplicitThirdPlaceSelection && !isSelectedThirdPlaceQualifier)}
                                onClick={() => moveThirdPlaceTeam(index, -1)}
                                className="inline-flex h-7 w-7 items-center justify-center border-r border-gray-200 text-accent-dark disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-gray-300"
                                aria-label={t(language, "bracket.moveTeamUp", { teamName: team.name })}
                              >
                                <ChevronUp className="h-4.5 w-4.5" />
                              </button>
                              <button
                                type="button"
                                draggable={false}
                                data-no-row-drag="true"
                                disabled={isReadOnly || index === normalizedThirdPlaceRankings.length - 1 || (usesExplicitThirdPlaceSelection && !isSelectedThirdPlaceQualifier)}
                                onClick={() => moveThirdPlaceTeam(index, 1)}
                                className="inline-flex h-7 w-7 items-center justify-center text-accent-dark disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-gray-300"
                                aria-label={t(language, "bracket.moveTeamDown", { teamName: team.name })}
                              >
                                <ChevronDown className="h-4.5 w-4.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-center">
                            <span
                              aria-hidden
                              data-row-drag-handle="true"
                              className={`inline-flex h-8 w-8 items-center justify-center text-gray-400 [touch-action:none] ${isReadOnly ? "opacity-60" : ""}`}
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section
        ref={bracketPreviewRef}
        tabIndex={-1}
        className="scroll-mt-[calc(var(--app-header-height)+0.75rem)] px-0 pt-3 pb-0 focus:outline-none"
        aria-labelledby="group-stage-projected-bracket-title"
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <p
            id="group-stage-projected-bracket-title"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500"
          >
            <GitFork aria-hidden className="h-3.5 w-3.5 text-accent-dark" />
            {t(language, "bracket.projectedBracket")}
          </p>
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
                    {[match.home, match.away].map((side, sideIndex) => {
                      const slotId = getScenarioSlotId(match.matchId, sideIndex === 0 ? "home" : "away");
                      const isScenarioHighlighted = showBracketImpactOverlay && highlightedScenarioSlotIds.has(slotId);
                      const bracketChangeDetails = showBracketImpactOverlay
                        ? getBracketChangeDetails({ slotId, side })
                        : null;
                      const isBracketChangeDetailsOpen = openBracketChangeSlotId === slotId;
                      return (
                        <div
                          key={`${match.matchId}-${sideIndex}`}
                          className={`relative grid min-h-[16px] grid-cols-[1.15rem_minmax(0,1fr)] items-center gap-1.5 rounded-md px-1 py-0 ${side.teamId ? "text-gray-900" : "text-gray-400"} ${isScenarioHighlighted ? "bg-accent-light/20 ring-1 ring-accent/45" : ""}`}
                        >
                          <span aria-hidden className="text-xs">{side.flagEmoji ?? " "}</span>
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <span className="truncate text-[11px] font-black">
                              {side.shortLabel}
                            </span>
                            {bracketChangeDetails ? (
                              <button
                                type="button"
                                data-bracket-change-popover="true"
                                onClick={(event) => handleBracketChangeMarkerClick(event, slotId)}
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-accent-light/25 hover:text-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                title={t(language, "bracket.viewBracketChange")}
                                aria-label={bracketChangeDetails.ariaLabel}
                              >
                                <ExternalLink aria-hidden className="h-3 w-3" strokeWidth={2} />
                              </button>
                            ) : null}
                          </span>
                          {bracketChangeDetails && isBracketChangeDetailsOpen ? (
                            <BracketChangePopover details={bracketChangeDetails} align="left" />
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                );

                const shouldLinkProjectedMatch = canOpenProjectedKnockoutMatches && !showBracketImpactOverlay;
                const sharedClassName = `absolute left-0 right-0 block space-y-0 rounded-md px-1 py-0 transition ${shouldLinkProjectedMatch ? "hover:bg-gray-50" : ""}`;
                const sharedStyle = { top: `${index * leftBracketLayout.matchBlockHeight}px` };

                if (!shouldLinkProjectedMatch) {
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
                    {[match.home, match.away].map((side, sideIndex) => {
                      const slotId = getScenarioSlotId(match.matchId, sideIndex === 0 ? "home" : "away");
                      const isScenarioHighlighted = showBracketImpactOverlay && highlightedScenarioSlotIds.has(slotId);
                      const bracketChangeDetails = showBracketImpactOverlay
                        ? getBracketChangeDetails({ slotId, side })
                        : null;
                      const isBracketChangeDetailsOpen = openBracketChangeSlotId === slotId;
                      return (
                        <div
                          key={`${match.matchId}-${sideIndex}`}
                          className={`relative grid min-h-[16px] grid-cols-[minmax(0,1fr)_1.15rem] items-center gap-1.5 rounded-md px-1 py-0 text-right ${side.teamId ? "text-gray-900" : "text-gray-400"} ${isScenarioHighlighted ? "bg-accent-light/20 ring-1 ring-accent/45" : ""}`}
                        >
                          <span className="inline-flex min-w-0 items-center justify-end gap-1">
                            {bracketChangeDetails ? (
                              <button
                                type="button"
                                data-bracket-change-popover="true"
                                onClick={(event) => handleBracketChangeMarkerClick(event, slotId)}
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-accent-light/25 hover:text-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                title={t(language, "bracket.viewBracketChange")}
                                aria-label={bracketChangeDetails.ariaLabel}
                              >
                                <ExternalLink aria-hidden className="h-3 w-3" strokeWidth={2} />
                              </button>
                            ) : null}
                            <span className="truncate text-[11px] font-black">
                              {side.shortLabel}
                            </span>
                          </span>
                          <span aria-hidden className="text-xs">{side.flagEmoji ?? " "}</span>
                          {bracketChangeDetails && isBracketChangeDetailsOpen ? (
                            <BracketChangePopover details={bracketChangeDetails} align="right" />
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                );

                const shouldLinkProjectedMatch = canOpenProjectedKnockoutMatches && !showBracketImpactOverlay;
                const sharedClassName = `absolute left-0 right-0 block space-y-0 rounded-md px-1 py-0 transition ${shouldLinkProjectedMatch ? "hover:bg-gray-50" : ""}`;
                const sharedStyle = { top: `${index * rightBracketLayout.matchBlockHeight}px` };

                if (!shouldLinkProjectedMatch) {
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
          {fullScoresEnabled ? (
            <>
              <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
                {t(language, "bracket.pickScoresEarnMorePoints")}
              </p>
              <div className="grid gap-3">
                <ActionButton fullWidth tone="accent" disabled={!canAdvanceFromEasyBracket} onClick={handleGoToFullScoring}>
                  {t(language, "bracket.pickFullScores")}
                </ActionButton>
              </div>
            </>
          ) : null}
          {isComplete ? (
            <div className="mt-3">
              {renderBracketCommitControls()}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
