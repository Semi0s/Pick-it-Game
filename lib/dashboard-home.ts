import type {
  DashboardScoringHistoryPoint,
  DashboardScoringMovementSummary
} from "./leaderboard-movement.ts";
import type { DashboardKnockoutProgressSummary } from "./knockout-progress.ts";
import type { DashboardKnockoutOutlookSummary } from "./knockout-outlook.ts";
import { normalizeGroupKey } from "./group-standings.ts";
import type { DashboardProjectedOutlookSummary } from "./projected-outlook.ts";
import { SIDE_PICK_PUBLIC_NAME, formatLastChanceDeadlineLabel } from "./side-picks.ts";
import type { DashboardTriptychViewKey } from "./tournament-transition-helpers.ts";

export type DashboardUrgencyTone = "green" | "orange" | "red" | "neutral";

export type DashboardPerformanceSummary = {
  globalPoints: number | null;
  globalRank: number | null;
  invitedGroups: number;
  managedGroups: number;
  totalGroups: number;
  totalPlayers: number;
};

export type DashboardMatchSummary = {
  id: string;
  stage: string;
  status: "scheduled" | "locked" | "live" | "final";
  kickoffTime: string | null;
  groupLabel?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeSource?: string | null;
  awaySource?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string;
  awayTeamShortName: string;
  homeTeamFlagEmoji?: string | null;
  awayTeamFlagEmoji?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeYellowCards?: number | null;
  awayYellowCards?: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
};

export type DashboardReminderSummary = {
  followedTeamCount: number;
  nextMatch: DashboardMatchSummary | null;
  upcomingMatches: DashboardMatchSummary[];
  liveMatches: DashboardMatchSummary[];
};

export type DashboardMovementMode = "score_movement" | "picks_in_play" | "empty";

export type DashboardPicksInPlayPoint = {
  dateKey: string;
  label: string;
  inPlayCount: number;
  finalCount: number;
  todayCount: number;
};

export type DashboardPicksInPlaySummary = {
  activePickCount: number;
  finalizedMatchCount: number;
  todayRelevantMatchCount: number;
  nextRelevantMatch: DashboardMatchSummary | null;
  history: DashboardPicksInPlayPoint[];
};

export type DashboardMovementSummary = {
  mode: DashboardMovementMode;
  scoreKind: "official" | "projected";
  score: DashboardScoringMovementSummary;
  projectedOutlook?: DashboardProjectedOutlookSummary | null;
  activity: DashboardPicksInPlaySummary | null;
};

export type DashboardScoringDisplaySummary = Pick<
  DashboardScoringMovementSummary,
  | "currentPoints"
  | "currentRank"
  | "currentPacePoints"
  | "previousPoints"
  | "previousRank"
  | "previousPacePoints"
  | "pointsChange"
  | "rankChange"
  | "deltaFromPace"
  | "comparisonMode"
>;

export type DashboardProgressSummary = {
  phase: "group_stage" | "knockout_stage" | "last_chance";
  label: string;
  completedUnits: number;
  totalUnits: number;
  headline: string;
  detail: string;
  deadlineAt: string | null;
  deadlineLabel: string;
  urgencyTone: DashboardUrgencyTone;
  isComplete: boolean;
  isLocked: boolean;
  needsSave?: boolean;
  hasUncommittedChanges?: boolean;
  lastCommittedAt?: string | null;
  lastChangedAt?: string | null;
  hasCompletedBracketOnce?: boolean;
  knockoutOutlook?: DashboardKnockoutOutlookSummary | null;
};

