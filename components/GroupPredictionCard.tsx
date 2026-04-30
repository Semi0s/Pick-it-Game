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
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {matchNumber ? (
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
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

      <div className="mt-4">
        <div
          className={`rounded-md border px-3 py-3 ${
            isFinal
              ? "border-gray-600 bg-gray-700"
              : isLive
                ? "border-amber-200 bg-white"
                : "border-gray-200 bg-white"
          }`}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          <ScoreInput
            flag={match.homeTeam?.flagEmoji}
            shortName={match.homeTeam?.shortName ?? "Home"}
            fullName={match.homeTeam?.name ?? match.homeTeam?.shortName ?? "Home"}
            value={homeScore}
            disabled={locked}
            isFinal={isFinal}
            isLive={isLive}
            isHighlighted={scoreOutcome === "home" || scoreOutcome === "draw"}
            onChange={(value) => handleScoreChange(value, awayScore)}
          />
          <span className={`text-sm font-black ${isFinal ? "text-gray-300" : isLive ? "text-amber-700" : "text-gray-400"}`}>
            vs.
          </span>
          <ScoreInput
            flag={match.awayTeam?.flagEmoji}
            shortName={match.awayTeam?.shortName ?? "Away"}
            fullName={match.awayTeam?.name ?? match.awayTeam?.shortName ?? "Away"}
            align="right"
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
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-3 text-base font-bold transition disabled:cursor-not-allowed ${
          usePrimaryButton
            ? "border-accent bg-accent text-white hover:border-accent-dark hover:bg-accent-dark"
            : isSavedState
              ? "border-gray-200 bg-transparent text-gray-700 hover:border-gray-300 hover:bg-gray-100 disabled:border-gray-200 disabled:bg-transparent disabled:text-gray-700"
              : "border-gray-300 bg-gray-300 text-gray-600 disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
        }`}
      >
        {!isSaving && !saveError && lastSavedAt && !hasUnsavedScoreChange ? <Check aria-hidden className="h-5 w-5" /> : null}
        {!canEdit
          ? "Predictions locked"
          : isSaving
            ? "Saving..."
            : saveError
              ? "Failed to save"
              : lastSavedAt && !hasUnsavedScoreChange
              ? "Saved"
              : prediction
                ? "Update pick"
                : "Save pick"}
      </button>

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
      ) : lastSavedAt && !hasUnsavedScoreChange ? (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-700">
          Saved · Last saved {formatSavedAt(lastSavedAt)}
        </p>
      ) : !canSubmitNewPrediction ? (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
          Adjust a score to update this pick.
        </p>
      ) : null}
      </div>
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
  shortName: string;
  fullName: string;
  align?: "left" | "right";
  value: string;
  disabled: boolean;
  isFinal?: boolean;
  isLive?: boolean;
  isHighlighted: boolean;
  onChange: (value: string) => void;
};

function ScoreInput({
  flag,
  shortName,
  fullName,
  align = "left",
  value,
  disabled,
  isFinal,
  isLive,
  isHighlighted,
  onChange
}: ScoreInputProps) {
  const teamCopy = (
    <span className={`min-w-0 flex-1 ${align === "right" ? "text-right" : ""}`}>
      <span
        className={`block truncate text-sm font-black ${
          isFinal ? "text-gray-100" : isHighlighted ? "text-accent-dark" : isLive ? "text-amber-900" : "text-gray-700"
        }`}
      >
        {flag} {shortName}
      </span>
      <span
        className={`block truncate text-[10px] font-semibold uppercase tracking-wide ${
          isFinal ? "text-gray-300" : isHighlighted ? "text-accent-dark" : isLive ? "text-amber-800" : "text-gray-500"
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
      className={`h-12 w-16 shrink-0 rounded-md border bg-white px-2 text-center text-xl font-black outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:bg-gray-100 ${
        isFinal
          ? "border-gray-400 text-gray-950"
          : isLive
            ? isHighlighted
              ? "border-amber-400 text-amber-950"
              : "border-amber-300 text-gray-950"
            : isHighlighted
              ? "border-accent text-accent-dark"
              : "border-gray-300 text-gray-950"
      }`}
    />
  );

  return (
    <label className={`flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
      {align === "right" ? (
        <>
          {scoreInput}
          {teamCopy}
        </>
      ) : (
        <>
          {teamCopy}
          {scoreInput}
        </>
      )}
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
