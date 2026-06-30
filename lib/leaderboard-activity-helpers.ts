import { isKnockoutStage } from "./match-stage.ts";
import type { LeaderboardPhase } from "./leaderboard-data.ts";

export function getLeaderboardActivityTimestamp(
  event: Pick<{ created_at: string }, "created_at">,
  match?: {
    stage?: string | null;
    finalized_at?: string | null;
    last_synced_at?: string | null;
    kickoff_at?: string | null;
    updated_at?: string | null;
  } | null
) {
  return (
    match?.finalized_at ??
    match?.last_synced_at ??
    match?.kickoff_at ??
    match?.updated_at ??
    event.created_at
  );
}

export function shouldIncludeLeaderboardActivityItem(input: {
  phase: LeaderboardPhase;
  eventType: string;
  match?: {
    stage?: string | null;
  } | null;
}) {
  if (input.phase === "group_phase") {
    return false;
  }

  if (input.phase === "side_picks") {
    return input.eventType === "trophy_awarded" || input.eventType === "daily_winner";
  }

  if (!input.match?.stage) {
    return input.phase === "global_top10";
  }

  if (input.phase === "knockout_phase" || input.phase === "global_top10") {
    return isKnockoutStage(input.match.stage);
  }

  return true;
}
