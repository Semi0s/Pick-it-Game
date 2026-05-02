"use client";

import { Clock3, Trophy } from "lucide-react";
import { PointerEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { saveBracketPredictionAction } from "@/app/knockout/actions";
import { WindowChoiceRail, useSessionJsonState } from "@/components/player-management/Shared";
import { showAppToast } from "@/lib/app-toast";
import { formatDateTimeWithZone } from "@/lib/date-time";
import {
  type BracketTeamOption,
  type KnockoutBracketEditorView,
  type KnockoutBracketMatchView
} from "@/lib/bracket-predictions";
import type { BracketPrediction } from "@/lib/types";

type KnockoutBracketBuilderProps = {
  initialView: KnockoutBracketEditorView;
};

type BracketSlideView = {
  id: string;
  title: string;
  eyebrow: string;
  subtitle: string;
  currentStage: KnockoutBracketMatchView["stage"];
  currentMatches: KnockoutBracketMatchView[];
  previousStage: KnockoutBracketMatchView["stage"] | null;
  previousLabel: string | null;
  previousMatches: KnockoutBracketMatchView[];
  nextStage: KnockoutBracketMatchView["stage"] | null;
  nextLabel: string | null;
  nextMatches: KnockoutBracketMatchView[];
  champion: BracketTeamOption | null;
  layout: "split" | "focus" | "finale";
};

type MatchAlignmentRow = {
  current: KnockoutBracketMatchView;
  leftSource: KnockoutBracketMatchView | null;
  rightSource: KnockoutBracketMatchView | null;
};

type RailMotion = "open-left" | "open-right" | "rolled-left" | "rolled-right" | "flat";
const KNOCKOUT_ACTIVE_SLIDE_STORAGE_KEY = "knockout-active-slide";

export function KnockoutBracketBuilder({ initialView }: KnockoutBracketBuilderProps) {
  const [predictions, setPredictions] = useState<BracketPrediction[]>(initialView.predictions);
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useSessionJsonState<number>(KNOCKOUT_ACTIVE_SLIDE_STORAGE_KEY, 0);
  const [transitionDirection, setTransitionDirection] = useState<-1 | 0 | 1>(0);
  const [transitionReady, setTransitionReady] = useState(true);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useMemo(() => deriveEditorView(initialView, predictions), [initialView, predictions]);
  const slides = useMemo(() => buildBracketSlides(view), [view]);
  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setActiveSlideIndex((current) => Math.max(0, Math.min(current, slides.length - 1)));
  }, [setActiveSlideIndex, slides.length]);

  if (initialView.mode === "official" && !initialView.isSeeded) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Bracket</p>
        <h2 className="mt-2 text-2xl font-black leading-tight">Knockout picks coming soon.</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          We’ll open bracket picks once the knockout field is fully seeded.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <KnockoutPhaseChoiceRail
        showControls={slides.length > 1}
        activeItemKey={slides[activeSlideIndex]?.id}
        onActiveItemChange={(nextKey) => {
          const nextIndex = slides.findIndex((slide) => slide.id === nextKey);
          if (nextIndex >= 0) {
            goToSlide(nextIndex);
          }
        }}
      >
        {slides.map((slide, index) => {
          const isActive = slide.id === slides[activeSlideIndex]?.id;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => goToSlide(index)}
              data-choice-key={slide.id}
              data-choice-active={isActive ? "true" : "false"}
              className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-bold transition ${
                isActive
                  ? "bg-accent text-white"
                  : "border border-gray-300 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
              }`}
            >
              {slide.title}
            </button>
          );
        })}
      </KnockoutPhaseChoiceRail>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div
          className="touch-pan-y select-none bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)]"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <BracketStageViewport
            slide={slides[activeSlideIndex]}
            mode={initialView.mode}
            canAdvance={activeSlideIndex < slides.length - 1}
            canRetreat={activeSlideIndex > 0}
            onAdvance={() => goToSlide(Math.min(activeSlideIndex + 1, slides.length - 1))}
            onRetreat={() => goToSlide(Math.max(activeSlideIndex - 1, 0))}
            direction={transitionDirection}
            ready={transitionReady}
            pendingMatchId={pendingMatchId}
            onSelect={handleSelectWinner}
          />
        </div>
      </div>
    </section>
  );

  function goToSlide(index: number) {
    if (index === activeSlideIndex || index < 0 || index >= slides.length) {
      return;
    }

    const direction = index > activeSlideIndex ? 1 : -1;
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    setTransitionDirection(direction);
    setTransitionReady(false);
    setActiveSlideIndex(index);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionReady(true);
      });
    });
    transitionTimerRef.current = setTimeout(() => {
      setTransitionDirection(0);
      setTransitionReady(true);
      transitionTimerRef.current = null;
    }, 560);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const firstTouch = event.touches[0];
    if (!firstTouch) {
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      return;
    }

    touchStartXRef.current = firstTouch.clientX;
    touchStartYRef.current = firstTouch.clientY;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (startX == null || startY == null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const endY = event.changedTouches[0]?.clientY ?? startY;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    if (Math.abs(deltaX) < 36) {
      return;
    }

    if (deltaX < 0) {
      goToSlide(Math.min(activeSlideIndex + 1, slides.length - 1));
    } else {
      goToSlide(Math.max(activeSlideIndex - 1, 0));
    }
  }

  function handleTouchCancel() {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
      return;
    }

    pointerStartXRef.current = event.clientX;
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const startX = pointerStartXRef.current;
    pointerStartXRef.current = null;
    if (startX == null) {
      return;
    }

    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) < 36) {
      return;
    }

    if (deltaX < 0) {
      goToSlide(Math.min(activeSlideIndex + 1, slides.length - 1));
    } else {
      goToSlide(Math.max(activeSlideIndex - 1, 0));
    }
  }

  function handlePointerCancel() {
    pointerStartXRef.current = null;
  }

  async function handleSelectWinner(matchId: string, teamId: string) {
    setPendingMatchId(matchId);
    setMessage(null);

    const result = await saveBracketPredictionAction({ matchId, teamId });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      setPendingMatchId(null);
      return;
    }

    setPredictions(result.predictions);
    setMessage({ tone: "success", text: "Bracket updated." });
    setPendingMatchId(null);
  }
}

function BracketStageViewport({
  slide,
  mode,
  canAdvance,
  canRetreat,
  onAdvance,
  onRetreat,
  direction,
  ready,
  pendingMatchId,
  onSelect
}: {
  slide: BracketSlideView;
  mode: KnockoutBracketEditorView["mode"];
  canAdvance: boolean;
  canRetreat: boolean;
  onAdvance: () => void;
  onRetreat: () => void;
  direction: -1 | 0 | 1;
  ready: boolean;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
}) {
  const leftMotion: RailMotion = direction === 0 ? "flat" : direction > 0 ? "rolled-left" : "open-left";
  const rightMotion: RailMotion = direction === 0 ? "flat" : direction > 0 ? "open-right" : "rolled-right";

  return (
    <section className="overflow-hidden">
      <div className="border-b border-gray-200 px-3 py-3 sm:px-4 sm:py-4">
        <div className="min-w-0">
          <h3 className="text-2xl font-black leading-tight text-gray-950">{slide.title}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
            {mode === "projected" ? "Choose the winner for every match and be the leader of your group." : "Pick the winning team."}
          </p>
        </div>
      </div>

      <div
        className={`min-h-[30rem] px-2 py-2.5 transition-[opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:min-h-[32rem] sm:px-3 sm:py-3 ${
          ready ? "opacity-100" : "opacity-88"
        }`}
      >
        {slide.layout === "split" ? (
          <SplitRoundView
            slide={slide}
            pendingMatchId={pendingMatchId}
            onSelect={onSelect}
            onAdvance={onAdvance}
            leftRailMotion={leftMotion}
            rightRailMotion={rightMotion}
          />
        ) : slide.layout === "finale" ? (
          <FinaleRoundView
            slide={slide}
            pendingMatchId={pendingMatchId}
            onSelect={onSelect}
            onAdvance={canAdvance ? onAdvance : undefined}
            onRetreat={canRetreat ? onRetreat : undefined}
          />
        ) : (
          <FocusedRoundView
            slide={slide}
            pendingMatchId={pendingMatchId}
            onSelect={onSelect}
            onAdvance={canAdvance ? onAdvance : undefined}
            onRetreat={canRetreat ? onRetreat : undefined}
          />
        )}
      </div>
    </section>
  );
}

function KnockoutPhaseChoiceRail({
  children,
  className,
  showControls = true,
  activeItemKey,
  onActiveItemChange
}: {
  children: React.ReactNode;
  className?: string;
  showControls?: boolean;
  activeItemKey?: string;
  onActiveItemChange?: (key: string) => void;
}) {
  return (
    <WindowChoiceRail
      className={className}
      showControls={showControls}
      prevLabel="Show previous knockout phase"
      nextLabel="Show next knockout phase"
      activeItemKey={activeItemKey}
      onActiveItemChange={onActiveItemChange}
    >
      {children}
    </WindowChoiceRail>
  );
}

function SplitRoundView({
  slide,
  pendingMatchId,
  onSelect,
  onAdvance,
  leftRailMotion,
  rightRailMotion
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdvance: () => void;
  leftRailMotion: RailMotion;
  rightRailMotion: RailMotion;
}) {
  const midpoint = Math.ceil(slide.currentMatches.length / 2);
  const leftMatches = slide.currentMatches.slice(0, midpoint);
  const rightMatches = slide.currentMatches.slice(midpoint);
  const rows = Array.from({ length: Math.max(leftMatches.length, rightMatches.length) }, (_, index) => ({
    leftMatch: leftMatches[index] ?? null,
    rightMatch: rightMatches[index] ?? null
  }));

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={`r32-row-${index}`} className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          <div className={`flex h-full min-w-0 w-full items-center ${getRailMotionClasses(leftRailMotion, "left")}`}>
            {row.leftMatch ? (
              <CurrentRoundMatchCard
                match={row.leftMatch}
                isPending={pendingMatchId === row.leftMatch.matchId}
                onSelect={onSelect}
                density="compact"
                side="left"
              />
            ) : (
              <div className="min-h-[112px] w-full rounded-lg border border-gray-200 bg-gray-50/70" />
            )}
          </div>
          <div className="relative flex h-full min-h-[112px] items-center justify-center">
            <div className="relative top-3 z-10 flex flex-col items-center sm:top-4">
              <button
                type="button"
                onClick={onAdvance}
                aria-label="Open the next knockout round"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent/25 bg-white text-accent transition hover:border-accent hover:bg-accent-light"
              >
                <span className="h-2 w-2 rounded-full bg-accent" />
              </button>
              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-accent">Next</span>
            </div>
          </div>
          <div className={`flex h-full min-w-0 w-full items-center ${getRailMotionClasses(rightRailMotion, "right")}`}>
            {row.rightMatch ? (
              <CurrentRoundMatchCard
                match={row.rightMatch}
                isPending={pendingMatchId === row.rightMatch.matchId}
                onSelect={onSelect}
                density="compact"
                side="right"
              />
            ) : (
              <div className="min-h-[112px] w-full rounded-lg border border-gray-200 bg-gray-50/70" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FocusedRoundView({
  slide,
  pendingMatchId,
  onSelect,
  onAdvance,
  onRetreat
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdvance?: () => void;
  onRetreat?: () => void;
}) {
  const alignedRows = buildSourceAlignmentRows(slide.currentMatches, slide.previousMatches);

  return (
    <div className="space-y-3">
      {alignedRows.map((row, index) => (
        <div
          key={row.current.matchId}
          className={`space-y-2 ${
            index < alignedRows.length - 1 ? "border-b border-gray-200 pb-3" : ""
          }`}
        >
          <MatchGroupHeader match={row.current} accent="accent" />
          <div className="relative grid grid-cols-[0.55fr_1.9fr_0.55fr] gap-2 sm:grid-cols-[0.52fr_1.96fr_0.52fr] sm:gap-3">
            <div
              aria-hidden
              className="pointer-events-none absolute left-[calc(50%-1.5rem)] right-[calc(50%-1.5rem)] top-1/2 h-px -translate-y-1/2 bg-gray-200"
            />
              <RoundRailCard
                match={row.leftSource}
                side="left"
                motion="flat"
                provenanceLabel={formatBracketProvenanceLabel(row.current.homeSourceLabel)}
                onClick={onRetreat}
                ariaLabel={onRetreat ? `Go back to ${slide.previousLabel ?? "the previous round"}` : undefined}
              />
            <CenterSeamMatch
              match={row.current}
              isPending={pendingMatchId === row.current.matchId}
              onSelect={onSelect}
              onAdvance={onAdvance}
              onRetreat={onRetreat}
              showHeader={false}
            />
              <RoundRailCard
                match={row.rightSource}
                side="right"
                motion="flat"
                provenanceLabel={formatBracketProvenanceLabel(row.current.awaySourceLabel)}
                onClick={onRetreat}
                ariaLabel={onRetreat ? `Go back to ${slide.previousLabel ?? "the previous round"}` : undefined}
              />
          </div>
        </div>
      ))}
    </div>
  );
}

function FinaleRoundView({
  slide,
  pendingMatchId,
  onSelect,
  onAdvance,
  onRetreat
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdvance?: () => void;
  onRetreat?: () => void;
}) {
  const alignedRows = buildSourceAlignmentRows(slide.currentMatches, slide.previousMatches);
  const finalRow = alignedRows[0] ?? null;

  return (
    <div className="space-y-3">
      <ChampionCard champion={slide.champion} />
      {finalRow ? (
        <div className="rounded-lg border border-gray-200 bg-white p-2 sm:p-3">
          <MatchGroupHeader match={finalRow.current} accent="amber" />
          <div className="mt-2 border-t border-gray-100 pt-2 sm:pt-3">
            <div className="relative grid grid-cols-[0.55fr_1.9fr_0.55fr] gap-2 sm:grid-cols-[0.52fr_1.96fr_0.52fr] sm:gap-3">
              <div
                aria-hidden
                className="pointer-events-none absolute left-[calc(50%-1.5rem)] right-[calc(50%-1.5rem)] top-1/2 h-px -translate-y-1/2 bg-gray-200"
              />
              <RoundRailCard
                match={finalRow.leftSource}
                side="left"
                motion="flat"
                provenanceLabel={formatBracketProvenanceLabel(finalRow.current.homeSourceLabel)}
                onClick={onRetreat}
                ariaLabel={onRetreat ? `Go back to ${slide.previousLabel ?? "the previous round"}` : undefined}
              />
              <CenterSeamMatch
                match={finalRow.current}
                isPending={pendingMatchId === finalRow.current.matchId}
                onSelect={onSelect}
                hero
                onAdvance={onAdvance}
                showHeader={false}
              />
              <RoundRailCard
                match={finalRow.rightSource}
                side="right"
                motion="flat"
                provenanceLabel={formatBracketProvenanceLabel(finalRow.current.awaySourceLabel)}
                onClick={onRetreat}
                ariaLabel={onRetreat ? `Go back to ${slide.previousLabel ?? "the previous round"}` : undefined}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MatchGroupHeader({
  match,
  accent
}: {
  match: KnockoutBracketMatchView;
  accent: "accent" | "amber";
}) {
  const matchNumber = getKnockoutMatchNumber(match.title);
  const hasOfficialTeams = Boolean(match.seededHomeTeam && match.seededAwayTeam);
  const showInlineProjectedTime = match.viewMode === "projected" && !hasOfficialTeams && match.status !== "final";
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 px-1 py-1">
      <div className="row-span-2">
        {matchNumber ? <KnockoutMatchNumberBadge number={matchNumber} /> : <p className="text-sm font-black text-gray-950">{match.title}</p>}
      </div>
      <div className="flex items-center justify-end gap-2">
        {showInlineProjectedTime ? (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{formatKickoff(match.kickoffTime)}</p>
        ) : null}
        <MatchStatusBadge
          status={match.status}
          canSelectWinner={match.canSelectWinner}
          hasOfficialTeams={hasOfficialTeams}
          accent={accent}
          viewMode={match.viewMode}
        />
      </div>
      {showInlineProjectedTime ? <div /> : <p className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-500">{formatKickoff(match.kickoffTime)}</p>}
    </div>
  );
}

function RoundRailCard({
  match,
  side,
  motion,
  provenanceLabel,
  onClick,
  ariaLabel
}: {
  match: KnockoutBracketMatchView | null;
  side: "left" | "right";
  motion: RailMotion;
  provenanceLabel?: string | null;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const classes = `flex min-h-full items-center rounded-lg border p-1.5 transition duration-500 ease-out ${getRailMotionClasses(
    motion,
    side
  )} ${side === "right" ? "text-right" : ""} ${
    onClick
      ? "cursor-pointer border-gray-200 bg-white hover:border-accent hover:bg-accent-light"
      : "border-gray-200 bg-white"
  }`;
  const advancingTeam = match ? getAdvancingTeamForRail(match) : null;
  const content = match ? (
    <div className="w-full space-y-1">
      {provenanceLabel ? (
        <div className="pb-1 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400">
          {renderProvenanceLabel(provenanceLabel)}
        </div>
      ) : null}
      <ProjectedTeamChip team={advancingTeam} placeholderLabel={advancingTeam ? null : "TBD"} />
    </div>
  ) : (
    <div className="flex min-h-[92px] w-full items-center justify-center rounded-md bg-gray-50/70 px-1 text-[10px] font-semibold text-gray-400">
      Waiting
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel ?? "Navigate knockout bracket"} className={classes}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

function CenterSeamMatch({
  match,
  isPending,
  onSelect,
  onAdvance,
  onRetreat,
  hero = false,
  showHeader = true
}: {
  match: KnockoutBracketMatchView;
  isPending: boolean;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdvance?: () => void;
  onRetreat?: () => void;
  hero?: boolean;
  showHeader?: boolean;
}) {
  return (
    <div className="relative flex min-w-0 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-2 -left-3 w-3 sm:-left-4 sm:w-4"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-2 -right-3 w-3 sm:-right-4 sm:w-4"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-gray-200"
      />
      {onAdvance || onRetreat ? (
        <button
          type="button"
          onClick={onAdvance ?? onRetreat}
          aria-label={hero ? "Open the champion view" : "Open the next knockout round"}
          className={`absolute left-1/2 top-1/2 z-10 inline-flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border transition ${
            hero
              ? "border-amber-300/40 bg-white text-amber-700 hover:border-amber-500 hover:bg-amber-50"
              : "border-accent/25 bg-white text-accent hover:border-accent hover:bg-accent-light"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${hero ? "bg-amber-500" : "bg-accent"}`} />
        </button>
      ) : null}
      <CurrentRoundMatchCard
        match={match}
        isPending={isPending}
        onSelect={onSelect}
        density={hero ? "hero" : "expanded"}
        side="center"
        showHeader={showHeader}
      />
    </div>
  );
}

function CurrentRoundMatchCard({
  match,
  isPending,
  onSelect,
  density,
  side = "left",
  showHeader = true
}: {
  match: KnockoutBracketMatchView;
  isPending: boolean;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  density: "compact" | "expanded" | "hero";
  side?: "left" | "right" | "center";
  showHeader?: boolean;
}) {
  const isCompact = density === "compact";
  const isHero = density === "hero";
  const isEmbeddedCenterCard = side === "center" && !showHeader;
  const matchNumber = getKnockoutMatchNumber(match.title);
  const hasOfficialTeams = Boolean(match.seededHomeTeam && match.seededAwayTeam);
  const showInlineProjectedTime = match.viewMode === "projected" && !hasOfficialTeams && match.status !== "final";
  const statusBadge =
    match.status === "final" ? (
      <span className="shrink-0 rounded-md bg-gray-200 px-2 py-1 text-[11px] font-black text-gray-700">Final</span>
    ) : match.viewMode === "projected" ? (
      <ProjectedMatchStatusChip
        hasOfficialTeams={hasOfficialTeams}
      />
    ) : match.canSelectWinner ? (
      <span className="shrink-0 rounded-md bg-green-50 px-2 py-1 text-[11px] font-black text-green-700">Open</span>
    ) : (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-gray-500"
        aria-label="Waiting"
        title="Waiting"
      >
        <Clock3 aria-hidden className="h-3.5 w-3.5" />
      </span>
    );

  return (
    <div
      className={
        isEmbeddedCenterCard
          ? `${isHero ? "p-1" : "p-0.5"}`
          : `w-full rounded-lg border ${
              isHero
                ? "border-amber-200 bg-white p-1.5"
                : isCompact
                  ? "border-gray-200 bg-white p-1.5"
                  : "border-gray-200 bg-white p-1"
            }`
      }
    >
      {showHeader ? (
        <div className="grid grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5">
          <div className="row-span-2">
            {matchNumber ? (
              <KnockoutMatchNumberBadge number={matchNumber} compact={isCompact} />
            ) : (
              <p className={`${isCompact ? "text-xs" : "text-sm"} font-black text-gray-950`}>{match.title}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {showInlineProjectedTime ? (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {formatKickoff(match.kickoffTime)}
              </p>
            ) : null}
            {statusBadge}
          </div>
          {showInlineProjectedTime ? (
            <div />
          ) : (
            <p className="text-right text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {formatKickoff(match.kickoffTime)}
            </p>
          )}
        </div>
      ) : null}

      <div className={`${showHeader ? "mt-0.5" : ""} space-y-0.5`}>
        <TeamChoiceButton
          team={match.homeTeam}
          officialTeam={match.seededHomeTeam}
          placeholderLabel={match.homeSourceLabel}
          projectionSource={match.homeResolutionSource}
          viewMode={match.viewMode}
          status={match.status}
          officialScore={match.homeScore}
          isOfficialWinner={Boolean(match.actualWinnerTeamId && match.seededHomeTeam?.id === match.actualWinnerTeamId)}
          isSelected={Boolean(match.homeTeam?.id && match.predictedWinnerTeamId === match.homeTeam.id)}
          isCorrectSelection={match.status === "final" && match.homeTeam?.id === match.predictedWinnerTeamId ? match.isCorrectWinner : null}
          isDisabled={!match.homeTeam || !match.canSelectWinner || isPending}
          onClick={() => {
            if (match.homeTeam?.id) {
              void onSelect(match.matchId, match.homeTeam.id);
            }
          }}
          density={density}
          cardSide={side}
          competitorSide="left"
        />
        <TeamChoiceButton
          team={match.awayTeam}
          officialTeam={match.seededAwayTeam}
          placeholderLabel={match.awaySourceLabel}
          projectionSource={match.awayResolutionSource}
          viewMode={match.viewMode}
          status={match.status}
          officialScore={match.awayScore}
          isOfficialWinner={Boolean(match.actualWinnerTeamId && match.seededAwayTeam?.id === match.actualWinnerTeamId)}
          isSelected={Boolean(match.awayTeam?.id && match.predictedWinnerTeamId === match.awayTeam.id)}
          isCorrectSelection={match.status === "final" && match.awayTeam?.id === match.predictedWinnerTeamId ? match.isCorrectWinner : null}
          isDisabled={!match.awayTeam || !match.canSelectWinner || isPending}
          onClick={() => {
            if (match.awayTeam?.id) {
              void onSelect(match.matchId, match.awayTeam.id);
            }
          }}
          density={density}
          cardSide={side}
          competitorSide="right"
        />
      </div>

      {match.status === "final" ? (
        <p className="mt-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-600">
          {match.isCorrectWinner === true
            ? `Correct +${match.awardedPoints}`
            : match.isCorrectWinner === false
              ? "Missed"
              : "Awaiting score"}
        </p>
      ) : null}
    </div>
  );
}

function MatchStatusBadge({
  status,
  canSelectWinner,
  hasOfficialTeams,
  accent,
  viewMode
}: {
  status: KnockoutBracketMatchView["status"];
  canSelectWinner: boolean;
  hasOfficialTeams: boolean;
  accent: "accent" | "amber";
  viewMode: KnockoutBracketMatchView["viewMode"];
}) {
  if (status === "final") {
    return <span className="shrink-0 rounded-md bg-gray-200 px-2 py-1 text-[11px] font-black text-gray-700">Final</span>;
  }

  if (viewMode === "projected") {
    return <ProjectedMatchStatusChip hasOfficialTeams={hasOfficialTeams} />;
  }

  if (canSelectWinner) {
    return (
      <span
        className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-black ${
          accent === "amber" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
        }`}
      >
        Open
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-gray-500"
      aria-label="Waiting"
      title="Waiting"
    >
      <Clock3 aria-hidden className="h-3.5 w-3.5" />
    </span>
  );
}

function ProjectedMatchStatusChip({ hasOfficialTeams }: { hasOfficialTeams: boolean }) {
  if (hasOfficialTeams) {
    return <span className="shrink-0 rounded-md bg-green-50 px-2 py-1 text-[10px] font-black text-green-700">READY</span>;
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-gray-100 px-2 py-1 text-gray-500"
      aria-label="Projected bracket preview"
      title="Projected bracket preview"
    >
      <Clock3 aria-hidden className="h-3.5 w-3.5" />
    </span>
  );
}

function TeamChoiceButton({
  team,
  officialTeam,
  placeholderLabel,
  projectionSource,
  viewMode,
  status,
  officialScore,
  isOfficialWinner,
  isSelected,
  isCorrectSelection,
  isDisabled,
  onClick,
  density,
  cardSide,
  competitorSide
}: {
  team: BracketTeamOption | null;
  officialTeam: BracketTeamOption | null;
  placeholderLabel: string | null;
  projectionSource: KnockoutBracketMatchView["homeResolutionSource"];
  viewMode: KnockoutBracketMatchView["viewMode"];
  status: KnockoutBracketMatchView["status"];
  officialScore: number | null;
  isOfficialWinner: boolean;
  isSelected: boolean;
  isCorrectSelection: boolean | null;
  isDisabled: boolean;
  onClick: () => void;
  density: "compact" | "expanded" | "hero";
  cardSide: "left" | "right" | "center";
  competitorSide: "left" | "right";
}) {
  const isCompact = density === "compact";
  const userTeam = team;
  const isProjectedReadOnly = viewMode === "projected";
  const layers = getKnockoutCardLayers({
    competitorSide,
    userTeam,
    officialTeam,
    placeholderLabel,
    projectionSource,
    viewMode,
    status,
    officialScore,
    isSelected,
    isCorrectSelection,
    isOfficialWinner
  });
  const userLayer = layers.userLayer;
  const realLayer = layers.realLayer;
  const shouldDimOnlyForMissing = isProjectedReadOnly ? !userLayer.displayCode && !realLayer.displayName : false;
  const textAlignmentClass =
    cardSide === "right" ? "text-right" : cardSide === "center" ? "text-center" : "text-left";
  const justifiyClass =
    cardSide === "right" ? "justify-end" : cardSide === "center" ? "justify-center" : "justify-between";
  const isLockedState = isDisabled && !isProjectedReadOnly;
  const userLayerWidthClass = "basis-[34%]";
  const realLayerWidthClass = "basis-[66%]";
  const ariaTeamName = officialTeam?.name ?? userTeam?.name ?? placeholderLabel ?? "this team";
  const ariaLabel = isProjectedReadOnly
    ? `Projected knockout preview for ${ariaTeamName}.`
    : isDisabled
      ? `${ariaTeamName} is locked for this matchup.`
      : `Pick ${ariaTeamName} to win this matchup.`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={ariaLabel}
      className={`flex w-full items-center rounded-lg border transition ${
        isSelected
          ? "border-accent bg-accent text-white"
          : shouldDimOnlyForMissing
            ? "border-gray-200 bg-gray-50/80 text-gray-400"
            : isProjectedReadOnly
              ? "border-gray-200 bg-white"
              : "border-gray-200 bg-white hover:border-accent hover:bg-accent-light"
      } ${justifiyClass} ${textAlignmentClass} overflow-hidden ${
        isCompact ? "min-h-[56px]" : "min-h-[54px]"
      } disabled:cursor-not-allowed disabled:opacity-75`}
    >
      {cardSide === "center" ? (
        renderCenterLayer()
      ) : (
        <span className="flex w-full">
          {getProjectedTileAxis() === "left" ? (
            <>
              {renderUserLayer()}
              <span className="w-px self-stretch bg-gray-200" />
              {renderRealLayer("right")}
            </>
          ) : (
            <>
              {renderRealLayer("left")}
              <span className="w-px self-stretch bg-gray-200" />
              {renderUserLayer()}
            </>
          )}
        </span>
      )}
    </button>
  );

  function renderCenterLayer() {
    const centerDisplayLabel = team?.name ?? placeholderLabel ?? "";
    const centerLabel = status === "final" ? "Final" : status === "live" ? "Live" : isSelected ? "You" : team ? "Pick" : null;
    const centerHelperLabel =
      status === "final" || status === "live"
        ? officialScore != null
          ? String(officialScore)
          : null
        : null;

    return (
      <span
        className={`flex w-full flex-col items-center justify-center px-3 py-1 text-center ${
          isSelected ? "bg-accent text-white" : "bg-white text-gray-950"
        }`}
      >
        {centerLabel ? (
          <span className={`text-[10px] font-bold uppercase tracking-wide ${isSelected ? "text-white/80" : "text-gray-500"}`}>
            {centerLabel}
          </span>
        ) : null}
        <span className="mt-0.5 flex items-center gap-1">
          {team?.flagEmoji ? <span aria-hidden className="text-sm leading-none">{team.flagEmoji}</span> : null}
          <span className={`${isCompact ? "text-xs" : "text-sm"} font-black`}>
            {centerDisplayLabel}
          </span>
        </span>
        {centerHelperLabel ? (
          <span className={`mt-0.5 text-[10px] font-semibold ${isSelected ? "text-white/80" : "text-gray-500"}`}>
            {centerHelperLabel}
          </span>
        ) : null}
      </span>
    );
  }

  function getProjectedTileAxis() {
    if (cardSide === "left") {
      return "left" as const;
    }

    if (cardSide === "right") {
      return "right" as const;
    }

    return competitorSide === "left" ? "left" : "right";
  }

  function renderUserLayer(isStacked = false) {
    return (
      <span
        className={`min-w-0 ${isStacked ? "w-full" : userLayerWidthClass} px-2 py-1 ${
          userLayer.isSelected
            ? userLayer.isCorrect === true
              ? "bg-green-100 text-green-900"
              : userLayer.isCorrect === false
                ? "bg-rose-50 text-rose-800"
                : "bg-accent text-white"
            : isLockedState
              ? "bg-gray-100 text-gray-500"
              : "bg-white text-gray-950"
        }`}
      >
        <span
          className={`flex h-full flex-col justify-center ${
            isStacked
              ? "items-center text-center"
              : "items-center text-center"
          }`}
        >
          <span className={`text-[9px] font-bold uppercase tracking-wide ${userLayer.isSelected ? "text-white/80" : "text-gray-500"}`}>
            {userLayer.label}
          </span>
          <span className="mt-0.5 flex items-center gap-1">
            {userLayer.flagEmoji ? <span aria-hidden className="text-sm leading-none">{userLayer.flagEmoji}</span> : null}
            <span className={`${isCompact ? "text-xs" : "text-sm"} font-black uppercase`}>{userLayer.displayCode}</span>
          </span>
          {userLayer.helperText ? (
            <span className={`mt-0.5 text-[10px] font-semibold ${userLayer.isSelected ? "text-white/80" : "text-gray-500"}`}>
              {userLayer.helperText}
            </span>
          ) : null}
        </span>
      </span>
    );
  }

  function renderRealLayer(alignment: "left" | "right", isStacked = false) {
    return (
      <span className={`min-w-0 ${isStacked ? "w-full" : realLayerWidthClass} bg-gray-50 px-2 py-1`}>
        <span className={`flex h-full flex-col justify-center ${isStacked ? "items-center text-center" : alignment === "right" ? "items-end text-right" : "items-start text-left"}`}>
          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-600">{realLayer.label}</span>
          <span className="mt-0.5 flex items-center gap-1">
            {realLayer.placeholderBadge ? (
              <span className="inline-flex items-center rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-black uppercase text-gray-900">
                {realLayer.placeholderBadge}
              </span>
            ) : null}
            <span className={`${isCompact ? "text-xs" : "text-sm"} font-black text-gray-950`}>{realLayer.displayName}</span>
            {realLayer.scoreText ? <span className="text-xs font-black text-gray-700">{realLayer.scoreText}</span> : null}
          </span>
          {realLayer.helperText ? (
            <span className="mt-0.5 text-[10px] font-semibold text-gray-500">{realLayer.helperText}</span>
          ) : null}
        </span>
      </span>
    );
  }
}

