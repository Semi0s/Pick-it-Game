export type LeaderboardPhasePointsPhase = "group_phase" | "knockout_phase" | "side_picks" | "global_top10";
export type LeaderboardPhasePointsMode = "official" | "projected";

type LeaderboardPhasePointsInput = {
  phase: LeaderboardPhasePointsPhase;
  mode?: LeaderboardPhasePointsMode;
  groupPhasePoints: number;
  projectedGroupPhasePoints: number;
  knockoutPhasePoints: number;
  sidePickPoints: number;
};

export function getLeaderboardPhaseStandardPoints(input: LeaderboardPhasePointsInput): number {
  const mode = input.mode ?? "official";

  if (input.phase === "group_phase") {
    return mode === "projected" ? input.projectedGroupPhasePoints : input.groupPhasePoints;
  }

  if (input.phase === "knockout_phase") {
    return input.knockoutPhasePoints;
  }

  if (input.phase === "side_picks") {
    return input.sidePickPoints;
  }

  return mode === "projected"
    ? input.projectedGroupPhasePoints + input.knockoutPhasePoints
    : input.groupPhasePoints + input.knockoutPhasePoints;
}

export function getGlobalTopTenPoints(input: Omit<LeaderboardPhasePointsInput, "phase">): number {
  const mode = input.mode ?? "official";
  return mode === "projected"
    ? input.projectedGroupPhasePoints + input.knockoutPhasePoints
    : input.groupPhasePoints + input.knockoutPhasePoints;
}

export function getGlobalTopTenTiebreakPoints(input: Omit<LeaderboardPhasePointsInput, "phase">): number {
  return input.groupPhasePoints + input.knockoutPhasePoints;
}
