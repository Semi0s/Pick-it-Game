"use client";

import { useEffect, useState } from "react";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { fetchPlayerPredictions, savePlayerPrediction } from "@/lib/player-predictions";
import { getStoredPredictions } from "@/lib/prediction-store";
import { isPredictionLocked } from "@/lib/scoring";
import { fetchPredictionsForMatches, type SocialPrediction } from "@/lib/social-predictions";
import { getMatchDateKey } from "@/lib/tournament-calendar";
import type { MatchStage, MatchWithTeams, Prediction, UserProfile } from "@/lib/types";
import { GroupPredictionCard } from "@/components/GroupPredictionCard";
import { SocialPredictionList } from "@/components/SocialPredictionList";

type GroupPredictionsProps = {
  user: UserProfile;
};

const stages: ("all" | MatchStage)[] = ["all", "group"];

export function GroupPredictions({ user }: GroupPredictionsProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [socialPredictions, setSocialPredictions] = useState<SocialPrediction[]>([]);
  const [matches, setMatches] = useState<MatchWithTeams[]>(() => getLocalGroupMatches());
  const [stageFilter, setStageFilter] = useState<"all" | MatchStage>("all");
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    let isMounted = true;
    fetchGroupMatchesForPredictions()
      .then((items) => {
        if (isMounted) {
          setMatches(items);
        }
      })
      .catch(() => {
        if (isMounted) {
          setMatches(getLocalGroupMatches());
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    setPredictions(getStoredPredictions(user.id));

    fetchPlayerPredictions(user.id)
      .then((items) => {
        if (isMounted) {
          setPredictions(items);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPredictions(getStoredPredictions(user.id));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user.id]);

  useEffect(() => {
    let isMounted = true;
    const filteredMatchIds = matches
      .filter((match) => (stageFilter === "all" || match.stage === stageFilter))
      .filter((match) => dateFilter === "all" || getMatchDateKey(match.kickoffTime) === dateFilter)
      .map((match) => match.id);

    fetchPredictionsForMatches(filteredMatchIds).then((items) => {
      if (isMounted) {
        setSocialPredictions(items);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [matches, stageFilter, dateFilter]);

  const dateOptions = Array.from(new Set(matches.map((match) => getMatchDateKey(match.kickoffTime))));
  const filteredMatches = matches.filter((match) => {
    const stageMatches = stageFilter === "all" || match.stage === stageFilter;
    const dateMatches = dateFilter === "all" || getMatchDateKey(match.kickoffTime) === dateFilter;
    return stageMatches && dateMatches;
  });
  const filteredMatchesByDate = filteredMatches.reduce<Record<string, MatchWithTeams[]>>((groups, match) => {
    const dateKey = getMatchDateKey(match.kickoffTime);
    groups[dateKey] = groups[dateKey] ?? [];
    groups[dateKey].push(match);
    return groups;
  }, {});
  const filteredDates = Object.keys(filteredMatchesByDate).sort();

  const savedCount = matches.filter((match) =>
    predictions.some((prediction) => prediction.matchId === match.id)
  ).length;

  async function handleSave(prediction: Prediction) {
    const savedPrediction = await savePlayerPrediction(prediction);
    setPredictions((currentPredictions) => {
      const existingIndex = currentPredictions.findIndex(
        (item) => item.userId === savedPrediction.userId && item.matchId === savedPrediction.matchId
      );

      if (existingIndex < 0) {
        return [...currentPredictions, savedPrediction];
      }

      return currentPredictions.map((item, index) => (index === existingIndex ? savedPrediction : item));
    });
    fetchPredictionsForMatches(filteredMatches.map((match) => match.id)).then(setSocialPredictions);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Group stage</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Pick every match.</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Choose the winner or call the draw. Exact scores are optional now, but they will matter once scoring
          goes live.
        </p>
        <div className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700">
          {savedCount} of {matches.length} picks saved
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-bold text-gray-700">Stage</span>
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as "all" | MatchStage)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base"
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage === "all" ? "All stages" : formatStage(stage)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-bold text-gray-700">Date</span>
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base"
          >
            <option value="all">All dates</option>
            {dateOptions.map((date) => (
              <option key={date} value={date}>
                {formatDateLabel(date)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <p className="rounded-lg bg-gray-100 px-4 py-3 text-center text-sm font-semibold text-gray-700">
        Showing {filteredMatches.length} of {matches.length} group-stage matches.
      </p>

      {filteredDates.map((date) => {
        const dateMatches = filteredMatchesByDate[date] ?? [];

        return (
          <section key={date} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">{formatDateLabel(date)}</h3>
                <p className="text-sm font-semibold text-gray-600">
                  {dateMatches.length} match{dateMatches.length === 1 ? "" : "es"}
                </p>
              </div>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">
                {dateMatches.filter((match) => !isPredictionLocked(match)).length} open
              </span>
            </div>

            <div className="space-y-3">
              {dateMatches.map((match) => (
                <div key={match.id} className="space-y-2">
                  <GroupPredictionCard
                    match={match}
                    prediction={predictions.find((item) => item.matchId === match.id)}
                    userId={user.id}
                    onSave={handleSave}
                  />
                  <SocialPredictionList
                    match={match}
                    predictions={socialPredictions.filter((item) => item.matchId === match.id)}
                    currentUserId={user.id}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {filteredMatches.length === 0 ? (
        <p className="rounded-lg bg-gray-100 px-4 py-3 text-center text-sm font-semibold text-gray-700">
          No matches found for the current filters.
        </p>
      ) : null}
    </div>
  );
}

function formatStage(stage: MatchStage) {
  return stage
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00Z`));
}
