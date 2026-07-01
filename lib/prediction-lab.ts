import { formatDate, formatDateTime } from "./i18n-format.ts";
import { t } from "./strings.ts";
import type { Match, MatchStage, Team } from "./types.ts";

export const PREDICTION_LAB_TOURNAMENT_ID = "world_cup_2026";
export const PREDICTION_LAB_LOCAL_STORAGE_KEY = "prediction-lab-settings:world-cup-2026";
export const PREDICTION_LAB_AVERAGE_MIN_COUNT = 5;

export const PREDICTION_LAB_ATTENTION_PRESETS = [
  { id: "off", label: "Off", stored: 0, weight: 0 },
  { id: "light", label: "Light", stored: 33, weight: 0.35 },
  { id: "normal", label: "Normal", stored: 67, weight: 1 },
  { id: "heavy", label: "Heavy", stored: 100, weight: 2.2 }
] as const;

export type PredictionLabSignalId = "scheduleLoad" | "availability" | "formQuality" | "crowdPulse" | "publicPulse";
export type PredictionLabAttentionId = (typeof PREDICTION_LAB_ATTENTION_PRESETS)[number]["id"];
export type PredictionLabSignalControlId = keyof PredictionLabSettings;

export type PredictionLabSettings = {
  scheduleLoad: number;
  availability: number;
  formQuality: number;
  crowdPulse: number;
};

export type PredictionLabAverageSummary = {
  groupCount: number;
  averageSettings: PredictionLabSettings | null;
};

export type PredictionLabBracketPick = {
  matchId: string;
  predictedWinnerTeamId: string;
};

export type PredictionLabTeamInput = {
  id: string;
  name: string;
  shortName: string;
  flagEmoji: string;
  fifaRank: number;
  seedScore: number;
  momentumScore: number;
  pathScore: number;
  roundsRemaining: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  matchesPlayed: number;
  lastPlayedAt: string | null;
};

export type PredictionLabMatchInput = {
  id: string;
  stage: Match["stage"];
  status: Match["status"];
  externalId?: string | null;
  kickoffAt: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeTeamShortName: string | null;
  awayTeamShortName: string | null;
  homeTeamFlagEmoji: string | null;
  awayTeamFlagEmoji: string | null;
  homeSource: string | null;
  awaySource: string | null;
  nextMatchId: string | null;
  nextMatchSlot: Match["nextMatchSlot"] | null;
};

export type PredictionLabScenario = {
  matchId: string;
  winnerTeamId: string;
  loserTeamId: string;
} | null;

export type PredictionLabMatchOption = {
  id: string;
  label: string;
};

export type PredictionLabTeamProjection = {
  teamId: string;
  name: string;
  shortName: string;
  flagEmoji: string;
  yourPercent: number;
  crowdPercent: number | null;
};

export type PredictionLabTeamAvailability = {
  teamId: string;
  flaggedCount: number;
  updatedAt: string | null;
};

export type PredictionLabTeamHealthStatus =
  | "ok"
  | "not_configured"
  | "provider_empty"
  | "mapping_empty"
  | "provider_error";

export type PredictionLabTeamHealthSummary = {
  status: PredictionLabTeamHealthStatus;
  teams: PredictionLabTeamAvailability[];
  checkedAt: string | null;
  refreshIntervalSeconds: number;
};

export type PredictionLabSignalRow = {
  id: PredictionLabSignalId;
  controlId: PredictionLabSignalControlId | null;
  label: string;
  evidence: string;
  sourceLabel: string;
  status: "active" | "missing";
  missingReason?: PredictionLabTeamHealthStatus | null;
  lean: number | null;
  confidence: number;
  attentionValue: number;
  attentionLevel: PredictionLabAttentionId;
  attentionWeight: number;
};

export type PredictionLabMatchSide = {
  teamId: string;
  name: string;
  shortName: string;
  flagEmoji: string;
};

export type PredictionLabPathNode = {
  teamId: string | null;
  shortLabel: string;
  flagEmoji: string | null;
  sourceLabel: string | null;
};

export type PredictionLabMiniBracketView = {
  currentRoundLabel: string;
  nextRoundLabel: string | null;
  homeTeam: PredictionLabPathNode;
  awayTeam: PredictionLabPathNode;
  highlightedWinnerTeamId: string | null;
  opponent: PredictionLabPathNode | null;
  winnerAdvancesLabel: string;
  currentPathLabel: string | null;
};

export type PredictionLabMatchLensView = {
  matchId: string;
  title: string;
  kickoffLabel: string | null;
  homeTeam: PredictionLabMatchSide;
  awayTeam: PredictionLabMatchSide;
  signals: PredictionLabSignalRow[];
  compositeLean: number | null;
  compositeBandWidth: number;
  compositeLabel: string;
  agreementLabel: string;
  userPairLabel: string | null;
  crowdPairLabel: string | null;
  crowdLean: number | null;
  publicPairLabel: string | null;
  publicLean: number | null;
  bracketPickTeamId: string | null;
  bracketPickLabel: string | null;
};

export type PredictionLabScenarioImpactTeam = {
  teamId: string;
  shortName: string;
  flagEmoji: string;
};

export type PredictionLabScenarioSummary = {
  selectedMatch: PredictionLabMatchInput | null;
  winnerTeamId: string | null;
  miniBracket: PredictionLabMiniBracketView | null;
  messages: string[];
  nextLensLabel: string | null;
  crowdAlignmentLabel: string | null;
  mostHelped: PredictionLabScenarioImpactTeam[];
  mostHurt: PredictionLabScenarioImpactTeam[];
};

export type PredictionLabViewModel = {
  canShowAverage: boolean;
  selectedMatchId: string | null;
  matchOptions: PredictionLabMatchOption[];
  matchLens: PredictionLabMatchLensView | null;
  scenarioSummary: PredictionLabScenarioSummary;
  projectionRows: PredictionLabTeamProjection[];
  topProjectionRows: PredictionLabTeamProjection[];
};

export const PREDICTION_LAB_DEFAULT_SETTINGS: PredictionLabSettings = {
  scheduleLoad: 67,
  availability: 33,
  formQuality: 67,
  crowdPulse: 33
};

const KNOCKOUT_STAGES_IN_ORDER = ["r32", "r16", "qf", "sf", "final"] as const;

const KNOCKOUT_STAGE_ROUNDS_REMAINING: Record<string, number> = {
  r32: 5,
  round_of_32: 5,
  r16: 4,
  round_of_16: 4,
  qf: 3,
  quarterfinal: 3,
  sf: 2,
  semifinal: 2,
  final: 1
};

const PREDICTION_LAB_BASE_ATTENTION_WEIGHT = 1;

function predictionLabT(language: string | null | undefined, key: string, params: Record<string, string | number> = {}) {
  return t(language, `predictionLab.${key}`, params);
}

export function clampPredictionLabSettingValue(value: number) {
  if (!Number.isFinite(value)) {
    return PREDICTION_LAB_ATTENTION_PRESETS[2].stored;
  }

  return Math.max(
    PREDICTION_LAB_ATTENTION_PRESETS[0].stored,
    Math.min(PREDICTION_LAB_ATTENTION_PRESETS[PREDICTION_LAB_ATTENTION_PRESETS.length - 1].stored, Math.round(value))
  );
}

