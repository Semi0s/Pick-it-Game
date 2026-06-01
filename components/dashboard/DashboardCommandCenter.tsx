"use client";

import Link from "next/link";
import { BellRing, ChevronDown, ChevronUp, Clock3, Moon, SunMedium } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  getDeadlineUrgency,
  type DashboardCommandCenterSummary,
  type DashboardMatchSummary,
  type DashboardUrgencyTone
} from "@/lib/dashboard-home";
import {
  GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY,
  hasCurrentUnsavedGroupStageDraft,
  parseUnsavedGroupStageDraft
} from "@/lib/group-stage-unsaved-draft";
import {
  calculateScenarioImpactFromSeedDraft,
  formatSignedScenarioDelta,
  type ScenarioImpactSummary
} from "@/lib/group-stage-scenario-impact";
import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { formatDate, formatNumber, formatTime } from "@/lib/i18n-format";
import { useSessionViewState } from "@/lib/session-view-state";
import { t } from "@/lib/strings";

type DashboardCommandCenterProps = {
  summary: DashboardCommandCenterSummary;
  initialLightSeedSnapshot?: LightSeedBuilderSnapshot | null;
  userId?: string | null;
  language?: string | null;
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
  projectedPoints: number;
  actualLockedPoints: number;
};

type TriptychScoringLens =
  | {
      mode: "pre_lock";
      expectedDelta: number | null;
      betterThanSavedPct: number | null;
    }
  | {
      mode: "post_lock";
      expectedTotalPoints: number | null;
      lockedPoints: number | null;
      points: TriptychScoringTrackPoint[];
    };

const DASHBOARD_TRIPTYCH_THEME_STORAGE_KEY = "pickit:dashboard-triptych-theme";
const FALLBACK_TRIPTYCH_DARK_ACCENT_STYLE = getTriptychDarkAccentStyle({ r: 159, g: 229, b: 143 });
const SCENARIO_IMPACT_SWIPE_THRESHOLD_PX = 36;
const DEFAULT_THIRD_PLACE_QUALIFIER_COUNT = 8;

type TriptychLeftPanelViewState = {
  isScoringLensOpen: boolean;
};

const DEFAULT_TRIPTYCH_LEFT_PANEL_VIEW_STATE: TriptychLeftPanelViewState = {
  isScoringLensOpen: false
};

function validateTriptychLeftPanelViewState(value: unknown): TriptychLeftPanelViewState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TriptychLeftPanelViewState>;
  return {
    isScoringLensOpen: Boolean(candidate.isScoringLensOpen)
  };
}