export type DashboardCommandCenterSummary = {
  progress: DashboardProgressSummary;
  progressViews: Record<Exclude<DashboardTriptychViewKey, "score_movement">, DashboardProgressSummary | null>;
  performance: DashboardPerformanceSummary;
  scoring: DashboardMovementSummary;
  reminder: DashboardReminderSummary;
  knockoutProgress?: DashboardKnockoutProgressSummary | null;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DISMISSIBLE_MESSAGE_LIMIT = 48;
const GROUP_STAGE_COMMIT_GRACE_MS = 10 * 1000;
export const DASHBOARD_HOME_MESSAGE_STORAGE_KEY_PREFIX = "pickit.dismissedHomeMessages";

export function getDashboardHomeMessageStorageKey(input: {
  userId?: string | null;
  isUserLoading?: boolean;
}): string | null {
  if (input.isUserLoading) {
    return null;
  }

  return `${DASHBOARD_HOME_MESSAGE_STORAGE_KEY_PREFIX}:${input.userId ?? "guest"}`;
}

export function parseDismissedMessageIds(rawValue: string | null | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch {
    return [];
  }
}

export function serializeDismissedMessageIds(ids: string[]): string {
  return JSON.stringify(Array.from(new Set(ids.filter(Boolean))).slice(-DISMISSIBLE_MESSAGE_LIMIT));
}

export function dismissMessageId(ids: string[], messageId: string): string[] {
  if (!messageId) {
    return Array.from(new Set(ids.filter(Boolean))).slice(-DISMISSIBLE_MESSAGE_LIMIT);
  }

  return Array.from(new Set([...ids, messageId].filter(Boolean))).slice(-DISMISSIBLE_MESSAGE_LIMIT);
}

export function restoreMessageId(ids: string[], messageId: string): string[] {
  return ids.filter((id) => id !== messageId);
}

export function isMessageDismissed(ids: string[], messageId: string): boolean {
  return ids.includes(messageId);
}

export function getDeadlineUrgency(
  deadlineAt: string | null,
  now = Date.now(),
  options?: { isLive?: boolean }
): DashboardUrgencyTone {
  if (options?.isLive) {
    return "red";
  }

  if (!deadlineAt) {
    return "neutral";
  }

  const diffMs = new Date(deadlineAt).getTime() - now;

  if (diffMs <= DAY_IN_MS) {
    return "red";
  }

  if (diffMs <= DAY_IN_MS * 2) {
    return "orange";
  }

  return "green";
}

export function hasMeaningfulGroupStageChangesAfterCommit(input: {
  latestChangedAt?: string | null;
  committedAt?: string | null;
  graceMs?: number;
}): boolean {
  if (!input.latestChangedAt || !input.committedAt) {
    return false;
  }

  const latestChangedMs = new Date(input.latestChangedAt).getTime();
  const committedMs = new Date(input.committedAt).getTime();

  if (!Number.isFinite(latestChangedMs) || !Number.isFinite(committedMs)) {
    return false;
  }

  return latestChangedMs - committedMs > (input.graceMs ?? GROUP_STAGE_COMMIT_GRACE_MS);
}

export function getGroupStageSaveStatus(input: {
  completedGroups: number;
  totalGroups: number;
  selectedThirdPlaceCount: number;
  requiredThirdPlaceCount: number;
  hasSavedProgress: boolean;
  committedAt?: string | null;
  latestChangedAt?: string | null;
  graceMs?: number;
}): {
  isComplete: boolean;
  hasCommittedEntry: boolean;
  hasMeaningfulChangesAfterCommit: boolean;
  needsSave: boolean;
} {
  const totalGroups = Math.max(input.totalGroups, 0);
  const completedGroups = Math.min(Math.max(input.completedGroups, 0), totalGroups);
  const requiresThirdPlace = input.requiredThirdPlaceCount > 0;
  const selectedThirdPlaceCount = Math.min(
    Math.max(input.selectedThirdPlaceCount, 0),
    Math.max(input.requiredThirdPlaceCount, 0)
  );
  const totalUnits = totalGroups + (requiresThirdPlace ? input.requiredThirdPlaceCount : 0);
  const completedUnits = completedGroups + (requiresThirdPlace ? selectedThirdPlaceCount : 0);
  const isComplete = totalUnits > 0 && completedUnits >= totalUnits;
  const hasCommittedEntry = Boolean(input.committedAt);
  const hasMeaningfulChangesAfterCommit = hasMeaningfulGroupStageChangesAfterCommit({
    latestChangedAt: input.latestChangedAt,
    committedAt: input.committedAt,
    graceMs: input.graceMs
  });

  return {
    isComplete,
    hasCommittedEntry,
    hasMeaningfulChangesAfterCommit,
    needsSave: hasCommittedEntry && hasMeaningfulChangesAfterCommit
  };
}

export function createEmptyDashboardPicksInPlaySummary(): DashboardPicksInPlaySummary {
  return {
    activePickCount: 0,
    finalizedMatchCount: 0,
    todayRelevantMatchCount: 0,
    nextRelevantMatch: null,
    history: []
  };
}

export function createEmptyDashboardMovementSummary(): DashboardMovementSummary {
  return {
    mode: "empty",
    scoreKind: "official",
    score: {
      currentPoints: null,
      currentRank: null,
      currentPacePoints: null,
      previousPoints: null,
      previousRank: null,
      previousPacePoints: null,
      pointsChange: null,
      rankChange: null,
      deltaFromPace: null,
      latestSnapshotAt: null,
      previousSnapshotAt: null,
      comparisonMode: "none",
      history: []
    },
    projectedOutlook: null,
    activity: null
  };
}

export function buildDashboardPicksInPlaySummary(input: {
  matches: DashboardMatchSummary[];
  relevantGroupKeys: Iterable<string>;
  now?: number;
}): DashboardPicksInPlaySummary {
  const relevantGroupKeys = new Set(
    Array.from(input.relevantGroupKeys)
      .map((value) => normalizeGroupKey(value) ?? value)
      .filter((value): value is string => Boolean(value))
  );

  if (relevantGroupKeys.size === 0) {
    return createEmptyDashboardPicksInPlaySummary();
  }

  const nowMs = input.now ?? Date.now();
  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  const relevantMatches = input.matches
    .filter((match) => {
      const normalizedGroup = normalizeGroupKey(match.groupLabel ?? null) ?? match.groupLabel ?? null;
      return Boolean(normalizedGroup && relevantGroupKeys.has(normalizedGroup));
    })
    .sort(
      (left, right) =>
        new Date(left.kickoffTime ?? 0).getTime() - new Date(right.kickoffTime ?? 0).getTime()
    );

  if (relevantMatches.length === 0) {
    return createEmptyDashboardPicksInPlaySummary();
  }

  const historyByDay = new Map<string, { started: number; finalized: number; today: number }>();
  let cumulativeInPlay = 0;
  let cumulativeFinal = 0;
  let todayRelevantMatchCount = 0;
  let nextRelevantMatch: DashboardMatchSummary | null = null;

  for (const match of relevantMatches) {
    const kickoffTime = match.kickoffTime;
    const dateKey = kickoffTime?.slice(0, 10) ?? todayKey;
    const bucket = historyByDay.get(dateKey) ?? { started: 0, finalized: 0, today: 0 };
    bucket.today += 1;
    historyByDay.set(dateKey, bucket);

    if (dateKey === todayKey) {
      todayRelevantMatchCount += 1;
    }

    const kickoffMs = kickoffTime ? new Date(kickoffTime).getTime() : Number.POSITIVE_INFINITY;
    const hasStarted = match.status !== "scheduled" || kickoffMs <= nowMs;
    if (hasStarted) {
      bucket.started += 1;
      cumulativeInPlay += 1;
    }
    if (match.status === "final") {
      bucket.finalized += 1;
      cumulativeFinal += 1;
    }

    if (!nextRelevantMatch && match.status === "scheduled" && kickoffMs > nowMs) {
      nextRelevantMatch = match;
    }
  }

  let runningInPlay = 0;
  let runningFinal = 0;
  const history = Array.from(historyByDay.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, totals]) => {
      runningInPlay += totals.started;
      runningFinal += totals.finalized;
      return {
        dateKey,
        label: formatMovementDateKey(dateKey),
        inPlayCount: runningInPlay,
        finalCount: runningFinal,
        todayCount: totals.today
      };
    });

  return {
    activePickCount: cumulativeInPlay,
    finalizedMatchCount: cumulativeFinal,
    todayRelevantMatchCount,
    nextRelevantMatch,
    history
  };
}

