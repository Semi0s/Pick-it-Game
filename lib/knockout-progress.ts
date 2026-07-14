import {
  expandFifa2026KnockoutStoredMatchIds,
} from "./fifa-2026-knockout-seeding.ts";
import { buildKnockoutPreviousMatchesByTargetId } from "./knockout-team-resolution.ts";
import { EXPECTED_KNOCKOUT_MATCH_COUNTS, formatMatchStage, normalizeKnockoutStage, type CanonicalKnockoutStage } from "./match-stage.ts";
import type { BracketTeamOption, KnockoutBracketEditorView, KnockoutBracketMatchView } from "./bracket-predictions.ts";
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
    if (!stage) {
      continue;
    }
    stageMatches.get(stage)?.push(match);
  }

  const currentRoundStage = resolveCurrentRoundStage(stageMatches);
  if (!currentRoundStage) {
    return null;
  }

  const nextRoundStage = resolveNextRoundStage(currentRoundStage, stageMatches);
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

export function buildDashboardKnockoutProgressSummaryFromEditorView(
  view: Pick<KnockoutBracketEditorView, "stages"> & {
    thirdPlace?: KnockoutBracketEditorView["thirdPlace"];
  }
): DashboardKnockoutProgressSummary | null {
  const stageMatches = new Map<CanonicalKnockoutStage, KnockoutBracketMatchView[]>([
    ["r32", []],
    ["r16", []],
    ["qf", []],
    ["sf", []],
    ["third", []],
    ["final", []]
  ]);

  for (const stage of view.stages) {
    stageMatches.set(stage.stage, stage.matches);
  }
  stageMatches.set("third", view.thirdPlace ? [view.thirdPlace] : []);

  const currentRoundStage = resolveCurrentRoundStageFromBracketView(stageMatches);
  if (!currentRoundStage) {
    return null;
  }

  const nextRoundStage = resolveNextRoundStage(currentRoundStage, stageMatches);
  if (!nextRoundStage) {
    return {
      currentRoundStage,
      currentRoundLabel: formatMatchStage(currentRoundStage),
      currentRoundDecided: getDecidedViewMatchCount(stageMatches.get(currentRoundStage) ?? []),
      currentRoundTotal: EXPECTED_KNOCKOUT_MATCH_COUNTS[currentRoundStage],
      nextRoundStage: null,
      nextRoundLabel: "Bracket complete",
      matchupCount: 0,
      matchups: []
    };
  }

  const currentRoundMatches = stageMatches.get(currentRoundStage) ?? [];
  const sourceMatchesById = new Map(currentRoundMatches.map((match) => [match.matchId, match]));
  const nextRoundMatches = [...(stageMatches.get(nextRoundStage) ?? [])].sort(compareViewMatchKickoff);

  const matchups = nextRoundMatches
    .map((match) => ({
      matchId: match.matchId,
      stage: nextRoundStage,
      label: formatMatchStage(nextRoundStage),
      kickoffTime: match.kickoffTime,
      status: match.status,
      homeSlot: buildSlotSummaryFromBracketView({
        sourceMatch: match.homeSourceMatchId ? sourceMatchesById.get(match.homeSourceMatchId) ?? null : null,
        directTeam: match.homeTeam ?? match.seededHomeTeam ?? null
      }),
      awaySlot: buildSlotSummaryFromBracketView({
        sourceMatch: match.awaySourceMatchId ? sourceMatchesById.get(match.awaySourceMatchId) ?? null : null,
        directTeam: match.awayTeam ?? match.seededAwayTeam ?? null
      })
    }))
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
    currentRoundDecided: getDecidedViewMatchCount(currentRoundMatches),
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

function resolveCurrentRoundStageFromBracketView(stageMatches: Map<CanonicalKnockoutStage, KnockoutBracketMatchView[]>) {
  for (const stage of KNOCKOUT_PROGRESS_SOURCE_STAGES) {
    const matches = stageMatches.get(stage) ?? [];
    if (matches.length === 0) {
      continue;
    }

    const hasParticipants = matches.some((match) =>
      Boolean(match.homeTeam || match.awayTeam || match.seededHomeTeam || match.seededAwayTeam)
    );
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

function resolveNextRoundStage<T extends { kickoffTime: string | null; status: MatchStatus }>(
  stage: KnockoutProgressSourceStage,
  stageMatches: Map<CanonicalKnockoutStage, T[]>
): CanonicalKnockoutStage | null {
  switch (stage) {
    case "r32":
      return "r16";
    case "r16":
      return "qf";
    case "qf":
      return "sf";
    case "sf":
      return resolveSemifinalTargetStage({
        thirdMatches: stageMatches.get("third") ?? [],
        finalMatches: stageMatches.get("final") ?? []
      });
    default:
      return null;
  }
}

function resolveSemifinalTargetStage<T extends { kickoffTime: string | null; status: MatchStatus }>(input: {
  thirdMatches: T[];
  finalMatches: T[];
}): CanonicalKnockoutStage | null {
  const candidates = [
    { stage: "third" as const, matches: input.thirdMatches },
    { stage: "final" as const, matches: input.finalMatches }
  ]
    .filter((candidate) => candidate.matches.length > 0)
    .filter((candidate) => candidate.matches.some((match) => match.status !== "final"));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => getEarliestKickoffTime(left.matches) - getEarliestKickoffTime(right.matches));
  return candidates[0]?.stage ?? null;
}

function getEarliestKickoffTime<T extends { kickoffTime: string | null }>(matches: T[]) {
  const kickoffTimes = matches
    .map((match) => {
      const kickoffTime = match.kickoffTime ? new Date(match.kickoffTime).getTime() : Number.POSITIVE_INFINITY;
      return Number.isFinite(kickoffTime) ? kickoffTime : Number.POSITIVE_INFINITY;
    })
    .sort((left, right) => left - right);

  return kickoffTimes[0] ?? Number.POSITIVE_INFINITY;
}

function getDecidedMatchCount(matches: KnockoutProgressMatchRow[]) {
  return matches.filter((match) => match.status === "final" && Boolean(match.winnerTeamId)).length;
}

function getDecidedViewMatchCount(matches: KnockoutBracketMatchView[]) {
  return matches.filter((match) => match.status === "final" && Boolean(match.actualWinnerTeamId)).length;
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

function buildSlotSummaryFromBracketView(input: {
  sourceMatch: KnockoutBracketMatchView | null;
  directTeam: BracketTeamOption | null;
}): DashboardKnockoutProgressSlot {
  const sourceMatch = input.sourceMatch;

  if (!sourceMatch) {
    const directTeam = input.directTeam ? mapBracketTeamSummary(input.directTeam) : null;
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

  const homeTeam = sourceMatch.homeTeam ?? sourceMatch.seededHomeTeam ?? null;
  const awayTeam = sourceMatch.awayTeam ?? sourceMatch.seededAwayTeam ?? null;
  const homeSummary = homeTeam ? mapBracketTeamSummary(homeTeam) : null;
  const awaySummary = awayTeam ? mapBracketTeamSummary(awayTeam) : null;
  const directSummary = input.directTeam ? mapBracketTeamSummary(input.directTeam) : null;
  const scoreLabel =
    typeof sourceMatch.homeScore === "number" && typeof sourceMatch.awayScore === "number"
      ? `${sourceMatch.homeScore}-${sourceMatch.awayScore}`
      : null;
  const sourceMatchIncludesDirectTeam = Boolean(
    input.directTeam &&
      [homeTeam?.id, awayTeam?.id].includes(input.directTeam.id)
  );

  if (sourceMatchIncludesDirectTeam && directSummary) {
    const otherTeam =
      homeTeam && awayTeam
        ? homeTeam.id === directSummary.teamId
          ? awayTeam
          : homeTeam
        : null;

    return {
      sourceMatchId: sourceMatch.matchId,
      sourceMatchStatus: sourceMatch.status,
      state:
        sourceMatch.status === "final"
          ? "advanced"
          : sourceMatch.status === "live" || sourceMatch.status === "locked"
            ? "live"
            : "pending",
      primaryTeam: directSummary,
      secondaryTeam: otherTeam ? mapBracketTeamSummary(otherTeam) : null,
      candidates: [directSummary, otherTeam ? mapBracketTeamSummary(otherTeam) : null].filter(
        (team): team is KnockoutProgressTeamSummary => Boolean(team)
      ),
      scoreLabel:
        sourceMatch.status === "final" || sourceMatch.status === "live" || sourceMatch.status === "locked"
          ? scoreLabel
          : null,
      live: sourceMatch.status === "live" || sourceMatch.status === "locked"
    };
  }

  if (sourceMatch.status === "final" && sourceMatch.actualWinnerTeamId) {
    const winner = resolveMatchViewTeamById(sourceMatch, sourceMatch.actualWinnerTeamId);
    const loser =
      winner && homeTeam && awayTeam
        ? winner.id === homeTeam.id
          ? awayTeam
          : homeTeam
        : null;
    const winnerSummary = winner ? mapBracketTeamSummary(winner) : input.directTeam ? mapBracketTeamSummary(input.directTeam) : null;
    const loserSummary = loser ? mapBracketTeamSummary(loser) : null;

    return {
      sourceMatchId: sourceMatch.matchId,
      sourceMatchStatus: sourceMatch.status,
      state: "advanced",
      primaryTeam: winnerSummary,
      secondaryTeam: loserSummary,
      candidates: winnerSummary ? [winnerSummary] : [],
      scoreLabel,
      live: false
    };
  }

  if (sourceMatch.status === "live" || sourceMatch.status === "locked") {
    return {
      sourceMatchId: sourceMatch.matchId,
      sourceMatchStatus: sourceMatch.status,
      state: "live",
      primaryTeam: homeSummary,
      secondaryTeam: awaySummary,
      candidates: [homeSummary, awaySummary].filter((team): team is KnockoutProgressTeamSummary => Boolean(team)),
      scoreLabel,
      live: true
    };
  }

  return {
    sourceMatchId: sourceMatch.matchId,
    sourceMatchStatus: sourceMatch.status,
    state: "pending",
    primaryTeam: homeSummary,
    secondaryTeam: awaySummary,
    candidates: [homeSummary, awaySummary].filter((team): team is KnockoutProgressTeamSummary => Boolean(team)),
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

function mapBracketTeamSummary(team: BracketTeamOption): KnockoutProgressTeamSummary {
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

function compareViewMatchKickoff(left: KnockoutBracketMatchView, right: KnockoutBracketMatchView) {
  const leftKickoff = left.kickoffTime ? new Date(left.kickoffTime).getTime() : Number.POSITIVE_INFINITY;
  const rightKickoff = right.kickoffTime ? new Date(right.kickoffTime).getTime() : Number.POSITIVE_INFINITY;
  return leftKickoff - rightKickoff || left.matchId.localeCompare(right.matchId);
}

function resolveMatchViewTeamById(
  match: KnockoutBracketMatchView,
  teamId: string
): BracketTeamOption | null {
  for (const team of [match.homeTeam, match.awayTeam, match.seededHomeTeam, match.seededAwayTeam]) {
    if (team?.id === teamId) {
      return team;
    }
  }

  return null;
}
