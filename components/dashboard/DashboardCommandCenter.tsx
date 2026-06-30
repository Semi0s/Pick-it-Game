"use client";

import Link from "next/link";
import { BellRing, ChevronDown, ChevronUp, Clock3, Moon, SunMedium, X } from "lucide-react";
import { Component, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { SidePicksIcon } from "@/components/SidePicksIcon";
import {
  getDeadlineUrgency,
  type DashboardMovementSummary,
  type DashboardPicksInPlaySummary,
  type DashboardCommandCenterSummary,
  type DashboardMatchSummary,
  type DashboardUrgencyTone
} from "@/lib/dashboard-home";
import type { DashboardKnockoutOutlookSummary } from "@/lib/knockout-outlook";
import {
  GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY,
  hasCurrentUnsavedGroupStageDraft
} from "@/lib/group-stage-unsaved-draft";
import { formatDate, formatNumber, formatTime } from "@/lib/i18n-format";
import type { DashboardScoringHistoryPoint } from "@/lib/leaderboard-movement";
import { useSessionViewState } from "@/lib/session-view-state";
import { t } from "@/lib/strings";
import type { DashboardTriptychViewKey } from "@/lib/tournament-transition-helpers";

type DashboardCommandCenterProps = {
  summary: DashboardCommandCenterSummary;
  userId?: string | null;
  language?: string | null;
  primaryView?: DashboardTriptychViewKey | null;
  secondaryView?: DashboardTriptychViewKey | null;
  showKnockoutOutlook?: boolean;
};

type TriptychTheme = "light" | "dark";
type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type TriptychScoringTrackPoint = {
  checkpointId: string;
  label: string;
  actualPoints: number;
  pacePoints: number | null;
};

type PicksInPlayChartPoint = DashboardPicksInPlaySummary["history"][number];

type TriptychScoringLens =
  | {
      mode: "empty";
    }
  | {
      mode: "picks_in_play";
      activity: DashboardPicksInPlaySummary;
    }
  | {
      mode: "score_movement";
      scoreKind: DashboardMovementSummary["scoreKind"];
      movement: DashboardMovementSummary["score"];
      projectedOutlook: DashboardCommandCenterSummary["scoring"]["projectedOutlook"];
      points: TriptychScoringTrackPoint[];
    };

const DASHBOARD_TRIPTYCH_THEME_STORAGE_KEY = "pickit:dashboard-triptych-theme";
const FALLBACK_TRIPTYCH_DARK_ACCENT_STYLE = getTriptychDarkAccentStyle({ r: 159, g: 229, b: 143 });
const SCENARIO_IMPACT_SWIPE_THRESHOLD_PX = 36;
const KNOCKOUT_SCORING_HISTORY_START_AT = "2026-06-27T00:00:00Z";
type TriptychProgressViewKey = Exclude<DashboardTriptychViewKey, "score_movement">;

type TriptychLeftPanelViewState = {
  activeView: DashboardTriptychViewKey | null;
};

const DEFAULT_TRIPTYCH_LEFT_PANEL_VIEW_STATE: TriptychLeftPanelViewState = {
  activeView: null
};

type ScoringLensErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey: string;
};

type ScoringLensErrorBoundaryState = {
  hasError: boolean;
};

class ScoringLensErrorBoundary extends Component<ScoringLensErrorBoundaryProps, ScoringLensErrorBoundaryState> {
  state: ScoringLensErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ScoringLensErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: ScoringLensErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Triptych scoring lens failed to render.", error, errorInfo.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}

function validateTriptychLeftPanelViewState(value: unknown): TriptychLeftPanelViewState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TriptychLeftPanelViewState>;
  return {
    activeView:
      typeof candidate.activeView === "string" && (
        candidate.activeView === "score_movement" ||
        candidate.activeView === "group_stage_progress" ||
        candidate.activeView === "side_picks_progress" ||
        candidate.activeView === "knockout_progress"
      )
        ? candidate.activeView
        : null
  };
}

function buildDisplayScoringChartData(points: TriptychScoringTrackPoint[]): TriptychScoringTrackPoint[] {
  if (points.length !== 1) {
    return points;
  }

  const firstPoint = points[0];
  return [
    {
      checkpointId: `${firstPoint.checkpointId}-start`,
      label: "",
      actualPoints: 0,
      pacePoints:
        typeof firstPoint.pacePoints === "number" && firstPoint.pacePoints > 0 ? 0 : firstPoint.pacePoints
    },
    firstPoint
  ];
}

function buildDisplayPicksInPlayChartData(points: PicksInPlayChartPoint[]): PicksInPlayChartPoint[] {
  if (points.length !== 1) {
    return points;
  }

  const firstPoint = points[0];
  return [
    {
      dateKey: `${firstPoint.dateKey}-start`,
      label: "",
      inPlayCount: 0,
      finalCount: 0,
      todayCount: 0
    },
    firstPoint
  ];
}

function filterRelevantScoringHistory(history: DashboardScoringHistoryPoint[]) {
  const cutoffMs = new Date(KNOCKOUT_SCORING_HISTORY_START_AT).getTime();
  if (Number.isNaN(cutoffMs) || history.length === 0) {
    return history;
  }

  const filteredHistory = history.filter((point) => {
    const pointMs = new Date(point.createdAt).getTime();
    return !Number.isNaN(pointMs) && pointMs >= cutoffMs;
  });

  return filteredHistory.length > 0 ? filteredHistory : history;
}

export function DashboardCommandCenter({
  summary,
  userId,
  language,
  primaryView,
  secondaryView,
  showKnockoutOutlook = false
}: DashboardCommandCenterProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [triptychTheme, setTriptychTheme] = useState<TriptychTheme>("light");
  const [darkAccentStyle, setDarkAccentStyle] = useState<CSSProperties>(FALLBACK_TRIPTYCH_DARK_ACCENT_STYLE);
  const [hasUnsavedGroupStageDraft, setHasUnsavedGroupStageDraft] = useState(false);
  const triptychRef = useRef<HTMLElement | null>(null);
  const darkAccentSignatureRef = useRef("");

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const syncUnsavedDraftState = () => {
      const rawDraft = window.sessionStorage.getItem(GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY);
      const savedThroughAt = summary.progress.lastChangedAt ?? summary.progress.lastCommittedAt;
      const hasCurrentDraft = hasCurrentUnsavedGroupStageDraft(rawDraft, {
        lastCommittedAt: savedThroughAt
      });
      setHasUnsavedGroupStageDraft(hasCurrentDraft);
    };

    syncUnsavedDraftState();
    window.addEventListener("focus", syncUnsavedDraftState);
    window.addEventListener("pageshow", syncUnsavedDraftState);
    window.addEventListener("storage", syncUnsavedDraftState);
    return () => {
      window.removeEventListener("focus", syncUnsavedDraftState);
      window.removeEventListener("pageshow", syncUnsavedDraftState);
      window.removeEventListener("storage", syncUnsavedDraftState);
    };
  }, [summary.progress.lastChangedAt, summary.progress.lastCommittedAt]);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(DASHBOARD_TRIPTYCH_THEME_STORAGE_KEY);
      if (storedTheme === "light" || storedTheme === "dark") {
        setTriptychTheme(storedTheme);
      }
    } catch {
      // localStorage may be unavailable in private or restricted contexts.
    }
  }, []);

  useEffect(() => {
    const element = triptychRef.current;
    if (!element) {
      return;
    }

    const computedStyle = window.getComputedStyle(element);
    const accentColor = selectTriptychDarkAccent([
      computedStyle.getPropertyValue("--app-accent-secondary"),
      computedStyle.getPropertyValue("--app-accent-tertiary"),
      computedStyle.getPropertyValue("--app-logo-check-accent"),
      computedStyle.getPropertyValue("--app-logo-secondary-accent"),
      computedStyle.getPropertyValue("--app-accent-ring"),
      computedStyle.getPropertyValue("--app-accent"),
      computedStyle.getPropertyValue("--app-accent-dark")
    ]);
    const signature = `${accentColor.r}-${accentColor.g}-${accentColor.b}`;

    if (signature !== darkAccentSignatureRef.current) {
      darkAccentSignatureRef.current = signature;
      setDarkAccentStyle(getTriptychDarkAccentStyle(accentColor));
    }
  }, [triptychTheme]);

  function toggleTriptychTheme() {
    setTriptychTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(DASHBOARD_TRIPTYCH_THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Keep the in-memory toggle responsive even if persistence is blocked.
      }
      return nextTheme;
    });
  }

  const scoringLens = useMemo(
    () =>
      getTriptychScoringLens({
        scoring: summary.scoring
      }),
    [summary.scoring]
  );

  return (
    <section
      ref={triptychRef}
      data-dashboard-triptych
      data-triptych-theme={triptychTheme}
      style={triptychTheme === "dark" ? darkAccentStyle : undefined}
    >
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <ProgressPanel
          progress={summary.progress}
          progressViews={summary.progressViews}
          scoring={summary.scoring}
          nowMs={nowMs}
          language={language}
          userId={userId}
          theme={triptychTheme}
          hasUnsavedGroupStageDraft={hasUnsavedGroupStageDraft}
          scoringLens={scoringLens}
          primaryView={primaryView}
          secondaryView={secondaryView}
          showKnockoutOutlook={showKnockoutOutlook}
        />
        <PerformancePanel
          performance={summary.performance}
          language={language}
          theme={triptychTheme}
          onToggleTheme={toggleTriptychTheme}
        />
        <ReminderPanel reminder={summary.reminder} nowMs={nowMs} language={language} theme={triptychTheme} />
      </div>
    </section>
  );
}