export function resolveDashboardMovementMode(input: {
  score: DashboardScoringMovementSummary;
  activity: DashboardPicksInPlaySummary | null;
}): DashboardMovementMode {
  const hasMeaningfulScoreMovement = hasMeaningfulScoreHistory(input.score);

  if (hasMeaningfulScoreMovement) {
    return "score_movement";
  }

  const activity = input.activity;
  const hasMeaningfulActivity = Boolean(
    activity &&
      (activity.activePickCount > 0 ||
        activity.finalizedMatchCount > 0 ||
        activity.todayRelevantMatchCount > 0 ||
        activity.history.some(
          (point) => point.inPlayCount > 0 || point.finalCount > 0 || point.todayCount > 0
        ))
  );

  if (hasMeaningfulActivity) {
    return "picks_in_play";
  }

  return "empty";
}

export function hasMeaningfulScoreHistory(score: DashboardScoringMovementSummary): boolean {
  return (
    (score.currentPoints ?? 0) > 0 ||
    score.history.some(
      (point) =>
        point.totalPoints > 0 ||
        (point.pointsDelta ?? 0) !== 0 ||
        (point.rankDelta ?? 0) !== 0
    )
  );
}

export function resolveDashboardScoringDisplaySummary(input: {
  score: DashboardScoringMovementSummary;
  relevantHistory: DashboardScoringHistoryPoint[];
}): DashboardScoringDisplaySummary {
  const latestPoint = input.relevantHistory.at(-1) ?? null;
  const previousPoint = input.relevantHistory.length > 1 ? input.relevantHistory.at(-2) ?? null : null;
  const currentPoints = input.score.currentPoints ?? latestPoint?.totalPoints ?? null;
  const currentRank = input.score.currentRank ?? latestPoint?.rank ?? null;
  const currentPacePoints = input.score.currentPacePoints ?? latestPoint?.pacePoints ?? null;
  const previousPoints = previousPoint?.totalPoints ?? input.score.previousPoints ?? null;
  const previousRank = previousPoint?.rank ?? input.score.previousRank ?? null;
  const previousPacePoints = previousPoint?.pacePoints ?? input.score.previousPacePoints ?? null;

  return {
    currentPoints,
    currentRank,
    currentPacePoints,
    previousPoints,
    previousRank,
    previousPacePoints,
    pointsChange:
      typeof currentPoints === "number" && typeof previousPoints === "number"
        ? currentPoints - previousPoints
        : latestPoint?.pointsDelta ?? input.score.pointsChange,
    rankChange:
      typeof currentRank === "number" && typeof previousRank === "number"
        ? previousRank - currentRank
        : latestPoint?.rankDelta ?? input.score.rankChange,
    deltaFromPace:
      typeof currentPoints === "number" && typeof currentPacePoints === "number"
        ? currentPoints - currentPacePoints
        : latestPoint?.paceDelta ?? input.score.deltaFromPace,
    comparisonMode: input.score.comparisonMode
  };
}

