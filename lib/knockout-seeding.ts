import { applyGroupStandingsResult, createMiniGroupStandingsRow } from "@/lib/group-standings";
import type { Team } from "@/lib/types";
import type { MiniGroupStandingsRow } from "@/components/GroupStandingsMiniTable";

export type GroupStageMatchForSeeding = {
  id: string;
  stage: string;
  groupName?: string | null;
  status: "scheduled" | "locked" | "live" | "final";
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
};

export type KnockoutPlaceholderMatch = {
  id: string;
  stage: string;
  homeSource?: string | null;
  awaySource?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  status: "scheduled" | "locked" | "live" | "final";
};

export type QualifiedTeamSeed = {
  teamId: string;
  teamName: string;
  teamShortName: string;
  groupName: string;
  finish: 1 | 2 | 3;
  points: number;
  goalDifference: number;
  goalsFor: number;
};

export type KnockoutSeedAssignment = {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeSource: string;
  awaySource: string;
};

export type GroupStandingsRow = MiniGroupStandingsRow & {
  rank: number;
};

export type ProjectedMatchScoreSource = "actual" | "prediction" | "missing";

export type GroupStagePredictionForProjection = {
  matchId: string;
  predictedHomeScore?: number | null;
  predictedAwayScore?: number | null;
};

export type ResolvedProjectedMatchScore = {
  homeScore: number | null;
  awayScore: number | null;
  source: ProjectedMatchScoreSource;
};

export type ProjectedGroupStandings = {
  groupId: string;
  rows: GroupStandingsRow[];
  matchSourceCounts: {
    actual: number;
    prediction: number;
    missing: number;
  };
  isComplete: boolean;
  isFullyActual: boolean;
  isHybrid: boolean;
};

export type ProjectedRoundOf32Side = {
  sourceLabel: string;
  teamId: string | null;
  resolutionSource: ProjectedMatchScoreSource;
};

export type ProjectedRoundOf32Match = {
  matchId: string;
  stage: string;
  home: ProjectedRoundOf32Side;
  away: ProjectedRoundOf32Side;
};

export type GroupSeedRankingInput = {
  groupName: string;
  rankedTeamIds: string[];
};

type ParsedSeedSource =
  | { kind: "group"; groupName: string; finish: 1 | 2 }
  | { kind: "third_place"; rank: number };

const GROUP_STAGE_NAME = "group";
const ROUND_OF_32_STAGES = new Set(["r32", "round_of_32"]);

export function buildGroupStandingsByGroup(
  matches: GroupStageMatchForSeeding[],
  teams: Team[]
): Map<string, GroupStandingsRow[]> {
  const projectedStandings = buildProjectedGroupStandings(matches, teams);
  return new Map(
    Array.from(projectedStandings.entries()).map(([groupId, standings]) => [groupId, standings.rows])
  );
}

export function resolveProjectedMatchScore({
  match,
  userPrediction
}: {
  match: GroupStageMatchForSeeding;
  userPrediction?: GroupStagePredictionForProjection | null;
}): ResolvedProjectedMatchScore {
  if (
    match.status === "final" &&
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined
  ) {
    return {
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      source: "actual"
    };
  }

  if (
    userPrediction &&
    userPrediction.predictedHomeScore !== null &&
    userPrediction.predictedHomeScore !== undefined &&
    userPrediction.predictedAwayScore !== null &&
    userPrediction.predictedAwayScore !== undefined
  ) {
    return {
      homeScore: userPrediction.predictedHomeScore,
      awayScore: userPrediction.predictedAwayScore,
      source: "prediction"
    };
  }

  return {
    homeScore: null,
    awayScore: null,
    source: "missing"
  };
}

