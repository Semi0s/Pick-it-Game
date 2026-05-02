import type { MatchWithTeams, Team } from "@/lib/types";
import type { MiniGroupStandingsRow } from "@/components/GroupStandingsMiniTable";

export function normalizeGroupKey(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith("Group ") ? `Group ${trimmed.replace(/^Group\s+/i, "").trim()}` : `Group ${trimmed}`;
}

export function createMiniGroupStandingsRow(team: Team): MiniGroupStandingsRow {
  return {
    teamId: team.id,
    teamName: team.name,
    shortName: team.shortName,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  };
}

export function applyGroupStandingsResult(
  homeRow: MiniGroupStandingsRow,
  awayRow: MiniGroupStandingsRow,
  homeScore: number,
  awayScore: number
) {
  homeRow.played += 1;
  awayRow.played += 1;
  homeRow.goalsFor += homeScore;
  homeRow.goalsAgainst += awayScore;
  awayRow.goalsFor += awayScore;
  awayRow.goalsAgainst += homeScore;
  homeRow.goalDifference = homeRow.goalsFor - homeRow.goalsAgainst;
  awayRow.goalDifference = awayRow.goalsFor - awayRow.goalsAgainst;

  if (homeScore > awayScore) {
    homeRow.wins += 1;
    homeRow.points += 3;
    awayRow.losses += 1;
    return;
  }

  if (awayScore > homeScore) {
    awayRow.wins += 1;
    awayRow.points += 3;
    homeRow.losses += 1;
    return;
  }

  homeRow.draws += 1;
  awayRow.draws += 1;
  homeRow.points += 1;
  awayRow.points += 1;
}

export function sortMiniGroupStandingsRows(left: MiniGroupStandingsRow, right: MiniGroupStandingsRow) {
  if (right.points !== left.points) {
    return right.points - left.points;
  }

  if (right.goalDifference !== left.goalDifference) {
    return right.goalDifference - left.goalDifference;
  }

  if (right.goalsFor !== left.goalsFor) {
    return right.goalsFor - left.goalsFor;
  }

  return left.teamName.localeCompare(right.teamName);
}

export function buildFinalGroupStandings(matches: MatchWithTeams[], groupName: string) {
  const normalizedGroupName = normalizeGroupKey(groupName);
  const groupMatches = matches.filter(
    (match) => match.stage === "group" && normalizeGroupKey(match.groupName) === normalizedGroupName
  );
  const teamMap = new Map<string, MiniGroupStandingsRow>();

  for (const match of groupMatches) {
    if (match.homeTeam?.id) {
      teamMap.set(match.homeTeam.id, createMiniGroupStandingsRow(match.homeTeam));
    }
    if (match.awayTeam?.id) {
      teamMap.set(match.awayTeam.id, createMiniGroupStandingsRow(match.awayTeam));
    }
  }

  for (const match of groupMatches) {
    if (
      match.status !== "final" ||
      match.homeScore === undefined ||
      match.awayScore === undefined ||
      !match.homeTeamId ||
      !match.awayTeamId
    ) {
      continue;
    }

    const homeRow = teamMap.get(match.homeTeamId);
    const awayRow = teamMap.get(match.awayTeamId);

    if (!homeRow || !awayRow) {
      continue;
    }

    applyGroupStandingsResult(homeRow, awayRow, match.homeScore, match.awayScore);
  }

  return Array.from(teamMap.values()).sort(sortMiniGroupStandingsRows);
}

export function getGroupShortLabel(groupName: string) {
  return normalizeGroupKey(groupName)?.replace(/^Group\s+/i, "") ?? groupName;
}

export function formatGroupName(groupName: string) {
  return normalizeGroupKey(groupName) ?? groupName;
}
