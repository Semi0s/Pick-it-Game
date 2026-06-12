import type { DashboardScoringMovementSummary } from "./leaderboard-movement-helpers.ts";
import { hasMeaningfulScoreHistory } from "./dashboard-home.ts";

type LeaderboardMode = "official" | "projected";
type LeaderboardPhase = "group_phase" | "knockout_phase" | "side_picks" | "global_top10";
type LeaderboardSwitcherView = "global" | "my_groups" | "managed_groups" | "groups" | "teams" | "managers";

export function shouldUseProjectedLeaderboardMode(input: {
  requestedMode?: LeaderboardMode | null;
  projectedLeaderboardEnabled: boolean;
  phase?: LeaderboardPhase | null;
  view?: LeaderboardSwitcherView | null;
}): boolean {
  return Boolean(
    input.requestedMode === "projected" &&
      input.projectedLeaderboardEnabled &&
      input.phase === "group_phase" &&
      input.view !== "groups" &&
      input.view !== "teams"
  );
}

export function selectDashboardProjectedScoreSummary(input: {
  official: DashboardScoringMovementSummary;
  projected: DashboardScoringMovementSummary;
  projectedLeaderboardEnabled: boolean;
}): {
  scoreKind: "official" | "projected";
  score: DashboardScoringMovementSummary;
} {
  if (hasMeaningfulScoreHistory(input.official)) {
    return {
      scoreKind: "official",
      score: input.official
    };
  }

  if (input.projectedLeaderboardEnabled && hasMeaningfulScoreHistory(input.projected)) {
    return {
      scoreKind: "projected",
      score: input.projected
    };
  }

  return {
    scoreKind: "official",
    score: input.official
  };
}
