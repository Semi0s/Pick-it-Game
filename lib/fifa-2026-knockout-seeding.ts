import {
  compareGroupLetters,
  FIFA_2026_THIRD_PLACE_ASSIGNMENT_TARGETS,
  getFifa2026ThirdPlacePermutation,
  isFifa2026GroupLetter,
  type Fifa2026GroupLetter,
  type Fifa2026SeedSource,
  type Fifa2026ThirdPlaceAssignmentTarget
} from "./fifa-2026-third-place-permutations.ts";

export type Fifa2026StandingsTeam = {
  teamId: string;
  teamName: string;
  teamShortName?: string | null;
  points: number;
  goalDifference: number;
  goalsFor: number;
  teamConductScore?: number | null;
  fifaRanking?: number | null;
};

export type Fifa2026QualifiedSeed = Fifa2026StandingsTeam & {
  groupLetter: Fifa2026GroupLetter;
  finish: 1 | 2 | 3;
  source: Fifa2026SeedSource;
  thirdPlaceRank?: number;
};

export type Fifa2026RoundOf32Side = {
  source: Fifa2026SeedSource | null;
  placeholder: string | null;
  candidateGroups: Fifa2026GroupLetter[];
  teamId: string | null;
  teamName: string | null;
  teamShortName: string | null;
};

export type Fifa2026RoundOf32Match = {
  matchId: Fifa2026RoundOf32MatchId;
  round: "roundOf32";
  sideA: Fifa2026RoundOf32Side;
  sideB: Fifa2026RoundOf32Side;
};

export type Fifa2026RoundOf32MatchId =
  | "M73"
  | "M74"
  | "M75"
  | "M76"
  | "M77"
  | "M78"
  | "M79"
  | "M80"
  | "M81"
  | "M82"
  | "M83"
  | "M84"
  | "M85"
  | "M86"
  | "M87"
  | "M88";

export type Fifa2026RoundOf32StoredMatchLike = {
  id: string;
  stage?: string | null;
};

type Fifa2026RoundOf32Slot =
  | { kind: "fixed"; source: Fifa2026SeedSource }
  | {
      kind: "third-place-assignment";
      target: Fifa2026ThirdPlaceAssignmentTarget;
      candidateGroups: Fifa2026GroupLetter[];
    };

type Fifa2026RoundOf32Definition = {
  matchId: Fifa2026RoundOf32MatchId;
  sideA: Fifa2026RoundOf32Slot;
  sideB: Fifa2026RoundOf32Slot;
};

export const FIFA_2026_THIRD_PLACE_PLACEHOLDERS: Record<
  Fifa2026ThirdPlaceAssignmentTarget,
  readonly Fifa2026GroupLetter[]
> = {
  "1A": ["C", "E", "F", "H", "I"],
  "1B": ["E", "F", "G", "I", "J"],
  "1D": ["B", "E", "F", "I", "J"],
  "1E": ["A", "B", "C", "D", "F"],
  "1G": ["A", "E", "H", "I", "J"],
  "1I": ["C", "D", "F", "G", "H"],
  "1K": ["D", "E", "I", "J", "L"],
  "1L": ["E", "H", "I", "J", "K"]
};

