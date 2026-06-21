import type { MatchStatus, MatchWithTeams, Team } from "./types";

export type GroupMatchRow = {
  id: string;
  external_id?: string | null;
  stage: "group";
  group_name?: string | null;
  status: MatchStatus;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  kickoff_time?: string | null;
};

type TeamResolver = (teamId: string) => Team | undefined;

export function mergeGroupMatchRows(
  rows: GroupMatchRow[],
  localMatches: MatchWithTeams[],
  resolveTeam: TeamResolver
): MatchWithTeams[] {
  const localMatchesById = new Map(localMatches.map((match) => [match.id, match] as const));
  const localMatchesByExternalId = new Map(localMatches.map((match) => [match.id, match] as const));
  const localMatchesByFixtureKey = new Map(
    localMatches.map((match) => [toFixtureKey(match.groupName, match.homeTeamId, match.awayTeamId), match] as const)
  );

  return rows
    .map((row) => {
      const localMatch =
        localMatchesById.get(row.id) ??
        localMatchesByExternalId.get(row.external_id ?? "") ??
        localMatchesByFixtureKey.get(
          toFixtureKey(row.group_name ?? undefined, row.home_team_id ?? undefined, row.away_team_id ?? undefined)
        ) ??
        null;

      const homeTeamId = row.home_team_id ?? localMatch?.homeTeamId;
      const awayTeamId = row.away_team_id ?? localMatch?.awayTeamId;
      const groupName = row.group_name ?? localMatch?.groupName;

      return {
        id: row.id,
        stage: "group" as const,
        groupName: groupName ?? undefined,
        homeTeamId: homeTeamId ?? undefined,
        awayTeamId: awayTeamId ?? undefined,
        kickoffTime: row.kickoff_time ?? localMatch?.kickoffTime ?? "",
        status: row.status,
        homeScore: row.home_score ?? undefined,
        awayScore: row.away_score ?? undefined,
        winnerTeamId: row.winner_team_id ?? undefined,
        homeTeam: homeTeamId ? resolveTeam(homeTeamId) : undefined,
        awayTeam: awayTeamId ? resolveTeam(awayTeamId) : undefined
      };
    })
    .sort((left, right) => new Date(left.kickoffTime).getTime() - new Date(right.kickoffTime).getTime());
}

function toFixtureKey(groupName?: string, homeTeamId?: string, awayTeamId?: string) {
  return [groupName ?? "", homeTeamId ?? "", awayTeamId ?? ""].join("|");
}
