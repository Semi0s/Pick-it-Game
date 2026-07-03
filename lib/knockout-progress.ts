import {
  expandFifa2026KnockoutStoredMatchIds,
  getFifa2026CanonicalKnockoutSources,
  normalizeFifa2026KnockoutStoredMatchId
} from "./fifa-2026-knockout-seeding.ts";
import { EXPECTED_KNOCKOUT_MATCH_COUNTS, formatMatchStage, normalizeKnockoutStage, type CanonicalKnockoutStage } from "./match-stage.ts";
import type { MatchNextSlot, MatchStage, MatchStatus } from "./types.ts";

const KNOCKOUT_PROGRESS_SOURCE_STAGES = ["r32", "r16", "qf", "sf"] as const;

type KnockoutProgressSourceStage = (typeof KNOCKOUT_PROGRESS_SOURCE_STAGES)[number];

type KnockoutProgressTeamRow = {
  id: string;
  name: string;
  shortName: string | null;
  flagEmoji: string | null;
};

type KnockoutProgressMatchRow = {
  id: string;
  stage: MatchStage;
  status: MatchStatus;
  kickoffTime: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSource?: string | null;
  awaySource?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId?: string | null;
  nextMatchId?: string | null;
  nextMatchSlot?: MatchNextSlot | null;
};

type KnockoutProgressTeamSummary = {
  teamId: string;
  name: string;
  shortName: string;
  flagEmoji: string | null;
};

export type DashboardKnockoutProgressSlot = {
  sourceMatchId: string | null;
  sourceMatchStatus: MatchStatus | null;
  state: "advanced" | "live" | "pending" | "waiting";
  primaryTeam: KnockoutProgressTeamSummary | null;
  secondaryTeam: KnockoutProgressTeamSummary | null;
  candidates: KnockoutProgressTeamSummary[];
  scoreLabel: string | null;
  live: boolean;
};

export type DashboardKnockoutProgressMatchup = {
  matchId: string;
  stage: CanonicalKnockoutStage;
  label: string;
  kickoffTime: string | null;
  status: MatchStatus;
  homeSlot: DashboardKnockoutProgressSlot;
  awaySlot: DashboardKnockoutProgressSlot;
};

export type DashboardKnockoutProgressSummary = {
  currentRoundStage: KnockoutProgressSourceStage;
  currentRoundLabel: string;
  currentRoundDecided: number;
  currentRoundTotal: number;
  nextRoundStage: CanonicalKnockoutStage | null;
  nextRoundLabel: string;
  matchupCount: number;
  matchups: DashboardKnockoutProgressMatchup[];
};

export function buildDashboardKnockoutProgressSummary(input: {
  matches: KnockoutProgressMatchRow[];
  teams: KnockoutProgressTeamRow[];
}): DashboardKnockoutProgressSummary | null {
  const teamById = new Map(
    input.teams.map((team) => [team.id, mapTeamSummary(team)] as const)
  );

  const stageMatches = new Map<CanonicalKnockoutStage, KnockoutProgressMatchRow[]>([
    ["r32", []],
    ["r16", []],
    ["qf", []],
    ["sf", []],
    ["third", []],
    ["final", []]
  ]);

  for (const match of input.matches) {
    const stage = normalizeKnockoutStage(match.stage);
    if (!stage || stage === "third") {
      continue;
    }
    stageMatches.get(stage)?.push(match);
  }

  const currentRoundStage = resolveCurrentRoundStage(stageMatches);
  if (!currentRoundStage) {
    return null;
  }

  const nextRoundStage = getNextRoundStage(currentRoundStage);
  if (!nextRoundStage) {
    return {
      currentRoundStage,
      currentRoundLabel: formatMatchStage(currentRoundStage),
      currentRoundDecided: getDecidedMatchCount(stageMatches.get(currentRoundStage) ?? []),
      currentRoundTotal: EXPECTED_KNOCKOUT_MATCH_COUNTS[currentRoundStage],
      nextRoundStage: null,
      nextRoundLabel: "Bracket complete",
      matchupCount: 0,
      matchups: []
    };
  }

  const currentRoundMatches = stageMatches.get(currentRoundStage) ?? [];
  const nextRoundMatches = [...(stageMatches.get(nextRoundStage) ?? [])].sort(compareMatchKickoff);

  const feederMatchesByTargetId = buildFeederMatchesByTargetId(currentRoundMatches, nextRoundMatches);

  const matchups = nextRoundMatches
    .map((match) => {
      const feeders = feederMatchesByTargetId.get(match.id);

      return {
        matchId: match.id,
        stage: nextRoundStage,
        label: formatMatchStage(nextRoundStage),
        kickoffTime: match.kickoffTime,
        status: match.status,
        homeSlot: buildSlotSummary({
          feederMatch: feeders?.home ?? null,
          directTeamId: match.homeTeamId,
          teamById
        }),
        awaySlot: buildSlotSummary({
          feederMatch: feeders?.away ?? null,
          directTeamId: match.awayTeamId,
          teamById
        })
      } satisfies DashboardKnockoutProgressMatchup;
    })
    .filter((matchup) => {
      return Boolean(
        matchup.homeSlot.state !== "waiting" ||
          matchup.awaySlot.state !== "waiting" ||
          matchup.kickoffTime
      );
    });

  return {
    currentRoundStage,
    currentRoundLabel: formatMatchStage(currentRoundStage),
    currentRoundDecided: getDecidedMatchCount(currentRoundMatches),
    currentRoundTotal: EXPECTED_KNOCKOUT_MATCH_COUNTS[currentRoundStage],
    nextRoundStage,
    nextRoundLabel: `${formatMatchStage(nextRoundStage)} building`,
    matchupCount: matchups.length,
    matchups
  };
}