function getKnockoutCardLayers({
  competitorSide,
  userTeam,
  officialTeam,
  placeholderLabel,
  projectionSource,
  viewMode,
  status,
  officialScore,
  isSelected,
  isCorrectSelection,
  isOfficialWinner
}: {
  competitorSide: "left" | "right";
  userTeam: BracketTeamOption | null;
  officialTeam: BracketTeamOption | null;
  placeholderLabel: string | null;
  projectionSource: KnockoutBracketMatchView["homeResolutionSource"];
  viewMode: KnockoutBracketMatchView["viewMode"];
  status: KnockoutBracketMatchView["status"];
  officialScore: number | null;
  isSelected: boolean;
  isCorrectSelection: boolean | null;
  isOfficialWinner: boolean;
}) {
  const isProjected = viewMode === "projected";
  const userDisplayCode = userTeam ? getTeamDisplayCode(userTeam) : "TBD";
  const officialPlaceholderCode = formatKnockoutPlaceholderCode(placeholderLabel);
  const officialDisplayName = officialTeam?.name ?? formatKnockoutPlaceholderText(officialPlaceholderCode);
  const unresolvedHelper =
    isProjected && projectionSource === "missing" ? "More group results or picks needed" : null;

  const userLayer = isProjected
    ? {
        displayCode: userDisplayCode,
        flagEmoji: userTeam?.flagEmoji ?? null,
        label: "Yours",
        helperText: unresolvedHelper,
        isSelected: false,
        isCorrect: null as boolean | null
      }
    : {
        displayCode: isSelected ? userDisplayCode : "Pick",
        flagEmoji: isSelected ? userTeam?.flagEmoji ?? null : null,
        label: isSelected ? "You" : "Pick",
        helperText: null,
        isSelected,
        isCorrect: isSelected ? isCorrectSelection : null
      };

  const realLayer = {
    displayName: officialDisplayName,
    label: officialTeam ? "Actual" : null,
    scoreText: status === "final" || status === "live" ? (officialScore != null ? String(officialScore) : null) : null,
    helperText: !officialTeam && !isProjected ? (placeholderLabel ?? null) : isOfficialWinner && status === "final" ? "Advanced" : null,
    placeholderBadge: officialTeam ? null : getKnockoutPlaceholderBadge(placeholderLabel)
  };

  return {
    competitorSide,
    userLayer,
    realLayer
  };
}

