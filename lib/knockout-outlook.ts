import { getKnockoutMatchMaxPoints } from "./bracket-scoring.ts";
import { EXPECTED_KNOCKOUT_MATCH_COUNTS, normalizeKnockoutStage } from "./match-stage.ts";
import type { ManagedGroupRulesetSummary } from "./scoped-scoring.ts";
import type { MatchStage, MatchStatus } from "./types.ts";

const KNOCKOUT_OUTLOOK_STAGES = ["r32", "r16", "qf", "sf", "third", "final"] as const;

export type KnockoutOutlookRoundState =
  | "waiting"
  | "open"
  | "saved"
  | "locked"
  | "final"
  | "missed"
  | "complete";

export type KnockoutOutlookRoundSummary = {
  stage: (typeof KNOCKOUT_OUTLOOK_STAGES)[number];
  label: string;
  shortLabel: string;
  totalMatches: number;
  seededMatches: number;
  savedMatches: number;
  openMatches: number;
  openUnsavedMatches: number;
  lockedMatches: number;
  finalMatches: number;
  missedMatches: number;
  status: KnockoutOutlookRoundState;
  nextLockAt: string | null;
  pointsEarned: number;
  pointsStillAvailable: number;
  href: string;
  helperText: string;
};

export type KnockoutProjectionComparisonSummary = {
  active: boolean;
  comparedSides: number;
  hitSides: number;
  missSides: number;
  matchedRoundOf32Matches: number;
  resolvedProjectedSides: number;
};

export type KnockoutBonusDeadlineSummary = {
  groupId: string;
  groupName: string;
  deadlineAt: string;
  hasBonusMode: boolean;
};

export type DashboardKnockoutOutlookSummary = {
  rounds: KnockoutOutlookRoundSummary[];
  headline: string;
  helperText: string;
  ctaLabel: string;
  ctaHref: string;
  nextOpenStage: (typeof KNOCKOUT_OUTLOOK_STAGES)[number] | null;
  projection: KnockoutProjectionComparisonSummary | null;
  nearestGroupDeadline: KnockoutBonusDeadlineSummary | null;
};

type KnockoutOutlookMatchRow = {
  id: string;
  stage: MatchStage;
  status: MatchStatus;
  kickoffTime: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
};

type KnockoutScoreRow = {
  matchId: string;
  stage: MatchStage;
  points: number | null;
};

type GroupSummary = {
  id: string;
  name: string;
};

type ProjectedRoundOf32Comparison = {
  projectedSeeds: {
    resolvedSideCount: number;
    matches: Array<{
      matchId: string;
      home: { teamId: string | null };
      away: { teamId: string | null };
    }>;
  };
};