export function getDeadlineLabel(
  deadlineAt: string | null,
  now = Date.now(),
  options?: { isLive?: boolean; lockedLabel?: string }
): string {
  if (options?.isLive) {
    return "Live now";
  }

  if (!deadlineAt) {
    return "Deadline coming soon";
  }

  const diffMs = new Date(deadlineAt).getTime() - now;
  if (diffMs <= 0) {
    return options?.lockedLabel ?? "Locked";
  }

  if (diffMs <= DAY_IN_MS) {
    return "Today";
  }

  if (diffMs <= DAY_IN_MS * 2) {
    return "2 days left";
  }

  return "Open";
}

export function formatCountdown(targetTime: string | null, now = Date.now()): string {
  if (!targetTime) {
    return "Schedule coming soon";
  }

  const targetMs = new Date(targetTime).getTime();
  const diffMs = targetMs - now;

  if (diffMs <= 0) {
    return "Starting now";
  }

  if (diffMs < DAY_IN_MS) {
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `Starts in ${hours}:${minutes}:${seconds}`;
  }

  const calendarDayDiff = Math.floor(diffMs / DAY_IN_MS);
  if (calendarDayDiff < 2) {
    return `Tomorrow, ${formatTimeLabel(targetTime)}`;
  }

  return formatDateTimeLabel(targetTime);
}

export function getNextMatch(matches: DashboardMatchSummary[], now = Date.now()): DashboardMatchSummary | null {
  return getUpcomingMatches(matches, { now, limit: 1 })[0] ?? null;
}

export function getUpcomingMatches(
  matches: DashboardMatchSummary[],
  options?: { now?: number; limit?: number }
): DashboardMatchSummary[] {
  const now = options?.now ?? Date.now();
  const limit = options?.limit ?? 6;

  return [...matches]
    .filter((match) => {
      if (!match.kickoffTime || match.status === "final" || match.status === "live") {
        return false;
      }

      return new Date(match.kickoffTime).getTime() > now;
    })
    .sort((left, right) => {
      return (
        new Date(left.kickoffTime ?? 0).getTime() - new Date(right.kickoffTime ?? 0).getTime()
      );
    })
    .slice(0, limit);
}

export function filterMatchesByTeamIds(matches: DashboardMatchSummary[], teamIds: string[]): DashboardMatchSummary[] {
  const normalizedIds = new Set(teamIds.filter(Boolean));
  if (normalizedIds.size === 0) {
    return [];
  }

  return matches.filter((match) => {
    const homeTeamId = match.homeTeamId ?? "";
    const awayTeamId = match.awayTeamId ?? "";
    return normalizedIds.has(homeTeamId) || normalizedIds.has(awayTeamId);
  });
}

