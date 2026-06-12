import type { Team } from "@/lib/types";

export const SIDE_PICK_PACKAGE_KEY = "world_cup_2026_side_picks_v1";
export const SIDE_PICK_DEFAULT_GROUP_NAME = "FIFA 2026 Predictions";
export const SIDE_PICK_PUBLIC_NAME = "Side Picks";
export const LAST_CHANCE_FALLBACK_LOCK_AT = "2026-06-24T18:45:00.000Z";
export const LAST_CHANCE_LOCK_BUFFER_MINUTES = 15;

export const SIDE_PICK_DEFINITION_KEYS = [
  "champion",
  "runner_up",
  "semifinalists",
  "dark_horse",
  "favorite_flop",
  "highest_scoring_team",
  "golden_boot",
  "golden_ball"
] as const;

export type SidePickDefinitionKey = (typeof SIDE_PICK_DEFINITION_KEYS)[number];
export type SidePickPlayerDefinitionKey = Extract<SidePickDefinitionKey, "golden_boot" | "golden_ball">;
export type SidePickConsensusPlayer = {
  id: string;
  fullName: string;
  teamName?: string | null;
};
export type SidePickOfficialPlayerSuggestion = {
  key: SidePickPlayerDefinitionKey;
  playerId: string;
  playerLabel: string;
  pickCount: number;
  totalPicks: number;
};

export type SidePicksSubmission = {
  championTeamId: string | null;
  runnerUpTeamId: string | null;
  semifinalistTeamIds: string[];
  darkHorseTeamId: string | null;
  favoriteFlopTeamId: string | null;
  highestScoringTeamId: string | null;
  goldenBootPlayerId: string | null;
  goldenBallPlayerId: string | null;
};

export type SidePickScoringMatch = {
  id?: string;
  stage: string;
  status: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  winnerTeamId?: string | null;
};

export type SidePickScheduleMatch = {
  id?: string;
  stage: string;
  groupName?: string | null;
  kickoffTime?: string | null;
  kickoffAt?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
};

export type TournamentFinishStage =
  | "unknown"
  | "group_stage"
  | "round_of_32"
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "runner_up"
  | "champion";

export type SidePickScoreResult = {
  key: SidePickDefinitionKey;
  points: number;
  note: string;
};

export const SIDE_PICK_SCORING_COPY: Record<SidePickDefinitionKey, string> = {
  champion: "18 points.",
  runner_up: "12 points.",
  semifinalists: "6 points per correct team, any order.",
  dark_horse: "R16 2, QF 5, SF 9, Final 12, Champion 14.",
  favorite_flop: "Group Stage 10, Round of 32 7, Round of 16 4, Quarterfinals or later 0.",
  highest_scoring_team: "8 points. Ties count.",
  golden_boot: "10 points.",
  golden_ball: "10 points."
};

export const DEFAULT_SIDE_PICK_POINT_VALUES: Record<SidePickDefinitionKey, number> = {
  champion: 18,
  runner_up: 12,
  semifinalists: 6,
  dark_horse: 14,
  favorite_flop: 10,
  highest_scoring_team: 8,
  golden_boot: 10,
  golden_ball: 10
};

export function getDefaultDarkHorseEligibleTeamIds(teams: Team[], favoriteCount = 12) {
  return [...teams]
    .sort(compareTeamsByRank)
    .slice(favoriteCount)
    .map((team) => team.id);
}

export function getDefaultFavoriteFlopEligibleTeamIds(teams: Team[], favoriteCount = 12) {
  return [...teams]
    .sort(compareTeamsByRank)
    .slice(0, favoriteCount)
    .map((team) => team.id);
}

export function normalizeSidePicksSubmission(input: Partial<SidePicksSubmission>): SidePicksSubmission {
  return {
    championTeamId: normalizeNullableTeamId(input.championTeamId),
    runnerUpTeamId: normalizeNullableTeamId(input.runnerUpTeamId),
    semifinalistTeamIds: uniqueTeamIds(input.semifinalistTeamIds ?? []).slice(0, 4),
    darkHorseTeamId: normalizeNullableTeamId(input.darkHorseTeamId),
    favoriteFlopTeamId: normalizeNullableTeamId(input.favoriteFlopTeamId),
    highestScoringTeamId: normalizeNullableTeamId(input.highestScoringTeamId),
    goldenBootPlayerId: normalizeNullableId(input.goldenBootPlayerId),
    goldenBallPlayerId: normalizeNullableId(input.goldenBallPlayerId)
  };
}

