import { getGroupMatches } from "./mock-data.ts";

export type PredictionStartMode = "easy_bracket" | "full_scoring" | "strategy_mode" | "groups";
export type TournamentEntryMode = "easy_bracket" | "strategy_mode";
export type TournamentEntryState = "draft" | "active" | "locked" | "inactive" | "archived";
export type GroupBaseMode = "my_picks" | "easy_bracket" | "strategy_mode";
export type StrategyPresetKey = "balanced" | "trust_favorites" | "expect_chaos" | "heart_head" | "fade_the_crowd";
export type StrategyLeverKey =
  | "favoriteTrust"
  | "pathSensitivity"
  | "chaos"
  | "heartFactor"
  | "contrarianEdge";

export type StrategyLeverState = Record<StrategyLeverKey, number>;

const DEFAULT_STRATEGY_LEVERS: StrategyLeverState = {
  favoriteTrust: 2,
  pathSensitivity: 2,
  chaos: 2,
  heartFactor: 2,
  contrarianEdge: 2
};

function deriveGroupPhaseStartAt() {
  const firstGroupMatch = getGroupMatches()
    .filter((match) => match.stage === "group")
    .sort((left, right) => new Date(left.kickoffTime).getTime() - new Date(right.kickoffTime).getTime())[0];

  return firstGroupMatch?.kickoffTime ?? "2026-06-11T00:00:00.000Z";
}

export const GROUP_PHASE_START_AT = process.env.NEXT_PUBLIC_GROUP_PHASE_START_AT ?? deriveGroupPhaseStartAt();
export const GROUP_STAGE_MATCH_COUNT = getGroupMatches().filter((match) => match.stage === "group").length || 72;
export const STRATEGY_TOTAL_BELIEF_POINTS = 10;

export const STRATEGY_PRESETS: Array<{
  key: StrategyPresetKey;
  title: string;
  description: string;
  levers: StrategyLeverState;
}> = [
  {
    key: "balanced",
    title: "Balanced",
    description: "A little of everything.",
    levers: { favoriteTrust: 2, pathSensitivity: 2, chaos: 2, heartFactor: 2, contrarianEdge: 2 }
  },
  {
    key: "trust_favorites",
    title: "Trust Favorites",
    description: "Top teams are likely to go deep.",
    levers: { favoriteTrust: 4, pathSensitivity: 3, chaos: 0, heartFactor: 1, contrarianEdge: 2 }
  },
  {
    key: "expect_chaos",
    title: "Expect Chaos",
    description: "Upsets are coming.",
    levers: { favoriteTrust: 0, pathSensitivity: 1, chaos: 5, heartFactor: 1, contrarianEdge: 3 }
  },
  {
    key: "heart_head",
    title: "Heart + Head",
    description: "Back your home team without ignoring the odds.",
    levers: { favoriteTrust: 2, pathSensitivity: 2, chaos: 1, heartFactor: 4, contrarianEdge: 1 }
  },
  {
    key: "fade_the_crowd",
    title: "Fade the Crowd",
    description: "Look for outcomes others are underrating.",
    levers: { favoriteTrust: 1, pathSensitivity: 1, chaos: 2, heartFactor: 1, contrarianEdge: 5 }
  }
];

export function getDefaultStrategyPreset() {
  return STRATEGY_PRESETS[0];
}

export function normalizePredictionStartMode(value?: string | null): PredictionStartMode | null {
  return value === "easy_bracket" || value === "full_scoring" || value === "strategy_mode" || value === "groups"
    ? value
    : null;
}

export function normalizeTournamentEntryMode(value?: string | null): TournamentEntryMode | null {
  return value === "easy_bracket" || value === "strategy_mode" ? value : null;
}

export function normalizeTournamentEntryState(value?: string | null): TournamentEntryState | null {
  return value === "draft" ||
    value === "active" ||
    value === "locked" ||
    value === "inactive" ||
    value === "archived"
    ? value
    : null;
}

export function normalizeGroupBaseMode(value?: string | null): GroupBaseMode {
  return value === "easy_bracket" || value === "strategy_mode" || value === "my_picks" ? value : "my_picks";
}

export function normalizeStrategyPresetKey(value?: string | null): StrategyPresetKey {
  return STRATEGY_PRESETS.some((preset) => preset.key === value) ? (value as StrategyPresetKey) : getDefaultStrategyPreset().key;
}

