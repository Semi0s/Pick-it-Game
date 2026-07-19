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

type Fifa2026CanonicalKnockoutSourceDefinition = {
  homeSource: string | null;
  awaySource: string | null;
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

const LEGACY_KNOCKOUT_ID_BY_OFFICIAL_MATCH_ID = new Map<string, string>([
  ...LEGACY_R32_ID_BY_OFFICIAL_MATCH_ID,
  ["M89", "r16-01"],
  ["M90", "r16-02"],
  ["M91", "r16-03"],
  ["M92", "r16-04"],
  ["M93", "r16-05"],
  ["M94", "r16-06"],
  ["M95", "r16-07"],
  ["M96", "r16-08"],
  ["M97", "qf-01"],
  ["M98", "qf-02"],
  ["M99", "qf-03"],
  ["M100", "qf-04"],
  ["M101", "sf-01"],
  ["M102", "sf-02"],
  ["M103", "third-01"],
  ["M104", "final-01"]
]);

const OFFICIAL_KNOCKOUT_ID_BY_LEGACY_MATCH_ID = new Map(
  Array.from(LEGACY_KNOCKOUT_ID_BY_OFFICIAL_MATCH_ID.entries()).map(([officialId, legacyId]) => [legacyId, officialId] as const)
);

const FIFA_2026_CANONICAL_KNOCKOUT_SOURCES = new Map<string, Fifa2026CanonicalKnockoutSourceDefinition>([
  ["M89", { homeSource: "Winner of M74", awaySource: "Winner of M77" }],
  ["M90", { homeSource: "Winner of M73", awaySource: "Winner of M75" }],
  ["M91", { homeSource: "Winner of M76", awaySource: "Winner of M78" }],
  ["M92", { homeSource: "Winner of M79", awaySource: "Winner of M80" }],
  ["M93", { homeSource: "Winner of M83", awaySource: "Winner of M84" }],
  ["M94", { homeSource: "Winner of M81", awaySource: "Winner of M82" }],
  ["M95", { homeSource: "Winner of M86", awaySource: "Winner of M88" }],
  ["M96", { homeSource: "Winner of M85", awaySource: "Winner of M87" }],
  ["M97", { homeSource: "Winner of M89", awaySource: "Winner of M90" }],
  ["M98", { homeSource: "Winner of M93", awaySource: "Winner of M94" }],
  ["M99", { homeSource: "Winner of M91", awaySource: "Winner of M92" }],
  ["M100", { homeSource: "Winner of M95", awaySource: "Winner of M96" }],
  ["M101", { homeSource: "Winner of M97", awaySource: "Winner of M98" }],
  ["M102", { homeSource: "Winner of M99", awaySource: "Winner of M100" }],
  ["M103", { homeSource: "Loser of M101", awaySource: "Loser of M102" }],
  ["M104", { homeSource: "Winner of M101", awaySource: "Winner of M102" }]
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

export const FIFA_2026_KNOCKOUT_STORED_MATCH_IDS = Array.from(
  FIFA_2026_OFFICIAL_KNOCKOUT_KICKOFF_BY_STORED_MATCH_ID.keys()
);

type KnockoutStoredRowLike = {
  id: string;
  status?: string | null;
  stage?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  next_match_id?: string | null;
  next_match_slot?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
  kickoff_at?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
};

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

export function normalizeFifa2026KnockoutStoredMatchId(matchId: string | null | undefined) {
  const trimmed = (matchId ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\s+/g, "").replace(/_/g, "-");
  const legacyKey = normalized.toLowerCase();
  const mappedLegacyId = OFFICIAL_KNOCKOUT_ID_BY_LEGACY_MATCH_ID.get(legacyKey);
  if (mappedLegacyId) {
    return mappedLegacyId;
  }

  const officialMatchId = normalized.toUpperCase().match(/^M-?(\d+)$/);
  if (officialMatchId) {
    return `M${officialMatchId[1]}`;
  }

  return normalized;
}

function inferFifa2026KnockoutStageFromCanonicalId(matchId: string | null | undefined) {
  const normalized = normalizeFifa2026KnockoutStoredMatchId(matchId);
  if (!normalized) {
    return null;
  }

  if (/^M(7[3-9]|8[0-8])$/.test(normalized)) {
    return "r32" as const;
  }

  if (/^M(89|9[0-6])$/.test(normalized)) {
    return "r16" as const;
  }

  if (/^M(97|98|99|100)$/.test(normalized)) {
    return "qf" as const;
  }

  if (/^M10[12]$/.test(normalized)) {
    return "sf" as const;
  }

  if (normalized === "M103") {
    return "third" as const;
  }

  if (normalized === "M104") {
    return "final" as const;
  }

  return null;
}

function normalizeFifa2026KnockoutSourceLabel(sourceLabel: string | null | undefined) {
  const normalized = (sourceLabel ?? "").trim();
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(Winner|Loser)\s+of\s+(.+)$/i);
  if (!match) {
    return normalized;
  }

  const outcome = match[1]?.toLowerCase() === "loser" ? "Loser" : "Winner";
  const canonicalMatchId = normalizeFifa2026KnockoutStoredMatchId(match[2] ?? "");
  if (!canonicalMatchId) {
    return `${outcome} of ${(match[2] ?? "").trim()}`;
  }

  return `${outcome} of ${canonicalMatchId}`;
}

function buildFifa2026CanonicalSourcePairLookup() {
  const lookup = new Map<string, string>();

  for (const [matchId, sources] of FIFA_2026_CANONICAL_KNOCKOUT_SOURCES.entries()) {
    const homeSource = normalizeFifa2026KnockoutSourceLabel(sources.homeSource);
    const awaySource = normalizeFifa2026KnockoutSourceLabel(sources.awaySource);
    if (!homeSource || !awaySource) {
      continue;
    }

    lookup.set(`${homeSource}__${awaySource}`, matchId);
  }

  return lookup;
}

const FIFA_2026_CANONICAL_MATCH_ID_BY_SOURCE_PAIR = buildFifa2026CanonicalSourcePairLookup();

export function inferFifa2026CanonicalKnockoutMatchIdFromRow(row: Pick<KnockoutStoredRowLike, "id" | "home_source" | "away_source">) {
  const normalizedId = normalizeFifa2026KnockoutStoredMatchId(row.id);
  if (inferFifa2026KnockoutStageFromCanonicalId(normalizedId)) {
    return normalizedId;
  }

  const normalizedHomeSource = normalizeFifa2026KnockoutSourceLabel(row.home_source);
  const normalizedAwaySource = normalizeFifa2026KnockoutSourceLabel(row.away_source);
  if (!normalizedHomeSource || !normalizedAwaySource) {
    return normalizedId;
  }

  return FIFA_2026_CANONICAL_MATCH_ID_BY_SOURCE_PAIR.get(
    `${normalizedHomeSource}__${normalizedAwaySource}`
  ) ?? normalizedId;
}

function hydrateFifa2026KnockoutAliasRow<T extends KnockoutStoredRowLike>(row: T): T {
  const canonicalId = inferFifa2026CanonicalKnockoutMatchIdFromRow(row);
  const canonicalStage = inferFifa2026KnockoutStageFromCanonicalId(canonicalId);
  const canonicalSources = canonicalId ? getFifa2026CanonicalKnockoutSources(canonicalId) : null;
  const canonicalKickoff =
    canonicalId ? FIFA_2026_OFFICIAL_KNOCKOUT_KICKOFF_BY_STORED_MATCH_ID.get(canonicalId) ?? null : null;

  const nextRow = { ...row } as T;

  if (canonicalStage && nextRow.stage !== canonicalStage) {
    nextRow.stage = canonicalStage;
  }

  if (canonicalSources?.homeSource && nextRow.home_source !== canonicalSources.homeSource) {
    nextRow.home_source = canonicalSources.homeSource;
  }

  if (canonicalSources?.awaySource && nextRow.away_source !== canonicalSources.awaySource) {
    nextRow.away_source = canonicalSources.awaySource;
  }

  if (!nextRow.kickoff_time && canonicalKickoff) {
    nextRow.kickoff_time = canonicalKickoff;
  }

  if ("kickoff_at" in nextRow && !nextRow.kickoff_at && canonicalKickoff) {
    nextRow.kickoff_at = canonicalKickoff;
  }

  return nextRow;
}

export function expandFifa2026KnockoutStoredMatchIds(matchId: string | null | undefined) {
  const normalized = normalizeFifa2026KnockoutStoredMatchId(matchId);
  if (!normalized) {
    return [];
  }

  const legacyId = LEGACY_KNOCKOUT_ID_BY_OFFICIAL_MATCH_ID.get(normalized) ?? null;
  return legacyId ? [normalized, legacyId] : [normalized];
}

export function getFifa2026CanonicalKnockoutSources(matchId: string | null | undefined) {
  const normalized = normalizeFifa2026KnockoutStoredMatchId(matchId);
  if (!normalized) {
    return null;
  }

  return FIFA_2026_CANONICAL_KNOCKOUT_SOURCES.get(normalized) ?? null;
}

export function scoreFifa2026KnockoutStoredRowCompleteness(row: KnockoutStoredRowLike) {
  let score = 0;

  if (row.home_team_id) score += 8;
  if (row.away_team_id) score += 8;
  if (typeof row.home_score === "number") score += 4;
  if (typeof row.away_score === "number") score += 4;
  if (row.winner_team_id) score += 6;
  if (row.home_source) score += 1;
  if (row.away_source) score += 1;
  if (row.next_match_id) score += 2;
  if (row.next_match_slot) score += 1;

  switch (row.status) {
    case "final":
      score += 3;
      break;
    case "live":
      score += 2;
      break;
    case "locked":
      score += 1;
      break;
    default:
      break;
  }

  return score;
}

export function collapseFifa2026KnockoutAliasRows<T extends KnockoutStoredRowLike>(rows: T[]) {
  const preferredByCanonicalId = new Map<string, T>();

  for (const row of rows) {
    const canonicalId = inferFifa2026CanonicalKnockoutMatchIdFromRow(row) ?? row.id;
    const existing = preferredByCanonicalId.get(canonicalId) ?? null;

    if (!existing) {
      preferredByCanonicalId.set(canonicalId, row);
      continue;
    }

    const rowScore = scoreFifa2026KnockoutStoredRowCompleteness(row);
    const existingScore = scoreFifa2026KnockoutStoredRowCompleteness(existing);
    if (rowScore > existingScore) {
      preferredByCanonicalId.set(canonicalId, row);
      continue;
    }
    if (rowScore < existingScore) {
      continue;
    }

    const rowUpdatedAt = getKnockoutStoredRowUpdatedAtTime(row);
    const existingUpdatedAt = getKnockoutStoredRowUpdatedAtTime(existing);
    if (rowUpdatedAt > existingUpdatedAt) {
      preferredByCanonicalId.set(canonicalId, row);
    }
  }

  return Array.from(preferredByCanonicalId.values()).map((row) => hydrateFifa2026KnockoutAliasRow(row));
}

function getKnockoutStoredRowUpdatedAtTime(row: KnockoutStoredRowLike) {
  const updatedAt = row.updated_at ?? row.updatedAt ?? null;
  if (!updatedAt) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = new Date(updatedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
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