export function deriveConsensusPlayerAwardSuggestions(input: {
  entries: Array<{
    key: SidePickPlayerDefinitionKey;
    selectedPlayerId: string | null;
  }>;
  players: SidePickConsensusPlayer[];
}): Partial<Record<SidePickPlayerDefinitionKey, SidePickOfficialPlayerSuggestion>> {
  const playersById = new Map(
    input.players.map((player) => [
      player.id,
      player.teamName ? `${player.fullName} — ${player.teamName}` : player.fullName
    ])
  );
  const suggestions: Partial<Record<SidePickPlayerDefinitionKey, SidePickOfficialPlayerSuggestion>> = {};

  for (const key of ["golden_boot", "golden_ball"] as const) {
    const votes = input.entries.filter((entry) => entry.key === key && entry.selectedPlayerId);
    if (votes.length === 0) {
      continue;
    }

    const counts = new Map<string, number>();
    for (const vote of votes) {
      const playerId = vote.selectedPlayerId;
      if (!playerId) {
        continue;
      }

      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
    }

    const ranked = Array.from(counts.entries()).sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    });
    const winner = ranked[0];
    const runnerUp = ranked[1];
    if (!winner) {
      continue;
    }

    if (runnerUp && runnerUp[1] === winner[1]) {
      continue;
    }

    const playerLabel = playersById.get(winner[0]);
    if (!playerLabel) {
      continue;
    }

    suggestions[key] = {
      key,
      playerId: winner[0],
      playerLabel,
      pickCount: winner[1],
      totalPicks: votes.length
    };
  }

  return suggestions;
}

export function parseSemifinalistPickValue(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? uniqueTeamIds(parsed.filter((teamId): teamId is string => typeof teamId === "string")) : [];
  } catch {
    return [];
  }
}

export function serializeSemifinalistPickValue(teamIds: string[]) {
  return JSON.stringify(uniqueTeamIds(teamIds).slice(0, 4));
}

export function isSidePicksLocked(lockAt: string | null | undefined, now = new Date()) {
  if (!lockAt) {
    return false;
  }

  const lockDate = new Date(lockAt);
  return Number.isFinite(lockDate.getTime()) && now.getTime() >= lockDate.getTime();
}

export function getSidePicksCompletionCount(picks: Partial<SidePicksSubmission>) {
  const normalized = normalizeSidePicksSubmission(picks);
  return [
    normalized.championTeamId,
    normalized.runnerUpTeamId,
    normalized.semifinalistTeamIds.length >= 4 ? "semifinalists" : null,
    normalized.darkHorseTeamId,
    normalized.favoriteFlopTeamId,
    normalized.highestScoringTeamId,
    normalized.goldenBootPlayerId,
    normalized.goldenBallPlayerId
  ].filter(Boolean).length;
}

export function formatLastChanceDeadlineLabel(lockAt: string | null | undefined) {
  const lockDate = new Date(lockAt ?? LAST_CHANCE_FALLBACK_LOCK_AT);
  if (!Number.isFinite(lockDate.getTime())) {
    return formatLastChanceDeadlineLabel(LAST_CHANCE_FALLBACK_LOCK_AT);
  }

  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York"
  }).format(lockDate);

  return `Closes ${formatted}`;
}

export function resolveLastChanceDefaultLockAt(matches: SidePickScheduleMatch[] = []) {
  return deriveLastChanceLockAtFromSchedule(matches) ?? LAST_CHANCE_FALLBACK_LOCK_AT;
}

