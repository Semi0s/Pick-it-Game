"use client";

import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getPredictionStateLabel } from "@/lib/prediction-state";
import { getScoreLabel } from "@/lib/scoring";
import type { SocialPrediction } from "@/lib/social-predictions";
import type { MatchWithTeams } from "@/lib/types";

type SocialPredictionListProps = {
  match: MatchWithTeams;
  predictions: SocialPrediction[];
  currentUserId: string;
  currentUserPoints: number;
};

const COLLAPSED_COUNT = 4;

export function SocialPredictionList({ match, predictions, currentUserId, currentUserPoints }: SocialPredictionListProps) {
  const otherPredictions = predictions
    .filter((prediction) => prediction.userId !== currentUserId)
    .sort((left, right) => {
      const sharedGroupDifference = (right.sharedGroupCount ?? 0) - (left.sharedGroupCount ?? 0);
      if (sharedGroupDifference !== 0) {
        return sharedGroupDifference;
      }

      const leftPointDistance = Math.abs((left.user.totalPoints ?? 0) - currentUserPoints);
      const rightPointDistance = Math.abs((right.user.totalPoints ?? 0) - currentUserPoints);
      if (leftPointDistance !== rightPointDistance) {
        return leftPointDistance - rightPointDistance;
      }

      return left.user.name.localeCompare(right.user.name);
    });

  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-gray-900">
        <span className="flex items-center gap-2">
          <span>Group Picks</span>
          <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">
            {getPredictionStateLabel(match.status)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-bold text-gray-600">
          {otherPredictions.length} {otherPredictions.length === 1 ? "pick" : "picks"}
          <ChevronDown aria-hidden className="h-4 w-4" />
        </span>
      </summary>

      {otherPredictions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {otherPredictions.slice(0, COLLAPSED_COUNT).map((prediction) => (
            <PredictionRow key={prediction.id} match={match} prediction={prediction} />
          ))}
          {otherPredictions.length > COLLAPSED_COUNT ? (
            <p className="text-xs font-semibold text-gray-500">
              {otherPredictions.length - COLLAPSED_COUNT} more picks hidden for readability.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-gray-500">No one else has picked this match yet.</p>
      )}
    </details>
  );
}

type PredictionRowProps = {
  match: MatchWithTeams;
  prediction: SocialPrediction;
};

export function PredictionRow({ match, prediction }: PredictionRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-white px-3 py-2">
      <div className="min-w-0 flex items-center gap-3">
        <Avatar name={prediction.user.name} avatarUrl={prediction.user.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">{prediction.user.name}</p>
          <p className="text-xs font-semibold text-gray-500">{getOutcomeLabel(match, prediction)}</p>
        </div>
      </div>
      <span className="rounded-md bg-accent-light px-2 py-1 text-sm font-black text-accent-dark">
        {getScoreLabel(prediction.predictedHomeScore, prediction.predictedAwayScore)}
      </span>
    </div>
  );
}

export function getOutcomeLabel(match: MatchWithTeams, prediction: SocialPrediction) {
  if (prediction.predictedIsDraw) {
    return "Draw";
  }

  if (prediction.predictedWinnerTeamId === match.homeTeamId) {
    return `${match.homeTeam?.shortName ?? "Home"} wins`;
  }

  if (prediction.predictedWinnerTeamId === match.awayTeamId) {
    return `${match.awayTeam?.shortName ?? "Away"} wins`;
  }

  return "No outcome";
}