export const FIFA_2026_ROUND_OF_32_DEFINITIONS: readonly Fifa2026RoundOf32Definition[] = [
  { matchId: "M73", sideA: fixed("2A"), sideB: fixed("2B") },
  { matchId: "M74", sideA: fixed("1E"), sideB: third("1E") },
  { matchId: "M75", sideA: fixed("1F"), sideB: fixed("2C") },
  { matchId: "M76", sideA: fixed("1C"), sideB: fixed("2F") },
  { matchId: "M77", sideA: fixed("1I"), sideB: third("1I") },
  { matchId: "M78", sideA: fixed("2E"), sideB: fixed("2I") },
  { matchId: "M79", sideA: fixed("1A"), sideB: third("1A") },
  { matchId: "M80", sideA: fixed("1L"), sideB: third("1L") },
  { matchId: "M81", sideA: fixed("1D"), sideB: third("1D") },
  { matchId: "M82", sideA: fixed("1G"), sideB: third("1G") },
  { matchId: "M83", sideA: fixed("2K"), sideB: fixed("2L") },
  { matchId: "M84", sideA: fixed("1H"), sideB: fixed("2J") },
  { matchId: "M85", sideA: fixed("1B"), sideB: third("1B") },
  { matchId: "M86", sideA: fixed("1J"), sideB: fixed("2H") },
  { matchId: "M87", sideA: fixed("1K"), sideB: third("1K") },
  { matchId: "M88", sideA: fixed("2D"), sideB: fixed("2G") }
];

const LEGACY_R32_ID_BY_OFFICIAL_MATCH_ID = new Map<string, string>([
  ["M73", "r32-01"],
  ["M74", "r32-02"],
  ["M75", "r32-03"],
  ["M76", "r32-04"],
  ["M77", "r32-05"],
  ["M78", "r32-06"],
  ["M79", "r32-07"],
  ["M80", "r32-08"],
  ["M81", "r32-09"],
  ["M82", "r32-10"],
  ["M83", "r32-11"],
  ["M84", "r32-12"],
  ["M85", "r32-13"],
  ["M86", "r32-14"],
  ["M87", "r32-15"],
  ["M88", "r32-16"]
]);

export const FIFA_2026_OFFICIAL_KNOCKOUT_KICKOFF_BY_STORED_MATCH_ID = new Map<string, string>([
  ["M73", "2026-06-28T12:00:00-07:00"],
  ["M74", "2026-06-29T16:30:00-04:00"],
  ["M75", "2026-06-29T19:00:00-06:00"],
  ["M76", "2026-06-29T12:00:00-05:00"],
  ["M77", "2026-06-30T17:00:00-04:00"],
  ["M78", "2026-06-30T12:00:00-05:00"],
  ["M79", "2026-06-30T19:00:00-06:00"],
  ["M80", "2026-07-01T12:00:00-04:00"],
  ["M81", "2026-07-01T17:00:00-07:00"],
  ["M82", "2026-07-01T13:00:00-07:00"],
  ["M83", "2026-07-02T19:00:00-04:00"],
  ["M84", "2026-07-02T12:00:00-07:00"],
  ["M85", "2026-07-02T20:00:00-07:00"],
  ["M86", "2026-07-03T18:00:00-04:00"],
  ["M87", "2026-07-03T20:30:00-05:00"],
  ["M88", "2026-07-03T13:00:00-05:00"],
  ["M89", "2026-07-04T17:00:00-04:00"],
  ["M90", "2026-07-04T12:00:00-05:00"],
  ["M91", "2026-07-05T16:00:00-04:00"],
  ["M92", "2026-07-05T18:00:00-06:00"],
  ["M93", "2026-07-06T14:00:00-05:00"],
  ["M94", "2026-07-06T17:00:00-07:00"],
  ["M95", "2026-07-07T12:00:00-04:00"],
  ["M96", "2026-07-07T13:00:00-07:00"],
  ["M97", "2026-07-09T16:00:00-04:00"],
  ["M98", "2026-07-10T12:00:00-07:00"],
  ["M99", "2026-07-11T17:00:00-04:00"],
  ["M100", "2026-07-11T20:00:00-05:00"],
  ["M101", "2026-07-14T14:00:00-05:00"],
  ["M102", "2026-07-15T15:00:00-04:00"],
  ["M103", "2026-07-18T17:00:00-04:00"],
  ["M104", "2026-07-19T15:00:00-04:00"],
  ["r32-01", "2026-06-28T12:00:00-07:00"],
  ["r32-02", "2026-06-29T16:30:00-04:00"],
  ["r32-03", "2026-06-29T19:00:00-06:00"],
  ["r32-04", "2026-06-29T12:00:00-05:00"],
  ["r32-05", "2026-06-30T17:00:00-04:00"],
  ["r32-06", "2026-06-30T12:00:00-05:00"],
  ["r32-07", "2026-06-30T19:00:00-06:00"],
  ["r32-08", "2026-07-01T12:00:00-04:00"],
  ["r32-09", "2026-07-01T17:00:00-07:00"],
  ["r32-10", "2026-07-01T13:00:00-07:00"],
  ["r32-11", "2026-07-02T19:00:00-04:00"],
  ["r32-12", "2026-07-02T12:00:00-07:00"],
  ["r32-13", "2026-07-02T20:00:00-07:00"],
  ["r32-14", "2026-07-03T18:00:00-04:00"],
  ["r32-15", "2026-07-03T20:30:00-05:00"],
  ["r32-16", "2026-07-03T13:00:00-05:00"],
  ["r16-01", "2026-07-04T17:00:00-04:00"],
  ["r16-02", "2026-07-04T12:00:00-05:00"],
  ["r16-03", "2026-07-05T16:00:00-04:00"],
  ["r16-04", "2026-07-05T18:00:00-06:00"],
  ["r16-05", "2026-07-06T14:00:00-05:00"],
  ["r16-06", "2026-07-06T17:00:00-07:00"],
  ["r16-07", "2026-07-07T12:00:00-04:00"],
  ["r16-08", "2026-07-07T13:00:00-07:00"],
  ["qf-01", "2026-07-09T16:00:00-04:00"],
  ["qf-02", "2026-07-10T12:00:00-07:00"],
  ["qf-03", "2026-07-11T17:00:00-04:00"],
  ["qf-04", "2026-07-11T20:00:00-05:00"],
  ["sf-01", "2026-07-14T14:00:00-05:00"],
  ["sf-02", "2026-07-15T15:00:00-04:00"],
  ["third-01", "2026-07-18T17:00:00-04:00"],
  ["final-01", "2026-07-19T15:00:00-04:00"]
]);