export function normalizePredictionLabSettings(
  input: Partial<PredictionLabSettings> | null | undefined
): PredictionLabSettings {
  return {
    scheduleLoad: snapToAttentionValue(input?.scheduleLoad ?? PREDICTION_LAB_DEFAULT_SETTINGS.scheduleLoad),
    availability: snapToAttentionValue(input?.availability ?? PREDICTION_LAB_DEFAULT_SETTINGS.availability),
    formQuality: snapToAttentionValue(input?.formQuality ?? PREDICTION_LAB_DEFAULT_SETTINGS.formQuality),
    crowdPulse: snapToAttentionValue(input?.crowdPulse ?? PREDICTION_LAB_DEFAULT_SETTINGS.crowdPulse)
  };
}

export function buildPredictionLabPreferredMatchId(input: {
  upcomingMatches: PredictionLabMatchInput[];
  bracketPicks?: PredictionLabBracketPick[];
}) {
  const selectableMatches = input.upcomingMatches.filter(isSeededPredictionLabMatch);
  if (selectableMatches.length === 0) {
    return null;
  }

  const picksByMatchId = new Map((input.bracketPicks ?? []).map((pick) => [pick.matchId, pick]));
  return (
    selectableMatches.find((match) => picksByMatchId.has(match.id))?.id ??
    selectableMatches.find((match) => match.status === "live")?.id ??
    selectableMatches[0]?.id ??
    null
  );
}

export function buildPredictionLabInputs(input: {
  teams: Team[];
  matches: Match[];
}): {
  activeTeams: PredictionLabTeamInput[];
  upcomingMatches: PredictionLabMatchInput[];
} {
  const teamsById = new Map(input.teams.map((team) => [team.id, team]));
  const knockoutMatches = input.matches.filter((match) => isKnockoutStage(match.stage));
  const finalMatches = input.matches.filter((match) => match.status === "final");
  const participantTeamIds = new Set<string>();
  const eliminatedTeamIds = new Set<string>();

  for (const match of knockoutMatches) {
    if (match.homeTeamId) {
      participantTeamIds.add(match.homeTeamId);
    }
    if (match.awayTeamId) {
      participantTeamIds.add(match.awayTeamId);
    }

    if (match.status === "final" && match.winnerTeamId && match.homeTeamId && match.awayTeamId) {
      const loserTeamId = match.winnerTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
      if (loserTeamId) {
        eliminatedTeamIds.add(loserTeamId);
      }
    }
  }

  const activeTeams = Array.from(participantTeamIds)
    .filter((teamId) => !eliminatedTeamIds.has(teamId))
    .map((teamId) => teamsById.get(teamId))
    .filter((team): team is Team => Boolean(team));

  const teamInputs = activeTeams
    .map((team) => {
      const teamHistory = finalMatches.filter((match) => match.homeTeamId === team.id || match.awayTeamId === team.id);
      const wins = teamHistory.filter((match) => match.winnerTeamId === team.id).length;
      const draws = teamHistory.filter((match) => match.winnerTeamId == null).length;
      const losses = Math.max(0, teamHistory.length - wins - draws);
      const goalsFor = teamHistory.reduce((sum, match) => {
        if (match.homeTeamId === team.id) {
          return sum + (match.homeScore ?? 0);
        }
        if (match.awayTeamId === team.id) {
          return sum + (match.awayScore ?? 0);
        }
        return sum;
      }, 0);
      const goalsAgainst = teamHistory.reduce((sum, match) => {
        if (match.homeTeamId === team.id) {
          return sum + (match.awayScore ?? 0);
        }
        if (match.awayTeamId === team.id) {
          return sum + (match.homeScore ?? 0);
        }
        return sum;
      }, 0);
      const winRate = teamHistory.length > 0 ? wins / teamHistory.length : 0.5;
      const goalDiffPerMatch =
        teamHistory.length > 0 ? (goalsFor - goalsAgainst) / Math.max(1, teamHistory.length * 3) : 0;
      const momentumScore = clamp01(0.5 + (winRate - 0.5) * 0.7 + goalDiffPerMatch * 0.45);
      const lastPlayedAt = teamHistory
        .map((match) => toTimestamp(match.kickoffAt ?? match.kickoffTime ?? null))
        .filter((value): value is number => Number.isFinite(value))
        .sort((left, right) => right - left)[0];
      const nextMatch = knockoutMatches
        .filter((match) => match.status !== "final" && (match.homeTeamId === team.id || match.awayTeamId === team.id))
        .sort(compareMatchesByKickoff)[0] ?? null;
      const roundsRemaining = nextMatch ? getRoundsRemainingForStage(nextMatch.stage) : 1;
      const nextOpponentId =
        nextMatch?.homeTeamId === team.id ? nextMatch.awayTeamId ?? null : nextMatch?.awayTeamId === team.id ? nextMatch.homeTeamId ?? null : null;
      const nextOpponent = nextOpponentId ? teamsById.get(nextOpponentId) ?? null : null;
      const opponentEase = nextOpponent ? normalizeOpponentEase(nextOpponent.fifaRank, input.teams) : 0.5;
      const stageAdvantage = clamp01(1 - (roundsRemaining - 1) / 4);
      const pathScore = clamp01(stageAdvantage * 0.5 + opponentEase * 0.5);

      return {
        id: team.id,
        name: team.name,
        shortName: team.shortName,
        flagEmoji: team.flagEmoji,
        fifaRank: team.fifaRank,
        seedScore: normalizeSeedStrength(team.fifaRank, input.teams),
        momentumScore,
        pathScore,
        roundsRemaining,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        matchesPlayed: teamHistory.length,
        lastPlayedAt: lastPlayedAt ? new Date(lastPlayedAt).toISOString() : null
      } satisfies PredictionLabTeamInput;
    })
    .sort((left, right) => left.fifaRank - right.fifaRank || left.name.localeCompare(right.name));

  const upcomingMatches: PredictionLabMatchInput[] = knockoutMatches
    .filter((match) => match.status !== "final")
    .sort(compareMatchesByKickoff)
    .map((match) => {
      const homeTeam = match.homeTeamId ? teamsById.get(match.homeTeamId) ?? null : null;
      const awayTeam = match.awayTeamId ? teamsById.get(match.awayTeamId) ?? null : null;

      return {
        id: match.id,
        stage: match.stage,
        status: match.status,
        externalId: match.externalId ?? null,
        kickoffAt: match.kickoffAt ?? match.kickoffTime ?? null,
        homeTeamId: homeTeam?.id ?? match.homeTeamId ?? null,
        awayTeamId: awayTeam?.id ?? match.awayTeamId ?? null,
        homeTeamName: homeTeam?.name ?? null,
        awayTeamName: awayTeam?.name ?? null,
        homeTeamShortName: homeTeam?.shortName ?? null,
        awayTeamShortName: awayTeam?.shortName ?? null,
        homeTeamFlagEmoji: homeTeam?.flagEmoji ?? null,
        awayTeamFlagEmoji: awayTeam?.flagEmoji ?? null,
        homeSource: match.homeSource ?? null,
        awaySource: match.awaySource ?? null,
        nextMatchId: match.nextMatchId ?? null,
        nextMatchSlot: match.nextMatchSlot ?? null
      } satisfies PredictionLabMatchInput;
    });

  return {
    activeTeams: teamInputs,
    upcomingMatches
  };
}

