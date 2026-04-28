import type { MatchStage } from "@/lib/types";

export type CanonicalKnockoutStage = "r32" | "r16" | "qf" | "sf" | "third" | "final";

const KNOCKOUT_STAGE_ALIASES: Record<CanonicalKnockoutStage, MatchStage[]> = {
  r32: ["r32", "round_of_32"],
  r16: ["r16", "round_of_16"],
  qf: ["qf", "quarterfinal"],
  sf: ["sf", "semifinal"],
  third: ["third"],
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
