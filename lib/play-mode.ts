import { getGroupMatches } from "./mock-data.ts";

export type PredictionStartMode = "easy_bracket" | "full_scoring" | "strategy_mode" | "groups";
export type TournamentEntryMode = "easy_bracket" | "strategy_mode";
export type TournamentEntryState = "draft" | "active" | "locked" | "inactive" | "archived";
export type GroupBaseMode = "my_picks" | "easy_bracket" | "strategy_mode";

function deriveGroupPhaseStartAt() {
  const firstGroupMatch = getGroupMatches()
    .filter((match) => match.stage === "group")
    .sort((left, right) => new Date(left.kickoffTime).getTime() - new Date(right.kickoffTime).getTime())[0];

  return firstGroupMatch?.kickoffTime ?? "2026-06-11T00:00:00.000Z";
}

function deriveKnockoutPhaseStartAt() {
  const firstKnockoutKickoff = new Date(GROUP_PHASE_START_AT).getTime() + 21 * 24 * 60 * 60 * 1000;
  return new Date(firstKnockoutKickoff).toISOString();
}

export const GROUP_PHASE_START_AT = process.env.NEXT_PUBLIC_GROUP_PHASE_START_AT ?? deriveGroupPhaseStartAt();
export const KNOCKOUT_PHASE_START_AT = process.env.NEXT_PUBLIC_KNOCKOUT_PHASE_START_AT ?? deriveKnockoutPhaseStartAt();
export const GROUP_STAGE_MATCH_COUNT = getGroupMatches().filter((match) => match.stage === "group").length || 72;
export const STRATEGY_TOTAL_BELIEF_POINTS = 10;
export const GROUP_STRATEGY_GLOBAL_WEIGHT = 40;
export const KNOCKOUT_PICKS_GLOBAL_WEIGHT = 60;
export const GLOBAL_CHALLENGE_TOTAL_WEIGHT = GROUP_STRATEGY_GLOBAL_WEIGHT + KNOCKOUT_PICKS_GLOBAL_WEIGHT;
export const GROUP_STRATEGY_MAX_POINTS_PER_TEAM = 3;
export const GROUP_STRATEGY_MAX_FADES = 3;

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

export function hasGroupPhaseStarted(now = Date.now()) {
  return now >= new Date(GROUP_PHASE_START_AT).getTime();
}

export function hasKnockoutPhaseStarted(now = Date.now()) {
  return now >= new Date(KNOCKOUT_PHASE_START_AT).getTime();
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
    return "You already have an active Easy Bracket. You can preview Global Challenge, but it will not count unless you switch before kickoff.";
  }

  if (activeMode === "strategy_mode" && previewMode === "easy_bracket") {
    return "You already have an active Global Challenge entry. You can preview Easy Bracket, but it will not count unless you switch before kickoff.";
  }

  return null;
}

export function getTournamentModePrompt(activeMode: TournamentEntryMode | null) {
  if (!activeMode) {
    return "Choose a tournament mode before kickoff.";
  }

  return null;
}

export function shouldHideDockForPath(pathname: string, onboardingFlag: string | null) {
  return pathname.startsWith("/start-playing") || pathname === "/profile-setup" || onboardingFlag === "1";
}

export function shouldApplyHomeTeamAdvantage(enabled: boolean, leaderboardScope: "group" | "global" | "personal") {
  return enabled && leaderboardScope === "group";
}