function getTeamDisplayCode(team: BracketTeamOption) {
  const preferred = team.shortName?.trim() || team.name.trim().slice(0, 3);
  return preferred.toUpperCase();
}

function KnockoutMatchNumberBadge({ number, compact = false }: { number: number; compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-accent font-black text-white ${
        compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm"
      }`}
    >
      {number}
    </span>
  );
}

function getKnockoutMatchNumber(title: string) {
  const matchedNumber = title.match(/(\d+)$/);
  if (!matchedNumber) {
    return null;
  }

  const value = Number(matchedNumber[1]);
  return Number.isFinite(value) ? value : null;
}

function ProjectedTeamChip({
  team,
  placeholderLabel
}: {
  team: BracketTeamOption | null;
  placeholderLabel: string | null;
}) {
  const fallbackCode = formatKnockoutPlaceholderCode(placeholderLabel);
  return (
    <div
      className="flex min-h-[36px] items-center justify-center rounded-md bg-gray-50 px-1 py-1 text-center"
    >
      <span className="inline-flex flex-col items-center justify-center self-center text-center">
        {team?.flagEmoji ? <span aria-hidden className="text-[10px] leading-none">{team.flagEmoji}</span> : null}
        <span className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-gray-900">
          {team?.shortName ?? fallbackCode}
        </span>
      </span>
    </div>
  );
}

function formatKnockoutPlaceholderCode(placeholderLabel: string | null) {
  if (!placeholderLabel) {
    return "TBD";
  }

  const normalized = placeholderLabel.replace(/\s+/g, " ").trim();
  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return `${groupMatch[1].toUpperCase()}-#${groupMatch[2].toLowerCase() === "winner" ? "1" : "2"}`;
  }

  const thirdPlaceMatch = normalized.match(/^Best third-place\s+(\d{1,2})$/i);
  if (thirdPlaceMatch) {
    return `#3-${thirdPlaceMatch[1]}`;
  }

  return normalized.slice(0, 3).toUpperCase();
}

