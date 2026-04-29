"use client";

import { ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { PointerEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { saveBracketPredictionAction } from "@/app/knockout/actions";
import { showAppToast } from "@/lib/app-toast";
import {
  type BracketTeamOption,
  type KnockoutBracketEditorView,
  type KnockoutBracketMatchView
} from "@/lib/bracket-predictions";
import type { BracketPrediction } from "@/lib/types";

type KnockoutBracketBuilderProps = {
  initialView: KnockoutBracketEditorView;
  children?: React.ReactNode;
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

export function KnockoutBracketBuilder({ initialView, children }: KnockoutBracketBuilderProps) {
  const [predictions, setPredictions] = useState<BracketPrediction[]>(initialView.predictions);
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isSectionExpanded, setIsSectionExpanded] = useState(false);
  const [isBuilderExpanded, setIsBuilderExpanded] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<-1 | 0 | 1>(0);
  const [transitionReady, setTransitionReady] = useState(true);
  const touchStartXRef = useRef<number | null>(null);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchGestureHandledRef = useRef(false);
  const pointerStartXRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useMemo(() => deriveEditorView(initialView, predictions), [initialView, predictions]);
  const slides = useMemo(() => buildBracketSlides(view), [view]);
  const totalMatches = view.stages.reduce((sum, stage) => sum + stage.matches.length, 0);
  const savedPickCount = predictions.length;

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

  if (!initialView.isSeeded) {
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
      <div className="relative rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
        <button
          type="button"
          onClick={() => setIsSectionExpanded((current) => !current)}
          className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light sm:right-4 sm:top-4"
          aria-expanded={isSectionExpanded}
          aria-label={isSectionExpanded ? "Hide knockout bracket" : "Open knockout bracket"}
        >
          {isSectionExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          {isSectionExpanded ? "Hide" : "Open"}
        </button>
        <div className="pr-24 sm:pr-28">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Bracket</p>
            <h2 className="mt-2 text-2xl font-black leading-tight text-gray-950">Build your bracket.</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              Move round by round through the knockout path. The center lane stays large and clear while the edges keep
              the bracket story visible.
            </p>
          </div>
        </div>
        {isSectionExpanded ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <div
                className={`inline-flex rounded-md px-3 py-2 text-sm font-semibold ${
                  view.isLocked ? "bg-gray-100 text-gray-700" : "bg-accent-light text-accent-dark"
                }`}
              >
                {view.isLocked ? "Locked" : "Open"}
              </div>
              <div className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
                {savedPickCount} of {totalMatches} picks saved
              </div>
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                {view.bracketPoints} pts · {view.correctPicks} correct
              </div>
            </div>
            {!view.isLocked && view.firstRoundOf32Kickoff ? (
              <p className="mt-4 rounded-md border border-accent-light bg-accent-light/40 px-3 py-3 text-sm font-semibold text-accent-dark">
                Picks stay open until {formatKickoff(view.firstRoundOf32Kickoff)}.
              </p>
            ) : null}
            {view.isLocked ? (
              <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-700">
                Knockout picks are locked because the first knockout match has started.
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {isSectionExpanded ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-gray-700">Bracket Builder</p>
              <p className="mt-1 text-sm font-semibold text-gray-600">
                Swipe or drag through the path and keep the current round in focus.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextOpen = !isBuilderExpanded;
                setIsBuilderExpanded(nextOpen);
                if (nextOpen) {
                  showAppToast({
                    tone: "success",
                    text: "Spread two fingers to go deeper. Pinch inward to roll back out.",
                    durationMs: 3800
                  });
                }
              }}
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
              aria-expanded={isBuilderExpanded}
              aria-label={isBuilderExpanded ? "Hide bracket builder" : "Open bracket builder"}
            >
              {isBuilderExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              {isBuilderExpanded ? "Hide" : "Open"}
            </button>
          </div>
          {isBuilderExpanded ? (
            <div className="mt-3 space-y-3">
              <div
                className="-mx-4 overflow-hidden border-y border-gray-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_18%,#f8fafc_100%)] touch-none select-none"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
              >
                <BracketStageViewport
                  slide={slides[activeSlideIndex]}
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

              <div className="flex items-center justify-center gap-2">
                {slides.map((slide, index) => (
                  <button
                    key={`${slide.id}-dot`}
                    type="button"
                    aria-label={`Open ${slide.title}`}
                    onClick={() => goToSlide(index)}
                    className={`rounded-full transition ${
                      activeSlideIndex === index ? "h-2.5 w-8 bg-accent" : "h-2.5 w-2.5 bg-gray-300"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : null}
          </div>
          {children}
        </div>
      ) : null}
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
    if (event.touches.length >= 2) {
      pinchStartDistanceRef.current = getTouchDistance(event.touches[0], event.touches[1]);
      pinchGestureHandledRef.current = false;
      touchStartXRef.current = null;
      return;
    }

    pinchStartDistanceRef.current = null;
    pinchGestureHandledRef.current = false;
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2 || pinchStartDistanceRef.current == null || pinchGestureHandledRef.current) {
      return;
    }

    const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
    const ratio = currentDistance / Math.max(pinchStartDistanceRef.current, 1);

    if (ratio >= 1.12) {
      pinchGestureHandledRef.current = true;
      goToSlide(Math.min(activeSlideIndex + 1, slides.length - 1));
      return;
    }

    if (ratio <= 0.9) {
      pinchGestureHandledRef.current = true;
      goToSlide(Math.max(activeSlideIndex - 1, 0));
    }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (pinchGestureHandledRef.current || pinchStartDistanceRef.current != null) {
      if (event.touches.length < 2) {
        pinchStartDistanceRef.current = null;
        pinchGestureHandledRef.current = false;
      }
      return;
    }

    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX == null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? startX;
    const deltaX = endX - startX;
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
    pinchStartDistanceRef.current = null;
    pinchGestureHandledRef.current = false;
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

function getTouchDistance(
  firstTouch: { clientX: number; clientY: number },
  secondTouch: { clientX: number; clientY: number }
) {
  return Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY);
}

function BracketStageViewport({
  slide,
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
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-dark">{slide.eyebrow}</p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-2xl font-black leading-tight text-gray-950">{slide.title}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">{slide.subtitle}</p>
          </div>
          <div className="shrink-0 rounded-md border border-white/80 bg-white/80 px-3 py-2 text-right">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">View</p>
            <p className="mt-1 text-sm font-black text-gray-900">{activeSlideLabel(slide)}</p>
          </div>
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
            leftRailMotion={leftMotion}
          />
        ) : (
          <FocusedRoundView
            slide={slide}
            pendingMatchId={pendingMatchId}
            onSelect={onSelect}
            onAdvance={canAdvance ? onAdvance : undefined}
            onRetreat={canRetreat ? onRetreat : undefined}
            leftRailMotion={leftMotion}
            rightRailMotion={rightMotion}
          />
        )}
      </div>
    </section>
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
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 px-1 sm:gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Left side</p>
        <div />
        <p className="text-right text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Right side</p>
      </div>
      {rows.map((row, index) => (
        <div key={`r32-row-${index}`} className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          <div className={`${getRailMotionClasses(leftRailMotion, "left")}`}>
            {row.leftMatch ? (
              <CurrentRoundMatchCard
                match={row.leftMatch}
                isPending={pendingMatchId === row.leftMatch.matchId}
                onSelect={onSelect}
                density="compact"
                side="left"
              />
            ) : (
              <div className="min-h-[112px] rounded-lg border border-gray-200 bg-gray-50/70" />
            )}
          </div>
          <div className="relative flex h-full min-h-[112px] items-center justify-center">
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-accent/25 via-accent/35 to-accent/25"
            />
            <button
              type="button"
              onClick={onAdvance}
              aria-label="Open the next knockout round"
              className="relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent/25 bg-white text-accent transition hover:border-accent hover:bg-accent-light"
            >
              <span className="h-2 w-2 rounded-full bg-accent" />
            </button>
          </div>
          <div className={`${getRailMotionClasses(rightRailMotion, "right")}`}>
            {row.rightMatch ? (
              <CurrentRoundMatchCard
                match={row.rightMatch}
                isPending={pendingMatchId === row.rightMatch.matchId}
                onSelect={onSelect}
                density="compact"
                side="right"
              />
            ) : (
              <div className="min-h-[112px] rounded-lg border border-gray-200 bg-gray-50/70" />
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
  onRetreat,
  leftRailMotion,
  rightRailMotion
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdvance?: () => void;
  onRetreat?: () => void;
  leftRailMotion: RailMotion;
  rightRailMotion: RailMotion;
}) {
  const alignedRows = buildSourceAlignmentRows(slide.currentMatches, slide.previousMatches);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[0.55fr_1.9fr_0.55fr] gap-2 px-1 sm:grid-cols-[0.52fr_1.96fr_0.52fr] sm:gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{slide.previousLabel ?? "Path"}</p>
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-accent-dark">{slide.currentMatches[0]?.stageLabel ?? slide.title}</p>
        <p className="text-right text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{slide.previousLabel ?? "Path"}</p>
      </div>
      {alignedRows.map((row) => (
        <div
          key={row.current.matchId}
          className="relative grid grid-cols-[0.55fr_1.9fr_0.55fr] gap-2 sm:grid-cols-[0.52fr_1.96fr_0.52fr] sm:gap-3"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-[calc(50%-2rem)] right-[calc(50%-2rem)] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-accent/25 via-accent/35 to-accent/25"
          />
          <RoundRailCard match={row.leftSource} side="left" motion={leftRailMotion} />
          <CenterSeamMatch
            match={row.current}
            isPending={pendingMatchId === row.current.matchId}
            onSelect={onSelect}
            onAdvance={onAdvance}
            onRetreat={onRetreat}
          />
          <RoundRailCard match={row.rightSource} side="right" motion={rightRailMotion} />
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
  leftRailMotion
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdvance?: () => void;
  leftRailMotion: RailMotion;
}) {
  const finalMatch = slide.currentMatches[0] ?? null;
  const alignedRows = buildSourceAlignmentRows(slide.currentMatches, slide.previousMatches);
  const finalRow = alignedRows[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[0.55fr_1.9fr_0.55fr] gap-2 px-1 sm:grid-cols-[0.52fr_1.96fr_0.52fr] sm:gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{slide.previousLabel ?? "Path"}</p>
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">{finalMatch?.stageLabel ?? slide.title}</p>
        <p className="text-right text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{slide.previousLabel ?? "Path"}</p>
      </div>
      <ChampionCard champion={slide.champion} />
      {finalRow ? (
        <div className="relative grid grid-cols-[0.55fr_1.9fr_0.55fr] gap-2 sm:grid-cols-[0.52fr_1.96fr_0.52fr] sm:gap-3">
          <div
            aria-hidden
            className="pointer-events-none absolute left-[calc(50%-2rem)] right-[calc(50%-2rem)] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-amber-300/30 via-amber-400/40 to-amber-300/30"
          />
          <RoundRailCard match={finalRow.leftSource} side="left" motion={leftRailMotion} />
          <CenterSeamMatch
            match={finalRow.current}
            isPending={pendingMatchId === finalRow.current.matchId}
            onSelect={onSelect}
            hero
            onAdvance={onAdvance}
          />
          <RoundRailCard match={finalRow.rightSource} side="right" motion={leftRailMotion === "open-left" ? "open-right" : leftRailMotion} />
        </div>
      ) : null}
    </div>
  );
}

function RoundRailCard({
  match,
  side,
  motion
}: {
  match: KnockoutBracketMatchView | null;
  side: "left" | "right";
  motion: RailMotion;
}) {
  return (
    <div
      className={`flex min-h-full items-center rounded-lg border border-gray-200 bg-white/70 p-1.5 transition duration-500 ease-out ${getRailMotionClasses(
        motion,
        side
      )} ${side === "right" ? "text-right" : ""}`}
    >
      {match ? (
        <div className="w-full space-y-1">
            <ProjectedTeamChip team={match.homeTeam} placeholderLabel={match.homeSourceLabel} side={side} />
            <ProjectedTeamChip team={match.awayTeam} placeholderLabel={match.awaySourceLabel} side={side} />
        </div>
      ) : (
        <div className="flex min-h-[92px] w-full items-center justify-center rounded-md bg-gray-50/70 px-1 text-[10px] font-semibold text-gray-400">
          Waiting
        </div>
      )}
    </div>
  );
}

function CenterSeamMatch({
  match,
  isPending,
  onSelect,
  onAdvance,
  onRetreat,
  hero = false
}: {
  match: KnockoutBracketMatchView;
  isPending: boolean;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdvance?: () => void;
  onRetreat?: () => void;
  hero?: boolean;
}) {
  return (
    <div className="relative flex min-w-0 flex-col">
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-2 -left-3 w-3 rounded-l-full ${hero ? "bg-gradient-to-r from-transparent to-amber-200/45" : "bg-gradient-to-r from-transparent to-accent/10"} sm:-left-4 sm:w-4`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-2 -right-3 w-3 rounded-r-full ${hero ? "bg-gradient-to-l from-transparent to-amber-200/45" : "bg-gradient-to-l from-transparent to-accent/10"} sm:-right-4 sm:w-4`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-3 left-1/2 w-px -translate-x-1/2 ${hero ? "bg-gradient-to-b from-transparent via-amber-300/45 to-transparent" : "bg-gradient-to-b from-transparent via-accent/20 to-transparent"}`}
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
      />
    </div>
  );
}

function CurrentRoundMatchCard({
  match,
  isPending,
  onSelect,
  density,
  side = "left"
}: {
  match: KnockoutBracketMatchView;
  isPending: boolean;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  density: "compact" | "expanded" | "hero";
  side?: "left" | "right" | "center";
}) {
  const hasPlaceholderSlot = !match.homeTeam || !match.awayTeam;
  const isCompact = density === "compact";
  const isHero = density === "hero";

  return (
    <div
      className={`rounded-lg border ${
        isHero
          ? "border-amber-200 bg-[linear-gradient(180deg,#fff8eb_0%,#ffffff_100%)] p-4"
          : isCompact
            ? "border-gray-200 bg-white p-2"
            : "border-gray-200 bg-white p-3"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`min-w-0 ${side === "right" ? "text-right" : side === "center" ? "text-center" : ""}`}>
          <p className={`${isCompact ? "text-xs" : "text-sm"} font-black text-gray-950`}>{match.title}</p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {formatKickoff(match.kickoffTime)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-black ${
            match.status === "final"
              ? "bg-gray-200 text-gray-700"
              : match.canSelectWinner
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500"
          }`}
        >
          {match.status === "final" ? "Final" : match.canSelectWinner ? "Open" : "Waiting"}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        <TeamChoiceButton
          team={match.homeTeam}
          placeholderLabel={match.homeSourceLabel}
          isSelected={Boolean(match.homeTeam?.id && match.predictedWinnerTeamId === match.homeTeam.id)}
          isDisabled={!match.homeTeam || !match.canSelectWinner || isPending}
          onClick={() => {
            if (match.homeTeam?.id) {
              void onSelect(match.matchId, match.homeTeam.id);
            }
          }}
          density={density}
          side={side}
        />
        <TeamChoiceButton
          team={match.awayTeam}
          placeholderLabel={match.awaySourceLabel}
          isSelected={Boolean(match.awayTeam?.id && match.predictedWinnerTeamId === match.awayTeam.id)}
          isDisabled={!match.awayTeam || !match.canSelectWinner || isPending}
          onClick={() => {
            if (match.awayTeam?.id) {
              void onSelect(match.matchId, match.awayTeam.id);
            }
          }}
          density={density}
          side={side}
        />
      </div>

      {hasPlaceholderSlot && !match.isLocked ? (
        <p className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600">
          Picks open once knockout teams are confirmed.
        </p>
      ) : null}

      {match.status === "final" ? (
        <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-gray-600">
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

function TeamChoiceButton({
  team,
  placeholderLabel,
  isSelected,
  isDisabled,
  onClick,
  density,
  side
}: {
  team: BracketTeamOption | null;
  placeholderLabel: string | null;
  isSelected: boolean;
  isDisabled: boolean;
  onClick: () => void;
  density: "compact" | "expanded" | "hero";
  side: "left" | "right" | "center";
}) {
  const isCompact = density === "compact";
  const isPlaceholder = !team;
  const isEliminated = !isPlaceholder && !isSelected;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={`flex w-full items-center rounded-lg border transition ${
        isSelected
          ? "border-accent bg-accent-light"
          : isEliminated
            ? "border-gray-200 bg-gray-50/80 text-gray-400"
            : "border-gray-200 bg-white hover:border-accent-light hover:bg-gray-50"
      } ${
        side === "right"
          ? "justify-end text-right"
          : side === "center"
            ? "justify-center text-center"
            : "justify-between text-left"
      } ${isCompact ? "px-2 py-1.5" : "px-3 py-2.5"} disabled:cursor-not-allowed disabled:opacity-75`}
    >
      {side === "right" ? (
        <>
          {isSelected ? <span className="mr-2 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
          <span className="min-w-0">
            <span className={`block truncate ${isCompact ? "text-xs" : "text-sm"} font-black ${isEliminated ? "text-gray-400" : "text-gray-950"}`}>
              {team?.name ?? placeholderLabel ?? "Waiting on previous result"}
            </span>
            <span className={`mt-0.5 block text-[11px] font-semibold uppercase tracking-wide ${isEliminated ? "text-gray-400" : "text-gray-500"}`}>
              {team ? team.shortName : "Placeholder"}
            </span>
          </span>
        </>
      ) : side === "center" ? (
        <span className="flex min-w-0 flex-1 flex-col items-center text-center">
          <span className={`block truncate ${isCompact ? "text-xs" : "text-sm"} font-black ${isEliminated ? "text-gray-400" : "text-gray-950"}`}>
            {team?.name ?? placeholderLabel ?? "Waiting on previous result"}
          </span>
          <span className={`mt-0.5 block text-[11px] font-semibold uppercase tracking-wide ${isEliminated ? "text-gray-400" : "text-gray-500"}`}>
            {team ? team.shortName : "Placeholder"}
          </span>
          {isSelected ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
        </span>
      ) : (
        <>
          <span className="min-w-0">
            <span className={`block truncate ${isCompact ? "text-xs" : "text-sm"} font-black ${isEliminated ? "text-gray-400" : "text-gray-950"}`}>
              {team?.name ?? placeholderLabel ?? "Waiting on previous result"}
            </span>
            <span className={`mt-0.5 block text-[11px] font-semibold uppercase tracking-wide ${isEliminated ? "text-gray-400" : "text-gray-500"}`}>
              {team ? team.shortName : "Placeholder"}
            </span>
          </span>
          {isSelected ? <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}
        </>
      )}
    </button>
  );
}

function ProjectedTeamChip({
  team,
  placeholderLabel,
  side
}: {
  team: BracketTeamOption | null;
  placeholderLabel: string | null;
  side: "left" | "right";
}) {
  const fallbackCode = placeholderLabel ? placeholderLabel.replace(/\s+/g, " ").trim().slice(0, 3).toUpperCase() : "TBD";
  return (
    <div
      className={`flex min-h-[40px] items-center rounded-md bg-gray-50 px-1.5 py-1.5 ${
        side === "right" ? "justify-end text-right" : "justify-start text-left"
      }`}
    >
      <p className="inline-flex items-center justify-center gap-1 self-center text-[11px] font-black uppercase tracking-wide text-gray-900">
        {team?.flagEmoji ? <span aria-hidden className="text-xs leading-none">{team.flagEmoji}</span> : null}
        <span className="truncate">{team?.shortName ?? fallbackCode}</span>
      </p>
    </div>
  );
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
      : match.seededHomeTeam;
    const awayTeam = match.awaySourceMatchId
      ? getAdvancedTeam(match.awaySourceMatchId, resolvedMatches, predictionByMatchId)
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

function activeSlideLabel(slide: BracketSlideView) {
  if (slide.layout === "split") {
    return "Full field";
  }

  if (slide.layout === "finale") {
    return "Finale";
  }

  return "Focus";
}

function formatKickoff(kickoffTime: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(kickoffTime));
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