export function buildFifa2026RoundOf32(input: {
  groupStandings: Map<string, Fifa2026StandingsTeam[]>;
}): Fifa2026RoundOf32Match[] {
  const normalizedStandings = normalizeStandingsByGroup(input.groupStandings);
  const fixedQualifiers = buildFixedQualifiers(normalizedStandings);
  const rankedThirdPlaceTeams = rankFifa2026ThirdPlaceTeams(normalizedStandings);

  return buildFifa2026RoundOf32FromSeeds({
    fixedQualifiers,
    rankedThirdPlaceTeams
  });
}

export function buildFifa2026RoundOf32FromSeeds(input: {
  fixedQualifiers: Map<Fifa2026SeedSource, Fifa2026QualifiedSeed>;
  rankedThirdPlaceTeams: Fifa2026QualifiedSeed[];
}): Fifa2026RoundOf32Match[] {
  const qualifiedThirdPlaceTeams = input.rankedThirdPlaceTeams.slice(0, 8);
  const qualifiedThirdGroups = qualifiedThirdPlaceTeams.map((seed) => seed.groupLetter);
  const canResolveThirdPlaceAssignments = qualifiedThirdGroups.length === 8;
  const thirdPlaceAssignment = canResolveThirdPlaceAssignments
    ? getFifa2026ThirdPlacePermutation(qualifiedThirdGroups)
    : null;
  const thirdPlaceBySource = new Map(qualifiedThirdPlaceTeams.map((seed) => [seed.source, seed]));

  return FIFA_2026_ROUND_OF_32_DEFINITIONS.map((match) => ({
    matchId: match.matchId,
    round: "roundOf32",
    sideA: resolveRoundOf32Side(match.sideA, input.fixedQualifiers, thirdPlaceBySource, thirdPlaceAssignment),
    sideB: resolveRoundOf32Side(match.sideB, input.fixedQualifiers, thirdPlaceBySource, thirdPlaceAssignment)
  }));
}

