"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Network, Sparkles, SquareCheckBig, Trophy } from "lucide-react";
import { showAppToast } from "@/lib/app-toast";
import { InlineDisclosureButton, WindowChoiceRail, useSessionDisclosureState, useSessionJsonState } from "@/components/player-management/Shared";
import { buildAutoPickDraft } from "@/lib/auto-pick";
import { fetchNextAutoPick, fetchNextAutoPickForMatches, restoreStoredAutoPickDraft } from "@/lib/auto-pick-client";
import { formatDateTimeWithZone } from "@/lib/date-time";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { clearGroupsEntryIntent, readGroupsEntryIntent, type GroupsEntryIntent } from "@/lib/groups-entry-intent";
import {
  getExplainerLanguageForUser,
  normalizeExplainerLanguage,
  PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY,
  type ExplainerLanguage
} from "@/lib/i18n";
import { fetchPlayerPredictions, savePlayerPrediction } from "@/lib/player-predictions";
import { canEditPrediction } from "@/lib/prediction-state";
import { getStoredPredictions } from "@/lib/prediction-store";
import { fetchPredictionsForMatches, type SocialPrediction } from "@/lib/social-predictions";
import {
  buildPredictedGroupStandings,
  formatGroupName,
  getGroupShortLabel,
  normalizeGroupKey,
  resolvePreferredStandingsGroupSelection
} from "@/lib/group-standings";
import { buildQualifiedTeamSeeds } from "@/lib/knockout-seeding";
import { getMatchDateKey } from "@/lib/tournament-calendar";
import type { AutoPickDraft, MatchWithTeams, Prediction, Team, UserProfile } from "@/lib/types";
import { GroupPredictionCard } from "@/components/GroupPredictionCard";
import {
  GroupStandingsMiniTable,
  type MiniGroupStandingsRow
} from "@/components/GroupStandingsMiniTable";
import { DismissibleHelperText } from "@/components/DismissibleHelperText";
import { SocialPredictionList } from "@/components/SocialPredictionList";

type GroupPredictionsProps = {
  user: UserProfile;
  initialMatches?: MatchWithTeams[];
  initialPredictions?: Prediction[];
  initialKnockoutSeeded?: boolean;
};

type DraftPredictionState = {
  homeScore: number;
  awayScore: number;
  shouldCount: boolean;
};

type PendingScrollTarget = {
  matchId: string;
  mode: "match" | "section" | "peek";
  anchorMatchId?: string;
  extraOffset?: number;
  source?: "local" | "dashboard" | "save";
  reason?: string;
};

type SavedMatchFeedback = {
  matchId: string;
  summary: string;
  savedAt: string;
};

type PredictedGroupRowMovement = "up" | "down";
type SelectedTeamQualifierStatus = "projected-r32" | "best-third" | "outside" | "eliminated";
type DashboardPendingNavigation = {
  target: "next-pick" | "next-auto-pick";
  matchId: string;
  groupKey: string | null;
};
const GROUP_PREDICTIONS_MORE_STORAGE_KEY = "group-predictions-more";
const GROUP_PREDICTIONS_TABLE_STORAGE_KEY = "group-predictions-table";
const GROUP_PREDICTIONS_GROUP_FILTER_STORAGE_KEY = "group-predictions-group-filter";
const GROUP_PREDICTIONS_TEAM_FILTER_STORAGE_KEY = "group-predictions-team-filter";
const GROUP_PREDICTIONS_MINI_TABLE_GROUP_STORAGE_KEY = "group-predictions-mini-table-group";
const GROUP_PREDICTIONS_PAGE_SIZE = 10;
const PREDICTION_SCROLL_STACK_GAP = 20;
const MATCH_FOCUS_SCROLL_EXTRA_GAP = 16;
const INTENT_MATCH_SCROLL_EXTRA_GAP = 8;
const AUTO_PICK_SCROLL_EXTRA_GAP = 8;
const POST_SAVE_ADVANCE_DELAY_MS = 700;
const AUTO_PICK_REVEAL_DELAY_MS = 650;
const DEBUG_GROUPS_ENTRY_SCROLL = process.env.NODE_ENV !== "production";

const EXPLAINER_TITLE_COPY: Record<ExplainerLanguage, string> = {
  en: "FIND MY PICKS",
  es: "Desplázate hacia abajo y elige un marcador para cada partido.",
  fr: "Faites défiler et choisissez un score pour chaque match.",
  pt: "Role para baixo e escolha um placar para cada partida.",
  de: "Scrolle nach unten und tippe ein Ergebnis für jedes Spiel."
};

const EXPLAINER_COPY: Record<ExplainerLanguage, string[]> = {
  en: [
    "Submit your score predictions at any time before kickoff.",
    "Matches remain open for entries until the game starts.",
    "After kickoff all player picks become public.",
    "Get a BIG BONUS for predicting Champion and runner up before the cup starts."
  ],
  es: [
    "Envía tus pronósticos en cualquier momento antes del pitazo inicial.",
    "Las predicciones se cierran al comenzar el partido.",
    "Una vez iniciado el encuentro, las predicciones de todos los jugadores serán públicas.",
    "Obtén un GRAN BONO por predecir al Campeón y al subcampeón antes de que empiece la copa."
  ],
  fr: [
    "Soumettez vos pronostics de score à tout moment avant le coup d'envoi.",
    "Les matchs restent ouverts aux pronostics jusqu'au début du match.",
    "Après le coup d'envoi, tous les pronostics des joueurs deviennent publics.",
    "Obtenez un GROS BONUS en prédisant le Champion et le finaliste avant le début de la coupe."
  ],
  pt: [
    "Envie seus palpites de placar a qualquer momento antes do início.",
    "As partidas permanecem abertas para palpites até o começo do jogo.",
    "Após o início, todos os palpites dos jogadores se tornam públicos.",
    "Ganhe um GRANDE BÔNUS ao prever o Campeão e o vice-campeão antes do início da copa."
  ],
  de: [
    "Gib deine Ergebnistipps jederzeit vor dem Anpfiff ab.",
    "Spiele bleiben bis zum Anstoß für Tipps geöffnet.",
    "Nach dem Anpfiff werden alle Tipps der Spieler öffentlich.",
    "Hol dir einen GROSSEN BONUS, wenn du Champion und Vizemeister vor dem Start des Cups vorhersagst."
  ]
};

const HELPER_DISMISS_LABEL_COPY: Record<ExplainerLanguage, string> = {
  en: "Hide tip",
  es: "Ocultar tip",
  fr: "Masquer l'aide",
  pt: "Ocultar dica",
  de: "Tipp ausblenden"
};

const AUTO_PICK_LABEL_COPY = {
  en: "Auto Pick Next Match",
  es: "Auto Elegir Próximo Partido"
} as const;

const AUTO_PICK_LOADING_COPY = {
  en: "Auto Picking...",
  es: "Eligiendo..."
} as const;

const AUTO_PICK_SUCCESS_COPY = {
  en: "Auto Pick suggested this score. Review and save to confirm.",
  es: "Auto Pick sugirió este marcador. Revísalo y guarda para confirmar."
} as const;

const AUTO_PICK_SOURCE_COPY = {
  en: {
    teamStrength: "Suggested using team-strength probabilities.",
    market: "Suggested using market probabilities.",
    neutral: "Suggested using neutral fallback probabilities."
  },
  es: {
    teamStrength: "Sugerido usando probabilidades de fuerza de equipo.",
    market: "Sugerido usando probabilidades de mercado.",
    neutral: "Sugerido usando probabilidades neutras."
  }
} as const;

const AUTO_PICK_EMPTY_COPY = {
  en: "No open matches available right now.",
  es: "No hay partidos disponibles en este momento."
} as const;

const AUTO_PICK_ALL_SAVED_COPY = {
  en: "You have already saved every open match. You can still edit any saved pick until kickoff.",
  es: "Ya guardaste todos los partidos abiertos. Aun puedes editar cualquier pick guardado hasta el inicio del partido."
} as const;

const GROUP_FILTER_ALL_KEY = "all";
const TEAM_FILTER_ALL_KEY = "all";