export function buildPredictionLabViewModel(input: {
  activeTeams: PredictionLabTeamInput[];
  upcomingMatches: PredictionLabMatchInput[];
  settings: PredictionLabSettings;
  averageSummary?: PredictionLabAverageSummary | null;
  teamHealthSummary?: PredictionLabTeamHealthSummary | null;
  availabilityByTeamId?: Map<string, PredictionLabTeamAvailability> | null;
  publicBasePercentByTeamId?: Map<string, number> | null;
  publicMatchPulseByMatchId?: Map<string, { homePercent: number; awayPercent: number; provider: "api-football" }> | null;
  scenario?: PredictionLabScenario;
  focusMatchId?: string | null;
  bracketPicks?: PredictionLabBracketPick[];
  topCount?: number;
  language?: string | null;
}): PredictionLabViewModel {
  const language = input.language ?? "en";
  const settings = normalizePredictionLabSettings(input.settings);
  const averageSettings = input.averageSummary?.averageSettings ?? null;
  const canShowAverage = Boolean(
    input.averageSummary &&
      input.averageSummary.groupCount >= PREDICTION_LAB_AVERAGE_MIN_COUNT &&
      averageSettings
  );
  const bracketPicksByMatchId = new Map((input.bracketPicks ?? []).map((pick) => [pick.matchId, pick]));
  const activeTeamsById = new Map(input.activeTeams.map((team) => [team.id, team]));
  const availabilityByTeamId =
    input.availabilityByTeamId ??
    (input.teamHealthSummary ? new Map(input.teamHealthSummary.teams.map((summary) => [summary.teamId, summary])) : null);
  const teamHealthStatus = input.teamHealthSummary?.status ?? (availabilityByTeamId ? "ok" : "not_configured");
  const matchOptions = input.upcomingMatches
    .filter(isSeededPredictionLabMatch)
    .map((match) => ({
      id: match.id,
      label: `${match.homeTeamShortName} vs ${match.awayTeamShortName} · ${formatCompactDate(match.kickoffAt, language)}`
    }));
  const selectedMatchId =
    input.focusMatchId && matchOptions.some((option) => option.id === input.focusMatchId)
      ? input.focusMatchId
      : buildPredictionLabPreferredMatchId({
          upcomingMatches: input.upcomingMatches,
          bracketPicks: input.bracketPicks
        });
  const focusMatch = input.upcomingMatches.find((match) => match.id === selectedMatchId);
  const seededFocusMatch = focusMatch && isSeededPredictionLabMatch(focusMatch) ? focusMatch : null;

  const crowdBasePercentByTeamId =
    canShowAverage && averageSettings
      ? buildProjectionPercentByTeamId({
          teams: input.activeTeams,
          settings: averageSettings,
          availabilityByTeamId,
          crowdSignalByTeamId: null,
          scenario: null
        })
      : null;
  const publicBasePercentByTeamId = input.publicBasePercentByTeamId ?? buildRankFormPercentByTeamId(input.activeTeams);
  const publicMatchPulseByMatchId = input.publicMatchPulseByMatchId ?? null;
  const userProjectionPercentByTeamId = buildProjectionPercentByTeamId({
    teams: input.activeTeams,
    settings,
    availabilityByTeamId,
    crowdSignalByTeamId: crowdBasePercentByTeamId,
    scenario: null
  });

  const matchLens = seededFocusMatch
    ? buildMatchLensView({
        language,
        match: seededFocusMatch,
        activeTeamsById,
        upcomingMatches: input.upcomingMatches,
        settings,
        teamHealthStatus,
        availabilityByTeamId,
        groupCount: input.averageSummary?.groupCount ?? 0,
        crowdBasePercentByTeamId,
        publicBasePercentByTeamId,
        publicMatchPulseByMatchId,
        bracketPickTeamId: bracketPicksByMatchId.get(seededFocusMatch.id)?.predictedWinnerTeamId ?? null
      })
    : null;

  const scenarioSummary = buildScenarioSummary({
    language,
    match: seededFocusMatch,
    activeTeams: input.activeTeams,
    upcomingMatches: input.upcomingMatches,
    settings,
    teamHealthStatus,
    availabilityByTeamId,
    crowdBasePercentByTeamId,
    currentProjectionPercentByTeamId: userProjectionPercentByTeamId,
    scenario: input.scenario ?? null,
    bracketPickTeamId: seededFocusMatch ? bracketPicksByMatchId.get(seededFocusMatch.id)?.predictedWinnerTeamId ?? null : null
  });

  const projectionRows = input.activeTeams
    .map((team) => ({
      teamId: team.id,
      name: team.name,
      shortName: team.shortName,
      flagEmoji: team.flagEmoji,
      yourPercent: userProjectionPercentByTeamId.get(team.id) ?? 0,
      crowdPercent: canShowAverage ? crowdBasePercentByTeamId?.get(team.id) ?? null : null
    }))
    .sort((left, right) => right.yourPercent - left.yourPercent || left.name.localeCompare(right.name));

  return {
    canShowAverage,
    selectedMatchId,
    matchOptions,
    matchLens,
    scenarioSummary,
    projectionRows,
    topProjectionRows: projectionRows.slice(0, input.topCount ?? 6)
  };
}

function buildMatchLensView(input: {
  language: string | null | undefined;
  match: SeededPredictionLabMatch;
  activeTeamsById: Map<string, PredictionLabTeamInput>;
  upcomingMatches: PredictionLabMatchInput[];
  settings: PredictionLabSettings;
  teamHealthStatus: PredictionLabTeamHealthStatus;
  availabilityByTeamId: Map<string, PredictionLabTeamAvailability> | null;
  groupCount: number;
  crowdBasePercentByTeamId: Map<string, number> | null;
  publicBasePercentByTeamId: Map<string, number> | null;
  publicMatchPulseByMatchId: Map<string, { homePercent: number; awayPercent: number; provider: "api-football" }> | null;
  bracketPickTeamId: string | null;
}): PredictionLabMatchLensView {
  const signals = buildMatchLensSignals({
    language: input.language,
    match: input.match,
    activeTeamsById: input.activeTeamsById,
    settings: input.settings,
    teamHealthStatus: input.teamHealthStatus,
    availabilityByTeamId: input.availabilityByTeamId,
    groupCount: input.groupCount,
    crowdBasePercentByTeamId: input.crowdBasePercentByTeamId,
    publicBasePercentByTeamId: input.publicBasePercentByTeamId,
    publicMatchPulseByMatchId: input.publicMatchPulseByMatchId
  });
  const signalSummary = summarizePredictionLabSignals(signals);
  const activeSignals = signalSummary.activeSignals;
  const compositeLean = signalSummary.compositeLean;
  const disagreement = signalSummary.disagreement;
  const homePercent = compositeLean === null ? 50 : round1(50 - compositeLean / 2);
  const awayPercent = compositeLean === null ? 50 : round1(50 + compositeLean / 2);
  const crowdSignal = signals.find((signal) => signal.id === "crowdPulse" && signal.status === "active" && signal.lean !== null) ?? null;
  const publicSignal =
    signals.find((signal) => signal.id === "publicPulse" && signal.status === "active" && signal.lean !== null) ?? null;
  const crowdHomePercent = crowdSignal?.lean === null || crowdSignal?.lean === undefined ? null : round1(50 - crowdSignal.lean / 2);
  const crowdAwayPercent = crowdSignal?.lean === null || crowdSignal?.lean === undefined ? null : round1(50 + crowdSignal.lean / 2);
  const publicHomePercent =
    publicSignal?.lean === null || publicSignal?.lean === undefined ? null : round1(50 - publicSignal.lean / 2);
  const publicAwayPercent =
    publicSignal?.lean === null || publicSignal?.lean === undefined ? null : round1(50 + publicSignal.lean / 2);

  return {
    matchId: input.match.id,
    title: `${input.match.homeTeamShortName} vs ${input.match.awayTeamShortName}`,
    kickoffLabel: formatPredictionLabKickoff(input.match.kickoffAt, input.language),
    homeTeam: {
      teamId: input.match.homeTeamId,
      name: input.match.homeTeamName,
      shortName: input.match.homeTeamShortName,
      flagEmoji: input.match.homeTeamFlagEmoji
    },
    awayTeam: {
      teamId: input.match.awayTeamId,
      name: input.match.awayTeamName,
      shortName: input.match.awayTeamShortName,
      flagEmoji: input.match.awayTeamFlagEmoji
    },
    signals,
    compositeLean,
    compositeBandWidth: Math.max(
      14,
      Math.min(52, round1(14 + disagreement * 0.38 + (1 - signalSummary.intensityFactor) * 8))
    ),
    compositeLabel: describeLensLean(
      input.language,
      predictionLabT(input.language, "matchLens.yourLensSubject"),
      compositeLean,
      input.match.homeTeamShortName,
      input.match.awayTeamShortName
    ),
    agreementLabel: describeSignalAgreement(input.language, activeSignals.length, disagreement, compositeLean),
    userPairLabel: `${input.match.homeTeamShortName} ${homePercent.toFixed(1)}% · ${input.match.awayTeamShortName} ${awayPercent.toFixed(1)}%`,
    crowdPairLabel:
      crowdHomePercent === null || crowdAwayPercent === null
        ? null
        : `${input.match.homeTeamShortName} ${crowdHomePercent.toFixed(1)}% · ${input.match.awayTeamShortName} ${crowdAwayPercent.toFixed(1)}%`,
    crowdLean: crowdSignal?.lean ?? null,
    publicPairLabel:
      publicHomePercent === null || publicAwayPercent === null
        ? null
        : `${input.match.homeTeamShortName} ${publicHomePercent.toFixed(1)}% · ${input.match.awayTeamShortName} ${publicAwayPercent.toFixed(1)}%`,
    publicLean: publicSignal?.lean ?? null,
    bracketPickTeamId: input.bracketPickTeamId,
    bracketPickLabel: input.bracketPickTeamId
      ? input.bracketPickTeamId === input.match.homeTeamId
        ? predictionLabT(input.language, "matchLens.bracketPickIs", { team: input.match.homeTeamShortName })
        : input.bracketPickTeamId === input.match.awayTeamId
          ? predictionLabT(input.language, "matchLens.bracketPickIs", { team: input.match.awayTeamShortName })
          : null
      : null
  };
}