export function buildProjectedGroupStandings(
  matches: GroupStageMatchForSeeding[],
  teams: Team[],
  userPredictions: GroupStagePredictionForProjection[] = []
): Map<string, ProjectedGroupStandings> {
  const groupStageMatches = matches.filter((match) => match.stage === GROUP_STAGE_NAME);
  const teamsByGroup = new Map<string, Team[]>();
  const predictionsByMatchId = new Map(userPredictions.map((prediction) => [prediction.matchId, prediction]));

  for (const team of teams) {
    const normalizedGroupName = normalizeGroupName(team.groupName);
    const current = teamsByGroup.get(normalizedGroupName) ?? [];
    current.push(team);
    teamsByGroup.set(normalizedGroupName, current);
  }

  const matchesByGroup = new Map<string, GroupStageMatchForSeeding[]>();
  for (const match of groupStageMatches) {
    if (!match.groupName) {
      continue;
    }

    const normalizedGroupName = normalizeGroupName(match.groupName);
    const current = matchesByGroup.get(normalizedGroupName) ?? [];
    current.push(match);
    matchesByGroup.set(normalizedGroupName, current);
  }

  const standingsByGroup = new Map<string, ProjectedGroupStandings>();
  for (const [groupName, groupTeams] of teamsByGroup) {
    const rowsByTeamId = new Map<string, MiniGroupStandingsRow>();
    for (const team of groupTeams) {
      rowsByTeamId.set(team.id, createMiniGroupStandingsRow(team));
    }

    const groupMatches = matchesByGroup.get(groupName) ?? [];
    const matchSourceCounts = {
      actual: 0,
      prediction: 0,
      missing: 0
    };

    for (const match of groupMatches) {
      if (!match.homeTeamId || !match.awayTeamId) {
        continue;
      }

      const resolved = resolveProjectedMatchScore({
        match,
        userPrediction: predictionsByMatchId.get(match.id)
      });

      matchSourceCounts[resolved.source] += 1;
      if (
        resolved.source === "missing" ||
        resolved.homeScore === null ||
        resolved.awayScore === null
      ) {
        continue;
      }

      const homeRow = rowsByTeamId.get(match.homeTeamId);
      const awayRow = rowsByTeamId.get(match.awayTeamId);
      if (!homeRow || !awayRow) {
        continue;
      }

      applyGroupStandingsResult(homeRow, awayRow, resolved.homeScore, resolved.awayScore);
    }

    const sortedRows = sortGroupStandingsWithHeadToHead(
      Array.from(rowsByTeamId.values()),
      groupMatches,
      predictionsByMatchId
    ).map((row, index) => ({
      ...row,
      rank: index + 1
    }));

    standingsByGroup.set(groupName, {
      groupId: groupName,
      rows: sortedRows,
      matchSourceCounts,
      isComplete: matchSourceCounts.missing === 0,
      isFullyActual: matchSourceCounts.missing === 0 && matchSourceCounts.prediction === 0,
      isHybrid: matchSourceCounts.actual > 0 && matchSourceCounts.prediction > 0
    });
  }

  return standingsByGroup;
}

export function buildQualifiedTeamSeeds(
  standingsByGroup: Map<string, GroupStandingsRow[]>,
  thirdPlaceQualifierCount = 8
) {
  const automaticQualifiers = new Map<string, QualifiedTeamSeed>();
  const thirdPlaceCandidates: QualifiedTeamSeed[] = [];

  for (const [groupName, rows] of standingsByGroup) {
    const winner = rows[0];
    const runnerUp = rows[1];
    const thirdPlace = rows[2];

    if (!winner || !runnerUp) {
      throw new Error(`Could not determine the top two teams for ${groupName}.`);
    }

    automaticQualifiers.set(buildQualifierKey(groupName, 1), toQualifiedSeed(groupName, winner, 1));
    automaticQualifiers.set(buildQualifierKey(groupName, 2), toQualifiedSeed(groupName, runnerUp, 2));

    if (thirdPlace) {
      thirdPlaceCandidates.push(toQualifiedSeed(groupName, thirdPlace, 3));
    }
  }

  const rankedThirdPlaceTeams = [...thirdPlaceCandidates]
    .sort(sortQualifiedSeeds)
    .slice(0, thirdPlaceQualifierCount)
    .map((seed, index) => ({ ...seed, thirdPlaceRank: index + 1 }));

  return {
    automaticQualifiers,
    rankedThirdPlaceTeams
  };
}