export function deriveLastChanceLockAtFromSchedule(
  matches: SidePickScheduleMatch[],
  options: { bufferMinutes?: number } = {}
) {
  const bufferMs = Math.max(0, options.bufferMinutes ?? LAST_CHANCE_LOCK_BUFFER_MINUTES) * 60 * 1000;
  const groupMatches = matches
    .filter((match) => isGroupStageScheduleMatch(match))
    .map((match) => {
      const kickoff = getScheduleKickoffMs(match);
      return Number.isFinite(kickoff) ? { ...match, kickoff } : null;
    })
    .filter((match): match is SidePickScheduleMatch & { kickoff: number } => Boolean(match))
    .sort((left, right) => left.kickoff - right.kickoff || String(left.id ?? "").localeCompare(String(right.id ?? "")));

  const matchesByTeamId = new Map<string, Array<SidePickScheduleMatch & { kickoff: number }>>();
  for (const match of groupMatches) {
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (!teamId) {
        continue;
      }

      const current = matchesByTeamId.get(teamId) ?? [];
      current.push(match);
      matchesByTeamId.set(teamId, current);
    }
  }

  const thirdMatchKickoffs = Array.from(matchesByTeamId.values())
    .map((teamMatches) => [...teamMatches].sort((left, right) => left.kickoff - right.kickoff)[2]?.kickoff ?? null)
    .filter((kickoff): kickoff is number => Number.isFinite(kickoff));

  if (thirdMatchKickoffs.length === 0) {
    return null;
  }

  const firstThirdMatchKickoff = Math.min(...thirdMatchKickoffs);
  return new Date(firstThirdMatchKickoff - bufferMs).toISOString();
}

export function scoreSidePicks(input: {
  picks: SidePicksSubmission;
  matches: SidePickScoringMatch[];
  officialPlayerResults?: Partial<Record<SidePickPlayerDefinitionKey, string | null>>;
  pointValues?: Partial<Record<SidePickDefinitionKey, number>>;
}): SidePickScoreResult[] {
  const picks = normalizeSidePicksSubmission(input.picks);
  const pointValues = input.pointValues ?? {};
  const finalMatch = findFinalMatch(input.matches);
  const finishByTeamId = deriveTeamFinishStages(input.matches);
  const actualSemifinalists = new Set(getActualSemifinalistTeamIds(input.matches));
  const highestScoringTeamIds = getHighestScoringTeamIds(input.matches);
  const officialGoldenBootPlayerId = normalizeNullableId(input.officialPlayerResults?.golden_boot);
  const officialGoldenBallPlayerId = normalizeNullableId(input.officialPlayerResults?.golden_ball);

  const championPoints = finalMatch?.winnerTeamId && picks.championTeamId === finalMatch.winnerTeamId ? getPointValue(pointValues, "champion") : 0;
  const runnerUpTeamId = finalMatch ? getFinalRunnerUpTeamId(finalMatch) : null;
  const runnerUpPoints = runnerUpTeamId && picks.runnerUpTeamId === runnerUpTeamId ? getPointValue(pointValues, "runner_up") : 0;
  const topFourCorrectCount = picks.semifinalistTeamIds.filter((teamId) => actualSemifinalists.has(teamId)).length;
  const darkHorseFinish = picks.darkHorseTeamId ? finishByTeamId.get(picks.darkHorseTeamId) ?? "unknown" : "unknown";
  const favoriteFlopFinish = picks.favoriteFlopTeamId ? finishByTeamId.get(picks.favoriteFlopTeamId) ?? "unknown" : "unknown";
  const highestScoringPoints =
    picks.highestScoringTeamId && highestScoringTeamIds.includes(picks.highestScoringTeamId) ? getPointValue(pointValues, "highest_scoring_team") : 0;
  const goldenBootPoints =
    officialGoldenBootPlayerId && picks.goldenBootPlayerId === officialGoldenBootPlayerId ? getPointValue(pointValues, "golden_boot") : 0;
  const goldenBallPoints =
    officialGoldenBallPlayerId && picks.goldenBallPlayerId === officialGoldenBallPlayerId ? getPointValue(pointValues, "golden_ball") : 0;

  return [
    {
      key: "champion",
      points: championPoints,
      note: championPoints > 0 ? "Champion matched official winner." : "Champion pending or did not match."
    },
    {
      key: "runner_up",
      points: runnerUpPoints,
      note: runnerUpPoints > 0 ? "Runner-up matched official finalist." : "Runner-up pending or did not match."
    },
    {
      key: "semifinalists",
      points: topFourCorrectCount * getPointValue(pointValues, "semifinalists"),
      note: `${topFourCorrectCount} of 4 semifinalists matched. Any order counts.`
    },
    {
      key: "dark_horse",
      points: scoreDarkHorseFinish(darkHorseFinish, getPointValue(pointValues, "dark_horse")),
      note: `Dark Horse finish: ${formatFinishStage(darkHorseFinish)}.`
    },
    {
      key: "favorite_flop",
      points: scoreFavoriteFlopFinish(favoriteFlopFinish, getPointValue(pointValues, "favorite_flop")),
      note: `Favorite Flop finish: ${formatFinishStage(favoriteFlopFinish)}.`
    },
    {
      key: "highest_scoring_team",
      points: highestScoringPoints,
      note:
        highestScoringPoints > 0
          ? "Picked team finished tied or alone as highest-scoring team."
          : "Highest-scoring team pending or did not match."
    },
    {
      key: "golden_boot",
      points: goldenBootPoints,
      note:
        officialGoldenBootPlayerId
          ? goldenBootPoints > 0
            ? "Golden Boot matched the official winner."
            : "Golden Boot did not match the official winner."
          : "Golden Boot official result is not confirmed yet."
    },
    {
      key: "golden_ball",
      points: goldenBallPoints,
      note:
        officialGoldenBallPlayerId
          ? goldenBallPoints > 0
            ? "MVP / Golden Ball matched the official winner."
            : "MVP / Golden Ball did not match the official winner."
          : "MVP / Golden Ball official result is not confirmed yet."
    }
  ];
}