export function buildFifa2026RoundOf32StoredMatchIdLookup(
  matches: Fifa2026RoundOf32StoredMatchLike[]
) {
  const roundOf32Matches = matches
    .filter((match) => !match.stage || match.stage === "r32" || match.stage === "round_of_32")
    .sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
  const lookup = new Map<string, string>();

  for (const match of roundOf32Matches) {
    if (/^M(?:7[3-9]|8[0-8])$/.test(match.id)) {
      lookup.set(match.id, match.id);
    }
  }

  for (const [officialMatchId, legacyMatchId] of LEGACY_R32_ID_BY_OFFICIAL_MATCH_ID) {
    if (roundOf32Matches.some((match) => match.id === legacyMatchId)) {
      lookup.set(officialMatchId, legacyMatchId);
    }
  }

  for (let index = 0; index < roundOf32Matches.length; index += 1) {
    const officialMatchId = `M${73 + index}`;
    if (!lookup.has(officialMatchId)) {
      lookup.set(officialMatchId, roundOf32Matches[index].id);
    }
  }

  return lookup;
}

export function rankFifa2026ThirdPlaceTeams(
  groupStandings: Map<string, Fifa2026StandingsTeam[]>
): Fifa2026QualifiedSeed[] {
  const normalizedStandings = normalizeStandingsByGroup(groupStandings);
  const candidates: Fifa2026QualifiedSeed[] = [];

  for (const [groupLetter, rows] of normalizedStandings) {
    const thirdPlaceTeam = rows[2] ?? null;
    if (!thirdPlaceTeam) {
      continue;
    }

    candidates.push(toQualifiedSeed(groupLetter, thirdPlaceTeam, 3));
  }

  return candidates
    .sort(compareThirdPlaceSeeds)
    .map((seed, index) => ({
      ...seed,
      thirdPlaceRank: index + 1
    }));
}

export function formatBestThirdPlaceholder(groups: readonly Fifa2026GroupLetter[]) {
  return `Best 3rd from ${groups.join("/")}`;
}

export function sourceToGroupLetter(source: Fifa2026SeedSource): Fifa2026GroupLetter {
  const groupLetter = source.slice(1);
  if (!isFifa2026GroupLetter(groupLetter)) {
    throw new Error(`Invalid FIFA 2026 source ${source}.`);
  }

  return groupLetter;
}

function resolveRoundOf32Side(
  slot: Fifa2026RoundOf32Slot,
  fixedQualifiers: Map<Fifa2026SeedSource, Fifa2026QualifiedSeed>,
  thirdPlaceBySource: Map<Fifa2026SeedSource, Fifa2026QualifiedSeed>,
  thirdPlaceAssignment: Record<Fifa2026ThirdPlaceAssignmentTarget, Fifa2026SeedSource> | null
): Fifa2026RoundOf32Side {
  if (slot.kind === "fixed") {
    return toRoundOf32Side(slot.source, fixedQualifiers.get(slot.source) ?? null, []);
  }

  const assignedSource = thirdPlaceAssignment?.[slot.target] ?? null;
  if (!assignedSource) {
    return {
      source: null,
      placeholder: formatBestThirdPlaceholder(slot.candidateGroups),
      candidateGroups: [...slot.candidateGroups],
      teamId: null,
      teamName: null,
      teamShortName: null
    };
  }

  return toRoundOf32Side(assignedSource, thirdPlaceBySource.get(assignedSource) ?? null, slot.candidateGroups);
}

function toRoundOf32Side(
  source: Fifa2026SeedSource,
  seed: Fifa2026QualifiedSeed | null,
  candidateGroups: readonly Fifa2026GroupLetter[]
): Fifa2026RoundOf32Side {
  return {
    source,
    placeholder: null,
    candidateGroups: [...candidateGroups],
    teamId: seed?.teamId ?? null,
    teamName: seed?.teamName ?? null,
    teamShortName: seed?.teamShortName ?? null
  };
}

