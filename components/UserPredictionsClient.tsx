"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { getMatchDateKey, formatCalendarDate, tournamentCalendar } from "@/lib/tournament-calendar";
import { fetchLeaderboardUsers, fetchPredictionsForUser, type SocialPrediction } from "@/lib/social-predictions";
import type { MatchWithTeams, UserProfile } from "@/lib/types";
import { PredictionRow } from "@/components/SocialPredictionList";

type UserPredictionsClientProps = {
  userId: string;
};

export function UserPredictionsClient({ userId }: UserPredictionsClientProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [predictions, setPredictions] = useState<SocialPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const matches = useMemo<MatchWithTeams[]>(
    () =>
      getGroupMatches().map((match) => ({
        ...match,
        homeTeam: getTeam(match.homeTeamId),
        awayTeam: getTeam(match.awayTeamId)
      })),
    []
  );
  const matchMap = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);
  const predictionsByDate = predictions.reduce<Record<string, SocialPrediction[]>>((groups, prediction) => {
    const match = matchMap.get(prediction.matchId);
    if (!match) {
      return groups;
    }

    const dateKey = getMatchDateKey(match.kickoffTime);
    groups[dateKey] = groups[dateKey] ?? [];
    groups[dateKey].push(prediction);
    return groups;
  }, {});

  useEffect(() => {
    let isMounted = true;

    Promise.all([fetchLeaderboardUsers(), fetchPredictionsForUser(userId)])
      .then(([users, userPredictions]) => {
        if (isMounted) {
          setProfile(users.find((item) => item.id === userId) ?? userPredictions[0]?.user ?? null);
          setPredictions(userPredictions);
          setError(null);
          setIsLoading(false);
        }
      })
      .catch((caughtError: Error) => {
        if (isMounted) {
          setProfile(null);
          setPredictions([]);
          setError(caughtError.message);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Public picks</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">{profile?.name ?? "Player picks"}</h2>
        <Link
          href="/leaderboard"
          className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 sm:w-auto"
        >
          Back to Leaderboard
        </Link>
      </section>

      {isLoading ? (
        <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">Loading picks...</p>
      ) : null}

      {!isLoading && error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-sm font-semibold text-red-700">
          Could not load public picks right now: {error}
        </p>
      ) : null}

      {!isLoading && !error && predictions.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-5 text-sm font-semibold text-gray-600">
          No public picks are available yet. Picks appear here once matches are live or final.
        </p>
      ) : null}

      {tournamentCalendar
        .filter((entry) => entry.stage === "group")
        .map((entry) => {
          const datePredictions = predictionsByDate[entry.date] ?? [];
          if (datePredictions.length === 0) {
            return null;
          }

          return (
            <section key={entry.date} className="space-y-3">
              <div>
                <h3 className="text-xl font-black">{formatCalendarDate(entry.date)}</h3>
                <p className="text-sm font-semibold text-gray-600">{datePredictions.length} picks</p>
              </div>
              <div className="space-y-2">
                {datePredictions.map((prediction) => {
                  const match = matchMap.get(prediction.matchId);
                  if (!match) {
                    return null;
                  }

                  return (
                    <div key={prediction.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-2 text-sm font-black text-gray-950">
                        {match.homeTeam?.flagEmoji} {match.homeTeam?.shortName} vs {match.awayTeam?.flagEmoji}{" "}
                        {match.awayTeam?.shortName}
                      </p>
                      <PredictionRow match={match} prediction={prediction} />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
    </div>
  );
}