export function buildQualifiedTeamSeedsFromManualThirdPlaceRanking(
  standingsByGroup: Map<string, GroupStandingsRow[]>,
  rankedThirdPlaceTeamIds: string[],
  requiredThirdPlaceCount: number
) {
  const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(
    standingsByGroup,
    standingsByGroup.size
  );
  const thirdPlaceByTeamId = new Map(rankedThirdPlaceTeams.map((seed) => [seed.teamId, seed]));
  const uniqueTeamIds = Array.from(new Set(rankedThirdPlaceTeamIds));

  if (uniqueTeamIds.length !== rankedThirdPlaceTeamIds.length) {
    throw new Error("Each third-place qualifier can only be ranked once.");
  }

  if (uniqueTeamIds.length !== requiredThirdPlaceCount) {
    throw new Error(`Rank exactly ${requiredThirdPlaceCount} third-place qualifiers before saving.`);
  }

  const rankedManualSeeds = uniqueTeamIds.map((teamId, index) => {
    const seed = thirdPlaceByTeamId.get(teamId);
    if (!seed) {
      throw new Error("Only teams ranked 3rd in their group can be selected as best third-place qualifiers.");
    }

    return {
      ...seed,
      thirdPlaceRank: index + 1
    };
  });

  return {
    automaticQualifiers,
    rankedThirdPlaceTeams: rankedManualSeeds
  };
}

export function buildProjectedGroupStandingsFromSeedRankings(
  teams: Team[],
  rankings: GroupSeedRankingInput[]
): Map<string, ProjectedGroupStandings> {
  const teamsByGroup = new Map<string, Team[]>();
  for (const team of teams) {
    const normalizedGroupName = normalizeGroupName(team.groupName);
    const current = teamsByGroup.get(normalizedGroupName) ?? [];
    current.push(team);
    teamsByGroup.set(normalizedGroupName, current);
  }

  const rankingByGroup = new Map(
    rankings
      .map((ranking) => [normalizeGroupName(ranking.groupName), ranking.rankedTeamIds] as const)
      .filter((entry) => entry[1].length > 0)
  );

  const standingsByGroup = new Map<string, ProjectedGroupStandings>();
  for (const [groupName, groupTeams] of teamsByGroup) {
    const rankedTeamIds = rankingByGroup.get(groupName) ?? [];
    if (rankedTeamIds.length === 0) {
      const rows = groupTeams
        .map((team) => ({
          ...createMiniGroupStandingsRow(team),
          rank: 0
        }))
        .sort((left, right) => left.teamName.localeCompare(right.teamName));

      standingsByGroup.set(groupName, {
        groupId: groupName,
        rows,
        matchSourceCounts: {
          actual: 0,
          prediction: 0,
          missing: groupTeams.length > 0 ? 1 : 0
        },
        isComplete: false,
        isFullyActual: false,
        isHybrid: false
      });
      continue;
    }

    const uniqueRankedTeamIds = Array.from(new Set(rankedTeamIds));
    if (uniqueRankedTeamIds.length !== rankedTeamIds.length) {
      throw new Error(`Each team in ${groupName} must appear exactly once.`);
    }

    const teamIdsInGroup = new Set(groupTeams.map((team) => team.id));
    if (uniqueRankedTeamIds.length !== teamIdsInGroup.size) {
      throw new Error(`Rank every team in ${groupName} before saving.`);
    }

    for (const teamId of uniqueRankedTeamIds) {
      if (!teamIdsInGroup.has(teamId)) {
        throw new Error(`${teamId} does not belong to ${groupName}.`);
      }
    }

    const rows = uniqueRankedTeamIds.map((teamId, index) => {
      const team = groupTeams.find((candidate) => candidate.id === teamId);
      if (!team) {
        throw new Error(`Could not find ${teamId} in ${groupName}.`);
      }

      return {
        ...createMiniGroupStandingsRow(team),
        rank: index + 1
      };
    });

    standingsByGroup.set(groupName, {
      groupId: groupName,
      rows,
      matchSourceCounts: {
        actual: 0,
        prediction: 1,
        missing: 0
      },
      isComplete: true,
      isFullyActual: false,
      isHybrid: false
    });
  }

  return standingsByGroup;
}

export function resolveRoundOf32SeedAssignments(
  matches: KnockoutPlaceholderMatch[],
  qualifiers: Map<string, QualifiedTeamSeed>,
  rankedThirdPlaceTeams: Array<QualifiedTeamSeed & { thirdPlaceRank: number }>
): KnockoutSeedAssignment[] {
  const thirdPlaceByRank = new Map(rankedThirdPlaceTeams.map((seed) => [seed.thirdPlaceRank, seed]));
  const assignments: KnockoutSeedAssignment[] = [];

  for (const match of matches) {
    if (!ROUND_OF_32_STAGES.has(match.stage)) {
      continue;
    }

    const homeSeed = parseSeedSource(match.homeSource);
    const awaySeed = parseSeedSource(match.awaySource);
    if (!homeSeed || !awaySeed) {
      continue;
    }

    const homeTeam = resolveSeededTeam(homeSeed, qualifiers, thirdPlaceByRank);
    const awayTeam = resolveSeededTeam(awaySeed, qualifiers, thirdPlaceByRank);

    if (!homeTeam || !awayTeam) {
      throw new Error(`Could not resolve ${match.id} from ${match.homeSource ?? "unknown source"} and ${match.awaySource ?? "unknown source"}.`);
    }

    assignments.push({
      matchId: match.id,
      homeTeamId: homeTeam.teamId,
      awayTeamId: awayTeam.teamId,
      homeSource: match.homeSource ?? "",
      awaySource: match.awaySource ?? ""
    });
  }

  return assignments.sort((left, right) => left.matchId.localeCompare(right.matchId));
}

