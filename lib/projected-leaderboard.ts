import "server-only";

import { buildDashboardScoringMovementSummary, createEmptyDashboardScoringMovementSummary, type DashboardScoringMovementSummary } from "@/lib/leaderboard-movement-helpers";
import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { normalizeGroupKey } from "@/lib/group-standings";
import { GROUP_PHASE_GROUP_MAX_POINTS } from "@/lib/group-phase-scoring";
import { getAdvanceViaThirdProbability, getAdvanceTotalProbability, getGroupSelectionProbability, type PickProbabilityStandingsRow, type PickProbabilityTeam } from "@/lib/group-pick-probability";
import { buildProjectedGroupStandings, buildQualifiedTeamSeeds, getRequiredThirdPlaceQualifierCount, type GroupStandingsRow, type KnockoutPlaceholderMatch } from "@/lib/knockout-seeding";
import { getTeamRating } from "@/lib/team-strength";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getGroupMatches, teams as demoTeams } from "@/lib/mock-data";
import type { MatchStage, Team } from "@/lib/types";

export const PROJECTED_LEADERBOARD_ENABLED_KEY = "projected_leaderboard_enabled";

type MatchRow = {
  id: string;
  stage: MatchStage | string;
  group_name?: string | null;
  status: "scheduled" | "locked" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  group_name: string;
  fifa_rank?: number | null;
  fifa_points?: number | null;
  flag_emoji?: string | null;
};

type GroupSeedRankingRecord = {
  user_id: string;
  group_name: string;
  rank_position: number;
  team_id: string;
};

type ThirdPlaceRankingRecord = {
  user_id: string;
  team_id: string;
  rank_position: number;
};

type ProjectedLeaderboardSnapshotRow = {
  projection_key: string;
  user_id: string;
  scope_type: "global" | "group";
  group_id?: string | null;
  rank: number;
  projected_points: number;
  created_at: string;
};

export type ProjectedGroupPhaseUserSummary = {
  userId: string;
  snapshot: LightSeedBuilderSnapshot | null;
  projectedPoints: number;
  maxPoints: number;
  hasSnapshot: boolean;
};

type ProjectionContext = {
  projectionKey: string;
  requiredThirdPlaceQualifierCount: number;
  standingsRowsByGroup: Map<string, PickProbabilityStandingsRow[]>;
  groupTeamsByGroup: Map<string, PickProbabilityTeam[]>;
  thirdPlacePool: PickProbabilityTeam[];
};

export async function fetchProjectedGroupPhaseSummaries(userIds: string[]): Promise<{
  summaries: Map<string, ProjectedGroupPhaseUserSummary>;
  projectionKey: string | null;
}> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const summaries = new Map<string, ProjectedGroupPhaseUserSummary>();

  if (uniqueUserIds.length === 0) {
    return { summaries, projectionKey: null };
  }

  const context = await fetchProjectionContext();
  if (!hasSupabaseConfig()) {
    for (const userId of uniqueUserIds) {
      summaries.set(userId, {
        userId,
        snapshot: null,
        projectedPoints: 0,
        maxPoints: context.groupTeamsByGroup.size * GROUP_PHASE_GROUP_MAX_POINTS,
        hasSnapshot: false
      });
    }
    return { summaries, projectionKey: context.projectionKey };
  }

  const adminSupabase = createAdminClient();
  const [groupSeedRows, thirdPlaceRows] = await Promise.all([
    adminSupabase
      .from("user_group_seed_rankings")
      .select("user_id,group_name,rank_position,team_id")
      .in("user_id", uniqueUserIds)
      .order("user_id", { ascending: true })
      .order("group_name", { ascending: true })
      .order("rank_position", { ascending: true }),
    adminSupabase
      .from("user_best_third_rankings")
      .select("user_id,team_id,rank_position")
      .in("user_id", uniqueUserIds)
      .order("user_id", { ascending: true })
      .order("rank_position", { ascending: true })
  ]);

  const groupedRankings = groupSeedRankingsByUser(
    ((groupSeedRows.data as GroupSeedRankingRecord[] | null) ?? []).map((row) => ({
      ...row,
      group_name: normalizeGroupKey(row.group_name) ?? row.group_name
    }))
  );
  const groupedThirdPlaceRankings = thirdPlaceRankingsByUser((thirdPlaceRows.data as ThirdPlaceRankingRecord[] | null) ?? []);
  const maxPoints = context.groupTeamsByGroup.size * GROUP_PHASE_GROUP_MAX_POINTS;

  for (const userId of uniqueUserIds) {
    const snapshot = buildGroupPhaseSnapshot({
      userId,
      groupedRankings,
      groupedThirdPlaceRankings
    });

    summaries.set(userId, {
      userId,
      snapshot,
      projectedPoints: roundProjectedPoints(computeProjectedGroupPhasePoints(snapshot, context)),
      maxPoints,
      hasSnapshot: Boolean(snapshot?.groupRankings.length || snapshot?.thirdPlaceRankings.length)
    });
  }

  return {
    summaries,
    projectionKey: context.projectionKey
  };
}

