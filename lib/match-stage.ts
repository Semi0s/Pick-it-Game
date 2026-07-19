import { normalizeFifa2026KnockoutStoredMatchId } from "./fifa-2026-knockout-seeding.ts";
import type { MatchStage } from "./types.ts";

export type CanonicalKnockoutStage = "r32" | "r16" | "qf" | "sf" | "third" | "final";

export const KNOCKOUT_MATCH_STAGE_FILTER = "stage.neq.group,stage.is.null";

const KNOCKOUT_STAGE_ALIASES: Record<CanonicalKnockoutStage, MatchStage[]> = {
  r32: ["r32", "round_of_32"],
  r16: ["r16", "round_of_16"],
  qf: ["qf", "quarterfinal"],
  sf: ["sf", "semifinal"],
  third: ["third", "third_place" as MatchStage],
  final: ["final"]
};

export const EXPECTED_KNOCKOUT_MATCH_COUNTS: Record<CanonicalKnockoutStage, number> = {
  r32: 16,
  r16: 8,
  qf: 4,
  sf: 2,
  third: 1,
  final: 1
};

function inferKnockoutStageFromMatchId(matchId: string | null | undefined): CanonicalKnockoutStage | null {
  const normalized = normalizeFifa2026KnockoutStoredMatchId(matchId);
  if (!normalized) {
    return null;
  }

  if (/^M(7[3-9]|8[0-8])$/.test(normalized)) {
    return "r32";
  }

  if (/^M(89|9[0-6])$/.test(normalized)) {
    return "r16";
  }

  if (/^M(97|98|99|100)$/.test(normalized)) {
    return "qf";
  }

  if (/^M10[12]$/.test(normalized)) {
    return "sf";
  }

  if (normalized === "M103") {
    return "third";
  }

  if (normalized === "M104") {
    return "final";
  }

  return null;
}

export function normalizeKnockoutStage(stage: MatchStage | string | null | undefined): CanonicalKnockoutStage | null {
  if (!stage || stage === "group") {
    return null;
  }

  const normalizedStage = String(stage) as MatchStage;
  for (const [canonicalStage, aliases] of Object.entries(KNOCKOUT_STAGE_ALIASES) as Array<
    [CanonicalKnockoutStage, MatchStage[]]
  >) {
    if (aliases.includes(normalizedStage)) {
      return canonicalStage;
    }
  }

  return null;
}

export function normalizeKnockoutStageForMatch(input: {
  stage: MatchStage | string | null | undefined;
  matchId: string | null | undefined;
}): CanonicalKnockoutStage | null {
  const inferredStage = inferKnockoutStageFromMatchId(input.matchId);
  if (inferredStage) {
    return inferredStage;
  }

  return normalizeKnockoutStage(input.stage);
}

export function isKnockoutStage(stage: MatchStage | string | null | undefined) {
  return normalizeKnockoutStage(stage) !== null;
}

export function isRoundOf32Stage(stage: MatchStage | string | null | undefined) {
  return normalizeKnockoutStage(stage) === "r32";
}

export function getKnockoutStageFilterValues(stage: CanonicalKnockoutStage): MatchStage[] {
  return KNOCKOUT_STAGE_ALIASES[stage];
}

export function formatMatchStage(stage: MatchStage | string) {
  if (stage === "group") {
    return "Group";
  }

  switch (normalizeKnockoutStage(stage)) {
    case "r32":
      return "Round of 32";
    case "r16":
      return "Round of 16";
    case "qf":
      return "Quarterfinal";
    case "sf":
      return "Semifinal";
    case "third":
      return "Third Place";
    case "final":
      return "Final";
    default:
      return String(stage)
        .split("_")
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(" ");
  }
}
