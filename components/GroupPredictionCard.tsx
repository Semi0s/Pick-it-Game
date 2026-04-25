"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { isPredictionLocked } from "@/lib/scoring";
import type { MatchWithTeams, Prediction } from "@/lib/types";

type ScoreOutcome = "home" | "draw" | "away";

type GroupPredictionCardProps = {
  match: MatchWithTeams;
  prediction?: Prediction;
  userId: string;
  onSave: (prediction: Prediction) => Promise<void>;
};

export function GroupPredictionCard({ match, prediction, userId, onSave }: GroupPredictionCardProps) {
  const locked = isPredictionLocked(match);
  const isFinal = match.status === "final";
  const [homeScore, setHomeScore] = useState(getInitialScore(prediction?.predictedHomeScore));
  const [awayScore, setAwayScore] = useState(getInitialScore(prediction?.predictedAwayScore));
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const scoreOutcome = getOutcomeFromScore(homeScore, awayScore);
  const outcomeLabel = getOutcomeLabel(scoreOutcome, match);
  const hasUnsavedScoreChange =
    Boolean(prediction) &&
    (homeScore !== getInitialScore(prediction?.predictedHomeScore) ||
      awayScore !== getInitialScore(prediction?.predictedAwayScore));
  const usePrimaryButton = !prediction || hasUnsavedScoreChange;

  useEffect(() => {
    setHomeScore(getInitialScore(prediction?.predictedHomeScore));
    setAwayScore(getInitialScore(prediction?.predictedAwayScore));
  }, [prediction]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (locked || isSaving) {
      return;
    }

    const predictedWinnerTeamId =
      scoreOutcome === "home" ? match.homeTeamId : scoreOutcome === "away" ? match.awayTeamId : undefined;

    setIsSaving(true);
    setSaveError("");

    try {
      await onSave({
        id: prediction?.id ?? `${userId}-${match.id}`,
        userId,
        matchId: match.id,
        predictedWinnerTeamId,
        predictedIsDraw: scoreOutcome === "draw",
        predictedHomeScore: homeScore === "" ? undefined : Number(homeScore),
        predictedAwayScore: awayScore === "" ? undefined : Number(awayScore),
        pointsAwarded: prediction?.pointsAwarded ?? 0
      });

      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this pick. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-lg border p-4 shadow-sm ${
        isFinal ? "border-gray-300 bg-gray-100" : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Pick a score before:</p>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {formatKickoff(match.kickoffTime)}
            </p>
          </div>
          <h4 className="mt-1 text-lg font-black text-gray-950">
            {match.homeTeam?.flagEmoji} {match.homeTeam?.name ?? match.homeTeam?.shortName} vs {match.awayTeam?.flagEmoji}{" "}
            {match.awayTeam?.name ?? match.awayTeam?.shortName}
          </h4>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
            locked ? "bg-gray-200 text-gray-700" : "bg-accent-light text-accent-dark"
          }`}
        >
          {locked ? <LockKeyhole aria-hidden className="h-3.5 w-3.5" /> : null}
          {isFinal ? "Final" : locked ? "Locked" : "Open"}
        </span>
      </div>

      {isFinal ? (
        <p className="mt-3 rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
          This match is final. Your saved pick is locked and read-only.
        </p>
      ) : null}

      <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Score prediction</p>
          <span className="rounded-md bg-accent-light px-2 py-1 text-xs font-bold text-accent-dark">
            {outcomeLabel}
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <ScoreInput
            flag={match.homeTeam?.flagEmoji}
            shortName={match.homeTeam?.shortName ?? "Home"}
            value={homeScore}
            disabled={locked}
            isHighlighted={scoreOutcome === "home" || scoreOutcome === "draw"}
            onChange={(value) => handleScoreChange(value, awayScore)}
          />
          <span className="text-sm font-black text-gray-400">vs.</span>
          <ScoreInput
            flag={match.awayTeam?.flagEmoji}
            shortName={match.awayTeam?.shortName ?? "Away"}
            value={awayScore}
            disabled={locked}
            isHighlighted={scoreOutcome === "away" || scoreOutcome === "draw"}
            onChange={(value) => handleScoreChange(homeScore, value)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={locked || isSaving}
        className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-bold disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 ${
          usePrimaryButton ? "bg-accent text-white" : "bg-accent-light text-accent-dark"
        }`}
      >
        {saved ? <Check aria-hidden className="h-5 w-5" /> : null}
        {isFinal ? "Final - pick locked" : isSaving ? "Saving..." : saved ? "Saved" : prediction ? "Update pick" : "Save pick"}
      </button>

      {saveError ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {saveError}
        </p>
      ) : null}
    </form>
  );

  function handleScoreChange(nextHomeScore: string, nextAwayScore: string) {
    setHomeScore(normalizeScore(nextHomeScore));
    setAwayScore(normalizeScore(nextAwayScore));
  }
}

type ScoreInputProps = {
  flag?: string;
  shortName: string;
  value: string;
  disabled: boolean;
  isHighlighted: boolean;
  onChange: (value: string) => void;
};

function ScoreInput({ flag, shortName, value, disabled, isHighlighted, onChange }: ScoreInputProps) {
  return (
    <label
      className={`flex items-center gap-2 rounded-md border px-2 py-2 ${
        isHighlighted ? "border-accent bg-white" : "border-gray-200 bg-white"
      }`}
    >
      <span
        className={`min-w-0 truncate text-sm font-black ${
          isHighlighted ? "text-accent-dark" : "text-gray-700"
        }`}
      >
        {flag} {shortName}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value === "" ? "0" : event.target.value)}
        className={`ml-auto h-12 w-16 rounded-md border bg-white px-2 text-center text-xl font-black outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:bg-gray-100 ${
          isHighlighted ? "border-accent text-accent-dark" : "border-gray-300 text-gray-950"
        }`}
      />
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

function getOutcomeLabel(outcome: ScoreOutcome, match: MatchWithTeams) {
  if (outcome === "draw") {
    return "Draw";
  }

  if (outcome === "home") {
    return `${match.homeTeam?.shortName ?? "Home"} wins`;
  }

  return `${match.awayTeam?.shortName ?? "Away"} wins`;
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
