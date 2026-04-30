import type { Team } from "@/lib/types";

export function getTeamRating(team?: Team | null) {
  if (!team) {
    return 1500;
  }

  if (typeof team.fifaPoints === "number" && Number.isFinite(team.fifaPoints)) {
    return team.fifaPoints;
  }

  if (typeof team.fifaRank === "number" && Number.isFinite(team.fifaRank)) {
    return 2200 - team.fifaRank * 10;
  }

  return 1500;
}