function buildMatchLensSignals(input: {
  language: string | null | undefined;
  match: SeededPredictionLabMatch;
  activeTeamsById: Map<string, PredictionLabTeamInput>;
  settings: PredictionLabSettings;
  teamHealthStatus: PredictionLabTeamHealthStatus;
  availabilityByTeamId: Map<string, PredictionLabTeamAvailability> | null;
  groupCount: number;
  crowdBasePercentByTeamId: Map<string, number> | null;
  publicBasePercentByTeamId: Map<string, number> | null;
  publicMatchPulseByMatchId: Map<string, { homePercent: number; awayPercent: number; provider: "api-football" }> | null;
}) {
  const homeTeam = input.activeTeamsById.get(input.match.homeTeamId);
  const awayTeam = input.activeTeamsById.get(input.match.awayTeamId);
  if (!homeTeam || !awayTeam) {
    return [] as PredictionLabSignalRow[];
  }

  const crowdPairPercent = input.crowdBasePercentByTeamId
    ? normalizePairPercent(input.crowdBasePercentByTeamId, homeTeam.id, awayTeam.id)
    : null;
  const publicPulse = input.publicMatchPulseByMatchId?.get(input.match.id) ?? null;
  const publicPairPercent = publicPulse
    ? publicPulse.homePercent
    : input.publicBasePercentByTeamId
      ? normalizePairPercent(input.publicBasePercentByTeamId, homeTeam.id, awayTeam.id)
      : null;

  return [
    buildScheduleLoadSignal(input.language, input.match, homeTeam, awayTeam, input.settings.scheduleLoad),
    buildAvailabilitySignal(
      input.language,
      homeTeam,
      awayTeam,
      input.teamHealthStatus,
      input.availabilityByTeamId,
      input.settings.availability
    ),
    buildFormQualitySignal(input.language, homeTeam, awayTeam, input.settings.formQuality),
    buildPublicPulseSignal(input.language, homeTeam, awayTeam, publicPairPercent, publicPulse?.provider ?? null),
    buildCrowdPulseSignal(
      input.language,
      homeTeam,
      awayTeam,
      input.settings.crowdPulse,
      crowdPairPercent,
      input.groupCount
    )
  ];
}

function buildScheduleLoadSignal(
  language: string | null | undefined,
  match: SeededPredictionLabMatch,
  homeTeam: PredictionLabTeamInput,
  awayTeam: PredictionLabTeamInput,
  attentionValue: number
): PredictionLabSignalRow {
  const preset = getAttentionPreset(attentionValue);
  const kickoffAt = toTimestamp(match.kickoffAt);
  const homeLastPlayedAt = toTimestamp(homeTeam.lastPlayedAt);
  const awayLastPlayedAt = toTimestamp(awayTeam.lastPlayedAt);
  if (!kickoffAt || !homeLastPlayedAt || !awayLastPlayedAt) {
    return {
      id: "scheduleLoad",
      controlId: "scheduleLoad",
      label: predictionLabT(language, "signals.scheduleLoad.label"),
      evidence: predictionLabT(language, "signals.scheduleLoad.missingEvidence"),
      sourceLabel: predictionLabT(language, "signals.scheduleLoad.source"),
      status: "missing",
      lean: null,
      confidence: 0,
      attentionValue,
      attentionLevel: preset.id,
      attentionWeight: preset.weight
    };
  }

  const homeRestDays = Math.max(0, (kickoffAt - homeLastPlayedAt) / DAY_IN_MS);
  const awayRestDays = Math.max(0, (kickoffAt - awayLastPlayedAt) / DAY_IN_MS);
  const restDelta = round1(homeRestDays - awayRestDays);
  const lean = clampSigned(round1(restDelta * -18));
  const confidence = Math.min(0.78, 0.34 + Math.min(Math.abs(restDelta), 4) * 0.09);

  return {
    id: "scheduleLoad",
    controlId: "scheduleLoad",
    label: predictionLabT(language, "signals.scheduleLoad.label"),
    evidence: predictionLabT(language, "signals.scheduleLoad.evidence", {
      homeShort: homeTeam.shortName,
      homeRest: formatRestDays(homeRestDays),
      awayShort: awayTeam.shortName,
      awayRest: formatRestDays(awayRestDays)
    }),
    sourceLabel: predictionLabT(language, "signals.scheduleLoad.source"),
    status: "active",
    lean,
    confidence,
    attentionValue,
    attentionLevel: preset.id,
    attentionWeight: preset.weight
  };
}

function buildAvailabilitySignal(
  language: string | null | undefined,
  homeTeam: PredictionLabTeamInput,
  awayTeam: PredictionLabTeamInput,
  teamHealthStatus: PredictionLabTeamHealthStatus,
  availabilityByTeamId: Map<string, PredictionLabTeamAvailability> | null,
  attentionValue: number
): PredictionLabSignalRow {
  const preset = getAttentionPreset(attentionValue);
  if (teamHealthStatus !== "ok" || !availabilityByTeamId) {
    return {
      id: "availability",
      controlId: null,
      label: predictionLabT(language, "signals.availability.label"),
      evidence: describeTeamHealthMissingEvidence(language, teamHealthStatus),
      sourceLabel: predictionLabT(language, "signals.availability.source"),
      status: "missing",
      missingReason: teamHealthStatus,
      lean: null,
      confidence: 0,
      attentionValue,
      attentionLevel: preset.id,
      attentionWeight: preset.weight
    };
  }

  const homeFlags = availabilityByTeamId.get(homeTeam.id)?.flaggedCount ?? 0;
  const awayFlags = availabilityByTeamId.get(awayTeam.id)?.flaggedCount ?? 0;
  const totalFlags = homeFlags + awayFlags;

  return {
    id: "availability",
    controlId: "availability",
    label: predictionLabT(language, "signals.availability.label"),
    evidence: predictionLabT(language, "signals.availability.evidence", {
      homeShort: homeTeam.shortName,
      homeCount: homeFlags,
      awayShort: awayTeam.shortName,
      awayCount: awayFlags
    }),
    sourceLabel: predictionLabT(language, "signals.availability.source"),
    status: "active",
    missingReason: null,
    lean: clampSigned(round1((homeFlags - awayFlags) * 22)),
    confidence: totalFlags === 0 ? 0.3 : Math.min(0.84, 0.38 + Math.min(totalFlags, 5) * 0.08),
    attentionValue,
    attentionLevel: preset.id,
    attentionWeight: preset.weight
  };
}

