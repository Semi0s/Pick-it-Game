"use client";

import { useEffect, useMemo, useState } from "react";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { getStoredPredictions, upsertStoredPrediction } from "@/lib/prediction-store";
import { isPredictionLocked } from "@/lib/scoring";
import { fetchPredictionsForMatches, type SocialPrediction } from "@/lib/social-predictions";
import { getMatchDateKey, tournamentCalendar, formatCalendarDate } from "@/lib/tournament-calendar";
import type { MatchWithTeams, Prediction, UserProfile } from "@/lib/types";
import { GroupPredictionCard } from "@/components/GroupPredictionCard";
import { MatchDateNavigator } from "@/components/MatchDateNavigator";
import { SocialPredictionList } from "@/components/SocialPredictionList";

type GroupPredictionsProps = {
  user: UserProfile;
};

const INITIAL_VISIBLE_MATCHES = 10;
const MATCHES_PER_PAGE = 10;

export function GroupPredictions({ user }: GroupPredictionsProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [socialPredictions, setSocialPredictions] = useState<SocialPrediction[]>([]);
  const [visibleMatchCount, setVisibleMatchCount] = useState(INITIAL_VISIBLE_MATCHES);
  const matches = useMemo<MatchWithTeams[]>(
    () =>
      getGroupMatches().map((match) => ({
        ...match,
        homeTeam: getTeam(match.homeTeamId),
        awayTeam: getTeam(match.awayTeamId)
      })),
    []
  );

  useEffect(() => {
    setPredictions(getStoredPredictions(user.id));
  }, [user.id]);

  useEffect(() => {
    let isMounted = true;
    const visibleMatchIds = matches.slice(0, visibleMatchCount).map((match) => match.id);

    fetchPredictionsForMatches(visibleMatchIds).then((items) => {
      if (isMounted) {
        setSocialPredictions(items);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [matches, visibleMatchCount]);

  const matchesByDate = matches.reduce<Record<string, MatchWithTeams[]>>((groups, match) => {
    const dateKey = getMatchDateKey(match.kickoffTime);
    groups[dateKey] = groups[dateKey] ?? [];
    groups[dateKey].push(match);
    return groups;
  }, {});
  const groupCalendarEntries = tournamentCalendar.filter((entry) => entry.stage === "group");
  const availableDateKeys = Object.keys(matchesByDate);
  const visibleMatches = matches.slice(0, visibleMatchCount);
  const visibleMatchIds = new Set(visibleMatches.map((match) => match.id));
  const remainingMatchCount = Math.max(matches.length - visibleMatches.length, 0);

  const savedCount = matches.filter((match) =>
    predictions.some((prediction) => prediction.matchId === match.id)
  ).length;

  function handleSave(prediction: Prediction) {
    upsertStoredPrediction(prediction);
    setPredictions(getStoredPredictions(user.id));
    fetchPredictionsForMatches(matches.slice(0, visibleMatchCount).map((match) => match.id)).then(
      setSocialPredictions
    );
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

      <MatchDateNavigator availableDateKeys={availableDateKeys} />

      {groupCalendarEntries.map((calendarEntry) => {
        const allDateMatches = matchesByDate[calendarEntry.date] ?? [];
        const dateMatches = allDateMatches.filter((match) => visibleMatchIds.has(match.id));

        if (dateMatches.length === 0) {
          return null;
        }

        return (
          <section
            key={calendarEntry.date}
            id={`match-date-${calendarEntry.date}`}
            className="scroll-mt-24 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">{formatCalendarDate(calendarEntry.date)}</h3>
                <p className="text-sm font-semibold text-gray-600">
                  Showing {dateMatches.length} of {allDateMatches.length} matches
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

      {remainingMatchCount > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-sm font-semibold text-gray-700">
            Showing {visibleMatches.length} of {matches.length} group-stage matches.
          </p>
          <button
            type="button"
            onClick={() => setVisibleMatchCount((count) => Math.min(count + MATCHES_PER_PAGE, matches.length))}
            className="mt-3 w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white sm:w-auto"
          >
            Load More Matches
          </button>
          <p className="mt-2 text-xs font-semibold text-gray-500">
            {remainingMatchCount} more {remainingMatchCount === 1 ? "match" : "matches"} available
          </p>
        </section>
      ) : (
        <p className="rounded-lg bg-gray-100 px-4 py-3 text-center text-sm font-semibold text-gray-700">
          All {matches.length} group-stage matches are showing.
        </p>
      )}
    </div>
  );
}
