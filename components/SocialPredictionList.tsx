"use client";

import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getScoreLabel } from "@/lib/scoring";
import type { SocialPrediction } from "@/lib/social-predictions";
import { t } from "@/lib/strings";
import type { MatchWithTeams } from "@/lib/types";

type SocialPredictionListProps = {
  match: MatchWithTeams;
  predictions: SocialPrediction[];
  currentUserId: string;
  currentUserPoints: number;
  language?: string | null;
};

const COLLAPSED_COUNT = 4;

export function SocialPredictionList({ match, predictions, currentUserId, currentUserPoints, language }: SocialPredictionListProps) {
  const predictionStateLabel =
    match.status === "final"
      ? t(language, "bracket.unlocked")
      : match.status === "live"
        ? t(language, "common.live")
        : match.status === "locked"
          ? t(language, "common.locked")
          : t(language, "common.open");
  const otherPredictions = predictions
    .filter((prediction) => prediction.userId !== currentUserId)
    .sort((left, right) => {
      const pointsDifference = (right.pointsAwarded ?? 0) - (left.pointsAwarded ?? 0);
      if (pointsDifference !== 0) {
        return pointsDifference;
      }

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
    <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wide text-gray-900">
        <span className="flex items-center gap-2">
          <span>{t(language, "bracket.groupPicks")}</span>
          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
            {predictionStateLabel}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
          {t(language, "common.pickCount", { count: otherPredictions.length })}
          <ChevronDown aria-hidden className="h-4 w-4" />
        </span>
      </summary>

      {otherPredictions.length > 0 ? (
        <div className="mt-1.5 space-y-1">
          {otherPredictions.slice(0, COLLAPSED_COUNT).map((prediction) => (
            <PredictionRow key={prediction.id} prediction={prediction} />
          ))}
          {otherPredictions.length > COLLAPSED_COUNT ? (
            <p className="text-xs font-semibold text-gray-500">
              {t(language, "bracket.morePicksHidden", { count: otherPredictions.length - COLLAPSED_COUNT })}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-sm font-semibold text-gray-500">{t(language, "bracket.noOtherPicks")}</p>
      )}
    </details>
  );
}

type PredictionRowProps = {
  prediction: SocialPrediction;
};

export function PredictionRow({ prediction }: PredictionRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-white px-3 py-1">
      <div className="min-w-0 flex items-center gap-3">
        <Avatar name={prediction.user.name} avatarUrl={prediction.user.avatarUrl} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">{prediction.user.name}</p>
        </div>
      </div>
      <span className="rounded-md bg-accent-light px-2 py-1 text-sm font-black text-accent-dark">
        {getScoreLabel(prediction.predictedHomeScore, prediction.predictedAwayScore)}
      </span>
    </div>
  );
}
