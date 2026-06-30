import type { MatchStage } from "@/lib/types";

type ResolveAdminMatchWinnerInput = {
  stage: MatchStage;
  homeScore: string | number | null | undefined;
  awayScore: string | number | null | undefined;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  tiedWinnerTeamId?: string | null;
};

function normalizeScore(value: string | number | null | undefined): number | null {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isKnockoutStage(stage: MatchStage) {
  return stage !== "group";
}

export function areAdminMatchScoresTied(input: {
  homeScore: string | number | null | undefined;
  awayScore: string | number | null | undefined;
}) {
  const homeScore = normalizeScore(input.homeScore);
  const awayScore = normalizeScore(input.awayScore);

  return homeScore !== null && awayScore !== null && homeScore === awayScore;
}

export function resolveAdminMatchWinnerTeamId(input: ResolveAdminMatchWinnerInput) {
  const homeScore = normalizeScore(input.homeScore);
  const awayScore = normalizeScore(input.awayScore);

  if (homeScore === null || awayScore === null) {
    return undefined;
  }

  if (homeScore === awayScore) {
    if (isKnockoutStage(input.stage)) {
      return input.tiedWinnerTeamId ?? null;
    }

    return null;
  }

  if (homeScore > awayScore) {
    return input.homeTeamId ?? null;
  }

  return input.awayTeamId ?? null;
}

export function requiresAdminKnockoutTiebreakWinner(input: {
  stage: MatchStage;
  status?: string | null;
  homeScore: string | number | null | undefined;
  awayScore: string | number | null | undefined;
  winnerTeamId?: string | null | undefined;
}) {
  if (!isKnockoutStage(input.stage) || input.status !== "final") {
    return false;
  }

  const homeScore = normalizeScore(input.homeScore);
  const awayScore = normalizeScore(input.awayScore);

  return homeScore !== null && awayScore !== null && homeScore === awayScore && !input.winnerTeamId;
}

export function hasAdminWinnerScoreConflict(input: {
  stage: MatchStage;
  homeScore: string | number | null | undefined;
  awayScore: string | number | null | undefined;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  winnerTeamId?: string | null | undefined;
}) {
  const homeScore = normalizeScore(input.homeScore);
  const awayScore = normalizeScore(input.awayScore);

  if (homeScore === null || awayScore === null) {
    return false;
  }

  if (homeScore === awayScore) {
    if (isKnockoutStage(input.stage)) {
      return Boolean(
        input.winnerTeamId && input.winnerTeamId !== input.homeTeamId && input.winnerTeamId !== input.awayTeamId
      );
    }

    return Boolean(input.winnerTeamId);
  }

  const expectedWinner =
    homeScore > awayScore ? (input.homeTeamId ?? null) : (input.awayTeamId ?? null);

  return expectedWinner !== (input.winnerTeamId ?? null);
}