function describeTeamHealthMissingEvidence(
  language: string | null | undefined,
  teamHealthStatus: PredictionLabTeamHealthStatus
) {
  switch (teamHealthStatus) {
    case "not_configured":
      return predictionLabT(language, "signals.availability.notConfiguredEvidence");
    case "provider_empty":
      return predictionLabT(language, "signals.availability.noUpdatesEvidence");
    case "mapping_empty":
      return predictionLabT(language, "signals.availability.mappingEvidence");
    case "provider_error":
      return predictionLabT(language, "signals.availability.errorEvidence");
    case "ok":
    default:
      return predictionLabT(language, "signals.availability.missingEvidence");
  }
}

function buildFormQualitySignal(
  language: string | null | undefined,
  homeTeam: PredictionLabTeamInput,
  awayTeam: PredictionLabTeamInput,
  attentionValue: number
): PredictionLabSignalRow {
  const preset = getAttentionPreset(attentionValue);
  const homeComposite = clamp01(homeTeam.seedScore * 0.52 + homeTeam.momentumScore * 0.48);
  const awayComposite = clamp01(awayTeam.seedScore * 0.52 + awayTeam.momentumScore * 0.48);
  const lean = clampSigned(round1((awayComposite - homeComposite) * 100));
  const confidence = Math.min(
    0.92,
    0.56 + Math.min(homeTeam.matchesPlayed + awayTeam.matchesPlayed, 8) * 0.04
  );

  return {
    id: "formQuality",
    controlId: "formQuality",
    label: predictionLabT(language, "signals.formQuality.label"),
    evidence: predictionLabT(language, "signals.formQuality.evidence", {
      homeShort: homeTeam.shortName,
      homeRank: homeTeam.fifaRank,
      homeRecord: formatRecord(homeTeam),
      awayShort: awayTeam.shortName,
      awayRank: awayTeam.fifaRank,
      awayRecord: formatRecord(awayTeam)
    }),
    sourceLabel: predictionLabT(language, "signals.formQuality.source"),
    status: "active",
    lean,
    confidence,
    attentionValue,
    attentionLevel: preset.id,
    attentionWeight: preset.weight
  };
}

function buildPublicPulseSignal(
  language: string | null | undefined,
  homeTeam: PredictionLabTeamInput,
  awayTeam: PredictionLabTeamInput,
  homePublicPercent: number | null,
  provider: "api-football" | null
): PredictionLabSignalRow {
  if (homePublicPercent === null) {
    return {
      id: "publicPulse",
      controlId: null,
      label: predictionLabT(language, "signals.publicPulse.label"),
      evidence: predictionLabT(language, "signals.publicPulse.missingEvidence"),
      sourceLabel: predictionLabT(language, "signals.publicPulse.source"),
      status: "missing",
      lean: null,
      confidence: 0,
      attentionValue: 0,
      attentionLevel: "off",
      attentionWeight: 0
    };
  }

  const awayPublicPercent = round1(100 - homePublicPercent);
  return {
    id: "publicPulse",
    controlId: null,
    label: predictionLabT(language, "signals.publicPulse.label"),
    evidence: predictionLabT(language, provider === "api-football" ? "signals.publicPulse.providerEvidence" : "signals.publicPulse.evidence", {
      homePercent: homePublicPercent.toFixed(0),
      homeShort: homeTeam.shortName,
      awayPercent: awayPublicPercent.toFixed(0),
      awayShort: awayTeam.shortName
    }),
    sourceLabel: predictionLabT(
      language,
      provider === "api-football" ? "signals.publicPulse.providerSource" : "signals.publicPulse.source"
    ),
    status: "active",
    lean: clampSigned(round1(awayPublicPercent - homePublicPercent)),
    confidence: provider === "api-football" ? 0.76 : 0.68,
    attentionValue: 67,
    attentionLevel: "normal",
    attentionWeight: 1
  };
}

function buildCrowdPulseSignal(
  language: string | null | undefined,
  homeTeam: PredictionLabTeamInput,
  awayTeam: PredictionLabTeamInput,
  attentionValue: number,
  homeCrowdPercent: number | null,
  groupCount: number
): PredictionLabSignalRow {
  const preset = getAttentionPreset(attentionValue);
  if (homeCrowdPercent === null || groupCount < PREDICTION_LAB_AVERAGE_MIN_COUNT) {
    return {
      id: "crowdPulse",
      controlId: "crowdPulse",
      label: predictionLabT(language, "signals.crowdPulse.label"),
      evidence: predictionLabT(language, "signals.crowdPulse.missingEvidence"),
      sourceLabel: predictionLabT(language, "signals.crowdPulse.source"),
      status: "missing",
      lean: null,
      confidence: 0,
      attentionValue,
      attentionLevel: preset.id,
      attentionWeight: preset.weight
    };
  }

  const awayCrowdPercent = round1(100 - homeCrowdPercent);
  return {
    id: "crowdPulse",
    controlId: "crowdPulse",
    label: predictionLabT(language, "signals.crowdPulse.label"),
    evidence: predictionLabT(language, "signals.crowdPulse.evidence", {
      homePercent: homeCrowdPercent.toFixed(0),
      homeShort: homeTeam.shortName,
      awayPercent: awayCrowdPercent.toFixed(0),
      awayShort: awayTeam.shortName
    }),
    sourceLabel: predictionLabT(language, "signals.crowdPulse.source"),
    status: "active",
    lean: clampSigned(round1(awayCrowdPercent - homeCrowdPercent)),
    confidence: Math.min(0.9, 0.36 + Math.min(groupCount - 4, 8) * 0.05),
    attentionValue,
    attentionLevel: preset.id,
    attentionWeight: preset.weight
  };
}

