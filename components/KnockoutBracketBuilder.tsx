"use client";

import { Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { saveBracketPredictionAction } from "@/app/knockout/actions";
import { showAppToast } from "@/lib/app-toast";
import type {
  BracketTeamOption,
  KnockoutBracketEditorView,
  KnockoutBracketMatchView,
  KnockoutBracketStageView
} from "@/lib/bracket-predictions";
import type { BracketPrediction } from "@/lib/types";

type KnockoutBracketBuilderProps = {
  initialView: KnockoutBracketEditorView;
};

export function KnockoutBracketBuilder({ initialView }: KnockoutBracketBuilderProps) {
  const [predictions, setPredictions] = useState<BracketPrediction[]>(initialView.predictions);
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const view = useMemo(
    () => deriveEditorView(initialView, predictions),
    [initialView, predictions]
  );
  const totalMatches = view.stages.reduce((sum, stage) => sum + stage.matches.length, 0) + (view.thirdPlace ? 1 : 0);
  const savedPickCount = predictions.length;

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

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
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Bracket</p>
            <h2 className="mt-2 text-2xl font-black leading-tight text-gray-950">Build your bracket.</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              Pick one winner per knockout match. Your choices advance automatically into the next round.
            </p>
          </div>
          <div className="space-y-2 text-right">
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
        </div>
        {!view.isLocked && view.firstRoundOf32Kickoff ? (
          <p className="mt-4 rounded-md border border-accent-light bg-accent-light/40 px-3 py-3 text-sm font-semibold text-accent-dark">
            Open until {formatKickoff(view.firstRoundOf32Kickoff)}.
          </p>
        ) : null}
        {view.isLocked ? (
          <p className="mt-4 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-700">
            Knockout picks are locked because the first knockout match has started.
          </p>
        ) : null}
        {message ? (
          <p
            className={`mt-4 rounded-md border px-3 py-3 text-sm font-semibold ${
              message.tone === "success"
                ? "border-accent-light bg-accent-light text-accent-dark"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </div>

      <div className="space-y-5">
        {view.stages.map((stage) => (
          <section key={stage.stage} className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-bold uppercase tracking-wide text-accent-dark">{stage.label}</p>
              <h3 className="mt-1 text-xl font-black text-gray-950">
                {getStageHeadline(stage)}
              </h3>
            </div>
            <div className="space-y-3">
              {stage.matches.map((match) => (
                <div key={match.matchId} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-gray-950">{match.title}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {formatKickoff(match.kickoffTime)}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-black ${
                        match.status === "final"
                          ? "bg-gray-100 text-gray-700"
                          : match.canSelectWinner
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {match.status === "final" ? "Final" : match.canSelectWinner ? "Ready" : "Waiting"}
                    </span>
                  </div>
                  {match.status === "final" ? (
                    <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-600">
                      {match.isCorrectWinner === true
                        ? `Correct +${match.awardedPoints}`
                        : match.isCorrectWinner === false
                          ? "Missed"
                          : "Awaiting score"}
                    </p>
                  ) : null}
                  <div className="mt-4 space-y-2">
                    {[match.homeTeam, match.awayTeam].map((team, index) => {
                      const teamId = team?.id ?? null;
                      const isSelected = Boolean(teamId && match.predictedWinnerTeamId === teamId);
                      const isDisabled = !teamId || !match.canSelectWinner || pendingMatchId === match.matchId;

                      return (
                        <button
                          key={`${match.matchId}-${index}`}
                          type="button"
                          onClick={() => {
                            if (!teamId) {
                              return;
                            }

                            void handleSelectWinner(match.matchId, teamId);
                          }}
                          disabled={isDisabled}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition ${
                            isSelected
                              ? "border-accent bg-accent-light"
                              : "border-gray-200 bg-gray-50 hover:border-accent-light hover:bg-white"
                          } disabled:cursor-not-allowed disabled:opacity-70`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-gray-950">
                              {team?.name ?? "Waiting on previous pick"}
                            </span>
                            <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {index === 0 ? "Home path" : "Away path"}
                            </span>
                          </span>
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-black ${
                              isSelected ? "bg-white text-accent-dark" : "bg-white text-gray-500"
                            }`}
                          >
                            {isSelected ? "Selected" : "Pick"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100 p-5 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-700">Champion</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
              <Trophy aria-hidden className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-950">
                {view.champion?.name ?? "Choose your champion"}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-600">
                Your final winner lives here.
              </p>
            </div>
          </div>
        </section>

        {view.thirdPlace ? (
          <section className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-bold uppercase tracking-wide text-accent-dark">Third Place</p>
              <h3 className="mt-1 text-xl font-black text-gray-950">Separate from the title path.</h3>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-gray-950">{view.thirdPlace.title}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {formatKickoff(view.thirdPlace.kickoffTime)}
                  </p>
                </div>
                <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-black text-gray-700">
                  {view.thirdPlace.status === "final" ? "Final" : view.thirdPlace.canSelectWinner ? "Ready" : "Waiting"}
                </span>
              </div>
              {view.thirdPlace.status === "final" ? (
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-600">
                  {view.thirdPlace.isCorrectWinner === true
                    ? `Correct +${view.thirdPlace.awardedPoints}`
                    : view.thirdPlace.isCorrectWinner === false
                      ? "Missed"
                      : "Awaiting score"}
                </p>
              ) : null}
              <div className="mt-4 space-y-2">
                {[view.thirdPlace.homeTeam, view.thirdPlace.awayTeam].map((team, index) => {
                  const teamId = team?.id ?? null;
                  const isSelected = Boolean(teamId && view.thirdPlace?.predictedWinnerTeamId === teamId);
                  const isDisabled = !teamId || !view.thirdPlace?.canSelectWinner || pendingMatchId === view.thirdPlace.matchId;

                  return (
                    <button
                      key={`${view.thirdPlace?.matchId}-${index}`}
                      type="button"
                      onClick={() => {
                        if (!teamId || !view.thirdPlace) {
                          return;
                        }

                        void handleSelectWinner(view.thirdPlace.matchId, teamId);
                      }}
                      disabled={isDisabled}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition ${
                        isSelected
                          ? "border-accent bg-accent-light"
                          : "border-gray-200 bg-gray-50 hover:border-accent-light hover:bg-white"
                      } disabled:cursor-not-allowed disabled:opacity-70`}
                    >
                      <span className="block truncate text-sm font-black text-gray-950">
                        {team?.name ?? "Waiting on previous pick"}
                      </span>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-black ${
                          isSelected ? "bg-white text-accent-dark" : "bg-white text-gray-500"
                        }`}
                      >
                        {isSelected ? "Selected" : "Pick"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );

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

function deriveEditorView(
  initialView: KnockoutBracketEditorView,
  predictions: BracketPrediction[]
): KnockoutBracketEditorView {
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

function getStageHeadline(stage: KnockoutBracketStageView) {
  switch (stage.stage) {
    case "r32":
      return "Start the knockout run.";
    case "r16":
      return "Shape the round that defines the path.";
    case "qf":
      return "Pick who reaches the last eight and beyond.";
    case "sf":
      return "Choose your finalists.";
    case "final":
      return "Set up your title match.";
    default:
      return stage.label;
  }
}

function formatKickoff(kickoffTime: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(kickoffTime));
}
