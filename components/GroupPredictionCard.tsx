"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { formatDateTimeWithZone } from "@/lib/date-time";
import { canEditPrediction, getPredictionStateLabel } from "@/lib/prediction-state";
import type { AutoPickDraft, MatchWithTeams, Prediction } from "@/lib/types";

type ScoreOutcome = "home" | "draw" | "away";

type GroupPredictionCardProps = {
  match: MatchWithTeams;
  matchNumber?: number;
  grouped?: boolean;
  prediction?: Prediction;
  prefillSuggestion?: AutoPickDraft;
  autoPickHint?: {
    sourceText: string;
    probabilityText?: string;
  };
  highlightHomeTeamId?: string | null;
  onDraftStateChange?: (
    matchId: string,
    draft: {
      homeScore: number;
      awayScore: number;
      shouldCount: boolean;
    }
  ) => void;
  userId: string;
  onSave: (prediction: Prediction) => Promise<Prediction>;
};

export function GroupPredictionCard({
  match,
  matchNumber,
  grouped = false,
  prediction,
  prefillSuggestion,
  autoPickHint,
  highlightHomeTeamId,
  onDraftStateChange,
  userId,
  onSave
}: GroupPredictionCardProps) {
  const canEdit = canEditPrediction(match.status);
  const locked = !canEdit;
  const isFinal = match.status === "final";
  const isLive = match.status === "live";
  const predictionStateLabel = getPredictionStateLabel(match.status);
  const [homeScore, setHomeScore] = useState(getInitialScore(prediction?.predictedHomeScore));
  const [awayScore, setAwayScore] = useState(getInitialScore(prediction?.predictedAwayScore));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(prediction?.updatedAt ?? null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [hasDraftActivity, setHasDraftActivity] = useState(Boolean(prediction));
  const autofillIntervalIdsRef = useRef<number[]>([]);
  const autofillTimeoutIdsRef = useRef<number[]>([]);
  const homeScoreRef = useRef(homeScore);
  const awayScoreRef = useRef(awayScore);
  const scoreOutcome = getOutcomeFromScore(homeScore, awayScore);
  const hasUnsavedScoreChange =
    Boolean(prediction) &&
    (homeScore !== getInitialScore(prediction?.predictedHomeScore) ||
      awayScore !== getInitialScore(prediction?.predictedAwayScore));
  const canSubmitNewPrediction = Boolean(prediction) ? hasUnsavedScoreChange : true;
  const usePrimaryButton = !prediction || hasUnsavedScoreChange;
  const isSavedState = Boolean(lastSavedAt) && !hasUnsavedScoreChange && !isSaving && !saveError && canEdit;
  const matchLabel = matchNumber ? `Match ${matchNumber}` : "Match";
  const matchIncludesHomeTeam = Boolean(
    highlightHomeTeamId && (match.homeTeamId === highlightHomeTeamId || match.awayTeamId === highlightHomeTeamId)
  );
  const displayedHomeScore = isFinal ? getInitialScore(match.homeScore) : homeScore;
  const displayedAwayScore = isFinal ? getInitialScore(match.awayScore) : awayScore;
  useEffect(() => {
    setHomeScore(getInitialScore(prediction?.predictedHomeScore));
    setAwayScore(getInitialScore(prediction?.predictedAwayScore));
    setLastSavedAt(prediction?.updatedAt ?? null);
    setHasDraftActivity(Boolean(prediction));
  }, [prediction]);

  useEffect(() => {
    homeScoreRef.current = homeScore;
  }, [homeScore]);

  useEffect(() => {
    awayScoreRef.current = awayScore;
  }, [awayScore]);

  useEffect(() => {
    const intervalIds = autofillIntervalIdsRef.current;
    const timeoutIds = autofillTimeoutIdsRef.current;

    return () => {
      clearAutofillAnimation(intervalIds, timeoutIds);
    };
  }, []);

  useEffect(() => {
    if (!prefillSuggestion || prefillSuggestion.matchId !== match.id || !canEdit) {
      return;
    }

    clearAutofillAnimation(autofillIntervalIdsRef.current, autofillTimeoutIdsRef.current);
    setSaveError("");
    setIsAutoFilling(true);
    setHasDraftActivity(true);

    const homeAnimationDurationMs = 720;
    const awayAnimationDurationMs = 860;
    const awayDelayMs = 80;

    animateScoreRoll({
      delayMs: 0,
      durationMs: homeAnimationDurationMs,
      startScore: toNumericScore(homeScoreRef.current),
      finalScore: prefillSuggestion.homeScore,
      setScore: setHomeScore,
      intervalIds: autofillIntervalIdsRef.current,
      timeoutIds: autofillTimeoutIdsRef.current
    });

    animateScoreRoll({
      delayMs: awayDelayMs,
      durationMs: awayAnimationDurationMs,
      startScore: toNumericScore(awayScoreRef.current),
      finalScore: prefillSuggestion.awayScore,
      setScore: setAwayScore,
      intervalIds: autofillIntervalIdsRef.current,
      timeoutIds: autofillTimeoutIdsRef.current
    });

    const finishTimeoutId = window.setTimeout(() => {
      setIsAutoFilling(false);
    }, awayDelayMs + awayAnimationDurationMs + 40);
    autofillTimeoutIdsRef.current.push(finishTimeoutId);
  }, [canEdit, match.id, prefillSuggestion]);

  useEffect(() => {
    if (!onDraftStateChange) {
      return;
    }

    onDraftStateChange(match.id, {
      homeScore: toNumericScore(homeScore),
      awayScore: toNumericScore(awayScore),
      shouldCount: Boolean(prediction) || hasDraftActivity
    });
  }, [awayScore, hasDraftActivity, homeScore, match.id, onDraftStateChange, prediction]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (locked || isSaving || !canSubmitNewPrediction) {
      if (locked) {
        setSaveError("Predictions locked.");
      } else if (!canSubmitNewPrediction) {
        setSaveError("Adjust a score before saving again.");
      }
      return;
    }

    const predictedWinnerTeamId =
      scoreOutcome === "home" ? match.homeTeamId : scoreOutcome === "away" ? match.awayTeamId : undefined;

    setIsSaving(true);
    setSaveError("");

    try {
      const savedPrediction = await onSave({
        id: prediction?.id ?? `${userId}-${match.id}`,
        userId,
        matchId: match.id,
        predictedWinnerTeamId,
        predictedIsDraw: scoreOutcome === "draw",
        predictedHomeScore: homeScore === "" ? undefined : Number(homeScore),
        predictedAwayScore: awayScore === "" ? undefined : Number(awayScore),
        pointsAwarded: prediction?.pointsAwarded ?? 0
      });
      setLastSavedAt(savedPrediction.updatedAt ?? new Date().toISOString());
    } catch (error) {
      console.error("Failed to save pick.", { matchId: match.id, userId, error });
      setSaveError(error instanceof Error ? error.message : "Could not save this pick. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`${grouped ? "p-0" : "rounded-lg border p-4 shadow-sm"} ${
        isFinal
          ? grouped
            ? "bg-transparent"
            : "border-gray-200 bg-gray-100"
          : isLive
            ? grouped
              ? "bg-transparent"
              : "border-amber-200 bg-amber-50"
            : grouped
              ? "bg-transparent"
              : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-h-11 flex items-center">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {matchNumber ? (
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-black ${
                  isFinal
                    ? "bg-gray-200 text-gray-900"
                    : isSavedState
                      ? "bg-accent-light text-accent-dark"
                      : "bg-accent text-white"
                }`}
              >
                {matchNumber}
              </span>
            ) : null}
            {!isSavedState && canEdit ? (
              <p className={`text-sm font-bold uppercase tracking-wide ${isFinal ? "text-gray-700" : "text-accent-dark"}`}>
                Pick before:
              </p>
            ) : null}
            <p
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                isFinal ? "text-gray-500" : isLive ? "text-amber-800" : "text-gray-500"
              }`}
            >
              {formatKickoff(match.kickoffTime)}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
            isFinal
              ? "bg-white text-gray-700"
              : isLive
                ? "bg-amber-100 text-amber-800"
                : locked
                  ? "bg-gray-200 text-gray-700"
                  : "bg-accent-light text-accent-dark"
          }`}
        >
          {locked ? <LockKeyhole aria-hidden className="h-3.5 w-3.5" /> : null}
          {predictionStateLabel}
        </span>
      </div>

      {isFinal ? (
        <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700">
          This match has concluded and results are final.
        </p>
      ) : isLive ? (
        <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
          This match is locked while the result unfolds.
        </p>
      ) : null}

      <div className="mt-2">
        <div
          className={`relative rounded-md border px-3 py-1.5 ${
            isFinal
              ? "border-gray-200 bg-gray-100"
              : isLive
                ? "border-amber-200 bg-white"
                : matchIncludesHomeTeam
                  ? "border-gray-200 bg-amber-50"
                  : "border-gray-200 bg-white"
          }`}
        >
          <span
            aria-hidden
            className={`pointer-events-none absolute bottom-0 left-1/2 top-0 -translate-x-1/2 border-l ${
              isFinal ? "border-gray-300" : isLive ? "border-amber-200" : "border-gray-200"
            }`}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-2 py-1">
          <ScoreInput
            flag={match.homeTeam?.flagEmoji}
            fullName={match.homeTeam?.name ?? match.homeTeam?.shortName ?? "Home"}
            value={displayedHomeScore}
            disabled={locked || isAutoFilling}
            isFinal={isFinal}
            isLive={isLive}
            isHighlighted={scoreOutcome === "home" || scoreOutcome === "draw"}
            predictionValue={
              isFinal && prediction?.predictedHomeScore !== undefined
                ? String(prediction.predictedHomeScore)
                : null
            }
            onChange={(value) => handleScoreChange(value, awayScore)}
          />
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-black uppercase ${
              isFinal
                ? "border-gray-300 bg-white text-gray-500"
                : isLive
                  ? "border-amber-200 bg-white text-amber-700"
                  : "border-gray-200 bg-white text-gray-400"
            }`}
          >
            vs
          </span>
          <ScoreInput
            flag={match.awayTeam?.flagEmoji}
            fullName={match.awayTeam?.name ?? match.awayTeam?.shortName ?? "Away"}
            value={displayedAwayScore}
            disabled={locked || isAutoFilling}
            isFinal={isFinal}
            isLive={isLive}
            isHighlighted={scoreOutcome === "away" || scoreOutcome === "draw"}
            predictionValue={
              isFinal && prediction?.predictedAwayScore !== undefined
                ? String(prediction.predictedAwayScore)
                : null
            }
            onChange={(value) => handleScoreChange(homeScore, value)}
          />
        </div>
        </div>
      </div>

      {isFinal ? (
        <div className="mt-1.5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-center">
          {!prediction ? (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              No saved prediction before kick-off
            </p>
          ) : null}
          {lastSavedAt ? (
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Saved {formatSavedAt(lastSavedAt)}
            </p>
          ) : null}
        </div>
      ) : isLive ? (
        lastSavedAt ? (
          <div className="mt-1.5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Saved {formatSavedAt(lastSavedAt)}
            </p>
          </div>
        ) : null
      ) : (
        <button
          type="submit"
          disabled={!canEdit || isSaving || isAutoFilling || !canSubmitNewPrediction}
          className={`mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-3 font-bold transition disabled:cursor-not-allowed ${
            usePrimaryButton
              ? "border-accent bg-accent text-sm text-white hover:border-accent-dark hover:bg-accent-dark"
              : isSavedState
                ? "border-gray-200 bg-transparent text-gray-500 hover:border-gray-300 hover:bg-gray-100 disabled:border-gray-200 disabled:bg-transparent disabled:text-gray-500"
                : "border-gray-300 bg-gray-300 text-sm text-gray-600 disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
          }`}
        >
          {isSavedState ? (
            <span className="flex flex-col items-center justify-center leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Predictions lock at kick-off
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Saved {formatSavedAt(lastSavedAt!)}
              </span>
            </span>
          ) : (
            <>
              {!isSaving && !saveError && lastSavedAt && !hasUnsavedScoreChange ? <Check aria-hidden className="h-5 w-5" /> : null}
              {!canEdit
                ? "Predictions locked"
                : isSaving
                  ? "Saving..."
                  : isAutoFilling
                    ? "Auto Picking..."
                  : saveError
                    ? "Failed to save"
                    : prediction
                      ? `Update ${matchLabel}`
                      : `Save ${matchLabel}`}
            </>
          )}
        </button>
      )}

      {prefillSuggestion && autoPickHint ? (
        <p className="mt-1 text-center text-[10px] font-semibold leading-tight tracking-wide text-gray-500">
          <span>{autoPickHint.sourceText}</span>
          {autoPickHint.probabilityText ? <span className="block mt-0.5">{autoPickHint.probabilityText}</span> : null}
        </p>
      ) : null}

      {isSaving || saveError || (!canEdit && !isLive && !isFinal) ? (
        <div className="mt-3 min-h-[3rem]">
          {isSaving ? (
          <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
            Saving...
          </p>
        ) : saveError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            Failed to save. {saveError}
          </p>
        ) : !canEdit && !isLive && !isFinal ? (
          <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
            Predictions locked.
          </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );

  function handleScoreChange(nextHomeScore: string, nextAwayScore: string) {
    setHomeScore(normalizeScore(nextHomeScore));
    setAwayScore(normalizeScore(nextAwayScore));
    setHasDraftActivity(true);
    if (saveError) {
      setSaveError("");
    }
  }
}

type ScoreInputProps = {
  flag?: string;
  fullName: string;
  value: string;
  predictionValue?: string | null;
  disabled: boolean;
  isFinal?: boolean;
  isLive?: boolean;
  isHighlighted: boolean;
  onChange: (value: string) => void;
};

function ScoreInput({
  flag,
  fullName,
  value,
  predictionValue,
  disabled,
  isFinal,
  isLive,
  isHighlighted,
  onChange
}: ScoreInputProps) {
  const badgeTone = isFinal
    ? "bg-white text-gray-600"
    : isLive
      ? "bg-gray-100 text-gray-700"
      : "bg-gray-100 text-gray-600";

  const teamCopy = (
    <span className="min-w-0 px-2 py-1 text-center">
      <span className={`inline-flex min-w-8 items-center justify-center rounded-sm px-1.5 py-0.5 text-lg leading-none ${badgeTone}`}>
        {flag}
      </span>
      <span
        className={`mt-1 block truncate text-sm font-semibold ${
          isFinal ? "text-gray-800" : isLive ? "text-gray-900" : "text-gray-900"
        }`}
      >
        {fullName}
      </span>
      {isFinal && predictionValue !== null && predictionValue !== undefined ? (
        <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-gray-500">
          Yours: {predictionValue}
        </span>
      ) : null}
    </span>
  );

  const scoreInput = (
    <input
      type="number"
      min={0}
      inputMode="numeric"
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value === "" ? "0" : event.target.value)}
      className={`h-8 w-20 shrink-0 rounded-md border-[3px] bg-white px-0 text-center text-xl font-black leading-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:border-accent focus:ring-2 focus:ring-accent-light ${
        isFinal
          ? "border-white bg-white text-gray-900 disabled:bg-white"
          : isLive
            ? isHighlighted
              ? "border-amber-400 text-amber-950 disabled:bg-gray-100"
              : "border-amber-300 text-gray-950 disabled:bg-gray-100"
            : isHighlighted
              ? "border-accent text-accent-dark disabled:bg-gray-100"
              : "border-gray-300 text-gray-300 disabled:bg-gray-100"
      }`}
    />
  );

  return (
    <label className="flex flex-col items-center gap-1 rounded-md p-1 text-center">
      {scoreInput}
      {teamCopy}
    </label>
  );
}

function getInitialScore(score?: number) {
  return score === undefined ? "0" : score.toString();
}

function normalizeScore(score: string) {
  if (score === "") {
    return "0";
  }

  return String(Math.max(0, Number(score)));
}

function getOutcomeFromScore(homeScore: string, awayScore: string): ScoreOutcome {
  const homeValue = Number(homeScore);
  const awayValue = Number(awayScore);

  if (homeValue > awayValue) {
    return "home";
  }

  if (awayValue > homeValue) {
    return "away";
  }

  return "draw";
}

function formatKickoff(value: string) {
  return formatDateTimeWithZone(value);
}

function formatSavedAt(value: string) {
  return formatDateTimeWithZone(value);
}

function animateScoreRoll({
  delayMs,
  durationMs,
  startScore,
  finalScore,
  setScore,
  intervalIds,
  timeoutIds
}: {
  delayMs: number;
  durationMs: number;
  startScore: number;
  finalScore: number;
  setScore: (value: string) => void;
  intervalIds: number[];
  timeoutIds: number[];
}) {
  const kickoffTimeoutId = window.setTimeout(() => {
    let currentValue = Math.max(0, startScore) % 10;
    setScore(String(currentValue));

    const intervalId = window.setInterval(() => {
      currentValue = (currentValue + 1 + Math.floor(Math.random() * 2)) % 10;
      setScore(String(currentValue));
    }, 70);
    intervalIds.push(intervalId);

    const settleTimeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setScore(String(Math.max(0, finalScore)));
    }, durationMs);
    timeoutIds.push(settleTimeoutId);
  }, delayMs);

  timeoutIds.push(kickoffTimeoutId);
}

function clearAutofillAnimation(intervalIds: number[], timeoutIds: number[]) {
  intervalIds.forEach((intervalId) => window.clearInterval(intervalId));
  intervalIds.length = 0;
  timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  timeoutIds.length = 0;
}

function toNumericScore(value: string) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}
