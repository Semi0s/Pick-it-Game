"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { fetchPlayerPredictions, savePlayerPrediction } from "@/lib/player-predictions";
import { canEditPrediction } from "@/lib/prediction-state";
import { getStoredPredictions } from "@/lib/prediction-store";
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
  const searchParams = useSearchParams();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [socialPredictions, setSocialPredictions] = useState<SocialPrediction[]>([]);
  const [matches, setMatches] = useState<MatchWithTeams[]>(() => getLocalGroupMatches());
  const [stageFilter, setStageFilter] = useState<"all" | MatchStage>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [teamSearch, setTeamSearch] = useState("");
  const [matchWindowStart, setMatchWindowStart] = useState(0);
  const [pendingScrollMatchId, setPendingScrollMatchId] = useState<string | null>(null);
  const matchCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
    const normalizedTeamSearch = teamSearch.trim().toLowerCase();
    const filteredMatchIds = matches
      .filter((match) => (stageFilter === "all" || match.stage === stageFilter))
      .filter((match) => dateFilter === "all" || getMatchDateKey(match.kickoffTime) === dateFilter)
      .filter((match) => matchesTeamSearch(match, normalizedTeamSearch))
      .sort(sortMatchesByKickoff)
      .map((match) => match.id);

    fetchPredictionsForMatches(filteredMatchIds).then((items) => {
      if (isMounted) {
        setSocialPredictions(items);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [matches, stageFilter, dateFilter, teamSearch]);

  const dateOptions = useMemo(
    () => Array.from(new Set(matches.map((match) => getMatchDateKey(match.kickoffTime)))).sort(),
    [matches]
  );
  const normalizedTeamSearch = teamSearch.trim().toLowerCase();
  const filteredMatches = useMemo(
    () =>
      matches
        .filter((match) => {
          const stageMatches = stageFilter === "all" || match.stage === stageFilter;
          const dateMatches = dateFilter === "all" || getMatchDateKey(match.kickoffTime) === dateFilter;
          const teamMatches = matchesTeamSearch(match, normalizedTeamSearch);
          return stageMatches && dateMatches && teamMatches;
        })
        .sort(sortMatchesByKickoff),
    [matches, normalizedTeamSearch, stageFilter, dateFilter]
  );
  const filterSignature = `${stageFilter}|${dateFilter}|${normalizedTeamSearch}`;
  useEffect(() => {
    setMatchWindowStart(getDefaultWindowStart(filteredMatches));
  }, [filteredMatches, filterSignature]);

  useEffect(() => {
    setMatchWindowStart((current) => Math.max(0, Math.min(current, Math.max(filteredMatches.length - 10, 0))));
  }, [filteredMatches.length]);

  const visibleMatches = filteredMatches.slice(matchWindowStart, matchWindowStart + 10);
  const hasEarlierMatches = matchWindowStart > 0;
  const hasLaterMatches = matchWindowStart + visibleMatches.length < filteredMatches.length;
  const filteredMatchesByDate = visibleMatches.reduce<Record<string, MatchWithTeams[]>>((groups, match) => {
    const dateKey = getMatchDateKey(match.kickoffTime);
    groups[dateKey] = groups[dateKey] ?? [];
    groups[dateKey].push(match);
    return groups;
  }, {});
  const filteredDates = Object.keys(filteredMatchesByDate).sort();

  const savedCount = matches.filter((match) => predictions.some((prediction) => prediction.matchId === match.id)).length;
  const nextPredictionMatchId = useMemo(() => {
    const savedMatchIds = new Set(predictions.map((prediction) => prediction.matchId));
    const nextUnsavedOpenMatch = matches.find(
      (match) => canEditPrediction(match.status) && !savedMatchIds.has(match.id)
    );

    if (nextUnsavedOpenMatch) {
      return nextUnsavedOpenMatch.id;
    }

    return matches.find((match) => canEditPrediction(match.status))?.id ?? null;
  }, [matches, predictions]);

  const jumpToMatch = useCallback(
    (matchId: string) => {
      setStageFilter("all");
      setDateFilter("all");
      setTeamSearch("");
      setMatchWindowStart(getWindowStartForMatch([...matches].sort(sortMatchesByKickoff), matchId));
      setPendingScrollMatchId(matchId);
    },
    [matches]
  );

  useEffect(() => {
    if (searchParams.get("focus") === "next" && nextPredictionMatchId) {
      jumpToMatch(nextPredictionMatchId);
    }
  }, [jumpToMatch, nextPredictionMatchId, searchParams]);

  useEffect(() => {
    if (!pendingScrollMatchId) {
      return;
    }

    const targetNode = matchCardRefs.current[pendingScrollMatchId];
    if (!targetNode) {
      return;
    }

    targetNode.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScrollMatchId(null);
  }, [visibleMatches, pendingScrollMatchId]);

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
    return savedPrediction;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Play</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Pick every match.</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Choose the winner or call the draw. Exact scores are optional now, and picks stay open only while a match is
          scheduled.
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700">
            {savedCount} of {matches.length} picks saved
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {nextPredictionMatchId ? (
              <button
                type="button"
                onClick={() => jumpToMatch(nextPredictionMatchId)}
                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
              >
                Your Next Pick
              </button>
            ) : null}
            <Link
              href="/trophies"
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
            >
              <Trophy aria-hidden className="h-4 w-4 text-accent-dark" />
              Trophies
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 lg:grid-cols-3">
        <label>
          <span className="text-sm font-bold text-gray-700">Find a team</span>
          <input
            value={teamSearch}
            onChange={(event) => setTeamSearch(event.target.value)}
            placeholder="Search by team name or code"
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          />
        </label>
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
        Showing {visibleMatches.length} of {filteredMatches.length} matches
        {filteredMatches.length !== matches.length ? ` (${matches.length} total in the schedule)` : ""}.
      </p>

      {filteredMatches.length > 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-gray-900">
                Matches {matchWindowStart + 1}-{matchWindowStart + visibleMatches.length}
              </p>
              <p className="text-xs font-semibold text-gray-500">
                Starting {formatDateLabel(getMatchDateKey(visibleMatches[0].kickoffTime))}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMatchWindowStart((current) => Math.max(0, current - 10))}
                disabled={!hasEarlierMatches}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                Earlier
              </button>
              <button
                type="button"
                onClick={() => setMatchWindowStart((current) => Math.min(Math.max(filteredMatches.length - 10, 0), current + 10))}
                disabled={!hasLaterMatches}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                Later
              </button>
            </div>
          </div>
        </section>
      ) : null}

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
              {dateMatches.length > 1 ? (
                <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">
                  {dateMatches.filter((match) => canEditPrediction(match.status)).length} open
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              {dateMatches.map((match) => (
                <div
                  key={match.id}
                  className="space-y-2"
                  ref={(node) => {
                    matchCardRefs.current[match.id] = node;
                  }}
                >
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

function getTodayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function getDefaultWindowStart(matches: MatchWithTeams[]) {
  if (matches.length <= 10) {
    return 0;
  }

  const todayKey = getTodayDateKey();
  const nextMatchIndex = matches.findIndex((match) => getMatchDateKey(match.kickoffTime) >= todayKey);

  if (nextMatchIndex >= 0) {
    return nextMatchIndex;
  }

  return Math.max(matches.length - 10, 0);
}

function getWindowStartForMatch(matches: MatchWithTeams[], matchId: string) {
  const targetIndex = matches.findIndex((match) => match.id === matchId);
  return targetIndex >= 0 ? targetIndex : getDefaultWindowStart(matches);
}

function sortMatchesByKickoff(a: MatchWithTeams, b: MatchWithTeams) {
  return a.kickoffTime.localeCompare(b.kickoffTime);
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

function matchesTeamSearch(match: MatchWithTeams, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  const searchableValues = [
    match.homeTeam?.name,
    match.homeTeam?.shortName,
    match.awayTeam?.name,
    match.awayTeam?.shortName
  ]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());

  return searchableValues.some((value) => value.includes(normalizedQuery));
}