function ProgressPanel({
  progress,
  progressViews,
  scoring,
  nowMs,
  language,
  userId,
  theme,
  hasUnsavedGroupStageDraft = false,
  scoringLens,
  primaryView,
  secondaryView,
  showKnockoutOutlook = false
}: {
  progress: DashboardCommandCenterSummary["progress"];
  progressViews: DashboardCommandCenterSummary["progressViews"];
  scoring: DashboardCommandCenterSummary["scoring"];
  nowMs: number;
  language?: string | null;
  userId?: string | null;
  theme: TriptychTheme;
  hasUnsavedGroupStageDraft?: boolean;
  scoringLens?: TriptychScoringLens | null;
  primaryView?: DashboardTriptychViewKey | null;
  secondaryView?: DashboardTriptychViewKey | null;
  showKnockoutOutlook?: boolean;
}) {
  const [leftPanelViewState, setLeftPanelViewState] = useSessionViewState<TriptychLeftPanelViewState>({
    key: "dashboard-triptych-left-panel",
    userId,
    defaultValue: DEFAULT_TRIPTYCH_LEFT_PANEL_VIEW_STATE,
    validate: validateTriptychLeftPanelViewState
  });
  const scenarioImpactTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const scenarioImpactSwipeClickBlockRef = useRef(false);
  const scenarioImpactSwipeClickResetTimeoutRef = useRef<number | null>(null);
  const [isScoringDetailOpen, setIsScoringDetailOpen] = useState(false);
  const [isKnockoutOutlookDetailOpen, setIsKnockoutOutlookDetailOpen] = useState(false);
  const scoringLensContentId = useId();
  const resolvedViewConfig = useMemo(
    () =>
      resolveTriptychLeftPanelViews({
        progress,
        progressViews,
        scoringLens,
        primaryView,
        secondaryView
      }),
    [primaryView, progress, progressViews, scoringLens, secondaryView]
  );
  const activeView = leftPanelViewState.activeView ?? resolvedViewConfig.primaryView;
  const displayedView =
    activeView === resolvedViewConfig.secondaryView ? resolvedViewConfig.secondaryView : resolvedViewConfig.primaryView;
  const alternateView =
    displayedView === resolvedViewConfig.primaryView
      ? resolvedViewConfig.secondaryView
      : resolvedViewConfig.primaryView;
  const displayedProgress =
    displayedView === "score_movement"
      ? null
      : progressViews[displayedView] ?? (displayedView === "group_stage_progress" ? progress : null);
  const percentage =
    displayedProgress && displayedProgress.totalUnits > 0
      ? Math.round((displayedProgress.completedUnits / displayedProgress.totalUnits) * 100)
      : 0;
  const isCompleteForDisplay = displayedProgress ? displayedProgress.isComplete || percentage >= 100 : false;
  const tone = displayedProgress
    ? getProgressDisplayTone(displayedProgress, nowMs, isCompleteForDisplay)
    : getProgressDisplayTone(progress, nowMs, progress.isComplete);
  const isLastChanceProgress = displayedProgress?.phase === "last_chance";
  const statusLabel = displayedProgress
    ? isLastChanceProgress
      ? displayedProgress.deadlineLabel
      : getProgressStatusLabel(displayedProgress, language, nowMs)
    : t(language, "leaderboard.points");
  const shouldShowGroupStageNotSaved =
    displayedProgress?.phase === "group_stage" && (Boolean(displayedProgress.needsSave) || hasUnsavedGroupStageDraft);
  const progressHref = displayedProgress
    ? displayedProgress.phase === "last_chance"
      ? "/last-chance-picks"
      : displayedProgress.phase === "knockout_stage"
        ? "/knockout"
        : shouldShowGroupStageNotSaved
          ? "/bracket-builder#group-stage-commit"
          : "/bracket-builder#group-stage-picks"
    : "/dashboard";
  const progressLabel = displayedProgress
    ? displayedProgress.phase === "last_chance"
      ? "SIDE PICKS"
      : displayedProgress.phase === "group_stage"
        ? t(language, "dashboard.groupStage")
        : displayedProgress.label
    : getTriptychViewLabel("score_movement", language);
  const isShowingScoringLens = displayedView === "score_movement";
  const shouldShowKnockoutOutlook =
    Boolean(showKnockoutOutlook) &&
    displayedProgress?.phase === "knockout_stage" &&
    Boolean(displayedProgress.knockoutOutlook);
  const canOpenScoringDetail =
    isShowingScoringLens &&
    Boolean(scoringLens && (scoringLens.mode === "score_movement" || scoringLens.mode === "picks_in_play"));
  const contentViewportBottomClass = alternateView && !isLastChanceProgress ? "bottom-7" : "bottom-0";

  useEffect(() => {
    if (!isScoringDetailOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsScoringDetailOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isScoringDetailOpen]);

  useEffect(() => {
    return () => {
      if (scenarioImpactSwipeClickResetTimeoutRef.current !== null) {
        window.clearTimeout(scenarioImpactSwipeClickResetTimeoutRef.current);
      }
    };
  }, []);

  function toggleScoringLensPeek() {
    setLeftPanelViewState((current) => ({
      ...current,
      activeView:
        (current.activeView ?? resolvedViewConfig.primaryView) === resolvedViewConfig.secondaryView
          ? resolvedViewConfig.primaryView
          : resolvedViewConfig.secondaryView
    }));
  }

  function blockNextScenarioImpactClick() {
    scenarioImpactSwipeClickBlockRef.current = true;
    if (scenarioImpactSwipeClickResetTimeoutRef.current !== null) {
      window.clearTimeout(scenarioImpactSwipeClickResetTimeoutRef.current);
    }

    scenarioImpactSwipeClickResetTimeoutRef.current = window.setTimeout(() => {
      scenarioImpactSwipeClickBlockRef.current = false;
      scenarioImpactSwipeClickResetTimeoutRef.current = null;
    }, 180);
  }

  function handleScenarioImpactTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    scenarioImpactTouchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleScenarioImpactTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = scenarioImpactTouchStartRef.current;
    scenarioImpactTouchStartRef.current = null;
    const endY = event.changedTouches[0]?.clientY ?? null;
    const endX = event.changedTouches[0]?.clientX ?? null;
    if (!start || endY === null || endX === null) {
      return;
    }

    const deltaY = endY - start.y;
    const deltaX = endX - start.x;
    const absY = Math.abs(deltaY);
    if (absY < SCENARIO_IMPACT_SWIPE_THRESHOLD_PX || absY < Math.abs(deltaX) * 1.2) {
      return;
    }

    blockNextScenarioImpactClick();
    if (deltaY < 0) {
      setLeftPanelViewState((current) => ({ ...current, activeView: resolvedViewConfig.secondaryView }));
    } else {
      setLeftPanelViewState((current) => ({ ...current, activeView: resolvedViewConfig.primaryView }));
    }
  }

  function handleProgressLinkClickCapture(event: MouseEvent<HTMLAnchorElement>) {
    if (!scenarioImpactSwipeClickBlockRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  const panelContent = (
    <div id={scoringLensContentId} className="relative h-full w-full min-w-0 text-center">
      {isShowingScoringLens && scoringLens ? (
        <div className={`absolute inset-x-0 top-0 ${contentViewportBottomClass} flex items-center justify-center`}>
          <ScoringLensErrorBoundary
            resetKey={`${scoringLens.mode}:${theme}:${language ?? "default"}`}
            fallback={<ScoringLensFallback language={language} theme={theme} />}
          >
            <TriptychScoringOutlookContent scoringLens={scoringLens} language={language} theme={theme} />
          </ScoringLensErrorBoundary>
        </div>
      ) : (
        <div className={`absolute inset-x-0 top-0 ${contentViewportBottomClass} flex flex-col items-center justify-center text-center`}>
          {displayedProgress && isLastChanceProgress ? (
            <LastChanceTriptychContent progress={displayedProgress} theme={theme} />
          ) : displayedProgress && shouldShowKnockoutOutlook ? (
            <KnockoutOutlookTriptychContent
              outlook={displayedProgress.knockoutOutlook ?? null}
              theme={theme}
              onOpenDetail={() => setIsKnockoutOutlookDetailOpen(true)}
            />
          ) : (
            <>
              <DigitalWatchRing percentage={percentage} tone={tone} theme={theme} />
              {shouldShowGroupStageNotSaved ? <NotSavedMicroLabel language={language} theme={theme} /> : null}
              <div className={`${shouldShowGroupStageNotSaved ? "mt-0 space-y-0.5" : "-mt-0.5 space-y-0.5"}`}>
                <p className={`max-w-full truncate font-semibold uppercase tracking-[0.1em] [-webkit-text-size-adjust:100%] [text-size-adjust:100%] ${getToneMetaTextClasses(tone, isCompleteForDisplay, progress.isLocked, theme)}`}>
                  <span className="triptych-micro-copy">
                  {statusLabel}
                  </span>
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <PanelShell
      accentTone={tone}
      theme={theme}
      className="transition-colors hover:border-accent/35 hover:shadow-[0_12px_26px_rgba(38,28,20,0.08),0_1px_2px_rgba(38,28,20,0.04)]"
    >
      {!isShowingScoringLens && !isLastChanceProgress ? (
        <div className="absolute right-[-8px] top-[-8px] z-20">
          <UrgencyIconChip tone={tone} isComplete={isCompleteForDisplay} language={language} theme={theme} />
        </div>
      ) : null}
      {canOpenScoringDetail ? (
        <button
          type="button"
          aria-label={t(language, "dashboard.openScoringDetail")}
          onClick={() => setIsScoringDetailOpen(true)}
          className="flex h-full w-full min-w-0 items-center justify-center rounded-[1rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {panelContent}
        </button>
      ) : isShowingScoringLens ? (
        <div
          role="status"
          aria-label={t(language, "dashboard.picksActivateAsMatchesBegin")}
          className="flex h-full w-full min-w-0 items-center justify-center rounded-[1rem]"
        >
          {panelContent}
        </div>
      ) : shouldShowKnockoutOutlook ? (
        <div className="flex h-full w-full min-w-0 items-center justify-center rounded-[1rem]">
          {panelContent}
        </div>
      ) : (
        <Link
          href={progressHref}
          aria-label={`${progressLabel}: ${statusLabel}`}
          onClickCapture={alternateView ? handleProgressLinkClickCapture : undefined}
          onTouchStart={alternateView ? handleScenarioImpactTouchStart : undefined}
          onTouchEnd={alternateView ? handleScenarioImpactTouchEnd : undefined}
          className="flex h-full w-full min-w-0 items-center justify-center rounded-[1rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          {panelContent}
        </Link>
      )}
      {alternateView ? (
        <TriptychPanelViewCue
          isOpen={displayedView === resolvedViewConfig.secondaryView}
          onToggle={toggleScoringLensPeek}
          onTouchStart={handleScenarioImpactTouchStart}
          onTouchEnd={handleScenarioImpactTouchEnd}
          contentId={scoringLensContentId}
          theme={theme}
          label={getTriptychViewLabel(alternateView, language)}
        />
      ) : null}
      {scoringLens && isScoringDetailOpen ? (
        <DashboardScoringDetailSheet
          scoring={scoring}
          scoringLens={scoringLens}
          language={language}
          theme={theme}
          onClose={() => setIsScoringDetailOpen(false)}
        />
      ) : null}
      {shouldShowKnockoutOutlook && displayedProgress?.knockoutOutlook && isKnockoutOutlookDetailOpen ? (
        <DashboardKnockoutOutlookDetailSheet
          outlook={displayedProgress.knockoutOutlook}
          language={language}
          theme={theme}
          onClose={() => setIsKnockoutOutlookDetailOpen(false)}
        />
      ) : null}
    </PanelShell>
  );
}

function NotSavedMicroLabel({ language, theme }: { language?: string | null; theme: TriptychTheme }) {
  return (
    <p className={`triptych-not-saved-blink -mt-0.5 max-w-full truncate text-center font-semibold uppercase tracking-[0.1em] ${theme === "dark" ? "text-red-200" : "text-red-700"}`}>
      <span className="triptych-micro-copy">{t(language, "dashboard.notSaved")}</span>
    </p>
  );
}

function LastChanceTriptychContent({
  progress,
  theme
}: {
  progress: DashboardCommandCenterSummary["progress"];
  theme: TriptychTheme;
}) {
  const total = Math.max(progress.totalUnits, 6);
  const completed = Math.min(Math.max(progress.completedUnits, 0), total);
  const dotCount = Math.max(total, 8);
  const dotRadius = 33;

  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 text-center">
      <p className={`max-w-full truncate text-[7px] font-black uppercase tracking-[0.1em] ${getPrimaryTextClasses(theme)}`}>
        SIDE PICKS
      </p>
      <div className="relative my-1 flex-1 self-stretch">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-[5.2rem] w-[5.2rem]" aria-label={`${completed} of ${dotCount} Side Picks complete`}>
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              className={`absolute inset-0 ${
                theme === "dark" ? "text-white/60" : "text-gray-400/80"
              }`}
            >
              <circle
                cx="50"
                cy="50"
                r="39"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="1.2 5"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-[0.72rem] flex items-center justify-center">
              <SidePicksIcon className="h-10 w-10 text-[color:var(--warning)]" />
            </div>
            {Array.from({ length: dotCount }).map((_, index) => {
              const isFilled = index < completed;
              return (
                <span
                  key={index}
                  aria-hidden
                  style={{
                    left: `calc(50% + ${Math.cos((index / dotCount) * Math.PI * 2 - Math.PI / 2) * dotRadius}px)`,
                    top: `calc(50% + ${Math.sin((index / dotCount) * Math.PI * 2 - Math.PI / 2) * dotRadius}px)`
                  }}
                  className={`absolute z-[1] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${
                    isFilled
                      ? theme === "dark"
                        ? "border-[color:var(--triptych-dark-accent-text)] bg-[color:var(--triptych-dark-accent-text)]"
                        : "border-accent bg-accent"
                      : theme === "dark"
                        ? "border-white/35 bg-white/5"
                        : "border-gray-300 bg-white"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KnockoutOutlookTriptychContent({
  outlook,
  theme,
  onOpenDetail
}: {
  outlook: DashboardKnockoutOutlookSummary | null;
  theme: TriptychTheme;
  onOpenDetail: () => void;
}) {
  if (!outlook) {
    return (
      <div className="flex h-full min-w-0 flex-col items-center justify-center gap-1 px-2 py-2 text-center">
        <p className={`max-w-full truncate text-[7px] font-black uppercase tracking-[0.1em] ${getPrimaryTextClasses(theme)}`}>
          KO OUTLOOK
        </p>
        <p className={`triptych-micro-copy max-w-full truncate font-semibold ${getMutedTextClasses(theme)}`}>
          Waiting
        </p>
      </div>
    );
  }

  const activeRound =
    outlook.rounds.find((round) => round.status === "open" || round.status === "saved") ??
    outlook.rounds.find((round) => round.status === "locked" || round.status === "missed") ??
    outlook.rounds.find((round) => round.status === "final" || round.status === "complete") ??
    outlook.rounds[0] ??
    null;
  const compactSummary = activeRound
    ? `${activeRound.shortLabel} · ${activeRound.savedMatches}/${activeRound.totalMatches}`
    : outlook.headline;
  const compactHelper = activeRound ? activeRound.helperText : outlook.helperText;
  const footerProjectionLabel = outlook.projection?.active
    ? `Projection ${outlook.projection.hitSides}/${Math.max(outlook.projection.comparedSides, 1)}`
    : null;
  const footerActionLabel = compactKnockoutCtaLabel(outlook.ctaLabel);

  return (
    <div
      className="flex h-full min-w-0 flex-col gap-1.5 px-1.5 py-1.5 text-left"
      onDoubleClick={onOpenDetail}
    >
      <div className="space-y-0.5 px-0.5 pt-0.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className={`truncate text-[7px] font-black uppercase tracking-[0.12em] ${getPrimaryTextClasses(theme)}`}>
            KO OUTLOOK
          </p>
        </div>
        <p className={`truncate text-[10px] font-black leading-tight tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>{compactSummary}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-0.5 pr-1 touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-1">
        {outlook.rounds.map((round) => (
          <Link
            key={round.stage}
            href={round.href}
            className={`grid min-w-0 grid-cols-[1.65rem,1fr,auto] items-center gap-1.5 border-b px-0.5 py-1 ${
              theme === "dark" ? "border-white/10 hover:bg-white/[0.04]" : "border-black/10 hover:bg-black/[0.02]"
            }`}
          >
            <span className={`text-[8px] font-black uppercase tracking-[0.08em] ${getPrimaryTextClasses(theme)}`}>
              {round.shortLabel}
            </span>
            <span
              className={`min-w-0 truncate text-[11px] font-black leading-none tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}
            >
              {round.savedMatches}/{round.totalMatches}
            </span>
            <span
              className={`shrink-0 text-[7px] font-black uppercase tracking-[0.08em] ${
                round.status === "open" || round.status === "saved"
                  ? theme === "dark"
                    ? "text-white/88"
                    : "text-black/72"
                  : getMutedTextClasses(theme)
              }`}
            >
              {formatKnockoutRoundStateShort(round.status)}
            </span>
          </Link>
        ))}
        </div>
      </div>

      <div className={`space-y-0.5 border-t px-0.5 pt-1 ${theme === "dark" ? "border-white/10" : "border-black/10"}`}>
        <p className={`truncate text-[8px] font-semibold ${getMutedTextClasses(theme)}`}>{compactHelper}</p>
        {footerProjectionLabel ? (
          <p
            className={`truncate text-[7px] font-black uppercase tracking-[0.08em] ${
              theme === "dark"
                ? "text-[color:var(--warning)]"
                : "text-[color:var(--warning)]"
            }`}
          >
            {footerProjectionLabel}
          </p>
        ) : null}
        <Link
          href={outlook.ctaHref}
          className={`block truncate pt-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${
            theme === "dark" ? "text-[color:var(--triptych-dark-accent-text)]" : "text-accent-dark"
          }`}
        >
          {footerActionLabel}
        </Link>
        {outlook.nearestGroupDeadline ? (
          <p className={`truncate text-[7px] font-semibold ${getMutedTextClasses(theme)}`}>
            {formatKnockoutCompactDate(outlook.nearestGroupDeadline.deadlineAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DashboardKnockoutOutlookDetailSheet({
  outlook,
  language,
  theme,
  onClose
}: {
  outlook: DashboardKnockoutOutlookSummary;
  language?: string | null;
  theme: TriptychTheme;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/35 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:px-5 sm:pb-4 sm:pt-4">
      <button type="button" aria-label={t(language, "common.close")} onClick={onClose} className="absolute inset-0" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Knockout outlook"
        className={`relative flex w-full max-w-md flex-col overflow-hidden rounded-[1.4rem] border shadow-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-24px)] ${
          theme === "dark" ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"
        }`}
      >
        <div className={`sticky top-0 z-[1] flex items-center justify-between border-b px-4 py-3 ${theme === "dark" ? "border-white/10 bg-slate-950" : "border-slate-200 bg-white"}`}>
          <div className="min-w-0">
            <p className={`text-[11px] font-black uppercase tracking-[0.12em] ${getMutedTextClasses(theme)}`}>Knockout outlook</p>
            <p className={`truncate text-sm font-semibold ${getPrimaryTextClasses(theme)}`}>{outlook.headline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(language, "common.close")}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
              theme === "dark" ? "border-white/15 bg-white/5 text-white" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={`min-w-0 overflow-y-auto px-4 py-4 ${theme === "dark" ? "bg-slate-950" : "bg-white"}`}>
          <div className="space-y-2">
            {outlook.rounds.map((round) => (
              <Link
                key={round.stage}
                href={round.href}
                className={`grid min-w-0 grid-cols-[2.2rem,1fr,auto] items-center gap-2 rounded-[0.9rem] border px-3 py-2 ${
                  theme === "dark"
                    ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    : "border-slate-200 bg-slate-50/70 hover:bg-white"
                }`}
                onClick={onClose}
              >
                <span className={`text-[10px] font-black uppercase tracking-[0.08em] ${getPrimaryTextClasses(theme)}`}>
                  {round.shortLabel}
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${getPrimaryTextClasses(theme)}`}>
                    {round.savedMatches}/{round.totalMatches} saved
                  </span>
                  <span className={`block truncate text-xs font-semibold ${getMutedTextClasses(theme)}`}>
                    {round.helperText}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${
                    theme === "dark"
                      ? "bg-white/10 text-white/80"
                      : "bg-black/5 text-black/65"
                  }`}
                >
                  {formatKnockoutRoundStateShort(round.status)}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {outlook.projection?.active ? (
              <span
                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
                  theme === "dark"
                    ? "border-[color:var(--warning)]/35 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
                    : "border-[color:var(--warning)]/35 bg-[color:var(--warning)]/12 text-[color:var(--warning)]"
                }`}
              >
                Projection {outlook.projection.hitSides}/{Math.max(outlook.projection.comparedSides, 1)}
              </span>
            ) : null}
            {outlook.nearestGroupDeadline ? (
              <span
                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
                  theme === "dark"
                    ? "border-white/12 bg-white/[0.05] text-white/65"
                    : "border-black/10 bg-slate-50 text-black/55"
                }`}
              >
                {outlook.nearestGroupDeadline.groupName} · {formatKnockoutCompactDate(outlook.nearestGroupDeadline.deadlineAt)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoringLensFallback({
  language,
  theme
}: {
  language?: string | null;
  theme: TriptychTheme;
}) {
  return (
    <div
      className="flex h-full min-w-0 items-center justify-center px-1 text-center"
      role="status"
      aria-label={t(language, "dashboard.picksActivateAsMatchesBegin")}
    >
      <span className={`triptych-micro-copy font-semibold uppercase tracking-[0.12em] ${getMutedTextClasses(theme)}`}>
        {t(language, "dashboard.picksActivateAsMatchesBegin")}
      </span>
    </div>
  );
}

function TriptychScoringOutlookContent({
  scoringLens,
  language,
  theme
}: {
  scoringLens: TriptychScoringLens;
  language?: string | null;
  theme: TriptychTheme;
}) {
  if (scoringLens.mode === "score_movement") {
    const isProjected = scoringLens.scoreKind === "projected";
    const projectedOutlook = isProjected ? scoringLens.projectedOutlook ?? null : null;
    const ariaLabel = t(language, "dashboard.scoringTrackAria", {
      points: formatPoints(scoringLens.movement.currentPoints, language),
      rank: formatRank(scoringLens.movement.currentRank, language)
    });

    return (
      <div
        className="flex h-full w-full min-w-0 translate-y-1 flex-col items-center justify-center px-1 pb-1 text-center"
        aria-label={ariaLabel}
      >
        {projectedOutlook ? (
          <ProjectedOutlookCompactContent outlook={projectedOutlook} language={language} theme={theme} />
        ) : (
          <>
            <TriptychScoringSparkline points={scoringLens.points} language={language} theme={theme} />
            {scoringLens.points.length === 0 ? null : (
              <div className="mt-1 flex w-full flex-col items-center gap-0.5">
                <div className={`flex w-full items-center justify-center gap-3 ${getSecondaryTextClasses(theme)}`}>
                  <CompactMetric label={isProjected ? "Proj pts" : t(language, "leaderboard.points")} value={formatPoints(scoringLens.movement.currentPoints, language)} theme={theme} />
                  <CompactMetric label={t(language, "leaderboard.rank")} value={formatRank(scoringLens.movement.currentRank, language)} theme={theme} />
                </div>
                <div className={`flex w-full items-center justify-center gap-3 ${getSecondaryTextClasses(theme)}`}>
                  <CompactMetric label={t(language, "dashboard.todayShort")} value={formatSignedMetric(scoringLens.movement.pointsChange, language)} theme={theme} />
                  <CompactMetric label="+/-" value={formatSignedMetric(scoringLens.movement.rankChange, language)} theme={theme} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (scoringLens.mode === "picks_in_play") {
    const activity = scoringLens.activity;
    return (
      <div
        className="flex h-full w-full min-w-0 translate-y-1 flex-col items-center justify-center px-1 pb-1 text-center"
        aria-label={t(language, "dashboard.picksInPlay")}
      >
        <TriptychPicksInPlayChart activity={activity} language={language} theme={theme} />
        <div className="mt-1 flex w-full flex-col items-center gap-0.5">
          <div className={`flex w-full items-center justify-center gap-3 ${getSecondaryTextClasses(theme)}`}>
            <CompactMetric label={t(language, "dashboard.inPlayShort")} value={formatNumber(activity.activePickCount, language)} theme={theme} />
            <CompactMetric label={t(language, "dashboard.finalShort")} value={formatNumber(activity.finalizedMatchCount, language)} theme={theme} />
          </div>
          <div className={`flex w-full items-center justify-center gap-3 ${getSecondaryTextClasses(theme)}`}>
            <CompactMetric label={t(language, "dashboard.todayShort")} value={formatNumber(activity.todayRelevantMatchCount, language)} theme={theme} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full min-w-0 translate-y-1 flex-col items-center justify-center px-0 pb-0 pt-0 text-center"
      aria-label={t(language, "dashboard.picksActivateAsMatchesBegin")}
    >
      <ScoringLensFallback language={language} theme={theme} />
    </div>
  );
}

function TriptychScoringSparkline({
  points,
  language,
  theme
}: {
  points: TriptychScoringTrackPoint[];
  language?: string | null;
  theme: TriptychTheme;
}) {
  const gridStroke = theme === "dark" ? "rgba(226, 232, 240, 0.16)" : "rgba(100, 116, 139, 0.16)";
  const tickFill = theme === "dark" ? "rgba(226, 232, 240, 0.62)" : "rgba(71, 85, 105, 0.62)";
  const lineStroke = theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)";
  const chartData = useMemo(
    () => points.filter((point) => Number.isFinite(point.actualPoints)),
    [points]
  );
  const displayChartData = useMemo(() => buildDisplayScoringChartData(chartData), [chartData]);
  const singlePointDot = useMemo(
    () =>
      chartData.length === 1
        ? {
            r: 2.4,
            strokeWidth: 0,
            fill: lineStroke
          }
        : false,
    [chartData.length, lineStroke]
  );
  const singlePointPaceDot = useMemo(
    () =>
      chartData.length === 1
        ? {
            r: 2.2,
            strokeWidth: 0,
            fill: theme === "dark" ? "#fbbf24" : "#d97706"
          }
        : false,
    [chartData.length, theme]
  );
  const yDomain = useMemo<[number, number]>(() => {
    const values = displayChartData.flatMap((point) =>
      [point.actualPoints, point.pacePoints].filter((value): value is number => typeof value === "number")
    );
    if (values.length === 0) {
      return [0, 1];
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(1, max - min);
    const padding = Math.max(2, Math.round(spread * 0.12));
    return [min - padding, max + padding];
  }, [displayChartData]);

  if (chartData.length === 0) {
    return (
      <div className="triptych-scoring-chart relative mt-0.5 flex items-center justify-center">
        <span className={`triptych-micro-copy font-semibold uppercase tracking-[0.12em] ${getMutedTextClasses(theme)}`}>
          {t(language, "dashboard.movementAppearsAfterFinalScores")}
        </span>
      </div>
    );
  }

  return (
    <div className="triptych-scoring-chart relative mt-0.5">
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 z-10 text-[6px] font-semibold uppercase leading-none tracking-[0.08em] ${getMutedTextClasses(theme)}`}
      >
        {t(language, "dashboard.scoringAxisPoints")}
      </span>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayChartData} margin={{ top: 8, right: 6, bottom: 0, left: -2 }}>
          <CartesianGrid stroke={gridStroke} strokeWidth={0.7} strokeDasharray="1 5" />
          <XAxis
            dataKey="label"
            height={12}
            interval="preserveStartEnd"
            minTickGap={10}
            padding={{ left: 12, right: 12 }}
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 6, fontWeight: 600 }}
          />
          <YAxis
            width={14}
            domain={yDomain}
            tickCount={3}
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 6, fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="pacePoints"
            stroke={theme === "dark" ? "#fbbf24" : "#d97706"}
            strokeWidth={1.15}
            strokeDasharray="3 3"
            dot={singlePointPaceDot}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actualPoints"
            stroke={lineStroke}
            strokeWidth={1.45}
            dot={singlePointDot}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TriptychPicksInPlayChart({
  activity,
  language,
  theme
}: {
  activity: DashboardPicksInPlaySummary;
  language?: string | null;
  theme: TriptychTheme;
}) {
  const gridStroke = theme === "dark" ? "rgba(226, 232, 240, 0.16)" : "rgba(100, 116, 139, 0.16)";
  const tickFill = theme === "dark" ? "rgba(226, 232, 240, 0.62)" : "rgba(71, 85, 105, 0.62)";
  const inPlayStroke = theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)";
  const finalStroke = theme === "dark" ? "#fbbf24" : "#d97706";
  const todayStroke = theme === "dark" ? "rgba(226, 232, 240, 0.55)" : "rgba(71, 85, 105, 0.55)";
  const chartData = activity.history;
  const displayChartData = useMemo(() => buildDisplayPicksInPlayChartData(chartData), [chartData]);
  const yDomain = useMemo<[number, number]>(() => {
    const values = displayChartData.flatMap((point) => [point.inPlayCount, point.finalCount, point.todayCount]);
    if (values.length === 0) {
      return [0, 1];
    }

    const max = Math.max(...values, 1);
    return [0, max + 1];
  }, [displayChartData]);

  if (chartData.length === 0) {
    return (
      <div className="triptych-scoring-chart relative mt-0.5 flex items-center justify-center">
        <span className={`triptych-micro-copy font-semibold uppercase tracking-[0.12em] ${getMutedTextClasses(theme)}`}>
          {t(language, "dashboard.picksActivateAsMatchesBegin")}
        </span>
      </div>
    );
  }

  return (
    <div className="triptych-scoring-chart relative mt-0.5">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayChartData} margin={{ top: 8, right: 6, bottom: 0, left: -2 }}>
          <CartesianGrid stroke={gridStroke} strokeWidth={0.7} strokeDasharray="1 5" />
          <XAxis
            dataKey="label"
            height={12}
            interval="preserveStartEnd"
            minTickGap={10}
            padding={{ left: 12, right: 12 }}
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 6, fontWeight: 600 }}
          />
          <YAxis
            width={14}
            domain={yDomain}
            tickCount={3}
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 6, fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="todayCount"
            stroke={todayStroke}
            strokeWidth={1}
            strokeDasharray="2 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="finalCount"
            stroke={finalStroke}
            strokeWidth={1.15}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="inPlayCount"
            stroke={inPlayStroke}
            strokeWidth={1.45}
            dot={chartData.length === 1 ? { r: 2.4, strokeWidth: 0, fill: inPlayStroke } : false}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DashboardScoringDetailSheet({
  scoring,
  scoringLens,
  language,
  theme,
  onClose
}: {
  scoring: DashboardMovementSummary;
  scoringLens: TriptychScoringLens;
  language?: string | null;
  theme: TriptychTheme;
  onClose: () => void;
}) {
  if (scoringLens.mode === "picks_in_play") {
    return (
      <DashboardPicksInPlayDetailSheet
        activity={scoringLens.activity}
        language={language}
        theme={theme}
        onClose={onClose}
      />
    );
  }

  if (scoring.scoreKind === "projected" && scoring.projectedOutlook) {
    return (
      <DashboardProjectedOutlookDetailSheet
        outlook={scoring.projectedOutlook}
        language={language}
        theme={theme}
        onClose={onClose}
      />
    );
  }

  return (
    <DashboardScoreMovementDetailSheet
      score={scoring.score}
      scoreKind={scoring.scoreKind}
      language={language}
      theme={theme}
      onClose={onClose}
    />
  );
}

function DashboardProjectedOutlookDetailSheet({
  outlook,
  language,
  theme,
  onClose
}: {
  outlook: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>;
  language?: string | null;
  theme: TriptychTheme;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/35 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:px-5 sm:pb-4 sm:pt-4">
      <button type="button" aria-label={t(language, "common.close")} onClick={onClose} className="absolute inset-0" />
      <ProjectedOutlookDetailSurface
        outlook={outlook}
        language={language}
        theme={theme}
        onClose={onClose}
      />
    </div>
  );
}

function ProjectedOutlookDetailSurface({
  outlook,
  language,
  theme,
  onClose,
  preview = false
}: {
  outlook: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>;
  language?: string | null;
  theme: TriptychTheme;
  onClose?: () => void;
  preview?: boolean;
}) {
  const decisiveMatches = outlook.ceilingRiskGraph.decisiveMatches.slice(0, 2);

  return (
    <div
      role="dialog"
      aria-modal={preview ? undefined : true}
      aria-label="Projected outlook"
      className={`relative flex w-full max-w-xl min-w-0 flex-col overflow-x-hidden rounded-[1.35rem] border shadow-2xl sm:rounded-[1.5rem] ${
        preview ? "max-h-none" : "max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-24px)]"
      } ${theme === "dark" ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"}`}
      style={preview ? undefined : { width: "calc(100vw - 24px)" }}
    >
      <div className={`sticky top-0 z-[1] flex items-start justify-between gap-3 border-b px-3 py-3 sm:px-5 ${theme === "dark" ? "border-white/10 bg-slate-950" : "border-slate-200 bg-white"}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[11px] font-black uppercase leading-none tracking-[0.1em] sm:tracking-[0.14em] ${getMutedTextClasses(theme)}`}>
              Projected outlook
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t(language, "common.close")}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:h-10 sm:w-10 ${
              theme === "dark" ? "border-white/15 bg-white/5 text-white" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className={`min-w-0 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-3 sm:px-5 sm:pb-4 sm:pt-4 ${preview ? "" : ""}`}>
        <ProjectedOutlookStatStrip
          metrics={[
            {
              label: "Proj",
              desktopLabel: "Projected",
              value: formatPoints(outlook.summary.projectedFinalPoints, language)
            },
            {
              label: "Ceiling",
              desktopLabel: "Ceiling",
              value: formatPoints(outlook.ceiling.currentCeilingPoints, language)
            },
            {
              label: "Risk",
              desktopLabel: "Risk Next",
              value: formatPoints(outlook.ceiling.atRiskNextPoints, language)
            }
          ]}
          theme={theme}
        />

        <section className={`mt-3 rounded-[1.05rem] border px-2.5 py-2.5 sm:mt-4 sm:rounded-[1.25rem] sm:px-4 sm:py-4 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/70"}`}>
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
                Bracket ceiling
              </p>
              <p className={`text-xs font-semibold sm:text-sm ${getMutedTextClasses(theme)}`}>
                Max still alive
              </p>
            </div>
          </div>
          <ProjectedOutlookRiskGraph outlook={outlook} theme={theme} />
        </section>

        <section className="mt-4 sm:mt-5">
          <div className="mb-2">
            <h3 className={`text-sm font-black tracking-[-0.03em] sm:text-base ${getPrimaryTextClasses(theme)}`}>
              Next decisive matches
            </h3>
          </div>
          <div className="space-y-2">
            {decisiveMatches.length > 0 ? (
              decisiveMatches.map((match) => (
                <ProjectedOutlookDecisiveMatchRow key={match.matchId} match={match} theme={theme} />
              ))
            ) : (
              <div
                className={`rounded-[0.95rem] border px-3 py-2 text-sm font-semibold ${
                  theme === "dark" ? "border-white/10 bg-white/[0.03] text-white/70" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Decisive matches will appear as your picks come into play.
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 sm:mt-5">
          <div className="mb-2">
            <h3 className={`text-sm font-black tracking-[-0.03em] sm:text-base ${getPrimaryTextClasses(theme)}`}>
              Recent movement
            </h3>
          </div>
          <div className="space-y-2">
            {outlook.recentMovementRows.length === 0 ? (
              <div
                className={`rounded-[0.95rem] border px-3 py-2 text-sm font-semibold ${
                  theme === "dark" ? "border-white/10 bg-white/[0.03] text-white/70" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                Result checkpoints will appear here as the tournament unfolds.
              </div>
            ) : (
              outlook.recentMovementRows.slice(0, 4).map((row) => (
                <ProjectedOutlookRecentRow key={row.id} row={row} language={language} theme={theme} />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DashboardScoreMovementDetailSheet({
  score,
  scoreKind,
  language,
  theme,
  onClose
}: {
  score: DashboardMovementSummary["score"];
  scoreKind: DashboardMovementSummary["scoreKind"];
  language?: string | null;
  theme: TriptychTheme;
  onClose: () => void;
}) {
  const isProjected = scoreKind === "projected";
  const relevantHistory = useMemo(() => filterRelevantScoringHistory(score.history), [score.history]);
  const chartData = useMemo(
    () =>
      relevantHistory.map((point) => ({
        checkpointId: point.matchId,
        label: formatScoringChartLabel(point.createdAt, language),
        actualPoints: point.totalPoints,
        pacePoints: point.pacePoints
      })),
    [language, relevantHistory]
  );
  const displayChartData = useMemo(() => buildDisplayScoringChartData(chartData), [chartData]);
  const yDomain = useMemo<[number, number]>(() => {
    const values = displayChartData.flatMap((point) =>
      [point.actualPoints, point.pacePoints].filter((value): value is number => typeof value === "number")
    );
    if (values.length === 0) {
      return [0, 1];
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(1, max - min);
    const padding = Math.max(2, Math.round(spread * 0.14));
    return [Math.max(0, min - padding), max + padding];
  }, [displayChartData]);

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/35 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:px-5 sm:pb-4 sm:pt-4">
      <button type="button" aria-label={t(language, "common.close")} onClick={onClose} className="absolute inset-0" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isProjected ? "Projected movement" : t(language, "dashboard.scoringDetailTitle")}
        className={`relative flex w-full max-w-xl flex-col overflow-hidden rounded-[1.5rem] border shadow-2xl ${
          "max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-24px)]"
        } ${
          theme === "dark" ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"
        }`}
      >
        <div className={`sticky top-0 z-[1] flex items-center justify-between border-b px-4 py-3 sm:px-5 ${theme === "dark" ? "border-white/10 bg-slate-950" : "border-slate-200 bg-white"}`}>
          <div>
            <p className={`text-[11px] font-black uppercase tracking-[0.14em] ${getMutedTextClasses(theme)}`}>
              {isProjected ? "Projected" : t(language, "dashboard.scoringTrack")}
            </p>
            <h2 className="text-xl font-black tracking-[-0.04em]">{isProjected ? "Projected movement" : t(language, "dashboard.scoringDetailTitle")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(language, "common.close")}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${
              theme === "dark" ? "border-white/15 bg-white/5 text-white" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4 pt-4 sm:px-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DetailMetricCard label={isProjected ? "Projected pts" : t(language, "leaderboard.points")} value={formatPoints(score.currentPoints, language)} theme={theme} />
            <DetailMetricCard label={t(language, "leaderboard.rank")} value={formatRank(score.currentRank, language)} theme={theme} />
            <DetailMetricCard label={t(language, "dashboard.todayShort")} value={formatSignedMetric(score.pointsChange, language)} theme={theme} />
            <DetailMetricCard label="+/-" value={formatSignedMetric(score.rankChange, language)} theme={theme} />
            <DetailMetricCard label={t(language, "dashboard.scoringPaceShort")} value={formatPoints(score.currentPacePoints, language)} theme={theme} />
            <DetailMetricCard label={t(language, "dashboard.scoringVsPaceShort")} value={formatSignedMetric(score.deltaFromPace, language)} theme={theme} />
          </div>

          <div className={`mt-4 rounded-[1.25rem] border px-3 py-3 sm:px-4 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/70"}`}>
            {chartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-center">
                <span className={`text-sm font-semibold ${getMutedTextClasses(theme)}`}>
                  {t(language, "dashboard.movementAppearsAfterFinalScores")}
                </span>
              </div>
            ) : (
              <div className="h-48 sm:h-56" aria-label={t(language, "dashboard.scoringPreviewAria")}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayChartData} margin={{ top: 10, right: 12, bottom: 2, left: 0 }}>
                    <CartesianGrid
                      stroke={theme === "dark" ? "rgba(226,232,240,0.18)" : "rgba(100,116,139,0.14)"}
                      strokeDasharray="2 5"
                      strokeWidth={0.8}
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: theme === "dark" ? "rgba(226,232,240,0.62)" : "rgba(71,85,105,0.72)", fontSize: 10, fontWeight: 600 }}
                      minTickGap={16}
                    />
                    <YAxis
                      domain={yDomain}
                      width={22}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: theme === "dark" ? "rgba(226,232,240,0.62)" : "rgba(71,85,105,0.72)", fontSize: 10, fontWeight: 600 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pacePoints"
                      stroke={theme === "dark" ? "#fbbf24" : "#d97706"}
                      strokeWidth={1.6}
                      strokeDasharray="4 4"
                      dot={{ r: 2.1, strokeWidth: 0, fill: theme === "dark" ? "#fbbf24" : "#d97706" }}
                      activeDot={{ r: 3.2 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualPoints"
                      stroke={theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)"}
                      strokeWidth={2}
                      dot={{ r: 2.25, strokeWidth: 0, fill: theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)" }}
                      activeDot={{ r: 3.5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {chartData.length === 0 ? null : (
            <p className={`mt-3 text-xs font-semibold ${getMutedTextClasses(theme)}`}>
              {isProjected ? "Projected uses current group tables and your picks." : t(language, "dashboard.scoringPaceHint")}
            </p>
          )}

          <div className="mt-4 space-y-2">
            {relevantHistory.length === 0 ? null : relevantHistory.slice().reverse().map((point) => (
              <ScoringTimelineRow key={`${point.matchId}-${point.createdAt}`} point={point} language={language} theme={theme} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPicksInPlayDetailSheet({
  activity,
  language,
  theme,
  onClose
}: {
  activity: DashboardPicksInPlaySummary;
  language?: string | null;
  theme: TriptychTheme;
  onClose: () => void;
}) {
  const chartData = activity.history;
  const displayChartData = useMemo(() => buildDisplayPicksInPlayChartData(chartData), [chartData]);
  const yDomain = useMemo<[number, number]>(() => {
    const values = displayChartData.flatMap((point) => [point.inPlayCount, point.finalCount, point.todayCount]);
    if (values.length === 0) {
      return [0, 1];
    }

    return [0, Math.max(...values, 1) + 1];
  }, [displayChartData]);

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/35 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:items-center sm:px-5 sm:pb-4 sm:pt-4">
      <button type="button" aria-label={t(language, "common.close")} onClick={onClose} className="absolute inset-0" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(language, "dashboard.picksInPlay")}
        className={`relative flex w-full max-w-xl flex-col overflow-hidden rounded-[1.5rem] border shadow-2xl ${
          "max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-24px)]"
        } ${
          theme === "dark" ? "border-white/10 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"
        }`}
      >
        <div className={`sticky top-0 z-[1] flex items-center justify-between border-b px-4 py-3 sm:px-5 ${theme === "dark" ? "border-white/10 bg-slate-950" : "border-slate-200 bg-white"}`}>
          <div>
            <p className={`text-[11px] font-black uppercase tracking-[0.14em] ${getMutedTextClasses(theme)}`}>
              {t(language, "dashboard.picksInPlay")}
            </p>
            <h2 className="text-xl font-black tracking-[-0.04em]">{t(language, "dashboard.picksInPlay")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(language, "common.close")}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${
              theme === "dark" ? "border-white/15 bg-white/5 text-white" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4 pt-4 sm:px-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DetailMetricCard label={t(language, "dashboard.inPlayShort")} value={formatNumber(activity.activePickCount, language)} theme={theme} />
            <DetailMetricCard label={t(language, "dashboard.finalShort")} value={formatNumber(activity.finalizedMatchCount, language)} theme={theme} />
            <DetailMetricCard label={t(language, "dashboard.todayShort")} value={formatNumber(activity.todayRelevantMatchCount, language)} theme={theme} />
            <DetailMetricCard label={t(language, "dashboard.nextRelevantShort")} value={activity.nextRelevantMatch ? formatShortMatchLabel(activity.nextRelevantMatch) : "—"} theme={theme} />
          </div>

          <div className={`mt-4 rounded-[1.25rem] border px-3 py-3 sm:px-4 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/70"}`}>
            {chartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-center">
                <span className={`text-sm font-semibold ${getMutedTextClasses(theme)}`}>
                  {t(language, "dashboard.picksActivateAsMatchesBegin")}
                </span>
              </div>
            ) : (
              <div className="h-48 sm:h-56" aria-label={t(language, "dashboard.picksInPlay")}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayChartData} margin={{ top: 10, right: 12, bottom: 2, left: 0 }}>
                    <CartesianGrid
                      stroke={theme === "dark" ? "rgba(226,232,240,0.18)" : "rgba(100,116,139,0.14)"}
                      strokeDasharray="2 5"
                      strokeWidth={0.8}
                    />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: theme === "dark" ? "rgba(226,232,240,0.62)" : "rgba(71,85,105,0.72)", fontSize: 10, fontWeight: 600 }}
                      minTickGap={16}
                    />
                    <YAxis
                      domain={yDomain}
                      width={22}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: theme === "dark" ? "rgba(226,232,240,0.62)" : "rgba(71,85,105,0.72)", fontSize: 10, fontWeight: 600 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="todayCount"
                      stroke={theme === "dark" ? "rgba(226,232,240,0.55)" : "rgba(71,85,105,0.55)"}
                      strokeWidth={1.2}
                      strokeDasharray="2 4"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="finalCount"
                      stroke={theme === "dark" ? "#fbbf24" : "#d97706"}
                      strokeWidth={1.6}
                      dot={{ r: 2.1, strokeWidth: 0, fill: theme === "dark" ? "#fbbf24" : "#d97706" }}
                      activeDot={{ r: 3.2 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="inPlayCount"
                      stroke={theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)"}
                      strokeWidth={2}
                      dot={{ r: 2.25, strokeWidth: 0, fill: theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)" }}
                      activeDot={{ r: 3.5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <p className={`mt-3 text-xs font-semibold ${getMutedTextClasses(theme)}`}>
            {t(language, "dashboard.scoresAppearAfterCheckpoints")}
          </p>

          {activity.nextRelevantMatch ? (
            <div className={`mt-4 rounded-[1rem] border px-3 py-2 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
              <p className={`triptych-micro-copy font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
                {t(language, "dashboard.nextRelevantMatch")}
              </p>
              <p className={`mt-1 text-sm font-black tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>
                {formatMatchSummary(activity.nextRelevantMatch, language)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CompactMetric({
  label,
  value,
  theme
}: {
  label: string;
  value: string;
  theme: TriptychTheme;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span className={`triptych-micro-copy font-semibold uppercase tracking-[0.12em] ${getMutedTextClasses(theme)}`}>{label}</span>
      <span className={`max-w-[4.5rem] truncate text-[11px] font-black tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>{value}</span>
    </div>
  );
}

function ProjectedOutlookCompactContent({
  outlook,
  language,
  theme
}: {
  outlook: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>;
  language?: string | null;
  theme: TriptychTheme;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(240);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.max(Math.round(element.getBoundingClientRect().width), 220);
      setContainerWidth((current) => (Math.abs(current - nextWidth) < 2 ? current : nextWidth));
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const useSingleMetric = containerWidth < 300;

  return (
    <div ref={containerRef} className="flex h-full w-full min-w-0 flex-col px-1 pb-1 pt-0.5 text-center">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <ProjectedOutlookRiskGraph outlook={outlook} theme={theme} compact />
      </div>
      {useSingleMetric ? (
        <div className="mt-0.5 min-w-0 pb-0 text-center">
          <span className={`block truncate text-[8px] font-semibold uppercase leading-none tracking-[0.06em] ${getMutedTextClasses(theme)}`}>
            Proj
          </span>
          <span className={`mt-0.5 block truncate text-[13px] font-black leading-none tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>
            {formatPoints(outlook.summary.projectedFinalPoints, language)}
          </span>
        </div>
      ) : (
        <div className="mt-1 grid w-full grid-cols-3 gap-x-1.5 gap-y-1 pb-0.5 sm:gap-x-2">
          <ProjectedOutlookCompactMetric label="Proj" value={formatPoints(outlook.summary.projectedFinalPoints, language)} theme={theme} />
          <ProjectedOutlookCompactMetric label="Ceiling" value={formatPoints(outlook.ceiling.currentCeilingPoints, language)} theme={theme} />
          <ProjectedOutlookCompactMetric label="Risk" value={formatPoints(outlook.ceiling.atRiskNextPoints, language)} theme={theme} />
        </div>
      )}
    </div>
  );
}

function ProjectedOutlookStatStrip({
  metrics,
  theme
}: {
  metrics: Array<{
    label: string;
    desktopLabel?: string;
    value: string;
  }>;
  theme: TriptychTheme;
}) {
  return (
    <div className="grid min-w-0 grid-cols-3 gap-x-2 sm:gap-x-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="min-w-0 text-center">
          <p className={`truncate text-[10px] font-black uppercase leading-none tracking-[0.08em] sm:text-[11px] sm:tracking-[0.12em] ${getMutedTextClasses(theme)}`}>
            <span className="sm:hidden">{metric.label}</span>
            <span className="hidden sm:inline">{metric.desktopLabel ?? metric.label}</span>
          </p>
          <p className={`mt-1 truncate text-base font-black leading-none tracking-[-0.04em] sm:text-lg ${getPrimaryTextClasses(theme)}`}>{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

function DetailMetricCard({
  label,
  value,
  theme
}: {
  label: string;
  value: string;
  theme: TriptychTheme;
}) {
  return (
    <div className={`rounded-[1rem] border px-3 py-2 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-slate-50/70"}`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${getMutedTextClasses(theme)}`}>{label}</p>
      <p className={`mt-1 text-lg font-black tracking-[-0.04em] ${getPrimaryTextClasses(theme)}`}>{value}</p>
    </div>
  );
}

function ProjectedOutlookRiskGraph({
  outlook,
  theme,
  compact = false
}: {
  outlook: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>;
  theme: TriptychTheme;
  compact?: boolean;
}) {
  const model = outlook.ceilingRiskGraph;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(compact ? 240 : 560);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(
    compact ? null : model.graphPoints.find((point) => point.kind === "now")?.id ?? model.graphPoints[0]?.id ?? null
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.max(Math.round(element.getBoundingClientRect().width), compact ? 220 : 320);
      setContainerWidth((current) => (Math.abs(current - nextWidth) < 2 ? current : nextWidth));
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [compact]);

  const chart = useMemo(
    () =>
      buildCeilingRiskSvgModel(model, {
        variant: compact ? "compact" : "modal",
        width: containerWidth
      }),
    [compact, containerWidth, model]
  );
  const selectedTooltip = selectedPointId ? model.tooltipsByPointId[selectedPointId] ?? null : null;

  if (chart.points.length === 0) {
    return (
      <div className={`flex ${compact ? "h-16" : "h-48"} items-center justify-center text-center`}>
        <span className={`text-sm font-semibold ${getMutedTextClasses(theme)}`}>Bracket ceiling will appear as more results land.</span>
      </div>
    );
  }

  const axisStroke = theme === "dark" ? "rgba(226,232,240,0.26)" : "rgba(100,116,139,0.24)";
  const textFill = theme === "dark" ? "rgba(226,232,240,0.72)" : "rgba(51,65,85,0.72)";
  const solidStroke = theme === "dark" ? "#f8fafc" : "#0f172a";
  const riskFill = theme === "dark" ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.34)";
  const historyFill = theme === "dark" ? "rgba(96,165,250,0.22)" : "rgba(96,165,250,0.18)";

  return (
    <div className="min-w-0">
      <div
        ref={containerRef}
        className="w-full"
        style={{
          height: compact ? "100%" : "clamp(180px, 55vw, 240px)"
        }}
      >
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Bracket ceiling risk graph"
        >
          <line x1={chart.padding.left} y1={chart.padding.top} x2={chart.padding.left} y2={chart.height - chart.padding.bottom} stroke={solidStroke} strokeWidth={compact ? 1.4 : 1.8} />
          <line x1={chart.padding.left} y1={chart.height - chart.padding.bottom} x2={chart.width - chart.padding.right} y2={chart.height - chart.padding.bottom} stroke={solidStroke} strokeWidth={compact ? 1.4 : 1.8} />

          {chart.yTicks.map((tick) => (
            <g key={tick.value}>
              <line x1={chart.padding.left} y1={tick.y} x2={chart.width - chart.padding.right} y2={tick.y} stroke={axisStroke} strokeDasharray={compact ? "2 5" : "3 6"} />
              <text x={chart.padding.left - 8} y={tick.y + 4} textAnchor="end" fontSize={compact ? 7 : 10} fontWeight={700} fill={textFill}>
                {tick.label}
              </text>
            </g>
          ))}

          {chart.historyAreaPath ? <path d={chart.historyAreaPath} fill={historyFill} /> : null}
          {chart.futureWedgePath ? <path d={chart.futureWedgePath} fill={riskFill} /> : null}
          {chart.historyPath ? <path d={chart.historyPath} fill="none" stroke={solidStroke} strokeWidth={compact ? 1.1 : 1.45} strokeLinecap="round" strokeLinejoin="round" /> : null}
          {chart.futureBestPath ? <path d={chart.futureBestPath} fill="none" stroke={solidStroke} strokeWidth={compact ? 1 : 1.3} strokeDasharray={compact ? "4 4" : "6 5"} strokeLinecap="round" /> : null}
          {chart.futureWorstPath ? <path d={chart.futureWorstPath} fill="none" stroke={solidStroke} strokeWidth={compact ? 1 : 1.3} strokeDasharray={compact ? "4 4" : "6 5"} strokeLinecap="round" /> : null}

          {chart.points.map((point) => {
            const isFuturePoint = point.kind === "future_best" || point.kind === "future_worst";
            const dotFill = isFuturePoint ? "#0b0b0b" : solidStroke;
            const dotStroke = isFuturePoint ? "#ffffff" : solidStroke;

            return (
              <g key={point.id}>
                {compact ? null : (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={16}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => setSelectedPointId(point.id)}
                  />
                )}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={compact ? 3.3 : 5}
                  fill={dotFill}
                  stroke={dotStroke}
                  strokeWidth={compact ? 1.5 : 2}
                  className={compact ? undefined : "cursor-pointer"}
                  onClick={compact ? undefined : () => setSelectedPointId(point.id)}
                />
              </g>
            );
          })}

          {chart.xLabels.map((label) => (
            <text
              key={`${label.key}-${label.text}`}
              x={label.x}
              y={chart.height - chart.padding.bottom + (compact ? 12 : 18)}
              textAnchor="middle"
              fontSize={compact ? 7.5 : 11}
              fontWeight={700}
              fill={textFill}
            >
              {label.text}
            </text>
          ))}
        </svg>
      </div>

      {compact || !selectedTooltip ? null : (
        <div className={`mt-3 rounded-[0.95rem] border px-3 py-2 ${theme === "dark" ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white"}`}>
          <p className={`text-[10px] font-black uppercase tracking-[0.12em] ${getMutedTextClasses(theme)}`}>{selectedTooltip.title}</p>
          <div className="mt-1 space-y-1">
            {selectedTooltip.lines.map((line) => (
              <p key={line} className={`text-sm font-semibold ${getPrimaryTextClasses(theme)}`}>{line}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildCeilingRiskSvgModel(
  model: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>["ceilingRiskGraph"],
  options: {
    variant: "compact" | "modal";
    width: number;
  }
) {
  const compact = options.variant === "compact";
  const width = Math.max(Math.round(options.width), compact ? 220 : 320);
  const height = compact ? 248 : width < 390 ? 228 : 248;
  const padding = compact
    ? { top: 6, right: 6, bottom: 14, left: 6 }
    : width < 390
      ? { top: 14, right: 12, bottom: 22, left: 44 }
      : { top: 18, right: 18, bottom: 30, left: 52 };

  const historyPoints = model.graphPoints.filter((point) => point.kind === "history" || point.kind === "now");
  const futureBest = model.graphPoints.find((point) => point.kind === "future_best") ?? null;
  const futureWorst = model.graphPoints.find((point) => point.kind === "future_worst") ?? null;
  const values = model.graphPoints.map((point) => point.ceilingPoints);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const rawSpread = Math.max(maxValue - minValue, 0);
  const spread = Math.max(compact ? 3 : 4, rawSpread);
  const lowerPadding = Math.max(compact ? 1.25 : 1.75, spread * (compact ? 0.08 : 0.1));
  const upperPadding = Math.max(compact ? 1.75 : 2.25, spread * (compact ? 0.1 : 0.12));
  const domainMin = Math.max(0, minValue - lowerPadding);
  const domainMax = maxValue + upperPadding;
  const plotHeight = height - padding.top - padding.bottom;
  const scaleY = (value: number) => padding.top + ((domainMax - value) / Math.max(domainMax - domainMin, 1)) * plotHeight;
  const plotWidth = width - padding.left - padding.right;
  const hasFuture = Boolean(futureBest || futureWorst);
  const futureReserve = hasFuture ? Math.max(compact ? 72 : 104, plotWidth * (compact ? 0.31 : 0.28)) : 0;
  const historyRightX = width - padding.right - futureReserve;
  const effectiveHistoryWidth = Math.max(historyRightX - padding.left, plotWidth * 0.45);
  const historyStep = historyPoints.length > 1 ? effectiveHistoryWidth / (historyPoints.length - 1) : 0;
  const futureX = hasFuture ? width - padding.right : historyRightX;

  const pointMap = new Map<string, { id: string; x: number; y: number; kind: string }>();
  historyPoints.forEach((point, index) => {
    pointMap.set(point.id, {
      id: point.id,
      x: padding.left + historyStep * index,
      y: scaleY(point.ceilingPoints),
      kind: point.kind
    });
  });
  if (futureBest) {
    pointMap.set(futureBest.id, { id: futureBest.id, x: futureX, y: scaleY(futureBest.ceilingPoints), kind: futureBest.kind });
  }
  if (futureWorst) {
    pointMap.set(futureWorst.id, { id: futureWorst.id, x: futureX, y: scaleY(futureWorst.ceilingPoints), kind: futureWorst.kind });
  }

  const historicalCoords = historyPoints.map((point) => ({
    ...point,
    x: pointMap.get(point.id)!.x,
    y: pointMap.get(point.id)!.y
  }));
  const historyPath = historicalCoords.length > 1
    ? `M ${historicalCoords.map((point) => `${point.x} ${point.y}`).join(" L ")}`
    : null;
  const nowCoord = historicalCoords.at(-1) ?? null;
  const futureBestCoord = futureBest ? pointMap.get(futureBest.id)! : null;
  const futureWorstCoord = futureWorst ? pointMap.get(futureWorst.id)! : null;
  const historyAreaPath =
    historicalCoords.length > 1
      ? [
          historyPath,
          futureBestCoord ? `L ${futureBestCoord.x} ${futureBestCoord.y}` : "",
          `L ${futureBestCoord?.x ?? historicalCoords[historicalCoords.length - 1]!.x} ${height - padding.bottom}`,
          `L ${historicalCoords[0]!.x} ${height - padding.bottom} Z`
        ]
          .filter(Boolean)
          .join(" ")
      : null;
  const futureBestPath =
    nowCoord && futureBestCoord
      ? `M ${nowCoord.x} ${nowCoord.y} L ${futureBestCoord.x} ${futureBestCoord.y}`
      : null;
  const futureWorstPath =
    nowCoord && futureWorstCoord
      ? `M ${nowCoord.x} ${nowCoord.y} L ${futureWorstCoord.x} ${futureWorstCoord.y}`
      : null;
  const futureWedgePath =
    nowCoord && futureBestCoord && futureWorstCoord
      ? `M ${nowCoord.x} ${nowCoord.y} L ${futureBestCoord.x} ${futureBestCoord.y} L ${futureWorstCoord.x} ${futureWorstCoord.y} Z`
      : null;

  const tickValues = compact
    ? []
    : Array.from(new Set([domainMax, (domainMax + domainMin) / 2, domainMin].map((value) => roundChartNumber(value))));
  const yTicks = tickValues
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((left, right) => right - left)
    .slice(0, width < 430 ? 2 : 3)
    .map((value) => ({ value, y: scaleY(value), label: `${value}` }));

  const xLabels = buildDateAxisLabels({
    historyPoints,
    pointMap,
    futureBest,
    futureBestCoord
  });

  return {
    width,
    height,
    padding,
    points: Array.from(pointMap.values()),
    historyPath,
    historyAreaPath,
    futureBestPath,
    futureWorstPath,
    futureWedgePath,
    yTicks,
    xLabels
  };
}

function roundChartNumber(value: number) {
  return Math.round(value * 10) / 10;
}

function buildDateAxisLabels(input: {
  historyPoints: Array<{
    id: string;
    shortLabel: string;
  }>;
  pointMap: Map<string, { id: string; x: number; y: number; kind: string }>;
  futureBest: { id: string; shortLabel: string } | null;
  futureBestCoord: { id: string; x: number; y: number; kind: string } | null;
}) {
  const labels: Array<{ key: string; x: number; text: string }> = [];
  const first = input.historyPoints[0];
  const now = input.historyPoints.at(-1);

  if (first) {
    labels.push({
      key: first.id,
      x: input.pointMap.get(first.id)!.x,
      text: buildCompactCeilingRiskDateLabel(first.shortLabel, "")
    });
  }

  if (now && now.id !== first?.id) {
    labels.push({
      key: now.id,
      x: input.pointMap.get(now.id)!.x,
      text: buildCompactCeilingRiskDateLabel(now.shortLabel, "")
    });
  }

  if (input.futureBest && input.futureBestCoord) {
    labels.push({
      key: input.futureBest.id,
      x: input.futureBestCoord.x,
      text: buildCompactCeilingRiskDateLabel(input.futureBest.shortLabel, "")
    });
  }

  const seen = new Set<string>();
  return labels.filter((label) => {
    const normalized = label.text.trim();
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function buildCompactCeilingRiskDateLabel(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function ProjectedOutlookCompactMetric({
  label,
  value,
  theme
}: {
  label: string;
  value: string;
  theme: TriptychTheme;
}) {
  return (
    <div className="min-w-0 text-center">
      <span className={`block truncate text-[8px] font-semibold uppercase leading-none tracking-[0.04em] sm:text-[10px] sm:tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
        {label}
      </span>
      <span className={`mt-1 block truncate text-[11px] font-black leading-none tracking-[-0.03em] sm:text-xs ${getPrimaryTextClasses(theme)}`}>
        {value}
      </span>
    </div>
  );
}

function ProjectedOutlookDecisiveMatchRow({
  match,
  theme
}: {
  match: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>["ceilingRiskGraph"]["decisiveMatches"][number];
  theme: TriptychTheme;
}) {
  const secondaryLabel = buildProjectedOutlookMatchSecondaryLabel(match);
  return (
    <div className={`rounded-[0.95rem] border px-3 py-2.5 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-black tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>{match.compactLabel}</p>
          {secondaryLabel ? (
            <p className={`mt-1 truncate text-[11px] font-semibold ${getMutedTextClasses(theme)}`}>
              {secondaryLabel}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
            theme === "dark" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-700"
          }`}>
            {match.pointsAtStake === null ? "—" : `${formatPoints(match.pointsAtStake, null)} pts`}
          </span>
          {match.goalDifferenceSensitive ? (
            <div className="mt-1">
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${
                theme === "dark" ? "border-white/10 bg-white/[0.04] text-white/75" : "border-slate-200 bg-slate-50 text-slate-600"
              }`}>
                GD
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 min-h-[1rem]">
        {match.probabilityChips.length > 0 ? (
          <p className={`truncate text-[11px] font-semibold ${getMutedTextClasses(theme)}`}>
            {match.probabilityChips.map((chip) => chip.label).join(" · ")}
          </p>
        ) : match.affectedPickLabels.length > 0 ? (
          <p className={`truncate text-[11px] font-semibold ${getMutedTextClasses(theme)}`}>
            {match.affectedPickLabels.join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function buildProjectedOutlookMatchSecondaryLabel(
  match: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>["ceilingRiskGraph"]["decisiveMatches"][number]
) {
  if (match.goalDifferenceSensitive) {
    return "GD swing";
  }

  if (match.kickoffLabel) {
    const kickoffDate = match.kickoffLabel.split("·")[0]?.trim();
    if (kickoffDate) {
      return kickoffDate;
    }
  }

  const hasThirdPlaceExposure = match.affectedPickLabels.some((label) => label.toLowerCase().includes("3rd"));
  if (hasThirdPlaceExposure) {
    return "3rd-place swing";
  }

  if (match.pointsAtStake && match.pointsAtStake > 0) {
    return "Projected swing";
  }

  return null;
}

function ScoringTimelineRow({
  point,
  language,
  theme
}: {
  point: DashboardScoringHistoryPoint;
  language?: string | null;
  theme: TriptychTheme;
}) {
  return (
    <div className={`flex items-center justify-between rounded-[1rem] border px-3 py-2 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
      <div className="min-w-0">
        <p className={`truncate text-sm font-black tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>
          {formatScoringTimelineTimestamp(point.createdAt, language)}
        </p>
        <p className={`triptych-micro-copy truncate font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
          {point.matchId}
        </p>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-3 text-right">
        <div>
          <p className={`triptych-micro-copy font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>{t(language, "leaderboard.points")}</p>
          <p className={`text-sm font-black ${getPrimaryTextClasses(theme)}`}>{formatNumber(point.totalPoints, language)}</p>
        </div>
        <div>
          <p className={`triptych-micro-copy font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>{t(language, "leaderboard.rank")}</p>
          <p className={`text-sm font-black ${getPrimaryTextClasses(theme)}`}>{formatNumber(point.rank, language)}</p>
        </div>
        <div>
          <p className={`triptych-micro-copy font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>{t(language, "dashboard.scoringPaceShort")}</p>
          <p className={`text-sm font-black ${getPrimaryTextClasses(theme)}`}>{formatPoints(point.pacePoints, language)}</p>
        </div>
        <div>
          <p className={`triptych-micro-copy font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>+/-</p>
          <p className={`text-sm font-black ${getPrimaryTextClasses(theme)}`}>{formatSignedMetric(point.paceDelta, language)}</p>
        </div>
      </div>
    </div>
  );
}

export function DashboardProjectedOutlookDevPreview({
  outlook,
  language,
  theme = "light"
}: {
  outlook: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>;
  language?: string | null;
  theme?: TriptychTheme;
}) {
  const widths = [320, 360, 390, 430];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-black tracking-[-0.04em]">Compact widget</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {widths.map((width) => (
            <div key={`compact-${width}`} className="space-y-2">
              <p className="text-sm font-semibold text-slate-600">{width}px</p>
              <div
                className={`overflow-hidden rounded-[1.25rem] border p-3 ${
                  theme === "dark" ? "border-white/10 bg-slate-950" : "border-slate-200 bg-white"
                }`}
                style={{ width }}
              >
                <ProjectedOutlookCompactContent outlook={outlook} language={language} theme={theme} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-black tracking-[-0.04em]">Detail surface</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {widths.map((width) => (
            <div key={`detail-${width}`} className="space-y-2">
              <p className="text-sm font-semibold text-slate-600">{width}px</p>
              <div style={{ width }}>
                <ProjectedOutlookDetailSurface
                  outlook={outlook}
                  language={language}
                  theme={theme}
                  preview
                />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">Desktop modal width</p>
          <div className="max-w-xl">
            <ProjectedOutlookDetailSurface
              outlook={outlook}
              language={language}
              theme={theme}
              preview
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function ProjectedOutlookRecentRow({
  row,
  language,
  theme
}: {
  row: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>["recentMovementRows"][number];
  language?: string | null;
  theme: TriptychTheme;
}) {
  return (
    <div className={`flex items-center justify-between rounded-[1rem] border px-3 py-2 ${theme === "dark" ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white"}`}>
      <div className="min-w-0">
        <p className={`truncate text-sm font-black tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>
          {row.compactLabel}
        </p>
      </div>
      <p className={`ml-3 shrink-0 text-sm font-black ${getPrimaryTextClasses(theme)}`}>
        {formatSignedMetric(row.changeFromPrevious, language)}
      </p>
    </div>
  );
}

function TriptychPanelViewCue({
  isOpen,
  onToggle,
  onTouchStart,
  onTouchEnd,
  contentId,
  theme,
  label
}: {
  isOpen: boolean;
  onToggle: () => void;
  onTouchStart: (event: TouchEvent<HTMLButtonElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLButtonElement>) => void;
  contentId: string;
  theme: TriptychTheme;
  label: string;
}) {
  return (
    <div
      className={`absolute inset-x-1 bottom-[-7px] z-20 flex items-end justify-center text-[15px] leading-none ${theme === "dark" ? "text-white/55" : "text-slate-500/90"}`}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={label}
        onClick={onToggle}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="inline-flex h-10 items-end gap-1 rounded-full px-2 pb-0.5 transition-colors hover:text-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {isOpen ? (
          <ChevronDown aria-hidden className="h-5 w-5" strokeWidth={2.6} />
        ) : (
          <ChevronUp aria-hidden className="h-5 w-5" strokeWidth={2.6} />
        )}
      </button>
    </div>
  );
}

function PerformancePanel({
  performance,
  language,
  theme,
  onToggleTheme
}: {
  performance: DashboardCommandCenterSummary["performance"];
  language?: string | null;
  theme: TriptychTheme;
  onToggleTheme: () => void;
}) {
  const ThemeToggleIcon = theme === "dark" ? SunMedium : Moon;

  return (
    <PanelShell accentTone="neutral" theme={theme} className="triptych-compact-type">
      <div className={`relative flex h-full w-full flex-col justify-center divide-y px-1 pb-4 sm:px-4 md:px-5 lg:px-6 xl:px-7 ${getDividerClasses(theme)}`}>
        <MetricRow label={t(language, "leaderboard.points")} value={formatPoints(performance.globalPoints, language)} theme={theme} />
        <MetricRow label={t(language, "leaderboard.rank")} value={formatRank(performance.globalRank, language)} theme={theme} />
        <GroupsSummaryRows
          title={t(language, "dashboard.myGroups")}
          invitedLabel={t(language, "dashboard.invitedShort")}
          invitedValue={formatNumber(performance.invitedGroups, language)}
          managedLabel={t(language, "dashboard.managedShort")}
          managedValue={formatNumber(performance.managedGroups, language)}
          theme={theme}
        />
        <MetricRow
          labelLines={[t(language, "dashboard.totalPlayersLine1"), t(language, "dashboard.totalPlayersLine2")]}
          value={formatNumber(performance.totalPlayers, language)}
          theme={theme}
        />
        <button
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          aria-label={t(language, theme === "dark" ? "dashboard.triptychSwitchToLightAria" : "dashboard.triptychSwitchToDarkAria")}
          onClick={onToggleTheme}
          title={t(language, theme === "dark" ? "dashboard.triptychSwitchToLight" : "dashboard.triptychSwitchToDark")}
          className={`absolute bottom-0 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${getTriptychToggleClasses(theme)}`}
        >
          <ThemeToggleIcon aria-hidden className="h-3.5 w-3.5" strokeWidth={2.1} />
        </button>
      </div>
    </PanelShell>
  );
}

function ReminderPanel({
  reminder,
  nowMs,
  language,
  theme
}: {
  reminder: DashboardCommandCenterSummary["reminder"];
  nowMs: number;
  language?: string | null;
  theme: TriptychTheme;
}) {
  if (reminder.followedTeamCount === 0) {
    return (
      <Link
        href="/profile#followed-teams"
        className={`relative flex h-[200px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.15rem] border px-2.5 py-2.5 text-center transition hover:border-accent/50 hover:bg-accent-light/20 ${getPanelShellClasses("green", theme)}`}
      >
        <div className={`pointer-events-none absolute inset-px rounded-[1.05rem] ${getPanelInnerSurfaceClasses("green", theme)}`} />
        <div className={`pointer-events-none absolute -right-10 top-0 h-20 w-20 rounded-full blur-2xl ${getPanelGlowClasses("green", theme)}`} />
        <div className="relative flex h-full flex-col items-center justify-center">
          <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-[0_1px_0_rgba(255,255,255,0.55)] ${theme === "dark" ? "border-white/20 bg-white/10 text-accent-light" : "border-white/80 bg-white/85 text-accent-dark"}`}>
            <BellRing aria-hidden className="h-4 w-4" />
          </span>
          <p className={`mt-2 max-w-full truncate font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
            <span className="triptych-micro-copy">{t(language, "dashboard.reminders")}</span>
          </p>
          <p className={`mt-1 max-w-full text-[10px] font-black leading-3 tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>{t(language, "dashboard.pickTeamsToFollow")}</p>
        </div>
      </Link>
    );
  }

  const hasLiveMatches = reminder.liveMatches.length > 0;
  const tone = hasLiveMatches ? "red" : getDeadlineUrgency(reminder.nextMatch?.kickoffTime ?? null, nowMs);
  const reminderTimeLabel = hasLiveMatches
    ? t(language, "common.live")
    : getLocalizedReminderLabel(reminder.nextMatch?.kickoffTime ?? null, language, nowMs, t(language, "dashboard.noMatch"));
  const upcomingMatches = reminder.upcomingMatches.length > 0
    ? reminder.upcomingMatches
    : reminder.nextMatch
      ? [reminder.nextMatch]
      : [];
  const showSwipeCue = !hasLiveMatches && upcomingMatches.length > 1;

  return (
    <PanelShell accentTone={tone} theme={theme}>
      <div className="relative flex h-full min-h-0 w-full flex-col items-center text-center">
        <div className="flex shrink-0 flex-col items-center justify-center gap-1.5 [-webkit-text-size-adjust:100%] [text-size-adjust:100%]">
          <p className={`max-w-full truncate font-semibold uppercase leading-none tracking-[0.12em] ${getMutedTextClasses(theme)}`}>
            <span className="triptych-micro-copy">{t(language, "dashboard.nextMatch")}</span>
          </p>
          <ReminderChip tone={tone} label={reminderTimeLabel} theme={theme} />
        </div>
      <div className="flex min-h-0 w-full flex-1 pt-3">
        {hasLiveMatches ? (
          <div className="flex w-full flex-col justify-center gap-2 overflow-y-auto">
            {reminder.liveMatches.slice(0, 2).map((match) => (
              <CompactLiveMatch key={match.id} match={match} language={language} theme={theme} />
            ))}
          </div>
        ) : upcomingMatches.length > 0 ? (
          <UpcomingMatchSlider matches={upcomingMatches} language={language} theme={theme} />
        ) : (
          <div className="flex w-full items-center justify-center px-1 text-center">
            <p className={`text-[8px] font-semibold leading-3 ${getMutedTextClasses(theme)}`}>{t(language, "dashboard.noUpcomingMatch")}</p>
          </div>
        )}
      </div>
      {showSwipeCue ? <SwipeCueArrows theme={theme} /> : null}
      </div>
    </PanelShell>
  );
}

function UpcomingMatchSlider({
  matches,
  language,
  theme
}: {
  matches: DashboardMatchSummary[];
  language?: string | null;
  theme: TriptychTheme;
}) {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const isPointerDownRef = useRef(false);

  useEffect(() => {
    return () => {
      if (snapTimerRef.current !== null) {
        window.clearTimeout(snapTimerRef.current);
      }
    };
  }, []);

  function snapToNearestMatch(behavior: ScrollBehavior = "smooth") {
    const slider = sliderRef.current;
    if (!slider) {
      return;
    }

    const slides = Array.from(slider.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement
    );
    if (slides.length === 0) {
      return;
    }

    const targetLeft = slides.reduce((nearestOffset, slide) => {
      return Math.abs(slide.offsetLeft - slider.scrollLeft) < Math.abs(nearestOffset - slider.scrollLeft)
        ? slide.offsetLeft
        : nearestOffset;
    }, slides[0]?.offsetLeft ?? 0);

    if (Math.abs(slider.scrollLeft - targetLeft) <= 1) {
      return;
    }

    slider.scrollTo({ left: targetLeft, behavior });
  }

  function scheduleSnap(delayMs = 90) {
    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
    }

    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      if (!isPointerDownRef.current) {
        snapToNearestMatch();
      }
    }, delayMs);
  }

  function handlePointerDown() {
    isPointerDownRef.current = true;
    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }

  function handlePointerRelease() {
    isPointerDownRef.current = false;
    scheduleSnap(24);
  }

  return (
    <div
      ref={sliderRef}
      className="flex w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onPointerLeave={handlePointerRelease}
      onScroll={() => scheduleSnap()}
    >
      {matches.map((match) => (
        <CompactUpcomingMatch key={match.id} match={match} language={language} theme={theme} />
      ))}
    </div>
  );
}

function SwipeCueArrows({ theme }: { theme: TriptychTheme }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-1 bottom-0 flex items-center justify-center text-[12px] font-semibold leading-none tracking-[0.18em] ${theme === "dark" ? "text-white/40" : "text-slate-400/80"}`}
    >
      <span>•••</span>
    </div>
  );
}

function CompactUpcomingMatch({
  match,
  language,
  theme
}: {
  match: DashboardMatchSummary;
  language?: string | null;
  theme: TriptychTheme;
}) {
  return (
    <div className="flex min-w-full shrink-0 basis-full snap-center flex-col items-center justify-center px-0 text-center [scroll-snap-stop:always] [-webkit-text-size-adjust:100%] [text-size-adjust:100%] sm:min-w-0 sm:basis-1/2 sm:px-5 lg:px-6">
      <p className={`max-w-full truncate font-semibold uppercase leading-none tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
        <span className="triptych-micro-copy">{formatReminderStageLabel(match, language)}</span>
      </p>
      <p className={`mt-1.5 flex max-w-full items-center gap-1.5 text-[14px] font-black leading-3 tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>
        <MatchFlag
          flagEmoji={match.homeTeamFlagEmoji}
          fallback={match.homeTeamShortName}
          teamName={match.homeTeamName}
        />
        <span className={`px-1 ${theme === "dark" ? "text-slate-500" : "text-slate-300"}`}>v</span>
        <MatchFlag
          flagEmoji={match.awayTeamFlagEmoji}
          fallback={match.awayTeamShortName}
          teamName={match.awayTeamName}
        />
      </p>
      <div className="mt-1.5 flex flex-col items-center gap-0.5">
        <p className={`text-[8.5px] font-semibold leading-3 ${getSecondaryTextClasses(theme)}`}>{formatShortDate(match.kickoffTime, language)}</p>
        <p className={`font-semibold uppercase tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
          <span className="triptych-micro-copy">{formatShortTime(match.kickoffTime, language)}</span>
        </p>
      </div>
    </div>
  );
}

function PanelShell({
  header,
  accentTone = "neutral",
  headerAlign = "right",
  theme,
  className = "",
  children
}: {
  header?: ReactNode;
  accentTone?: DashboardUrgencyTone;
  headerAlign?: "right" | "center";
  theme: TriptychTheme;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative flex h-[200px] min-w-0 flex-col overflow-hidden rounded-[1.15rem] border px-2.5 py-2.5 [-webkit-text-size-adjust:100%] [text-size-adjust:100%] sm:h-56 sm:px-3.5 sm:py-3.5 lg:h-60 ${getPanelShellClasses(accentTone, theme)} ${className}`.trim()}>
      <div className={`pointer-events-none absolute inset-px rounded-[1.05rem] ${getPanelInnerSurfaceClasses(accentTone, theme)}`} />
      <div className={`pointer-events-none absolute -right-8 top-0 h-20 w-20 rounded-full blur-2xl ${getPanelGlowClasses(accentTone, theme)}`} />
      <div className={`pointer-events-none absolute inset-x-4 top-0 h-px ${theme === "dark" ? "bg-white/10" : "bg-white/75"}`} />
      {header ? (
        <div className={`absolute left-2.5 right-2.5 top-3 z-10 flex ${headerAlign === "center" ? "justify-center" : "justify-end"}`}>
          {header}
        </div>
      ) : null}
      <div className="relative flex flex-1 items-center justify-center">{children}</div>
    </section>
  );
}

function UrgencyIconChip({
  tone,
  isComplete,
  language,
  theme
}: {
  tone: DashboardUrgencyTone;
  isComplete: boolean;
  language?: string | null;
  theme: TriptychTheme;
}) {
  const Icon = getUrgencyIcon(tone, isComplete);

  return (
    <span
      aria-label={getUrgencyAriaLabel(tone, isComplete, language)}
      className={`inline-flex h-6 w-6 items-center justify-center ${getToneIconClasses(theme)}`}
    >
      <Icon
        aria-hidden
        className={`h-3.5 w-3.5 ${!isComplete && tone === "red" ? "motion-safe:animate-pulse" : ""}`}
      />
    </span>
  );
}

function getUrgencyIcon(tone: DashboardUrgencyTone, isComplete: boolean) {
  if (isComplete || tone === "green" || tone === "neutral") {
    return Clock3;
  }

  if (tone === "orange") {
    return Clock3;
  }

  return BellRing;
}

function ReminderChip({
  tone,
  label,
  theme
}: {
  tone: DashboardUrgencyTone;
  label: string;
  theme: TriptychTheme;
}) {
  return (
    <span className={`max-w-full truncate text-center text-[9px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${getTonePlainTextClasses(tone, theme)}`}>
      <span>{label}</span>
    </span>
  );
}

function DigitalWatchRing({
  percentage,
  tone,
  theme
}: {
  percentage: number;
  tone: DashboardUrgencyTone;
  theme: TriptychTheme;
}) {
  const gradientId = useId();
  const clampedPercentage = Math.max(0, Math.min(percentage, 100));
  const totalSegments = 30;
  const filledSegments = Math.round((clampedPercentage / 100) * totalSegments);
  const radius = 35;
  const gapDegrees = 4.3;
  const stepDegrees = 360 / totalSegments;
  const segmentDegrees = stepDegrees - gapDegrees;

  const segments = useMemo(
    () =>
      Array.from({ length: totalSegments }, (_, index) => {
        const start = -90 + index * stepDegrees + gapDegrees / 2;
        const end = start + segmentDegrees;
        return {
          d: describeArc(radius, start, end),
          filled: index < filledSegments
        };
      }),
    [filledSegments, segmentDegrees, stepDegrees]
  );

  return (
    <div className="relative h-[109px] w-[109px] sm:h-32 sm:w-32 lg:h-36 lg:w-36">
      <div className={`absolute inset-4 rounded-full blur-xl ${getRingGlowClasses(tone, theme)}`} />
      <svg viewBox="-52 -52 104 104" className="relative h-full w-full drop-shadow-[0_3px_8px_rgba(15,23,42,0.06)]" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {getRingGradientStops(tone, theme).map((stop) => (
              <stop key={`${gradientId}-${stop.offset}`} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <circle cx="0" cy="0" r="31" fill={`url(#${gradientId})`} opacity={theme === "dark" ? "0.14" : "0.08"} />
        <circle
          cx="0"
          cy="0"
          r="27.5"
          fill={theme === "dark" ? "rgba(15,23,42,0.94)" : "rgba(255,255,255,0.94)"}
          stroke={theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.92)"}
          strokeWidth="1"
        />
        <circle cx="0" cy="0" r="38.5" fill="none" className={theme === "dark" ? "stroke-white/20" : "stroke-white/70"} strokeWidth="1" />
        {segments.map((segment, index) => (
          <path
            key={`segment-${index}`}
            d={segment.d}
            fill="none"
            strokeLinecap="round"
            strokeWidth="3.2"
            stroke={segment.filled ? `url(#${gradientId})` : undefined}
            className={segment.filled ? "" : theme === "dark" ? "stroke-slate-700/90" : "stroke-slate-200/90"}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex translate-x-[3px] items-center justify-center">
        <p className={`tabular-nums text-[20px] font-black leading-none tracking-[-0.04em] sm:text-2xl lg:text-[27px] ${getPrimaryTextClasses(theme)}`}>
          <span>{clampedPercentage}</span>
          <sup className={`ml-0.5 align-super text-[6px] font-black tracking-normal sm:text-[8px] ${getMutedTextClasses(theme)}`}>%</sup>
        </p>
      </div>
    </div>
  );
}

function resolveTriptychLeftPanelViews({
  progress,
  progressViews,
  scoringLens,
  primaryView,
  secondaryView
}: {
  progress: DashboardCommandCenterSummary["progress"];
  progressViews: DashboardCommandCenterSummary["progressViews"];
  scoringLens: TriptychScoringLens | null | undefined;
  primaryView?: DashboardTriptychViewKey | null;
  secondaryView?: DashboardTriptychViewKey | null;
}) {
  const fallbackPrimary = getProgressPhaseViewKey(progress.phase);
  const resolvedPrimary = resolveTriptychDisplayView({
    requestedView: primaryView,
    fallbackView: fallbackPrimary,
    progress,
    progressViews,
    scoringLens
  });
  const resolvedSecondary = resolveTriptychDisplayView({
    requestedView: secondaryView,
    fallbackView: resolvedPrimary === "score_movement" ? fallbackPrimary : "score_movement",
    progress,
    progressViews,
    scoringLens,
    disallowedView: resolvedPrimary
  });

  return {
    primaryView: resolvedPrimary,
    secondaryView: resolvedSecondary === resolvedPrimary ? null : resolvedSecondary
  };
}

function resolveTriptychDisplayView({
  requestedView,
  fallbackView,
  progress,
  progressViews,
  scoringLens,
  disallowedView
}: {
  requestedView?: DashboardTriptychViewKey | null;
  fallbackView: DashboardTriptychViewKey;
  progress: DashboardCommandCenterSummary["progress"];
  progressViews: DashboardCommandCenterSummary["progressViews"];
  scoringLens: TriptychScoringLens | null | undefined;
  disallowedView?: DashboardTriptychViewKey | null;
}): DashboardTriptychViewKey {
  const requested = requestedView ?? fallbackView;
  const candidates = [
    requested,
    fallbackView,
    "score_movement",
    "group_stage_progress",
    "knockout_progress",
    "side_picks_progress"
  ] as DashboardTriptychViewKey[];

  return (
    candidates.find((candidate) => candidate !== disallowedView && isTriptychViewAvailable(candidate, progress, progressViews, scoringLens)) ??
    "group_stage_progress"
  );
}

function isTriptychViewAvailable(
  view: DashboardTriptychViewKey,
  progress: DashboardCommandCenterSummary["progress"],
  progressViews: DashboardCommandCenterSummary["progressViews"],
  scoringLens: TriptychScoringLens | null | undefined
) {
  if (view === "score_movement") {
    return Boolean(scoringLens);
  }

  if (view === "group_stage_progress") {
    return Boolean(progressViews.group_stage_progress ?? progress);
  }

  return Boolean(progressViews[view]);
}

function getProgressPhaseViewKey(phase: DashboardCommandCenterSummary["progress"]["phase"]): TriptychProgressViewKey {
  switch (phase) {
    case "knockout_stage":
      return "knockout_progress";
    case "last_chance":
      return "side_picks_progress";
    case "group_stage":
    default:
      return "group_stage_progress";
  }
}

function getTriptychViewLabel(view: DashboardTriptychViewKey, language?: string | null) {
  switch (view) {
    case "group_stage_progress":
      return t(language, "dashboard.groupStage");
    case "knockout_progress":
      return t(language, "dashboard.knockoutPicks");
    case "side_picks_progress":
      return "Side Picks";
    case "score_movement":
    default:
      return t(language, "leaderboard.points");
  }
}

function MetricRow({
  label,
  labelLines,
  value,
  theme
}: {
  label?: string;
  labelLines?: [string, string];
  value: string;
  theme: TriptychTheme;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 py-2">
      <span className={`min-w-0 font-semibold uppercase leading-[0.95] tracking-[0.1em] ${getMutedTextClasses(theme)}`}>
        {labelLines ? (
          <>
            <span className="triptych-micro-copy triptych-micro-copy-left block truncate sm:hidden">{labelLines[0]}</span>
            <span className="triptych-micro-copy triptych-micro-copy-left block truncate sm:hidden">{labelLines[1]}</span>
            <span className="triptych-micro-copy triptych-micro-copy-left hidden truncate sm:block">{labelLines.join(" ")}</span>
          </>
        ) : (
          <span className="triptych-micro-copy triptych-micro-copy-left block truncate">{label}</span>
        )}
      </span>
      <span className={`triptych-regular-value min-w-0 max-w-[3.3rem] truncate text-right text-[13px] font-black leading-none tracking-[-0.04em] tabular-nums ${getPrimaryTextClasses(theme)}`}>{value}</span>
    </div>
  );
}

function GroupsSummaryRows({
  title,
  invitedLabel,
  invitedValue,
  managedLabel,
  managedValue,
  theme
}: {
  title: string;
  invitedLabel: string;
  invitedValue: string;
  managedLabel: string;
  managedValue: string;
  theme: TriptychTheme;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 py-1.5">
      <p className={`truncate text-center font-black uppercase leading-none tracking-[0.1em] ${getPrimaryTextClasses(theme)}`}>
        <span className="triptych-micro-copy">{title}</span>
      </p>
      <div className="mx-auto grid w-full max-w-[8.5rem] grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1">
        <span className={`truncate text-left font-semibold uppercase leading-none tracking-[0.08em] ${getMutedTextClasses(theme)}`}>
          <span className="triptych-micro-copy triptych-micro-copy-left">{invitedLabel}:</span>
        </span>
        <span className={`triptych-regular-value text-right text-[12px] font-black leading-none tracking-[-0.04em] tabular-nums ${getPrimaryTextClasses(theme)}`}>
          {invitedValue}
        </span>
        <span className={`truncate text-left font-semibold uppercase leading-none tracking-[0.08em] ${getMutedTextClasses(theme)}`}>
          <span className="triptych-micro-copy triptych-micro-copy-left">{managedLabel}:</span>
        </span>
        <span className={`triptych-regular-value text-right text-[12px] font-black leading-none tracking-[-0.04em] tabular-nums ${getPrimaryTextClasses(theme)}`}>
          {managedValue}
        </span>
      </div>
    </div>
  );
}

function CompactLiveMatch({
  match,
  language,
  theme
}: {
  match: DashboardMatchSummary;
  language?: string | null;
  theme: TriptychTheme;
}) {
  return (
    <div className={`rounded-[0.95rem] border px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] ${theme === "dark" ? "border-rose-300/20 bg-rose-950/35" : "border-rose-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,241,242,0.94))]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`truncate text-[7px] font-semibold uppercase tracking-[0.2em] ${theme === "dark" ? "text-rose-200" : "text-rose-700"}`}>{compactStageLabel(match.stage, language)}</p>
        <span className="ui-chip-sm border border-rose-200/80 bg-white/85 text-[7px] font-bold uppercase tracking-[0.18em] text-rose-700">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 motion-safe:animate-pulse" />
          {t(language, "common.live")}
        </span>
      </div>
      <div className="mt-1.5 space-y-1.5">
        <CompactLiveRow
          team={match.homeTeamShortName}
          flagEmoji={match.homeTeamFlagEmoji}
          score={match.homeScore}
          yellowCards={match.homeYellowCards}
          redCards={match.homeRedCards}
          theme={theme}
        />
        <CompactLiveRow
          team={match.awayTeamShortName}
          flagEmoji={match.awayTeamFlagEmoji}
          score={match.awayScore}
          yellowCards={match.awayYellowCards}
          redCards={match.awayRedCards}
          theme={theme}
        />
      </div>
    </div>
  );
}

function CompactLiveRow({
  team,
  flagEmoji,
  score,
  yellowCards,
  redCards,
  theme
}: {
  team: string;
  flagEmoji?: string | null;
  score: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
  theme: TriptychTheme;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <MatchFlag flagEmoji={flagEmoji} fallback={team} teamName={team} className="text-[14px]" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={`min-w-4 text-center text-[11px] font-black tracking-[-0.03em] tabular-nums ${getPrimaryTextClasses(theme)}`}>{score ?? "—"}</span>
        {typeof yellowCards === "number" ? <TinyCardStat label="🟨" value={yellowCards} /> : null}
        {typeof redCards === "number" ? <TinyCardStat label="🟥" value={redCards} /> : null}
      </div>
    </div>
  );
}

function TinyCardStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="ui-chip-sm border border-white/80 bg-white/90 text-[7px] font-semibold text-slate-700">
      <span aria-hidden>{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function MatchFlag({
  flagEmoji,
  fallback,
  teamName,
  className = ""
}: {
  flagEmoji?: string | null;
  fallback: string;
  teamName: string;
  className?: string;
}) {
  if (flagEmoji) {
    return (
      <span aria-label={teamName} title={teamName} className={`native-flag-emoji inline-flex h-[1.25em] w-[1.65em] items-center justify-center overflow-hidden leading-none ${className}`}>
        <span aria-hidden className="block text-[1.7em] leading-none">{flagEmoji}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center truncate text-[11px] font-black leading-none tracking-[-0.02em] ${className}`}>
      {fallback}
    </span>
  );
}

function describeArc(radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(radius, endAngle);
  const end = polarToCartesian(radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: radius * Math.cos(angleInRadians),
    y: radius * Math.sin(angleInRadians)
  };
}

function getTriptychToggleClasses(theme: TriptychTheme) {
  return theme === "dark"
    ? "[color:var(--triptych-dark-accent-text)] hover:text-white"
    : "text-slate-500 hover:text-accent-dark";
}

function getTriptychScoringLens({
  scoring
}: {
  scoring: DashboardCommandCenterSummary["scoring"];
}): TriptychScoringLens | null {
  if (scoring.mode === "score_movement") {
    const projectedOutlook = scoring.projectedOutlook ?? null;
    return {
      mode: "score_movement",
      scoreKind: scoring.scoreKind,
      movement: scoring.score,
      projectedOutlook,
      points:
        scoring.scoreKind === "projected" && projectedOutlook
          ? (projectedOutlook.hasMeaningfulHistory
              ? getProjectedOutlookTrackPoints(projectedOutlook)
              : [])
          : getScoringTrackPoints(scoring.score.history)
    };
  }

  if (scoring.mode === "picks_in_play" && scoring.activity) {
    return {
      mode: "picks_in_play",
      activity: scoring.activity
    };
  }

  return {
    mode: "empty"
  };
}

function getScoringTrackPoints(history: DashboardScoringHistoryPoint[]): TriptychScoringTrackPoint[] {
  return filterRelevantScoringHistory(history).map((point) => ({
    checkpointId: point.matchId,
    label: formatCompactScoringLabel(point.createdAt),
    actualPoints: point.totalPoints,
    pacePoints: point.pacePoints
  }));
}

function getProjectedOutlookTrackPoints(
  projectedOutlook: NonNullable<DashboardCommandCenterSummary["scoring"]["projectedOutlook"]>
): TriptychScoringTrackPoint[] {
  return projectedOutlook.ceilingRiskGraph.graphPoints
    .filter((point) => point.kind === "history" || point.kind === "now")
    .map((point) => ({
    checkpointId: point.id,
    label: point.shortLabel,
    actualPoints: point.ceilingPoints,
    pacePoints: null
  }));
}

function getPrimaryTextClasses(theme: TriptychTheme) {
  return theme === "dark" ? "text-white" : "text-slate-950";
}

function getSecondaryTextClasses(theme: TriptychTheme) {
  return theme === "dark" ? "text-slate-200" : "text-slate-700";
}

function getMutedTextClasses(theme: TriptychTheme) {
  return theme === "dark" ? "text-slate-400" : "text-slate-500";
}

function getDividerClasses(theme: TriptychTheme) {
  return theme === "dark" ? "divide-white/10" : "divide-slate-200/80";
}

function getToneIconClasses(theme: TriptychTheme) {
  return theme === "dark" ? "text-slate-200" : "text-slate-600";
}

function getTonePlainTextClasses(tone: DashboardUrgencyTone, theme: TriptychTheme) {
  switch (tone) {
    case "red":
      return theme === "dark" ? "text-rose-200" : "text-rose-700";
    case "orange":
      return theme === "dark" ? "text-amber-200" : "text-amber-700";
    case "green":
      return theme === "dark" ? "[color:var(--triptych-dark-accent-text)]" : "text-accent-dark";
    default:
      return getMutedTextClasses(theme);
  }
}

function getToneMetaTextClasses(tone: DashboardUrgencyTone, isComplete: boolean, isLocked: boolean, theme: TriptychTheme) {
  if (isLocked && isComplete) {
    return getMutedTextClasses(theme);
  }

  if (isComplete) {
    return theme === "dark" ? "[color:var(--triptych-dark-accent-text)]" : "text-accent-dark";
  }

  switch (tone) {
    case "red":
      return theme === "dark" ? "text-rose-200" : "text-rose-700";
    case "orange":
      return theme === "dark" ? "text-amber-200" : "text-amber-700";
    case "green":
      return theme === "dark" ? "[color:var(--triptych-dark-accent-text)]" : "text-accent-dark";
    default:
      return getMutedTextClasses(theme);
  }
}

function getProgressDisplayTone(
  progress: DashboardCommandCenterSummary["progress"],
  nowMs: number,
  isCompleteForDisplay = progress.isComplete
): DashboardUrgencyTone {
  if (progress.deadlineAt && new Date(progress.deadlineAt).getTime() <= nowMs) {
    return isCompleteForDisplay ? "neutral" : "red";
  }

  if (isCompleteForDisplay) {
    return "green";
  }

  return getDeadlineUrgency(progress.deadlineAt, nowMs);
}

function getPanelShellClasses(tone: DashboardUrgencyTone, theme: TriptychTheme) {
  if (theme === "dark") {
    return `border-white/10 bg-[linear-gradient(180deg,rgba(22,35,33,0.98)_0%,rgba(10,16,24,0.98)_100%)] shadow-[0_10px_24px_rgba(0,0,0,0.14),0_1px_2px_rgba(255,255,255,0.03)] ${getPanelRingClasses(tone, theme)}`;
  }

  return `border-stone-200/85 bg-[linear-gradient(180deg,rgba(255,252,248,0.98)_0%,rgba(247,242,235,0.98)_100%)] shadow-[0_10px_24px_rgba(38,28,20,0.06),0_1px_2px_rgba(38,28,20,0.03)] ${getPanelRingClasses(tone, theme)}`;
}

function getPanelInnerSurfaceClasses(tone: DashboardUrgencyTone, theme: TriptychTheme) {
  if (theme === "dark") {
    const darkAccent =
      tone === "green"
        ? "bg-[radial-gradient(circle_at_top_right,var(--triptych-dark-accent-glow),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.055),transparent)]"
        : tone === "orange"
          ? "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]"
          : tone === "red"
            ? "bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]"
            : "bg-[radial-gradient(circle_at_top_right,var(--triptych-dark-accent-soft),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]";

    return `${darkAccent} shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`;
  }

  const accent =
    tone === "green"
      ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.7),transparent)]"
      : tone === "orange"
        ? "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.11),transparent_42%),linear-gradient(180deg,rgba(255,250,240,0.55),transparent)]"
        : tone === "red"
          ? "bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.1),transparent_42%),linear-gradient(180deg,rgba(255,248,248,0.55),transparent)]"
          : "bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.08),transparent_42%),linear-gradient(180deg,rgba(255,253,249,0.7),transparent)]";

  return `${accent} shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]`;
}

function getPanelGlowClasses(tone: DashboardUrgencyTone, theme: TriptychTheme) {
  switch (tone) {
    case "green":
      return theme === "dark" ? "bg-[color:var(--triptych-dark-accent-glow)]" : "bg-accent-light/40";
    case "orange":
      return theme === "dark" ? "bg-amber-300/20" : "bg-amber-200/30";
    case "red":
      return theme === "dark" ? "bg-rose-300/20" : "bg-rose-200/30";
    default:
      return theme === "dark" ? "bg-[color:var(--triptych-dark-accent-soft)]" : "bg-amber-100/30";
  }
}

function getPanelRingClasses(tone: DashboardUrgencyTone, theme: TriptychTheme) {
  switch (tone) {
    case "green":
      return theme === "dark" ? "ring-1 ring-[color:var(--triptych-dark-accent)]" : "ring-1 ring-accent-light";
    case "orange":
      return theme === "dark" ? "ring-1 ring-amber-200/20" : "ring-1 ring-amber-100/80";
    case "red":
      return theme === "dark" ? "ring-1 ring-rose-200/20" : "ring-1 ring-rose-100/80";
    default:
      return theme === "dark" ? "ring-1 ring-white/10" : "ring-1 ring-stone-100/85";
  }
}

function getRingGlowClasses(tone: DashboardUrgencyTone, theme: TriptychTheme) {
  switch (tone) {
    case "green":
      return theme === "dark" ? "bg-[color:var(--triptych-dark-accent-glow)]" : "bg-accent-light/40";
    case "orange":
      return theme === "dark" ? "bg-amber-300/10" : "bg-amber-200/20";
    case "red":
      return theme === "dark" ? "bg-rose-300/10" : "bg-rose-200/20";
    default:
      return theme === "dark" ? "bg-white/10" : "bg-amber-100/20";
  }
}

function getRingGradientStops(tone: DashboardUrgencyTone, theme: TriptychTheme) {
  switch (tone) {
    case "red":
      return [
        { offset: "0%", color: "#fb7185" },
        { offset: "100%", color: "#e11d48" }
      ];
    case "orange":
      return [
        { offset: "0%", color: "#fbbf24" },
        { offset: "100%", color: "#f59e0b" }
      ];
    case "green":
      if (theme === "dark") {
        return [
          { offset: "0%", color: "var(--triptych-dark-accent-text)" },
          { offset: "100%", color: "var(--triptych-dark-accent)" }
        ];
      }

      return [
        { offset: "0%", color: "var(--app-accent-ring)" },
        { offset: "100%", color: "var(--app-accent)" }
      ];
    default:
      return [
        { offset: "0%", color: "#cbbba6" },
        { offset: "100%", color: "#8f7b66" }
      ];
  }
}

function getTriptychDarkAccentStyle(color: RgbColor): CSSProperties {
  const darkSurface = { r: 10, g: 16, b: 24 };
  const accent = boostContrastForDarkSurface(color, darkSurface, 3.2);
  const textAccent = boostContrastForDarkSurface(color, darkSurface, 5.2);

  return {
    "--triptych-dark-accent": toRgbCss(accent),
    "--triptych-dark-accent-glow": toRgbaCss(accent, 0.32),
    "--triptych-dark-accent-soft": toRgbaCss(accent, 0.18),
    "--triptych-dark-accent-text": toRgbCss(textAccent)
  } as CSSProperties;
}

function selectTriptychDarkAccent(rawCandidates: string[]): RgbColor {
  const candidates = rawCandidates
    .map(parseCssColor)
    .filter((color): color is RgbColor => Boolean(color));
  const darkSurface = { r: 10, g: 16, b: 24 };

  const colorfulReadableCandidates = candidates.filter((color) => {
    return getContrastRatio(color, darkSurface) >= 2.75 && getColorSaturation(color) >= 0.08 && !isNearWhite(color);
  });
  const balancedReadableCandidates = colorfulReadableCandidates.filter((color) => {
    const luminance = getRelativeLuminance(color);
    return luminance >= 0.08 && luminance <= 0.58;
  });
  const candidatePool = balancedReadableCandidates.length > 0
    ? balancedReadableCandidates
    : colorfulReadableCandidates.length > 0
      ? colorfulReadableCandidates
      : candidates;

  return candidatePool
    .map((color, index) => {
      const luminance = getRelativeLuminance(color);
      const contrast = getContrastRatio(color, darkSurface);
      const brightPenalty = luminance > 0.58 ? 2.4 : 0;
      const dimPenalty = contrast < 2.75 ? 1.8 : 0;

      return {
        color,
        score:
          Math.min(contrast, 6) * 0.45 +
          getColorSaturation(color) * 2.4 -
          Math.abs(luminance - 0.28) * 2.2 -
          brightPenalty -
          dimPenalty -
          (isNearWhite(color) ? 4 : 0) -
          index * 0.06
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.color ?? { r: 159, g: 229, b: 143 };
}

function boostContrastForDarkSurface(color: RgbColor, darkSurface: RgbColor, minimumContrast: number) {
  let candidate = color;

  for (let step = 0; step < 12; step += 1) {
    if (getContrastRatio(candidate, darkSurface) >= minimumContrast) {
      return candidate;
    }

    candidate = mixRgbColor(candidate, { r: 255, g: 255, b: 255 }, 0.12);
  }

  return candidate;
}

function mixRgbColor(color: RgbColor, target: RgbColor, amount: number): RgbColor {
  return {
    r: clampRgbChannel(color.r + (target.r - color.r) * amount),
    g: clampRgbChannel(color.g + (target.g - color.g) * amount),
    b: clampRgbChannel(color.b + (target.b - color.b) * amount)
  };
}

function toRgbCss(color: RgbColor) {
  return `rgb(${color.r} ${color.g} ${color.b})`;
}

function toRgbaCss(color: RgbColor, alpha: number) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function parseCssColor(value: string): RgbColor | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const expandedHex = hex.length === 3
      ? hex.split("").map((character) => `${character}${character}`).join("")
      : hex;

    return {
      r: Number.parseInt(expandedHex.slice(0, 2), 16),
      g: Number.parseInt(expandedHex.slice(2, 4), 16),
      b: Number.parseInt(expandedHex.slice(4, 6), 16)
    };
  }

  const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) {
    return null;
  }

  const channels = rgbMatch[1]
    .replace(/\//g, " ")
    .split(/[,\s]+/)
    .map((channel) => Number.parseFloat(channel))
    .filter((channel) => Number.isFinite(channel));

  if (channels.length < 3) {
    return null;
  }

  return {
    r: clampRgbChannel(channels[0]),
    g: clampRgbChannel(channels[1]),
    b: clampRgbChannel(channels[2])
  };
}

function clampRgbChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function getColorSaturation(color: RgbColor) {
  const maxChannel = Math.max(color.r, color.g, color.b);
  const minChannel = Math.min(color.r, color.g, color.b);
  return (maxChannel - minChannel) / 255;
}

function isNearWhite(color: RgbColor) {
  return getRelativeLuminance(color) > 0.86 && getColorSaturation(color) < 0.12;
}

function getContrastRatio(first: RgbColor, second: RgbColor) {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(color: RgbColor) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function getUrgencyAriaLabel(tone: DashboardUrgencyTone, isComplete: boolean, language?: string | null) {
  if (isComplete) {
    return tone === "neutral" ? `${t(language, "common.done")} ${t(language, "common.locked")}` : t(language, "common.done");
  }

  switch (tone) {
    case "red":
      return `${t(language, "common.locked")} status`;
    case "orange":
      return `${t(language, "common.pending")} status`;
    case "green":
      return `${t(language, "common.ready")} status`;
    default:
      return "Status";
  }
}

function compactStageLabel(stage: string, language?: string | null) {
  if (stage === "group") {
    return t(language, "dashboard.groupLabel");
  }

  if (stage === "r32" || stage === "round_of_32") {
    return "R32";
  }

  if (stage === "r16" || stage === "round_of_16") {
    return "R16";
  }

  if (stage === "qf" || stage === "quarterfinal") {
    return "QF";
  }

  if (stage === "sf" || stage === "semifinal") {
    return "SF";
  }

  if (stage === "third") {
    return t(language, "knockout.thirdPlace");
  }

  if (stage === "final") {
    return t(language, "common.final");
  }

  return stage;
}

function formatKnockoutRoundStateShort(state: DashboardKnockoutOutlookSummary["rounds"][number]["status"]) {
  switch (state) {
    case "waiting":
      return "WAIT";
    case "open":
      return "OPEN";
    case "saved":
      return "SAVED";
    case "locked":
      return "LOCK";
    case "final":
      return "FINAL";
    case "missed":
      return "MISS";
    case "complete":
      return "DONE";
  }
}

function formatKnockoutCompactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Soon";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

function compactKnockoutCtaLabel(value: string) {
  if (value === "Predict R32 Scores") {
    return "Pick R32";
  }

  if (value.startsWith("Continue ")) {
    return value.replace("Continue ", "");
  }

  if (value === "Review Knockout Picks") {
    return "Review Picks";
  }

  if (value === "Waiting for qualifiers") {
    return "Waiting";
  }

  return value;
}

function formatReminderStageLabel(match: DashboardMatchSummary, language?: string | null) {
  if (match.stage === "group") {
    const groupSuffix = match.groupLabel?.trim();
    return groupSuffix ? `${t(language, "dashboard.groupLabel")} ${groupSuffix}` : t(language, "dashboard.groupLabel");
  }

  return compactStageLabel(match.stage, language);
}

function formatShortDate(value: string | null, language?: string | null) {
  if (!value) {
    return t(language, "dashboard.noUpcomingMatch");
  }

  const kickoff = new Date(value);
  if (Number.isNaN(kickoff.getTime())) {
    return t(language, "dashboard.noUpcomingMatch");
  }

  return formatDate(kickoff, language, { month: "short", day: "numeric" });
}

function formatShortTime(value: string | null, language?: string | null) {
  if (!value) {
    return "";
  }

  const kickoff = new Date(value);
  if (Number.isNaN(kickoff.getTime())) {
    return "";
  }

  return formatTime(kickoff, language, { hour: "numeric", minute: "2-digit" });
}

function formatPoints(value: number | null, language?: string | null) {
  return typeof value === "number" ? formatNumber(value, language) : "—";
}

function formatRank(value: number | null, language?: string | null) {
  return typeof value === "number" ? formatNumber(value, language) : "—";
}

function formatSignedMetric(value: number | null, language?: string | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return value === 0 ? "0" : "—";
  }

  const absolute = formatNumber(Math.abs(value), language);
  return `${value > 0 ? "+" : "-"}${absolute}`;
}

function formatShortMatchLabel(match: DashboardMatchSummary) {
  return `${match.homeTeamShortName} v ${match.awayTeamShortName}`;
}

function formatMatchSummary(match: DashboardMatchSummary, language?: string | null) {
  const date = match.kickoffTime
    ? `${formatDate(match.kickoffTime, language, { month: "short", day: "numeric" })} ${formatShortTime(match.kickoffTime, language)}`
    : "";
  return date
    ? `${match.homeTeamName} v ${match.awayTeamName} · ${date}`
    : `${match.homeTeamName} v ${match.awayTeamName}`;
}

function formatCompactScoringLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}

function formatScoringChartLabel(value: string, language?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return formatDate(date, language, {
    month: "short",
    day: "numeric"
  });
}

function formatScoringTimelineTimestamp(value: string, language?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatDate(date, language, { month: "short", day: "numeric" })} ${formatTime(date, language, {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function getProgressStatusLabel(
  progress: DashboardCommandCenterSummary["progress"],
  language?: string | null,
  now = Date.now()
) {
  if (progress.isLocked) {
    return t(language, "common.locked");
  }

  if (progress.deadlineAt) {
    return getLocalizedDeadlineLabel(progress.deadlineAt, language, now);
  }

  return progress.isComplete ? t(language, "common.ready") : t(language, "common.pending");
}

function getLocalizedDeadlineLabel(deadlineAt: string | null, language?: string | null, now = Date.now()) {
  if (!deadlineAt) {
    return t(language, "common.pending");
  }

  const diffMs = new Date(deadlineAt).getTime() - now;
  if (diffMs <= 0) {
    return t(language, "common.locked");
  }

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  if (diffMs <= 2 * dayMs) {
    const hours = Math.max(1, Math.ceil(diffMs / hourMs));
    return t(language, hours === 1 ? "dashboard.hourLeftCompact" : "dashboard.hoursLeftCompact", { hours });
  }

  const days = Math.max(1, Math.ceil(diffMs / dayMs));
  return t(language, days === 1 ? "dashboard.dayLeftCompact" : "dashboard.daysLeftCompact", { days });
}

function getLocalizedReminderLabel(
  targetTime: string | null,
  language?: string | null,
  now = Date.now(),
  emptyLabel?: string
) {
  if (!targetTime) {
    return emptyLabel ?? t(language, "dashboard.noMatch");
  }

  const diffMs = new Date(targetTime).getTime() - now;
  if (diffMs <= 0) {
    return t(language, "common.locked");
  }
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs <= dayMs) {
    const hours = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
    return t(language, hours === 1 ? "dashboard.reminderInHour" : "dashboard.reminderInHours", { hours });
  }
  const days = Math.max(1, Math.ceil(diffMs / dayMs));
  return t(language, days === 1 ? "dashboard.reminderInDay" : "dashboard.reminderInDays", { days });
}
