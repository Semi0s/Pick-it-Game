import {
  expandFifa2026KnockoutStoredMatchIds,
} from "./fifa-2026-knockout-seeding.ts";
import { buildKnockoutPreviousMatchesByTargetId } from "./knockout-team-resolution.ts";
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
  const sourceMatchesByWinnerTeamId = new Map<string, KnockoutProgressMatchRow>();
  const sourceMatchesByParticipantTeamId = new Map<string, KnockoutProgressMatchRow[]>();
  const previousMatchesByTargetId = buildKnockoutPreviousMatchesByTargetId([...sourceMatches, ...targetMatches]);

  for (const match of sourceMatches) {
    if (match.winnerTeamId) {
      sourceMatchesByWinnerTeamId.set(match.winnerTeamId, match);
    }

    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teamId) {
        continue;
      }
      const existingMatches = sourceMatchesByParticipantTeamId.get(teamId) ?? [];
      existingMatches.push(match);
      sourceMatchesByParticipantTeamId.set(teamId, existingMatches);
    }
  }

  for (const targetMatch of targetMatches) {
    const directHomeSource = resolveFeederMatchForSeededTeam({
      sourceMatchesByWinnerTeamId,
      sourceMatchesByParticipantTeamId,
      targetMatchId: targetMatch.id,
      targetMatchSlot: "home",
      directTeamId: targetMatch.homeTeamId
    });
    const directAwaySource = resolveFeederMatchForSeededTeam({
      sourceMatchesByWinnerTeamId,
      sourceMatchesByParticipantTeamId,
      targetMatchId: targetMatch.id,
      targetMatchSlot: "away",
      directTeamId: targetMatch.awayTeamId
    });
    const previousMatches = previousMatchesByTargetId.get(targetMatch.id) ?? [];
    const sourceMappedHome = previousMatches.find((match) => match.nextMatchSlot === "home") ?? null;
    const sourceMappedAway = previousMatches.find((match) => match.nextMatchSlot === "away") ?? null;
    const preferredHome = directHomeSource ?? sourceMappedHome ?? undefined;
    const preferredAway = directAwaySource ?? sourceMappedAway ?? undefined;
    if (preferredHome || preferredAway) {
      feederMatchesByTargetId.set(targetMatch.id, {
        home: preferredHome,
        away: preferredAway
      });
    }
  }

  return feederMatchesByTargetId;
}

function resolveFeederMatchForSeededTeam(input: {
  sourceMatchesByWinnerTeamId: Map<string, KnockoutProgressMatchRow>;
  sourceMatchesByParticipantTeamId: Map<string, KnockoutProgressMatchRow[]>;
  targetMatchId: string;
  targetMatchSlot: MatchNextSlot;
  directTeamId: string | null;
}) {
  if (!input.directTeamId) {
    return null;
  }

  const directWinnerMatch = input.sourceMatchesByWinnerTeamId.get(input.directTeamId) ?? null;
  if (directWinnerMatch) {
    return directWinnerMatch;
  }

  const candidateMatches = input.sourceMatchesByParticipantTeamId.get(input.directTeamId) ?? [];
  const directLinkedMatch =
    candidateMatches.find((match) => {
      if (!match.nextMatchId || match.nextMatchSlot !== input.targetMatchSlot) {
        return false;
      }
      return expandFifa2026KnockoutStoredMatchIds(match.nextMatchId).includes(input.targetMatchId);
    }) ?? null;

  if (directLinkedMatch) {
    return directLinkedMatch;
  }

  return candidateMatches[0] ?? null;
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
  const feederIncludesDirectTeam = directTeam ? matchIncludesTeam(feederMatch, directTeam.teamId) : false;

  if (directTeam && feederIncludesDirectTeam) {
    const otherTeam =
      homeTeam && awayTeam
        ? homeTeam.teamId === directTeam.teamId
          ? awayTeam
          : homeTeam
        : null;

    return {
      sourceMatchId: feederMatch.id,
      sourceMatchStatus: feederMatch.status,
      state: feederMatch.status === "final" ? "advanced" : feederMatch.status === "live" || feederMatch.status === "locked" ? "live" : "pending",
      primaryTeam: directTeam,
      secondaryTeam: otherTeam,
      candidates: [directTeam, otherTeam].filter((team): team is KnockoutProgressTeamSummary => Boolean(team)),
      scoreLabel: feederMatch.status === "final" || feederMatch.status === "live" || feederMatch.status === "locked" ? scoreLabel : null,
      live: feederMatch.status === "live" || feederMatch.status === "locked"
    };
  }

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

function matchIncludesTeam(match: KnockoutProgressMatchRow, teamId: string) {
  return match.homeTeamId === teamId || match.awayTeamId === teamId || match.winnerTeamId === teamId;
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