export function buildUserProjectedRoundOf32({
  groupMatches,
  teams,
  predictions,
  roundOf32Placeholders,
  standingsByGroupOverride,
  rankedThirdPlaceTeamIdsOverride
}: {
  groupMatches: GroupStageMatchForSeeding[];
  teams: Team[];
  predictions: GroupStagePredictionForProjection[];
  roundOf32Placeholders: KnockoutPlaceholderMatch[];
  standingsByGroupOverride?: Map<string, ProjectedGroupStandings> | null;
  rankedThirdPlaceTeamIdsOverride?: string[] | null;
}) {
  const standingsByGroup = standingsByGroupOverride ?? buildProjectedGroupStandings(groupMatches, teams, predictions);
  const completeRowsByGroup = new Map<string, GroupStandingsRow[]>();

  for (const [groupId, standings] of standingsByGroup) {
    if (standings.isComplete) {
      completeRowsByGroup.set(groupId, standings.rows);
    }
  }

  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders);
  const { automaticQualifiers, rankedThirdPlaceTeams } =
    rankedThirdPlaceTeamIdsOverride && rankedThirdPlaceTeamIdsOverride.length > 0
      ? rankedThirdPlaceTeamIdsOverride.length >= requiredThirdPlaceQualifierCount
        ? buildQualifiedTeamSeedsFromManualThirdPlaceRanking(
            completeRowsByGroup,
            rankedThirdPlaceTeamIdsOverride,
            requiredThirdPlaceQualifierCount
          )
        : buildQualifiedTeamSeeds(completeRowsByGroup, 0)
      : buildQualifiedTeamSeeds(completeRowsByGroup, requiredThirdPlaceQualifierCount || 8);
  const thirdPlaceByRank = new Map(rankedThirdPlaceTeams.map((seed) => [seed.thirdPlaceRank, seed]));
  const allGroupsComplete = Array.from(standingsByGroup.values()).every((group) => group.isComplete);

  const matches: ProjectedRoundOf32Match[] = roundOf32Placeholders
    .filter((match) => ROUND_OF_32_STAGES.has(match.stage))
    .map((match) => {
      const homeSeed = parseSeedSource(match.homeSource);
      const awaySeed = parseSeedSource(match.awaySource);

      return {
        matchId: match.id,
        stage: match.stage,
        home: resolveProjectedRoundOf32Side(match.homeSource ?? "TBD", homeSeed, standingsByGroup, automaticQualifiers, thirdPlaceByRank, allGroupsComplete),
        away: resolveProjectedRoundOf32Side(match.awaySource ?? "TBD", awaySeed, standingsByGroup, automaticQualifiers, thirdPlaceByRank, allGroupsComplete)
      };
    })
    .sort((left, right) => left.matchId.localeCompare(right.matchId));

  const resolvedSideCount = matches.reduce(
    (sum, match) => sum + (match.home.teamId ? 1 : 0) + (match.away.teamId ? 1 : 0),
    0
  );
  const totalActualMatchesUsed = Array.from(standingsByGroup.values()).reduce(
    (sum, group) => sum + group.matchSourceCounts.actual,
    0
  );
  const totalPredictedMatchesUsed = Array.from(standingsByGroup.values()).reduce(
    (sum, group) => sum + group.matchSourceCounts.prediction,
    0
  );

  return {
    standingsByGroup,
    matches,
    resolvedSideCount,
    isFullyActual: Array.from(standingsByGroup.values()).every((group) => group.isFullyActual),
    isHybrid: Array.from(standingsByGroup.values()).some((group) => group.isHybrid),
    usesPredictions: totalPredictedMatchesUsed > 0,
    usesActualResults: totalActualMatchesUsed > 0
  };
}

