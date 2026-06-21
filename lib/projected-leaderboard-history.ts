import { normalizeGroupKey } from "./group-standings.ts";

export type ProjectedLeaderboardHistoryMatch = {
  id: string;
  stage: string;
  group_name?: string | null;
  status: "scheduled" | "locked" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  kickoff_time?: string | null;
};

export type ProjectionCheckpointState = {
  projectionKey: string;
  createdAt: string | null;
  matches: ProjectedLeaderboardHistoryMatch[];
};

export function buildProjectedLeaderboardSnapshotInsertRows(input: {
  scopeType: "global" | "group";
  groupId?: string | null;
  projectionKey: string;
  createdAt?: string | null;
  rankedEntries: Array<{ user_id: string; rank: number; total_points: number }>;
}) {
  return input.rankedEntries.map((entry) => {
    const row = {
      projection_key: input.projectionKey,
      scope_type: input.scopeType,
      group_id: input.scopeType === "group" ? input.groupId ?? null : null,
      user_id: entry.user_id,
      rank: entry.rank,
      projected_points: roundProjectedPoints(entry.total_points)
    } as {
      projection_key: string;
      scope_type: "global" | "group";
      group_id: string | null;
      user_id: string;
      rank: number;
      projected_points: number;
      created_at?: string;
    };

    if (input.createdAt) {
      row.created_at = input.createdAt;
    }

    return row;
  });
}

export function buildProjectedGlobalHistoryCheckpointStates(
  matches: ProjectedLeaderboardHistoryMatch[],
  checkpointTimestampsByMatchId: ReadonlyMap<string, string> = new Map()
): ProjectionCheckpointState[] {
  const groupStageMatches = matches
    .filter((match) => Boolean(normalizeGroupKey(match.group_name) ?? match.group_name))
    .sort((left, right) => {
      const kickoffDelta =
        new Date(left.kickoff_time ?? 0).getTime() - new Date(right.kickoff_time ?? 0).getTime();
      if (kickoffDelta !== 0) {
        return kickoffDelta;
      }
      return left.id.localeCompare(right.id);
    });

  if (groupStageMatches.length === 0) {
    return [];
  }

  const activeCheckpointMatches = groupStageMatches.filter(
    (match) => match.status === "live" || match.status === "final"
  );
  const checkpointStates: ProjectionCheckpointState[] = [];

  const preMatches = matches.map((match) =>
    isGroupStageMatch(match)
      ? {
          ...match,
          status: "scheduled" as const,
          home_score: null,
          away_score: null
        }
      : { ...match }
  );
  checkpointStates.push({
    projectionKey: deriveProjectionKey(preMatches),
    createdAt: derivePreCheckpointTimestamp(groupStageMatches),
    matches: preMatches
  });

  for (let index = 0; index < activeCheckpointMatches.length; index += 1) {
    const checkpointMatch = activeCheckpointMatches[index];
    const includedMatchIds = new Set(activeCheckpointMatches.slice(0, index + 1).map((match) => match.id));
    const checkpointMatches = matches.map((match) => {
      if (!isGroupStageMatch(match)) {
        return { ...match };
      }

      if (includedMatchIds.has(match.id)) {
        return { ...match };
      }

      return {
        ...match,
        status: "scheduled" as const,
        home_score: null,
        away_score: null
      };
    });

    checkpointStates.push({
      projectionKey: deriveProjectionKey(checkpointMatches),
      createdAt:
        checkpointTimestampsByMatchId.get(checkpointMatch.id) ??
        checkpointMatch.kickoff_time ??
        null,
      matches: checkpointMatches
    });
  }

  const checkpointByKey = new Map<string, ProjectionCheckpointState>();
  for (const state of checkpointStates) {
    checkpointByKey.set(state.projectionKey, state);
  }

  return Array.from(checkpointByKey.values());
}

export function isGroupStageMatch(match: ProjectedLeaderboardHistoryMatch) {
  return Boolean(normalizeGroupKey(match.group_name) ?? match.group_name);
}

function derivePreCheckpointTimestamp(matches: ProjectedLeaderboardHistoryMatch[]): string | null {
  const firstKickoff = matches.find((match) => match.kickoff_time)?.kickoff_time ?? null;
  if (!firstKickoff) {
    return null;
  }

  const preTime = new Date(firstKickoff).getTime() - 60_000;
  return Number.isFinite(preTime) ? new Date(preTime).toISOString() : firstKickoff;
}

export function deriveProjectionKey(matches: ProjectedLeaderboardHistoryMatch[]): string {
  const groupStageMatches = matches
    .filter((match) => Boolean(normalizeGroupKey(match.group_name) ?? match.group_name))
    .sort(
      (left, right) =>
        new Date(left.kickoff_time ?? 0).getTime() - new Date(right.kickoff_time ?? 0).getTime()
    );
  const latestActive = groupStageMatches
    .filter((match) => match.status === "live" || match.status === "final")
    .at(-1);

  if (latestActive?.id) {
    return `group:${latestActive.id}`;
  }

  const firstScheduled = groupStageMatches.find((match) => match.id);
  return firstScheduled?.id ? `group:${firstScheduled.id}:pre` : "group:pre";
}

function roundProjectedPoints(value: number) {
  return Math.round(value * 10) / 10;
}
