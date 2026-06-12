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
  const supportsProjectedView =
    (input.phase === "group_phase" &&
      (input.view === "global" || input.view === "my_groups" || input.view === "managed_groups")) ||
    (input.phase === "global_top10" && input.view === "global");

  return Boolean(
    input.requestedMode === "projected" &&
      input.projectedLeaderboardEnabled &&
      supportsProjectedView
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