export function getRequiredThirdPlaceQualifierCount(
  matches: KnockoutPlaceholderMatch[]
) {
  const ranks = new Set<number>();

  for (const match of matches) {
    if (!ROUND_OF_32_STAGES.has(match.stage)) {
      continue;
    }

    for (const source of [match.homeSource, match.awaySource]) {
      const parsedSource = parseSeedSource(source);
      if (parsedSource?.kind === "third_place") {
        ranks.add(parsedSource.rank);
      }
    }
  }

  return ranks.size;
}

export function parseSeedSource(value?: string | null): ParsedSeedSource | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return {
      kind: "group",
      groupName: `Group ${groupMatch[1].toUpperCase()}`,
      finish: groupMatch[2].toLowerCase() === "winner" ? 1 : 2
    };
  }

  const thirdPlaceMatch = normalized.match(/^Best third-place\s+(\d{1,2})$/i);
  if (thirdPlaceMatch) {
    return {
      kind: "third_place",
      rank: Number(thirdPlaceMatch[1])
    };
  }

  return null;
}

export function summarizeKnockoutSeedState(matches: KnockoutPlaceholderMatch[]) {
  const roundOf32Matches = matches.filter((match) => ROUND_OF_32_STAGES.has(match.stage));
  const seededMatchCount = roundOf32Matches.filter((match) => match.homeTeamId && match.awayTeamId).length;
  const hasAnySeeds = roundOf32Matches.some((match) => match.homeTeamId || match.awayTeamId);
  const hasKnockoutStarted = matches.some((match) => ROUND_OF_32_STAGES.has(match.stage) && match.status !== "scheduled");

  return {
    roundOf32MatchCount: roundOf32Matches.length,
    seededMatchCount,
    hasAnySeeds,
    hasKnockoutStarted
  };
}

function sortGroupStandingsWithHeadToHead(
  rows: MiniGroupStandingsRow[],
  groupMatches: GroupStageMatchForSeeding[],
  predictionsByMatchId: Map<string, GroupStagePredictionForProjection> = new Map()
) {
  const baseSorted = [...rows].sort(sortStandingsRows);
  const finalRows: MiniGroupStandingsRow[] = [];

  let index = 0;
  while (index < baseSorted.length) {
    const current = baseSorted[index];
    const cluster = [current];
    index += 1;

    while (index < baseSorted.length && hasSamePrimaryStats(current, baseSorted[index])) {
      cluster.push(baseSorted[index]);
      index += 1;
    }

    if (cluster.length === 1) {
      finalRows.push(cluster[0]);
      continue;
    }

    finalRows.push(...sortTiedClusterByHeadToHead(cluster, groupMatches, predictionsByMatchId));
  }

  return finalRows;
}

function sortTiedClusterByHeadToHead(
  tiedRows: MiniGroupStandingsRow[],
  groupMatches: GroupStageMatchForSeeding[],
  predictionsByMatchId: Map<string, GroupStagePredictionForProjection>
) {
  const tiedIds = new Set(tiedRows.map((row) => row.teamId));
  const tiedMatches = groupMatches.filter(
    (match) =>
      match.homeTeamId &&
      match.awayTeamId &&
      tiedIds.has(match.homeTeamId) &&
      tiedIds.has(match.awayTeamId)
  );

  const miniRows = new Map<string, MiniGroupStandingsRow>();
  for (const row of tiedRows) {
    miniRows.set(row.teamId, {
      ...row,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0
    });
  }

  for (const match of tiedMatches) {
    const resolved = resolveProjectedMatchScore({
      match,
      userPrediction: predictionsByMatchId.get(match.id)
    });
    if (resolved.homeScore === null || resolved.awayScore === null) {
      continue;
    }

    const homeRow = miniRows.get(match.homeTeamId!);
    const awayRow = miniRows.get(match.awayTeamId!);
    if (!homeRow || !awayRow) {
      continue;
    }

    applyGroupStandingsResult(homeRow, awayRow, resolved.homeScore, resolved.awayScore);
  }

  return [...tiedRows].sort((left, right) => {
    const leftMini = miniRows.get(left.teamId);
    const rightMini = miniRows.get(right.teamId);
    if (leftMini && rightMini) {
      const miniCompare = sortStandingsRows(leftMini, rightMini);
      if (miniCompare !== 0) {
        return miniCompare;
      }
    }

    return sortStandingsRows(left, right);
  });
}

