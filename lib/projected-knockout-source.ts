import "server-only";

import {
  buildProjectedGroupStandingsFromSeedRankings,
  buildUserProjectedRoundOf32,
  type GroupStageMatchForSeeding,
  type GroupStagePredictionForProjection,
  type KnockoutPlaceholderMatch
} from "@/lib/knockout-seeding";
import { fetchUserLightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Team } from "@/lib/types";

export type ProjectedKnockoutSource = "seed_builder" | "score_predictions";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type UserSettingsSourceRow = {
  projected_knockout_source?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
  flag_emoji?: string | null;
  group_name?: string | null;
  fifa_rank?: number | null;
};

type MatchRow = {
  id: string;
  stage: string;
  status: "scheduled" | "locked" | "live" | "final";
  group_name?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_source?: string | null;
  away_source?: string | null;
};

type PredictionRow = {
  match_id: string;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
};

type ProjectedRoundOf32Inputs = {
  teams: Team[];
  groupMatches: GroupStageMatchForSeeding[];
  predictions: GroupStagePredictionForProjection[];
  roundOf32Placeholders: KnockoutPlaceholderMatch[];
  hasSavedSnapshot: boolean;
  snapshotGroupRankings: Array<{ groupName: string; rankedTeamIds: string[] }>;
  snapshotThirdPlaceTeamIds: string[];
};

export type ProjectedKnockoutConflictStatus = {
  hasConflict: boolean;
  currentSource: ProjectedKnockoutSource;
  hasSavedSnapshot: boolean;
  hasScorePredictions: boolean;
  scoreResolvedSideCount: number;
  seedResolvedSideCount: number;
};

export async function fetchUserProjectedKnockoutSource(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<ProjectedKnockoutSource> {
  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("projected_knockout_source")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && !isMissingProjectedKnockoutSourceSchemaError(error.message)) {
    throw new Error(error.message);
  }

  return normalizeProjectedKnockoutSource((data as UserSettingsSourceRow | null)?.projected_knockout_source);
}

export async function setUserProjectedKnockoutSource(
  adminSupabase: AdminSupabaseClient,
  userId: string,
  source: ProjectedKnockoutSource
): Promise<void> {
  const { error } = await adminSupabase
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        projected_knockout_source: source
      },
      { onConflict: "user_id" }
    );

  if (error && !isMissingProjectedKnockoutSourceSchemaError(error.message)) {
    throw new Error(error.message);
  }
}

export async function loadProjectedRoundOf32FromPreferredSource(
  adminSupabase: AdminSupabaseClient,
  userId: string
) {
  const inputs = await loadProjectedRoundOf32Inputs(adminSupabase, userId);

  return {
    source: "seed_builder" as const,
    inputs,
    projectedSeeds: buildSeedBuilderProjectedRoundOf32(inputs)
  };
}