export function deriveTeamFinishStages(matches: SidePickScoringMatch[]): Map<string, TournamentFinishStage> {
  const finishByTeamId = new Map<string, TournamentFinishStage>();
  const seenTeamIds = new Set<string>();

  for (const match of matches) {
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      if (teamId) {
        seenTeamIds.add(teamId);
        const stage = finishStageFromMatch(match, teamId);
        const current = finishByTeamId.get(teamId) ?? "group_stage";
        if (compareFinishStage(stage, current) > 0) {
          finishByTeamId.set(teamId, stage);
        }
      }
    }
  }

  for (const teamId of seenTeamIds) {
    if (!finishByTeamId.has(teamId)) {
      finishByTeamId.set(teamId, "group_stage");
    }
  }

  return finishByTeamId;
}

export function getHighestScoringTeamIds(matches: SidePickScoringMatch[]) {
  const goalsByTeamId = new Map<string, number>();

  for (const match of matches) {
    if (match.status !== "final") {
      continue;
    }

    if (match.homeTeamId && Number.isFinite(match.homeScore)) {
      goalsByTeamId.set(match.homeTeamId, (goalsByTeamId.get(match.homeTeamId) ?? 0) + Number(match.homeScore));
    }

    if (match.awayTeamId && Number.isFinite(match.awayScore)) {
      goalsByTeamId.set(match.awayTeamId, (goalsByTeamId.get(match.awayTeamId) ?? 0) + Number(match.awayScore));
    }
  }

  const maxGoals = Math.max(0, ...goalsByTeamId.values());
  if (maxGoals <= 0) {
    return [];
  }

  return Array.from(goalsByTeamId.entries())
    .filter(([, goals]) => goals === maxGoals)
    .map(([teamId]) => teamId);
}

export function scoreDarkHorseFinish(finish: TournamentFinishStage, maxPoints = DEFAULT_SIDE_PICK_POINT_VALUES.dark_horse) {
  switch (finish) {
    case "champion":
      return maxPoints;
    case "runner_up":
      return Math.min(12, maxPoints);
    case "semifinal":
      return Math.min(9, maxPoints);
    case "quarterfinal":
      return Math.min(5, maxPoints);
    case "round_of_16":
      return Math.min(2, maxPoints);
    default:
      return 0;
  }
}

export function scoreFavoriteFlopFinish(finish: TournamentFinishStage, maxPoints = DEFAULT_SIDE_PICK_POINT_VALUES.favorite_flop) {
  switch (finish) {
    case "group_stage":
      return maxPoints;
    case "round_of_32":
      return Math.min(7, maxPoints);
    case "round_of_16":
      return Math.min(4, maxPoints);
    default:
      return 0;
  }
}