function buildFixedQualifiers(
  groupStandings: Map<Fifa2026GroupLetter, Fifa2026StandingsTeam[]>
) {
  const qualifiers = new Map<Fifa2026SeedSource, Fifa2026QualifiedSeed>();

  for (const [groupLetter, rows] of groupStandings) {
    const winner = rows[0] ?? null;
    const runnerUp = rows[1] ?? null;
    if (winner) {
      const seed = toQualifiedSeed(groupLetter, winner, 1);
      qualifiers.set(seed.source, seed);
    }
    if (runnerUp) {
      const seed = toQualifiedSeed(groupLetter, runnerUp, 2);
      qualifiers.set(seed.source, seed);
    }
  }

  return qualifiers;
}

function normalizeStandingsByGroup(
  standingsByGroup: Map<string, Fifa2026StandingsTeam[]>
) {
  const normalized = new Map<Fifa2026GroupLetter, Fifa2026StandingsTeam[]>();

  for (const [groupName, rows] of standingsByGroup) {
    const groupLetter = extractGroupLetter(groupName);
    if (!groupLetter) {
      continue;
    }

    normalized.set(groupLetter, rows);
  }

  return normalized;
}

function toQualifiedSeed(
  groupLetter: Fifa2026GroupLetter,
  team: Fifa2026StandingsTeam,
  finish: 1 | 2 | 3
): Fifa2026QualifiedSeed {
  return {
    ...team,
    groupLetter,
    finish,
    source: `${finish}${groupLetter}` as Fifa2026SeedSource
  };
}

function compareThirdPlaceSeeds(left: Fifa2026QualifiedSeed, right: Fifa2026QualifiedSeed) {
  if (right.points !== left.points) {
    return right.points - left.points;
  }

  if (right.goalDifference !== left.goalDifference) {
    return right.goalDifference - left.goalDifference;
  }

  if (right.goalsFor !== left.goalsFor) {
    return right.goalsFor - left.goalsFor;
  }

  if (left.teamConductScore !== null && left.teamConductScore !== undefined && right.teamConductScore !== null && right.teamConductScore !== undefined) {
    return right.teamConductScore - left.teamConductScore;
  }

  if (left.fifaRanking !== null && left.fifaRanking !== undefined && right.fifaRanking !== null && right.fifaRanking !== undefined) {
    return left.fifaRanking - right.fifaRanking;
  }

  return compareGroupLetters(left.groupLetter, right.groupLetter) || left.teamId.localeCompare(right.teamId);
}

function extractGroupLetter(groupName: string): Fifa2026GroupLetter | null {
  const match = groupName.trim().match(/(?:^Group\s+|^)([A-L])$/i);
  const groupLetter = match?.[1]?.toUpperCase() ?? null;
  return groupLetter && isFifa2026GroupLetter(groupLetter) ? groupLetter : null;
}

function fixed(source: Fifa2026SeedSource): Fifa2026RoundOf32Slot {
  return { kind: "fixed", source };
}

function third(target: Fifa2026ThirdPlaceAssignmentTarget): Fifa2026RoundOf32Slot {
  return {
    kind: "third-place-assignment",
    target,
    candidateGroups: [...FIFA_2026_THIRD_PLACE_PLACEHOLDERS[target]]
  };
}

export function validateFifa2026RoundOf32Definitions() {
  const targetSet = new Set(FIFA_2026_THIRD_PLACE_ASSIGNMENT_TARGETS);
  for (const match of FIFA_2026_ROUND_OF_32_DEFINITIONS) {
    for (const side of [match.sideA, match.sideB]) {
      if (side.kind === "third-place-assignment" && !targetSet.has(side.target)) {
        throw new Error(`Invalid third-place target ${side.target} for ${match.matchId}.`);
      }
    }
  }
}
