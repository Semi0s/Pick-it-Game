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