export async function persistProjectedLeaderboardSnapshots(input: {
  scopeType: "global" | "group";
  groupId?: string | null;
  projectionKey: string | null;
  rankedEntries: Array<{ user_id: string; rank: number; total_points: number }>;
}): Promise<void> {
  if (!input.projectionKey || input.rankedEntries.length === 0 || !hasSupabaseConfig()) {
    return;
  }

  const adminSupabase = createAdminClient();
  const userIds = Array.from(new Set(input.rankedEntries.map((entry) => entry.user_id).filter(Boolean)));
  if (userIds.length === 0) {
    return;
  }

  let deleteQuery = adminSupabase
    .from("projected_leaderboard_snapshots")
    .delete()
    .eq("projection_key", input.projectionKey)
    .eq("scope_type", input.scopeType)
    .in("user_id", userIds);

  deleteQuery =
    input.scopeType === "group"
      ? deleteQuery.eq("group_id", input.groupId ?? "")
      : deleteQuery.is("group_id", null);

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await adminSupabase.from("projected_leaderboard_snapshots").insert(
    input.rankedEntries.map((entry) => ({
      projection_key: input.projectionKey,
      scope_type: input.scopeType,
      group_id: input.scopeType === "group" ? input.groupId ?? null : null,
      user_id: entry.user_id,
      rank: entry.rank,
      projected_points: roundProjectedPoints(entry.total_points)
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function fetchProjectedLeaderboardRankMovement(input: {
  scopeType: "global" | "group";
  groupId?: string;
  projectionKey: string | null;
}): Promise<
  Array<{
    user_id: string;
    current_rank: number;
    previous_rank: number | null;
    rank_delta: number | null;
    current_points: number;
    previous_points: number | null;
    points_delta: number | null;
  }>
> {
  const trimmedProjectionKey = input.projectionKey?.trim();
  if (!trimmedProjectionKey || !hasSupabaseConfig()) {
    return [];
  }

  const adminSupabase = createAdminClient();
  let currentQuery = adminSupabase
    .from("projected_leaderboard_snapshots")
    .select("projection_key,user_id,group_id,rank,projected_points,created_at")
    .eq("scope_type", input.scopeType)
    .eq("projection_key", trimmedProjectionKey)
    .order("rank", { ascending: true });

  currentQuery =
    input.scopeType === "group"
      ? currentQuery.eq("group_id", input.groupId ?? "")
      : currentQuery.is("group_id", null);

  const { data: currentRows, error: currentError } = await currentQuery;
  if (currentError) {
    throw new Error(currentError.message);
  }

  const currentSnapshots = (currentRows as ProjectedLeaderboardSnapshotRow[] | null) ?? [];
  if (currentSnapshots.length === 0) {
    return [];
  }

  const currentCreatedAt = currentSnapshots[0]?.created_at;
  if (!currentCreatedAt) {
    return currentSnapshots.map((snapshot) => ({
      user_id: snapshot.user_id,
      current_rank: snapshot.rank,
      previous_rank: null,
      rank_delta: null,
      current_points: snapshot.projected_points,
      previous_points: null,
      points_delta: null
    }));
  }

  let previousCandidatesQuery = adminSupabase
    .from("projected_leaderboard_snapshots")
    .select("projection_key,group_id,created_at")
    .eq("scope_type", input.scopeType)
    .lt("created_at", currentCreatedAt)
    .order("created_at", { ascending: false })
    .limit(500);

  previousCandidatesQuery =
    input.scopeType === "group"
      ? previousCandidatesQuery.eq("group_id", input.groupId ?? "")
      : previousCandidatesQuery.is("group_id", null);

  const { data: previousCandidates, error: previousCandidatesError } = await previousCandidatesQuery;
  if (previousCandidatesError) {
    throw new Error(previousCandidatesError.message);
  }

  const previousProjectionKey =
    (((previousCandidates as Array<Pick<ProjectedLeaderboardSnapshotRow, "projection_key" | "created_at">> | null) ?? []).find(
      (row) => row.projection_key !== trimmedProjectionKey
    )?.projection_key) ?? null;

  if (!previousProjectionKey) {
    return currentSnapshots.map((snapshot) => ({
      user_id: snapshot.user_id,
      current_rank: snapshot.rank,
      previous_rank: null,
      rank_delta: null,
      current_points: snapshot.projected_points,
      previous_points: null,
      points_delta: null
    }));
  }

  let previousQuery = adminSupabase
    .from("projected_leaderboard_snapshots")
    .select("projection_key,user_id,group_id,rank,projected_points,created_at")
    .eq("scope_type", input.scopeType)
    .eq("projection_key", previousProjectionKey);

  previousQuery =
    input.scopeType === "group"
      ? previousQuery.eq("group_id", input.groupId ?? "")
      : previousQuery.is("group_id", null);

  const { data: previousRows, error: previousError } = await previousQuery;
  if (previousError) {
    throw new Error(previousError.message);
  }

  const previousByUserId = new Map(
    (((previousRows as ProjectedLeaderboardSnapshotRow[] | null) ?? []).map((row) => [row.user_id, row] as const))
  );

  return currentSnapshots.map((snapshot) => {
    const previous = previousByUserId.get(snapshot.user_id) ?? null;
    return {
      user_id: snapshot.user_id,
      current_rank: snapshot.rank,
      previous_rank: previous?.rank ?? null,
      rank_delta: previous ? previous.rank - snapshot.rank : null,
      current_points: snapshot.projected_points,
      previous_points: previous?.projected_points ?? null,
      points_delta: previous ? roundProjectedPoints(snapshot.projected_points - previous.projected_points) : null
    };
  });
}

export async function fetchProjectedDashboardScoringMovementSummary(
  userId: string,
  options?: { limit?: number }
): Promise<DashboardScoringMovementSummary> {
  if (!hasSupabaseConfig()) {
    return createEmptyDashboardScoringMovementSummary();
  }

  const trimmedUserId = userId.trim();
  if (!trimmedUserId) {
    return createEmptyDashboardScoringMovementSummary();
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("projected_leaderboard_snapshots")
    .select("projection_key,user_id,scope_type,group_id,rank,projected_points,created_at")
    .eq("scope_type", "global")
    .eq("user_id", trimmedUserId)
    .is("group_id", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, options?.limit ?? 24));

  if (error) {
    throw new Error(error.message);
  }

  const userRows = (data as ProjectedLeaderboardSnapshotRow[] | null) ?? [];
  if (userRows.length === 0) {
    return createEmptyDashboardScoringMovementSummary();
  }

  const projectionKeys = Array.from(new Set(userRows.map((row) => row.projection_key).filter(Boolean)));
  const paceByProjectionKey = new Map<string, number>();

  if (projectionKeys.length > 0) {
    const { data: paceRows, error: paceError } = await adminSupabase
      .from("projected_leaderboard_snapshots")
      .select("projection_key,projected_points")
      .eq("scope_type", "global")
      .is("group_id", null)
      .in("projection_key", projectionKeys);

    if (paceError) {
      throw new Error(paceError.message);
    }

    const totalsByProjectionKey = new Map<string, { points: number; count: number }>();
    for (const row of ((paceRows as Array<Pick<ProjectedLeaderboardSnapshotRow, "projection_key" | "projected_points">> | null) ?? [])) {
      const current = totalsByProjectionKey.get(row.projection_key) ?? { points: 0, count: 0 };
      current.points += row.projected_points;
      current.count += 1;
      totalsByProjectionKey.set(row.projection_key, current);
    }

    for (const [projectionKey, totals] of totalsByProjectionKey.entries()) {
      if (totals.count > 0) {
        paceByProjectionKey.set(projectionKey, totals.points / totals.count);
      }
    }
  }

  return buildDashboardScoringMovementSummary(
    userRows.map((row) => ({
      match_id: row.projection_key,
      user_id: row.user_id,
      scope_type: row.scope_type,
      group_id: row.group_id ?? null,
      rank: row.rank,
      total_points: row.projected_points,
      created_at: row.created_at
    })),
    paceByProjectionKey
  );
}

async function fetchProjectionContext(): Promise<ProjectionContext> {
  const adminSupabase = createAdminClient();
  const [teams, matches] = await Promise.all([fetchTeams(adminSupabase), fetchMatches(adminSupabase)]);

  const projectedStandings = buildProjectedGroupStandings(
    matches.map((match) => ({
      id: match.id,
      stage: match.stage,
      groupName: match.group_name ?? null,
      status: match.status,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null
    })),
    teams
  );

  const standingsRowsByGroup = new Map<string, PickProbabilityStandingsRow[]>();
  const qualifierRowsByGroup = new Map<string, GroupStandingsRow[]>();
  for (const [groupName, standings] of projectedStandings.entries()) {
    qualifierRowsByGroup.set(groupName, standings.rows);
    standingsRowsByGroup.set(groupName, standings.rows.map((row) => ({
      teamId: row.teamId,
      rank: row.rank,
      played: row.played,
      goalsFor: row.goalsFor,
      goalDifference: row.goalDifference,
      points: row.points
    })));
  }

  const groupTeamsByGroup = new Map<string, PickProbabilityTeam[]>();
  for (const team of teams) {
    const groupName = normalizeGroupKey(team.groupName) ?? team.groupName;
    if (!groupName) {
      continue;
    }
    const current = groupTeamsByGroup.get(groupName) ?? [];
    current.push(team);
    groupTeamsByGroup.set(groupName, current);
  }

  const roundOf32Placeholders = matches
    .filter((match) => match.stage === "r32" || match.stage === "round_of_32")
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      homeSource: match.home_source ?? null,
      awaySource: match.away_source ?? null,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      status: match.status
    })) satisfies KnockoutPlaceholderMatch[];
  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders) || 8;
  const { rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(
    qualifierRowsByGroup,
    requiredThirdPlaceQualifierCount
  );
  const teamsById = new Map(teams.map((team) => [team.id, team] as const));
  const thirdPlacePool = rankedThirdPlaceTeams
    .map((team) => teamsById.get(team.teamId) ?? null)
    .filter((team): team is PickProbabilityTeam => Boolean(team));

  return {
    projectionKey: deriveProjectionKey(matches),
    requiredThirdPlaceQualifierCount,
    standingsRowsByGroup,
    groupTeamsByGroup,
    thirdPlacePool
  };
}

function computeProjectedGroupPhasePoints(
  snapshot: LightSeedBuilderSnapshot | null,
  context: ProjectionContext
): number {
  if (!snapshot) {
    return 0;
  }

  const predictedThirdPlaceQualifiedIds = new Set(
    (snapshot.thirdPlaceRankings ?? [])
      .slice()
      .sort((left, right) => left.rank - right.rank)
      .slice(0, context.requiredThirdPlaceQualifierCount)
      .map((row) => row.teamId)
  );

  return snapshot.groupRankings.reduce((sum, ranking) => {
    const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
    const rows = context.standingsRowsByGroup.get(groupName) ?? [];
    const groupTeams = context.groupTeamsByGroup.get(groupName) ?? [];
    const teamsById = new Map(groupTeams.map((team) => [team.id, team] as const));
    const predictedIds = ranking.rankedTeamIds.slice(0, 4);
    const predictedWinner = predictedIds[0] ? teamsById.get(predictedIds[0]) ?? null : null;
    const predictedRunnerUp = predictedIds[1] ? teamsById.get(predictedIds[1]) ?? null : null;
    const predictedThird = predictedIds[2] ? teamsById.get(predictedIds[2]) ?? null : null;
    const predictedFourth = predictedIds[3] ? teamsById.get(predictedIds[3]) ?? null : null;

    const winnerPoints = projectedExactPlaceProbability(predictedWinner, 1, rows, groupTeams) * 0.05;
    const runnerUpPoints = projectedExactPlaceProbability(predictedRunnerUp, 2, rows, groupTeams) * 0.03;
    const thirdPoints = projectedExactPlaceProbability(predictedThird, 3, rows, groupTeams) * 0.02;

    const predictedTopTwo = [predictedWinner, predictedRunnerUp].filter((team): team is PickProbabilityTeam => Boolean(team));
    const topTwoAnyOrderBonus =
      predictedTopTwo.length === 2
        ? (getAdvanceTotalProbability({
            team: predictedTopTwo[0],
            groupTeams,
            thirdPlacePool: context.thirdPlacePool,
            thirdPlaceRankingIndex: context.thirdPlacePool.findIndex((team) => team.id === predictedTopTwo[0].id)
          }) / 100) *
            (getAdvanceTotalProbability({
              team: predictedTopTwo[1],
              groupTeams,
              thirdPlacePool: context.thirdPlacePool,
              thirdPlaceRankingIndex: context.thirdPlacePool.findIndex((team) => team.id === predictedTopTwo[1].id)
            }) / 100)
        : 0;

    const thirdQualificationProbability =
      predictedThird
        ? getAdvanceViaThirdProbability(
            predictedThird,
            Math.max(0, context.thirdPlacePool.findIndex((team) => team.id === predictedThird.id)),
            context.thirdPlacePool
          ) / 100
        : 0;
    const thirdPlaceQualificationPoints =
      predictedThird
        ? (predictedThirdPlaceQualifiedIds.has(predictedThird.id)
            ? thirdQualificationProbability
            : 1 - thirdQualificationProbability)
        : 0;

    const fourthProbability = projectedExactPlaceProbability(predictedFourth, 4, rows, groupTeams) / 100;
    const fullLadderBonus =
      (winnerPoints / 5) * (runnerUpPoints / 3) * (thirdPoints / 2) * fourthProbability * 2;

    return sum + winnerPoints + runnerUpPoints + thirdPoints + topTwoAnyOrderBonus + thirdPlaceQualificationPoints + fullLadderBonus;
  }, 0);
}

function projectedExactPlaceProbability(
  team: PickProbabilityTeam | null,
  predictedPlace: 1 | 2 | 3 | 4,
  rows: PickProbabilityStandingsRow[],
  groupTeams: PickProbabilityTeam[]
): number {
  if (!team) {
    return 0;
  }

  const row = rows.find((candidate) => candidate.teamId === team.id);
  if (!row) {
    return 0;
  }

  const sourceProbability =
    predictedPlace <= 2
      ? getGroupSelectionProbability(team, predictedPlace as 1 | 2, groupTeams)
      : getResidualPlaceProbability(team, predictedPlace === 3 ? 3 : 4, groupTeams);

  const maxPlayed = rows.reduce((max, candidate) => Math.max(max, candidate.played), 0);
  const progressWeight = Math.max(0, Math.min(maxPlayed / 3, 1));
  if (progressWeight <= 0) {
    return sourceProbability;
  }

  const rankFit = clamp(92 - Math.abs(row.rank - predictedPlace) * 26, 3, 97);
  const points = rows.map((candidate) => candidate.points);
  const minPoints = Math.min(...points);
  const maxPoints = Math.max(...points);
  const pointsSpread = Math.max(1, maxPoints - minPoints);
  const teamPower = (row.points - minPoints) / pointsSpread;
  const targetPower = predictedPlace === 1 ? 0.95 : predictedPlace === 2 ? 0.64 : predictedPlace === 3 ? 0.34 : 0.08;
  const powerFit = 100 - Math.abs(teamPower - targetPower) * 42;
  const formAdjustment = clamp(row.goalDifference * 3 + row.goalsFor, -8, 8);
  const currentEstimate = clamp(Math.round(rankFit * 0.72 + powerFit * 0.28 + formAdjustment), 3, 97);

  return clamp(Math.round(sourceProbability * (1 - progressWeight) + currentEstimate * progressWeight), 0, 100);
}

function getResidualPlaceProbability(
  team: PickProbabilityTeam,
  predictedPlace: 3 | 4,
  groupTeams: PickProbabilityTeam[]
): number {
  const comparisonTeams = ensureTeamInPool(team, groupTeams);
  const strengthPercentile = getStrengthPercentile(team, comparisonTeams);
  const strengthRank = getStrengthRank(team, comparisonTeams);
  const fieldSize = Math.max(4, comparisonTeams.length);
  const rankDistance = strengthRank === null ? fieldSize : Math.abs(strengthRank - predictedPlace);
  const rankFit = 1 - Math.min(rankDistance, fieldSize - 1) / Math.max(1, fieldSize - 1);
  const placeShapeFit =
    predictedPlace === 3
      ? 1 - Math.min(1, Math.abs(strengthPercentile - 0.34) / 0.5)
      : 1 - Math.min(1, Math.abs(strengthPercentile - 0.08) / 0.34);
  const baseline = 100 / fieldSize;
  const estimate = baseline + rankFit * 38 + placeShapeFit * 24;

  return clamp(Math.round(estimate), predictedPlace === 3 ? 16 : 8, predictedPlace === 3 ? 72 : 54);
}

function deriveProjectionKey(matches: MatchRow[]): string {
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

function buildGroupPhaseSnapshot(input: {
  userId: string;
  groupedRankings: Map<string, Map<string, string[]>>;
  groupedThirdPlaceRankings: Map<string, Array<{ teamId: string; rank: number }>>;
}): LightSeedBuilderSnapshot | null {
  const rankingMap = input.groupedRankings.get(input.userId) ?? null;
  const thirdPlaceRankings = input.groupedThirdPlaceRankings.get(input.userId) ?? [];
  if (!rankingMap && thirdPlaceRankings.length === 0) {
    return null;
  }

  return {
    groupRankings: Array.from((rankingMap ?? new Map()).entries())
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([groupName, rankedTeamIds]) => ({ groupName, rankedTeamIds })),
    thirdPlaceRankings: thirdPlaceRankings.slice().sort((left, right) => left.rank - right.rank)
  };
}

function groupSeedRankingsByUser(rows: GroupSeedRankingRecord[]) {
  const groupedRankings = new Map<string, Map<string, string[]>>();
  const sortedRows = rows
    .slice()
    .sort(
      (left, right) =>
        left.user_id.localeCompare(right.user_id) ||
        left.group_name.localeCompare(right.group_name, undefined, { numeric: true }) ||
        left.rank_position - right.rank_position
    );

  for (const row of sortedRows) {
    const byGroup = groupedRankings.get(row.user_id) ?? new Map<string, string[]>();
    const ranked = byGroup.get(row.group_name) ?? [];
    ranked.push(row.team_id);
    byGroup.set(row.group_name, ranked);
    groupedRankings.set(row.user_id, byGroup);
  }

  return groupedRankings;
}

function thirdPlaceRankingsByUser(rows: ThirdPlaceRankingRecord[]) {
  const groupedThirdPlaceRankings = new Map<string, Array<{ teamId: string; rank: number }>>();
  for (const row of rows) {
    const current = groupedThirdPlaceRankings.get(row.user_id) ?? [];
    current.push({ teamId: row.team_id, rank: row.rank_position });
    groupedThirdPlaceRankings.set(row.user_id, current);
  }

  return groupedThirdPlaceRankings;
}

async function fetchTeams(adminSupabase: ReturnType<typeof createAdminClient>): Promise<Team[]> {
  if (!hasSupabaseConfig()) {
    return demoTeams;
  }

  const { data, error } = await adminSupabase
    .from("teams")
    .select("id,name,short_name,group_name,fifa_rank,fifa_points,flag_emoji")
    .order("group_name", { ascending: true })
    .order("fifa_rank", { ascending: true });

  if (error) {
    return demoTeams;
  }

  return (((data as TeamRow[] | null) ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    fifaRank: team.fifa_rank ?? 999,
    fifaPoints: team.fifa_points ?? null,
    flagEmoji: team.flag_emoji ?? ""
  }))) || demoTeams;
}

