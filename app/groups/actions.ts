"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeGroupKey } from "@/lib/group-standings";
import {
  buildProjectedGroupStandingsFromSeedRankings,
  buildQualifiedTeamSeeds,
  buildQualifiedTeamSeedsFromManualThirdPlaceRanking,
  getRequiredThirdPlaceQualifierCount,
  resolveRoundOf32SeedAssignments,
  type GroupSeedRankingInput
} from "@/lib/knockout-seeding";
import { canEditPrediction, getPredictionStateLabel } from "@/lib/prediction-state";
import type { Prediction } from "@/lib/types";

type SavePredictionInput = {
  matchId: string;
  predictedHomeScore?: number;
  predictedAwayScore?: number;
};

type MatchRow = {
  id: string;
  home_team_id?: string | null;
  away_team_id?: string | null;
  kickoff_time: string;
  status: "scheduled" | "locked" | "live" | "final";
};

type KnockoutPlaceholderRow = {
  id: string;
  stage: string;
  status: "scheduled" | "locked" | "live" | "final";
  home_source?: string | null;
  away_source?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  group_name: string;
  fifa_rank?: number | null;
  flag_emoji?: string | null;
};

export type SavePredictionResult =
  | {
      ok: true;
      prediction: Prediction;
    }
  | {
      ok: false;
      message: string;
    };

export type SaveLightSeedBuilderInput = {
  groupRankings: Array<{
    groupName: string;
    rankedTeamIds: string[];
  }>;
  rankedThirdPlaceTeamIds: string[];
};

export type SaveLightSeedBuilderResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      message: string;
    };

export async function saveGroupPredictionAction(input: SavePredictionInput): Promise<SavePredictionResult> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();
  const { data: existingPrediction, error: existingPredictionError } = await adminSupabase
    .from("predictions")
    .select("id,predicted_home_score,predicted_away_score,predicted_winner_team_id,predicted_is_draw,updated_at")
    .eq("user_id", userResult.userId)
    .eq("match_id", input.matchId)
    .maybeSingle();

  if (existingPredictionError) {
    console.warn("Could not load existing prediction before save.", {
      userId: userResult.userId,
      matchId: input.matchId,
      message: existingPredictionError.message
    });
  }

  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,home_team_id,away_team_id,kickoff_time,status")
    .eq("id", input.matchId)
    .single();

  if (matchError) {
    return { ok: false, message: matchError.message };
  }

  const matchRow = match as MatchRow;
  if (!canEditPrediction(matchRow.status)) {
    return {
      ok: false,
      message: `This pick is ${getPredictionStateLabel(matchRow.status).toLowerCase()} and can no longer be edited.`
    };
  }

  const derivedOutcome = deriveOutcome(matchRow, input.predictedHomeScore, input.predictedAwayScore);
  console.info("Group prediction save requested.", {
    userId: userResult.userId,
    matchId: matchRow.id,
    action: existingPrediction?.id ? "update" : "create",
    previousHomeScore: existingPrediction?.predicted_home_score ?? null,
    previousAwayScore: existingPrediction?.predicted_away_score ?? null,
    nextHomeScore: input.predictedHomeScore ?? null,
    nextAwayScore: input.predictedAwayScore ?? null,
    previousWinnerTeamId: existingPrediction?.predicted_winner_team_id ?? null,
    nextWinnerTeamId: derivedOutcome.predictedWinnerTeamId,
    previousIsDraw: existingPrediction?.predicted_is_draw ?? null,
    nextIsDraw: derivedOutcome.predictedIsDraw
  });

  const { data, error } = await adminSupabase
    .from("predictions")
    .upsert(
      {
        user_id: userResult.userId,
        match_id: matchRow.id,
        predicted_winner_team_id: derivedOutcome.predictedWinnerTeamId,
        predicted_is_draw: derivedOutcome.predictedIsDraw,
        predicted_home_score: input.predictedHomeScore ?? null,
        predicted_away_score: input.predictedAwayScore ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,match_id" }
    )
    .select(
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded,updated_at"
    )
    .single();

  if (error) {
    console.error("Group prediction save failed.", {
      userId: userResult.userId,
      matchId: matchRow.id,
      action: existingPrediction?.id ? "update" : "create",
      nextHomeScore: input.predictedHomeScore ?? null,
      nextAwayScore: input.predictedAwayScore ?? null,
      message: error.message
    });
    return { ok: false, message: error.message };
  }

  console.info("Group prediction save completed.", {
    userId: userResult.userId,
    matchId: data.match_id,
    action: existingPrediction?.id ? "update" : "create",
    predictionId: data.id,
    savedHomeScore: data.predicted_home_score ?? null,
    savedAwayScore: data.predicted_away_score ?? null,
    savedWinnerTeamId: data.predicted_winner_team_id ?? null,
    savedIsDraw: data.predicted_is_draw,
    previousUpdatedAt: existingPrediction?.updated_at ?? null,
    savedUpdatedAt: data.updated_at ?? null
  });

  return {
    ok: true,
    prediction: {
      id: data.id,
      userId: data.user_id,
      matchId: data.match_id,
      predictedWinnerTeamId: data.predicted_winner_team_id ?? undefined,
      predictedIsDraw: data.predicted_is_draw,
      predictedHomeScore: data.predicted_home_score ?? undefined,
      predictedAwayScore: data.predicted_away_score ?? undefined,
      pointsAwarded: data.points_awarded ?? 0,
      updatedAt: data.updated_at ?? undefined
    }
  };
}