export function GroupPredictions({
  user,
  initialMatches,
  initialPredictions,
  initialKnockoutSeeded
}: GroupPredictionsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [predictions, setPredictions] = useState<Prediction[]>(initialPredictions ?? []);
  const [socialPredictions, setSocialPredictions] = useState<SocialPrediction[]>([]);
  const [matches, setMatches] = useState<MatchWithTeams[]>(() => initialMatches ?? getLocalGroupMatches());
  const [selectedGroup, setSelectedGroup] = useSessionJsonState<string>(
    GROUP_PREDICTIONS_GROUP_FILTER_STORAGE_KEY,
    GROUP_FILTER_ALL_KEY
  );
  const [selectedTeamId, setSelectedTeamId] = useSessionJsonState<string>(
    GROUP_PREDICTIONS_TEAM_FILTER_STORAGE_KEY,
    TEAM_FILTER_ALL_KEY
  );
  const [lastViewedMiniTableGroup, setLastViewedMiniTableGroup, lastViewedMiniTableGroupState] = useSessionJsonState<string>(
    GROUP_PREDICTIONS_MINI_TABLE_GROUP_STORAGE_KEY,
    ""
  );
  const [matchWindowStart, setMatchWindowStart] = useState(0);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<PendingScrollTarget | null>(null);
  const [focusedMatchId, setFocusedMatchId] = useState<string | null>(null);
  const [lastSavedFeedback, setLastSavedFeedback] = useState<SavedMatchFeedback | null>(null);
  const [dashboardEntryIntent, setDashboardEntryIntent] = useState<GroupsEntryIntent | null>(null);
  const [pendingDashboardNavigation, setPendingDashboardNavigation] = useState<DashboardPendingNavigation | null>(null);
  const [isKnockoutSeeded, setIsKnockoutSeeded] = useState(initialKnockoutSeeded ?? false);
  const [autoPickDraft, setAutoPickDraft] = useState<AutoPickDraft | null>(null);
  const [activeAutoPickToken, setActiveAutoPickToken] = useState<string | null>(null);
  const [isAutoPicking, setIsAutoPicking] = useState(false);
  const [draftPredictionStateByMatchId, setDraftPredictionStateByMatchId] = useState<Record<string, DraftPredictionState>>({});
  const [explainerLanguage] = useState<ExplainerLanguage>(() => {
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
  const [isMoreOpen, setIsMoreOpen] = useSessionDisclosureState(GROUP_PREDICTIONS_MORE_STORAGE_KEY, false);
  const [isPredictionTableOpen, setIsPredictionTableOpen] = useSessionDisclosureState(
    GROUP_PREDICTIONS_TABLE_STORAGE_KEY,
    true
  );
  const matchCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const matchFooterRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dateSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const stickyControlsRef = useRef<HTMLDivElement | null>(null);
  const matchListTopRef = useRef<HTMLDivElement | null>(null);
  const previousGroupPredictionRowsRef = useRef<MiniGroupStandingsRow[]>([]);
  const previousPredictedGroupRef = useRef<string>(selectedGroup);
  const pendingAdvanceTimeoutRef = useRef<number | null>(null);
  const hasConsumedInitialFocusRef = useRef(false);
  const hasConsumedStoredAutoPickRef = useRef(false);
  const hasInitializedDashboardIntentRef = useRef(false);
  const autoPickRevealTimeoutRef = useRef<number | null>(null);
  const activeScrollDebugRef = useRef<string | null>(null);
  const pendingPagerScrollRef = useRef(false);
  const [movementByGroup, setMovementByGroup] = useState<Record<string, Record<string, PredictedGroupRowMovement>>>(
    {}
  );

  const logGroupsEntryScroll = useCallback((event: string, details?: Record<string, unknown>) => {
    if (!DEBUG_GROUPS_ENTRY_SCROLL || typeof window === "undefined" || window.innerWidth < 1024) {
      return;
    }

    console.info("[groups-entry-scroll]", {
      event,
      pathname,
      ...details
    });
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (pendingAdvanceTimeoutRef.current !== null) {
        window.clearTimeout(pendingAdvanceTimeoutRef.current);
      }
      if (autoPickRevealTimeoutRef.current !== null) {
        window.clearTimeout(autoPickRevealTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasInitializedDashboardIntentRef.current) {
      return;
    }

    hasInitializedDashboardIntentRef.current = true;
    const restoredIntent = readGroupsEntryIntent();
    setDashboardEntryIntent(restoredIntent);
    logGroupsEntryScroll("mount", {
      pendingIntent: restoredIntent?.target ?? null,
      matchesLoaded: matches.length > 0
    });
  }, [logGroupsEntryScroll, matches.length]);

  const autoPickLanguage = explainerLanguage === "es" ? "es" : "en";

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
    let isMounted = true;
    if (!initialPredictions) {
      setPredictions(getStoredPredictions(user.id));
    }

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

  const groupStageMatches = useMemo(
    () => matches.filter((match) => match.stage === "group").sort(sortMatchesByKickoff),
    [matches]
  );

  const availableGroups = useMemo(
    () =>
      Array.from(
        new Set(
          groupStageMatches
            .map((match) => normalizeGroupKey(match.groupName))
            .filter((groupName): groupName is string => Boolean(groupName))
        )
      ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    [groupStageMatches]
  );

  const selectedGroupMatches = useMemo(
    () =>
      selectedGroup === GROUP_FILTER_ALL_KEY
        ? groupStageMatches
        : groupStageMatches.filter((match) => normalizeGroupKey(match.groupName) === selectedGroup),
    [groupStageMatches, selectedGroup]
  );

  const availableTeamsForSelectedGroup = useMemo(() => {
    if (selectedGroup === GROUP_FILTER_ALL_KEY) {
      return [];
    }

    const teamMap = new Map<string, Team>();
    for (const match of selectedGroupMatches) {
      if (match.homeTeam?.id) {
        teamMap.set(match.homeTeam.id, match.homeTeam);
      }
      if (match.awayTeam?.id) {
        teamMap.set(match.awayTeam.id, match.awayTeam);
      }
    }

    return Array.from(teamMap.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [selectedGroup, selectedGroupMatches]);

  useEffect(() => {
    if (selectedGroup === GROUP_FILTER_ALL_KEY) {
      if (selectedTeamId !== TEAM_FILTER_ALL_KEY) {
        setSelectedTeamId(TEAM_FILTER_ALL_KEY);
      }
      return;
    }

    if (
      selectedTeamId !== TEAM_FILTER_ALL_KEY &&
      !availableTeamsForSelectedGroup.some((team) => team.id === selectedTeamId)
    ) {
      setSelectedTeamId(TEAM_FILTER_ALL_KEY);
    }
  }, [availableTeamsForSelectedGroup, selectedGroup, selectedTeamId, setSelectedTeamId]);

  const filteredMatches = useMemo(() => {
    if (selectedTeamId === TEAM_FILTER_ALL_KEY) {
      return selectedGroupMatches;
    }

    return selectedGroupMatches.filter(
      (match) => match.homeTeamId === selectedTeamId || match.awayTeamId === selectedTeamId
    );
  }, [selectedGroupMatches, selectedTeamId]);

  const filterSignature = `${selectedGroup}|${selectedTeamId}`;

  useEffect(() => {
    setMatchWindowStart(0);
  }, [filterSignature]);

  useEffect(() => {
    setMatchWindowStart((current) =>
      Math.max(0, Math.min(current, Math.max(filteredMatches.length - GROUP_PREDICTIONS_PAGE_SIZE, 0)))
    );
  }, [filteredMatches.length]);

  const visibleMatches = useMemo(
    () => filteredMatches.slice(matchWindowStart, matchWindowStart + GROUP_PREDICTIONS_PAGE_SIZE),
    [filteredMatches, matchWindowStart]
  );

  const hasEarlierMatches = matchWindowStart > 0;
  const hasLaterMatches = matchWindowStart + visibleMatches.length < filteredMatches.length;

  useEffect(() => {
    let isMounted = true;
    const filteredMatchIds = filteredMatches.map((match) => match.id);

    if (filteredMatchIds.length === 0) {
      setSocialPredictions([]);
      return () => {
        isMounted = false;
      };
    }

    fetchPredictionsForMatches(filteredMatchIds, user.id).then((items) => {
      if (isMounted) {
        setSocialPredictions(items);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [filteredMatches, user.id]);

  const filteredMatchesByDate = useMemo(
    () =>
      visibleMatches.reduce<Record<string, MatchWithTeams[]>>((groups, match) => {
        const dateKey = getMatchDateKey(match.kickoffTime);
        groups[dateKey] = groups[dateKey] ?? [];
        groups[dateKey].push(match);
        return groups;
      }, {}),
    [visibleMatches]
  );

  const filteredDates = useMemo(() => Object.keys(filteredMatchesByDate).sort(), [filteredMatchesByDate]);

  const savedMatchIds = useMemo(() => new Set(predictions.map((prediction) => prediction.matchId)), [predictions]);

  const savedCount = useMemo(
    () => groupStageMatches.filter((match) => savedMatchIds.has(match.id)).length,
    [groupStageMatches, savedMatchIds]
  );

  const hasCompletedAllPicks = groupStageMatches.length > 0 && savedCount >= groupStageMatches.length;

  const nextPredictionMatchId = useMemo(() => {
    const nextUnsavedOpenMatch = groupStageMatches.find(
      (match) => canEditPrediction(match.status) && !savedMatchIds.has(match.id)
    );

    if (nextUnsavedOpenMatch) {
      return nextUnsavedOpenMatch.id;
    }

    return groupStageMatches.find((match) => canEditPrediction(match.status))?.id ?? null;
  }, [groupStageMatches, savedMatchIds]);
  const nextPredictionMatchIdInCurrentView = useMemo(() => {
    const nextUnsavedOpenMatch = filteredMatches.find(
      (match) => canEditPrediction(match.status) && !savedMatchIds.has(match.id)
    );

    if (nextUnsavedOpenMatch) {
      return nextUnsavedOpenMatch.id;
    }

    return filteredMatches.find((match) => canEditPrediction(match.status))?.id ?? null;
  }, [filteredMatches, savedMatchIds]);

  const shouldPromoteKnockout = !nextPredictionMatchId;
  const shouldShowSecondaryKnockoutButton = !shouldPromoteKnockout;
  const primaryActionLabel = nextPredictionMatchId
    ? "My Next Pick"
    : isKnockoutSeeded
      ? "My Knockout Picks"
      : "My Results";
  const selectedTeam = useMemo(
    () => availableTeamsForSelectedGroup.find((team) => team.id === selectedTeamId) ?? null,
    [availableTeamsForSelectedGroup, selectedTeamId]
  );
  const homeTeam = useMemo(() => {
    if (!user.homeTeamId) {
      return null;
    }

    for (const match of groupStageMatches) {
      if (match.homeTeam?.id === user.homeTeamId) {
        return match.homeTeam;
      }
      if (match.awayTeam?.id === user.homeTeamId) {
        return match.awayTeam;
      }
    }

    return null;
  }, [groupStageMatches, user.homeTeamId]);
  const homeTeamGroupName = normalizeGroupKey(homeTeam?.groupName) ?? null;
  const { selectedGroup: resolvedMiniTableGroup } = useMemo(
    () =>
      resolvePreferredStandingsGroupSelection({
        availableGroups,
        storedGroup: lastViewedMiniTableGroup,
        homeTeamGroup: homeTeamGroupName
      }),
    [availableGroups, homeTeamGroupName, lastViewedMiniTableGroup]
  );
  const miniTableGroup =
    selectedGroup !== GROUP_FILTER_ALL_KEY && availableGroups.includes(selectedGroup)
      ? selectedGroup
      : resolvedMiniTableGroup || null;

  useEffect(() => {
    if (selectedGroup !== GROUP_FILTER_ALL_KEY && !availableGroups.includes(selectedGroup)) {
      setSelectedGroup(GROUP_FILTER_ALL_KEY);
    }
  }, [availableGroups, selectedGroup, setSelectedGroup]);

  useEffect(() => {
    if (
      selectedGroup !== GROUP_FILTER_ALL_KEY &&
      availableGroups.includes(selectedGroup) &&
      lastViewedMiniTableGroup !== selectedGroup
    ) {
      setLastViewedMiniTableGroup(selectedGroup);
    }
  }, [availableGroups, lastViewedMiniTableGroup, selectedGroup, setLastViewedMiniTableGroup]);

  useEffect(() => {
    const hasValidStoredSelection =
      lastViewedMiniTableGroupState.hasStoredValue && availableGroups.includes(lastViewedMiniTableGroup);

    if (!hasValidStoredSelection && miniTableGroup && miniTableGroup !== lastViewedMiniTableGroup) {
      setLastViewedMiniTableGroup(miniTableGroup);
    }
  }, [
    availableGroups,
    lastViewedMiniTableGroup,
    lastViewedMiniTableGroupState.hasStoredValue,
    miniTableGroup,
    setLastViewedMiniTableGroup
  ]);

  const groupFilterLabel = selectedGroup === GROUP_FILTER_ALL_KEY ? null : formatGroupName(selectedGroup);
  const teamFilterLabel = selectedTeamId === TEAM_FILTER_ALL_KEY ? null : selectedTeam?.name ?? null;
  const matchCountSummary = useMemo(() => {
    if (!groupFilterLabel && !teamFilterLabel) {
      return `Showing ${groupStageMatches.length} matches`;
    }

    const contextParts = [groupFilterLabel, teamFilterLabel].filter(
      (value): value is string => Boolean(value)
    );

    return `Showing ${filteredMatches.length} of ${groupStageMatches.length} matches${contextParts.length > 0 ? ` · ${contextParts.join(" · ")}` : ""}`;
  }, [filteredMatches.length, groupFilterLabel, groupStageMatches.length, teamFilterLabel]);
  const groupStageSectionTitle = selectedGroup === GROUP_FILTER_ALL_KEY ? "Group Stage" : formatGroupName(selectedGroup) ?? "Group Stage";
  const groupStageSectionTotalMatches =
    selectedGroup === GROUP_FILTER_ALL_KEY ? groupStageMatches.length : selectedGroupMatches.length;
  const groupStageSectionBanner = "PREDICTIONS ARE EDITABLE UNTIL KICKOFF";
  const predictionByMatchId = useMemo(
    () => new Map(predictions.map((prediction) => [prediction.matchId, prediction])),
    [predictions]
  );
  const projectedPredictions = useMemo(
    () =>
      groupStageMatches.flatMap((match) => {
        const draftState = draftPredictionStateByMatchId[match.id];
        const savedPrediction = predictionByMatchId.get(match.id);
        const predictedScore = getPredictedScoreForTable(savedPrediction, draftState);

        return predictedScore
          ? [
              {
                matchId: match.id,
                predictedHomeScore: predictedScore.homeScore,
                predictedAwayScore: predictedScore.awayScore
              }
            ]
          : [];
      }),
    [draftPredictionStateByMatchId, groupStageMatches, predictionByMatchId]
  );
  const allGroupTeams = useMemo(
    () =>
      Array.from(
        new Map(
          groupStageMatches.flatMap((match) => {
            const entries: Array<[string, Team]> = [];
            if (match.homeTeam?.id) {
              entries.push([match.homeTeam.id, match.homeTeam]);
            }
            if (match.awayTeam?.id) {
              entries.push([match.awayTeam.id, match.awayTeam]);
            }
            return entries;
          })
        ).values()
      ),
    [groupStageMatches]
  );
  const projectedStandingsByGroup = useMemo(
    () => buildPredictedGroupStandings(groupStageMatches, allGroupTeams, projectedPredictions),
    [allGroupTeams, groupStageMatches, projectedPredictions]
  );
  const projectedQualification = useMemo(() => {
    const automaticQualifierTeamIds = new Set<string>();
    const automaticQualifierTeams: Array<{ teamId: string; teamCode: string; teamName: string; groupName: string }> = [];
    const bestThirdPlaceQualifierTeamIds = new Set<string>();
    const bestThirdPlaceQualifierTeams: Array<{ teamId: string; teamCode: string; teamName: string; groupName: string }> = [];

    try {
      const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(projectedStandingsByGroup);
      for (const qualifier of automaticQualifiers.values()) {
        automaticQualifierTeamIds.add(qualifier.teamId);
        automaticQualifierTeams.push({
          teamId: qualifier.teamId,
          teamCode: qualifier.teamShortName || qualifier.teamName.slice(0, 3).toUpperCase(),
          teamName: qualifier.teamName,
          groupName: qualifier.groupName
        });
      }
      for (const seed of rankedThirdPlaceTeams) {
        bestThirdPlaceQualifierTeamIds.add(seed.teamId);
        bestThirdPlaceQualifierTeams.push({
          teamId: seed.teamId,
          teamCode: seed.teamShortName || seed.teamName.slice(0, 3).toUpperCase(),
          teamName: seed.teamName,
          groupName: seed.groupName
        });
      }
    } catch (error) {
      console.warn("Could not determine projected qualifiers for My Picks cockpit.", error);
    }

    return {
      automaticQualifierTeamIds,
      automaticQualifierTeams,
      bestThirdPlaceQualifierTeamIds,
      bestThirdPlaceQualifierTeams
    };
  }, [projectedStandingsByGroup]);

  const groupPredictionRows = useMemo(() => {
    if (!miniTableGroup) {
      return [];
    }

    return (
      projectedStandingsByGroup.get(miniTableGroup)?.map(
        (row, index) => ({
          ...row,
          rank: row.rank || index + 1,
          isHomeTeam: Boolean(user.homeTeamId && row.teamId === user.homeTeamId),
          isQualifier:
            index < 2 || (index === 2 && projectedQualification.bestThirdPlaceQualifierTeamIds.has(row.teamId)),
          isPossibleQualifier: false
        })
      ) ?? []
    );
  }, [miniTableGroup, projectedQualification.bestThirdPlaceQualifierTeamIds, projectedStandingsByGroup, user.homeTeamId]);
  const allModeProjectedQualifierCodes = useMemo(
    () =>
      projectedPredictions.length === 0
        ? []
        : [
            ...projectedQualification.automaticQualifierTeams,
            ...projectedQualification.bestThirdPlaceQualifierTeams
          ].slice(0, 32),
    [
      projectedPredictions.length,
      projectedQualification.automaticQualifierTeams,
      projectedQualification.bestThirdPlaceQualifierTeams
    ]
  );
  const selectedTeamQualifierStatus = useMemo<SelectedTeamQualifierStatus | null>(() => {
    if (!miniTableGroup || !selectedTeam || selectedTeamId === TEAM_FILTER_ALL_KEY) {
      return null;
    }

    const row = projectedStandingsByGroup.get(miniTableGroup)?.find((candidate) => candidate.teamId === selectedTeam.id) ?? null;
    if (!row) {
      return null;
    }

    if (row.rank <= 2) {
      return "projected-r32";
    }

    if (row.rank === 3 && projectedQualification.bestThirdPlaceQualifierTeamIds.has(row.teamId)) {
      return "best-third";
    }

    const groupMatchesForSelection = groupStageMatches.filter(
      (match) => normalizeGroupKey(match.groupName) === miniTableGroup
    );
    const isGroupFullyFinal = groupMatchesForSelection.length > 0 && groupMatchesForSelection.every((match) => match.status === "final");

    return isGroupFullyFinal ? "eliminated" : "outside";
  }, [
    groupStageMatches,
    miniTableGroup,
    projectedQualification.bestThirdPlaceQualifierTeamIds,
    projectedStandingsByGroup,
    selectedTeam,
    selectedTeamId
  ]);
  const movementByTeamId = useMemo(
    () => (miniTableGroup ? movementByGroup[miniTableGroup] ?? {} : {}),
    [miniTableGroup, movementByGroup]
  );

  useEffect(() => {
    if (!miniTableGroup) {
      previousGroupPredictionRowsRef.current = [];
      previousPredictedGroupRef.current = "";
      return;
    }

    const switchedGroups = previousPredictedGroupRef.current !== miniTableGroup;
    if (switchedGroups || previousGroupPredictionRowsRef.current.length === 0) {
      previousGroupPredictionRowsRef.current = groupPredictionRows;
      previousPredictedGroupRef.current = miniTableGroup;
      return;
    }

    const previousRanks = new Map(
      previousGroupPredictionRowsRef.current.map((row, index) => [row.teamId, index])
    );
    const previousOrder = previousGroupPredictionRowsRef.current.map((row) => row.teamId);
    const nextOrder = groupPredictionRows.map((row) => row.teamId);
    const orderChanged =
      previousOrder.length === nextOrder.length &&
      previousOrder.some((teamId, index) => teamId !== nextOrder[index]);

    if (!orderChanged) {
      previousGroupPredictionRowsRef.current = groupPredictionRows;
      previousPredictedGroupRef.current = miniTableGroup;
      return;
    }

    const nextMovements: Record<string, PredictedGroupRowMovement> = {};

    for (const [index, row] of groupPredictionRows.entries()) {
      const previousRank = previousRanks.get(row.teamId);
      if (previousRank === undefined || previousRank === index) {
        continue;
      }

      nextMovements[row.teamId] = index < previousRank ? "up" : "down";
    }

    previousGroupPredictionRowsRef.current = groupPredictionRows;
    previousPredictedGroupRef.current = miniTableGroup;

    setMovementByGroup((current) => ({
      ...current,
      [miniTableGroup]: nextMovements
    }));
  }, [groupPredictionRows, miniTableGroup]);

  const jumpToMatch = useCallback(
    (
      matchId: string,
      mode: "match" | "section" | "peek" = "match",
      options?: { scheduleScroll?: boolean; anchorMatchId?: string; extraOffset?: number }
    ) => {
      setSelectedGroup(GROUP_FILTER_ALL_KEY);
      setSelectedTeamId(TEAM_FILTER_ALL_KEY);
      const targetIndex = groupStageMatches.findIndex((match) => match.id === matchId);
      const maxWindowStart = Math.max(groupStageMatches.length - GROUP_PREDICTIONS_PAGE_SIZE, 0);
      setMatchWindowStart(
        targetIndex >= 0 ? Math.max(0, Math.min(Math.max(0, targetIndex - 1), maxWindowStart)) : 0
      );
      if (options?.scheduleScroll !== false) {
        setPendingScrollTarget({
          matchId,
          mode,
          anchorMatchId: options?.anchorMatchId,
          extraOffset: options?.extraOffset,
          source: "local"
        });
      }
      setFocusedMatchId(matchId);
    },
    [groupStageMatches, setSelectedGroup, setSelectedTeamId]
  );

  const focusMatchInCurrentFilter = useCallback(
    (
      matchId: string,
      mode: "match" | "section" | "peek" = "match",
      options?: { scheduleScroll?: boolean; anchorMatchId?: string; extraOffset?: number }
    ) => {
      const targetIndex = filteredMatches.findIndex((match) => match.id === matchId);
      const maxWindowStart = Math.max(filteredMatches.length - GROUP_PREDICTIONS_PAGE_SIZE, 0);
      setMatchWindowStart(
        targetIndex >= 0 ? Math.max(0, Math.min(Math.max(0, targetIndex - 1), maxWindowStart)) : 0
      );
      if (options?.scheduleScroll !== false) {
        setPendingScrollTarget({
          matchId,
          mode,
          anchorMatchId: options?.anchorMatchId,
          extraOffset: options?.extraOffset,
          source: "local"
        });
      }
      setFocusedMatchId(matchId);
    },
    [filteredMatches]
  );

  const focusDashboardEntryMatch = useCallback(
    (matchId: string, groupKey: string | null, target: "next-pick" | "next-auto-pick") => {
      const normalizedGroupKey =
        groupKey && availableGroups.includes(groupKey) ? groupKey : GROUP_FILTER_ALL_KEY;
      const scopedMatches =
        normalizedGroupKey === GROUP_FILTER_ALL_KEY
          ? groupStageMatches
          : groupStageMatches.filter((match) => normalizeGroupKey(match.groupName) === normalizedGroupKey);
      const targetIndex = scopedMatches.findIndex((match) => match.id === matchId);
      const maxWindowStart = Math.max(scopedMatches.length - GROUP_PREDICTIONS_PAGE_SIZE, 0);

      setSelectedGroup(normalizedGroupKey);
      setSelectedTeamId(TEAM_FILTER_ALL_KEY);
      setMatchWindowStart(
        targetIndex >= 0 ? Math.max(0, Math.min(Math.max(0, targetIndex - 1), maxWindowStart)) : 0
      );
      setFocusedMatchId(matchId);
      setPendingDashboardNavigation({
        target,
        matchId,
        groupKey: normalizedGroupKey === GROUP_FILTER_ALL_KEY ? null : normalizedGroupKey
      });
    },
    [availableGroups, groupStageMatches, setSelectedGroup, setSelectedTeamId]
  );

  const clearEntryFocusIntent = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("focus");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    // Entry-time focus should only run once. Post-save footer-preserving scroll owns
    // subsequent auto-advance movement so the page does not jump twice.
    if (hasConsumedInitialFocusRef.current) {
      return;
    }

    if (searchParams.get("focus") === "next" && nextPredictionMatchId) {
      hasConsumedInitialFocusRef.current = true;
      jumpToMatch(nextPredictionMatchId, "section");
      clearEntryFocusIntent();
      return;
    }

    if (searchParams.get("focus") === "next-match" && nextPredictionMatchId) {
      hasConsumedInitialFocusRef.current = true;
      jumpToMatch(nextPredictionMatchId, "match");
      clearEntryFocusIntent();
    }
  }, [clearEntryFocusIntent, jumpToMatch, nextPredictionMatchId, searchParams]);

  useEffect(() => {
    if (hasConsumedInitialFocusRef.current || !dashboardEntryIntent) {
      return;
    }

    const dashboardTargetMatchId = dashboardEntryIntent.matchId ?? nextPredictionMatchId;
    if (dashboardEntryIntent.target === "next-pick" && dashboardTargetMatchId) {
      hasConsumedInitialFocusRef.current = true;
      focusDashboardEntryMatch(
        dashboardTargetMatchId,
        dashboardEntryIntent.groupKey ?? null,
        "next-pick"
      );
      logGroupsEntryScroll("intent-received", {
        target: "next-pick",
        matchesLoaded: matches.length > 0,
        targetMatchId: dashboardTargetMatchId,
        groupKey: dashboardEntryIntent.groupKey ?? null
      });
    }
  }, [dashboardEntryIntent, focusDashboardEntryMatch, logGroupsEntryScroll, matches.length, nextPredictionMatchId]);

  useEffect(() => {
    if (!pendingDashboardNavigation) {
      return;
    }

    const targetInVisibleWindow = visibleMatches.some((match) => match.id === pendingDashboardNavigation.matchId);
    const targetNode = matchCardRefs.current[pendingDashboardNavigation.matchId];
    const stickyControlsHeight = Math.round(stickyControlsRef.current?.getBoundingClientRect().height ?? 0);
    const appHeaderHeight =
      typeof window === "undefined"
        ? 0
        : Math.round(
            Number.parseFloat(
              window.getComputedStyle(document.documentElement).getPropertyValue("--app-header-height")
            ) || 0
          );
    const expectedGroupKey = pendingDashboardNavigation.groupKey ?? GROUP_FILTER_ALL_KEY;
    const filterWindowStateReady =
      selectedGroup === expectedGroupKey &&
      selectedTeamId === TEAM_FILTER_ALL_KEY &&
      targetInVisibleWindow;

    logGroupsEntryScroll("ready-check", {
      target: pendingDashboardNavigation.target,
      targetMatchId: pendingDashboardNavigation.matchId,
      expectedGroupKey,
      matchesLoaded: matches.length > 0,
      targetCardRefExists: Boolean(targetNode),
      targetAnchorRefExists: Boolean(targetNode),
      filterWindowStateReady,
      stickyStackHeight: stickyControlsHeight,
      appHeaderHeight
    });

    if (!filterWindowStateReady || !targetNode || stickyControlsHeight <= 0) {
      return;
    }

    const scheduleDashboardScroll = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setPendingScrollTarget({
          matchId: pendingDashboardNavigation.matchId,
          mode: "match",
          extraOffset:
            pendingDashboardNavigation.target === "next-auto-pick"
              ? AUTO_PICK_SCROLL_EXTRA_GAP
              : INTENT_MATCH_SCROLL_EXTRA_GAP,
          source: "dashboard",
          reason: pendingDashboardNavigation.target
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(scheduleDashboardScroll);
    };
  }, [
    logGroupsEntryScroll,
    matches.length,
    pendingDashboardNavigation,
    selectedGroup,
    selectedTeamId,
    visibleMatches
  ]);

  useEffect(() => {
    if (!pendingScrollTarget) {
      return;
    }

    const targetMatch = visibleMatches.find((match) => match.id === pendingScrollTarget.matchId);
    if (!targetMatch) {
      return;
    }

    const targetDateKey = getMatchDateKey(targetMatch.kickoffTime);
    const targetNode = matchCardRefs.current[pendingScrollTarget.matchId];
    const anchorNode = pendingScrollTarget.anchorMatchId
      ? matchFooterRefs.current[pendingScrollTarget.anchorMatchId]
      : null;
    const sectionNode = dateSectionRefs.current[targetDateKey];

    if (!targetNode && !sectionNode && !anchorNode) {
      return;
    }

    const scrollTarget =
      pendingScrollTarget.mode === "peek"
        ? anchorNode ?? targetNode ?? sectionNode
        : pendingScrollTarget.mode === "section"
          ? sectionNode ?? targetNode
          : targetNode ?? sectionNode;
    if (!scrollTarget) {
      return;
    }

    const stickyControlsHeight = Math.round(
      stickyControlsRef.current?.getBoundingClientRect().height ?? 0
    );
    const modeExtraOffset = pendingScrollTarget.mode === "match" ? MATCH_FOCUS_SCROLL_EXTRA_GAP : 0;
    const scrollOffset =
      stickyControlsHeight +
      PREDICTION_SCROLL_STACK_GAP +
      modeExtraOffset +
      (pendingScrollTarget.extraOffset ?? 0);
    const previousScrollY = window.scrollY;
    const targetTop = scrollTarget.getBoundingClientRect().top + window.scrollY - scrollOffset;
    if (activeScrollDebugRef.current && activeScrollDebugRef.current !== pendingScrollTarget.reason) {
      logGroupsEntryScroll("later-scroll-detected", {
        previousSource: activeScrollDebugRef.current,
        nextSource: pendingScrollTarget.reason ?? pendingScrollTarget.source ?? "unknown"
      });
    }
    activeScrollDebugRef.current = pendingScrollTarget.reason ?? pendingScrollTarget.source ?? "unknown";
    logGroupsEntryScroll("scroll-run", {
      source: pendingScrollTarget.source ?? "local",
      reason: pendingScrollTarget.reason ?? null,
      targetMatchId: pendingScrollTarget.matchId,
      anchorMatchId: pendingScrollTarget.anchorMatchId ?? null,
      extraOffset: pendingScrollTarget.extraOffset ?? 0,
      modeExtraOffset,
      stickyStackHeight: stickyControlsHeight,
      finalScrollOffset: scrollOffset,
      scrollYBefore: previousScrollY,
      desiredScrollY: Math.max(0, targetTop)
    });
    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth"
    });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        logGroupsEntryScroll("scroll-complete", {
          source: pendingScrollTarget.source ?? "local",
          reason: pendingScrollTarget.reason ?? null,
          scrollYAfter: window.scrollY
        });
        if (pendingScrollTarget.source === "dashboard") {
          clearGroupsEntryIntent();
          setPendingDashboardNavigation(null);
          setDashboardEntryIntent(null);
        }
        activeScrollDebugRef.current = null;
      });
    });

    setPendingScrollTarget(null);
  }, [logGroupsEntryScroll, pendingScrollTarget, visibleMatches]);

  async function handleSave(prediction: Prediction) {
    const savedPrediction = await savePlayerPrediction(prediction);
    if (autoPickDraft?.matchId === savedPrediction.matchId) {
      setAutoPickDraft(null);
      setActiveAutoPickToken(null);
    }

    let nextPredictions: Prediction[] = [];

    setPredictions((currentPredictions) => {
      const existingIndex = currentPredictions.findIndex(
        (item) => item.userId === savedPrediction.userId && item.matchId === savedPrediction.matchId
      );

      if (existingIndex < 0) {
        nextPredictions = [...currentPredictions, savedPrediction];
        return nextPredictions;
      }

      nextPredictions = currentPredictions.map((item, index) => (index === existingIndex ? savedPrediction : item));
      return nextPredictions;
    });

    setLastSavedFeedback({
      matchId: savedPrediction.matchId,
      summary: formatSavedPredictionSummary(
        groupStageMatches.find((match) => match.id === savedPrediction.matchId),
        savedPrediction
      ),
      savedAt: savedPrediction.updatedAt ?? new Date().toISOString()
    });

    const nextSavedMatchIds = new Set(
      (nextPredictions.length > 0 ? nextPredictions : predictions).map((item) => item.matchId)
    );
    const shouldAdvanceToNextGlobalPick =
      selectedGroup === GROUP_FILTER_ALL_KEY && selectedTeamId === TEAM_FILTER_ALL_KEY;
    const autoAdvanceMatches = shouldAdvanceToNextGlobalPick ? groupStageMatches : filteredMatches;
    const nextUnsavedOpenMatch = autoAdvanceMatches.find(
      (match) => canEditPrediction(match.status) && !nextSavedMatchIds.has(match.id)
    );

    if (nextUnsavedOpenMatch) {
      if (pendingAdvanceTimeoutRef.current !== null) {
        window.clearTimeout(pendingAdvanceTimeoutRef.current);
      }

      pendingAdvanceTimeoutRef.current = window.setTimeout(() => {
        if (shouldAdvanceToNextGlobalPick) {
          jumpToMatch(nextUnsavedOpenMatch.id, "peek", {
            scheduleScroll: false
          });
        } else {
          focusMatchInCurrentFilter(nextUnsavedOpenMatch.id, "peek", {
            scheduleScroll: false
          });
        }
        setPendingScrollTarget({
          matchId: nextUnsavedOpenMatch.id,
          mode: "peek",
          anchorMatchId: savedPrediction.matchId,
          source: "save",
          reason: "post-save-peek"
        });
        pendingAdvanceTimeoutRef.current = null;
      }, POST_SAVE_ADVANCE_DELAY_MS);
    } else if (pendingAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(pendingAdvanceTimeoutRef.current);
      pendingAdvanceTimeoutRef.current = null;
    }

    fetchPredictionsForMatches(filteredMatches.map((match) => match.id), user.id).then(setSocialPredictions);
    return savedPrediction;
  }

  async function handleAutoPickAction() {
    prepareExplicitMatchNavigation();
    setIsAutoPicking(true);

    try {
      const preferredMatchIds =
        selectedGroup === GROUP_FILTER_ALL_KEY && selectedTeamId === TEAM_FILTER_ALL_KEY
          ? []
          : filteredMatches
              .filter((match) => canEditPrediction(match.status) && !savedMatchIds.has(match.id))
              .map((match) => match.id);
      const suggestion =
        preferredMatchIds.length > 0
          ? await fetchNextAutoPickForMatches(preferredMatchIds)
          : await fetchNextAutoPick();
      const draft = buildAutoPickDraft(suggestion);
      triggerAutoPickDraft(draft, {
        preserveCurrentFilter: !(selectedGroup === GROUP_FILTER_ALL_KEY && selectedTeamId === TEAM_FILTER_ALL_KEY)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : AUTO_PICK_EMPTY_COPY[autoPickLanguage];
      const localizedMessage =
        message === AUTO_PICK_EMPTY_COPY.en
          ? AUTO_PICK_EMPTY_COPY[autoPickLanguage]
          : message === AUTO_PICK_ALL_SAVED_COPY.en
            ? AUTO_PICK_ALL_SAVED_COPY[autoPickLanguage]
            : message;
      showAppToast({
        tone:
          localizedMessage === AUTO_PICK_EMPTY_COPY[autoPickLanguage] ||
          localizedMessage === AUTO_PICK_ALL_SAVED_COPY[autoPickLanguage]
            ? "tip"
            : "error",
        text: localizedMessage
      });
    } finally {
      setIsAutoPicking(false);
    }
  }

  const triggerAutoPickDraft = useCallback(
    (draft: AutoPickDraft, options?: { preserveCurrentFilter?: boolean }) => {
      setAutoPickDraft(draft);
      setActiveAutoPickToken(null);
      if (options?.preserveCurrentFilter) {
        focusMatchInCurrentFilter(draft.matchId, "match", {
          extraOffset: AUTO_PICK_SCROLL_EXTRA_GAP
        });
      } else {
        jumpToMatch(draft.matchId, "match", {
          extraOffset: AUTO_PICK_SCROLL_EXTRA_GAP
        });
      }

      if (autoPickRevealTimeoutRef.current !== null) {
        window.clearTimeout(autoPickRevealTimeoutRef.current);
      }

      autoPickRevealTimeoutRef.current = window.setTimeout(() => {
        setActiveAutoPickToken(draft.token);
        showAppToast({
          tone: "tip",
          text: AUTO_PICK_SUCCESS_COPY[autoPickLanguage]
        });
        autoPickRevealTimeoutRef.current = null;
      }, AUTO_PICK_REVEAL_DELAY_MS);
    },
    [autoPickLanguage, focusMatchInCurrentFilter, jumpToMatch]
  );

  const prepareExplicitMatchNavigation = useCallback(() => {
    // When a player explicitly asks for the next pick, that intent should win over
    // any delayed post-save or pager-driven movement still waiting to run.
    if (pendingAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(pendingAdvanceTimeoutRef.current);
      pendingAdvanceTimeoutRef.current = null;
    }

    pendingPagerScrollRef.current = false;
    setPendingScrollTarget(null);
  }, []);

  useEffect(() => {
    if (hasConsumedStoredAutoPickRef.current || dashboardEntryIntent?.target !== "next-auto-pick") {
      return;
    }

    hasConsumedStoredAutoPickRef.current = true;
    const storedDraft = restoreStoredAutoPickDraft();
    logGroupsEntryScroll("intent-received", {
      target: "next-auto-pick",
      matchesLoaded: matches.length > 0,
      targetMatchId: storedDraft?.matchId ?? null
    });
    if (!storedDraft) {
      clearGroupsEntryIntent();
      setDashboardEntryIntent(null);
      return;
    }

    setAutoPickDraft(storedDraft);
    setActiveAutoPickToken(null);
    focusDashboardEntryMatch(
      storedDraft.matchId,
      dashboardEntryIntent.groupKey ?? null,
      "next-auto-pick"
    );

    if (autoPickRevealTimeoutRef.current !== null) {
      window.clearTimeout(autoPickRevealTimeoutRef.current);
    }

    autoPickRevealTimeoutRef.current = window.setTimeout(() => {
      setActiveAutoPickToken(storedDraft.token);
      showAppToast({
        tone: "tip",
        text: AUTO_PICK_SUCCESS_COPY[autoPickLanguage]
      });
      autoPickRevealTimeoutRef.current = null;
    }, AUTO_PICK_REVEAL_DELAY_MS);
  }, [autoPickLanguage, dashboardEntryIntent, focusDashboardEntryMatch, logGroupsEntryScroll, matches.length]);

  function handlePrimaryAction() {
    prepareExplicitMatchNavigation();
    if (selectedGroup === GROUP_FILTER_ALL_KEY && selectedTeamId === TEAM_FILTER_ALL_KEY && nextPredictionMatchId) {
      jumpToMatch(nextPredictionMatchId, "match", {
        extraOffset: INTENT_MATCH_SCROLL_EXTRA_GAP
      });
      return;
    }

    if (nextPredictionMatchIdInCurrentView) {
      focusMatchInCurrentFilter(nextPredictionMatchIdInCurrentView, "match", {
        extraOffset: INTENT_MATCH_SCROLL_EXTRA_GAP
      });
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

  const handleGroupFilterChange = useCallback(
    (groupKey: string) => {
      setSelectedGroup(groupKey);
      setSelectedTeamId(TEAM_FILTER_ALL_KEY);
    },
    [setSelectedGroup, setSelectedTeamId]
  );

  const handleProjectedQualifierSelect = useCallback(
    (teamId: string, groupName: string) => {
      const normalizedGroupName = normalizeGroupKey(groupName);
      if (!normalizedGroupName) {
        console.warn("Could not focus projected qualifier because its group was missing.", {
          teamId
        });
        return;
      }

      prepareExplicitMatchNavigation();
      setSelectedGroup(normalizedGroupName);
      setSelectedTeamId(teamId);
      setIsPredictionTableOpen(true);
      setFocusedMatchId(null);

      requestAnimationFrame(() => {
        stickyControlsRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth"
        });
      });
    },
    [prepareExplicitMatchNavigation, setSelectedGroup, setSelectedTeamId, setIsPredictionTableOpen]
  );

  const handleDraftStateChange = useCallback((matchId: string, draft: DraftPredictionState) => {
    setDraftPredictionStateByMatchId((current) => {
      const nextValue = {
        homeScore: draft.homeScore,
        awayScore: draft.awayScore,
        shouldCount: draft.shouldCount
      };
      const previousValue = current[matchId];

      if (
        previousValue &&
        previousValue.homeScore === nextValue.homeScore &&
        previousValue.awayScore === nextValue.awayScore &&
        previousValue.shouldCount === nextValue.shouldCount
      ) {
        return current;
      }

      return {
        ...current,
        [matchId]: nextValue
      };
    });
  }, []);

  const handleMatchWindowChange = useCallback(
    (direction: "earlier" | "later") => {
      pendingPagerScrollRef.current = true;
      setFocusedMatchId(null);
      setMatchWindowStart((current) => {
        if (direction === "earlier") {
          return Math.max(0, current - GROUP_PREDICTIONS_PAGE_SIZE);
        }

        return Math.min(
          Math.max(filteredMatches.length - GROUP_PREDICTIONS_PAGE_SIZE, 0),
          current + GROUP_PREDICTIONS_PAGE_SIZE
        );
      });
    },
    [filteredMatches.length]
  );

  useEffect(() => {
    if (!pendingPagerScrollRef.current || !matchListTopRef.current) {
      return;
    }

    const stickyControlsHeight = Math.round(stickyControlsRef.current?.getBoundingClientRect().height ?? 0);
    if (stickyControlsHeight <= 0) {
      return;
    }

    const targetTop =
      matchListTopRef.current.getBoundingClientRect().top + window.scrollY - stickyControlsHeight - PREDICTION_SCROLL_STACK_GAP;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth"
    });

    pendingPagerScrollRef.current = false;
  }, [matchWindowStart, visibleMatches]);

  const renderMatchPager = (variant: "cockpit" | "content" = "content") =>
    visibleMatches.length > 0 ? (
      <section
        className={
          variant === "cockpit"
            ? "rounded-b-md bg-white pt-0.5"
            : "pt-3"
        }
      >
        <div
          className={`flex flex-wrap items-center justify-between gap-2 ${
            variant === "cockpit" ? `${lastSavedFeedback ? "pb-1.5" : "border-b border-gray-200/80 pb-1.5"}` : ""
          }`}
        >
          <div>
            <p className="text-[13px] font-black leading-none text-gray-900">
              Matches {matchWindowStart + 1}-{matchWindowStart + visibleMatches.length}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold leading-none text-gray-500">
              Starting {formatDateLabel(getMatchDateKey(visibleMatches[0]!.kickoffTime))}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleMatchWindowChange("earlier")}
              disabled={!hasEarlierMatches}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[13px] font-bold leading-none text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Earlier
            </button>
            <button
              type="button"
              onClick={() => handleMatchWindowChange("later")}
              disabled={!hasLaterMatches}
              className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[13px] font-bold leading-none text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Later
            </button>
          </div>
        </div>
        {variant === "cockpit" && lastSavedFeedback ? (
          <div className="pt-1.5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              <span className="whitespace-nowrap">Last pick</span>
              <span className="min-w-0 text-center">{lastSavedFeedback.summary}</span>
              <span className="whitespace-nowrap text-right">{formatDateTimeWithZone(lastSavedFeedback.savedAt)}</span>
            </div>
          </div>
        ) : null}
      </section>
    ) : null;

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-4xl font-black leading-none text-gray-950 sm:text-5xl">
              {groupStageSectionTitle}
            </h1>
          </div>
          <div className="shrink-0 pt-1 text-right">
            <p className="text-sm font-black uppercase tracking-wide text-gray-950 sm:text-base">
              {groupStageSectionTotalMatches} matches
            </p>
          </div>
        </div>
        <div className="rounded-md bg-accent-light px-4 py-2 text-center text-xs font-bold uppercase tracking-wide text-accent-dark sm:text-sm">
          {groupStageSectionBanner}
        </div>
        <div className="rounded-lg bg-gray-100 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">
              {EXPLAINER_TITLE_COPY[explainerLanguage]}
            </p>
            <div
              className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 ${
                hasCompletedAllPicks ? "bg-amber-50 text-amber-800" : "bg-white text-gray-700"
              }`}
            >
              {savedCount} of {groupStageMatches.length} picks saved
            </div>
          </div>
          <div className="mt-3 flex justify-start">
            <InlineDisclosureButton
              isOpen={isMoreOpen}
              variant="subtle"
              onClick={() => setIsMoreOpen((current) => !current)}
            />
          </div>
          {isMoreOpen ? (
            <>
              <div className="mt-3">
                <DismissibleHelperText
                  storageKey={`pickit:tip:group-picks-explainer:${user.id}`}
                  dismissLabel={HELPER_DISMISS_LABEL_COPY[explainerLanguage]}
                >
                  <ul className="min-w-0 space-y-0.5">
                    {EXPLAINER_COPY[explainerLanguage].map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="shrink-0 text-gray-500">&bull;</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </DismissibleHelperText>
              </div>
              <div className="mx-auto mt-4 max-w-xl">
                <div className={`grid gap-2 ${shouldShowSecondaryKnockoutButton ? "grid-cols-4" : "grid-cols-3"}`}>
                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    className="inline-flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-md border border-accent bg-accent px-2 py-3 text-center text-[11px] font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark sm:text-xs"
                  >
                    {shouldPromoteKnockout ? (
                      isKnockoutSeeded ? (
                        <Network aria-hidden className="h-6 w-6 shrink-0 text-white" />
                      ) : (
                        <SquareCheckBig aria-hidden className="h-6 w-6 shrink-0 text-white" />
                      )
                    ) : (
                      <SquareCheckBig aria-hidden className="h-6 w-6 shrink-0 text-white" />
                    )}
                    <span className="leading-tight">{primaryActionLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoPickAction}
                    disabled={isAutoPicking}
                    className="inline-flex min-h-[88px] w-full flex-col items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-3 text-center text-[11px] font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
                  >
                    <Sparkles aria-hidden className="h-6 w-6 shrink-0 text-accent-dark" />
                    <span className="leading-tight">
                      {isAutoPicking ? AUTO_PICK_LOADING_COPY[autoPickLanguage] : AUTO_PICK_LABEL_COPY[autoPickLanguage]}
                    </span>
                  </button>
                  {shouldShowSecondaryKnockoutButton ? (
                    <Link
                      href="/knockout"
                      className="inline-flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-3 text-center text-[11px] font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light sm:text-xs"
                    >
                      <Network aria-hidden className="h-6 w-6 shrink-0 text-accent-dark" />
                      <span className="leading-tight">My Knockout Picks</span>
                    </Link>
                  ) : null}
                  <Link
                    href="/trophies"
                    className="inline-flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-3 text-center text-[11px] font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light sm:text-xs"
                  >
                    <span className="relative inline-flex h-6 w-6 items-center justify-center text-accent-dark">
                      <Trophy aria-hidden className="h-6 w-6 shrink-0" />
                      <SquareCheckBig aria-hidden className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-[2px] bg-white" />
                    </span>
                    <span className="leading-tight">My Side Picks</span>
                  </Link>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      <div
        ref={stickyControlsRef}
        // Header stays at z-20; this unified cockpit and match-window stack sits beneath it at z-14.
        className="sticky z-[14] -mx-4 bg-white px-4 pb-2 pt-1.5 shadow-[0_12px_22px_-18px_rgba(15,23,42,0.45)] sm:mx-0 sm:rounded-lg sm:border sm:border-gray-200 sm:px-3"
        style={{ top: "calc(var(--app-header-height, 72px) + env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <div className="space-y-2">
          <PredictionChoiceRail
            activeItemKey={selectedGroup}
            onActiveItemChange={handleGroupFilterChange}
            showControls={availableGroups.length + 1 > 1}
          >
            <FilterRailButton
              optionKey={GROUP_FILTER_ALL_KEY}
              isActive={selectedGroup === GROUP_FILTER_ALL_KEY}
              tone="strong"
              onSelect={handleGroupFilterChange}
            >
              All
            </FilterRailButton>
            {availableGroups.map((groupName) => (
              <FilterRailButton
                key={groupName}
                optionKey={groupName}
                isActive={selectedGroup === groupName}
                tone="strong"
                isHighlighted={!selectedGroup || selectedGroup !== groupName ? homeTeamGroupName === groupName : false}
                onSelect={handleGroupFilterChange}
              >
                <span className="flex min-w-6 flex-col items-center gap-0 leading-none">
                  <span className="text-[8px] font-semibold uppercase tracking-wide">Group</span>
                  <span className="text-[15px] font-black">{getGroupShortLabel(groupName)}</span>
                </span>
              </FilterRailButton>
            ))}
          </PredictionChoiceRail>

          {selectedGroup === GROUP_FILTER_ALL_KEY ? null : (
            <PredictionChoiceRail
              activeItemKey={selectedTeamId}
              onActiveItemChange={setSelectedTeamId}
              showControls={availableTeamsForSelectedGroup.length + 1 > 1}
            >
              <FilterRailButton
                optionKey={TEAM_FILTER_ALL_KEY}
                isActive={selectedTeamId === TEAM_FILTER_ALL_KEY}
                onSelect={setSelectedTeamId}
              >
                All Teams
              </FilterRailButton>
              {availableTeamsForSelectedGroup.map((team) => (
                <FilterRailButton
                  key={team.id}
                  optionKey={team.id}
                  isActive={selectedTeamId === team.id}
                  isHighlighted={selectedTeamId !== team.id && user.homeTeamId === team.id}
                  onSelect={setSelectedTeamId}
                >
                  {team.name}
                </FilterRailButton>
              ))}
            </PredictionChoiceRail>
          )}
          <div className="flex flex-wrap items-center justify-center gap-1 text-center text-[11px] font-semibold leading-none text-gray-600">
            <span className="py-0.5">{matchCountSummary}</span>
          </div>
          {selectedGroup === GROUP_FILTER_ALL_KEY ? (
            <div className="space-y-1.5 rounded-lg bg-gray-100 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-dark">
                  MY PICKS FOR KNOCKOUT STAGE
                </p>
              </div>
              {allModeProjectedQualifierCodes.length > 0 ? (
                <div className="mx-auto grid max-w-[32rem] grid-cols-8 justify-center gap-1.5 text-[10px] sm:text-[11px]">
                  {allModeProjectedQualifierCodes.map((team) => (
                    <button
                      key={team.teamId}
                      type="button"
                      onClick={() => handleProjectedQualifierSelect(team.teamId, team.groupName)}
                      aria-label={`Show ${team.teamName} in ${formatGroupName(team.groupName) ?? team.groupName}`}
                      className={`rounded-md px-1.5 py-1 text-center font-bold uppercase tracking-wide transition ${
                        user.homeTeamId === team.teamId
                          ? "bg-amber-200 text-amber-950 hover:bg-amber-300"
                          : "bg-gray-200 text-gray-900 hover:bg-gray-300"
                      }`}
                    >
                      {team.teamCode}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] font-semibold text-gray-500">
                  Save your first group picks to start building your knockout field.
                </p>
              )}
            </div>
          ) : null}
          {selectedGroup !== GROUP_FILTER_ALL_KEY && miniTableGroup ? (
            <section className="space-y-1 rounded-lg bg-gray-100 px-3 py-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPredictionTableOpen) {
                        setIsPredictionTableOpen(true);
                      }
                    }}
                    className={`text-[10px] font-bold uppercase tracking-wide transition ${
                      isPredictionTableOpen
                        ? "cursor-default text-accent-dark"
                        : "text-accent-dark hover:text-accent"
                    }`}
                  >
                    See How Your Predictions Affect The Tables
                  </button>
                  {selectedTeamQualifierStatus ? (
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        selectedTeamQualifierStatus === "projected-r32"
                          ? "bg-emerald-100 text-emerald-800"
                          : selectedTeamQualifierStatus === "best-third"
                            ? "bg-emerald-50 text-emerald-800"
                            : selectedTeamQualifierStatus === "eliminated"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {selectedTeamQualifierStatus === "projected-r32"
                        ? "Projected R32"
                        : selectedTeamQualifierStatus === "best-third"
                          ? "Best 3rd"
                          : selectedTeamQualifierStatus === "eliminated"
                            ? "Eliminated"
                            : "Outside"}
                    </span>
                  ) : null}
                </div>
                <InlineDisclosureButton
                  isOpen={isPredictionTableOpen}
                  variant="subtle"
                  onClick={() => setIsPredictionTableOpen((current) => !current)}
                />
              </div>

              {isPredictionTableOpen ? (
                <>
                  <p className="text-[9px] font-semibold text-gray-500">
                    Top 2 + best 3rd-place teams advance
                  </p>
                  <GroupStandingsMiniTable
                    rows={groupPredictionRows}
                    movementByTeamId={movementByTeamId}
                    showPlayedColumn={false}
                    emptyState="Make picks in this group to build your projected table."
                  />
                </>
              ) : null}
            </section>
          ) : null}
          {renderMatchPager("cockpit")}
        </div>
      </div>

      <div ref={matchListTopRef} aria-hidden />

      {filteredDates.map((date) => {
        const dateMatches = filteredMatchesByDate[date] ?? [];

        return (
          <section key={date} className="space-y-3">
            <div
              ref={(node) => {
                dateSectionRefs.current[date] = node;
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-accent-light px-2.5 py-1.5 text-xs font-semibold text-accent-dark sm:px-3 sm:py-2">
                    {formatWeekdayLabel(date)}
                  </span>
                  <h3 className="text-xl font-black">{formatDateLabel(date)}</h3>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                  {dateMatches.length} match{dateMatches.length === 1 ? "" : "es"}
                </p>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {dateMatches.map((match) => (
                <div
                  key={match.id}
                  className="space-y-2 px-1 py-4 sm:px-0"
                  ref={(node) => {
                    matchCardRefs.current[match.id] = node;
                  }}
                >
                  {focusedMatchId === match.id && dateMatches[0]?.id !== match.id ? (
                    <div className="rounded-md bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700">
                      {formatDateLabel(date)}
                    </div>
                  ) : null}
                  <GroupPredictionCard
                    match={match}
                    matchNumber={filteredMatches.findIndex((item) => item.id === match.id) + 1}
                    grouped
                    prediction={predictions.find((item) => item.matchId === match.id)}
                    prefillSuggestion={
                      autoPickDraft?.matchId === match.id && activeAutoPickToken === autoPickDraft.token
                        ? autoPickDraft
                        : undefined
                    }
                    autoPickHint={
                      autoPickDraft?.matchId === match.id && activeAutoPickToken === autoPickDraft.token
                        ? {
                            sourceText: getAutoPickSourceText(autoPickDraft.source, autoPickLanguage),
                            probabilityText: formatAutoPickProbabilityText(
                              match,
                              autoPickDraft.homeWinProbability,
                              autoPickDraft.drawProbability,
                              autoPickDraft.awayWinProbability
                            )
                          }
                        : undefined
                    }
                    onAutoPickAgain={() => {
                      void (async () => {
                        prepareExplicitMatchNavigation();
                        setIsAutoPicking(true);
                        try {
                          const suggestion = await fetchNextAutoPickForMatches([match.id]);
                          const draft = buildAutoPickDraft(suggestion);
                          triggerAutoPickDraft(draft, { preserveCurrentFilter: true });
                        } catch (error) {
                          const message =
                            error instanceof Error ? error.message : AUTO_PICK_EMPTY_COPY[autoPickLanguage];
                          showAppToast({
                            tone: "error",
                            text: message
                          });
                        } finally {
                          setIsAutoPicking(false);
                        }
                      })();
                    }}
                    autoPickAgainDisabled={isAutoPicking}
                    highlightHomeTeamId={user.homeTeamId ?? null}
                    onDraftStateChange={handleDraftStateChange}
                    footerAnchorRef={(node) => {
                      matchFooterRefs.current[match.id] = node;
                    }}
                    userId={user.id}
                    onSave={handleSave}
                  />
                  {match.status !== "scheduled" ? (
                    <SocialPredictionList
                      match={match}
                      predictions={socialPredictions.filter((item) => item.matchId === match.id)}
                      currentUserId={user.id}
                      currentUserPoints={user.totalPoints}
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
          No matches found for this filter
        </p>
      ) : null}

      {renderMatchPager("content")}
    </div>
  );
}

function PredictionChoiceRail({
  children,
  activeItemKey,
  onActiveItemChange,
  showControls = true
}: {
  children: ReactNode;
  activeItemKey: string;
  onActiveItemChange: (key: string) => void;
  showControls?: boolean;
}) {
  return (
    <WindowChoiceRail
      activeItemKey={activeItemKey}
      onActiveItemChange={onActiveItemChange}
      showControls={showControls}
    >
      {children}
    </WindowChoiceRail>
  );
}

function FilterRailButton({
  children,
  optionKey,
  isActive,
  tone = "default",
  isHighlighted = false,
  onSelect
}: {
  children: ReactNode;
  optionKey: string;
  isActive: boolean;
  tone?: "default" | "strong";
  isHighlighted?: boolean;
  onSelect?: (key: string) => void;
}) {
  return (
    <button
      type="button"
      data-choice-key={optionKey}
      onClick={() => onSelect?.(optionKey)}
      className={`rounded-md border px-1.5 py-0.5 text-[13px] font-bold leading-none transition ${
        isActive
          ? tone === "strong"
            ? "border-accent bg-accent text-white"
            : "border-accent bg-accent-light text-accent-dark"
          : isHighlighted
            ? "border-amber-200 bg-amber-50 text-gray-800 hover:border-amber-300 hover:bg-amber-100"
            : "border-gray-300 bg-white text-gray-700 hover:border-accent hover:bg-accent-light"
      }`}
    >
      {children}
    </button>
  );
}

function getPredictedScoreForTable(prediction: Prediction | undefined, draftState: DraftPredictionState | undefined) {
  if (draftState?.shouldCount) {
    return {
      homeScore: draftState.homeScore,
      awayScore: draftState.awayScore
    };
  }

  if (prediction && prediction.predictedHomeScore !== undefined && prediction.predictedAwayScore !== undefined) {
    return {
      homeScore: prediction.predictedHomeScore,
      awayScore: prediction.predictedAwayScore
    };
  }

  return null;
}

function sortMatchesByKickoff(left: MatchWithTeams, right: MatchWithTeams) {
  return left.kickoffTime.localeCompare(right.kickoffTime);
}

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatWeekdayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short"
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatSavedPredictionSummary(match: MatchWithTeams | undefined, prediction: Prediction) {
  const homeCode = match?.homeTeam?.shortName ?? match?.homeTeam?.name?.slice(0, 3).toUpperCase() ?? "HOME";
  const awayCode = match?.awayTeam?.shortName ?? match?.awayTeam?.name?.slice(0, 3).toUpperCase() ?? "AWAY";
  const homeScore = prediction.predictedHomeScore ?? 0;
  const awayScore = prediction.predictedAwayScore ?? 0;
  return `${homeCode} ${homeScore} vs. ${awayCode} ${awayScore}`;
}

function getAutoPickSourceText(source: string, language: "en" | "es") {
  if (source === "manual" || source === "polymarket") {
    return AUTO_PICK_SOURCE_COPY[language].market;
  }

  if (source === "ranking") {
    return AUTO_PICK_SOURCE_COPY[language].teamStrength;
  }

  return AUTO_PICK_SOURCE_COPY[language].neutral;
}

function formatAutoPickProbabilityText(
  match: MatchWithTeams,
  homeWinProbability: number,
  drawProbability: number,
  awayWinProbability: number
) {
  const homeLabel = match.homeTeam?.shortName ?? match.homeTeam?.name ?? "Home";
  const awayLabel = match.awayTeam?.shortName ?? match.awayTeam?.name ?? "Away";

  return `${homeLabel} ${Math.round(homeWinProbability * 100)}% · Draw ${Math.round(drawProbability * 100)}% · ${awayLabel} ${Math.round(awayWinProbability * 100)}%`;
}
