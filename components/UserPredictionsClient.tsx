"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { ReportBlockDialog, type ReportTargetOption } from "@/components/ReportBlockDialog";
import { TrophyBadge } from "@/components/TrophyBadge";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { getPredictionStateLabel } from "@/lib/prediction-state";
import { getMatchDateKey, formatCalendarDate, tournamentCalendar } from "@/lib/tournament-calendar";
import { fetchLeaderboardUsers, fetchPredictionsForUser, fetchTrophiesForUser, type SocialPrediction } from "@/lib/social-predictions";
import type { MatchWithTeams, UserProfile, UserTrophy } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";
import { PredictionRow } from "@/components/SocialPredictionList";

type UserPredictionsClientProps = {
  userId: string;
};

export function UserPredictionsClient({ userId }: UserPredictionsClientProps) {
  const { user } = useCurrentUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [predictions, setPredictions] = useState<SocialPrediction[]>([]);
  const [trophies, setTrophies] = useState<UserTrophy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
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
  const reportTargets = useMemo<ReportTargetOption[]>(
    () => [
      {
        type: "user",
        id: userId,
        label: `Player: ${profile?.name ?? "Player"}`,
        canBlock: true
      }
    ],
    [profile?.name, userId]
  );
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

    Promise.all([fetchLeaderboardUsers(), fetchPredictionsForUser(userId), fetchTrophiesForUser(userId)])
      .then(([users, userPredictions, userTrophies]) => {
        if (isMounted) {
          setProfile(users.find((item) => item.id === userId) ?? userPredictions[0]?.user ?? null);
          setPredictions(userPredictions);
          setTrophies(userTrophies);
          setError(null);
          setIsLoading(false);
        }
      })
      .catch((caughtError: Error) => {
        if (isMounted) {
          setProfile(null);
          setPredictions([]);
          setTrophies([]);
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
      <section className="rounded-[1.15rem] bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Public picks</p>
        <div className="mt-2 flex items-center gap-3">
          <Avatar name={profile?.name ?? "Player"} avatarUrl={profile?.avatarUrl} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black leading-tight sm:text-2xl">{profile?.name ?? "Player picks"}</h2>
            {profile?.homeTeamId ? (
              <div className="mt-2">
                <HomeTeamBadge teamId={profile.homeTeamId} />
              </div>
            ) : null}
          </div>
        </div>
        {profile ? (
          <div className="mt-4">
            <Link
              href="/leaderboard"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 sm:w-auto"
            >
              Back to Leaderboard
            </Link>
            {user && user.id !== userId ? (
              <button
                type="button"
                onClick={() => setIsReportDialogOpen(true)}
                className="mt-3 block text-xs font-bold text-gray-500 underline-offset-2 transition hover:text-accent-dark hover:underline"
              >
                Report or block this player
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <ReportBlockDialog
        open={isReportDialogOpen}
        title="Report player"
        targets={reportTargets}
        initialTargetId={userId}
        onClose={() => setIsReportDialogOpen(false)}
      />

      {!isLoading && trophies.length > 0 ? (
        <section className="ui-card p-4">
          <h3 className="text-lg font-bold">Trophies</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {trophies.map((trophy) => (
              <div
                key={`${trophy.id}-${trophy.awardedAt}`}
                className="flex items-center gap-3 rounded-[1rem] bg-gray-100 px-3 py-3"
              >
                <TrophyBadge icon={trophy.icon} tier={trophy.tier} size="md" />
                <span className="truncate text-sm font-bold text-gray-800">{trophy.name}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <p className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">Loading picks...</p>
      ) : null}

      {!isLoading && error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-sm font-semibold text-red-700">
          Could not load public picks right now: {error}
        </p>
      ) : null}

      {!isLoading && !error && predictions.length === 0 ? (
        <p className="ui-card px-4 py-5 text-sm font-semibold text-gray-600">
          No public picks are available yet. Picks appear here once matches lock or go final.
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
                    <div key={prediction.id} className="ui-card-soft min-w-0 overflow-hidden p-3">
                      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-black text-gray-950">
                          <span className="native-flag-emoji inline-flex h-[1.2em] w-[1.45em] items-center justify-center overflow-hidden align-[-0.15em] leading-none">
                            <span aria-hidden className="block leading-none">{match.homeTeam?.flagEmoji}</span>
                          </span>{" "}
                          {match.homeTeam?.shortName} vs{" "}
                          <span className="native-flag-emoji inline-flex h-[1.2em] w-[1.45em] items-center justify-center overflow-hidden align-[-0.15em] leading-none">
                            <span aria-hidden className="block leading-none">{match.awayTeam?.flagEmoji}</span>
                          </span>{" "}
                          {match.awayTeam?.shortName}
                        </p>
                        <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">
                          {getPredictionStateLabel(match.status)}
                        </span>
                      </div>
                      <PredictionRow prediction={prediction} />
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