function buildScenarioSummary(input: {
  language: string | null | undefined;
  match: SeededPredictionLabMatch | null;
  activeTeams: PredictionLabTeamInput[];
  upcomingMatches: PredictionLabMatchInput[];
  settings: PredictionLabSettings;
  teamHealthStatus: PredictionLabTeamHealthStatus;
  availabilityByTeamId: Map<string, PredictionLabTeamAvailability> | null;
  crowdBasePercentByTeamId: Map<string, number> | null;
  currentProjectionPercentByTeamId: Map<string, number>;
  scenario: PredictionLabScenario;
  bracketPickTeamId: string | null;
}): PredictionLabScenarioSummary {
  if (!input.match) {
    return {
      selectedMatch: null,
      winnerTeamId: null,
      miniBracket: null,
      messages: [],
      nextLensLabel: null,
      crowdAlignmentLabel: null,
      mostHelped: [],
      mostHurt: []
    };
  }

  if (!input.scenario || input.scenario.matchId !== input.match.id) {
    return {
      selectedMatch: input.match,
      winnerTeamId: null,
      miniBracket: buildMiniBracketView(input.language, input.match, input.upcomingMatches, null),
      messages: [],
      nextLensLabel: null,
      crowdAlignmentLabel: null,
      mostHelped: [],
      mostHurt: []
    };
  }

  const winnerShortName =
    input.scenario.winnerTeamId === input.match.homeTeamId
      ? input.match.homeTeamShortName
      : input.match.awayTeamShortName;
  const scenarioPercentByTeamId = buildProjectionPercentByTeamId({
    teams: input.activeTeams,
    settings: input.settings,
    availabilityByTeamId: input.availabilityByTeamId,
    crowdSignalByTeamId: input.crowdBasePercentByTeamId,
    scenario: input.scenario
  });
  const scenarioMiniBracket = buildMiniBracketView(
    input.language,
    input.match,
    input.upcomingMatches,
    input.scenario.winnerTeamId
  );
  const messages = [
    scenarioMiniBracket?.opponent
      ? predictionLabT(input.language, "scenario.advancesToFace", {
          team: winnerShortName,
          opponent: scenarioMiniBracket.opponent.shortLabel
        })
      : predictionLabT(input.language, "scenario.advances", { team: winnerShortName })
  ];
  if (input.bracketPickTeamId) {
    messages.push(
      input.bracketPickTeamId === input.scenario.winnerTeamId
        ? predictionLabT(input.language, "scenario.keepsBracketPick")
        : predictionLabT(input.language, "scenario.flipsBracketPick")
    );
  }
  if (scenarioMiniBracket?.currentPathLabel) {
    messages.push(predictionLabT(input.language, "scenario.pathWindow", { path: scenarioMiniBracket.currentPathLabel }));
  }

  const crowdPairPercent =
    input.crowdBasePercentByTeamId
      ? normalizePairPercent(input.crowdBasePercentByTeamId, input.match.homeTeamId, input.match.awayTeamId)
      : null;
  const crowdAlignmentLabel =
    crowdPairPercent === null
      ? null
      : (() => {
          const crowdWinnerTeamId = crowdPairPercent >= 50 ? input.match.homeTeamId : input.match.awayTeamId;
          return crowdWinnerTeamId === input.scenario.winnerTeamId
            ? predictionLabT(input.language, "scenario.alignsWithCrowd")
            : predictionLabT(input.language, "scenario.againstCrowd");
        })();

  const nextLensLabel =
    scenarioMiniBracket?.opponent?.teamId
      ? buildNextLensLabel({
          language: input.language,
          winnerTeamId: input.scenario.winnerTeamId,
          opponentTeamId: scenarioMiniBracket.opponent.teamId,
          activeTeams: input.activeTeams,
          teamHealthStatus: input.teamHealthStatus,
          availabilityByTeamId: input.availabilityByTeamId,
          crowdBasePercentByTeamId: input.crowdBasePercentByTeamId,
          settings: input.settings
        })
      : null;

  const changes = input.activeTeams
    .map((team) => {
      const before = input.currentProjectionPercentByTeamId.get(team.id) ?? 0;
      const after = scenarioPercentByTeamId.get(team.id) ?? 0;
      return {
        teamId: team.id,
        shortName: team.shortName,
        flagEmoji: team.flagEmoji,
        delta: round1(after - before),
        eliminated: before > 0.1 && after <= 0.1
      };
    })
    .filter((change) => Math.abs(change.delta) >= 0.1 || change.eliminated)
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  return {
    selectedMatch: input.match,
    winnerTeamId: input.scenario.winnerTeamId,
    miniBracket: scenarioMiniBracket,
    messages,
    nextLensLabel,
    crowdAlignmentLabel,
    mostHelped: changes
      .filter((change) => change.delta > 0)
      .slice(0, 2)
      .map((change) => ({ teamId: change.teamId, shortName: change.shortName, flagEmoji: change.flagEmoji })),
    mostHurt: changes
      .filter((change) => change.delta < 0 || change.eliminated)
      .slice(0, 2)
      .map((change) => ({ teamId: change.teamId, shortName: change.shortName, flagEmoji: change.flagEmoji }))
  };
}

function buildNextLensLabel(input: {
  language: string | null | undefined;
  winnerTeamId: string;
  opponentTeamId: string;
  activeTeams: PredictionLabTeamInput[];
  teamHealthStatus: PredictionLabTeamHealthStatus;
  availabilityByTeamId: Map<string, PredictionLabTeamAvailability> | null;
  crowdBasePercentByTeamId: Map<string, number> | null;
  settings: PredictionLabSettings;
}) {
  const teamsById = new Map(input.activeTeams.map((team) => [team.id, team]));
  const winner = teamsById.get(input.winnerTeamId);
  const opponent = teamsById.get(input.opponentTeamId);
  if (!winner || !opponent) {
    return null;
  }

  const availabilitySignal = buildAvailabilitySignal(
    input.language,
    winner,
    opponent,
    input.teamHealthStatus,
    input.availabilityByTeamId,
    input.settings.availability
  );
  const formSignal = buildFormQualitySignal(input.language, winner, opponent, input.settings.formQuality);
  const crowdPairPercent =
    input.crowdBasePercentByTeamId
      ? normalizePairPercent(input.crowdBasePercentByTeamId, winner.id, opponent.id)
      : null;
  const crowdSignal = buildCrowdPulseSignal(
    input.language,
    winner,
    opponent,
    input.settings.crowdPulse,
    crowdPairPercent,
    crowdPairPercent === null ? 0 : PREDICTION_LAB_AVERAGE_MIN_COUNT
  );
  const signalSummary = summarizePredictionLabSignals([availabilitySignal, formSignal, crowdSignal]);
  if (signalSummary.activeSignals.length === 0 || signalSummary.compositeLean === null) {
    return null;
  }

  return describeLensLean(
    input.language,
    predictionLabT(input.language, "scenario.nextLensSubject"),
    signalSummary.compositeLean,
    winner.shortName,
    opponent.shortName
  );
}

function buildMiniBracketView(
  language: string | null | undefined,
  focusMatch: SeededPredictionLabMatch,
  matches: PredictionLabMatchInput[],
  highlightedWinnerTeamId: string | null
): PredictionLabMiniBracketView | null {
  const nextMatch = focusMatch.nextMatchId ? matches.find((match) => match.id === focusMatch.nextMatchId) ?? null : null;
  const opponent = nextMatch ? resolveNextRoundOpponent(language, focusMatch, nextMatch, matches) : null;
  const pathLabel =
    highlightedWinnerTeamId === focusMatch.homeTeamId
      ? focusMatch.homeTeamShortName
      : highlightedWinnerTeamId === focusMatch.awayTeamId
        ? focusMatch.awayTeamShortName
        : predictionLabT(language, "quickScenario.winnerShortLabel");

  return {
    currentRoundLabel: formatStageLabel(focusMatch.stage, language),
    nextRoundLabel: nextMatch ? formatStageLabel(nextMatch.stage, language) : null,
    homeTeam: {
      teamId: focusMatch.homeTeamId,
      shortLabel: focusMatch.homeTeamShortName,
      flagEmoji: focusMatch.homeTeamFlagEmoji,
      sourceLabel: focusMatch.homeSource ?? null
    },
    awayTeam: {
      teamId: focusMatch.awayTeamId,
      shortLabel: focusMatch.awayTeamShortName,
      flagEmoji: focusMatch.awayTeamFlagEmoji,
      sourceLabel: focusMatch.awaySource ?? null
    },
    highlightedWinnerTeamId,
    opponent,
    winnerAdvancesLabel: opponent
      ? predictionLabT(language, "quickScenario.winnerFaces", { team: opponent.shortLabel })
      : predictionLabT(language, "quickScenario.winnerAdvances"),
    currentPathLabel: highlightedWinnerTeamId && opponent
      ? predictionLabT(language, "quickScenario.currentPath", { team: pathLabel, opponent: opponent.shortLabel })
      : null
  };
}