export function normalizeStrategyLevers(value?: unknown): StrategyLeverState {
  if (!value || typeof value !== "object") {
    return DEFAULT_STRATEGY_LEVERS;
  }

  const candidate = value as Record<string, unknown>;
  const nextState: StrategyLeverState = { ...DEFAULT_STRATEGY_LEVERS };
  for (const key of Object.keys(DEFAULT_STRATEGY_LEVERS) as StrategyLeverKey[]) {
    const nextValue = candidate[key];
    if (typeof nextValue === "number" && Number.isFinite(nextValue)) {
      nextState[key] = Math.max(0, Math.round(nextValue));
    }
  }

  return rebalanceStrategyLevers(nextState);
}

export function rebalanceStrategyLevers(levers: StrategyLeverState): StrategyLeverState {
  const sanitizedEntries: Array<[StrategyLeverKey, number]> = Object.entries(levers).map(([key, value]) => [
    key as StrategyLeverKey,
    Math.max(0, Math.round(value))
  ]);
  const total = sanitizedEntries.reduce((sum, [, value]) => sum + value, 0);

  if (total === STRATEGY_TOTAL_BELIEF_POINTS) {
    return Object.fromEntries(sanitizedEntries) as StrategyLeverState;
  }

  if (total === 0) {
    return DEFAULT_STRATEGY_LEVERS;
  }

  const scaledEntries: Array<[StrategyLeverKey, number]> = sanitizedEntries.map(([key, value]) => [
    key,
    Math.floor((value / total) * STRATEGY_TOTAL_BELIEF_POINTS)
  ]);
  let remainder =
    STRATEGY_TOTAL_BELIEF_POINTS - scaledEntries.reduce((sum, [, value]) => sum + value, 0);

  const orderedKeys = sanitizedEntries
    .slice()
    .sort((left, right) => right[1] - left[1])
    .map(([key]) => key);

  let cursor = 0;
  while (remainder > 0) {
    const targetKey = orderedKeys[cursor % orderedKeys.length];
    const entry = scaledEntries.find(([key]) => key === targetKey);
    if (entry) {
      entry[1] += 1;
      remainder -= 1;
    }
    cursor += 1;
  }

  return Object.fromEntries(scaledEntries) as StrategyLeverState;
}

export function hasGroupPhaseStarted(now = Date.now()) {
  return now >= new Date(GROUP_PHASE_START_AT).getTime();
}

export function resolveTournamentEntryState(
  mode: TournamentEntryMode | null,
  state: TournamentEntryState | null,
  now = Date.now()
): TournamentEntryState | null {
  if (!mode || !state) {
    return state;
  }

  if (state === "active" && hasGroupPhaseStarted(now)) {
    return "locked";
  }

  return state;
}

export function canActivateTournamentEntry(now = Date.now()) {
  return !hasGroupPhaseStarted(now);
}

export function canSwitchTournamentEntry(now = Date.now()) {
  return !hasGroupPhaseStarted(now);
}

export function getTournamentLockMessage() {
  return "Tournament entries are locked. You can still preview this mode, but it will not count.";
}

export function getModePreviewConflictMessage(activeMode: TournamentEntryMode | null, previewMode: TournamentEntryMode) {
  if (activeMode === "easy_bracket" && previewMode === "strategy_mode") {
    return "You already have an active Easy Bracket. You can preview Strategy Mode, but it will not count unless you switch before kickoff.";
  }

  if (activeMode === "strategy_mode" && previewMode === "easy_bracket") {
    return "You already have an active Strategy Mode entry. You can preview Easy Bracket, but it will not count unless you switch before kickoff.";
  }

  return null;
}

export function getTournamentModePrompt(activeMode: TournamentEntryMode | null) {
  if (!activeMode) {
    return "Choose a tournament mode before kickoff.";
  }

  return null;
}

export function getStrategyPresetByKey(key?: string | null) {
  return STRATEGY_PRESETS.find((preset) => preset.key === key) ?? getDefaultStrategyPreset();
}

export function getStrategyReceiptRows() {
  return [
    { label: "Team reaches final", value: "Shown when live probability data is connected." },
    { label: "Team wins World Cup", value: "Shown when live probability data is connected." },
    { label: "Exact final matchup", value: "Shown when live probability data is connected." }
  ];
}

export function shouldHideDockForPath(pathname: string, onboardingFlag: string | null) {
  return pathname.startsWith("/start-playing") || pathname === "/profile-setup" || onboardingFlag === "1";
}

export function shouldApplyHomeTeamAdvantage(enabled: boolean, leaderboardScope: "group" | "global" | "personal") {
  return enabled && leaderboardScope === "group";
}
