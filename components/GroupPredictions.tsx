"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Globe, Network, SquareCheckBig, Trophy } from "lucide-react";
import { showAppToast } from "@/lib/app-toast";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import {
  getExplainerLanguageForUser,
  normalizeExplainerLanguage,
  PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY,
  type ExplainerLanguage
} from "@/lib/i18n";
import { fetchPlayerPredictions, savePlayerPrediction } from "@/lib/player-predictions";
import { formatMatchStage } from "@/lib/match-stage";
import { canEditPrediction } from "@/lib/prediction-state";
import { getStoredPredictions } from "@/lib/prediction-store";
import { fetchPredictionsForMatches, type SocialPrediction } from "@/lib/social-predictions";
import { getMatchDateKey } from "@/lib/tournament-calendar";
import type { MatchStage, MatchWithTeams, Prediction, UserProfile } from "@/lib/types";
import { GroupPredictionCard } from "@/components/GroupPredictionCard";
import { SocialPredictionList } from "@/components/SocialPredictionList";

type GroupPredictionsProps = {
  user: UserProfile;
  initialMatches?: MatchWithTeams[];
  initialPredictions?: Prediction[];
  initialKnockoutSeeded?: boolean;
};

const stages: ("all" | MatchStage)[] = ["all", "group"];
const EXPLAINER_LANGUAGES = ["en", "es", "fr", "pt", "de"] as const;

const EXPLAINER_LANGUAGE_LABELS: Record<ExplainerLanguage, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  de: "Deutsch"
};

const EXPLAINER_TITLE_COPY: Record<ExplainerLanguage, string> = {
  en: "Pick every match.",
  es: "Elige tus partidos.",
  fr: "Choisissez chaque match.",
  pt: "Escolha cada partida.",
  de: "Tippe jedes Spiel."
};

const EXPLAINER_COPY: Record<ExplainerLanguage, string[]> = {
  en: [
    "Submit your score predictions at any time before kickoff.",
    "Matches remain open for entries until the game starts.",
    "After kickoff all player picks become public."
  ],
  es: [
    "Envía tus pronósticos en cualquier momento antes del pitazo inicial.",
    "Las predicciones se cierran al comenzar el partido.",
    "Una vez iniciado el encuentro, las predicciones de todos los jugadores serán públicas."
  ],
  fr: [
    "Soumettez vos pronostics de score à tout moment avant le coup d'envoi.",
    "Les matchs restent ouverts aux pronostics jusqu'au début du match.",
    "Après le coup d'envoi, tous les pronostics des joueurs deviennent publics."
  ],
  pt: [
    "Envie seus palpites de placar a qualquer momento antes do início.",
    "As partidas permanecem abertas para palpites até o começo do jogo.",
    "Após o início, todos os palpites dos jogadores se tornam públicos."
  ],
  de: [
    "Gib deine Ergebnistipps jederzeit vor dem Anpfiff ab.",
    "Spiele bleiben bis zum Anstoß für Tipps geöffnet.",
    "Nach dem Anpfiff werden alle Tipps der Spieler öffentlich."
  ]
};