function resolveNextRoundOpponent(
  language: string | null | undefined,
  focusMatch: PredictionLabMatchInput,
  nextMatch: PredictionLabMatchInput,
  matches: PredictionLabMatchInput[]
): PredictionLabPathNode | null {
  const opponentSlot = focusMatch.nextMatchSlot === "home" ? "away" : focusMatch.nextMatchSlot === "away" ? "home" : null;
  if (!opponentSlot) {
    return null;
  }

  const directTeamId = opponentSlot === "home" ? nextMatch.homeTeamId : nextMatch.awayTeamId;
  const directShortName = opponentSlot === "home" ? nextMatch.homeTeamShortName : nextMatch.awayTeamShortName;
  const directFlag = opponentSlot === "home" ? nextMatch.homeTeamFlagEmoji : nextMatch.awayTeamFlagEmoji;
  const directSource = opponentSlot === "home" ? nextMatch.homeSource : nextMatch.awaySource;

  if (directTeamId && directShortName) {
    return {
      teamId: directTeamId,
      shortLabel: directShortName,
      flagEmoji: directFlag,
      sourceLabel: directSource
    };
  }

  const feederMatch = matches.find((match) => match.nextMatchId === nextMatch.id && match.nextMatchSlot === opponentSlot);
  if (feederMatch?.homeTeamShortName && feederMatch.awayTeamShortName) {
    return {
      teamId: null,
      shortLabel: `${feederMatch.homeTeamShortName}/${feederMatch.awayTeamShortName}`,
      flagEmoji: null,
      sourceLabel: `${feederMatch.homeTeamShortName} vs ${feederMatch.awayTeamShortName}`
    };
  }

  return directSource
    ? {
        teamId: null,
        shortLabel: formatSourceLabel(directSource, language),
        flagEmoji: null,
        sourceLabel: directSource
      }
    : null;
}

function buildProjectionPercentByTeamId(input: {
  teams: PredictionLabTeamInput[];
  settings: PredictionLabSettings;
  availabilityByTeamId: Map<string, PredictionLabTeamAvailability> | null;
  crowdSignalByTeamId: Map<string, number> | null;
  scenario: PredictionLabScenario;
}) {
  const adjustedTeams = applyScenarioToTeams(input.teams, input.scenario);
  if (adjustedTeams.length === 0) {
    return new Map<string, number>();
  }

  const scheduleWeight = attentionValueToWeight(input.settings.scheduleLoad);
  const availabilityWeight = input.availabilityByTeamId ? attentionValueToWeight(input.settings.availability) : 0;
  const formWeight = attentionValueToWeight(input.settings.formQuality);
  const crowdWeight = input.crowdSignalByTeamId ? attentionValueToWeight(input.settings.crowdPulse) : 0;
  const rawScores = adjustedTeams.map((team) => {
    const formComposite = clamp01(team.seedScore * 0.55 + team.momentumScore * 0.45);
    const availabilityScore = availabilityScoreForTeam(team.id, input.availabilityByTeamId);
    const crowdSignal = input.crowdSignalByTeamId?.get(team.id) ?? 0;
    const totalWeight = Math.max(0.0001, scheduleWeight + availabilityWeight + formWeight + crowdWeight);
    const composite =
      scheduleWeight * team.pathScore +
      availabilityWeight * availabilityScore +
      formWeight * formComposite +
      crowdWeight * crowdSignal / 100;
    const temperature = 0.9;

    return {
      teamId: team.id,
      value: Math.exp((composite / totalWeight) / temperature)
    };
  });

  const total = rawScores.reduce((sum, row) => sum + row.value, 0);
  const percentByTeamId = new Map<string, number>();
  for (const row of rawScores) {
    percentByTeamId.set(row.teamId, round1((row.value / total) * 100));
  }
  return percentByTeamId;
}

function buildRankFormPercentByTeamId(teams: PredictionLabTeamInput[]) {
  if (teams.length === 0) {
    return null;
  }

  const rawScores = teams.map((team) => {
    const rankFormComposite = clamp01(team.seedScore * 0.58 + team.momentumScore * 0.42);

    return {
      teamId: team.id,
      value: Math.exp(rankFormComposite / 0.9)
    };
  });

  const total = rawScores.reduce((sum, row) => sum + row.value, 0);
  if (total <= 0) {
    return null;
  }

  const percentByTeamId = new Map<string, number>();
  for (const row of rawScores) {
    percentByTeamId.set(row.teamId, round1((row.value / total) * 100));
  }

  return percentByTeamId;
}

function availabilityScoreForTeam(
  teamId: string,
  availabilityByTeamId: Map<string, PredictionLabTeamAvailability> | null
) {
  if (!availabilityByTeamId) {
    return 0.5;
  }

  const flaggedCount = availabilityByTeamId.get(teamId)?.flaggedCount ?? 0;
  return clamp01(1 - flaggedCount * 0.16);
}

function applyScenarioToTeams(teams: PredictionLabTeamInput[], scenario: PredictionLabScenario) {
  if (!scenario) {
    return teams;
  }

  const teamIds = new Set(teams.map((team) => team.id));
  if (!teamIds.has(scenario.winnerTeamId) || !teamIds.has(scenario.loserTeamId)) {
    return teams;
  }

  return teams.flatMap((team) => {
    if (team.id === scenario.loserTeamId) {
      return [];
    }
    if (team.id !== scenario.winnerTeamId) {
      return [team];
    }
    return [
      {
        ...team,
        momentumScore: clamp01(team.momentumScore + 0.14),
        pathScore: clamp01(team.pathScore + 0.1),
        roundsRemaining: Math.max(1, team.roundsRemaining - 1)
      }
    ];
  });
}

function snapToAttentionValue(value: number) {
  const clamped = clampPredictionLabSettingValue(value);
  return PREDICTION_LAB_ATTENTION_PRESETS.reduce((closest, preset) =>
    Math.abs(preset.stored - clamped) < Math.abs(closest.stored - clamped) ? preset : closest
  ).stored;
}

export function getAttentionPreset(value: number) {
  return PREDICTION_LAB_ATTENTION_PRESETS.find((preset) => preset.stored === snapToAttentionValue(value)) ?? PREDICTION_LAB_ATTENTION_PRESETS[2];
}

function attentionValueToWeight(value: number) {
  const clamped = clampPredictionLabSettingValue(value);
  if (clamped <= 33) {
    return interpolate(clamped, 0, 33, 0, 0.35);
  }
  if (clamped <= 67) {
    return interpolate(clamped, 33, 67, 0.35, 1);
  }
  return interpolate(clamped, 67, 100, 1, 2.2);
}

function interpolate(value: number, min: number, max: number, outMin: number, outMax: number) {
  if (max <= min) {
    return outMin;
  }
  const t = (value - min) / (max - min);
  return outMin + (outMax - outMin) * t;
}

function computeSignalSpread(signals: PredictionLabSignalRow[], mean: number) {
  const totalWeight = signals.reduce((sum, signal) => sum + signal.confidence * signal.attentionWeight, 0);
  if (totalWeight <= 0) {
    return 0;
  }

  const variance = signals.reduce((sum, signal) => {
    const weight = signal.confidence * signal.attentionWeight;
    return sum + weight * Math.pow((signal.lean ?? 0) - mean, 2);
  }, 0);

  return Math.sqrt(variance / totalWeight);
}