function sortQualifiedSeeds(left: QualifiedTeamSeed, right: QualifiedTeamSeed) {
  if (right.points !== left.points) {
    return right.points - left.points;
  }

  if (right.goalDifference !== left.goalDifference) {
    return right.goalDifference - left.goalDifference;
  }

  if (right.goalsFor !== left.goalsFor) {
    return right.goalsFor - left.goalsFor;
  }

  return left.teamName.localeCompare(right.teamName);
}

function sortStandingsRows(left: MiniGroupStandingsRow, right: MiniGroupStandingsRow) {
  if (right.points !== left.points) {
    return right.points - left.points;
  }

  if (right.goalDifference !== left.goalDifference) {
    return right.goalDifference - left.goalDifference;
  }

  if (right.goalsFor !== left.goalsFor) {
    return right.goalsFor - left.goalsFor;
  }

  return left.teamName.localeCompare(right.teamName);
}

function hasSamePrimaryStats(left: MiniGroupStandingsRow, right: MiniGroupStandingsRow) {
  return (
    left.points === right.points &&
    left.goalDifference === right.goalDifference &&
    left.goalsFor === right.goalsFor
  );
}

function toQualifiedSeed(groupName: string, row: MiniGroupStandingsRow, finish: 1 | 2 | 3): QualifiedTeamSeed {
  return {
    teamId: row.teamId,
    teamName: row.teamName,
    teamShortName: row.teamCode ?? row.teamName,
    groupName,
    finish,
    points: row.points,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor
  };
}

function buildQualifierKey(groupName: string, finish: 1 | 2) {
  return `${normalizeGroupName(groupName)}:${finish}`;
}

function resolveSeededTeam(
  parsed: ParsedSeedSource,
  qualifiers: Map<string, QualifiedTeamSeed>,
  thirdPlaceByRank: Map<number, QualifiedTeamSeed & { thirdPlaceRank: number }>
) {
  if (parsed.kind === "group") {
    return qualifiers.get(buildQualifierKey(parsed.groupName, parsed.finish)) ?? null;
  }

  return thirdPlaceByRank.get(parsed.rank) ?? null;
}

function resolveProjectedRoundOf32Side(
  sourceLabel: string,
  parsedSeed: ParsedSeedSource | null,
  standingsByGroup: Map<string, ProjectedGroupStandings>,
  qualifiers: Map<string, QualifiedTeamSeed>,
  thirdPlaceByRank: Map<number, QualifiedTeamSeed & { thirdPlaceRank: number }>,
  allGroupsComplete: boolean
): ProjectedRoundOf32Side {
  if (!parsedSeed) {
    return {
      sourceLabel,
      teamId: null,
      resolutionSource: "missing"
    };
  }

  if (parsedSeed.kind === "group") {
    const groupState = standingsByGroup.get(normalizeGroupName(parsedSeed.groupName));
    if (!groupState?.isComplete) {
      return {
        sourceLabel,
        teamId: null,
        resolutionSource: "missing"
      };
    }

    const qualifier = qualifiers.get(buildQualifierKey(parsedSeed.groupName, parsedSeed.finish)) ?? null;
    return {
      sourceLabel,
      teamId: qualifier?.teamId ?? null,
      resolutionSource: groupState.isFullyActual ? "actual" : qualifier ? "prediction" : "missing"
    };
  }

  if (!allGroupsComplete) {
    return {
      sourceLabel,
      teamId: null,
      resolutionSource: "missing"
    };
  }

  const thirdPlaceSeed = thirdPlaceByRank.get(parsedSeed.rank) ?? null;
  const source = thirdPlaceSeed ? getQualifierSourceForGroup(standingsByGroup, thirdPlaceSeed.groupName) : "missing";

  return {
    sourceLabel,
    teamId: thirdPlaceSeed?.teamId ?? null,
    resolutionSource: source
  };
}

function getQualifierSourceForGroup(
  standingsByGroup: Map<string, ProjectedGroupStandings>,
  groupName: string
): ProjectedMatchScoreSource {
  const groupState = standingsByGroup.get(normalizeGroupName(groupName));
  if (!groupState?.isComplete) {
    return "missing";
  }

  return groupState.isFullyActual ? "actual" : "prediction";
}

function normalizeGroupName(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("Group ") ? trimmed : `Group ${trimmed}`;
}
