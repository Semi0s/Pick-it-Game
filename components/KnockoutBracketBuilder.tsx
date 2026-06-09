"use client";

import { Check, CheckSquare, Trophy, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
import { previewBracketPredictionImpactAction, saveBracketPredictionAction } from "@/app/knockout/actions";
import { WindowChoiceRail, useSessionJsonState } from "@/components/player-management/Shared";
import { useAppLanguage } from "@/lib/app-language";
import { showAppToast } from "@/lib/app-toast";
import { normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";
import { formatDateTime } from "@/lib/i18n-format";
import { shouldShowProjectedComparisonRound } from "@/lib/knockout-display";
import { t, type TranslationParams } from "@/lib/strings";
import {
  type BracketTeamOption,
  type KnockoutBracketEditorView,
  type KnockoutBracketMatchView
} from "@/lib/bracket-predictions";
import { useSessionViewState } from "@/lib/session-view-state";
import type { BracketPrediction } from "@/lib/types";

type KnockoutBracketBuilderProps = {
  initialView: KnockoutBracketEditorView;
  projectedComparisonView?: KnockoutBracketEditorView | null;
  userId?: string | null;
  language?: string | null;
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

const KNOCKOUT_COMPARE_VIEW_STATE_STORAGE_KEY = "knockout-compare-view-state";
const VISIBLE_KNOCKOUT_STAGE_IDS = new Set<KnockoutBracketMatchView["stage"]>(["r32"]);

type KnockoutViewState = {
  activeSlideIndex: number;
  selectedCountryFilter: string;
};

const DEFAULT_KNOCKOUT_VIEW_STATE: KnockoutViewState = {
  activeSlideIndex: 0,
  selectedCountryFilter: ""
};

function validateKnockoutViewState(value: unknown): KnockoutViewState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<KnockoutViewState>;
  return {
    activeSlideIndex:
      typeof candidate.activeSlideIndex === "number" && Number.isFinite(candidate.activeSlideIndex)
        ? Math.max(0, Math.floor(candidate.activeSlideIndex))
        : 0,
    selectedCountryFilter: typeof candidate.selectedCountryFilter === "string" ? candidate.selectedCountryFilter : ""
  };
}

const KnockoutLanguageContext = createContext<SupportedLanguage>("en");
const KnockoutLandingMatchContext = createContext<string | null>(null);

function useKnockoutLanguage() {
  return useContext(KnockoutLanguageContext);
}

function kt(language: SupportedLanguage, key: string, params?: TranslationParams) {
  return t(language, `knockout.${key}`, params);
}

export function KnockoutBracketBuilder({ initialView, projectedComparisonView = null, userId = null, language }: KnockoutBracketBuilderProps) {
  const { activeLanguage } = useAppLanguage();
  const uiLanguage = normalizeLanguage(activeLanguage ?? language);
  const searchParams = useSearchParams();
  const [baseView, setBaseView] = useState<KnockoutBracketEditorView>(initialView);
  const [predictions, setPredictions] = useState<BracketPrediction[]>(initialView.predictions);
  const [draftWinnerByMatchId, setDraftWinnerByMatchId] = useState<Record<string, string>>({});
  const [draftScoreByMatchId, setDraftScoreByMatchId] = useState<Record<string, { homeScore: number; awayScore: number }>>({});
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "tip"; text: string } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    affectedCount: number;
  } | null>(null);
  const [knockoutViewState, setKnockoutViewState] = useSessionViewState<KnockoutViewState>({
    key: "knockout",
    userId,
    defaultValue: DEFAULT_KNOCKOUT_VIEW_STATE,
    validate: validateKnockoutViewState
  });
  const activeSlideIndex = knockoutViewState.activeSlideIndex;
  const selectedCountryFilter = knockoutViewState.selectedCountryFilter;
  const setActiveSlideIndex = useCallback(
    (nextValue: SetStateAction<number>) => {
      setKnockoutViewState((current) => ({
        ...current,
        activeSlideIndex: typeof nextValue === "function" ? nextValue(current.activeSlideIndex) : nextValue
      }));
    },
    [setKnockoutViewState]
  );
  const setSelectedCountryFilter = useCallback(
    (nextValue: SetStateAction<string>) => {
      setKnockoutViewState((current) => ({
        ...current,
        selectedCountryFilter:
          typeof nextValue === "function" ? nextValue(current.selectedCountryFilter) : nextValue
      }));
    },
    [setKnockoutViewState]
  );
  const [transitionReady, setTransitionReady] = useState(true);
  const [landingMatchId, setLandingMatchId] = useState<string | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoFocusedProjectedSlideRef = useRef(false);
  const hasAppliedQueryFocusRef = useRef(false);

  const view = useMemo(
    () => deriveEditorView(baseView, predictions, draftWinnerByMatchId, draftScoreByMatchId),
    [baseView, draftScoreByMatchId, draftWinnerByMatchId, predictions]
  );
  const roundChoices = useMemo(() => buildBracketSlides(view, uiLanguage), [uiLanguage, view]);
  const slides = useMemo(
    () =>
      roundChoices.filter(
        (slide) => VISIBLE_KNOCKOUT_STAGE_IDS.has(slide.currentStage) && slide.currentMatches.length > 0
      ),
    [roundChoices]
  );
  const activeSlide = slides[activeSlideIndex] ?? null;
  const activeSlideProjectedComparisonMatches = useMemo(() => {
    if (!projectedComparisonView || activeSlide?.currentStage !== "r32") {
      return [];
    }

    return projectedComparisonView.stages.find((stage) => stage.stage === activeSlide.currentStage)?.matches ?? [];
  }, [activeSlide?.currentStage, projectedComparisonView]);
  const shouldShowR32ComparisonHint = activeSlide
    ? shouldShowProjectedComparisonRound({
        currentStage: activeSlide.currentStage,
        mode: baseView.mode,
        projectedComparisonMatchCount: activeSlideProjectedComparisonMatches.length
      })
    : false;
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
      if (landingHighlightTimerRef.current) {
        clearTimeout(landingHighlightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setActiveSlideIndex((current) => Math.max(0, Math.min(current, slides.length - 1)));
  }, [setActiveSlideIndex, slides.length]);

  useEffect(() => {
    if (baseView.mode !== "projected") {
      hasAutoFocusedProjectedSlideRef.current = false;
      return;
    }

    if (hasAutoFocusedProjectedSlideRef.current || slides.length === 0) {
      return;
    }

    hasAutoFocusedProjectedSlideRef.current = true;

    const firstOpenProjectedSlideIndex = slides.findIndex((slide) =>
      slide.currentMatches.some((match) => getKnockoutMatchShellState(match) === "open")
    );
    if (firstOpenProjectedSlideIndex < 0) {
      return;
    }

    const currentSlide = slides[activeSlideIndex] ?? null;
    const currentSlideHasOpenProjectedMatch = currentSlide
      ? currentSlide.currentMatches.some((match) => getKnockoutMatchShellState(match) === "open")
      : false;

    if (!currentSlideHasOpenProjectedMatch && activeSlideIndex !== firstOpenProjectedSlideIndex) {
      setActiveSlideIndex(firstOpenProjectedSlideIndex);
    }
  }, [activeSlideIndex, baseView.mode, setActiveSlideIndex, slides]);

  useEffect(() => {
    if (hasAppliedQueryFocusRef.current || slides.length === 0) {
      return;
    }

    const requestedStage = searchParams.get("stage");
    const requestedMatchId = searchParams.get("matchId");
    const requestedCompare = searchParams.get("compare");

    if (requestedCompare === "projected") {
      try {
        window.sessionStorage.setItem(
          KNOCKOUT_COMPARE_VIEW_STATE_STORAGE_KEY,
          JSON.stringify({ hasInteracted: true, lastBias: 0 })
        );
      } catch {}
    }

    if (!requestedStage && !requestedMatchId) {
      hasAppliedQueryFocusRef.current = true;
      return;
    }

    const requestedStageKey = requestedStage?.toLowerCase() ?? null;
    const nextIndex = slides.findIndex((slide) => {
      if (requestedStageKey && slide.currentStage !== requestedStageKey) {
        return false;
      }
      return requestedMatchId ? slide.currentMatches.some((match) => match.matchId === requestedMatchId) : true;
    });

    if (nextIndex >= 0 && nextIndex !== activeSlideIndex) {
      setActiveSlideIndex(nextIndex);
    }

    hasAppliedQueryFocusRef.current = true;
  }, [activeSlideIndex, searchParams, setActiveSlideIndex, slides]);

  useEffect(() => {
    const requestedMatchId = searchParams.get("matchId");
    if (!requestedMatchId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-knockout-match-id="${requestedMatchId}"]`);
      if (target) {
        const rect = target.getBoundingClientRect();
        const nextTop = Math.max(0, window.scrollY + rect.top - (window.innerHeight - rect.height) / 2);
        window.scrollTo({ top: nextTop, behavior: "smooth" });
      }
      setLandingMatchId(requestedMatchId);
      if (landingHighlightTimerRef.current) {
        clearTimeout(landingHighlightTimerRef.current);
      }
      landingHighlightTimerRef.current = setTimeout(() => {
        setLandingMatchId((current) => (current === requestedMatchId ? null : current));
      }, 1800);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSlideIndex, searchParams]);

  if (baseView.mode === "official" && !baseView.isSeeded) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{kt(uiLanguage, "title")}</p>
        <h2 className="mt-2 text-2xl font-black leading-tight">{kt(uiLanguage, "empty")}</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          {kt(uiLanguage, "officialPendingDescription")}
        </p>
      </section>
    );
  }

  return (
    <KnockoutLanguageContext.Provider value={uiLanguage}>
    <KnockoutLandingMatchContext.Provider value={landingMatchId}>
    <section className="space-y-3">
      <div
        className="compact-landscape-sticky-rail sticky z-[14] w-full !overflow-visible rounded-lg !rounded-t-none bg-white px-3 py-1.5 shadow-[0_12px_22px_-18px_rgba(15,23,42,0.45)] sm:border sm:border-gray-200 sm:px-4"
        style={{ top: "calc(var(--app-header-sticky-offset, var(--app-header-height, 72px)) + var(--app-sticky-rail-gap, 1.5rem))" }}
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
          {roundChoices.map((slide) => {
            const enabledIndex = slides.findIndex((enabledSlide) => enabledSlide.id === slide.id);
            const isEnabled = enabledIndex >= 0;
            const isActive = slide.id === slides[activeSlideIndex]?.id;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => {
                  if (isEnabled) {
                    goToSlide(enabledIndex);
                  }
                }}
                disabled={!isEnabled}
                data-choice-key={isEnabled ? slide.id : undefined}
                data-choice-active={isActive ? "true" : "false"}
                className={`ui-cockpit-button transition ${
                  isActive
                    ? "bg-accent text-accent-text"
                    : isEnabled
                      ? "border border-gray-300 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
                      : "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400 opacity-85"
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
              {kt(uiLanguage, "filteringForTeam", { teamName: activeFilterTeam?.shortName ?? kt(uiLanguage, "thisTeam") })}
            </p>
            <button
              type="button"
              onClick={() => setSelectedCountryFilter("")}
              className="ui-chip-sm border border-gray-300 bg-white font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
            >
              {kt(uiLanguage, "allTeams")}
            </button>
          </div>
        ) : null}
        {shouldShowR32ComparisonHint ? (
          <div className="mt-1.5 flex items-center justify-center gap-3 px-1 sm:hidden">
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-gray-500 shadow-sm">
              <span aria-hidden>‹</span>
              <span>{kt(uiLanguage, "myPick")}</span>
              <span className="text-gray-300">|</span>
              <span>{kt(uiLanguage, "qualifyingTeams")}</span>
              <span aria-hidden>›</span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="w-full max-w-full overflow-x-clip overflow-y-visible px-2 drop-shadow-[0_8px_20px_rgba(15,23,42,0.06)] sm:px-3">
        <div className="select-none">
          <BracketStageViewport
            slide={slides[activeSlideIndex]}
            mode={baseView.mode}
            projectedComparisonView={projectedComparisonView}
            forcedProjectedBias={searchParams.get("compare") === "projected" ? 0 : null}
            ready={transitionReady}
            pendingMatchId={pendingMatchId}
            pendingConfirmation={pendingConfirmation}
            onSelect={handleSelectWinner}
            onAdjustScore={handleAdjustScore}
            onSave={handleSaveWinner}
            selectedCountryFilter={selectedCountryFilter || null}
          />
        </div>
      </div>
    </section>
    </KnockoutLandingMatchContext.Provider>
    </KnockoutLanguageContext.Provider>
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

  function handleSelectWinner(matchId: string, teamId: string) {
    if (pendingConfirmation?.matchId === matchId) {
      setPendingConfirmation(null);
    }
    setDraftWinnerByMatchId((current) => ({
      ...current,
      [matchId]: teamId
    }));
  }

  function handleAdjustScore(matchId: string, side: "home" | "away", delta: 1 | -1) {
    if (pendingConfirmation?.matchId === matchId) {
      setPendingConfirmation(null);
    }
    let shouldClearExplicitWinner = false;
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
      const wasTie = currentHomeScore === currentAwayScore;
      const isTie = nextScore.homeScore === nextScore.awayScore;
      shouldClearExplicitWinner = wasTie !== isTie || !isTie;

      return {
        ...current,
        [matchId]: nextScore
      };
    });
    if (shouldClearExplicitWinner) {
      setDraftWinnerByMatchId((current) => {
        if (!(matchId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[matchId];
        return next;
      });
    }
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
      setMessage({ tone: "error", text: kt(uiLanguage, "selectWinnerForTiedPredictions") });
      return;
    }

    if (pendingConfirmation?.matchId === matchId) {
      await performSave({
        matchId,
        homeScore,
        awayScore,
        teamId: teamId ?? null,
        confirmClearDownstream: true
      });
      return;
    }

    const previewResult = await previewBracketPredictionImpactAction({
      matchId,
      teamId,
      homeScore,
      awayScore,
      mode: baseView.mode,
      language: uiLanguage
    });
    if (!previewResult.ok) {
      setMessage({ tone: "error", text: previewResult.message });
      return;
    }

    if (previewResult.affectedCount > 0) {
      setPendingConfirmation({
        matchId,
        homeScore,
        awayScore,
        teamId: teamId ?? null,
        affectedCount: previewResult.affectedCount
      });
      setMessage({
        tone: "tip",
        text: kt(uiLanguage, "clearFuturePicksNotice", { count: previewResult.affectedCount })
      });
      return;
    }

    await performSave({ matchId, homeScore, awayScore, teamId: teamId ?? null, confirmClearDownstream: false });
  }

  async function performSave(input: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    confirmClearDownstream: boolean;
  }) {
    setPendingMatchId(input.matchId);
    setMessage(null);

    const result = await saveBracketPredictionAction({
      matchId: input.matchId,
      teamId: input.teamId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      mode: baseView.mode,
      confirmClearDownstream: input.confirmClearDownstream,
      language: uiLanguage
    });
    if (!result.ok) {
      if ("requiresConfirmation" in result && result.requiresConfirmation) {
        setPendingConfirmation({
          matchId: input.matchId,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          teamId: input.teamId,
          affectedCount: result.affectedCount
        });
        setMessage({
          tone: "tip",
          text: kt(uiLanguage, "clearFuturePicksNotice", { count: result.affectedCount })
        });
      } else {
        setMessage({ tone: "error", text: result.message });
      }
      setPendingMatchId(null);
      return;
    }

    setPendingConfirmation(null);
    if (result.view) {
      setBaseView(result.view);
    }
    setPredictions(result.view?.predictions ?? result.predictions);
    const matchesForDescendants = result.view ?? view;
    const descendantMatchIds = collectDescendantMatchIdsFromView(matchesForDescendants, input.matchId);
    setDraftWinnerByMatchId((current) => {
      const next = { ...current };
      delete next[input.matchId];
      for (const descendantMatchId of descendantMatchIds) {
        delete next[descendantMatchId];
      }
      return next;
    });
    setDraftScoreByMatchId((current) => {
      const next = { ...current };
      delete next[input.matchId];
      for (const descendantMatchId of descendantMatchIds) {
        delete next[descendantMatchId];
      }
      return next;
    });
    setMessage({
      tone: "success",
      text:
        result.clearedDescendantCount > 0
          ? kt(uiLanguage, "predictionUpdatedCleared")
          : baseView.mode === "projected"
            ? kt(uiLanguage, "predictionSaved")
            : kt(uiLanguage, "predictionSaved")
    });
    setPendingMatchId(null);
  }
}

function BracketStageViewport({
  slide,
  mode,
  projectedComparisonView,
  forcedProjectedBias,
  ready,
  pendingMatchId,
  pendingConfirmation,
  onSelect,
  onAdjustScore,
  onSave,
  selectedCountryFilter
}: {
  slide: BracketSlideView;
  mode: KnockoutBracketEditorView["mode"];
  projectedComparisonView: KnockoutBracketEditorView | null;
  forcedProjectedBias: number | null;
  ready: boolean;
  pendingMatchId: string | null;
  pendingConfirmation: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    affectedCount: number;
  } | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
  selectedCountryFilter: string | null;
}) {
  const language = useKnockoutLanguage();
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
  const projectedMatchesForStage = useMemo(() => {
    if (!projectedComparisonView || slide.currentStage !== "r32") {
      return [];
    }

    const projectedStage = projectedComparisonView.stages.find((stage) => stage.stage === slide.currentStage);
    const stageMatches = projectedStage?.matches ?? [];
    if (!selectedCountryFilter) {
      return stageMatches;
    }

    return stageMatches.filter((match) =>
      [match.homeTeam?.id, match.awayTeam?.id, match.seededHomeTeam?.id, match.seededAwayTeam?.id].includes(selectedCountryFilter)
    );
  }, [projectedComparisonView, selectedCountryFilter, slide.currentStage]);
  const usesComparisonView = shouldShowProjectedComparisonRound({
    currentStage: slide.currentStage,
    mode,
    projectedComparisonMatchCount: projectedMatchesForStage.length
  });
  const standardCardSlide = useMemo(() => {
    if (mode !== "projected" || slide.currentStage === "r32") {
      return filteredSlide;
    }

    return {
      ...filteredSlide,
      currentMatches: filteredSlide.currentMatches.map((match) => ({
        ...match,
        viewMode: "official" as const
      }))
    };
  }, [filteredSlide, mode, slide.currentStage]);

  if (selectedCountryFilter && filteredSlide.currentMatches.length === 0) {
    return (
      <section className="w-full max-w-full overflow-x-clip overflow-y-visible">
        <div className="border-b border-gray-200/80 px-2.5 py-3 sm:px-0 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-3xl font-extrabold leading-none text-gray-950 sm:text-4xl">{slide.title}</h3>
            </div>
            <div className="shrink-0 pt-1 text-right">
              <p className="text-sm font-bold uppercase tracking-wide text-gray-950 sm:text-base">
                {kt(language, "matchesCount", { count: 0 })}
              </p>
            </div>
          </div>
        </div>
        <div className="px-0 py-5 text-center text-sm font-semibold text-gray-600">
          {kt(language, "noMatchesForTeam", { teamName: activeFilterTeamLabel(slide, selectedCountryFilter, language) })}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-full overflow-x-clip overflow-y-visible">
      {!usesComparisonView ? (
        <div className="border-b border-gray-200/80 px-2.5 py-3 sm:px-0 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-3xl font-extrabold leading-none text-gray-950 sm:text-4xl">{slide.title}</h3>
            </div>
            <div className="shrink-0 pt-1 text-right">
              <p className="text-sm font-bold uppercase tracking-wide text-gray-950 sm:text-base">
                {kt(language, "matchesCount", { count: filteredSlide.currentMatches.length })}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`mx-auto min-h-[30rem] w-full max-w-full overflow-x-clip px-0 py-2.5 transition-[opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] sm:min-h-[32rem] sm:px-4 sm:py-3 ${
          ready ? "opacity-100" : "opacity-88"
        }`}
      >
        {usesComparisonView ? (
          <ProjectedAndOfficialRoundView
            projectedMatches={mode === "projected" ? filteredSlide.currentMatches : projectedMatchesForStage}
            officialMatches={filteredSlide.currentMatches}
            officialState={mode === "projected" ? "pending" : "live"}
            isOfficialRound={mode !== "projected"}
            forcedProjectedBias={forcedProjectedBias}
            pendingMatchId={pendingMatchId}
            pendingConfirmation={pendingConfirmation}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
          />
        ) : slide.layout === "split" ? (
          <SplitRoundView
            slide={standardCardSlide}
            pendingMatchId={pendingMatchId}
            pendingConfirmation={pendingConfirmation}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
          />
        ) : slide.layout === "finale" ? (
          <FinaleRoundView
            slide={standardCardSlide}
            pendingMatchId={pendingMatchId}
            pendingConfirmation={pendingConfirmation}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
          />
        ) : (
          <FocusedRoundView
            slide={standardCardSlide}
            pendingMatchId={pendingMatchId}
            pendingConfirmation={pendingConfirmation}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
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
  const language = useKnockoutLanguage();

  return (
    <WindowChoiceRail
      motionMode="anchored"
      allowAnchoredTouchScroll
      className={className}
      showControls={showControls}
      prevLabel={kt(language, "showPreviousPhase")}
      nextLabel={kt(language, "showNextPhase")}
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
  pendingConfirmation,
  onSelect,
  onAdjustScore,
  onSave
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  pendingConfirmation: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    affectedCount: number;
  } | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
}) {
  const pods = groupMatchesIntoPods(slide.currentMatches);

  return (
    <div className="space-y-3">
      {pods.map((pod, index) => (
        <div
          key={`r32-pod-${index}`}
          className="box-border w-full max-w-full rounded-xl bg-gray-50/40 px-1 py-1.5 sm:px-1.5 sm:py-2"
        >
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            {pod.map((match, podIndex) => (
              <CurrentRoundMatchCard
                key={match.matchId}
                match={match}
                isPending={pendingMatchId === match.matchId}
                pendingConfirmation={pendingConfirmation}
                onSelect={onSelect}
                onAdjustScore={onAdjustScore}
                onSave={onSave}
                density="compact"
                side={podIndex === 0 ? "left" : "right"}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectedAndOfficialRoundView({
  projectedMatches,
  officialMatches,
  officialState,
  isOfficialRound,
  forcedProjectedBias,
  pendingMatchId,
  pendingConfirmation,
  onSelect,
  onAdjustScore,
  onSave
}: {
  projectedMatches: KnockoutBracketMatchView[];
  officialMatches: KnockoutBracketMatchView[];
  officialState: "pending" | "live";
  isOfficialRound: boolean;
  forcedProjectedBias: number | null;
  pendingMatchId: string | null;
  pendingConfirmation: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    affectedCount: number;
  } | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
}) {
  const language = useKnockoutLanguage();
  const viewportRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trackRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pointerStartRef = useRef<{ x: number; y: number; bias: number } | null>(null);
  const gestureIntentRef = useRef<"horizontal" | "vertical" | null>(null);
  const pairs = officialMatches.map((officialMatch, index) => ({
    slotKey: officialMatch.matchId ?? projectedMatches[index]?.matchId ?? `${officialMatch.stage}-${index}`,
    projected: projectedMatches[index] ?? null,
    official: officialMatch
  }));
  const defaultOfficialBias = officialState === "live" ? 0.72 : 0.28;
  const maxMobileCardWidthPx = 22.5 * 16;
  const mobilePeekInsetPx = 1.35 * 16;
  const mobileColumnGapPx = 48;
  const mobileSnapEdgeInsetPx = 35;
  const [compareViewState, setCompareViewState, compareViewMeta] = useSessionJsonState<{
    hasInteracted: boolean;
    lastBias: number | null;
  }>(
    KNOCKOUT_COMPARE_VIEW_STATE_STORAGE_KEY,
    {
      hasInteracted: false,
      lastBias: null
    }
  );
  const [committedBias, setCommittedBias] = useState<number | null>(null);
  const officialBias = committedBias ?? defaultOfficialBias;
  const snapTargets = useMemo(() => [0, 1], []);
  const [dragBias, setDragBias] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [maxTrackOffset, setMaxTrackOffset] = useState(0);
  const [narrowViewportWidth, setNarrowViewportWidth] = useState(0);
  const effectiveBias = dragBias ?? officialBias;
  const mobileCardWidthPx =
    isNarrowViewport && narrowViewportWidth > 0
      ? Math.min(Math.max(0, narrowViewportWidth - mobilePeekInsetPx), maxMobileCardWidthPx)
      : 0;
  const mobileDragTravelPx =
    isNarrowViewport && mobileCardWidthPx > 0 ? Math.max(1, (mobileCardWidthPx + mobileColumnGapPx) * 0.68) : 0;
  const mobileCenterGutterPx =
    isNarrowViewport && narrowViewportWidth > 0 ? Math.max(0, (narrowViewportWidth - mobileCardWidthPx) / 2) : 0;
  const mobileMirrorSeamPx =
    isNarrowViewport && narrowViewportWidth > 0
      ? mobileCenterGutterPx + mobileCardWidthPx + mobileColumnGapPx / 2 - (mobileCardWidthPx + mobileColumnGapPx) * effectiveBias
      : 0;
  const mobileSnapSeamPx =
    isNarrowViewport && narrowViewportWidth > 0
      ? mobileCenterGutterPx +
        mobileCardWidthPx +
        mobileColumnGapPx / 2 -
        (mobileCardWidthPx + mobileColumnGapPx) * officialBias
      : 0;
  const mobileSnapTranslatePx =
    !isDragging && isNarrowViewport && compareViewState.hasInteracted
      ? officialBias === 0
        ? narrowViewportWidth - mobileSnapEdgeInsetPx - mobileSnapSeamPx
        : officialBias === 1
          ? mobileSnapEdgeInsetPx - mobileSnapSeamPx
          : 0
      : 0;

  const refreshMeasurements = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sampleKey = pairs[0]?.slotKey;
    const narrow = window.innerWidth < 640;
    setIsNarrowViewport(narrow);
    if (!narrow || !sampleKey) {
      setMaxTrackOffset(0);
      return;
    }

    const viewport = viewportRefs.current[sampleKey];
    const track = trackRefs.current[sampleKey];
    if (!viewport || !track) {
      setNarrowViewportWidth(0);
      setMaxTrackOffset(0);
      return;
    }

    setNarrowViewportWidth(viewport.clientWidth);
    setMaxTrackOffset(Math.max(0, track.scrollWidth - viewport.clientWidth));
  }, [pairs]);

  useEffect(() => {
    return () => {
      pointerStartRef.current = null;
      gestureIntentRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!compareViewMeta.hasHydrated) {
      return;
    }

    if (compareViewState.hasInteracted && typeof compareViewState.lastBias === "number") {
      setCommittedBias(compareViewState.lastBias);
      return;
    }

    setCommittedBias(defaultOfficialBias);
  }, [compareViewMeta.hasHydrated, compareViewState.hasInteracted, compareViewState.lastBias, defaultOfficialBias]);

  useEffect(() => {
    if (forcedProjectedBias == null) {
      return;
    }

    setCommittedBias(forcedProjectedBias);
    setCompareViewState({
      hasInteracted: true,
      lastBias: forcedProjectedBias
    });
  }, [forcedProjectedBias, setCompareViewState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    refreshMeasurements();
    window.addEventListener("resize", refreshMeasurements);

    let resizeObserver: ResizeObserver | null = null;
    const sampleKey = pairs[0]?.slotKey;
    const sampleViewport = sampleKey ? viewportRefs.current[sampleKey] : null;
    const sampleTrack = sampleKey ? trackRefs.current[sampleKey] : null;
    if (typeof ResizeObserver !== "undefined" && sampleViewport && sampleTrack) {
      resizeObserver = new ResizeObserver(refreshMeasurements);
      resizeObserver.observe(sampleViewport);
      resizeObserver.observe(sampleTrack);
    }

    return () => {
      window.removeEventListener("resize", refreshMeasurements);
      resizeObserver?.disconnect();
    };
  }, [pairs, refreshMeasurements]);

  const snapStageBias = (currentBias: number) => {
    const snappedRatio = snapTargets.reduce((closest, candidate) =>
      Math.abs(candidate - currentBias) < Math.abs(closest - currentBias) ? candidate : closest
    );
    setCommittedBias(snappedRatio);
    setCompareViewState({
      hasInteracted: true,
      lastBias: snappedRatio
    });
    setDragBias(null);
    setIsDragging(false);
  };

  function getMaxTrackOffset(slotKey: string) {
    const viewport = viewportRefs.current[slotKey];
    const track = trackRefs.current[slotKey];
    if (!viewport || !track) {
      return 0;
    }

    return Math.max(0, track.scrollWidth - viewport.clientWidth);
  }

  function beginDrag(startX: number, startY: number) {
    pointerStartRef.current = {
      x: startX,
      y: startY,
      bias: effectiveBias
    };
    gestureIntentRef.current = null;
    setDragBias(effectiveBias);
    setIsDragging(true);
  }

  function updateDrag(slotKey: string, currentX: number, currentY: number) {
    const start = pointerStartRef.current;
    if (!start) {
      return { intent: gestureIntentRef.current, active: false as const };
    }

    const deltaX = currentX - start.x;
    const deltaY = currentY - start.y;
    if (!gestureIntentRef.current) {
      if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) {
        return { intent: null, active: true as const };
      }
      gestureIntentRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (gestureIntentRef.current !== "horizontal") {
      setDragBias(null);
      setIsDragging(false);
      return { intent: gestureIntentRef.current, active: false as const };
    }

    const maxOffset = mobileDragTravelPx || maxTrackOffset || getMaxTrackOffset(slotKey);
    if (maxOffset <= 0) {
      return { intent: gestureIntentRef.current, active: true as const };
    }

    const nextBias = Math.max(0, Math.min(1, start.bias - deltaX / maxOffset));
    setDragBias(nextBias);
    return { intent: gestureIntentRef.current, active: true as const };
  }

  function finishDrag() {
    const start = pointerStartRef.current;
    const intent = gestureIntentRef.current;
    pointerStartRef.current = null;
    gestureIntentRef.current = null;

    if (!start) {
      setDragBias(null);
      setIsDragging(false);
      return;
    }

    if (intent !== "horizontal") {
      setDragBias(null);
      setIsDragging(false);
      return;
    }

    snapStageBias(dragBias ?? start.bias);
  }

  function handlePointerStart(slotKey: string, event: React.PointerEvent<HTMLDivElement>) {
    if (!isNarrowViewport) {
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    beginDrag(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(slotKey: string, event: React.PointerEvent<HTMLDivElement>) {
    if (!isNarrowViewport) {
      return;
    }
    const dragState = updateDrag(slotKey, event.clientX, event.clientY);
    if (dragState.intent === "horizontal") {
      event.preventDefault();
    }
  }

  function handlePointerEnd(event?: React.PointerEvent<HTMLDivElement>) {
    if (!isNarrowViewport) {
      return;
    }
    if (event) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    finishDrag();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {pairs.map((pair) => (
          <div key={pair.slotKey} className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex min-w-0 items-center gap-2">
                {getKnockoutMatchNumber(pair.official.title ?? pair.projected?.title ?? "") ? (
                  <KnockoutMatchNumberBadge
                    number={getKnockoutMatchNumber(pair.official.title ?? pair.projected?.title ?? "") ?? 0}
                    compact
                  />
                ) : null}
                <span className="truncate text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  {getStageDisplayName(pair.official.stage, language)}
                </span>
              </div>
              <p className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                {formatCompactKickoff(pair.official.kickoffTime, language)}
              </p>
            </div>
            <div className="relative">
              {isNarrowViewport ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-2 z-[2] hidden w-px -translate-x-1/2 sm:hidden"
                  style={{
                    left: `${mobileMirrorSeamPx}px`,
                    backgroundColor: "rgba(148,163,184,0.22)",
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.75), 0 0 12px rgba(15,23,42,0.14)"
                  }}
                />
              ) : null}
              <div
                ref={(node) => {
                  viewportRefs.current[pair.slotKey] = node;
                  refreshMeasurements();
                }}
                onPointerDown={(event) => handlePointerStart(pair.slotKey, event)}
                onPointerMove={(event) => handlePointerMove(pair.slotKey, event)}
                onPointerUp={(event) => handlePointerEnd(event)}
                onPointerCancel={(event) => handlePointerEnd(event)}
                className="overflow-hidden px-0 pb-1 touch-pan-y"
              >
                <div
                  ref={(node) => {
                    trackRefs.current[pair.slotKey] = node;
                    refreshMeasurements();
                  }}
                  className="flex min-w-max gap-0 sm:grid sm:min-w-0 sm:grid-cols-2 sm:gap-3"
                  style={
                    isNarrowViewport
                      ? {
                          columnGap: `${mobileColumnGapPx}px`,
                          transform: `translateX(${-(maxTrackOffset * effectiveBias) + mobileSnapTranslatePx}px)`,
                          transition: isDragging ? "none" : "transform 170ms cubic-bezier(0.22, 1, 0.36, 1)",
                          willChange: "transform"
                        }
                      : undefined
                  }
                >
                  <div
                    aria-hidden
                    className="shrink-0 sm:hidden"
                    style={{ width: `${mobileCenterGutterPx}px` }}
                  />
                  <div
                    className="shrink-0 sm:w-auto sm:max-w-none sm:min-w-0"
                    style={isNarrowViewport ? { width: `${mobileCardWidthPx}px` } : undefined}
                  >
                    <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                      {kt(language, "groupPicks")}
                    </div>
                    {pair.projected ? (
                      <CurrentRoundMatchCard
                        match={pair.projected}
                        isPending={false}
                        pendingConfirmation={null}
                        onSelect={() => undefined}
                        onAdjustScore={() => undefined}
                        onSave={() => undefined}
                        density="compact"
                        side="left"
                        showHeader={false}
                        showMatchIdentity={false}
                        isGroupPickPreview
                      />
                    ) : (
                      <ComparisonPlaceholderCard
                        tone="projected"
                        title={kt(language, "projectedSlotIncomplete")}
                        body={kt(language, "builtFromGroupPicks")}
                      />
                    )}
                  </div>
                  {renderOfficialCard(pair)}
                  <div
                    aria-hidden
                    className="shrink-0 sm:hidden"
                    style={{ width: `${mobileCenterGutterPx}px` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  function renderOfficialCard(pair: (typeof pairs)[number]) {
    return (
      <div
        className="shrink-0 sm:w-auto sm:max-w-none sm:min-w-0"
        style={isNarrowViewport ? { width: `${mobileCardWidthPx}px` } : undefined}
      >
        <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-gray-600">
          {kt(language, "qualifyingTeams")}
        </div>
        {officialState === "live" && isOfficialRound ? (
          <CurrentRoundMatchCard
            match={pair.official}
            isPending={pendingMatchId === pair.official.matchId}
            pendingConfirmation={pendingConfirmation}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
            density="compact"
            side="right"
            showHeader={false}
            showMatchIdentity={false}
          />
        ) : (
          <ActualComparisonMatchCard match={pair.official} pendingOnly showHeader={false} />
        )}
      </div>
    );
  }
}

function FocusedRoundView({
  slide,
  pendingMatchId,
  pendingConfirmation,
  onSelect,
  onAdjustScore,
  onSave
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  pendingConfirmation: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    affectedCount: number;
  } | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
}) {
  const pods = groupMatchesIntoPods(slide.currentMatches);

  return (
    <div className="space-y-3 px-2 sm:px-0">
      {pods.map((pod, index) => (
        <div
          key={`focus-pod-${index}`}
          className="box-border w-full max-w-full rounded-xl bg-gray-50/40 px-1 py-1.5 sm:px-1.5 sm:py-2"
        >
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            {pod.map((match, podIndex) => (
              <CurrentRoundMatchCard
                key={match.matchId}
                match={match}
                isPending={pendingMatchId === match.matchId}
                pendingConfirmation={pendingConfirmation}
                onSelect={onSelect}
                onAdjustScore={onAdjustScore}
                onSave={onSave}
                density="expanded"
                side={podIndex === 0 ? "left" : "right"}
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
  pendingConfirmation,
  onSelect,
  onAdjustScore,
  onSave
}: {
  slide: BracketSlideView;
  pendingMatchId: string | null;
  pendingConfirmation: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    affectedCount: number;
  } | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
}) {
  const finalMatch = slide.currentMatches[0] ?? null;

  return (
    <div className="space-y-3 px-2 sm:px-0">
      <ChampionCard champion={slide.champion} />
      {finalMatch ? (
        <div className="box-border w-full max-w-full rounded-xl bg-gray-50/40 px-1 py-1.5 sm:px-1.5 sm:py-2">
          <CurrentRoundMatchCard
            match={finalMatch}
            isPending={pendingMatchId === finalMatch.matchId}
            pendingConfirmation={pendingConfirmation}
            onSelect={onSelect}
            onAdjustScore={onAdjustScore}
            onSave={onSave}
            density="hero"
            side="center"
          />
        </div>
      ) : null}
    </div>
  );
}

function CurrentRoundMatchCard({
  match,
  isPending,
  pendingConfirmation,
  onSelect,
  onAdjustScore,
  onSave,
  density,
  side = "left",
  showHeader = true,
  showMatchIdentity = true,
  isGroupPickPreview = false
}: {
  match: KnockoutBracketMatchView;
  isPending: boolean;
  pendingConfirmation: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId: string | null;
    affectedCount: number;
  } | null;
  onSelect: (matchId: string, teamId: string) => void | Promise<void>;
  onAdjustScore: (matchId: string, side: "home" | "away", delta: 1 | -1) => void;
  onSave: (matchId: string) => void | Promise<void>;
  density: "compact" | "expanded" | "hero";
  side?: "left" | "right" | "center";
  showHeader?: boolean;
  showMatchIdentity?: boolean;
  isGroupPickPreview?: boolean;
}) {
  const language = useKnockoutLanguage();
  const landingMatchId = useContext(KnockoutLandingMatchContext);
  const isCompact = density === "compact";
  const isHero = density === "hero";
  const isEmbeddedCenterCard = side === "center" && !showHeader;
  const isLandingMatch = landingMatchId === match.matchId;
  const matchNumber = getKnockoutMatchNumber(match.title);
  const shouldShowStageLabel = match.stage === "r32";
  const hasOfficialTeams = Boolean(match.seededHomeTeam && match.seededAwayTeam);
  const shellState = getKnockoutMatchShellState(match);
  const currentHomeScore = match.predictedHomeScore;
  const currentAwayScore = match.predictedAwayScore;
  const hasActualFinalScores =
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined;
  const hasActualLiveScores = hasActualFinalScores && match.status !== "final";
  const localWinnerTeamId = getLocalPredictedWinner(match);
  const hasUnsavedPredictionChange = isPredictionDirty(match, localWinnerTeamId);
  const hasSavedSelection = Boolean(match.savedAt);
  const requiresWinnerSelection = requiresTieWinner(match);
  const isProjectedEditable = match.viewMode === "projected" && shellState === "open";
  const isOfficialEditable = match.viewMode === "official" && shellState === "open";
  const hasValidPrediction = canSavePrediction(match, localWinnerTeamId);
  const showProjectedSaveButton = isProjectedEditable && hasUnsavedPredictionChange;
  const showOfficialSaveButton = isOfficialEditable && hasUnsavedPredictionChange;
  const showSaveButton = showProjectedSaveButton || showOfficialSaveButton;
  const shouldShowOfficialScoreArea =
    match.viewMode === "official"
      ? Boolean(match.homeTeam && match.awayTeam)
      : true;
  const shouldShowProjectedScoreArea =
    match.viewMode === "projected"
      ? match.stage !== "r32" &&
        (
          isProjectedEditable ||
          match.savedHomeScore !== null ||
          match.savedAwayScore !== null ||
          match.predictedHomeScore !== null ||
          match.predictedAwayScore !== null
        )
      : true;
  const shouldShowScoreArea = match.viewMode === "official" ? shouldShowOfficialScoreArea : shouldShowProjectedScoreArea;
  const isAwaitingClearConfirmation = pendingConfirmation?.matchId === match.matchId;
  const hasUserPrediction = Boolean(match.savedAt || hasUnsavedPredictionChange);
  const finalStatusKind = hasActualFinalScores
    ? hasUserPrediction
      ? match.isCorrectWinner == null
        ? match.viewMode === "projected"
          ? "projectedComparisonAfterFinal"
          : "scoringPending"
        : null
      : "noPickSaved"
    : null;
  const finalStatusMessage = finalStatusKind ? kt(language, finalStatusKind) : null;
  const gradedPointsLabel =
    match.isCorrectWinner == null
      ? null
      : match.viewMode === "projected"
        ? match.isCorrectWinner
          ? match.exactScorePoints && match.exactScorePoints > 0
            ? kt(language, "perfectProjectedHit")
            : kt(language, "projectedWinnerMatched")
          : kt(language, "projectedWinnerMissed")
        : match.isCorrectWinner === true
          ? match.awardedPoints == null
            ? kt(language, "winnerCorrectPointsUpdating")
            : match.exactScorePoints && match.exactScorePoints > 0
              ? kt(language, "exactScorePoints", { points: match.awardedPoints })
              : match.awardedPoints > 0
                ? kt(language, "winnerCorrectPoints", { points: match.awardedPoints })
                : kt(language, "winnerCorrectNoPoints")
          : match.awardedPoints == null
            ? kt(language, "scoringPending")
            : match.awardedPoints > 0
              ? kt(language, "pointsEarned", { points: match.awardedPoints })
              : kt(language, "noPointsEarned");
  const statusBadge =
    shellState === "final" ? (
      <span className="ui-chip-sm shrink-0 bg-gray-200 font-bold text-gray-700">{kt(language, "finalStatus")}</span>
    ) : shellState === "wait" && match.viewMode === "projected" ? (
      <ProjectedMatchStatusChip hasOfficialTeams={hasOfficialTeams} />
    ) : shellState === "closed" ? (
      <span className="ui-chip-sm shrink-0 bg-gray-950 font-bold text-white">{kt(language, "locked")}</span>
    ) : shellState === "open" ? (
      <span
        className={`ui-chip-sm shrink-0 font-bold ${
          match.viewMode === "projected" ? "bg-amber-50 text-amber-700" : "bg-accent-light text-accent-dark"
        }`}
      >
        {kt(language, "open")}
      </span>
    ) : (
      <span className="ui-chip-sm shrink-0 bg-amber-50 font-bold text-amber-700">{kt(language, "pending")}</span>
    );
  const isReadOnly = shellState === "closed" || shellState === "final" || shellState === "wait";
  const displayWinnerTeamId =
    shellState === "final" || isReadOnly ? match.savedWinnerTeamId ?? localWinnerTeamId : localWinnerTeamId;
  const homeSelected = Boolean(
    !isGroupPickPreview &&
      displayWinnerTeamId &&
      [match.homeTeam?.id ?? null, match.seededHomeTeam?.id ?? null].includes(displayWinnerTeamId)
  );
  const awaySelected = Boolean(
    !isGroupPickPreview &&
      displayWinnerTeamId &&
      [match.awayTeam?.id ?? null, match.seededAwayTeam?.id ?? null].includes(displayWinnerTeamId)
  );
  const projectedHomeComparisonState =
    !isGroupPickPreview && match.viewMode === "projected" && match.seededHomeTeam
      ? match.homeTeam
        ? match.homeTeam.id === match.seededHomeTeam.id
          ? "match"
          : "miss"
        : null
      : null;
  const projectedAwayComparisonState =
    !isGroupPickPreview && match.viewMode === "projected" && match.seededAwayTeam
      ? match.awayTeam
        ? match.awayTeam.id === match.seededAwayTeam.id
          ? "match"
          : "miss"
        : null
      : null;
  const footerContextChips = buildMatchContextChips(match, language);

  return (
    <div
      data-knockout-match-id={match.matchId}
      className={
        isEmbeddedCenterCard
          ? `relative ${isHero ? "p-1" : "p-0.5"} ${isLandingMatch ? "knockout-landing-pop" : ""}`
          : `relative box-border w-full max-w-full overflow-hidden rounded-[1.15rem] border ${
              match.viewMode === "projected"
                ? "border-amber-200 bg-amber-50/80 p-2"
                : shellState === "final"
                  ? "border-gray-200 bg-gray-100 p-2"
                  : "border-gray-200 bg-white p-2"
            } ${isLandingMatch ? "knockout-landing-pop" : ""}`
      }
    >
      {showHeader ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            {showMatchIdentity && matchNumber ? (
              <div className="flex items-center gap-2">
                <KnockoutMatchNumberBadge number={matchNumber} compact={isCompact} />
                {shouldShowStageLabel ? (
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                    {getStageDisplayName(match.stage, language)}
                  </span>
                ) : null}
              </div>
            ) : showMatchIdentity ? (
              <p className={`${isCompact ? "text-xs" : "text-sm"} font-bold text-gray-950`}>{match.title}</p>
            ) : (
              <span aria-hidden className="inline-flex h-6" />
            )}
          </div>
          <p className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {shellState === "open"
              ? kt(language, "pickBefore", { date: formatCompactKickoff(match.kickoffTime, language) })
              : formatCompactKickoff(match.kickoffTime, language)}
          </p>
          <div className="min-w-0 justify-self-end">{statusBadge}</div>
        </div>
      ) : null}

      <div className={`${showHeader ? "mt-1.5" : ""} relative px-2 py-1`}>
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1/2 top-1 -translate-x-1/2 border-l border-gray-200"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden">
          <KnockoutTeamPanel
            team={match.homeTeam}
            officialTeam={match.seededHomeTeam}
            placeholderLabel={match.homeSourceLabel}
            viewMode={match.viewMode}
            status={match.status}
            isSelected={homeSelected}
            isCorrectSelection={match.status === "final" && homeSelected ? match.isCorrectWinner : null}
            slotComparisonState={projectedHomeComparisonState}
            isDisabled={!match.homeTeam || !match.canSelectWinner || isPending}
            onClick={() => {
              if (match.homeTeam?.id) {
                void onSelect(match.matchId, match.homeTeam.id);
              }
            }}
            density={density}
            side="left"
            isReadOnly={isReadOnly || isGroupPickPreview}
            canSelectByTap={!isGroupPickPreview && requiresWinnerSelection}
            predictedScore={currentHomeScore}
            onIncrement={() => onAdjustScore(match.matchId, "home", 1)}
            onDecrement={() => onAdjustScore(match.matchId, "home", -1)}
            showScoreArea={shouldShowScoreArea}
          />
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[8px] font-bold uppercase ${
              match.status === "final"
                ? "border-gray-300 bg-white text-gray-500"
                : shellState === "closed"
                  ? "border-gray-300 bg-white text-gray-500"
                  : "border-gray-200 bg-white text-gray-400"
            }`}
          >
            {kt(language, "vs")}
          </span>
          <KnockoutTeamPanel
            team={match.awayTeam}
            officialTeam={match.seededAwayTeam}
            placeholderLabel={match.awaySourceLabel}
            viewMode={match.viewMode}
            status={match.status}
            isSelected={awaySelected}
            isCorrectSelection={match.status === "final" && awaySelected ? match.isCorrectWinner : null}
            slotComparisonState={projectedAwayComparisonState}
            isDisabled={!match.awayTeam || !match.canSelectWinner || isPending}
            onClick={() => {
              if (match.awayTeam?.id) {
                void onSelect(match.matchId, match.awayTeam.id);
              }
            }}
            density={density}
            side="right"
            isReadOnly={isReadOnly || isGroupPickPreview}
            canSelectByTap={!isGroupPickPreview && requiresWinnerSelection}
            predictedScore={currentAwayScore}
            onIncrement={() => onAdjustScore(match.matchId, "away", 1)}
            onDecrement={() => onAdjustScore(match.matchId, "away", -1)}
            showScoreArea={shouldShowScoreArea}
          />
        </div>
      </div>

      {footerContextChips.left || footerContextChips.right ? (
        <div className="mt-1.5 border-t border-gray-100 px-2 pt-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1.5">
            <div className="flex min-w-0 justify-center">
              {footerContextChips.left ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em] text-gray-500">
                  <span className="flex min-w-0 flex-col items-center text-center leading-[1.05]">
                    <span className="min-w-0 truncate">{footerContextChips.left.primary}</span>
                    {footerContextChips.left.secondary ? (
                      <span className="min-w-0 truncate text-[9px] font-semibold tracking-[0.02em] text-gray-400">
                        {footerContextChips.left.secondary}
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : null}
            </div>
            <span aria-hidden className="inline-flex h-1 w-7" />
            <div className="flex min-w-0 justify-center">
              {footerContextChips.right ? (
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.03em] text-gray-500">
                  <span className="flex min-w-0 flex-col items-center text-center leading-[1.05]">
                    <span className="min-w-0 truncate">{footerContextChips.right.primary}</span>
                    {footerContextChips.right.secondary ? (
                      <span className="min-w-0 truncate text-[9px] font-semibold tracking-[0.02em] text-gray-400">
                        {footerContextChips.right.secondary}
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isGroupPickPreview ? (
        <div className="mt-1.5 border-t border-amber-100/90 px-2 pt-2 text-center">
          <p className="mx-auto max-w-[14rem] text-[10px] font-semibold leading-[1.25] tracking-[0.02em] text-amber-700">
            {kt(language, "builtFromGroupPicks")}
          </p>
        </div>
      ) : match.status === "final" && match.viewMode === "official" ? (
        <div className="mt-1.5 border-t border-gray-300 px-1 pt-2 text-center">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            <div className="flex min-w-0 items-center justify-start gap-2">
              <span className="text-sm font-bold leading-none tabular-nums text-gray-800">
                {hasActualFinalScores ? match.homeScore : "—"}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold leading-none text-gray-500">
                {match.seededHomeTeam?.shortName ?? match.homeTeam?.shortName ?? kt(language, "home")}
              </span>
            </div>
            <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {hasActualFinalScores ? kt(language, "finalScores") : kt(language, "finalScoresAwaiting")}
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span className="min-w-0 truncate text-sm font-semibold leading-none text-gray-500">
                {match.seededAwayTeam?.shortName ?? match.awayTeam?.shortName ?? kt(language, "away")}
              </span>
              <span className="text-sm font-bold leading-none tabular-nums text-gray-800">
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
              {finalStatusKind === "noPickSaved" ? (
                <>
                  <X aria-hidden className="h-4 w-4 text-rose-600" />
                  <span>{kt(language, "noPickSaved")}</span>
                  <span className="text-gray-500">{kt(language, "noPoints")}</span>
                </>
              ) : (
                <span>{finalStatusMessage}</span>
              )}
            </div>
          ) : null}
        </div>
      ) : match.status === "final" && match.viewMode === "projected" ? (
        <div className="mt-1.5 border-t border-amber-200/80 px-1 pt-2 text-center">
          {shouldShowProjectedScoreArea && match.savedHomeScore !== null && match.savedAwayScore !== null ? (
            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
              {kt(language, "projectedScore", { homeScore: match.savedHomeScore, awayScore: match.savedAwayScore })}
            </div>
          ) : null}
          {match.isCorrectWinner != null ? (
            <div className={`${shouldShowProjectedScoreArea && match.savedHomeScore !== null && match.savedAwayScore !== null ? "mt-1" : ""} flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-900`}>
              {match.isCorrectWinner === true ? (
                <Check aria-hidden className="h-4 w-4 text-accent-dark" />
              ) : (
                <X aria-hidden className="h-4 w-4 text-rose-600" />
              )}
              <span>{gradedPointsLabel}</span>
            </div>
          ) : null}
          {finalStatusMessage ? (
            <div className="mt-1 flex items-center justify-center gap-2 text-center text-[10px] font-bold uppercase tracking-wide text-amber-800">
              {finalStatusKind === "noPickSaved" ? (
                <>
                  <X aria-hidden className="h-4 w-4 text-rose-600" />
                  <span>{kt(language, "noPickSaved")}</span>
                  <span className="text-amber-900">{kt(language, "noPoints")}</span>
                </>
              ) : (
                <span>{finalStatusMessage}</span>
              )}
            </div>
          ) : null}
        </div>
      ) : shellState === "closed" && match.viewMode === "official" ? (
        <div className="mt-1.5 border-t border-gray-300 px-1 pt-2 text-center">
          {hasActualLiveScores ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <div className="flex min-w-0 items-center justify-start gap-2">
                <span className="text-sm font-bold leading-none tabular-nums text-orange-500">
                  {match.homeScore}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold leading-none text-gray-500">
                  {match.seededHomeTeam?.shortName ?? match.homeTeam?.shortName ?? kt(language, "home")}
                </span>
              </div>
              <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {kt(language, "liveScore")}
              </div>
              <div className="flex min-w-0 items-center justify-end gap-2">
                <span className="min-w-0 truncate text-sm font-semibold leading-none text-gray-500">
                  {match.seededAwayTeam?.shortName ?? match.awayTeam?.shortName ?? kt(language, "away")}
                </span>
                <span className="text-sm font-bold leading-none tabular-nums text-orange-500">
                  {match.awayScore}
                </span>
              </div>
            </div>
          ) : null}
          <div className={`${hasActualLiveScores ? "mt-1" : ""} text-center text-[10px] font-bold uppercase tracking-wide text-gray-500`}>
            {hasSavedSelection
              ? kt(language, "savedOn", { date: formatSavedTimestamp(match.savedAt, language) })
              : hasOfficialTeams
                ? kt(language, "predictionsLockedAtKickoff")
                : kt(language, "officialBracketPending")}
          </div>
        </div>
      ) : showSaveButton ? (
        <>
          {isAwaitingClearConfirmation ? (
            <div className="mt-1.5 flex min-h-[28px] items-center justify-center overflow-hidden border-t border-amber-200/80 bg-amber-50/70 px-1.5 text-center text-[10px] font-bold uppercase leading-none tracking-[0.02em] text-amber-800">
              {kt(language, "confirmClear", { count: pendingConfirmation.affectedCount })}
            </div>
          ) : requiresWinnerSelection && !localWinnerTeamId ? (
            <div className="mt-1 flex min-h-[22px] items-center justify-center overflow-hidden border-t border-amber-300 bg-amber-100/90 px-1.5 py-0 text-center text-amber-900">
              <span className="flex min-h-[22px] w-full min-w-0 items-center justify-center truncate text-center text-[10px] font-semibold uppercase leading-none tracking-[0.04em] [-webkit-text-size-adjust:100%] [text-size-adjust:100%] sm:text-xs">
                {kt(language, "youPickedTeams")}
              </span>
            </div>
          ) : null}
          <button
            type="button"
            disabled={isPending}
            onClick={() => void onSave(match.matchId)}
            className={`mt-1.5 inline-flex w-full items-center justify-center rounded-md px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isAwaitingClearConfirmation
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-accent hover:bg-accent-dark"
            }`}
          >
            {isPending
              ? t(language, "common.saving")
              : isAwaitingClearConfirmation
                ? kt(language, "confirmClearAndSave")
                : matchNumber
                  ? kt(language, "saveMatch", { matchNumber })
                  : kt(language, "saveMatchFallback")}
          </button>
        </>
      ) : hasSavedSelection ? (
        <div className="mt-1.5 border-t border-gray-100 px-1 pt-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {kt(language, "savedOn", { date: formatSavedTimestamp(match.savedAt, language) })}
        </div>
      ) : isProjectedEditable ? (
        <div
          className={`mt-1.5 border-t px-1 pt-2 text-center ${
            requiresWinnerSelection && !localWinnerTeamId
              ? "border-amber-300 bg-amber-100/90"
              : "border-amber-200/80 bg-amber-50/80"
          }`}
        >
          <div className="flex min-h-[22px] items-center justify-center text-xs font-bold uppercase tracking-wide text-amber-800">
            {requiresWinnerSelection && !localWinnerTeamId ? (
              <span className="flex min-h-[22px] w-full min-w-0 items-center justify-center overflow-hidden px-1.5 py-0">
                <span className="block w-full min-w-0 truncate text-center text-[10px] font-semibold uppercase leading-none tracking-[0.04em] text-amber-900 [-webkit-text-size-adjust:100%] [text-size-adjust:100%] sm:text-xs">
                  {kt(language, "youPickedTeams")}
                </span>
              </span>
            ) : !hasValidPrediction ? (
              kt(language, "youPickedTeams")
            ) : (
              kt(language, "adjustScoreWinnerToSave")
            )}
          </div>
        </div>
      ) : shellState === "open" ? (
        <div
          className={`mt-1.5 border-t px-1 pt-2 text-center text-xs font-bold uppercase tracking-wide ${
            match.viewMode === "projected"
              ? "border-amber-200/80 bg-amber-50/60 text-amber-800"
              : "border-gray-100 bg-accent-light/30 text-accent-dark"
          }`}
        >
          {kt(language, "editableUntilKickoff")}
        </div>
      ) : (
        <div className="mt-1.5 border-t border-gray-300 px-1 pt-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {match.viewMode === "projected"
            ? !match.homeTeam || !match.awayTeam
              ? kt(language, "notPicked")
              : hasOfficialTeams
                ? kt(language, "sidePickScoringComingSoon")
                : kt(language, "matchNotSeeded")
            : hasOfficialTeams
              ? kt(language, "predictionsLockedAtKickoff")
              : kt(language, "officialBracketPending")}
        </div>
      )}
    </div>
  );
}

function ProjectedMatchStatusChip({ hasOfficialTeams }: { hasOfficialTeams: boolean }) {
  const language = useKnockoutLanguage();

  if (hasOfficialTeams) {
    return <span className="ui-chip-sm shrink-0 bg-amber-50 font-bold text-amber-700">{kt(language, "locked")}</span>;
  }

  return (
    <span className="ui-chip-sm shrink-0 bg-gray-100 font-bold text-gray-500">
      {kt(language, "pending")}
    </span>
  );
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

  if (match.viewMode === "projected") {
    if (match.canSelectWinner) {
      return "open" as const;
    }

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
  viewMode,
  status,
  isSelected,
  isCorrectSelection,
  slotComparisonState,
  isDisabled,
  onClick,
  density,
  side,
  isReadOnly,
  canSelectByTap,
  predictedScore,
  onIncrement,
  onDecrement,
  showScoreArea,
}: {
  team: BracketTeamOption | null;
  officialTeam: BracketTeamOption | null;
  placeholderLabel: string | null;
  viewMode: KnockoutBracketMatchView["viewMode"];
  status: KnockoutBracketMatchView["status"];
  isSelected: boolean;
  isCorrectSelection: boolean | null;
  slotComparisonState: "match" | "miss" | null;
  isDisabled: boolean;
  onClick: () => void;
  density: "compact" | "expanded" | "hero";
  side: "left" | "right";
  isReadOnly: boolean;
  canSelectByTap: boolean;
  predictedScore: number | null;
  onIncrement: () => void;
  onDecrement: () => void;
  showScoreArea: boolean;
}) {
  const language = useKnockoutLanguage();
  const isCompact = density === "compact";
  const userTeam = team;
  const isProjectedTone = viewMode === "projected";
  const isProjectedReadOnly = viewMode === "projected" && isReadOnly;
  const unresolvedLabel =
    viewMode === "official" && !team && !officialTeam ? formatRoundOf32PlaceholderLabel(placeholderLabel, language) : null;
  const displayLabel =
    viewMode === "projected"
      ? team?.name ?? kt(language, "notPicked")
      : team?.name ?? officialTeam?.name ?? unresolvedLabel?.primary ?? kt(language, "tbd");
  const displayFlag =
    viewMode === "projected"
      ? team?.flagEmoji ?? null
      : team?.flagEmoji ?? officialTeam?.flagEmoji ?? null;
  const scoreValue = matchScoreDisplay({ predictedScore });
  const ariaTeamName = officialTeam?.name ?? userTeam?.name ?? placeholderLabel ?? kt(language, "thisTeam");
  const showProjectedSlotHitOverlay = viewMode === "projected" && slotComparisonState === "match";
  const showProjectedSlotMissOverlay = viewMode === "projected" && slotComparisonState === "miss";
  const showCombinedHitOverlay =
    showProjectedSlotHitOverlay || (status === "final" && isSelected && isCorrectSelection === true);
  const showCombinedMissOverlay =
    showProjectedSlotMissOverlay || (status === "final" && isSelected && isCorrectSelection === false);
  const selectedPanelClass =
    canSelectByTap && isSelected
      ? isProjectedTone
        ? "bg-amber-100/70 text-amber-900"
        : "bg-accent-light/40 text-accent-dark"
      : "";
  const projectedPositiveClass = isProjectedTone ? "text-amber-800" : "text-accent-dark";
  const projectedMutedClass = isProjectedTone ? "text-amber-500/70" : "text-accent/45";
  const ariaLabel = isProjectedReadOnly
    ? kt(language, "projectedPreviewForTeam", { teamName: ariaTeamName })
    : isReadOnly || isDisabled
      ? kt(language, "teamLockedForMatchup", { teamName: ariaTeamName })
      : canSelectByTap
        ? kt(language, "chooseTeamAdvances", { teamName: ariaTeamName })
        : kt(language, "teamScoreControlsEditable", { teamName: ariaTeamName });

  const content = (
    <span
      className={`relative flex w-full min-w-0 max-w-full flex-col items-center rounded-[1rem] px-1 py-0.5 ${selectedPanelClass} ${
        isCompact ? "min-h-[86px]" : "min-h-[92px]"
      }`}
    >
      {showCombinedHitOverlay ? (
        <span className="pointer-events-none absolute left-1/2 -top-5 -translate-x-1/2">
          <span className="rounded-full bg-white/88 p-1 shadow-sm">
            <Check aria-hidden className={`h-6 w-6 ${projectedPositiveClass}`} strokeWidth={2.6} />
          </span>
        </span>
      ) : null}
      {showCombinedMissOverlay ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[118%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-rose-400/65"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[118%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-rose-400/55"
          />
        </>
      ) : null}
      <span className="flex w-full min-w-0 justify-center overflow-hidden">
        <span className="flex min-w-0 items-center justify-center gap-2">
          {showScoreArea ? (
            <>
              {side === "left" ? renderWinnerSlot() : null}
              {side === "left" ? renderStepper() : null}
              <span
                onClick={(event) => {
                  if (canSelectByTap) {
                    event.stopPropagation();
                  }
                }}
                className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[0.85rem] border-2 bg-white font-bold tabular-nums ${
                  isProjectedReadOnly
                    ? "border-transparent bg-transparent text-gray-700"
                    : isSelected
                      ? isProjectedTone
                        ? "border-amber-400 text-amber-900"
                        : "border-accent text-accent-dark"
                      : "border-gray-300 text-gray-400"
                } ${isCompact ? "h-10 w-9 text-2xl" : "h-10 w-10 text-2xl"}`}
              >
                {scoreValue}
              </span>
              {side === "right" ? renderStepper() : null}
              {side === "right" ? renderWinnerSlot() : null}
            </>
          ) : (
            <span className="mb-0.5 flex min-h-[36px] items-center justify-center">
              {renderWinnerSlot()}
            </span>
          )}
        </span>
      </span>
      <span className="mt-1 block w-full min-w-0 max-w-full px-1">
          {displayFlag ? (
            <span className="mb-1 flex items-center justify-center">
              <span aria-hidden className="shrink-0 text-xl leading-none">
                {displayFlag}
              </span>
            </span>
          ) : null}
          {unresolvedLabel ? (
            <span className="flex min-w-0 flex-col items-center text-center leading-none">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                {unresolvedLabel.primary}
              </span>
              {unresolvedLabel.secondary ? (
                <span className="mt-1 block min-w-0 truncate text-[11px] font-semibold text-gray-500">
                  {unresolvedLabel.secondary}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="block min-w-0 text-center text-[14px] font-bold leading-tight text-gray-950 sm:text-base">
              <span className="block min-w-0 truncate">{displayLabel}</span>
            </span>
          )}
      </span>
    </span>
  );

  if (isReadOnly || isDisabled) {
    return (
      <div
        aria-label={ariaLabel}
        className={`min-w-0 cursor-default ${isSelected ? projectedPositiveClass : "text-gray-700"}`}
      >
        {content}
      </div>
    );
  }

  if (!canSelectByTap) {
    return <div aria-label={ariaLabel} className={`min-w-0 ${isSelected ? projectedPositiveClass : "text-gray-700"}`}>{content}</div>;
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
            ? projectedPositiveClass
            : isCorrectSelection === false
              ? "text-rose-800"
              : projectedPositiveClass
          : isProjectedTone
            ? "hover:text-amber-800"
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
          className={`inline-flex h-5 w-7 items-center justify-center ${isProjectedTone ? "hover:text-amber-800" : "hover:text-accent-dark"}`}
          aria-label={kt(language, "increaseTeamScore", { teamName: ariaTeamName })}
        >
          <ChevronUpSmall />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDecrement();
          }}
          className={`inline-flex h-5 w-7 items-center justify-center border-t border-gray-200 ${
            isProjectedTone ? "hover:text-amber-800" : "hover:text-accent-dark"
          }`}
          aria-label={kt(language, "decreaseTeamScore", { teamName: ariaTeamName })}
        >
          <ChevronDownSmall />
        </button>
      </span>
    );
  }

  function renderWinnerSlot() {
    return (
      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center ${projectedPositiveClass}`}>
        {isSelected ? (
          <Trophy aria-hidden className="h-5 w-5" />
        ) : canSelectByTap ? (
          <span aria-hidden className={`relative inline-flex h-5 w-5 items-center justify-center ${projectedMutedClass}`}>
            <Trophy className="h-4.5 w-4.5 stroke-[1.8]" />
            <CheckSquare className="absolute -bottom-0.5 -right-1 h-3.5 w-3.5 stroke-[1.9]" />
          </span>
        ) : null}
      </span>
    );
  }

}

function activeFilterTeamLabel(slide: BracketSlideView, selectedCountryFilter: string, language: SupportedLanguage) {
  const team =
    slide.currentMatches
      .flatMap((match) => [match.homeTeam, match.awayTeam, match.seededHomeTeam, match.seededAwayTeam])
      .find((candidate) => candidate?.id === selectedCountryFilter) ?? null;

  return team?.shortName ?? kt(language, "thisTeam");
}

function KnockoutMatchNumberBadge({ number, compact = false }: { number: number; compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-accent font-bold text-accent-text ${
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

function getStageDisplayName(stage: KnockoutBracketMatchView["stage"], language: SupportedLanguage) {
  switch (stage) {
    case "r32":
      return kt(language, "roundOf32");
    case "r16":
      return kt(language, "roundOf16");
    case "qf":
      return kt(language, "quarterfinals");
    case "sf":
      return kt(language, "semifinals");
    case "final":
      return kt(language, "final");
    case "third":
      return kt(language, "thirdPlace");
    default:
      return kt(language, "title");
  }
}

type MatchContextChip = {
  primary: string;
  secondary?: string | null;
};

function formatRoundOf32PlaceholderLabel(placeholderLabel: string | null, language: SupportedLanguage): MatchContextChip {
  if (!placeholderLabel) {
    return { primary: kt(language, "tbd") };
  }

  const normalized = placeholderLabel.replace(/\s+/g, " ").trim();
  const compactSourceMatch = normalized.match(/^([123])([A-L])$/i);
  if (compactSourceMatch) {
    const rankKey =
      compactSourceMatch[1] === "1"
        ? "groupWinnerRank"
        : compactSourceMatch[1] === "2"
          ? "groupRunnerUpRank"
          : "groupThirdRank";
    return {
      primary: kt(language, "groupSeedLabel", {
        groupName: compactSourceMatch[2].toUpperCase(),
        rank: kt(language, rankKey)
      })
    };
  }

  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return {
      primary: kt(language, "groupSeedLabel", {
        groupName: groupMatch[1].toUpperCase(),
        rank: groupMatch[2].toLowerCase() === "winner" ? kt(language, "groupWinnerRank") : kt(language, "groupRunnerUpRank")
      })
    };
  }

  const bestThirdFromMatch = normalized.match(/^Best\s+3(?:rd)?\s+from\s+([A-L](?:\/[A-L])*)$/i);
  if (bestThirdFromMatch) {
    return {
      primary: kt(language, "bestThirdFromGroups", { groups: bestThirdFromMatch[1].toUpperCase() })
    };
  }

  const stageLabel = getPlaceholderStageLabel(normalized, language);
  const matchNumber = getPlaceholderMatchNumber(normalized);
  if (stageLabel && matchNumber) {
    return {
      primary: stageLabel,
      secondary: kt(language, "winMatch", { matchNumber })
    };
  }

  const tbdGroupMatch = normalized.match(/^TBD(?:\s+from)?\s+Group\s+([A-Z])$/i);
  if (tbdGroupMatch) {
    return { primary: kt(language, "tbdGroup", { groupName: tbdGroupMatch[1].toUpperCase() }) };
  }

  return { primary: normalized };
}

function getPlaceholderStageLabel(label: string, language: SupportedLanguage) {
  if (/Round of 32/i.test(label) || /^Winner of R32/i.test(label)) {
    return kt(language, "roundOf32Short");
  }

  if (/Round of 16/i.test(label) || /^Winner of R16/i.test(label)) {
    return kt(language, "roundOf16Short");
  }

  if (/Quarter-?final/i.test(label) || /^Winner of QF/i.test(label)) {
    return kt(language, "quarterfinalsShort");
  }

  if (/Semi-?final/i.test(label) || /^Winner of SF/i.test(label)) {
    return kt(language, "semifinalsShort");
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

function ChampionCard({ champion }: { champion: BracketTeamOption | null }) {
  const language = useKnockoutLanguage();

  return (
    <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/80 bg-white/85 text-amber-700">
          <Trophy aria-hidden className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">{kt(language, "champion")}</p>
          <p className="mt-1 text-2xl font-extrabold text-gray-950">{champion?.name ?? kt(language, "chooseChampion")}</p>
          <p className="mt-1 text-sm font-semibold text-gray-600">{kt(language, "finalWinnerLandsHere")}</p>
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
    const matchupReady = Boolean(homeTeam && awayTeam);
    const currentHomeScore =
      draftScores?.homeScore ?? savedHomeScore ?? (matchupReady && !match.isLocked && match.status !== "final" ? 0 : null);
    const currentAwayScore =
      draftScores?.awayScore ?? savedAwayScore ?? (matchupReady && !match.isLocked && match.status !== "final" ? 0 : null);
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

function collectDescendantMatchIdsFromView(view: KnockoutBracketEditorView, rootMatchId: string) {
  const allMatches = [...view.stages.flatMap((stage) => stage.matches), ...(view.thirdPlace ? [view.thirdPlace] : [])];
  const descendants = new Set<string>();
  let frontier = [rootMatchId];

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const sourceMatchId of frontier) {
      for (const match of allMatches) {
        if (
          descendants.has(match.matchId) ||
          (match.homeSourceMatchId !== sourceMatchId && match.awaySourceMatchId !== sourceMatchId)
        ) {
          continue;
        }

        descendants.add(match.matchId);
        nextFrontier.push(match.matchId);
      }
    }
    frontier = nextFrontier;
  }

  return descendants;
}

function getLocalPredictedWinner(match: Pick<
  KnockoutBracketMatchView,
  "homeTeam" | "awayTeam" | "predictedHomeScore" | "predictedAwayScore" | "predictedWinnerTeamId"
>) {
  return resolveCurrentWinnerTeamId({
    homeTeamId: match.homeTeam?.id ?? null,
    awayTeamId: match.awayTeam?.id ?? null,
    homeScore: match.predictedHomeScore ?? 0,
    awayScore: match.predictedAwayScore ?? 0,
    explicitWinnerTeamId: match.predictedWinnerTeamId ?? null
  });
}

function requiresTieWinner(
  match: Pick<KnockoutBracketMatchView, "predictedHomeScore" | "predictedAwayScore" | "status" | "canSelectWinner" | "seededHomeTeam" | "seededAwayTeam" | "viewMode">
) {
  return (
    getKnockoutMatchShellState(match) === "open" &&
    (match.predictedHomeScore ?? 0) === (match.predictedAwayScore ?? 0)
  );
}

function canSavePrediction(
  match: Pick<
    KnockoutBracketMatchView,
    "predictedHomeScore" | "predictedAwayScore" | "status" | "canSelectWinner" | "seededHomeTeam" | "seededAwayTeam" | "viewMode"
  >,
  localWinnerTeamId: string | null
) {
  const hasScores =
    match.predictedHomeScore !== null &&
    match.predictedHomeScore !== undefined &&
    match.predictedAwayScore !== null &&
    match.predictedAwayScore !== undefined;

  if (!hasScores) {
    return false;
  }

  if (requiresTieWinner(match)) {
    return Boolean(localWinnerTeamId);
  }

  return true;
}

function isPredictionDirty(
  match: Pick<
    KnockoutBracketMatchView,
    "predictedHomeScore" | "predictedAwayScore" | "savedHomeScore" | "savedAwayScore" | "savedWinnerTeamId"
  >,
  localWinnerTeamId: string | null
) {
  return (
    (match.predictedHomeScore ?? 0) !== (match.savedHomeScore ?? 0) ||
    (match.predictedAwayScore ?? 0) !== (match.savedAwayScore ?? 0) ||
    localWinnerTeamId !== match.savedWinnerTeamId
  );
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

function ActualComparisonMatchCard({
  match,
  pendingOnly = false,
  showHeader = true
}: {
  match: KnockoutBracketMatchView;
  pendingOnly?: boolean;
  showHeader?: boolean;
}) {
  const language = useKnockoutLanguage();
  const matchNumber = getKnockoutMatchNumber(match.title);
  const actualHomeTeam = match.seededHomeTeam;
  const actualAwayTeam = match.seededAwayTeam;
  const actualWinnerTeamId = match.actualWinnerTeamId ?? null;
  const hasActualFinalScores = !pendingOnly && match.homeScore !== null && match.awayScore !== null;
  const statusLabel = pendingOnly
    ? kt(language, "pending")
    : match.status === "final"
      ? kt(language, "finalStatus")
      : actualHomeTeam && actualAwayTeam
        ? kt(language, "pending")
        : kt(language, "waiting");

  return (
    <div className="box-border w-full max-w-full overflow-hidden rounded-[1.15rem] border border-gray-200 bg-white p-2">
      {showHeader ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <div className="min-w-0">
            {matchNumber ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">{kt(language, "match")}</span>
                <KnockoutMatchNumberBadge number={matchNumber} compact />
              </div>
            ) : (
              <p className="text-xs font-bold text-gray-950">{match.title}</p>
            )}
          </div>
          <p className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {formatCompactKickoff(match.kickoffTime, language)}
          </p>
          <div className="min-w-0 justify-self-end">
            <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600">
              {statusLabel}
            </span>
          </div>
        </div>
      ) : null}

      <div className={`${showHeader ? "mt-1.5" : ""} relative px-2 py-1`}>
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1 left-1/2 top-1 -translate-x-1/2 border-l border-gray-200"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 overflow-hidden">
          <KnockoutTeamPanel
            team={actualHomeTeam}
            officialTeam={actualHomeTeam}
            placeholderLabel={match.homeSourceLabel}
            viewMode="official"
            status={match.status}
            isSelected={Boolean(actualHomeTeam?.id && actualWinnerTeamId === actualHomeTeam.id)}
            isCorrectSelection={null}
            slotComparisonState={null}
            isDisabled
            onClick={() => undefined}
            density="compact"
            side="left"
            isReadOnly
            canSelectByTap={false}
            predictedScore={!pendingOnly && match.status === "final" ? match.homeScore : null}
            onIncrement={() => undefined}
            onDecrement={() => undefined}
            showScoreArea={Boolean(actualHomeTeam && actualAwayTeam)}
          />
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-[8px] font-bold uppercase text-gray-400">
            {kt(language, "vs")}
          </span>
          <KnockoutTeamPanel
            team={actualAwayTeam}
            officialTeam={actualAwayTeam}
            placeholderLabel={match.awaySourceLabel}
            viewMode="official"
            status={match.status}
            isSelected={Boolean(actualAwayTeam?.id && actualWinnerTeamId === actualAwayTeam.id)}
            isCorrectSelection={null}
            slotComparisonState={null}
            isDisabled
            onClick={() => undefined}
            density="compact"
            side="right"
            isReadOnly
            canSelectByTap={false}
            predictedScore={!pendingOnly && match.status === "final" ? match.awayScore : null}
            onIncrement={() => undefined}
            onDecrement={() => undefined}
            showScoreArea={Boolean(actualHomeTeam && actualAwayTeam)}
          />
        </div>
      </div>

      {match.status === "final" && hasActualFinalScores ? (
        <div className="mt-1.5 border-t border-gray-300 px-2 pt-2 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            {kt(language, "actualResultFinalized")}
          </div>
        </div>
      ) : pendingOnly ? (
        <div className="mt-1.5 border-t border-gray-100 bg-gray-50/60 px-2 pt-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-500">
          {kt(language, "officialBracketPending")}
        </div>
      ) : actualHomeTeam && actualAwayTeam ? (
        <div className="mt-1.5 border-t border-gray-100 bg-gray-50/60 px-2 pt-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-500">
          {kt(language, "resultPending")}
        </div>
      ) : (
        <div className="mt-1.5 border-t border-gray-100 bg-gray-50/60 px-1 pt-2 text-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
          {kt(language, "officialBracketPending")}
        </div>
      )}
    </div>
  );
}

function ComparisonPlaceholderCard({
  tone,
  title,
  body
}: {
  tone: "projected" | "actual";
  title: string;
  body: string;
}) {
  return (
    <div
      className={`box-border w-full max-w-full rounded-[1.15rem] border p-4 ${
        tone === "projected"
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <p className={`text-sm font-bold uppercase tracking-wide ${tone === "projected" ? "text-amber-800" : "text-gray-700"}`}>
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-gray-500">{body}</p>
    </div>
  );
}

function formatCompactKickoff(kickoffTime: string, language: SupportedLanguage) {
  return formatDateTime(kickoffTime, language).replace(",", " ·");
}

function formatSavedTimestamp(savedAt: string | null, language: SupportedLanguage) {
  return savedAt ? formatDateTime(savedAt, language) : "";
}

function formatTeamToken(team: BracketTeamOption | null): MatchContextChip | null {
  if (!team) {
    return null;
  }

  return {
    primary: team.flagEmoji ? `${team.flagEmoji} ${team.shortName}` : team.shortName
  };
}

function buildMatchContextChips(match: KnockoutBracketMatchView, language: SupportedLanguage) {
  if (match.viewMode === "projected") {
    const projectedHomeSourceLabel = match.projectedHomeSourceLabel ?? match.homeSourceLabel;
    const projectedAwaySourceLabel = match.projectedAwaySourceLabel ?? match.awaySourceLabel;
    const projectedHomeSourceChip = projectedHomeSourceLabel
      ? formatRoundOf32PlaceholderLabel(projectedHomeSourceLabel, language)
      : null;
    const projectedAwaySourceChip = projectedAwaySourceLabel
      ? formatRoundOf32PlaceholderLabel(projectedAwaySourceLabel, language)
      : null;

    if (match.stage === "r32") {
      return {
        left: projectedHomeSourceChip,
        right: projectedAwaySourceChip
      };
    }

    const shouldHideProjectedReferences =
      match.status !== "final" &&
      Boolean(match.seededHomeTeam && match.seededAwayTeam);

    return {
      left: shouldHideProjectedReferences
        ? null
        : formatTeamToken(match.seededHomeTeam) ??
          projectedHomeSourceChip,
      right: shouldHideProjectedReferences
        ? null
        : formatTeamToken(match.seededAwayTeam) ??
          projectedAwaySourceChip
    };
  }

  return {
    left: null,
    right: null
  };
}

function buildBracketSlides(view: KnockoutBracketEditorView, language: SupportedLanguage): BracketSlideView[] {
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
      title: kt(language, "roundOf32"),
      eyebrow: kt(language, "openingRound"),
      subtitle: kt(language, "roundOf32Subtitle"),
      currentStage: "r32",
      currentMatches: r32?.matches ?? [],
      previousStage: null,
      previousLabel: null,
      previousMatches: [],
      nextStage: null,
      nextLabel: null,
      nextMatches: [],
      champion: null,
      thirdPlaceMatch: null,
      layout: "split"
    },
    {
      id: "r16",
      title: kt(language, "roundOf16"),
      eyebrow: kt(language, "centerFocus"),
      subtitle: kt(language, "roundOf16Subtitle"),
      currentStage: "r16",
      currentMatches: r16?.matches ?? [],
      previousStage: "r32",
      previousLabel: kt(language, "roundOf32"),
      previousMatches: r32?.matches ?? [],
      nextStage: "qf",
      nextLabel: kt(language, "quarterfinals"),
      nextMatches: qf?.matches ?? [],
      champion: null,
      thirdPlaceMatch: null,
      layout: "focus"
    },
    {
      id: "qf",
      title: kt(language, "quarterfinals"),
      eyebrow: kt(language, "tightenPath"),
      subtitle: kt(language, "quarterfinalsSubtitle"),
      currentStage: "qf",
      currentMatches: qf?.matches ?? [],
      previousStage: "r16",
      previousLabel: kt(language, "roundOf16"),
      previousMatches: r16?.matches ?? [],
      nextStage: "sf",
      nextLabel: kt(language, "semifinals"),
      nextMatches: sf?.matches ?? [],
      champion: null,
      thirdPlaceMatch: null,
      layout: "focus"
    },
    {
      id: "sf",
      title: kt(language, "semifinals"),
      eyebrow: kt(language, "nearTheSummit"),
      subtitle: kt(language, "semifinalsSubtitle"),
      currentStage: "sf",
      currentMatches: sf?.matches ?? [],
      previousStage: "qf",
      previousLabel: kt(language, "quarterfinals"),
      previousMatches: qf?.matches ?? [],
      nextStage: "final",
      nextLabel: kt(language, "final"),
      nextMatches: final?.matches ?? [],
      champion: null,
      thirdPlaceMatch: null,
      layout: "focus"
    },
    {
      id: "third",
      title: kt(language, "thirdPlace"),
      eyebrow: kt(language, "oneMorePodiumSpot"),
      subtitle: kt(language, "thirdPlaceSubtitle"),
      currentStage: "third",
      currentMatches: thirdStage?.matches ?? (view.thirdPlace ? [view.thirdPlace] : []),
      previousStage: "sf",
      previousLabel: kt(language, "semifinals"),
      previousMatches: sf?.matches ?? [],
      nextStage: "final",
      nextLabel: kt(language, "final"),
      nextMatches: final?.matches ?? [],
      champion: null,
      thirdPlaceMatch: null,
      layout: "focus"
    },
    {
      id: "final",
      title: kt(language, "finalAndChampion"),
      eyebrow: kt(language, "finishStrong"),
      subtitle: kt(language, "finalSubtitle"),
      currentStage: "final",
      currentMatches: final?.matches ?? [],
      previousStage: "sf",
      previousLabel: kt(language, "semifinals"),
      previousMatches: sf?.matches ?? [],
      nextStage: null,
      nextLabel: null,
      nextMatches: [],
      champion: view.champion,
      thirdPlaceMatch: null,
      layout: "finale"
    }
  ];

  return slides;
}
