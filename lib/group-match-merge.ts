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
  const localMatchesByKickoffGroupKey = new Map<string, MatchWithTeams[]>();

  for (const match of localMatches) {
    const kickoffGroupKey = toKickoffGroupKey(match.groupName, match.kickoffTime);
    const current = localMatchesByKickoffGroupKey.get(kickoffGroupKey) ?? [];
    current.push(match);
    localMatchesByKickoffGroupKey.set(kickoffGroupKey, current);
  }

  return rows
    .map((row) => {
      const kickoffGroupMatches = localMatchesByKickoffGroupKey.get(
        toKickoffGroupKey(row.group_name ?? undefined, row.kickoff_time ?? undefined)
      );
      const localMatch =
        localMatchesById.get(row.id) ??
        localMatchesByExternalId.get(row.external_id ?? "") ??
        localMatchesByFixtureKey.get(
          toFixtureKey(row.group_name ?? undefined, row.away_team_id ?? undefined, row.home_team_id ?? undefined)
        ) ??
        localMatchesByFixtureKey.get(
          toFixtureKey(row.group_name ?? undefined, row.home_team_id ?? undefined, row.away_team_id ?? undefined)
        ) ??
        (kickoffGroupMatches?.length === 1 ? kickoffGroupMatches[0] : null) ??
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

function toKickoffGroupKey(groupName?: string, kickoffTime?: string) {
  return [groupName ?? "", kickoffTime ?? ""].join("|");
}
