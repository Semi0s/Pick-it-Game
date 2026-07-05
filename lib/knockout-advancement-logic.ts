import { isRoundOf32Stage } from "./match-stage.ts";
import type { MatchStatus, MatchStage } from "./types.ts";

export function shouldClearKnockoutParticipants(
  match: {
    stage: MatchStage;
    status: MatchStatus;
  }
) {
  if (match.status === "final") {
    return false;
  }

  if (isRoundOf32Stage(match.stage)) {
    return false;
  }

  return true;
}

export function shouldClearKnockoutScoresForParticipantChange(input: {
  status: MatchStatus;
  beforeHomeTeamId: string | null;
  beforeAwayTeamId: string | null;
  afterHomeTeamId: string | null;
  afterAwayTeamId: string | null;
}) {
  if (input.status === "final") {
    return false;
  }

  return (
    input.beforeHomeTeamId !== input.afterHomeTeamId ||
    input.beforeAwayTeamId !== input.afterAwayTeamId
  );
}