export async function saveLightSeedBuilderAction(
  input: SaveLightSeedBuilderInput
): Promise<SaveLightSeedBuilderResult> {
  const userResult = await getCurrentUserId();
  if (!userResult.ok) {
    return userResult;
  }

  const adminSupabase = createAdminClient();

  const [{ data: teamRows, error: teamError }, { data: roundOf32Rows, error: roundOf32Error }] = await Promise.all([
    adminSupabase.from("teams").select("id,name,short_name,group_name,fifa_rank,flag_emoji"),
    adminSupabase
      .from("matches")
      .select("id,stage,status,home_source,away_source")
      .in("stage", ["r32", "round_of_32"])
      .order("kickoff_time", { ascending: true })
  ]);

  if (teamError || roundOf32Error) {
    return {
      ok: false,
      message: teamError?.message ?? roundOf32Error?.message ?? "Could not load tournament seeding data."
    };
  }

  try {
    const teams = ((teamRows ?? []) as TeamRow[]).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      groupName: team.group_name,
      fifaRank: team.fifa_rank ?? 0,
      flagEmoji: team.flag_emoji ?? ""
    }));
    const rankings: GroupSeedRankingInput[] = input.groupRankings.map((ranking) => ({
      groupName: normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
      rankedTeamIds: ranking.rankedTeamIds
    }));
    const standingsByGroup = buildProjectedGroupStandingsFromSeedRankings(teams, rankings);
    const requiredThirdPlaceCount = getRequiredThirdPlaceQualifierCount(
      ((roundOf32Rows ?? []) as KnockoutPlaceholderRow[]).map((match) => ({
        id: match.id,
        stage: match.stage,
        status: match.status,
        homeSource: match.home_source ?? null,
        awaySource: match.away_source ?? null,
        homeTeamId: null,
        awayTeamId: null
      }))
    );
    const completeRowsByGroup = new Map(
      Array.from(standingsByGroup.entries()).map(([groupId, standings]) => [groupId, standings.rows])
    );
    const availableThirdPlacePool = buildQualifiedTeamSeeds(completeRowsByGroup, completeRowsByGroup.size).rankedThirdPlaceTeams;
    const availableThirdPlaceTeamIds = new Set(availableThirdPlacePool.map((team) => team.teamId));
    const requestedThirdPlaceIds = Array.from(new Set(input.rankedThirdPlaceTeamIds));

    if (requestedThirdPlaceIds.length !== input.rankedThirdPlaceTeamIds.length) {
      return { ok: false, message: "Each third-place qualifier can only be ranked once." };
    }

    if (requestedThirdPlaceIds.some((teamId) => !availableThirdPlaceTeamIds.has(teamId))) {
      return { ok: false, message: "Only teams ranked 3rd in their group can be selected as third-place qualifiers." };
    }

    if (requestedThirdPlaceIds.length > requiredThirdPlaceCount) {
      return { ok: false, message: `Rank no more than ${requiredThirdPlaceCount} third-place qualifiers before saving.` };
    }

    if (requestedThirdPlaceIds.length === requiredThirdPlaceCount) {
      const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeedsFromManualThirdPlaceRanking(
        completeRowsByGroup,
        requestedThirdPlaceIds,
        requiredThirdPlaceCount
      );

      resolveRoundOf32SeedAssignments(
        ((roundOf32Rows ?? []) as KnockoutPlaceholderRow[]).map((match) => ({
          id: match.id,
          stage: match.stage,
          status: match.status,
          homeSource: match.home_source ?? null,
          awaySource: match.away_source ?? null,
          homeTeamId: null,
          awayTeamId: null
        })),
        automaticQualifiers,
        rankedThirdPlaceTeams
      );
    }

    await adminSupabase.from("user_group_seed_rankings").delete().eq("user_id", userResult.userId);
    await adminSupabase.from("user_best_third_rankings").delete().eq("user_id", userResult.userId);

    const rankingRows = rankings.flatMap((ranking) =>
      ranking.rankedTeamIds.map((teamId, index) => ({
        user_id: userResult.userId,
        group_name: ranking.groupName,
        team_id: teamId,
        rank_position: index + 1,
        updated_at: new Date().toISOString()
      }))
    );
    const thirdPlaceRows = requestedThirdPlaceIds.map((teamId, index) => ({
      user_id: userResult.userId,
      team_id: teamId,
      rank_position: index + 1,
      updated_at: new Date().toISOString()
    }));

    if (rankingRows.length > 0) {
      const { error: insertRankingError } = await adminSupabase.from("user_group_seed_rankings").insert(rankingRows);
      if (insertRankingError) {
        return { ok: false, message: insertRankingError.message };
      }
    }

    if (thirdPlaceRows.length > 0) {
      const { error: insertThirdPlaceError } = await adminSupabase.from("user_best_third_rankings").insert(thirdPlaceRows);
      if (insertThirdPlaceError) {
        return { ok: false, message: insertThirdPlaceError.message };
      }
    }

    revalidatePath("/groups");
    revalidatePath("/bracket-builder");
    revalidatePath("/knockout");

    return {
      ok: true,
      message:
        requestedThirdPlaceIds.length === requiredThirdPlaceCount
          ? "Your bracket build is saved."
          : "Your bracket build progress is saved."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not save your Simple Results rankings."
    };
  }
}

async function getCurrentUserId(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, message: "You must be signed in to save picks." };
  }

  return { ok: true, userId: user.id };
}

function deriveOutcome(
  match: MatchRow,
  predictedHomeScore: number | undefined,
  predictedAwayScore: number | undefined
) {
  if (predictedHomeScore === undefined || predictedAwayScore === undefined) {
    return {
      predictedWinnerTeamId: null,
      predictedIsDraw: false
    };
  }

  if (predictedHomeScore === predictedAwayScore) {
    return {
      predictedWinnerTeamId: null,
      predictedIsDraw: true
    };
  }

  return {
    predictedWinnerTeamId:
      predictedHomeScore > predictedAwayScore ? match.home_team_id ?? null : match.away_team_id ?? null,
    predictedIsDraw: false
  };
}