export function GroupPredictions({
  user,
  initialMatches,
  initialPredictions,
  initialKnockoutSeeded
}: GroupPredictionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [predictions, setPredictions] = useState<Prediction[]>(initialPredictions ?? []);
  const [socialPredictions, setSocialPredictions] = useState<SocialPrediction[]>([]);
  const [matches, setMatches] = useState<MatchWithTeams[]>(() => initialMatches ?? getLocalGroupMatches());
  const [stageFilter, setStageFilter] = useState<"all" | MatchStage>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [teamSearch, setTeamSearch] = useState("");
  const [matchWindowStart, setMatchWindowStart] = useState(0);
  const [pendingScrollMatchId, setPendingScrollMatchId] = useState<string | null>(null);
  const [isKnockoutSeeded, setIsKnockoutSeeded] = useState(initialKnockoutSeeded ?? false);
  const [explainerLanguage, setExplainerLanguage] = useState<ExplainerLanguage>(() => {
    if (typeof window !== "undefined") {
      try {
        const storedValue = window.localStorage.getItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY);
        if (storedValue) {
          return normalizeExplainerLanguage(storedValue);
        }
      } catch (error) {
        console.warn("Could not restore play explainer language.", error);
      }
    }

    return getExplainerLanguageForUser(user);
  });
  const [isExplainerLanguageMenuOpen, setIsExplainerLanguageMenuOpen] = useState(false);
  const matchCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, explainerLanguage);
    } catch (error) {
      console.warn("Could not persist play explainer language.", error);
    }
  }, [explainerLanguage]);

  useEffect(() => {
    if (initialMatches) {
      return;
    }

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
  }, [initialMatches]);

  useEffect(() => {
    if (initialPredictions) {
      return;
    }

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
  }, [initialPredictions, user.id]);

  useEffect(() => {
    if (initialKnockoutSeeded !== undefined) {
      return;
    }

    let isMounted = true;

    fetch("/api/knockout/status", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { ok: boolean; isSeeded?: boolean };
        if (!response.ok || !result.ok) {
          throw new Error("Could not load knockout status.");
        }

        if (isMounted) {
          setIsKnockoutSeeded(Boolean(result.isSeeded));
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsKnockoutSeeded(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialKnockoutSeeded]);

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
  const hasCompletedAllPicks = matches.length > 0 && savedCount >= matches.length;
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
  const shouldPromoteKnockout = !nextPredictionMatchId;
  const shouldShowSecondaryKnockoutButton = !shouldPromoteKnockout;
  const primaryActionLabel = nextPredictionMatchId
    ? "My Next Pick"
    : isKnockoutSeeded
      ? "My Knockout Picks"
      : "My Results";

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

  function handlePrimaryAction() {
    if (nextPredictionMatchId) {
      jumpToMatch(nextPredictionMatchId);
      return;
    }

    if (isKnockoutSeeded) {
      router.push("/knockout");
      return;
    }

    router.push("/leaderboard");
    showAppToast({
      tone: "success",
      text: "Group picks are complete. Knockout picks will open once the bracket is seeded."
    });
  }

  const renderMatchPager = () =>
    filteredMatches.length > 0 ? (
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
              onClick={() =>
                setMatchWindowStart((current) => Math.min(Math.max(filteredMatches.length - 10, 0), current + 10))
              }
              disabled={!hasLaterMatches}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Later
            </button>
          </div>
        </div>
      </section>
    ) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-gray-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Play</p>
          <div className="flex shrink-0 items-start gap-2">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsExplainerLanguageMenuOpen((current) => !current)}
                className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light sm:px-3 sm:py-2"
                aria-haspopup="menu"
                aria-expanded={isExplainerLanguageMenuOpen}
                aria-label={`Translate title and explainer text. Current language: ${EXPLAINER_LANGUAGE_LABELS[explainerLanguage]}`}
              >
                <Globe aria-hidden className="h-3.5 w-3.5 text-accent-dark" />
                <span>{explainerLanguage.toUpperCase()}</span>
                <ChevronDown aria-hidden className="h-3.5 w-3.5 text-gray-500" />
              </button>
              {isExplainerLanguageMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 min-w-40 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                  {EXPLAINER_LANGUAGES.map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => {
                        setExplainerLanguage(language);
                        setIsExplainerLanguageMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                        language === explainerLanguage
                          ? "bg-accent-light text-accent-dark"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                      role="menuitem"
                    >
                      <span>{EXPLAINER_LANGUAGE_LABELS[language]}</span>
                      <span className="text-xs font-black uppercase">{language}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 ${
                hasCompletedAllPicks ? "bg-amber-50 text-amber-800" : "bg-white text-gray-700"
              }`}
            >
              {savedCount} of {matches.length} picks saved
            </div>
          </div>
        </div>
        <div className="mt-3">
          <h2 className="text-3xl font-black leading-tight">{EXPLAINER_TITLE_COPY[explainerLanguage]}</h2>
          <div className="mt-3">
            <ul className="min-w-0 space-y-1 text-sm font-semibold leading-6 text-gray-600">
              {EXPLAINER_COPY[explainerLanguage].map((line) => (
                <li key={line}>&bull; {line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center justify-start gap-1.5 sm:gap-2">
            {nextPredictionMatchId ? (
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light sm:gap-2 sm:px-3 sm:text-sm"
              >
                {shouldPromoteKnockout ? (
                  isKnockoutSeeded ? (
                    <Network aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark sm:h-4 sm:w-4" />
                  ) : (
                    <SquareCheckBig aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark sm:h-4 sm:w-4" />
                  )
                ) : (
                  <SquareCheckBig aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark sm:h-4 sm:w-4" />
                )}
                {primaryActionLabel}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light sm:gap-2 sm:px-3 sm:text-sm"
              >
                {shouldPromoteKnockout ? (
                  isKnockoutSeeded ? (
                    <Network aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark sm:h-4 sm:w-4" />
                  ) : (
                    <SquareCheckBig aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark sm:h-4 sm:w-4" />
                  )
                ) : (
                  <SquareCheckBig aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark sm:h-4 sm:w-4" />
                )}
                {primaryActionLabel}
              </button>
            )}
            {shouldShowSecondaryKnockoutButton ? (
              <Link
                href="/knockout"
                className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light sm:gap-2 sm:px-3 sm:text-sm"
              >
                <Network aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-dark sm:h-4 sm:w-4" />
                My Knockout Picks
              </Link>
            ) : null}
            <Link
              href="/trophies"
              className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-300 bg-white px-2.5 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light sm:gap-2 sm:px-3 sm:text-sm"
            >
              <span className="relative inline-flex h-4.5 w-4.5 items-center justify-center text-accent-dark sm:h-5 sm:w-5">
                <Trophy aria-hidden className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <SquareCheckBig aria-hidden className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-[2px] bg-white" />
              </span>
              My Side Picks
            </Link>
          </div>
        </div>
        <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 lg:grid-cols-3">
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
          </div>
        </div>
        <p className="mt-4 text-sm font-semibold text-gray-600">
          Showing {visibleMatches.length} of {filteredMatches.length} matches
          {filteredMatches.length !== matches.length ? ` (${matches.length} total in the schedule)` : ""}.
        </p>
      </section>

      {renderMatchPager()}

      {filteredDates.map((date) => {
        const dateMatches = filteredMatchesByDate[date] ?? [];

        return (
          <section key={date} className="space-y-3">
            <div>
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
                  {match.status !== "scheduled" ? (
                    <SocialPredictionList
                      match={match}
                      predictions={socialPredictions.filter((item) => item.matchId === match.id)}
                      currentUserId={user.id}
                    />
                  ) : null}
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

      {renderMatchPager()}
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
  return formatMatchStage(stage);
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