function getActualSemifinalistTeamIds(matches: SidePickScoringMatch[]) {
  return uniqueTeamIds(
    matches
      .filter((match) => normalizeStage(match.stage) === "semifinal")
      .flatMap((match) => [match.homeTeamId, match.awayTeamId])
      .filter((teamId): teamId is string => Boolean(teamId))
  );
}

function findFinalMatch(matches: SidePickScoringMatch[]) {
  return matches.find((match) => normalizeStage(match.stage) === "final" && match.status === "final" && match.winnerTeamId) ?? null;
}

function getFinalRunnerUpTeamId(match: SidePickScoringMatch) {
  if (!match.winnerTeamId) {
    return null;
  }

  if (match.homeTeamId === match.winnerTeamId) {
    return match.awayTeamId ?? null;
  }

  if (match.awayTeamId === match.winnerTeamId) {
    return match.homeTeamId ?? null;
  }

  return null;
}

function finishStageFromMatch(match: SidePickScoringMatch, teamId: string): TournamentFinishStage {
  const normalizedStage = normalizeStage(match.stage);
  if (normalizedStage === "final" && match.status === "final") {
    return match.winnerTeamId === teamId ? "champion" : "runner_up";
  }

  if (normalizedStage === "semifinal") {
    return "semifinal";
  }

  if (normalizedStage === "quarterfinal") {
    return "quarterfinal";
  }

  if (normalizedStage === "round_of_16") {
    return "round_of_16";
  }

  if (normalizedStage === "round_of_32") {
    return "round_of_32";
  }

  return "group_stage";
}

function normalizeStage(stage: string) {
  if (stage === "group") {
    return "group_stage";
  }

  if (stage === "r32") {
    return "round_of_32";
  }

  if (stage === "r16") {
    return "round_of_16";
  }

  if (stage === "qf") {
    return "quarterfinal";
  }

  if (stage === "sf") {
    return "semifinal";
  }

  return stage;
}

function compareFinishStage(left: TournamentFinishStage, right: TournamentFinishStage) {
  return finishStageWeight(left) - finishStageWeight(right);
}

function finishStageWeight(stage: TournamentFinishStage) {
  switch (stage) {
    case "champion":
      return 7;
    case "runner_up":
      return 6;
    case "semifinal":
      return 5;
    case "quarterfinal":
      return 4;
    case "round_of_16":
      return 3;
    case "round_of_32":
      return 2;
    case "group_stage":
      return 1;
    default:
      return 0;
  }
}

function formatFinishStage(stage: TournamentFinishStage) {
  switch (stage) {
    case "champion":
      return "Champion";
    case "runner_up":
      return "Final";
    case "semifinal":
      return "Semifinal";
    case "quarterfinal":
      return "Quarterfinal";
    case "round_of_16":
      return "Round of 16";
    case "round_of_32":
      return "Round of 32";
    case "group_stage":
      return "Group Stage";
    default:
      return "Pending";
  }
}

function compareTeamsByRank(left: Team, right: Team) {
  return (left.fifaRank || Number.MAX_SAFE_INTEGER) - (right.fifaRank || Number.MAX_SAFE_INTEGER);
}

function normalizeNullableTeamId(teamId: string | null | undefined) {
  const trimmed = teamId?.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableId(id: string | null | undefined) {
  const trimmed = id?.trim();
  return trimmed ? trimmed : null;
}

function getPointValue(pointValues: Partial<Record<SidePickDefinitionKey, number>>, key: SidePickDefinitionKey) {
  const configuredValue = pointValues[key];
  return Number.isFinite(configuredValue) ? Math.max(0, Number(configuredValue)) : DEFAULT_SIDE_PICK_POINT_VALUES[key];
}

function isGroupStageScheduleMatch(match: SidePickScheduleMatch) {
  return normalizeStage(match.stage) === "group_stage" && Boolean(match.groupName || match.homeTeamId || match.awayTeamId);
}

function getScheduleKickoffMs(match: SidePickScheduleMatch) {
  const value = match.kickoffAt ?? match.kickoffTime;
  if (!value) {
    return Number.NaN;
  }

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function uniqueTeamIds(teamIds: string[]) {
  return Array.from(new Set(teamIds.map((teamId) => teamId.trim()).filter(Boolean)));
}