function buildFeederMatchesByTargetId(
  sourceMatches: KnockoutProgressMatchRow[],
  targetMatches: KnockoutProgressMatchRow[]
) {
  const feederMatchesByTargetId = new Map<string, { home?: KnockoutProgressMatchRow; away?: KnockoutProgressMatchRow }>();
  const sourceMatchesByNormalizedId = new Map<string, KnockoutProgressMatchRow>();

  for (const match of sourceMatches) {
    for (const alias of expandFifa2026KnockoutStoredMatchIds(match.id)) {
      sourceMatchesByNormalizedId.set(alias, match);
    }
  }

  for (const targetMatch of targetMatches) {
    const canonicalSources =
      targetMatch.homeSource || targetMatch.awaySource
        ? getFifa2026CanonicalKnockoutSources(targetMatch.id)
        : null;
    const sourceMappedHome = resolveFeederMatchFromSourceLabel(
      canonicalSources?.homeSource ?? targetMatch.homeSource,
      sourceMatchesByNormalizedId
    );
    const sourceMappedAway = resolveFeederMatchFromSourceLabel(
      canonicalSources?.awaySource ?? targetMatch.awaySource,
      sourceMatchesByNormalizedId
    );
    if (sourceMappedHome || sourceMappedAway) {
      feederMatchesByTargetId.set(targetMatch.id, {
        home: sourceMappedHome ?? undefined,
        away: sourceMappedAway ?? undefined
      });
    }
  }

  for (const match of sourceMatches) {
    if (!match.nextMatchId || !match.nextMatchSlot) {
      continue;
    }

    const normalizedTargetIds = expandFifa2026KnockoutStoredMatchIds(match.nextMatchId);
    for (const normalizedTargetId of normalizedTargetIds) {
      const target = feederMatchesByTargetId.get(normalizedTargetId) ?? {};
      if (!target[match.nextMatchSlot]) {
        target[match.nextMatchSlot] = match;
      }
      feederMatchesByTargetId.set(normalizedTargetId, target);
    }
  }

  return feederMatchesByTargetId;
}

function resolveFeederMatchFromSourceLabel(
  sourceLabel: string | null | undefined,
  sourceMatchesByNormalizedId: Map<string, KnockoutProgressMatchRow>
) {
  const matchId = parseWinnerSourceMatchId(sourceLabel);
  if (!matchId) {
    return null;
  }

  const normalizedId = normalizeFifa2026KnockoutStoredMatchId(matchId);
  return normalizedId ? sourceMatchesByNormalizedId.get(normalizedId) ?? null : null;
}

function parseWinnerSourceMatchId(sourceLabel: string | null | undefined) {
  const normalized = (sourceLabel ?? "").trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^Winner of\s+([A-Za-z0-9-]+)$/i);
  return match?.[1] ?? null;
}