export function getReminderLabel(
  targetTime: string | null,
  now = Date.now(),
  options?: { isLive?: boolean; emptyLabel?: string; lockedLabel?: string }
) {
  if (options?.isLive) {
    return "Live";
  }

  if (!targetTime) {
    return options?.emptyLabel ?? "Pick teams";
  }

  const targetMs = new Date(targetTime).getTime();
  const diffMs = targetMs - now;
  if (diffMs <= 0) {
    return options?.lockedLabel ?? "Locked";
  }

  if (diffMs <= DAY_IN_MS) {
    const halfHours = Math.max(1, Math.ceil(diffMs / (30 * 60 * 1000)));
    const hours = halfHours / 2;
    return `in ${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }

  if (diffMs <= DAY_IN_MS * 2) {
    const days = Math.max(1, Math.floor(diffMs / DAY_IN_MS));
    return `in ${days}d`;
  }

  const days = Math.max(1, Math.ceil(diffMs / DAY_IN_MS));
  return `in ${days}d`;
}

export function getLiveMatches(
  matches: DashboardMatchSummary[],
  options?: { limit?: number }
): DashboardMatchSummary[] {
  const limit = options?.limit ?? 2;
  return matches
    .filter((match) => match.status === "live")
    .sort((left, right) => {
      return (
        new Date(left.kickoffTime ?? 0).getTime() - new Date(right.kickoffTime ?? 0).getTime()
      );
    })
    .slice(0, limit);
}

export function getPredictionProgress(
  input:
    | {
        phase: "group_stage";
        completedGroups: number;
        totalGroups: number;
        selectedThirdPlaceCount: number;
        requiredThirdPlaceCount: number;
        deadlineAt: string | null;
        now?: number;
        needsSave?: boolean;
        hasUncommittedChanges?: boolean;
        lastCommittedAt?: string | null;
        lastChangedAt?: string | null;
        projectedRoundOf32ResolvedSideCount?: number | null;
        projectedRoundOf32ExpectedSideCount?: number | null;
      }
    | {
        phase: "knockout_stage";
        savedPredictionCount: number;
        totalPredictionCount: number;
        hasFinalPrediction: boolean;
        deadlineAt: string | null;
        now?: number;
        isLive?: boolean;
      }
    | {
        phase: "last_chance";
        completedPickCount: number;
        totalPickCount: number;
        deadlineAt: string | null;
        now?: number;
        isLocked?: boolean;
      }
): DashboardProgressSummary {
  if (input.phase === "group_stage") {
    const totalGroups = Math.max(input.totalGroups, 0);
    const completedGroups = Math.min(Math.max(input.completedGroups, 0), totalGroups);
    const requiresThirdPlace = input.requiredThirdPlaceCount > 0;
    const selectedThirdPlaceCount = Math.min(
      Math.max(input.selectedThirdPlaceCount, 0),
      Math.max(input.requiredThirdPlaceCount, 0)
    );
    const baseTotalUnits = totalGroups + (requiresThirdPlace ? input.requiredThirdPlaceCount : 0);
    const baseCompletedUnits = completedGroups + (requiresThirdPlace ? selectedThirdPlaceCount : 0);
    const remainingGroups = Math.max(totalGroups - completedGroups, 0);
    const thirdPlaceRemaining = Math.max(input.requiredThirdPlaceCount - selectedThirdPlaceCount, 0);
    const projectedRoundOf32ExpectedSideCount = Math.max(input.projectedRoundOf32ExpectedSideCount ?? 0, 0);
    const projectedRoundOf32ResolvedSideCount = Math.max(input.projectedRoundOf32ResolvedSideCount ?? 0, 0);
    const shouldValidateProjectedRoundOf32 =
      projectedRoundOf32ExpectedSideCount > 0 &&
      totalGroups > 0 &&
      completedGroups >= totalGroups &&
      (!requiresThirdPlace || selectedThirdPlaceCount >= input.requiredThirdPlaceCount);
    const isProjectedRoundOf32Complete =
      !shouldValidateProjectedRoundOf32 ||
      projectedRoundOf32ResolvedSideCount >= projectedRoundOf32ExpectedSideCount;
    const totalUnits = baseTotalUnits + (shouldValidateProjectedRoundOf32 ? 1 : 0);
    const completedUnits =
      baseCompletedUnits + (shouldValidateProjectedRoundOf32 && isProjectedRoundOf32Complete ? 1 : 0);
    const isComplete = totalUnits > 0 && completedUnits >= totalUnits && isProjectedRoundOf32Complete;
    const detail =
      shouldValidateProjectedRoundOf32 && !isProjectedRoundOf32Complete
        ? `Review Group Stage picks to resolve the projected Round of 32`
        : requiresThirdPlace && remainingGroups === 0
          ? `${selectedThirdPlaceCount} of ${input.requiredThirdPlaceCount} third-place qualifiers selected`
          : `${completedGroups} of ${totalGroups} groups complete`;

    let headline = "Keep ranking the groups.";
    if (shouldValidateProjectedRoundOf32 && !isProjectedRoundOf32Complete) {
      headline = "Group Stage picks need review.";
    } else if (isComplete) {
      headline = "All group picks saved.";
    } else if (remainingGroups === 0 && requiresThirdPlace) {
      headline =
        thirdPlaceRemaining === 1
          ? "1 third-place pick remaining"
          : `${thirdPlaceRemaining} third-place picks remaining`;
    } else if (remainingGroups === 1) {
      headline = "1 group left";
    } else if (remainingGroups > 1) {
      headline = `${remainingGroups} groups left`;
    }

    return {
      phase: "group_stage",
      label: "Group picks",
      completedUnits,
      totalUnits,
      headline,
      detail,
      deadlineAt: input.deadlineAt,
      deadlineLabel: getDeadlineLabel(input.deadlineAt, input.now),
      urgencyTone: getDeadlineUrgency(input.deadlineAt, input.now),
      isComplete,
      isLocked: Boolean(input.deadlineAt && new Date(input.deadlineAt).getTime() <= (input.now ?? Date.now())),
      needsSave: Boolean(input.needsSave),
      hasUncommittedChanges: Boolean(input.hasUncommittedChanges),
      lastCommittedAt: input.lastCommittedAt ?? null,
      lastChangedAt: input.lastChangedAt ?? null
    };
  }

  if (input.phase === "last_chance") {
    const totalUnits = Math.max(input.totalPickCount, 0);
    const completedUnits = Math.min(Math.max(input.completedPickCount, 0), totalUnits);
    const isComplete = totalUnits > 0 && completedUnits >= totalUnits;
    const isLocked =
      Boolean(input.isLocked) ||
      Boolean(input.deadlineAt && new Date(input.deadlineAt).getTime() <= (input.now ?? Date.now()));

    return {
      phase: "last_chance",
      label: SIDE_PICK_PUBLIC_NAME,
      completedUnits,
      totalUnits,
      headline: isComplete ? `${SIDE_PICK_PUBLIC_NAME} saved.` : `Make your ${SIDE_PICK_PUBLIC_NAME}.`,
      detail: "Make extra tournament predictions.",
      deadlineAt: input.deadlineAt,
      deadlineLabel: isLocked ? "Locked" : formatLastChanceDeadlineLabel(input.deadlineAt),
      urgencyTone: getDeadlineUrgency(input.deadlineAt, input.now),
      isComplete,
      isLocked
    };
  }

  const totalPredictionCount = Math.max(input.totalPredictionCount, 0);
  const savedPredictionCount = Math.min(Math.max(input.savedPredictionCount, 0), totalPredictionCount);
  const isComplete = totalPredictionCount > 0 && savedPredictionCount >= totalPredictionCount;

  return {
    phase: "knockout_stage",
    label: "Knockout scores",
    completedUnits: savedPredictionCount,
    totalUnits: totalPredictionCount,
    headline:
      totalPredictionCount === 0
        ? "Knockout opens soon."
        : isComplete
          ? "All knockout picks saved."
          : input.hasFinalPrediction
            ? "Keep filling the bracket."
            : "Final prediction remaining",
    detail:
      totalPredictionCount === 0
        ? "Waiting for the official bracket"
        : `${savedPredictionCount} of ${totalPredictionCount} predictions saved`,
    deadlineAt: input.deadlineAt,
    deadlineLabel: getDeadlineLabel(input.deadlineAt, input.now, { isLive: input.isLive }),
    urgencyTone: getDeadlineUrgency(input.deadlineAt, input.now, { isLive: input.isLive }),
    isComplete,
    isLocked: false
  };
}

function formatDateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMovementDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}