function summarizePredictionLabSignals(signals: PredictionLabSignalRow[]) {
  const availableSignals = signals.filter(
    (signal) => signal.status === "active" && signal.lean !== null && signal.confidence > 0
  );
  const activeSignals = availableSignals.filter((signal) => signal.attentionWeight > 0);
  const weightedTotal = activeSignals.reduce(
    (sum, signal) => sum + signal.lean! * signal.confidence * signal.attentionWeight,
    0
  );
  const weightedConfidence = activeSignals.reduce(
    (sum, signal) => sum + signal.confidence * signal.attentionWeight,
    0
  );
  const baselineConfidence = availableSignals.reduce(
    (sum, signal) => sum + signal.confidence * PREDICTION_LAB_BASE_ATTENTION_WEIGHT,
    0
  );
  const directionalLean = weightedConfidence > 0 ? weightedTotal / weightedConfidence : null;
  const intensityRatio = baselineConfidence > 0 ? weightedConfidence / baselineConfidence : 0;
  const intensityFactor = normalizeAttentionIntensity(intensityRatio);

  return {
    activeSignals,
    compositeLean:
      directionalLean === null ? null : clampSigned(round1(directionalLean * intensityFactor)),
    disagreement: directionalLean === null ? 28 : computeSignalSpread(activeSignals, directionalLean),
    intensityFactor
  };
}

function normalizeAttentionIntensity(intensityRatio: number) {
  if (intensityRatio <= 0) {
    return 0;
  }
  if (intensityRatio <= 1) {
    return round1(interpolate(intensityRatio, 0, 1, 0.28, 1));
  }
  return round1(interpolate(Math.min(intensityRatio, 2.2), 1, 2.2, 1, 1.6));
}

function describeLensLean(
  language: string | null | undefined,
  subject: string,
  lean: number | null,
  homeLabel: string,
  awayLabel: string
) {
  if (lean === null || Math.abs(lean) < 8) {
    return predictionLabT(language, "lean.even", { subject });
  }

  const favoredTeam = lean < 0 ? homeLabel : awayLabel;
  const magnitude = Math.abs(lean);
  if (magnitude < 20) {
    return predictionLabT(language, "lean.slight", { subject, team: favoredTeam });
  }
  if (magnitude < 40) {
    return predictionLabT(language, "lean.lean", { subject, team: favoredTeam });
  }
  return predictionLabT(language, "lean.strong", { subject, team: favoredTeam });
}

function describeSignalAgreement(language: string | null | undefined, count: number, spread: number, lean: number | null) {
  if (count === 0 || lean === null) {
    return predictionLabT(language, "agreement.turnOnSignal");
  }
  if (spread <= 10) {
    return predictionLabT(language, "agreement.strong");
  }
  if (spread <= 22 && Math.abs(lean) >= 12) {
    return predictionLabT(language, "agreement.clear");
  }
  if (spread <= 36) {
    return predictionLabT(language, "agreement.mixed");
  }
  return predictionLabT(language, "agreement.low");
}

function formatRecord(team: PredictionLabTeamInput) {
  const goalDiff = team.goalsFor - team.goalsAgainst;
  return `${team.wins}-${team.draws}-${team.losses} · ${goalDiff >= 0 ? "+" : ""}${goalDiff} GD`;
}

function formatRestDays(value: number) {
  if (value <= 0.25) {
    return "<1d";
  }
  return `${Math.round(value)}d`;
}

function normalizePairPercent(percentByTeamId: Map<string, number>, teamId: string, opponentTeamId: string) {
  const teamPercent = percentByTeamId.get(teamId) ?? 0;
  const opponentPercent = percentByTeamId.get(opponentTeamId) ?? 0;
  const total = teamPercent + opponentPercent;
  if (total <= 0) {
    return 50;
  }
  return round1((teamPercent / total) * 100);
}

function toTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPredictionLabKickoff(value: string | null, language: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return formatDateTime(parsed, language);
}

function formatCompactDate(value: string | null, language: string | null | undefined) {
  if (!value) {
    return predictionLabT(language, "format.upcoming");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return predictionLabT(language, "format.upcoming");
  }
  return formatDate(parsed, language);
}

function formatStageLabel(stage: MatchStage, language: string | null | undefined) {
  switch (normalizeStage(stage)) {
    case "r32":
      return predictionLabT(language, "format.stageR32");
    case "r16":
      return predictionLabT(language, "format.stageR16");
    case "qf":
      return predictionLabT(language, "format.stageQf");
    case "sf":
      return predictionLabT(language, "format.stageSf");
    case "final":
      return predictionLabT(language, "format.stageFinal");
    default:
      return predictionLabT(language, "format.stageKnockout");
  }
}

function formatSourceLabel(value: string, language: string | null | undefined) {
  const source = value.replace(/^Winner of\s+/i, "");
  return predictionLabT(language, "quickScenario.winnerOfSource", { source });
}

function isKnockoutStage(stage: Match["stage"]) {
  return KNOCKOUT_STAGES_IN_ORDER.includes(normalizeStage(stage) as (typeof KNOCKOUT_STAGES_IN_ORDER)[number]);
}

function normalizeStage(stage: Match["stage"]) {
  switch (stage) {
    case "round_of_32":
      return "r32";
    case "round_of_16":
      return "r16";
    case "quarterfinal":
      return "qf";
    case "semifinal":
      return "sf";
    default:
      return stage;
  }
}

function getRoundsRemainingForStage(stage: Match["stage"]) {
  return KNOCKOUT_STAGE_ROUNDS_REMAINING[stage] ?? KNOCKOUT_STAGE_ROUNDS_REMAINING[normalizeStage(stage)] ?? 1;
}

function normalizeSeedStrength(fifaRank: number, teams: Team[]) {
  const ranks = teams.map((team) => team.fifaRank).filter((rank) => Number.isFinite(rank) && rank > 0);
  if (ranks.length === 0 || !Number.isFinite(fifaRank) || fifaRank <= 0) {
    return 0.5;
  }
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  if (minRank === maxRank) {
    return 0.5;
  }
  return clamp01(1 - (fifaRank - minRank) / (maxRank - minRank));
}

function normalizeOpponentEase(fifaRank: number, teams: Team[]) {
  return 1 - normalizeSeedStrength(fifaRank, teams);
}

function compareMatchesByKickoff(
  left: Pick<Match, "kickoffAt" | "kickoffTime">,
  right: Pick<Match, "kickoffAt" | "kickoffTime">
) {
  const leftTime = new Date(left.kickoffAt ?? left.kickoffTime ?? 0).getTime();
  const rightTime = new Date(right.kickoffAt ?? right.kickoffTime ?? 0).getTime();
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  if (Number.isFinite(leftTime) && !Number.isFinite(rightTime)) {
    return -1;
  }
  if (!Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return 1;
  }
  return 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function clampSigned(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-100, Math.min(100, value));
}

function isSeededPredictionLabMatch(match: PredictionLabMatchInput): match is SeededPredictionLabMatch {
  return Boolean(
    match.homeTeamId &&
      match.awayTeamId &&
      match.homeTeamName &&
      match.awayTeamName &&
      match.homeTeamShortName &&
      match.awayTeamShortName &&
      match.homeTeamFlagEmoji &&
      match.awayTeamFlagEmoji
  );
}

type SeededPredictionLabMatch = PredictionLabMatchInput & {
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string;
  awayTeamShortName: string;
  homeTeamFlagEmoji: string;
  awayTeamFlagEmoji: string;
};

const DAY_IN_MS = 1000 * 60 * 60 * 24;
