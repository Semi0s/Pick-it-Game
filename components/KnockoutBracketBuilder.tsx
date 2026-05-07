"use client";

import { Check, Clock3, Trophy, X } from "lucide-react";
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
  thirdPlaceMatch: KnockoutBracketMatchView | null;
  layout: "split" | "focus" | "finale";
};

const KNOCKOUT_ACTIVE_SLIDE_STORAGE_KEY = "knockout-active-slide";
const KNOCKOUT_ACTIVE_COUNTRY_FILTER_STORAGE_KEY = "knockout-active-country-filter";

export function KnockoutBracketBuilder({ initialView }: KnockoutBracketBuilderProps) {
  const [predictions, setPredictions] = useState<BracketPrediction[]>(initialView.predictions);
  const [draftWinnerByMatchId, setDraftWinnerByMatchId] = useState<Record<string, string>>({});
  const [draftScoreByMatchId, setDraftScoreByMatchId] = useState<Record<string, { homeScore: number; awayScore: number }>>({});
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useSessionJsonState<number>(KNOCKOUT_ACTIVE_SLIDE_STORAGE_KEY, 0);
  const [selectedCountryFilter, setSelectedCountryFilter] = useSessionJsonState<string>(
    KNOCKOUT_ACTIVE_COUNTRY_FILTER_STORAGE_KEY,
    ""
  );
  const [transitionReady, setTransitionReady] = useState(true);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const view = useMemo(
    () => deriveEditorView(initialView, predictions, draftWinnerByMatchId, draftScoreByMatchId),
    [draftScoreByMatchId, draftWinnerByMatchId, initialView, predictions]
  );
  const slides = useMemo(() => buildBracketSlides(view), [view]);
  const activeSlide = slides[activeSlideIndex] ?? null;
  const activeFilterTeam = useMemo(() => {
    if (!selectedCountryFilter || !activeSlide) {
      return null;
    }

    return (
      activeSlide.currentMatches
        .flatMap((match) => [match.homeTeam, match.awayTeam, match.seededHomeTeam, match.seededAwayTeam])
        .find((team) => team?.id === selectedCountryFilter) ?? null
    );
  }, [activeSlide, selectedCountryFilter]);
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
    <section className="space-y-3">
      <div
        className="sticky z-[14] -mx-4 bg-white px-4 py-1.5 sm:mx-0 sm:rounded-lg sm:border sm:border-gray-200 sm:px-3"
        style={{ top: "calc(var(--app-header-height, 72px) + env(safe-area-inset-top, 0px) + 10px)" }}
      >
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
                className={`inline-flex items-center rounded-md px-2.5 py-1 text-[13px] font-bold leading-none transition ${
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
        {selectedCountryFilter ? (
          <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-gray-100 px-2.5 py-1">
            <p className="min-w-0 text-[10px] font-bold uppercase tracking-wide leading-none text-gray-600">
              Filtering for {activeFilterTeam?.shortName ?? "team"}
            </p>
            <button
              type="button"
              onClick={() => setSelectedCountryFilter("")}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide leading-none text-gray-700 transition hover:border-accent hover:bg-accent-light"
            >
              All Teams
            </button>
          </div>
        ) : null}
        <div className="mt-1.5 border-b border-gray-200/80" />
      </div>

      <div className="overflow-visible bg-transparent">
        <div
          className="touch-pan-y select-none"
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
            ready={transitionReady}
            pendingMatchId={pendingMatchId}
            onSelect={handleSelectWinner}
            onAdjustScore={handleAdjustScore}
            onSave={handleSaveWinner}
            selectedCountryFilter={selectedCountryFilter || null}
            onSelectCountryFilter={setSelectedCountryFilter}
          />
        </div>
      </div>
    </section>
  );

  function goToSlide(index: number) {
    if (index === activeSlideIndex || index < 0 || index >= slides.length) {
      return;
    }

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }

    setTransitionReady(false);
    setActiveSlideIndex(index);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionReady(true);
      });
    });
    transitionTimerRef.current = setTimeout(() => {
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

  function handleSelectWinner(matchId: string, teamId: string) {
    setDraftWinnerByMatchId((current) => ({
      ...current,
      [matchId]: teamId
    }));
  }

  function handleAdjustScore(matchId: string, side: "home" | "away", delta: 1 | -1) {
    setDraftScoreByMatchId((current) => {
      const sourceMatch =
        view.stages.flatMap((stage) => stage.matches).find((match) => match.matchId === matchId) ??
        (view.thirdPlace?.matchId === matchId ? view.thirdPlace : null);

      const currentHomeScore = current[matchId]?.homeScore ?? sourceMatch?.predictedHomeScore ?? 0;
      const currentAwayScore = current[matchId]?.awayScore ?? sourceMatch?.predictedAwayScore ?? 0;
      const nextScore = {
        homeScore: side === "home" ? Math.max(0, currentHomeScore + delta) : currentHomeScore,
        awayScore: side === "away" ? Math.max(0, currentAwayScore + delta) : currentAwayScore
      };

      return {
        ...current,
        [matchId]: nextScore
      };
    });
  }

  async function handleSaveWinner(matchId: string) {
    const sourceMatch =
      view.stages.flatMap((stage) => stage.matches).find((match) => match.matchId === matchId) ??
      (view.thirdPlace?.matchId === matchId ? view.thirdPlace : null);
    if (!sourceMatch) {
      return;
    }

    const homeScore = sourceMatch.predictedHomeScore ?? 0;
    const awayScore = sourceMatch.predictedAwayScore ?? 0;
    const teamId = sourceMatch.predictedWinnerTeamId;

    if (homeScore === awayScore && !teamId) {
      setMessage({ tone: "error", text: "Choose who advances by tapping a team name or flag." });
      return;
    }

    setPendingMatchId(matchId);
    setMessage(null);

    const result = await saveBracketPredictionAction({
      matchId,
      teamId,
      homeScore,
      awayScore
    });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      setPendingMatchId(null);
      return;
    }

    setPredictions(result.predictions);
    setDraftWinnerByMatchId((current) => {
      const next = { ...current };
      delete next[matchId];
      return next;
    });
    setDraftScoreByMatchId((current) => {
      const next = { ...current };
      delete next[matchId];
      return next;
    });
    setMessage({ tone: "success", text: "Bracket updated." });
    setPendingMatchId(null);
  }
}

function BracketStageViewport({
  slide,
  mode,
  ready,
  pendingMatchId,
  onSelect,
  onAdjustScore,
  onSave,
  selectedCountryFilter,
  onSelectCountryFilter
}: {
  slide: BracketSlideView;
  mode: KnockoutBracketEditorView["mode"];
  ready: boolean;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
  selectedCountryFilter: string | null;
  onSelectCountryFilter: (teamId: string) => void;
}) {
  const filteredSlide = useMemo(() => {
    if (!selectedCountryFilter) {
      return slide;
    }

    return {
      ...slide,
      currentMatches: slide.currentMatches.filter((match) =>
        [match.homeTeam?.id, match.awayTeam?.id, match.seededHomeTeam?.id, match.seededAwayTeam?.id].includes(selectedCountryFilter)
      )
    };
  }, [selectedCountryFilter, slide]);
  const stageBanner = getStageBanner(filteredSlide, mode);

  if (selectedCountryFilter && filteredSlide.currentMatches.length === 0) {
    return (
      <section className="overflow-visible">
        <div className="border-b border-gray-200/80 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-3xl font-black leading-none text-gray-950 sm:text-4xl">{slide.title}</h3>
            </div>
            <div className="shrink-0 pt-1 text-right">
              <p className="text-sm font-black uppercase tracking-wide text-gray-950 sm:text-base">0 matches</p>
            </div>
          </div>
        </div>
        <div className="px-3 py-5 text-center text-sm font-semibold text-gray-600 sm:px-4">
          No matches in this round for {activeFilterTeamLabel(slide, selectedCountryFilter)}.
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-visible">
      <div className="border-b border-gray-200/80 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-3xl font-black leading-none text-gray-950 sm:text-4xl">{slide.title}</h3>
          </div>
          <div className="shrink-0 pt-1 text-right">
            <p className="text-sm font-black uppercase tracking-wide text-gray-950 sm:text-base">
              {filteredSlide.currentMatches.length} matches
            </p>
          </div>
        </div>
        <div
          className={`mt-4 rounded-md px-4 py-3 text-center text-sm font-bold uppercase tracking-wide sm:text-base ${
            stageBanner.tone === "wait"
              ? "bg-amber-50 text-gray-500"
              : stageBanner.tone === "final"
                ? "bg-gray-100 text-gray-400"
                : "bg-green-50 text-green-700"
          }`}
        >
          {stageBanner.text}
        </div>
      </div>

      <div
        className={`min-h-[30rem] px-2 py-2.5 transition-[opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:min-h-[32rem] sm:px-3 sm:py-3 ${
          ready ? "opacity-100" : "opacity-88"
        }`}
      >
        {slide.layout === "split" ? (
          <SplitRoundView
            slide={filteredSlide}
            pendingMatchId={pendingMatchId}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
            selectedCountryFilter={selectedCountryFilter}
            onSelectCountryFilter={onSelectCountryFilter}
          />
        ) : slide.layout === "finale" ? (
          <FinaleRoundView
            slide={filteredSlide}
            pendingMatchId={pendingMatchId}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
            selectedCountryFilter={selectedCountryFilter}
            onSelectCountryFilter={onSelectCountryFilter}
          />
        ) : (
          <FocusedRoundView
            slide={filteredSlide}
            pendingMatchId={pendingMatchId}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
            selectedCountryFilter={selectedCountryFilter}
            onSelectCountryFilter={onSelectCountryFilter}
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
  onAdjustScore,
  onSave,
  selectedCountryFilter,
  onSelectCountryFilter
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
  selectedCountryFilter: string | null;
  onSelectCountryFilter: (teamId: string) => void;
}) {
  const pods = groupMatchesIntoPods(slide.currentMatches);

  return (
    <div className="space-y-3">
      {pods.map((pod, index) => (
        <div
          key={`r32-pod-${index}`}
          className="rounded-xl bg-gray-50/40 px-1 py-1.5 sm:px-1.5 sm:py-2"
        >
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            {pod.map((match, podIndex) => (
              <CurrentRoundMatchCard
                key={match.matchId}
                match={match}
                isPending={pendingMatchId === match.matchId}
                onSelect={onSelect}
                onAdjustScore={onAdjustScore}
                onSave={onSave}
                density="compact"
                side={podIndex === 0 ? "left" : "right"}
                selectedCountryFilter={selectedCountryFilter}
                onSelectCountryFilter={onSelectCountryFilter}
              />
            ))}
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
  onAdjustScore,
  onSave,
  selectedCountryFilter,
  onSelectCountryFilter
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
  selectedCountryFilter: string | null;
  onSelectCountryFilter: (teamId: string) => void;
}) {
  const pods = groupMatchesIntoPods(slide.currentMatches);

  return (
    <div className="space-y-3">
      {pods.map((pod, index) => (
        <div
          key={`focus-pod-${index}`}
          className="rounded-xl bg-gray-50/40 px-1 py-1.5 sm:px-1.5 sm:py-2"
        >
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            {pod.map((match, podIndex) => (
              <CurrentRoundMatchCard
                key={match.matchId}
                match={match}
                isPending={pendingMatchId === match.matchId}
                onSelect={onSelect}
                onAdjustScore={onAdjustScore}
                onSave={onSave}
                density="expanded"
                side={podIndex === 0 ? "left" : "right"}
                selectedCountryFilter={selectedCountryFilter}
                onSelectCountryFilter={onSelectCountryFilter}
              />
            ))}
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
  onAdjustScore,
  onSave,
  selectedCountryFilter,
  onSelectCountryFilter
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
  selectedCountryFilter: string | null;
  onSelectCountryFilter: (teamId: string) => void;
}) {
  const finalMatch = slide.currentMatches[0] ?? null;

  return (
    <div className="space-y-3">
      <ChampionCard champion={slide.champion} />
      {finalMatch ? (
        <div className="rounded-xl bg-gray-50/40 px-1 py-1.5 sm:px-1.5 sm:py-2">
          <CurrentRoundMatchCard
            match={finalMatch}
            isPending={pendingMatchId === finalMatch.matchId}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
            density="hero"
            side="center"
            selectedCountryFilter={selectedCountryFilter}
            onSelectCountryFilter={onSelectCountryFilter}
          />
        </div>
      ) : null}
    </div>
  );
}

function CurrentRoundMatchCard({
  match,
  isPending,
  onSelect,
  onAdjustScore,
  onSave,
  density,
  side = "left",
  showHeader = true,
  selectedCountryFilter,
  onSelectCountryFilter
}: {
  match: KnockoutBracketMatchView;
  isPending: boolean;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
  density: "compact" | "expanded" | "hero";
  side?: "left" | "right" | "center";
  showHeader?: boolean;
  selectedCountryFilter?: string | null;
  onSelectCountryFilter?: (teamId: string) => void;
}) {
  const isCompact = density === "compact";
  const isHero = density === "hero";
  const isEmbeddedCenterCard = side === "center" && !showHeader;
  const matchNumber = getKnockoutMatchNumber(match.title);
  const hasOfficialTeams = Boolean(match.seededHomeTeam && match.seededAwayTeam);
  const shellState = getKnockoutMatchShellState(match);
  const currentHomeScore = match.predictedHomeScore;
  const currentAwayScore = match.predictedAwayScore;
  const savedHomeScore = match.savedHomeScore;
  const savedAwayScore = match.savedAwayScore;
  const effectiveCurrentHomeScore = currentHomeScore ?? 0;
  const effectiveCurrentAwayScore = currentAwayScore ?? 0;
  const effectiveSavedHomeScore = savedHomeScore ?? 0;
  const effectiveSavedAwayScore = savedAwayScore ?? 0;
  const homeCode = match.homeTeam ?? match.seededHomeTeam ? getTeamDisplayCode((match.homeTeam ?? match.seededHomeTeam)!) : "TBD";
  const awayCode = match.awayTeam ?? match.seededAwayTeam ? getTeamDisplayCode((match.awayTeam ?? match.seededAwayTeam)!) : "TBD";
  const hasActualFinalScores =
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined;
  const hasActualLiveScores = hasActualFinalScores && match.status !== "final";
  const hasSavedPredictedScores =
    match.savedHomeScore !== null &&
    match.savedHomeScore !== undefined &&
    match.savedAwayScore !== null &&
    match.savedAwayScore !== undefined;
  const isExactPredictedScore =
    hasActualFinalScores &&
    hasSavedPredictedScores &&
    match.savedHomeScore === match.homeScore &&
    match.savedAwayScore === match.awayScore;
  const showScorelineMissOverlay =
    match.status === "final" && hasActualFinalScores && hasSavedPredictedScores && !isExactPredictedScore;
  const hasUnsavedScoreChange =
    effectiveCurrentHomeScore !== effectiveSavedHomeScore || effectiveCurrentAwayScore !== effectiveSavedAwayScore;
  const hasUnsavedSelectionChange = match.predictedWinnerTeamId !== match.savedWinnerTeamId;
  const hasUnsavedPredictionChange = hasUnsavedScoreChange || hasUnsavedSelectionChange;
  const hasSavedSelection = Boolean(match.savedAt);
  const requiresWinnerSelection = shellState === "open" && effectiveCurrentHomeScore === effectiveCurrentAwayScore;
  const showSaveButton = shellState === "open" && hasUnsavedPredictionChange;
  const hasUserPrediction = Boolean(match.savedAt || hasUnsavedPredictionChange);
  const finalStatusMessage = hasActualFinalScores
    ? hasUserPrediction
      ? match.isCorrectWinner == null
        ? "Scoring update pending."
        : null
      : "No pick saved."
    : null;
  const gradedPointsLabel =
    match.isCorrectWinner == null
      ? null
      : match.isCorrectWinner === true
        ? match.awardedPoints == null
          ? "Winner correct · Points updating"
          : match.exactScorePoints && match.exactScorePoints > 0
            ? `Exact score · +${match.awardedPoints} pts`
            : match.awardedPoints > 0
              ? `Winner correct · +${match.awardedPoints} pts`
              : "Winner correct · 0 pts"
        : match.awardedPoints == null
          ? "Scoring update pending."
          : match.awardedPoints > 0
            ? `+${match.awardedPoints} pts`
            : "No points earned · 0 pts";
  const statusBadge =
    shellState === "final" ? (
      <span className="shrink-0 rounded-md bg-gray-200 px-2 py-1 text-[10px] font-black text-gray-700">Final</span>
    ) : shellState === "wait" && match.viewMode === "projected" ? (
      <ProjectedMatchStatusChip
        hasOfficialTeams={hasOfficialTeams}
      />
    ) : shellState === "closed" ? (
      <span className="shrink-0 rounded-md bg-gray-950 px-2 py-1 text-[10px] font-black text-white">Locked</span>
    ) : shellState === "open" ? (
      <span className="shrink-0 rounded-md bg-green-50 px-2 py-1 text-[10px] font-black text-green-700">Open</span>
    ) : (
      <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">Wait</span>
    );
  const isReadOnly = shellState === "closed" || shellState === "final" || shellState === "wait";
  const selectedCountryGroupName = activeCountryGroupName(selectedCountryFilter ?? null, match);

  return (
    <div
      className={
        isEmbeddedCenterCard
          ? `${isHero ? "p-1" : "p-0.5"}`
          : `w-full rounded-lg border ${
              shellState === "final"
                ? "border-gray-200 bg-gray-100 p-2"
                : isHero
                  ? "border-amber-200 bg-white p-2"
                  : isCompact
                    ? "border-gray-200 bg-white p-2"
                    : "border-gray-200 bg-white p-2"
            }`
      }
    >
      {showHeader ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <div>
            {matchNumber ? (
              <KnockoutMatchNumberBadge number={matchNumber} compact={isCompact} />
            ) : (
              <p className={`${isCompact ? "text-xs" : "text-sm"} font-black text-gray-950`}>{match.title}</p>
            )}
          </div>
          <p className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {shellState === "open" ? `Pick before: ${formatCompactKickoff(match.kickoffTime)}` : formatCompactKickoff(match.kickoffTime)}
          </p>
          <div className="justify-self-end">{statusBadge}</div>
        </div>
      ) : null}

      <div className={`${showHeader ? "mt-1.5" : ""} relative px-1 py-1`}>
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1/2 top-1 -translate-x-1/2 border-l border-gray-200"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
          <KnockoutTeamPanel
            team={match.homeTeam}
            officialTeam={match.seededHomeTeam}
            placeholderLabel={match.homeSourceLabel}
            projectionSource={match.homeResolutionSource}
            viewMode={match.viewMode}
            status={match.status}
            officialScore={match.homeScore}
            isSelected={Boolean(match.homeTeam?.id && match.predictedWinnerTeamId === match.homeTeam.id)}
            isCorrectSelection={match.status === "final" && match.homeTeam?.id === match.predictedWinnerTeamId ? match.isCorrectWinner : null}
            isDisabled={!match.homeTeam || !match.canSelectWinner || isPending}
            onClick={() => {
              if (match.homeTeam?.id) {
                void onSelect(match.matchId, match.homeTeam.id);
              }
            }}
            density={density}
            side="left"
            isReadOnly={isReadOnly}
            canSelectByTap={requiresWinnerSelection}
            predictedScore={currentHomeScore}
            showScorelineMiss={showScorelineMissOverlay}
            onIncrement={() => onAdjustScore(match.matchId, "home", 1)}
            onDecrement={() => onAdjustScore(match.matchId, "home", -1)}
            selectedCountryFilter={selectedCountryFilter ?? null}
            filterGroupName={selectedCountryGroupName}
            onSelectCountryFilter={onSelectCountryFilter}
          />
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[8px] font-black uppercase ${
              match.status === "final"
                ? "border-gray-300 bg-white text-gray-500"
                : shellState === "closed"
                  ? "border-gray-300 bg-white text-gray-500"
                  : "border-gray-200 bg-white text-gray-400"
            }`}
          >
            VS
          </span>
          <KnockoutTeamPanel
            team={match.awayTeam}
            officialTeam={match.seededAwayTeam}
            placeholderLabel={match.awaySourceLabel}
            projectionSource={match.awayResolutionSource}
            viewMode={match.viewMode}
            status={match.status}
            officialScore={match.awayScore}
            isSelected={Boolean(match.awayTeam?.id && match.predictedWinnerTeamId === match.awayTeam.id)}
            isCorrectSelection={match.status === "final" && match.awayTeam?.id === match.predictedWinnerTeamId ? match.isCorrectWinner : null}
            isDisabled={!match.awayTeam || !match.canSelectWinner || isPending}
            onClick={() => {
              if (match.awayTeam?.id) {
                void onSelect(match.matchId, match.awayTeam.id);
              }
            }}
            density={density}
            side="right"
            isReadOnly={isReadOnly}
            canSelectByTap={requiresWinnerSelection}
            predictedScore={currentAwayScore}
            showScorelineMiss={showScorelineMissOverlay}
            onIncrement={() => onAdjustScore(match.matchId, "away", 1)}
            onDecrement={() => onAdjustScore(match.matchId, "away", -1)}
            selectedCountryFilter={selectedCountryFilter ?? null}
            filterGroupName={selectedCountryGroupName}
            onSelectCountryFilter={onSelectCountryFilter}
          />
        </div>
      </div>

      {match.status === "final" ? (
        <div className="mt-1.5 border-t border-gray-300 px-1 pt-2 text-center">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div className="flex min-w-0 items-center justify-start gap-2">
              <span className="text-sm font-black leading-none tabular-nums text-gray-800">
                {hasActualFinalScores ? match.homeScore : "—"}
              </span>
              <span className="text-sm font-black uppercase leading-none text-gray-500">
                {homeCode}
              </span>
            </div>
            <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {hasActualFinalScores ? "<- Final Scores ->" : "Final Scores: Awaiting score"}
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span className="text-sm font-black uppercase leading-none text-gray-500">
                {awayCode}
              </span>
              <span className="text-sm font-black leading-none tabular-nums text-gray-800">
                {hasActualFinalScores ? match.awayScore : "—"}
              </span>
            </div>
          </div>
          {match.isCorrectWinner != null ? (
            <div className="mt-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
              {match.isCorrectWinner === true ? (
                <Check aria-hidden className="h-4 w-4 text-accent-dark" />
              ) : (
                <X aria-hidden className="h-4 w-4 text-rose-600" />
              )}
              <span>{gradedPointsLabel}</span>
            </div>
          ) : null}
          {finalStatusMessage ? (
            <div className="mt-1 flex items-center justify-center gap-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
              {finalStatusMessage === "No pick saved." ? (
                <>
                  <X aria-hidden className="h-4 w-4 text-rose-600" />
                  <span>No pick saved.</span>
                  <span className="text-gray-500">No points</span>
                </>
              ) : (
                <span>{finalStatusMessage}</span>
              )}
            </div>
          ) : null}
        </div>
      ) : match.viewMode === "official" ? shellState === "closed" ? (
        <div className="mt-1.5 border-t border-gray-300 px-1 pt-2 text-center">
          {hasActualLiveScores ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <div className="flex min-w-0 items-center justify-start gap-2">
                <span className="text-sm font-black leading-none tabular-nums text-orange-500">
                  {match.homeScore}
                </span>
                <span className="text-sm font-black uppercase leading-none text-gray-500">
                  {homeCode}
                </span>
              </div>
              <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {"<- Live Score ->"}
              </div>
              <div className="flex min-w-0 items-center justify-end gap-2">
                <span className="text-sm font-black uppercase leading-none text-gray-500">
                  {awayCode}
                </span>
                <span className="text-sm font-black leading-none tabular-nums text-orange-500">
                  {match.awayScore}
                </span>
              </div>
            </div>
          ) : null}
          <div className={`${hasActualLiveScores ? "mt-1" : ""} text-center text-[10px] font-bold uppercase tracking-wide text-gray-500`}>
            {hasSavedSelection
              ? `MATCH IN PLAY - Saved on: ${formatSavedTimestamp(match.savedAt)}`
              : hasOfficialTeams
                ? "MATCH IN PLAY - Scores will show here when final"
                : "Teams not set yet"}
          </div>
        </div>
      ) : showSaveButton ? (
        <>
          {requiresWinnerSelection && !match.predictedWinnerTeamId ? (
            <div className="mt-1.5 border-t border-gray-100 px-1 pt-2 text-center text-xs font-bold uppercase tracking-wide text-accent-dark">
              Tap for winner
            </div>
          ) : null}
          <button
            type="button"
            disabled={isPending}
            onClick={() => void onSave(match.matchId)}
            className="mt-1.5 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : `Save Match ${matchNumber ?? ""}`.trim()}
          </button>
        </>
      ) : hasSavedSelection ? (
        <div className="mt-1.5 border-t border-gray-100 px-1 pt-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
          Saved on: {formatSavedTimestamp(match.savedAt)}
        </div>
      ) : shellState === "open" ? (
        <div className="mt-1.5 border-t border-gray-100 bg-green-50/50 px-1 pt-2 text-center text-xs font-bold uppercase tracking-wide text-green-700">
          Editable until kickoff
        </div>
      ) : (
        <div className="mt-1.5 border-t border-gray-300 px-1 pt-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {hasOfficialTeams ? "MATCH IN PLAY - Scores will show here when final" : "Teams not set yet"}
        </div>
      ) : (
        <div className="mt-1.5 border-t border-gray-100 px-1 pt-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400">
          <span className="block">Teams not set yet</span>
          <span className="mt-0.5 block text-[10px] font-semibold normal-case tracking-normal text-gray-400">
            This matchup will unlock once the earlier winners are known.
          </span>
        </div>
      )}
    </div>
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

function getStageBanner(
  slide: BracketSlideView,
  mode: KnockoutBracketEditorView["mode"]
): { tone: "wait" | "open" | "final"; text: string } {
  if (slide.currentStage === "r32") {
    return getRoundOf32Banner(slide);
  }

  const hasMatches = slide.currentMatches.length > 0;
  const allFinal = hasMatches && slide.currentMatches.every((match) => match.status === "final");
  const anyOpen = slide.currentMatches.some((match) => getKnockoutMatchShellState(match) === "open");

  if (allFinal) {
    return {
      tone: "final",
      text: `${slide.title.toUpperCase()} IS FINAL`
    };
  }

  if (mode === "projected" || !anyOpen) {
    return {
      tone: "wait",
      text: "MATCHES UNLOCK WHEN GROUP PHASE IS COMPLETED"
    };
  }

  return {
    tone: "open",
    text: "PREDICTIONS ARE EDITABLE UNTIL KICKOFF"
  };
}

function getRoundOf32Banner(slide: BracketSlideView): { tone: "wait" | "open" | "final"; text: string } {
  const hasMatches = slide.currentMatches.length > 0;
  const allFinal = hasMatches && slide.currentMatches.every((match) => match.status === "final");
  const anyOpen = slide.currentMatches.some((match) => getKnockoutMatchShellState(match) === "open");
  const hasOfficialTeams = slide.currentMatches.some(
    (match) => Boolean(match.seededHomeTeam && match.seededAwayTeam)
  );

  if (allFinal) {
    return {
      tone: "final",
      text: "ROUND OF 32 IS FINAL"
    };
  }

  if (!hasOfficialTeams) {
    return {
      tone: "wait",
      text: "MATCHES UNLOCK WHEN GROUP PHASE IS COMPLETED"
    };
  }

  if (anyOpen) {
    return {
      tone: "open",
      text: "PREDICTIONS ARE EDITABLE UNTIL KICKOFF"
    };
  }

  return {
    tone: "wait",
    text: "ROUND OF 32 IS CLOSED"
  };
}

function groupMatchesIntoPods(matches: KnockoutBracketMatchView[]) {
  const pods: KnockoutBracketMatchView[][] = [];

  for (let index = 0; index < matches.length; index += 2) {
    pods.push(matches.slice(index, index + 2));
  }

  return pods;
}

function getKnockoutMatchShellState(
  match: Pick<
    KnockoutBracketMatchView,
    "status" | "canSelectWinner" | "seededHomeTeam" | "seededAwayTeam" | "viewMode"
  >
) {
  const hasOfficialTeams = Boolean(match.seededHomeTeam && match.seededAwayTeam);

  if (match.status === "final") {
    return "final" as const;
  }

  if (match.status === "live" || match.status === "locked") {
    return "closed" as const;
  }

  if (match.viewMode === "projected" && !hasOfficialTeams) {
    return "wait" as const;
  }

  if (match.canSelectWinner) {
    return "open" as const;
  }

  if (hasOfficialTeams) {
    return "closed" as const;
  }

  return "wait" as const;
}

function matchScoreDisplay({
  predictedScore
}: {
  predictedScore: number | null;
}) {
  return predictedScore === null || predictedScore === undefined ? "" : String(predictedScore);
}

function ChevronUpSmall() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path d="M3.5 10.5L8 6l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownSmall() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <path d="M3.5 5.5L8 10l4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KnockoutTeamPanel({
  team,
  officialTeam,
  placeholderLabel,
  projectionSource,
  viewMode,
  status,
  officialScore,
  isSelected,
  isCorrectSelection,
  isDisabled,
  onClick,
  density,
  side,
  isReadOnly,
  canSelectByTap,
  predictedScore,
  showScorelineMiss,
  onIncrement,
  onDecrement,
  selectedCountryFilter,
  filterGroupName,
  onSelectCountryFilter
}: {
  team: BracketTeamOption | null;
  officialTeam: BracketTeamOption | null;
  placeholderLabel: string | null;
  projectionSource: KnockoutBracketMatchView["homeResolutionSource"];
  viewMode: KnockoutBracketMatchView["viewMode"];
  status: KnockoutBracketMatchView["status"];
  officialScore: number | null;
  isSelected: boolean;
  isCorrectSelection: boolean | null;
  isDisabled: boolean;
  onClick: () => void;
  density: "compact" | "expanded" | "hero";
  side: "left" | "right";
  isReadOnly: boolean;
  canSelectByTap: boolean;
  predictedScore: number | null;
  showScorelineMiss: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  selectedCountryFilter: string | null;
  filterGroupName: string | null;
  onSelectCountryFilter?: (teamId: string) => void;
}) {
  const isCompact = density === "compact";
  const userTeam = team;
  const isProjectedReadOnly = viewMode === "projected";
  const layers = getKnockoutCardLayers({
    competitorSide: side,
    userTeam,
    officialTeam,
    placeholderLabel,
    projectionSource,
    viewMode,
    status,
    officialScore,
    isSelected,
    isCorrectSelection
  });
  const userLayer = layers.userLayer;
  const displayLabel = isProjectedReadOnly
    ? officialTeam?.name ?? team?.name ?? formatRoundOf32PlaceholderLabel(placeholderLabel)
    : team?.name ?? officialTeam?.name ?? formatRoundOf32PlaceholderLabel(placeholderLabel);
  const displayFlag = team?.flagEmoji ?? officialTeam?.flagEmoji ?? null;
  const displayTeam = team ?? officialTeam ?? null;
  const displayCode = displayTeam ? getTeamDisplayCode(displayTeam) : null;
  const scoreValue = matchScoreDisplay({ predictedScore });
  const ariaTeamName = officialTeam?.name ?? userTeam?.name ?? placeholderLabel ?? "this team";
  const ariaLabel = isProjectedReadOnly
    ? `Projected knockout preview for ${ariaTeamName}.`
    : isReadOnly || isDisabled
      ? `${ariaTeamName} is locked for this matchup.`
      : canSelectByTap
        ? `Tap ${ariaTeamName} to choose who advances.`
        : `${ariaTeamName} score controls are editable.`;

  const content = (
    <span
      className={`flex min-w-0 flex-col items-center rounded-lg px-1 py-0.5 ${
        canSelectByTap && isSelected ? "bg-accent-light/40 text-accent-dark" : ""
      } ${isCompact ? "min-h-[86px]" : "min-h-[92px]"}`}
    >
      <span className="flex min-w-0 justify-center">
        <span className="flex items-center justify-center gap-2">
          {side === "left" ? renderWinnerSlot() : null}
          {side === "left" ? renderStepper() : null}
          <span
            onClick={(event) => {
              if (canSelectByTap) {
                event.stopPropagation();
              }
            }}
            className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-white font-black ${
              isSelected ? "border-accent text-accent-dark" : "border-gray-300 text-gray-400"
            } ${isCompact ? "h-10 w-9 text-2xl" : "h-10 w-10 text-2xl"}`}
          >
            {showScorelineMiss ? (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[1px] w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-rose-300/55"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[1px] w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-rose-300/35"
                />
              </>
            ) : null}
            {scoreValue}
          </span>
          {side === "right" ? renderStepper() : null}
          {side === "right" ? renderWinnerSlot() : null}
        </span>
      </span>
        <span className="mt-0.5 block w-full px-1">
          <span className="flex items-center justify-center gap-1.5 text-center text-base font-black text-gray-950">
          {displayFlag && side === "right" ? (
            <span aria-hidden className="shrink-0 text-xl leading-none">
              {displayFlag}
            </span>
          ) : null}
            <span className="min-w-0 truncate">{displayLabel}</span>
            {displayFlag && side === "left" ? (
              <span aria-hidden className="shrink-0 text-xl leading-none">
                {displayFlag}
              </span>
            ) : null}
          </span>
          {displayCode && displayTeam ? (
            <KnockoutCountryChip
              teamId={displayTeam.id}
              countryCode={displayCode}
              teamName={displayTeam.name}
              teamGroupName={displayTeam.groupName ?? null}
              activeCountryId={selectedCountryFilter}
              selectedCountryGroupName={filterGroupName}
              onSelectCountry={onSelectCountryFilter}
            />
          ) : null}
          {userLayer.helperText ? (
            <span className="mt-px block text-center text-[10px] font-semibold text-gray-500">
              {userLayer.helperText}
            </span>
        ) : null}
      </span>
    </span>
  );

  if (isReadOnly || isDisabled) {
    return (
      <div
        aria-label={ariaLabel}
        className={`min-w-0 cursor-default ${isSelected ? "text-accent-dark" : "text-gray-700"}`}
      >
        {content}
      </div>
    );
  }

  if (!canSelectByTap) {
    return <div aria-label={ariaLabel} className={`min-w-0 ${isSelected ? "text-accent-dark" : "text-gray-700"}`}>{content}</div>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      aria-label={ariaLabel}
      className={`min-w-0 cursor-pointer transition ${
        isSelected
          ? isCorrectSelection === true
            ? "text-accent-dark"
            : isCorrectSelection === false
              ? "text-rose-800"
              : "text-accent-dark"
          : "hover:text-accent-dark"
      }`}
    >
      {content}
    </div>
  );

  function renderStepper() {
    if (status === "final" || isReadOnly) {
      return <span className="inline-flex h-10 w-7 shrink-0" aria-hidden />;
    }

    return (
      <span className="inline-flex shrink-0 flex-col items-center justify-center rounded-sm bg-gray-100 text-gray-500">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onIncrement();
          }}
          className="inline-flex h-5 w-7 items-center justify-center hover:text-accent-dark"
          aria-label={`Increase ${ariaTeamName} score`}
        >
          <ChevronUpSmall />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDecrement();
          }}
          className="inline-flex h-5 w-7 items-center justify-center border-t border-gray-200 hover:text-accent-dark"
          aria-label={`Decrease ${ariaTeamName} score`}
        >
          <ChevronDownSmall />
        </button>
      </span>
    );
  }

  function renderWinnerSlot() {
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-accent-dark">
        {isSelected ? (
          <Trophy aria-hidden className="h-5 w-5" />
        ) : canSelectByTap ? (
          <span aria-hidden className="h-4 w-4 rounded-full border border-accent/35" />
        ) : null}
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
  isCorrectSelection
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
}) {
  const isProjected = viewMode === "projected";
  const userDisplayCode = userTeam ? getTeamDisplayCode(userTeam) : "TBD";
  const officialPlaceholderCode = formatKnockoutPlaceholderCode(placeholderLabel);
  const officialDisplayName = officialTeam?.name ?? formatKnockoutPlaceholderText(officialPlaceholderCode);
  const unresolvedHelper =
    isProjected && projectionSource === "missing" ? "More group results or picks needed" : null;
  const projectedWinnerHelper =
    !isProjected && projectionSource === "prediction" && !officialTeam ? "Based on your projected winners" : null;

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
        helperText: projectedWinnerHelper,
        isSelected,
        isCorrect: isSelected ? isCorrectSelection : null
      };

  const realLayer = {
    displayName: officialDisplayName,
    label: officialTeam ? "Actual" : null,
    scoreText: status === "final" || status === "live" || status === "locked" ? (officialScore != null ? String(officialScore) : null) : null,
    helperText: !officialTeam && !isProjected ? (placeholderLabel ?? null) : null,
    placeholderBadge: officialTeam ? null : getKnockoutPlaceholderBadge(placeholderLabel)
  };

  return {
    competitorSide,
    userLayer,
    realLayer
  };
}

function activeFilterTeamLabel(slide: BracketSlideView, selectedCountryFilter: string) {
  const team =
    slide.currentMatches
      .flatMap((match) => [match.homeTeam, match.awayTeam, match.seededHomeTeam, match.seededAwayTeam])
      .find((candidate) => candidate?.id === selectedCountryFilter) ?? null;

  return team?.shortName ?? "that team";
}

function activeCountryGroupName(
  selectedCountryFilter: string | null,
  match: Pick<KnockoutBracketMatchView, "homeTeam" | "awayTeam" | "seededHomeTeam" | "seededAwayTeam">
) {
  if (!selectedCountryFilter) {
    return null;
  }

  const team = [match.homeTeam, match.awayTeam, match.seededHomeTeam, match.seededAwayTeam].find(
    (candidate) => candidate?.id === selectedCountryFilter
  );

  return team?.groupName ?? null;
}

function getTeamDisplayCode(team: BracketTeamOption) {
  const preferred = team.shortName?.trim() || team.name.trim().slice(0, 3);
  return preferred.toUpperCase();
}

function KnockoutCountryChip({
  teamId,
  countryCode,
  teamName,
  teamGroupName,
  activeCountryId,
  selectedCountryGroupName,
  onSelectCountry
}: {
  teamId: string;
  countryCode: string;
  teamName: string;
  teamGroupName: string | null;
  activeCountryId: string | null;
  selectedCountryGroupName: string | null;
  onSelectCountry?: (teamId: string) => void;
}) {
  const isActive = activeCountryId === teamId;
  const isGroupMate =
    Boolean(
      activeCountryId &&
        activeCountryId !== teamId &&
        selectedCountryGroupName &&
        teamGroupName &&
        selectedCountryGroupName === teamGroupName
    );

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectCountry?.(teamId);
      }}
      aria-label={`Filter knockout matches by ${teamName}`}
      className={`mt-0.5 inline-flex cursor-pointer items-center justify-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide transition ${
        isActive
          ? "border-emerald-800 ring-1 ring-emerald-800 text-emerald-900"
          : isGroupMate
            ? "border-gray-700 ring-1 ring-gray-700 text-gray-700"
            : "border-gray-300 text-gray-600 hover:border-accent hover:text-accent-dark"
      }`}
    >
      {countryCode}
    </button>
  );
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

function formatRoundOf32PlaceholderLabel(placeholderLabel: string | null) {
  if (!placeholderLabel) {
    return "Teams not set yet";
  }

  const normalized = placeholderLabel.replace(/\s+/g, " ").trim();
  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return `Group ${groupMatch[1].toUpperCase()}: ${groupMatch[2].toLowerCase() === "winner" ? "First Place" : "Second Place"}`;
  }

  const stageLabel = getPlaceholderStageLabel(normalized);
  const matchNumber = getPlaceholderMatchNumber(normalized);
  if (stageLabel && matchNumber) {
    return `${stageLabel}: Match ${matchNumber} - WIN`;
  }

  return normalized;
}

function getPlaceholderStageLabel(label: string) {
  if (/Round of 32/i.test(label) || /^Winner of R32/i.test(label)) {
    return "R32";
  }

  if (/Round of 16/i.test(label) || /^Winner of R16/i.test(label)) {
    return "R16";
  }

  if (/Quarter-?final/i.test(label) || /^Winner of QF/i.test(label)) {
    return "QF";
  }

  if (/Semi-?final/i.test(label) || /^Winner of SF/i.test(label)) {
    return "SF";
  }

  return null;
}

function getPlaceholderMatchNumber(label: string) {
  const directCodeMatch = label.match(/-(\d+)$/);
  if (directCodeMatch) {
    return String(Number(directCodeMatch[1]));
  }

  const genericNumberMatch = label.match(/(\d+)(?!.*\d)/);
  if (genericNumberMatch) {
    return String(Number(genericNumberMatch[1]));
  }

  return null;
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

function deriveEditorView(
  initialView: KnockoutBracketEditorView,
  predictions: BracketPrediction[],
  draftWinnerByMatchId: Record<string, string> = {},
  draftScoreByMatchId: Record<string, { homeScore: number; awayScore: number }> = {}
): KnockoutBracketEditorView {
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
      ? getAdvancedTeam(match.homeSourceMatchId, resolvedMatches, predictionByMatchId, initialView.mode)
      : isProjected
        ? match.homeTeam
        : match.seededHomeTeam;
    const awayTeam = match.awaySourceMatchId
      ? getAdvancedTeam(match.awaySourceMatchId, resolvedMatches, predictionByMatchId, initialView.mode)
      : isProjected
        ? match.awayTeam
        : match.seededAwayTeam;
    const predictedWinnerTeamId = predictionByMatchId.get(match.matchId)?.predictedWinnerTeamId ?? null;
    const savedHomeScore = predictionByMatchId.get(match.matchId)?.predictedHomeScore ?? null;
    const savedAwayScore = predictionByMatchId.get(match.matchId)?.predictedAwayScore ?? null;
    const savedWinnerTeamId =
      predictedWinnerTeamId && [homeTeam?.id, awayTeam?.id].includes(predictedWinnerTeamId)
        ? predictedWinnerTeamId
        : null;
    const draftWinnerTeamId = draftWinnerByMatchId[match.matchId] ?? null;
    const draftScores = draftScoreByMatchId[match.matchId] ?? null;
    const currentHomeScore =
      draftScores?.homeScore ?? savedHomeScore ?? (match.isLocked || match.status === "final" ? null : 0);
    const currentAwayScore =
      draftScores?.awayScore ?? savedAwayScore ?? (match.isLocked || match.status === "final" ? null : 0);
    const validPredictedWinnerTeamId = resolveCurrentWinnerTeamId({
      homeTeamId: homeTeam?.id ?? null,
      awayTeamId: awayTeam?.id ?? null,
      homeScore: currentHomeScore ?? 0,
      awayScore: currentAwayScore ?? 0,
      explicitWinnerTeamId: draftWinnerTeamId ?? (draftScores ? null : savedWinnerTeamId)
    });

    resolvedMatches.set(match.matchId, {
      ...match,
      homeTeam,
      awayTeam,
      predictedHomeScore: currentHomeScore,
      predictedAwayScore: currentAwayScore,
      savedHomeScore,
      savedAwayScore,
      predictedWinnerTeamId: validPredictedWinnerTeamId,
      savedWinnerTeamId,
      canSelectWinner: Boolean(homeTeam && awayTeam) && !match.isLocked
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

function resolveCurrentWinnerTeamId({
  homeTeamId,
  awayTeamId,
  homeScore,
  awayScore,
  explicitWinnerTeamId
}: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  explicitWinnerTeamId: string | null;
}) {
  if (homeTeamId && awayTeamId) {
    if (homeScore > awayScore) {
      return homeTeamId;
    }

    if (awayScore > homeScore) {
      return awayTeamId;
    }

    if (explicitWinnerTeamId && [homeTeamId, awayTeamId].includes(explicitWinnerTeamId)) {
      return explicitWinnerTeamId;
    }
  }

  return null;
}

function getAdvancedTeam(
  sourceMatchId: string,
  resolvedMatches: Map<string, KnockoutBracketMatchView>,
  predictionByMatchId: Map<string, BracketPrediction>,
  viewMode: KnockoutBracketEditorView["mode"]
) {
  const sourceMatch = resolvedMatches.get(sourceMatchId);
  if (!sourceMatch) {
    return null;
  }

  if (viewMode === "official" && sourceMatch.status === "final" && sourceMatch.actualWinnerTeamId) {
    if (sourceMatch.homeTeam?.id === sourceMatch.actualWinnerTeamId) {
      return sourceMatch.homeTeam;
    }

    if (sourceMatch.awayTeam?.id === sourceMatch.actualWinnerTeamId) {
      return sourceMatch.awayTeam;
    }

    if (sourceMatch.seededHomeTeam?.id === sourceMatch.actualWinnerTeamId) {
      return sourceMatch.seededHomeTeam;
    }

    if (sourceMatch.seededAwayTeam?.id === sourceMatch.actualWinnerTeamId) {
      return sourceMatch.seededAwayTeam;
    }

    return null;
  }

  const predictedWinnerTeamId = predictionByMatchId.get(sourceMatchId)?.predictedWinnerTeamId ?? null;
  if (!predictedWinnerTeamId) {
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

function formatCompactKickoff(kickoffTime: string) {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(kickoffTime));

  return formatted
    .replace(",", " ·")
    .replace(" AM", "A")
    .replace(" PM", "P");
}

function formatSavedTimestamp(savedAt: string | null) {
  return savedAt ? formatDateTimeWithZone(savedAt) : "";
}

function buildBracketSlides(view: KnockoutBracketEditorView): BracketSlideView[] {
  const stageMap = new Map(view.stages.map((stage) => [stage.stage, stage]));
  const r32 = stageMap.get("r32");
  const r16 = stageMap.get("r16");
  const qf = stageMap.get("qf");
  const sf = stageMap.get("sf");
  const thirdStage = stageMap.get("third");
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
      thirdPlaceMatch: null,
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
      thirdPlaceMatch: null,
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
      thirdPlaceMatch: null,
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
      thirdPlaceMatch: null,
      layout: "focus"
    },
    {
      id: "third",
      title: "Third Place",
      eyebrow: "One more podium spot",
      subtitle: "Set the bronze-medal match before the tournament closes.",
      currentStage: "third",
      currentMatches: thirdStage?.matches ?? (view.thirdPlace ? [view.thirdPlace] : []),
      previousStage: "sf",
      previousLabel: sf?.label ?? "Semi-finals",
      previousMatches: sf?.matches ?? [],
      nextStage: "final",
      nextLabel: final?.label ?? "Final",
      nextMatches: final?.matches ?? [],
      champion: null,
      thirdPlaceMatch: null,
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
      thirdPlaceMatch: null,
      layout: "finale"
    }
  ];

  return slides.filter((slide) => slide.currentMatches.length > 0);
}