function formatKnockoutPlaceholderText(code: string) {
  const groupedCode = code.match(/^([A-Z])-(#\d)$/);
  if (groupedCode) {
    return groupedCode[2];
  }

  return code;
}

function getKnockoutPlaceholderBadge(placeholderLabel: string | null) {
  if (!placeholderLabel) {
    return null;
  }

  const normalized = placeholderLabel.replace(/\s+/g, " ").trim();
  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return groupMatch[1].toUpperCase();
  }

  return null;
}

function ChampionCard({ champion }: { champion: BracketTeamOption | null }) {
  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-[linear-gradient(135deg,#fff8eb_0%,#ffffff_35%,#fff1c2_100%)] p-5">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/80 bg-white/85 text-amber-700">
          <Trophy aria-hidden className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Champion</p>
          <p className="mt-1 text-2xl font-black text-gray-950">{champion?.name ?? "Choose your champion"}</p>
          <p className="mt-1 text-sm font-semibold text-gray-600">Your final winner lands here.</p>
        </div>
      </div>
    </div>
  );
}

function buildSourceAlignmentRows(
  currentMatches: KnockoutBracketMatchView[],
  previousMatches: KnockoutBracketMatchView[]
): MatchAlignmentRow[] {
  const previousMatchesById = new Map(previousMatches.map((match) => [match.matchId, match]));

  return currentMatches.map((match) => ({
    current: match,
    leftSource: match.homeSourceMatchId ? previousMatchesById.get(match.homeSourceMatchId) ?? null : null,
    rightSource: match.awaySourceMatchId ? previousMatchesById.get(match.awaySourceMatchId) ?? null : null
  }));
}

function getRailMotionClasses(motion: RailMotion, side: "left" | "right") {
  switch (motion) {
    case "open-left":
      return "origin-right scale-x-100 opacity-100";
    case "open-right":
      return "origin-left scale-x-100 opacity-100";
    case "rolled-left":
      return side === "left"
        ? "origin-right scale-x-[0.92] translate-x-1 opacity-80 saturate-75"
        : "opacity-95";
    case "rolled-right":
      return side === "right"
        ? "origin-left scale-x-[0.92] -translate-x-1 opacity-80 saturate-75"
        : "opacity-95";
    default:
      return "scale-x-100 opacity-95";
  }
}

function deriveEditorView(initialView: KnockoutBracketEditorView, predictions: BracketPrediction[]): KnockoutBracketEditorView {
  const predictionByMatchId = new Map(predictions.map((prediction) => [prediction.matchId, prediction]));
  const allMatches = [...initialView.stages.flatMap((stage) => stage.matches), ...(initialView.thirdPlace ? [initialView.thirdPlace] : [])];
  const teamById = new Map<string, BracketTeamOption>();
  const isProjected = initialView.mode === "projected";

  for (const match of allMatches) {
    for (const team of [match.seededHomeTeam, match.seededAwayTeam, match.homeTeam, match.awayTeam]) {
      if (team) {
        teamById.set(team.id, team);
      }
    }
  }

  const resolvedMatches = new Map<string, KnockoutBracketMatchView>();
  const orderedMatches = [...allMatches].sort((left, right) => stageSortValue(left.stage) - stageSortValue(right.stage));

  for (const match of orderedMatches) {
    const homeTeam = match.homeSourceMatchId
      ? getAdvancedTeam(match.homeSourceMatchId, resolvedMatches, predictionByMatchId)
      : isProjected
        ? match.homeTeam
        : match.seededHomeTeam;
    const awayTeam = match.awaySourceMatchId
      ? getAdvancedTeam(match.awaySourceMatchId, resolvedMatches, predictionByMatchId)
      : isProjected
        ? match.awayTeam
        : match.seededAwayTeam;
    const predictedWinnerTeamId = predictionByMatchId.get(match.matchId)?.predictedWinnerTeamId ?? null;
    const validPredictedWinnerTeamId =
      predictedWinnerTeamId && [homeTeam?.id, awayTeam?.id].includes(predictedWinnerTeamId)
        ? predictedWinnerTeamId
        : null;

    resolvedMatches.set(match.matchId, {
      ...match,
      homeTeam,
      awayTeam,
      predictedWinnerTeamId: validPredictedWinnerTeamId,
      canSelectWinner: Boolean(homeTeam && awayTeam) && !initialView.isLocked
    });
  }

  const stages = initialView.stages.map((stage) => ({
    ...stage,
    matches: stage.matches.map((match) => resolvedMatches.get(match.matchId) ?? match)
  }));
  const finalWinnerId = stages.find((stage) => stage.stage === "final")?.matches[0]?.predictedWinnerTeamId ?? null;

  return {
    ...initialView,
    stages,
    champion: finalWinnerId ? teamById.get(finalWinnerId) ?? null : null,
    thirdPlace: initialView.thirdPlace ? resolvedMatches.get(initialView.thirdPlace.matchId) ?? initialView.thirdPlace : null,
    predictions
  };
}

function getAdvancedTeam(
  sourceMatchId: string,
  resolvedMatches: Map<string, KnockoutBracketMatchView>,
  predictionByMatchId: Map<string, BracketPrediction>
) {
  const sourceMatch = resolvedMatches.get(sourceMatchId);
  const predictedWinnerTeamId = predictionByMatchId.get(sourceMatchId)?.predictedWinnerTeamId ?? null;

  if (!sourceMatch || !predictedWinnerTeamId) {
    return null;
  }

  if (sourceMatch.homeTeam?.id === predictedWinnerTeamId) {
    return sourceMatch.homeTeam;
  }

  if (sourceMatch.awayTeam?.id === predictedWinnerTeamId) {
    return sourceMatch.awayTeam;
  }

  return null;
}

function stageSortValue(stage: KnockoutBracketMatchView["stage"]) {
  switch (stage) {
    case "r32":
      return 0;
    case "r16":
      return 1;
    case "qf":
      return 2;
    case "sf":
      return 3;
    case "final":
      return 4;
    case "third":
      return 5;
    default:
      return 99;
  }
}

function formatBracketProvenanceLabel(label: string | null | undefined) {
  if (!label) {
    return null;
  }

  const normalized = label.trim().toUpperCase();
  const winnerRef = normalized.match(/^WINNER OF\s+([A-Z0-9-]+)$/i);
  if (winnerRef) {
    return `WIN|${winnerRef[1]
      .replace(/^R32-/i, "R/32-")
      .replace(/^R16-/i, "R/16-")
      .replace(/-(0)(\d)$/i, "-$2")}`;
  }

  if (normalized === "FINAL") {
    return "WIN|FINAL";
  }

  return `WIN|${normalized}`;
}

function renderProvenanceLabel(label: string) {
  const [top, bottom] = label.split("|");
  if (!bottom) {
    return label;
  }

  return (
    <span className="inline-flex flex-col items-center justify-center leading-tight">
      <span>{top}</span>
      <span>{bottom}</span>
    </span>
  );
}

function getAdvancingTeamForRail(match: KnockoutBracketMatchView) {
  if (match.status !== "final" || !match.actualWinnerTeamId) {
    return null;
  }

  if (match.homeTeam?.id === match.actualWinnerTeamId) {
    return match.homeTeam;
  }

  if (match.awayTeam?.id === match.actualWinnerTeamId) {
    return match.awayTeam;
  }

  if (match.seededHomeTeam?.id === match.actualWinnerTeamId) {
    return match.seededHomeTeam;
  }

  if (match.seededAwayTeam?.id === match.actualWinnerTeamId) {
    return match.seededAwayTeam;
  }

  return null;
}

function formatKickoff(kickoffTime: string) {
  return formatDateTimeWithZone(kickoffTime);
}

function buildBracketSlides(view: KnockoutBracketEditorView): BracketSlideView[] {
  const stageMap = new Map(view.stages.map((stage) => [stage.stage, stage]));
  const r32 = stageMap.get("r32");
  const r16 = stageMap.get("r16");
  const qf = stageMap.get("qf");
  const sf = stageMap.get("sf");
  const final = stageMap.get("final");

  const slides: BracketSlideView[] = [
    {
      id: "r32",
      title: "Round of 32",
      eyebrow: "Opening round",
      subtitle: "Start wide. Pick each side of the field before the bracket narrows.",
      currentStage: "r32",
      currentMatches: r32?.matches ?? [],
      previousStage: null,
      previousLabel: null,
      previousMatches: [],
      nextStage: "r16",
      nextLabel: r16?.label ?? "Round of 16",
      nextMatches: r16?.matches ?? [],
      champion: null,
      layout: "split"
    },
    {
      id: "r16",
      title: "Round of 16",
      eyebrow: "Center focus",
      subtitle: "Keep the last thirty-two on the rails while you shape the final sixteen in the center.",
      currentStage: "r16",
      currentMatches: r16?.matches ?? [],
      previousStage: "r32",
      previousLabel: r32?.label ?? "Round of 32",
      previousMatches: r32?.matches ?? [],
      nextStage: "qf",
      nextLabel: qf?.label ?? "Quarter-finals",
      nextMatches: qf?.matches ?? [],
      champion: null,
      layout: "focus"
    },
    {
      id: "qf",
      title: "Quarter-finals",
      eyebrow: "Tighten the path",
      subtitle: "The middle lane stays generous while the surrounding rails keep the route legible.",
      currentStage: "qf",
      currentMatches: qf?.matches ?? [],
      previousStage: "r16",
      previousLabel: r16?.label ?? "Round of 16",
      previousMatches: r16?.matches ?? [],
      nextStage: "sf",
      nextLabel: sf?.label ?? "Semi-finals",
      nextMatches: sf?.matches ?? [],
      champion: null,
      layout: "focus"
    },
    {
      id: "sf",
      title: "Semi-finals",
      eyebrow: "Near the summit",
      subtitle: "This is where the bracket starts to feel inevitable. Set the finalists here.",
      currentStage: "sf",
      currentMatches: sf?.matches ?? [],
      previousStage: "qf",
      previousLabel: qf?.label ?? "Quarter-finals",
      previousMatches: qf?.matches ?? [],
      nextStage: "final",
      nextLabel: final?.label ?? "Final",
      nextMatches: final?.matches ?? [],
      champion: null,
      layout: "focus"
    },
    {
      id: "final",
      title: "Final & Champion",
      eyebrow: "Finish strong",
      subtitle: "Set the last match in the center and let your champion step forward.",
      currentStage: "final",
      currentMatches: final?.matches ?? [],
      previousStage: "sf",
      previousLabel: sf?.label ?? "Semi-finals",
      previousMatches: sf?.matches ?? [],
      nextStage: null,
      nextLabel: null,
      nextMatches: [],
      champion: view.champion,
      layout: "finale"
    }
  ];

  return slides.filter((slide) => slide.currentMatches.length > 0);
}