async function fetchMatches(adminSupabase: ReturnType<typeof createAdminClient>): Promise<MatchRow[]> {
  if (!hasSupabaseConfig()) {
    return getGroupMatches().map((match) => ({
      id: match.id,
      stage: match.stage,
      group_name: match.groupName,
      status: match.status,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      home_score: match.homeScore,
      away_score: match.awayScore,
      home_source: null,
      away_source: null,
      kickoff_time: match.kickoffTime
    }));
  }

  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score,home_source,away_source,kickoff_time")
    .order("kickoff_time", { ascending: true });

  if (error) {
    return getGroupMatches().map((match) => ({
      id: match.id,
      stage: match.stage,
      group_name: match.groupName,
      status: match.status,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      home_score: match.homeScore,
      away_score: match.awayScore,
      home_source: null,
      away_source: null,
      kickoff_time: match.kickoffTime
    }));
  }

  return (data as MatchRow[] | null) ?? [];
}

function ensureTeamInPool(team: PickProbabilityTeam, teams: PickProbabilityTeam[]) {
  if (teams.length === 0) {
    return [team];
  }
  if (teams.some((candidate) => candidate.id === team.id)) {
    return teams;
  }
  return [...teams, team];
}

function getStrengthRank(team: PickProbabilityTeam, teams: PickProbabilityTeam[]) {
  const sorted = [...teams].sort((left, right) => {
    const ratingDiff = getTeamRating(right) - getTeamRating(left);
    if (ratingDiff !== 0) {
      return ratingDiff;
    }
    return left.name.localeCompare(right.name);
  });
  const index = sorted.findIndex((candidate) => candidate.id === team.id);
  return index >= 0 ? index + 1 : null;
}

function getStrengthPercentile(team: PickProbabilityTeam, teams: PickProbabilityTeam[]) {
  if (teams.length <= 1) {
    return 0.5;
  }

  const ratings = teams.map((candidate) => getTeamRating(candidate));
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  const spread = Math.max(1, maxRating - minRating);
  return clamp((getTeamRating(team) - minRating) / spread, 0, 1);
}

function roundProjectedPoints(value: number) {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
