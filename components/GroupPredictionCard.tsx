"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { formatDateTimeWithZone } from "@/lib/date-time";
import { canEditPrediction, getPredictionStateLabel } from "@/lib/prediction-state";
import type { MatchWithTeams, Prediction } from "@/lib/types";

type ScoreOutcome = "home" | "draw" | "away";

type GroupPredictionCardProps = {
  match: MatchWithTeams;
  matchNumber?: number;
  grouped?: boolean;
  prediction?: Prediction;
  userId: string;
  onSave: (prediction: Prediction) => Promise<Prediction>;
};

export function GroupPredictionCard({
  match,
  matchNumber,
  grouped = false,
  prediction,
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
  const scoreOutcome = getOutcomeFromScore(homeScore, awayScore);
  const hasUnsavedScoreChange =
    Boolean(prediction) &&
    (homeScore !== getInitialScore(prediction?.predictedHomeScore) ||
      awayScore !== getInitialScore(prediction?.predictedAwayScore));
  const canSubmitNewPrediction = Boolean(prediction) ? hasUnsavedScoreChange : true;
  const usePrimaryButton = !prediction || hasUnsavedScoreChange;
  const isSavedState = Boolean(lastSavedAt) && !hasUnsavedScoreChange && !isSaving && !saveError && canEdit;
  const matchLabel = matchNumber ? `Match ${matchNumber}` : "Match";

  useEffect(() => {
    setHomeScore(getInitialScore(prediction?.predictedHomeScore));
    setAwayScore(getInitialScore(prediction?.predictedAwayScore));
    setLastSavedAt(prediction?.updatedAt ?? null);
  }, [prediction]);

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
            : "border-gray-700 bg-gray-800"
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
                  isFinal ? "bg-gray-100 text-gray-900" : "bg-accent text-white"
                }`}
              >
                {matchNumber}
              </span>
            ) : null}
            <p className={`text-sm font-bold uppercase tracking-wide ${isFinal ? "text-gray-100" : "text-accent-dark"}`}>
              Pick before:
            </p>
            <p
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                isFinal ? "text-gray-300" : isLive ? "text-amber-800" : "text-gray-500"
              }`}
            >
              {formatKickoff(match.kickoffTime)}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
            isFinal
              ? "bg-gray-700 text-gray-100"
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
        <p className="mt-3 rounded-md bg-gray-700 px-3 py-2 text-sm font-semibold text-gray-100">
          This match is final. Your saved pick is locked and read-only.
        </p>
      ) : isLive ? (
        <p className="mt-3 rounded-md bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900">
          This match is locked while the result unfolds.
        </p>
      ) : null}

      <div className="mt-2">
        <div
          className={`relative rounded-md border px-3 py-3 ${
            isFinal
              ? "border-gray-600 bg-gray-700"
              : isLive
                ? "border-amber-200 bg-white"
                : "border-gray-200 bg-white"
          }`}
        >
          <span
            aria-hidden
            className={`pointer-events-none absolute bottom-0 left-1/2 top-0 -translate-x-1/2 border-l ${
              isFinal ? "border-gray-500" : isLive ? "border-amber-200" : "border-gray-200"
            }`}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <ScoreInput
            flag={match.homeTeam?.flagEmoji}
            fullName={match.homeTeam?.name ?? match.homeTeam?.shortName ?? "Home"}
            value={homeScore}
            disabled={locked}
            isFinal={isFinal}
            isLive={isLive}
            isHighlighted={scoreOutcome === "home" || scoreOutcome === "draw"}
            onChange={(value) => handleScoreChange(value, awayScore)}
          />
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-black uppercase ${
              isFinal
                ? "border-gray-500 bg-white text-gray-500"
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
            value={awayScore}
            disabled={locked}
            isFinal={isFinal}
            isLive={isLive}
            isHighlighted={scoreOutcome === "away" || scoreOutcome === "draw"}
            onChange={(value) => handleScoreChange(homeScore, value)}
          />
        </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canEdit || isSaving || !canSubmitNewPrediction}
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
              Adjust the scores to update prediction.
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {matchLabel} Saved {formatSavedAt(lastSavedAt!)}
            </span>
          </span>
        ) : (
          <>
            {!isSaving && !saveError && lastSavedAt && !hasUnsavedScoreChange ? <Check aria-hidden className="h-5 w-5" /> : null}
            {!canEdit
              ? "Predictions locked"
              : isSaving
                ? "Saving..."
                : saveError
                  ? "Failed to save"
                  : prediction
                    ? `Update ${matchLabel}`
                    : `Save ${matchLabel}`}
          </>
        )}
      </button>

      {isSaving || saveError || !canEdit ? (
        <div className="mt-3 min-h-[3rem]">
          {isSaving ? (
          <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
            Saving...
          </p>
        ) : saveError ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            Failed to save. {saveError}
          </p>
        ) : !canEdit ? (
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
    if (saveError) {
      setSaveError("");
    }
  }
}

type ScoreInputProps = {
  flag?: string;
  fullName: string;
  value: string;
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
  disabled,
  isFinal,
  isLive,
  isHighlighted,
  onChange
}: ScoreInputProps) {
  const badgeTone = isFinal
    ? "bg-gray-600 text-gray-100"
    : isLive
      ? "bg-gray-100 text-gray-700"
      : "bg-gray-100 text-gray-600";

  const teamCopy = (
    <span className="min-w-0 text-center">
      <span className={`inline-flex min-w-8 items-center justify-center rounded-sm px-1.5 py-0.5 text-lg leading-none ${badgeTone}`}>
        {flag}
      </span>
      <span
        className={`mt-1 block truncate text-sm font-semibold ${
          isFinal ? "text-gray-100" : isLive ? "text-gray-900" : "text-gray-900"
        }`}
      >
        {fullName}
      </span>
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
      className={`h-8 w-20 shrink-0 rounded-md border-2 bg-white px-0 text-center text-xl font-black leading-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:bg-gray-100 ${
        isFinal
          ? "border-gray-400 text-gray-950"
          : isLive
            ? isHighlighted
              ? "border-amber-400 text-amber-950"
              : "border-amber-300 text-gray-950"
            : isHighlighted
              ? "border-accent text-accent-dark"
              : "border-gray-300 text-gray-300"
      }`}
    />
  );

  return (
    <label className="flex flex-col items-center gap-2 text-center">
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