export function DashboardCommandCenter({ summary, initialLightSeedSnapshot, userId, language }: DashboardCommandCenterProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [triptychTheme, setTriptychTheme] = useState<TriptychTheme>("light");
  const [darkAccentStyle, setDarkAccentStyle] = useState<CSSProperties>(FALLBACK_TRIPTYCH_DARK_ACCENT_STYLE);
  const [hasUnsavedGroupStageDraft, setHasUnsavedGroupStageDraft] = useState(false);
  const [scenarioImpact, setScenarioImpact] = useState<ScenarioImpactSummary | null>(null);
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
      const draft = parseUnsavedGroupStageDraft(rawDraft);
      setHasUnsavedGroupStageDraft(
        hasCurrentUnsavedGroupStageDraft(rawDraft, {
          lastCommittedAt: summary.progress.lastCommittedAt
        })
      );
      setScenarioImpact(
        calculateScenarioImpactFromSeedDraft({
          savedSnapshot: initialLightSeedSnapshot,
          draft,
          requiredThirdPlaceCount: DEFAULT_THIRD_PLACE_QUALIFIER_COUNT
        })
      );
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
  }, [initialLightSeedSnapshot, summary.progress.lastCommittedAt]);

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
        progress: summary.progress,
        performance: summary.performance,
        scenarioImpact
      }),
    [scenarioImpact, summary.performance, summary.progress]
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
          nowMs={nowMs}
          language={language}
          userId={userId}
          theme={triptychTheme}
          hasUnsavedGroupStageDraft={hasUnsavedGroupStageDraft}
          scoringLens={scoringLens}
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
  nowMs,
  language,
  userId,
  theme,
  hasUnsavedGroupStageDraft = false,
  scoringLens
}: {
  progress: DashboardCommandCenterSummary["progress"];
  nowMs: number;
  language?: string | null;
  userId?: string | null;
  theme: TriptychTheme;
  hasUnsavedGroupStageDraft?: boolean;
  scoringLens?: TriptychScoringLens | null;
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
  const scoringLensContentId = useId();
  const percentage = progress.totalUnits > 0 ? Math.round((progress.completedUnits / progress.totalUnits) * 100) : 0;
  const isCompleteForDisplay = progress.isComplete || percentage >= 100;
  const tone = getProgressDisplayTone(progress, nowMs, isCompleteForDisplay);
  const statusLabel = getProgressStatusLabel(progress, language, nowMs);
  const shouldShowGroupStageNotSaved =
    progress.phase === "group_stage" && (Boolean(progress.needsSave) || hasUnsavedGroupStageDraft);
  const progressHref = progress.phase === "knockout_stage"
    ? "/knockout"
    : shouldShowGroupStageNotSaved
      ? "/bracket-builder#group-stage-commit"
      : "/bracket-builder#group-stage-picks";
  const progressLabel =
    progress.phase === "group_stage" ? t(language, "dashboard.groupStage") : progress.label;
  const shouldShowScoringLens = Boolean(scoringLens);
  const isScoringLensOpen = leftPanelViewState.isScoringLensOpen;
  const isShowingScoringLens = isScoringLensOpen && Boolean(scoringLens);
  const contentViewportBottomClass = shouldShowScoringLens ? "bottom-7" : "bottom-0";

  useEffect(() => {
    return () => {
      if (scenarioImpactSwipeClickResetTimeoutRef.current !== null) {
        window.clearTimeout(scenarioImpactSwipeClickResetTimeoutRef.current);
      }
    };
  }, []);

  function toggleScoringLensPeek() {
    setLeftPanelViewState((current) => ({ ...current, isScoringLensOpen: !current.isScoringLensOpen }));
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
      setLeftPanelViewState((current) => ({ ...current, isScoringLensOpen: true }));
    } else {
      setLeftPanelViewState((current) => ({ ...current, isScoringLensOpen: false }));
    }
  }

  function handleProgressLinkClickCapture(event: MouseEvent<HTMLAnchorElement>) {
    if (!scenarioImpactSwipeClickBlockRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <PanelShell
      accentTone={tone}
      theme={theme}
      className="transition-colors hover:border-accent/35 hover:shadow-[0_12px_26px_rgba(38,28,20,0.08),0_1px_2px_rgba(38,28,20,0.04)]"
    >
      {!isShowingScoringLens ? (
        <div className="absolute right-[-8px] top-[-8px] z-20">
          <UrgencyIconChip tone={tone} isComplete={isCompleteForDisplay} language={language} theme={theme} />
        </div>
      ) : null}
      <Link
        href={progressHref}
        aria-label={`${progressLabel}: ${statusLabel}`}
        onClickCapture={shouldShowScoringLens ? handleProgressLinkClickCapture : undefined}
        onTouchStart={shouldShowScoringLens ? handleScenarioImpactTouchStart : undefined}
        onTouchEnd={shouldShowScoringLens ? handleScenarioImpactTouchEnd : undefined}
        className="flex h-full w-full min-w-0 items-center justify-center rounded-[1rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <div id={scoringLensContentId} className="relative h-full w-full min-w-0 text-center">
          {isShowingScoringLens && scoringLens ? (
            <div className={`absolute inset-x-0 top-0 ${contentViewportBottomClass} flex items-center justify-center`}>
              <TriptychScoringOutlookContent scoringLens={scoringLens} language={language} theme={theme} />
            </div>
          ) : (
            <div className={`absolute inset-x-0 top-0 ${contentViewportBottomClass} flex flex-col items-center justify-center text-center`}>
              <DigitalWatchRing percentage={percentage} tone={tone} theme={theme} />
              {shouldShowGroupStageNotSaved ? <NotSavedMicroLabel language={language} theme={theme} /> : null}
              <div className={`${shouldShowGroupStageNotSaved ? "mt-0 space-y-0.5" : "-mt-0.5 space-y-0.5"}`}>
                <p className={`max-w-full truncate text-center text-[9px] font-black tracking-[-0.03em] ${getPrimaryTextClasses(theme)}`}>{progressLabel}</p>
                <p className={`max-w-full truncate font-semibold uppercase tracking-[0.1em] [-webkit-text-size-adjust:100%] [text-size-adjust:100%] ${getToneMetaTextClasses(tone, isCompleteForDisplay, progress.isLocked, theme)}`}>
                  <span className="triptych-micro-copy">
                  {statusLabel}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </Link>
      {shouldShowScoringLens ? (
        <TriptychPanelViewCue
          isOpen={isScoringLensOpen}
          onToggle={toggleScoringLensPeek}
          onTouchStart={handleScenarioImpactTouchStart}
          onTouchEnd={handleScenarioImpactTouchEnd}
          contentId={scoringLensContentId}
          language={language}
          theme={theme}
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

function TriptychScoringOutlookContent({
  scoringLens,
  language,
  theme
}: {
  scoringLens: TriptychScoringLens;
  language?: string | null;
  theme: TriptychTheme;
}) {
  if (scoringLens.mode === "post_lock") {
    const expectedLabel = scoringLens.expectedTotalPoints !== null
      ? formatNumber(scoringLens.expectedTotalPoints, language)
      : "—";
    const lockedLabel = scoringLens.lockedPoints !== null
      ? formatNumber(scoringLens.lockedPoints, language)
      : "—";
    const ariaLabel = t(language, "dashboard.scoringTrackAria", {
      expected: expectedLabel,
      locked: lockedLabel
    });

    return (
      <div
        className="flex h-full min-w-0 translate-y-1 flex-col items-center justify-center px-1 pb-1 text-center"
        aria-label={ariaLabel}
      >
        <ScoringLensTitle label={t(language, "dashboard.scoringTrack")} theme={theme} />
        <TriptychScoringSparkline points={scoringLens.points} language={language} theme={theme} />
        <ScoringTrackKey language={language} theme={theme} mode="track" />
        <p className={`mt-0.5 max-w-full truncate font-semibold leading-tight ${theme === "dark" ? "text-slate-400" : "text-slate-500"}`}>
          <span className="triptych-micro-copy">
            {t(language, "dashboard.scoringTrackSummary", {
              expected: expectedLabel,
              locked: lockedLabel
            })}
          </span>
        </p>
      </div>
    );
  }

  const outlookLabel =
    scoringLens.expectedDelta === null || scoringLens.betterThanSavedPct === null
      ? null
      : t(language, "dashboard.scoringExpectedBetter", {
          delta: formatSignedScenarioDelta(scoringLens.expectedDelta),
          percent: scoringLens.betterThanSavedPct
        });

  return (
    <div
      className="flex h-full min-w-0 translate-y-1 flex-col items-center justify-center px-0 pb-0 pt-0 text-center"
      aria-label={t(language, "dashboard.scoringOutlookAria", {
        label: outlookLabel ?? t(language, "dashboard.scoringWaitingToStart")
      })}
    >
      {outlookLabel ? (
        <p className={`mt-1 max-w-full truncate text-[12px] font-black leading-tight tracking-[-0.03em] sm:text-[13px] ${getPrimaryTextClasses(theme)}`}>
          {outlookLabel}
        </p>
      ) : null}
      <TriptychScoringPreviewChart language={language} theme={theme} />
      <ScoringTrackKey language={language} theme={theme} mode="preview" />
    </div>
  );
}

function ScoringLensTitle({
  label,
  theme
}: {
  label: string;
  theme: TriptychTheme;
}) {
  const titleParts = getStackedScoringTitleParts(label);

  return (
    <p className={`max-w-full text-center text-[9px] font-black uppercase leading-[0.95] tracking-[0.08em] ${getMutedTextClasses(theme)}`}>
      {titleParts.map((part, index) => (
        <span key={`${part}-${index}`} className="block truncate">
          {part}
        </span>
      ))}
    </p>
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
  const savedStroke = theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)";
  const actualStroke = theme === "dark" ? "#fbbf24" : "#d97706";
  const gridStroke = theme === "dark" ? "rgba(226, 232, 240, 0.16)" : "rgba(100, 116, 139, 0.16)";
  const tickFill = theme === "dark" ? "rgba(226, 232, 240, 0.62)" : "rgba(71, 85, 105, 0.62)";
  const yDomain = useMemo<[number, number]>(() => {
    const values = points.flatMap((point) => [point.projectedPoints, point.actualLockedPoints]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(1, max - min);
    const padding = Math.max(2, Math.round(spread * 0.12));
    return [Math.max(0, min - padding), max + padding];
  }, [points]);

  const chartData = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        projected: point.projectedPoints,
        actual: point.actualLockedPoints
      })),
    [points]
  );

  return (
    <div className="triptych-scoring-chart relative mt-0.5">
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 z-10 text-[6px] font-semibold uppercase leading-none tracking-[0.08em] ${getMutedTextClasses(theme)}`}
      >
        {t(language, "dashboard.scoringAxisPoints")}
      </span>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} strokeWidth={0.7} strokeDasharray="1 5" />
          <XAxis
            dataKey="label"
            height={12}
            interval="preserveStartEnd"
            minTickGap={10}
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 6, fontWeight: 600 }}
          />
          <YAxis
            width={20}
            domain={yDomain}
            tickCount={3}
            axisLine={false}
            tickLine={false}
            tick={{ fill: tickFill, fontSize: 6, fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="projected"
            stroke={savedStroke}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke={actualStroke}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TriptychScoringPreviewChart({
  language,
  theme
}: {
  language?: string | null;
  theme: TriptychTheme;
}) {
  const axisStroke = theme === "dark" ? "rgba(226, 232, 240, 0.38)" : "rgba(100, 116, 139, 0.34)";
  const tickStroke = theme === "dark" ? "rgba(226, 232, 240, 0.32)" : "rgba(100, 116, 139, 0.26)";
  const gridStroke = theme === "dark" ? "rgba(226, 232, 240, 0.28)" : "rgba(100, 116, 139, 0.26)";
  const labelFill = theme === "dark" ? "rgba(226, 232, 240, 0.72)" : "rgba(71, 85, 105, 0.68)";
  const valueFill = theme === "dark" ? "rgba(226, 232, 240, 0.58)" : "rgba(71, 85, 105, 0.58)";
  const waitingFill = theme === "dark" ? "#fca5a5" : "#b91c1c";
  const yGuides = [
    { y: 12, label: "100" },
    { y: 69, label: "50" },
    { y: 126, label: "0" }
  ];
  const xGuides = [42, 66, 90, 116];

  return (
    <div
      className="triptych-scoring-preview-chart mt-1"
      aria-label={t(language, "dashboard.scoringPreviewAria")}
    >
      <svg viewBox="0 0 120 150" role="img" className="h-full w-full overflow-visible">
        {yGuides.map(({ y }) => (
          <line key={`grid-y-${y}`} x1="20" y1={y} x2="116" y2={y} stroke={gridStroke} strokeWidth="0.95" strokeDasharray="1 4" />
        ))}
        {xGuides.map((x) => (
          <line key={`grid-x-${x}`} x1={x} y1="12" x2={x} y2="126" stroke={gridStroke} strokeWidth="0.95" strokeDasharray="1 4" />
        ))}
        <line x1="20" y1="12" x2="20" y2="126" stroke={axisStroke} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="20" y1="126" x2="116" y2="126" stroke={axisStroke} strokeWidth="1.2" strokeLinecap="round" />
        {yGuides.map(({ y, label }) => (
          <g key={`y-${label}`}>
            <line x1="16" y1={y} x2="20" y2={y} stroke={tickStroke} strokeWidth="1.4" strokeLinecap="round" />
            <text x="13" y={y + 2.5} fill={valueFill} fontSize="6.5" fontWeight="600" textAnchor="end">
              {label}
            </text>
          </g>
        ))}
        {xGuides.slice(0, -1).map((x) => (
          <line key={`x-${x}`} x1={x} y1="126" x2={x} y2="130" stroke={tickStroke} strokeWidth="1.4" strokeLinecap="round" />
        ))}
        <text
          x="20"
          y="8"
          fill={labelFill}
          fontSize="6"
          fontWeight="600"
          letterSpacing="0.08em"
          textAnchor="start"
        >
          {t(language, "dashboard.scoringAxisPoints")}
        </text>
        <text
          x="68"
          y="72"
          fill={waitingFill}
          fontSize="8.2"
          fontWeight="800"
          letterSpacing="0.11em"
          textAnchor="middle"
        >
          {t(language, "dashboard.scoringWaitingToStart")}
        </text>
        <text
          x="116"
          y="146"
          fill={labelFill}
          fontSize="6"
          fontWeight="600"
          letterSpacing="0.08em"
          textAnchor="end"
        >
          {t(language, "dashboard.scoringAxisTime")}
        </text>
      </svg>
    </div>
  );
}

function ScoringTrackKey({
  language,
  theme,
  mode = "track"
}: {
  language?: string | null;
  theme: TriptychTheme;
  mode?: "track" | "preview";
}) {
  const firstLabel = mode === "preview"
    ? t(language, "dashboard.scoringSavedShort")
    : t(language, "dashboard.scoringProjectedShort");

  return (
    <p className={`mt-1 inline-flex max-w-full flex-col items-start justify-center gap-1 overflow-visible py-0.5 font-semibold uppercase tracking-[0.08em] ${getMutedTextClasses(theme)}`}>
      <span className="inline-flex items-center gap-1 leading-[1.15]">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: theme === "dark" ? "var(--triptych-dark-accent-text)" : "var(--app-accent)" }}
        />
        <span className="triptych-micro-copy">{firstLabel}</span>
      </span>
      <span className="inline-flex items-center gap-1 leading-[1.15]">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: theme === "dark" ? "#fbbf24" : "#d97706" }}
        />
        <span className="triptych-micro-copy">
          {t(language, "dashboard.scoringActualShort")}
        </span>
      </span>
    </p>
  );
}

function TriptychPanelViewCue({
  isOpen,
  onToggle,
  onTouchStart,
  onTouchEnd,
  contentId,
  language,
  theme
}: {
  isOpen: boolean;
  onToggle: () => void;
  onTouchStart: (event: TouchEvent<HTMLButtonElement>) => void;
  onTouchEnd: (event: TouchEvent<HTMLButtonElement>) => void;
  contentId: string;
  language?: string | null;
  theme: TriptychTheme;
}) {
  return (
    <div
      className={`absolute inset-x-1 bottom-[-3px] z-20 flex items-end justify-center text-[12px] leading-none ${theme === "dark" ? "text-white/40" : "text-slate-400/80"}`}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={t(language, isOpen ? "dashboard.hideScoringLens" : "dashboard.showScoringLens")}
        onClick={onToggle}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="flex h-7 w-8 items-end justify-center rounded-full pb-0.5 transition-colors hover:text-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {isOpen ? (
          <ChevronDown aria-hidden className="h-3 w-3" strokeWidth={2.25} />
        ) : (
          <ChevronUp aria-hidden className="h-3 w-3" strokeWidth={2.25} />
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
      <div className={`relative flex h-full w-full flex-col justify-center divide-y px-1 pb-4 sm:px-10 lg:px-12 ${getDividerClasses(theme)}`}>
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

function getStackedScoringTitleParts(label: string) {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return [label];
  }

  const spacedParts = trimmedLabel.split(/\s+/).filter(Boolean);
  if (spacedParts.length === 2) {
    return spacedParts;
  }

  if (spacedParts.length > 2) {
    return [spacedParts.slice(0, -1).join(" "), spacedParts[spacedParts.length - 1]];
  }

  const hyphenParts = trimmedLabel.split("-").filter(Boolean);
  if (hyphenParts.length === 2) {
    return hyphenParts;
  }

  return [trimmedLabel];
}

function getTriptychScoringLens({
  progress,
  performance,
  scenarioImpact
}: {
  progress: DashboardCommandCenterSummary["progress"];
  performance: DashboardCommandCenterSummary["performance"];
  scenarioImpact: ScenarioImpactSummary | null;
}): TriptychScoringLens | null {
  if (!progress.hasCompletedBracketOnce) {
    return null;
  }

  const isPastDeadline = progress.deadlineAt
    ? new Date(progress.deadlineAt).getTime() <= Date.now()
    : false;
  const isPostLock =
    progress.phase === "knockout_stage" ||
    progress.isLocked ||
    isPastDeadline;

  if (isPostLock) {
    const lockedPoints = performance.globalPoints;
    const expectedTotalPoints = getProjectedScoringTotal(progress, lockedPoints);
    return {
      mode: "post_lock",
      expectedTotalPoints,
      lockedPoints,
      points: getScoringTrackPoints({
        progress,
        expectedTotalPoints,
        lockedPoints
      })
    };
  }

  if (
    !scenarioImpact ||
    (scenarioImpact.affectedPickCount === 0 && scenarioImpact.openThirdPlaceSlots === 0)
  ) {
    return {
      mode: "pre_lock",
      expectedDelta: null,
      betterThanSavedPct: null
    };
  }

  // TODO: Replace this deterministic estimate with simulation-derived expected
  // delta and better-than-saved percentage when scoring snapshots are available.
  const expectedDelta = Math.round((scenarioImpact.riskDelta + scenarioImpact.upsideDelta) / 2);
  const betterThanSavedPct = clampNumeric(
    50 + scenarioImpact.affectedPickCount * 6 - scenarioImpact.openThirdPlaceSlots * 10,
    51,
    86
  );

  return {
    mode: "pre_lock",
    expectedDelta,
    betterThanSavedPct
  };
}

function clampNumeric(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getProjectedScoringTotal(
  progress: DashboardCommandCenterSummary["progress"],
  lockedPoints: number | null
) {
  if (lockedPoints === null) {
    return null;
  }

  const remainingUnits = Math.max(0, progress.totalUnits - progress.completedUnits);
  return lockedPoints + Math.max(8, Math.round(remainingUnits * 2.5));
}

function getScoringTrackPoints({
  progress,
  expectedTotalPoints,
  lockedPoints
}: {
  progress: DashboardCommandCenterSummary["progress"];
  expectedTotalPoints: number | null;
  lockedPoints: number | null;
}): TriptychScoringTrackPoint[] {
  const labels = ["Lock", "G1", "G2", "R16", "QF", "SF", "Final"];
  const expectedTotal = expectedTotalPoints ?? Math.max(1, lockedPoints ?? 0);
  const actualTotal = lockedPoints ?? 0;
  const progressRatio = progress.totalUnits > 0
    ? Math.max(0, Math.min(1, progress.completedUnits / progress.totalUnits))
    : 0.25;
  const currentCheckpoint = Math.max(1, Math.round(progressRatio * (labels.length - 1)));

  return labels.map((label, index) => {
    const projectedProgress = index / (labels.length - 1);
    const actualProgress = index <= currentCheckpoint ? index / currentCheckpoint : 1;

    return {
      checkpointId: label.toLowerCase(),
      label,
      projectedPoints: Math.round(expectedTotal * projectedProgress),
      actualLockedPoints: Math.round(actualTotal * actualProgress)
    };
  });
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