type OfficialRoundOf32Match = {
  id: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

export function buildKnockoutOutlookSummary(input: {
  matches: KnockoutOutlookMatchRow[];
  savedPredictionMatchIds: string[];
  scoreRows?: KnockoutScoreRow[];
  projectedComparison?: ProjectedRoundOf32Comparison | null;
  officialRoundOf32Matches?: OfficialRoundOf32Match[];
  groupSummaries?: GroupSummary[];
  groupRulesets?: Map<string, ManagedGroupRulesetSummary>;
  now?: number;
}): DashboardKnockoutOutlookSummary {
  const now = input.now ?? Date.now();
  const savedPredictionMatchIds = new Set(input.savedPredictionMatchIds);
  const pointsByMatchId = new Map(
    (input.scoreRows ?? []).map((row) => [row.matchId, row.points ?? 0])
  );
  const groupNameById = new Map((input.groupSummaries ?? []).map((group) => [group.id, group.name]));

  const stageMatches = new Map<(typeof KNOCKOUT_OUTLOOK_STAGES)[number], KnockoutOutlookMatchRow[]>(
    KNOCKOUT_OUTLOOK_STAGES.map((stage) => [stage, []])
  );

  for (const match of input.matches) {
    const stage = normalizeKnockoutStage(match.stage);
    if (!stage || !stageMatches.has(stage)) {
      continue;
    }

    stageMatches.get(stage)?.push(match);
  }

  const rounds = KNOCKOUT_OUTLOOK_STAGES.map((stage) =>
    buildRoundSummary({
      stage,
      matches: stageMatches.get(stage) ?? [],
      savedPredictionMatchIds,
      pointsByMatchId,
      now
    })
  );

  const nextOpenRound = rounds.find((round) => round.status === "open" || round.status === "saved") ?? null;
  const headline = nextOpenRound
    ? `${nextOpenRound.shortLabel}: ${nextOpenRound.savedMatches}/${nextOpenRound.totalMatches} saved`
    : rounds.every((round) => round.status === "waiting")
      ? "Waiting for qualifying teams"
      : rounds.every((round) => round.status === "complete" || round.status === "final")
        ? "Knockout scoring is closing out"
        : "Review knockout picks";
  const helperText = nextOpenRound
    ? buildNextOpenHelperText(nextOpenRound)
    : rounds.every((round) => round.status === "waiting")
      ? "Waiting for qualifying teams."
      : "Official score picks";

  return {
    rounds,
    headline,
    helperText,
    ctaLabel: getKnockoutOutlookCtaLabel(nextOpenRound, rounds),
    ctaHref: nextOpenRound?.href ?? "/knockout",
    nextOpenStage: nextOpenRound?.stage ?? null,
    projection: buildProjectionComparisonSummary(input.projectedComparison, input.officialRoundOf32Matches),
    nearestGroupDeadline: buildNearestGroupDeadlineSummary({
      groupRulesets: input.groupRulesets,
      groupNameById,
      now
    })
  };
}

function buildRoundSummary(input: {
  stage: (typeof KNOCKOUT_OUTLOOK_STAGES)[number];
  matches: KnockoutOutlookMatchRow[];
  savedPredictionMatchIds: Set<string>;
  pointsByMatchId: Map<string, number>;
  now: number;
}): KnockoutOutlookRoundSummary {
  const totalMatches = EXPECTED_KNOCKOUT_MATCH_COUNTS[input.stage];
  const seededMatches = input.matches.filter((match) => Boolean(match.homeTeamId && match.awayTeamId)).length;
  const openMatches = input.matches.filter((match) => isOpenMatch(match)).length;
  const openUnsavedMatches = input.matches.filter(
    (match) => isOpenMatch(match) && !input.savedPredictionMatchIds.has(match.id)
  ).length;
  const lockedMatches = input.matches.filter((match) => match.status === "locked" || match.status === "live").length;
  const finalMatches = input.matches.filter((match) => match.status === "final").length;
  const savedMatches = input.matches.filter((match) => input.savedPredictionMatchIds.has(match.id)).length;
  const missedMatches = input.matches.filter(
    (match) =>
      !input.savedPredictionMatchIds.has(match.id) &&
      (match.status === "locked" || match.status === "live" || match.status === "final")
  ).length;
  const pointsEarned = input.matches.reduce(
    (sum, match) => sum + (input.pointsByMatchId.get(match.id) ?? 0),
    0
  );
  const pointsStillAvailable = input.matches.reduce((sum, match) => {
    if (match.status === "final") {
      return sum;
    }

    if (match.status === "scheduled") {
      return sum + getKnockoutMatchMaxPoints(match.stage);
    }

    if ((match.status === "locked" || match.status === "live") && input.savedPredictionMatchIds.has(match.id)) {
      return sum + getKnockoutMatchMaxPoints(match.stage);
    }

    return sum;
  }, 0);
  const nextLockAt = input.matches
    .filter((match) => isOpenMatch(match) && match.kickoffTime)
    .sort((left, right) => new Date(left.kickoffTime ?? 0).getTime() - new Date(right.kickoffTime ?? 0).getTime())[0]?.kickoffTime ?? null;
  const firstMatchId = input.matches
    .slice()
    .sort((left, right) => new Date(left.kickoffTime ?? 0).getTime() - new Date(right.kickoffTime ?? 0).getTime())[0]?.id ?? null;
  const status = resolveRoundStatus({
    totalMatches,
    seededMatches,
    savedMatches,
    openMatches,
    lockedMatches,
    finalMatches,
    missedMatches
  });

  return {
    stage: input.stage,
    label: getStageLabel(input.stage),
    shortLabel: getStageShortLabel(input.stage),
    totalMatches,
    seededMatches,
    savedMatches,
    openMatches,
    openUnsavedMatches,
    lockedMatches,
    finalMatches,
    missedMatches,
    status,
    nextLockAt,
    pointsEarned,
    pointsStillAvailable,
    href: firstMatchId ? `/knockout?stage=${input.stage}&matchId=${firstMatchId}` : `/knockout?stage=${input.stage}`,
    helperText: buildRoundHelperText({
      status,
      savedMatches,
      totalMatches,
      openUnsavedMatches,
      missedMatches,
      nextLockAt,
      pointsEarned,
      pointsStillAvailable,
      now: input.now
    })
  };
}

function resolveRoundStatus(input: {
  totalMatches: number;
  seededMatches: number;
  savedMatches: number;
  openMatches: number;
  lockedMatches: number;
  finalMatches: number;
  missedMatches: number;
}): KnockoutOutlookRoundState {
  if (input.finalMatches >= input.totalMatches) {
    return input.savedMatches >= input.totalMatches ? "complete" : "final";
  }

  if (input.seededMatches === 0 && input.savedMatches === 0) {
    return "waiting";
  }

  if (input.openMatches > 0) {
    return input.savedMatches >= input.seededMatches ? "saved" : "open";
  }

  if (input.missedMatches > 0) {
    return "missed";
  }

  if (input.lockedMatches > 0) {
    return input.savedMatches >= input.seededMatches ? "saved" : "locked";
  }

  return "waiting";
}

function buildRoundHelperText(input: {
  status: KnockoutOutlookRoundState;
  savedMatches: number;
  totalMatches: number;
  openUnsavedMatches: number;
  missedMatches: number;
  nextLockAt: string | null;
  pointsEarned: number;
  pointsStillAvailable: number;
  now: number;
}) {
  if (input.status === "complete" || input.status === "final") {
    return input.pointsEarned > 0 ? `${formatCompactPoints(input.pointsEarned)} earned` : "Final";
  }

  if (input.status === "waiting") {
    return "Waiting";
  }

  if (input.status === "missed") {
    return input.missedMatches === 1 ? "1 missed" : `${input.missedMatches} missed`;
  }

  if (input.nextLockAt) {
    const lockLabel = formatCompactDate(input.nextLockAt);
    if (input.openUnsavedMatches > 0) {
      const picksLeft = input.openUnsavedMatches;
      return `${picksLeft} left · ${lockLabel}`;
    }

    return `Saved · ${lockLabel}`;
  }

  if (input.pointsStillAvailable > 0) {
    return `${formatCompactPoints(input.pointsStillAvailable)} alive`;
  }

  return `${input.savedMatches}/${input.totalMatches} saved`;
}

function buildNextOpenHelperText(round: KnockoutOutlookRoundSummary) {
  if (round.openMatches > 0 && round.nextLockAt) {
    const picksLeft = round.openUnsavedMatches;
    if (picksLeft <= 0) {
      return `Saved · ${formatCompactDate(round.nextLockAt)}`;
    }
    return `${picksLeft} ${picksLeft === 1 ? "pick" : "picks"} left · Locks ${formatCompactDate(round.nextLockAt)}`;
  }

  if (round.pointsStillAvailable > 0) {
    return `${formatCompactPoints(round.pointsStillAvailable)} still available`;
  }

  return round.helperText;
}

function getKnockoutOutlookCtaLabel(
  nextOpenRound: KnockoutOutlookRoundSummary | null,
  rounds: KnockoutOutlookRoundSummary[]
) {
  if (!nextOpenRound) {
    return rounds.every((round) => round.status === "waiting") ? "Waiting for qualifiers" : "Review Knockout Picks";
  }

  if (nextOpenRound.stage === "r32") {
    return "Predict R32 Scores";
  }

  return `Continue ${nextOpenRound.shortLabel} Picks`;
}

function buildProjectionComparisonSummary(
  projectedComparison?: ProjectedRoundOf32Comparison | null,
  officialRoundOf32Matches?: OfficialRoundOf32Match[]
): KnockoutProjectionComparisonSummary | null {
  if (!projectedComparison) {
    return null;
  }

  const officialByMatchId = new Map(
    (officialRoundOf32Matches ?? []).map((match) => [match.id, match])
  );
  const matches = projectedComparison.projectedSeeds.matches;
  let comparedSides = 0;
  let hitSides = 0;
  let missSides = 0;
  let matchedRoundOf32Matches = 0;

  for (const match of matches) {
    const officialMatch = officialByMatchId.get(match.matchId);
    if (!officialMatch) {
      continue;
    }

    const homeProjected = match.home.teamId;
    const awayProjected = match.away.teamId;
    let roundComparedSides = 0;
    let roundHits = 0;

    if (homeProjected && officialMatch.homeTeamId) {
      roundComparedSides += 1;
      if (homeProjected === officialMatch.homeTeamId) {
        roundHits += 1;
        hitSides += 1;
      } else {
        missSides += 1;
      }
    }

    if (awayProjected && officialMatch.awayTeamId) {
      roundComparedSides += 1;
      if (awayProjected === officialMatch.awayTeamId) {
        roundHits += 1;
        hitSides += 1;
      } else {
        missSides += 1;
      }
    }

    comparedSides += roundComparedSides;
    if (roundComparedSides === 2 && roundHits === 2) {
      matchedRoundOf32Matches += 1;
    }
  }

  return {
    active: projectedComparison.projectedSeeds.resolvedSideCount > 0,
    comparedSides,
    hitSides,
    missSides,
    matchedRoundOf32Matches,
    resolvedProjectedSides: projectedComparison.projectedSeeds.resolvedSideCount
  };
}

function buildNearestGroupDeadlineSummary(input: {
  groupRulesets?: Map<string, ManagedGroupRulesetSummary>;
  groupNameById: Map<string, string>;
  now: number;
}): KnockoutBonusDeadlineSummary | null {
  const rulesets = Array.from(input.groupRulesets?.values() ?? [])
    .filter((ruleset) => {
      if (!ruleset.knockoutPicksDueAt) {
        return false;
      }

      const deadlineTime = new Date(ruleset.knockoutPicksDueAt).getTime();
      return Number.isFinite(deadlineTime) && deadlineTime >= input.now;
    })
    .map((ruleset) => ({
      groupId: ruleset.groupId,
      groupName: input.groupNameById.get(ruleset.groupId) ?? "Group",
      deadlineAt: ruleset.knockoutPicksDueAt as string,
      hasBonusMode:
        ruleset.groupBonusMode !== "classic" ||
        ruleset.knockoutCompletionBonus > 0 ||
        ruleset.finalMatchupBonus > 0 ||
        ruleset.exactFinalScoreBonus > 0
    }))
    .sort((left, right) => {
      const leftDelta = new Date(left.deadlineAt).getTime() - input.now;
      const rightDelta = new Date(right.deadlineAt).getTime() - input.now;
      return leftDelta - rightDelta;
    });

  return rulesets[0] ?? null;
}

function isOpenMatch(match: KnockoutOutlookMatchRow) {
  return match.status === "scheduled" && Boolean(match.homeTeamId && match.awayTeamId);
}

function getStageLabel(stage: (typeof KNOCKOUT_OUTLOOK_STAGES)[number]) {
  switch (stage) {
    case "r32":
      return "R32";
    case "r16":
      return "R16";
    case "qf":
      return "QF";
    case "sf":
      return "SF";
    case "third":
      return "3rd";
    case "final":
      return "Final";
  }
}

function getStageShortLabel(stage: (typeof KNOCKOUT_OUTLOOK_STAGES)[number]) {
  if (stage === "third") {
    return "Third Place";
  }

  return stage === "final" ? "Final" : getStageLabel(stage);
}

function formatCompactPoints(value: number) {
  return `${value} pts`;
}

function formatCompactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Locks soon";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric"
  }).format(date);
}
