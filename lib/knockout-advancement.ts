import { createAdminClient } from "@/lib/supabase/admin";
import { isKnockoutStage, normalizeKnockoutStage } from "@/lib/match-stage";
import { shouldClearKnockoutParticipants } from "@/lib/knockout-advancement-logic";
import {
  buildGroupStandingsByGroup,
  buildQualifiedTeamSeeds,
  getRequiredThirdPlaceQualifierCount,
  resolveRoundOf32SeedAssignments,
  type GroupStageMatchForSeeding,
  type KnockoutPlaceholderMatch
} from "@/lib/knockout-seeding";
import type { MatchNextSlot, MatchStage } from "@/lib/types";
import type { Team } from "@/lib/types";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type MatchRow = {
  id: string;
  stage: MatchStage;
  status: "scheduled" | "locked" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  next_match_id?: string | null;
  next_match_slot?: MatchNextSlot | null;
  updated_at?: string | null;
};

type KnockoutAdvancementUpdate = {
  matchId: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
};

export type KnockoutAdvancementSummary = {
  populatedSlots: number;
  updatedSlots: number;
  touchedMatches: number;
  clearedPredictions: number;
  clearedScores: number;
};

export async function rebuildKnockoutAdvancementWithClient(
  adminSupabase: AdminSupabaseClient
): Promise<KnockoutAdvancementSummary> {
  const [
    { data, error },
    { data: groupMatchRows, error: groupMatchesError },
    { data: teamRows, error: teamsError }
  ] = await Promise.all([
    adminSupabase
      .from("matches")
      .select(
        "id,stage,status,home_team_id,away_team_id,home_source,away_source,kickoff_time,home_score,away_score,winner_team_id,next_match_id,next_match_slot,updated_at"
      )
      .neq("stage", "group")
      .order("kickoff_time", { ascending: true }),
    adminSupabase
      .from("matches")
      .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score")
      .eq("stage", "group")
      .order("kickoff_time", { ascending: true }),
    adminSupabase
      .from("teams")
      .select("id,name,short_name,group_name,fifa_rank,flag_emoji")
      .order("group_name", { ascending: true })
      .order("name", { ascending: true })
  ]);

  if (error) {
    throw error;
  }
  if (groupMatchesError) {
    throw groupMatchesError;
  }
  if (teamsError) {
    throw teamsError;
  }

  const knockoutMatches = ((data ?? []) as MatchRow[]).filter((match) => isKnockoutStage(match.stage));
  const matchesById = new Map(knockoutMatches.map((match) => [match.id, { ...match }]));
  const updatesByMatchId = new Map<string, KnockoutAdvancementUpdate>();
  const stalePredictionMatchIds = new Set<string>();
  let populatedSlots = 0;
  let updatedSlots = 0;

  const assignTeamToSlot = (matchId: string, slot: MatchNextSlot, teamId: string | null | undefined) => {
    const match = matchesById.get(matchId);
    if (!match) {
      return;
    }

    const targetField = slot === "home" ? "home_team_id" : "away_team_id";
    const currentValue = match[targetField] ?? null;
    const nextValue = teamId ?? null;
    if (currentValue === nextValue) {
      return;
    }

    if (match.status !== "final") {
      stalePredictionMatchIds.add(matchId);
    }

    if (currentValue) {
      updatedSlots += 1;
    } else if (nextValue) {
      populatedSlots += 1;
    }

    match[targetField] = nextValue;
    const currentUpdate = updatesByMatchId.get(matchId) ?? { matchId };
    if (slot === "home") {
      currentUpdate.homeTeamId = nextValue;
    } else {
      currentUpdate.awayTeamId = nextValue;
    }
    updatesByMatchId.set(matchId, currentUpdate);
  };

  const roundOf32Matches = knockoutMatches.filter((match) => normalizeKnockoutStage(match.stage) === "r32");
  const hasMissingRoundOf32Teams = roundOf32Matches.some((match) => !match.home_team_id || !match.away_team_id);
  const mappedGroupMatches = ((groupMatchRows ?? []) as Array<{
    id: string;
    stage: MatchStage;
    group_name?: string | null;
    status: "scheduled" | "locked" | "live" | "final";
    home_team_id?: string | null;
    away_team_id?: string | null;
    home_score?: number | null;
    away_score?: number | null;
  }>).map((match) => ({
    id: match.id,
    stage: match.stage,
    groupName: match.group_name ?? null,
    status: match.status,
    homeTeamId: match.home_team_id ?? null,
    awayTeamId: match.away_team_id ?? null,
    homeScore: match.home_score ?? null,
    awayScore: match.away_score ?? null
  })) satisfies GroupStageMatchForSeeding[];
  const allGroupMatchesFinal =
    mappedGroupMatches.length > 0 && mappedGroupMatches.every((match) => match.status === "final");

  if (hasMissingRoundOf32Teams && allGroupMatchesFinal) {
    const mappedTeams: Team[] = ((teamRows ?? []) as Array<{
      id: string;
      name: string;
      short_name: string;
      group_name: string;
      fifa_rank: number | null;
      flag_emoji: string | null;
    }>).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name,
      groupName: team.group_name,
      fifaRank: team.fifa_rank ?? 0,
      flagEmoji: team.flag_emoji ?? ""
    }));
    const placeholders = roundOf32Matches.map((match) => ({
      id: match.id,
      stage: match.stage,
      homeSource: match.home_source ?? null,
      awaySource: match.away_source ?? null,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      status: match.status
    })) satisfies KnockoutPlaceholderMatch[];
    const standingsByGroup = buildGroupStandingsByGroup(mappedGroupMatches, mappedTeams);
    const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(placeholders);
    const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(
      standingsByGroup,
      requiredThirdPlaceQualifierCount || 8
    );
    const seedAssignments = resolveRoundOf32SeedAssignments(
      placeholders,
      automaticQualifiers,
      rankedThirdPlaceTeams
    );

    for (const assignment of seedAssignments) {
      assignTeamToSlot(assignment.matchId, "home", assignment.homeTeamId);
      assignTeamToSlot(assignment.matchId, "away", assignment.awayTeamId);
    }
  }

  for (const match of knockoutMatches) {
    if (!shouldClearKnockoutParticipants(match)) {
      continue;
    }

    if (match.home_team_id) {
      assignTeamToSlot(match.id, "home", null);
    }
    if (match.away_team_id) {
      assignTeamToSlot(match.id, "away", null);
    }
  }

  for (const match of knockoutMatches) {
    if (match.status !== "final" || !match.winner_team_id || !match.next_match_id || !match.next_match_slot) {
      continue;
    }

    assignTeamToSlot(match.next_match_id, match.next_match_slot, match.winner_team_id);
  }

  const thirdPlaceMatch = knockoutMatches.find((match) => normalizeKnockoutStage(match.stage) === "third") ?? null;
  const semifinalMatches = knockoutMatches
    .filter((match) => normalizeKnockoutStage(match.stage) === "sf")
    .sort((a, b) => {
      const kickoffCompare = (a.kickoff_time ?? "").localeCompare(b.kickoff_time ?? "");
      return kickoffCompare !== 0 ? kickoffCompare : a.id.localeCompare(b.id);
    });

  if (thirdPlaceMatch && semifinalMatches.length >= 2) {
    semifinalMatches.slice(0, 2).forEach((match, index) => {
      if (match.status !== "final" || !match.winner_team_id || !match.home_team_id || !match.away_team_id) {
        return;
      }

      const loserTeamId = match.home_team_id === match.winner_team_id ? match.away_team_id : match.home_team_id;
      assignTeamToSlot(thirdPlaceMatch.id, index === 0 ? "home" : "away", loserTeamId);
    });
  }

  const touchedMatches = updatesByMatchId.size;
  if (touchedMatches === 0) {
    return { populatedSlots: 0, updatedSlots: 0, touchedMatches: 0, clearedPredictions: 0, clearedScores: 0 };
  }

  const updatedAt = new Date().toISOString();
  for (const update of updatesByMatchId.values()) {
    const payload: { updated_at: string; home_team_id?: string | null; away_team_id?: string | null } = { updated_at: updatedAt };
    if (typeof update.homeTeamId !== "undefined") {
      payload.home_team_id = update.homeTeamId;
    }
    if (typeof update.awayTeamId !== "undefined") {
      payload.away_team_id = update.awayTeamId;
    }

    const { error: updateError } = await adminSupabase.from("matches").update(payload).eq("id", update.matchId);
    if (updateError) {
      throw updateError;
    }
  }

  let clearedPredictions = 0;
  let clearedScores = 0;
  if (stalePredictionMatchIds.size > 0) {
    const staleMatchIds = Array.from(stalePredictionMatchIds);

    const { count: predictionCount, error: predictionCountError } = await adminSupabase
      .from("bracket_predictions")
      .select("id", { count: "exact", head: true })
      .in("match_id", staleMatchIds);
    if (predictionCountError) {
      throw predictionCountError;
    }

    const { count: scoreCount, error: scoreCountError } = await adminSupabase
      .from("bracket_scores")
      .select("id", { count: "exact", head: true })
      .in("match_id", staleMatchIds);
    if (scoreCountError) {
      throw scoreCountError;
    }

    const { error: deletePredictionsError } = await adminSupabase.from("bracket_predictions").delete().in("match_id", staleMatchIds);
    if (deletePredictionsError) {
      throw deletePredictionsError;
    }

    const { error: deleteScoresError } = await adminSupabase.from("bracket_scores").delete().in("match_id", staleMatchIds);
    if (deleteScoresError) {
      throw deleteScoresError;
    }

    clearedPredictions = predictionCount ?? 0;
    clearedScores = scoreCount ?? 0;
  }

  return {
    populatedSlots,
    updatedSlots,
    touchedMatches,
    clearedPredictions,
    clearedScores
  };
}