export async function fetchProjectedKnockoutConflictStatus(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<ProjectedKnockoutConflictStatus> {
  const [currentSource, inputs] = await Promise.all([
    fetchUserProjectedKnockoutSource(adminSupabase, userId),
    loadProjectedRoundOf32Inputs(adminSupabase, userId)
  ]);
  const hasScorePredictions = inputs.predictions.some(
    (prediction) =>
      prediction.predictedHomeScore !== null &&
      prediction.predictedHomeScore !== undefined &&
      prediction.predictedAwayScore !== null &&
      prediction.predictedAwayScore !== undefined
  );

  if (!inputs.hasSavedSnapshot || !hasScorePredictions) {
    return {
      hasConflict: false,
      currentSource,
      hasSavedSnapshot: inputs.hasSavedSnapshot,
      hasScorePredictions,
      scoreResolvedSideCount: 0,
      seedResolvedSideCount: 0
    };
  }

  const seedBuilderProjected = buildSeedBuilderProjectedRoundOf32(inputs);
  const scoreProjected = buildScorePredictionProjectedRoundOf32(inputs);

  return {
    hasConflict: compareProjectedRoundOf32Matches(seedBuilderProjected.matches, scoreProjected.matches),
    currentSource,
    hasSavedSnapshot: inputs.hasSavedSnapshot,
    hasScorePredictions,
    scoreResolvedSideCount: scoreProjected.resolvedSideCount,
    seedResolvedSideCount: seedBuilderProjected.resolvedSideCount
  };
}

function buildSeedBuilderProjectedRoundOf32(inputs: ProjectedRoundOf32Inputs) {
  const standingsByGroup = buildProjectedGroupStandingsFromSeedRankings(
    inputs.teams,
    inputs.snapshotGroupRankings
  );

  return buildUserProjectedRoundOf32({
    groupMatches: [],
    teams: inputs.teams,
    predictions: [],
    roundOf32Placeholders: inputs.roundOf32Placeholders,
    standingsByGroupOverride: standingsByGroup,
    rankedThirdPlaceTeamIdsOverride: inputs.snapshotThirdPlaceTeamIds
  });
}

function buildScorePredictionProjectedRoundOf32(inputs: ProjectedRoundOf32Inputs) {
  return buildUserProjectedRoundOf32({
    groupMatches: inputs.groupMatches,
    teams: inputs.teams,
    predictions: inputs.predictions,
    roundOf32Placeholders: inputs.roundOf32Placeholders
  });
}

async function loadProjectedRoundOf32Inputs(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<ProjectedRoundOf32Inputs> {
  const [{ data: teamRows, error: teamError }, { data: matchRows, error: matchError }, { data: predictionRows, error: predictionError }, lightSeedSnapshot] =
    await Promise.all([
      adminSupabase.from("teams").select("id,name,short_name,flag_emoji,group_name,fifa_rank"),
      adminSupabase
        .from("matches")
        .select("id,stage,status,group_name,home_team_id,away_team_id,home_score,away_score,home_source,away_source"),
      adminSupabase
        .from("predictions")
        .select("match_id,predicted_home_score,predicted_away_score")
        .eq("user_id", userId),
      fetchUserLightSeedBuilderSnapshot(adminSupabase, userId).catch(() => null)
    ]);

  if (teamError) {
    throw new Error(teamError.message);
  }

  if (matchError) {
    throw new Error(matchError.message);
  }

  if (predictionError) {
    throw new Error(predictionError.message);
  }

  const teams = ((teamRows ?? []) as TeamRow[]).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name || team.name || team.id,
    flagEmoji: team.flag_emoji || "",
    groupName: team.group_name ?? "",
    fifaRank: team.fifa_rank ?? 0
  }));

  const matches = (matchRows ?? []) as MatchRow[];
  const groupMatches = matches
    .filter((match) => match.stage === "group")
    .map(
      (match) =>
        ({
          id: match.id,
          stage: match.stage,
          groupName: match.group_name ?? null,
          status: match.status,
          homeTeamId: match.home_team_id ?? null,
          awayTeamId: match.away_team_id ?? null,
          homeScore: match.home_score ?? null,
          awayScore: match.away_score ?? null
        }) satisfies GroupStageMatchForSeeding
    );
  const roundOf32Placeholders = matches
    .filter((match) => match.stage === "r32" || match.stage === "round_of_32")
    .map(
      (match) =>
        ({
          id: match.id,
          stage: match.stage,
          status: match.status,
          homeSource: match.home_source ?? null,
          awaySource: match.away_source ?? null,
          homeTeamId: match.home_team_id ?? null,
          awayTeamId: match.away_team_id ?? null
        }) satisfies KnockoutPlaceholderMatch
    );
  const predictions = ((predictionRows ?? []) as PredictionRow[]).map((row) => ({
    matchId: row.match_id,
    predictedHomeScore: row.predicted_home_score ?? null,
    predictedAwayScore: row.predicted_away_score ?? null
  }));
  const savedSnapshot = lightSeedSnapshot && lightSeedSnapshot.groupRankings.length > 0 ? lightSeedSnapshot : null;
  const hasSavedSnapshot = Boolean(savedSnapshot);

  return {
    teams,
    groupMatches,
    predictions,
    roundOf32Placeholders,
    hasSavedSnapshot,
    snapshotGroupRankings: savedSnapshot ? savedSnapshot.groupRankings : [],
    snapshotThirdPlaceTeamIds: savedSnapshot
      ? [...savedSnapshot.thirdPlaceRankings]
          .sort((left, right) => left.rank - right.rank)
          .map((row) => row.teamId)
      : []
  };
}

function compareProjectedRoundOf32Matches(
  leftMatches: Array<{ matchId: string; home: { teamId: string | null }; away: { teamId: string | null } }>,
  rightMatches: Array<{ matchId: string; home: { teamId: string | null }; away: { teamId: string | null } }>
) {
  const rightByMatchId = new Map(rightMatches.map((match) => [match.matchId, match]));

  for (const leftMatch of leftMatches) {
    const rightMatch = rightByMatchId.get(leftMatch.matchId);
    if (!rightMatch) {
      continue;
    }

    const leftHasResolvedSide = Boolean(leftMatch.home.teamId || leftMatch.away.teamId);
    const rightHasResolvedSide = Boolean(rightMatch.home.teamId || rightMatch.away.teamId);
    if (!leftHasResolvedSide && !rightHasResolvedSide) {
      continue;
    }

    if (
      leftMatch.home.teamId !== rightMatch.home.teamId ||
      leftMatch.away.teamId !== rightMatch.away.teamId
    ) {
      return true;
    }
  }

  return false;
}

function normalizeProjectedKnockoutSource(value?: string | null): ProjectedKnockoutSource {
  return value === "score_predictions" ? "score_predictions" : "seed_builder";
}

function isMissingProjectedKnockoutSourceSchemaError(message?: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("projected_knockout_source") ||
    normalized.includes("user_settings") && normalized.includes("schema cache") ||
    normalized.includes("relation \"user_settings\" does not exist") ||
    normalized.includes("relation \"public.user_settings\" does not exist")
  );
}