function resolveCurrentRoundStage(stageMatches: Map<CanonicalKnockoutStage, KnockoutProgressMatchRow[]>) {
  for (const stage of KNOCKOUT_PROGRESS_SOURCE_STAGES) {
    const matches = stageMatches.get(stage) ?? [];
    if (matches.length === 0) {
      continue;
    }

    const hasParticipants = matches.some((match) => Boolean(match.homeTeamId || match.awayTeamId));
    const hasUnfinishedMatch = matches.some((match) => match.status !== "final");
    if (hasParticipants && hasUnfinishedMatch) {
      return stage;
    }
  }

  for (let index = KNOCKOUT_PROGRESS_SOURCE_STAGES.length - 1; index >= 0; index -= 1) {
    const stage = KNOCKOUT_PROGRESS_SOURCE_STAGES[index]!;
    const matches = stageMatches.get(stage) ?? [];
    if (matches.length > 0) {
      return stage;
    }
  }

  return null;
}

function getNextRoundStage(stage: KnockoutProgressSourceStage): CanonicalKnockoutStage | null {
  switch (stage) {
    case "r32":
      return "r16";
    case "r16":
      return "qf";
    case "qf":
      return "sf";
    case "sf":
      return "final";
    default:
      return null;
  }
}

function getDecidedMatchCount(matches: KnockoutProgressMatchRow[]) {
  return matches.filter((match) => match.status === "final" && Boolean(match.winnerTeamId)).length;
}

function buildSlotSummary(input: {
  feederMatch: KnockoutProgressMatchRow | null;
  directTeamId: string | null;
  teamById: Map<string, KnockoutProgressTeamSummary>;
}): DashboardKnockoutProgressSlot {
  const directTeam = input.directTeamId ? input.teamById.get(input.directTeamId) ?? null : null;
  const feederMatch = input.feederMatch;

  if (!feederMatch) {
    return {
      sourceMatchId: null,
      sourceMatchStatus: null,
      state: directTeam ? "advanced" : "waiting",
      primaryTeam: directTeam,
      secondaryTeam: null,
      candidates: directTeam ? [directTeam] : [],
      scoreLabel: null,
      live: false
    };
  }

  const homeTeam = feederMatch.homeTeamId ? input.teamById.get(feederMatch.homeTeamId) ?? null : null;
  const awayTeam = feederMatch.awayTeamId ? input.teamById.get(feederMatch.awayTeamId) ?? null : null;
  const scoreLabel =
    typeof feederMatch.homeScore === "number" && typeof feederMatch.awayScore === "number"
      ? `${feederMatch.homeScore}-${feederMatch.awayScore}`
      : null;

  if (feederMatch.status === "final" && feederMatch.winnerTeamId) {
    const winner = input.teamById.get(feederMatch.winnerTeamId) ?? null;
    const loser =
      homeTeam && awayTeam
        ? homeTeam.teamId === feederMatch.winnerTeamId
          ? awayTeam
          : homeTeam
        : null;

    return {
      sourceMatchId: feederMatch.id,
      sourceMatchStatus: feederMatch.status,
      state: "advanced",
      primaryTeam: winner,
      secondaryTeam: loser,
      candidates: winner ? [winner] : [],
      scoreLabel,
      live: false
    };
  }

  if (feederMatch.status === "live" || feederMatch.status === "locked") {
    return {
      sourceMatchId: feederMatch.id,
      sourceMatchStatus: feederMatch.status,
      state: "live",
      primaryTeam: homeTeam,
      secondaryTeam: awayTeam,
      candidates: [homeTeam, awayTeam].filter((team): team is KnockoutProgressTeamSummary => Boolean(team)),
      scoreLabel,
      live: true
    };
  }

  return {
    sourceMatchId: feederMatch.id,
    sourceMatchStatus: feederMatch.status,
    state: "pending",
    primaryTeam: homeTeam,
    secondaryTeam: awayTeam,
    candidates: [homeTeam, awayTeam].filter((team): team is KnockoutProgressTeamSummary => Boolean(team)),
    scoreLabel: null,
    live: false
  };
}

function mapTeamSummary(team: KnockoutProgressTeamRow): KnockoutProgressTeamSummary {
  return {
    teamId: team.id,
    name: team.name,
    shortName: team.shortName?.trim() || team.name,
    flagEmoji: team.flagEmoji ?? null
  };
}

function compareMatchKickoff(left: KnockoutProgressMatchRow, right: KnockoutProgressMatchRow) {
  const leftKickoff = left.kickoffTime ? new Date(left.kickoffTime).getTime() : Number.POSITIVE_INFINITY;
  const rightKickoff = right.kickoffTime ? new Date(right.kickoffTime).getTime() : Number.POSITIVE_INFINITY;
  return leftKickoff - rightKickoff || left.id.localeCompare(right.id);
}
