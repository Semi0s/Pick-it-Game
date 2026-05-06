import "server-only";

import { scoreBracketPrediction } from "@/lib/bracket-scoring";
import { formatSafeSupabaseError, logSafeSupabaseError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPECTED_KNOCKOUT_MATCH_COUNTS,
  formatMatchStage,
  isKnockoutStage,
  isRoundOf32Stage,
  normalizeKnockoutStage,
  type CanonicalKnockoutStage
} from "@/lib/match-stage";
import {
  buildUserProjectedRoundOf32,
  type ProjectedMatchScoreSource
} from "@/lib/knockout-seeding";
import type {
  BracketPrediction,
  BracketScore,
  MatchNextSlot,
  MatchStage,
  MatchStatus
} from "@/lib/types";

type MatchRow = {
  id: string;
  stage: MatchStage;
  kickoff_time: string;
  status: MatchStatus;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_source?: string | null;
  away_source?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
  next_match_id?: string | null;
  next_match_slot?: MatchNextSlot | null;
};

type BracketPredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  predicted_winner_team_id: string;
  created_at: string;
  updated_at: string;
};

type BracketScoreRow = {
  id: string;
  user_id: string;
  match_id: string;
  stage: MatchStage;
  predicted_winner_team_id: string;
  actual_winner_team_id: string;
  round_points: number;
  champion_points: number;
  points: number | null;
  is_correct: boolean;
  scored_at: string;
};

type GroupRow = {
  id: string;
  name: string;
  status?: string | null;
};

type GroupMemberRow = {
  group_id: string;
  user_id: string;
  user?:
    | { id: string; name: string; avatar_url?: string | null }
    | Array<{ id: string; name: string; avatar_url?: string | null }>
    | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
  flag_emoji?: string | null;
  group_name?: string | null;
  fifa_rank?: number | null;
};

type GroupPredictionRow = {
  match_id: string;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
};

type BracketEditState =
  | { editable: true; firstRoundOf32Kickoff: string }
  | { editable: false; reason: "not_seeded" | "locked"; firstRoundOf32Kickoff: string | null };

export type KnockoutStructureStatus = {
  counts: Record<CanonicalKnockoutStage, number>;
  isFullySeeded: boolean;
  firstRoundOf32Kickoff: string | null;
};

export type BracketHealthStatus = "alive" | "at_risk" | "eliminated";

export type GroupBracketComparisonMember = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  championPickName: string | null;
  championPickCount: number;
  isUniqueChampionPick: boolean;
  finalistNames: string[];
  status: BracketHealthStatus;
};

export type GroupBracketDetailMatch = {
  matchId: string;
  stage: CanonicalKnockoutStage;
  stageLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  predictedWinnerName: string | null;
  actualWinnerName: string | null;
  status: MatchStatus;
};

export type GroupBracketDetailView = {
  userId: string;
  name: string;
  championPickName: string | null;
  finalistNames: string[];
  status: BracketHealthStatus;
  matches: GroupBracketDetailMatch[];
};

export type GroupBracketComparisonView = {
  groups: Array<{ id: string; name: string }>;
  selectedGroupId: string | null;
  selectedGroupName: string | null;
  selectedPlayerId: string | null;
  mostPickedChampion:
    | {
        name: string;
        count: number;
      }
    | null;
  members: GroupBracketComparisonMember[];
  selectedPlayerBracket: GroupBracketDetailView | null;
};

export type BracketTeamOption = {
  id: string;
  name: string;
  shortName: string;
  flagEmoji?: string;
  groupName?: string | null;
};

export type KnockoutBracketMatchView = {
  matchId: string;
  stage: CanonicalKnockoutStage;
  stageLabel: string;
  title: string;
  kickoffTime: string;
  status: MatchStatus;
  seededHomeTeam: BracketTeamOption | null;
  seededAwayTeam: BracketTeamOption | null;
  homeSourceMatchId: string | null;
  awaySourceMatchId: string | null;
  homeSourceLabel: string | null;
  awaySourceLabel: string | null;
  homeTeam: BracketTeamOption | null;
  awayTeam: BracketTeamOption | null;
  homeScore: number | null;
  awayScore: number | null;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  savedHomeScore: number | null;
  savedAwayScore: number | null;
  predictedWinnerTeamId: string | null;
  savedWinnerTeamId: string | null;
  savedAt: string | null;
  actualWinnerTeamId: string | null;
  awardedPoints: number | null;
  exactScorePoints: number | null;
  isCorrectWinner: boolean | null;
  isLocked: boolean;
  canSelectWinner: boolean;
  viewMode: "official" | "projected";
  homeResolutionSource: ProjectedMatchScoreSource;
  awayResolutionSource: ProjectedMatchScoreSource;
};

export type KnockoutBracketStageView = {
  stage: CanonicalKnockoutStage;
  label: string;
  matches: KnockoutBracketMatchView[];
};

export type KnockoutBracketEditorView = {
  mode: "official" | "projected";
  isSeeded: boolean;
  isLocked: boolean;
  lockReason: "not_seeded" | "locked" | null;
  firstRoundOf32Kickoff: string | null;
  bracketPoints: number;
  correctPicks: number;
  stages: KnockoutBracketStageView[];
  champion: BracketTeamOption | null;
  thirdPlace: KnockoutBracketMatchView | null;
  predictions: BracketPrediction[];
  title: string;
  description: string;
  secondaryNote?: string | null;
};

export type BracketScoreSummary = {
  bracketPoints: number;
  correctPicks: number;
};

export function safeFetchKnockoutStructureStatusFallback(): KnockoutStructureStatus {
  return {
    counts: {
      r32: 0,
      r16: 0,
      qf: 0,
      sf: 0,
      third: 0,
      final: 0
    },
    isFullySeeded: false,
    firstRoundOf32Kickoff: null
  };
}

export async function canEditBracketPredictions() {
  const adminSupabase = createAdminClient();
  const editState = await getBracketEditState(adminSupabase);
  return editState.editable;
}

export async function fetchUserBracketPredictions(userId: string): Promise<BracketPrediction[]> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("bracket_predictions")
    .select("id,user_id,match_id,predicted_home_score,predicted_away_score,predicted_winner_team_id,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    logSafeSupabaseError("fetch-user-bracket-predictions", error, { userId });
    throw formatSafeSupabaseError(error, "Could not load bracket predictions.", "Bracket predictions");
  }

  return ((data ?? []) as BracketPredictionRow[]).map(mapBracketPredictionRow);
}

export async function saveBracketPrediction(
  userId: string,
  input: {
    matchId: string;
    homeScore: number;
    awayScore: number;
    teamId?: string | null;
  }
): Promise<BracketPrediction> {
  const adminSupabase = createAdminClient();
  const editState = await getBracketEditState(adminSupabase);
  if (!editState.editable) {
    throw new Error("Knockout picks are not available until the Round of 32 is seeded.");
  }

  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,stage,kickoff_time,status,home_team_id,away_team_id,home_source,away_source,winner_team_id,next_match_id,next_match_slot")
    .eq("id", input.matchId)
    .single();

  if (matchError) {
    throw matchError;
  }

  const matchRow = match as MatchRow;
  if (!isKnockoutStage(matchRow.stage)) {
    throw new Error("Bracket picks can only be saved for knockout matches.");
  }

  if (isKnockoutMatchLocked(matchRow)) {
    throw new Error(`This ${formatMatchStage(matchRow.stage).toLowerCase()} match is locked because kickoff has passed.`);
  }

  const { data: allKnockoutMatches, error: allKnockoutMatchesError } = await adminSupabase
    .from("matches")
    .select("id,stage,kickoff_time,status,home_team_id,away_team_id,home_source,away_source,winner_team_id,next_match_id,next_match_slot")
    .neq("stage", "group");

  if (allKnockoutMatchesError) {
    throw allKnockoutMatchesError;
  }

  const knockoutMatches = ((allKnockoutMatches ?? []) as MatchRow[]).filter((candidate) => isKnockoutStage(candidate.stage));
  const previousMatchesByNextMatchId = buildPreviousMatchesByNextMatchId(knockoutMatches);
  const { data: predictionRows, error: predictionRowsError } = await adminSupabase
    .from("bracket_predictions")
    .select("id,user_id,match_id,predicted_home_score,predicted_away_score,predicted_winner_team_id,created_at,updated_at")
    .eq("user_id", userId);

  if (predictionRowsError) {
    throw predictionRowsError;
  }

  const predictionsByMatchId = new Map(
    ((predictionRows ?? []) as BracketPredictionRow[]).map((row) => [row.match_id, mapBracketPredictionRow(row)])
  );
  const availableTeamIds = getAvailableKnockoutTeamIdsForMatch(
    matchRow,
    previousMatchesByNextMatchId,
    predictionsByMatchId,
    "official"
  );

  if (!availableTeamIds.homeTeamId || !availableTeamIds.awayTeamId) {
    throw new Error(`This ${formatMatchStage(matchRow.stage).toLowerCase()} match is not fully seeded yet.`);
  }

  const homeScore = normalizeBracketScore(input.homeScore);
  const awayScore = normalizeBracketScore(input.awayScore);
  const inferredWinnerTeamId = inferBracketWinnerTeamId({
    homeScore,
    awayScore,
    homeTeamId: availableTeamIds.homeTeamId,
    awayTeamId: availableTeamIds.awayTeamId,
    explicitWinnerTeamId: input.teamId ?? null
  });

  if (!inferredWinnerTeamId) {
    throw new Error("Choose who advances by tapping a team name or flag.");
  }

  const now = new Date().toISOString();
  const { data: existingPrediction, error: existingPredictionError } = await adminSupabase
    .from("bracket_predictions")
    .select("id")
    .eq("user_id", userId)
    .eq("match_id", input.matchId)
    .maybeSingle();

  if (existingPredictionError) {
    throw existingPredictionError;
  }

  let savedPrediction: BracketPrediction;
  if ((existingPrediction as { id?: string } | null)?.id) {
    const { data, error } = await adminSupabase
      .from("bracket_predictions")
      .update({
        predicted_home_score: homeScore,
        predicted_away_score: awayScore,
        predicted_winner_team_id: inferredWinnerTeamId,
        updated_at: now
      })
      .eq("id", (existingPrediction as { id: string }).id)
      .select("id,user_id,match_id,predicted_home_score,predicted_away_score,predicted_winner_team_id,created_at,updated_at")
      .single();

    if (error) {
      throw error;
    }

    savedPrediction = mapBracketPredictionRow(data as BracketPredictionRow);
  } else {
    const { data, error } = await adminSupabase
      .from("bracket_predictions")
      .insert({
        user_id: userId,
        match_id: input.matchId,
        predicted_home_score: homeScore,
        predicted_away_score: awayScore,
        predicted_winner_team_id: inferredWinnerTeamId,
        updated_at: now
      })
      .select("id,user_id,match_id,predicted_home_score,predicted_away_score,predicted_winner_team_id,created_at,updated_at")
      .single();

    if (error) {
      throw error;
    }

    savedPrediction = mapBracketPredictionRow(data as BracketPredictionRow);
  }

  await clearInvalidDescendantPredictions(adminSupabase, userId, input.matchId);
  return savedPrediction;
}

export async function fetchKnockoutStructureStatus(): Promise<KnockoutStructureStatus> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,kickoff_time,home_team_id,away_team_id")
    .neq("stage", "group");

  if (error) {
    logSafeSupabaseError("fetch-knockout-structure-status", error);
    throw formatSafeSupabaseError(error, "Could not load knockout structure.", "Knockout structure");
  }

  const counts: Record<CanonicalKnockoutStage, number> = {
    r32: 0,
    r16: 0,
    qf: 0,
    sf: 0,
    third: 0,
    final: 0
  };

  let firstRoundOf32Kickoff: string | null = null;
  let seededRoundOf32Count = 0;
  for (const row of ((data ?? []) as Array<{
    id: string;
    stage: MatchStage;
    kickoff_time: string;
    home_team_id?: string | null;
    away_team_id?: string | null;
  }>)) {
    const canonicalStage = normalizeKnockoutStage(row.stage);
    if (!canonicalStage) {
      continue;
    }

    counts[canonicalStage] += 1;

    if (isRoundOf32Stage(row.stage) && row.kickoff_time) {
      if (!firstRoundOf32Kickoff || row.kickoff_time < firstRoundOf32Kickoff) {
        firstRoundOf32Kickoff = row.kickoff_time;
      }

      if (row.home_team_id && row.away_team_id) {
        seededRoundOf32Count += 1;
      }
    }
  }

  const stagesRequiredForBracket = (["r32", "r16", "qf", "sf", "final"] as CanonicalKnockoutStage[]);
  const hasRequiredBracketStructure = stagesRequiredForBracket.every(
    (stage) => counts[stage] >= EXPECTED_KNOCKOUT_MATCH_COUNTS[stage]
  );
  const isFullySeeded =
    hasRequiredBracketStructure && seededRoundOf32Count >= EXPECTED_KNOCKOUT_MATCH_COUNTS.r32;

  return {
    counts,
    isFullySeeded,
    firstRoundOf32Kickoff
  };
}

export async function fetchKnockoutBracketEditorView(userId: string): Promise<KnockoutBracketEditorView> {
  const adminSupabase = createAdminClient();
  const [editState, knockoutData, predictions, scoreRows] = await Promise.all([
    getBracketEditState(adminSupabase),
    fetchKnockoutData(adminSupabase),
    fetchUserBracketPredictions(userId),
    fetchUserBracketScores(userId)
  ]);

  const predictionsByMatchId = new Map(predictions.map((prediction) => [prediction.matchId, prediction]));
  const scoresByMatchId = new Map(scoreRows.map((score) => [score.matchId, score]));
  const scoreSummary = {
    bracketPoints: scoreRows.reduce((sum, score) => sum + (score.points ?? 0), 0),
    correctPicks: scoreRows.filter((score) => score.isCorrect).length
  };
  const stages = buildKnockoutBracketStages(
    knockoutData.matches,
    knockoutData.teamsById,
    predictionsByMatchId,
    scoresByMatchId,
    !editState.editable
  );
  const championTeamId =
    stages
      .find((stage) => stage.stage === "final")
      ?.matches[0]
      ?.predictedWinnerTeamId ?? null;

  return {
    mode: "official",
    isSeeded: knockoutData.status.isFullySeeded,
    isLocked: !editState.editable,
    lockReason: editState.editable ? null : editState.reason,
    firstRoundOf32Kickoff: knockoutData.status.firstRoundOf32Kickoff,
    bracketPoints: scoreSummary.bracketPoints,
    correctPicks: scoreSummary.correctPicks,
    stages: stages.filter((stage) => stage.stage !== "third"),
    champion: championTeamId ? knockoutData.teamsById.get(championTeamId) ?? null : null,
    thirdPlace: stages.find((stage) => stage.stage === "third")?.matches[0] ?? null,
    predictions,
    title: "Official knockout bracket",
    description: "The official knockout bracket is now available.",
    secondaryNote: null
  };
}

export async function fetchProjectedKnockoutBracketPreview(userId: string): Promise<KnockoutBracketEditorView | null> {
  const adminSupabase = createAdminClient();
  const [{ data: knockoutRows, error: knockoutError }, { data: groupRows, error: groupError }, { data: predictionRows, error: predictionError }, { data: teamRows, error: teamError }] =
    await Promise.all([
      adminSupabase
        .from("matches")
        .select("id,stage,kickoff_time,status,home_team_id,away_team_id,home_source,away_source,home_score,away_score,winner_team_id,next_match_id,next_match_slot")
        .neq("stage", "group"),
      adminSupabase
        .from("matches")
        .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score")
        .eq("stage", "group"),
      adminSupabase
        .from("predictions")
        .select("match_id,predicted_home_score,predicted_away_score")
        .eq("user_id", userId),
      adminSupabase
        .from("teams")
        .select("id,name,short_name,flag_emoji,group_name,fifa_rank")
    ]);

  if (knockoutError) {
    throw knockoutError;
  }
  if (groupError) {
    throw groupError;
  }
  if (predictionError) {
    throw predictionError;
  }
  if (teamError) {
    throw teamError;
  }

  const projectedSeeds = buildUserProjectedRoundOf32({
    groupMatches: ((groupRows ?? []) as Array<{
      id: string;
      stage: MatchStage;
      group_name?: string | null;
      status: MatchStatus;
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
    })),
    teams: ((teamRows ?? []) as TeamRow[]).map((team) => ({
      id: team.id,
      name: team.name,
      shortName: team.short_name || team.name || team.id,
      flagEmoji: team.flag_emoji || "",
      groupName: team.group_name ?? "",
      fifaRank: team.fifa_rank ?? 0
    })),
    predictions: ((predictionRows ?? []) as GroupPredictionRow[]).map((prediction) => ({
      matchId: prediction.match_id,
      predictedHomeScore: prediction.predicted_home_score ?? null,
      predictedAwayScore: prediction.predicted_away_score ?? null
    })),
    roundOf32Placeholders: ((knockoutRows ?? []) as MatchRow[]).map((match) => ({
      id: match.id,
      stage: match.stage,
      homeSource: match.home_source ?? null,
      awaySource: match.away_source ?? null,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      status: match.status
    }))
  });

  if (projectedSeeds.resolvedSideCount === 0) {
    return null;
  }

  const projectedSourceByMatchId = new Map(
    projectedSeeds.matches.map((match) => [
      match.matchId,
      { home: match.home.resolutionSource, away: match.away.resolutionSource }
    ])
  );
  const projectedTeamByMatchId = new Map(
    projectedSeeds.matches.map((match) => [
      match.matchId,
      { homeTeamId: match.home.teamId, awayTeamId: match.away.teamId }
    ])
  );

  const knockoutMatches = ((knockoutRows ?? []) as MatchRow[])
    .filter((match) => isKnockoutStage(match.stage))
    .sort((left, right) => {
      const stageOrder = getStageOrder(normalizeKnockoutStage(left.stage)) - getStageOrder(normalizeKnockoutStage(right.stage));
      if (stageOrder !== 0) {
        return stageOrder;
      }

      return left.kickoff_time.localeCompare(right.kickoff_time);
    });

  const teamsById = new Map<string, BracketTeamOption>(
    ((teamRows ?? []) as TeamRow[]).map((team) => [
      team.id,
      {
        id: team.id,
        name: team.name || team.short_name || team.id,
        shortName: team.short_name || team.name || team.id,
        flagEmoji: team.flag_emoji || undefined,
        groupName: team.group_name ?? null
      }
    ])
  );

  const stages = buildKnockoutBracketStages(
    knockoutMatches,
    teamsById,
    new Map(),
    new Map(),
    true,
    {
      mode: "projected",
      projectedSourceByMatchId,
      projectedTeamByMatchId
    }
  );

  const description =
    "Compare your group predictions with actual tournament wins. Swipe through the knockout phases and tap to select the winning teams until you reach the final.";
  const secondaryNote = "PICKS UNLOCK AS TEAMS ARE CONFIRMED.";

  return {
    mode: "projected",
    isSeeded: false,
    isLocked: true,
    lockReason: null,
    firstRoundOf32Kickoff: null,
    bracketPoints: 0,
    correctPicks: 0,
    stages: stages.filter((stage) => stage.stage !== "third"),
    champion: null,
    thirdPlace: stages.find((stage) => stage.stage === "third")?.matches[0] ?? null,
    predictions: [],
    title: "Fill your bracket and stay in the game until the end",
    description,
    secondaryNote
  };
}

export async function fetchUserBracketScores(userId: string): Promise<BracketScore[]> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("bracket_scores")
    .select(
      "id,user_id,match_id,stage,predicted_winner_team_id,actual_winner_team_id,round_points,champion_points,points,is_correct,scored_at"
    )
    .eq("user_id", userId)
    .order("scored_at", { ascending: false });

  if (error) {
    logSafeSupabaseError("fetch-user-bracket-scores", error, { userId });
    throw formatSafeSupabaseError(error, "Could not load bracket scores.", "Bracket scores");
  }

  return ((data ?? []) as BracketScoreRow[]).map(mapBracketScoreRow);
}

export async function fetchUserBracketScoreSummary(userId: string): Promise<BracketScoreSummary> {
  const scores = await fetchUserBracketScores(userId);
  return {
    bracketPoints: scores.reduce((sum, score) => sum + (score.points ?? 0), 0),
    correctPicks: scores.filter((score) => score.isCorrect).length
  };
}

export async function scoreFinalizedKnockoutMatch(matchId: string): Promise<number> {
  const adminSupabase = createAdminClient();
  return scoreFinalizedKnockoutMatchWithClient(adminSupabase, matchId);
}

export async function fetchGroupBracketComparisonView(
  currentUserId: string,
  selectedGroupId?: string | null,
  selectedPlayerId?: string | null
): Promise<GroupBracketComparisonView> {
  const adminSupabase = createAdminClient();

  const { data: currentMemberships, error: currentMembershipsError } = await adminSupabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", currentUserId);

  if (currentMembershipsError) {
    throw currentMembershipsError;
  }

  const allowedGroupIds = Array.from(
    new Set(((currentMemberships ?? []) as Array<{ group_id: string }>).map((membership) => membership.group_id))
  );

  if (allowedGroupIds.length === 0) {
    return {
      groups: [],
      selectedGroupId: null,
      selectedGroupName: null,
      selectedPlayerId: null,
      mostPickedChampion: null,
      members: [],
      selectedPlayerBracket: null
    };
  }

  const { data: groups, error: groupsError } = await adminSupabase
    .from("groups")
    .select("id,name,status")
    .in("id", allowedGroupIds)
    .order("name", { ascending: true });

  if (groupsError) {
    throw groupsError;
  }

  const visibleGroups = ((groups ?? []) as GroupRow[]).filter((group) => group.status !== "archived");
  const resolvedGroupId =
    selectedGroupId && visibleGroups.some((group) => group.id === selectedGroupId) ? selectedGroupId : null;

  if (!resolvedGroupId) {
    return {
      groups: visibleGroups.map((group) => ({ id: group.id, name: group.name })),
      selectedGroupId: null,
      selectedGroupName: null,
      selectedPlayerId: null,
      mostPickedChampion: null,
      members: [],
      selectedPlayerBracket: null
    };
  }

  const selectedGroupName = visibleGroups.find((group) => group.id === resolvedGroupId)?.name ?? null;

  const { data: memberRows, error: memberRowsError } = await adminSupabase
    .from("group_members")
    .select("group_id,user_id,user:users!group_members_user_id_fkey(id,name,avatar_url)")
    .eq("group_id", resolvedGroupId);

  if (memberRowsError) {
    throw memberRowsError;
  }

  const members = (memberRows ?? []) as GroupMemberRow[];
  const memberIds = members.map((member) => member.user_id);
  if (memberIds.length === 0) {
    return {
      groups: visibleGroups.map((group) => ({ id: group.id, name: group.name })),
      selectedGroupId: resolvedGroupId,
      selectedGroupName,
      selectedPlayerId: null,
      mostPickedChampion: null,
      members: [],
      selectedPlayerBracket: null
    };
  }

  const [{ data: predictionRows, error: predictionRowsError }, { data: matchRows, error: matchRowsError }] =
    await Promise.all([
      adminSupabase
        .from("bracket_predictions")
        .select("id,user_id,match_id,predicted_winner_team_id,created_at,updated_at")
        .in("user_id", memberIds),
      adminSupabase
        .from("matches")
        .select("id,stage,kickoff_time,status,home_team_id,away_team_id,home_source,away_source,winner_team_id,next_match_id,next_match_slot")
        .neq("stage", "group")
    ]);

  if (predictionRowsError) {
    throw predictionRowsError;
  }

  if (matchRowsError) {
    throw matchRowsError;
  }

  const knockoutMatches = ((matchRows ?? []) as MatchRow[])
    .filter((match) => isKnockoutStage(match.stage))
    .sort((left, right) => {
      const stageOrder = getStageOrder(normalizeKnockoutStage(left.stage)) - getStageOrder(normalizeKnockoutStage(right.stage));
      if (stageOrder !== 0) {
        return stageOrder;
      }

      return left.kickoff_time.localeCompare(right.kickoff_time);
    });

  const predictionList = (predictionRows ?? []) as BracketPredictionRow[];
  const teamIds = new Set<string>();
  for (const match of knockoutMatches) {
    if (match.home_team_id) teamIds.add(match.home_team_id);
    if (match.away_team_id) teamIds.add(match.away_team_id);
    if (match.winner_team_id) teamIds.add(match.winner_team_id);
  }
  for (const prediction of predictionList) {
    if (prediction.predicted_winner_team_id) {
      teamIds.add(prediction.predicted_winner_team_id);
    }
  }

  const { data: teams, error: teamsError } =
    teamIds.size > 0
      ? await adminSupabase.from("teams").select("id,name,short_name,flag_emoji,group_name").in("id", Array.from(teamIds))
      : { data: [], error: null };

  if (teamsError) {
    throw teamsError;
  }

  const teamNameById = new Map<string, string>(
    ((teams ?? []) as TeamRow[]).map((team) => [team.id, team.name || team.short_name || team.id])
  );
  const predictionsByUserId = new Map<string, BracketPredictionRow[]>();
  for (const prediction of predictionList) {
    const userPredictions = predictionsByUserId.get(prediction.user_id) ?? [];
    userPredictions.push(prediction);
    predictionsByUserId.set(prediction.user_id, userPredictions);
  }

  const finalMatch = knockoutMatches.find((match) => normalizeKnockoutStage(match.stage) === "final") ?? null;
  const semifinalMatches = knockoutMatches.filter((match) => normalizeKnockoutStage(match.stage) === "sf");
  const previousMatchesByNextMatchId = new Map<string, MatchRow[]>();
  for (const match of knockoutMatches) {
    if (!match.next_match_id) {
      continue;
    }

    const current = previousMatchesByNextMatchId.get(match.next_match_id) ?? [];
    current.push(match);
    previousMatchesByNextMatchId.set(match.next_match_id, current);
  }

  const championPickCounts = new Map<string, number>();
  const memberSummaries = members
    .map((member) => {
      const userProfile = unwrapJoinedUser(member.user);
      const userPredictions = (predictionsByUserId.get(member.user_id) ?? []).sort((left, right) =>
        left.updated_at.localeCompare(right.updated_at)
      );
      const predictionsByMatchId = new Map(userPredictions.map((prediction) => [prediction.match_id, prediction]));
      const championPickId = finalMatch ? predictionsByMatchId.get(finalMatch.id)?.predicted_winner_team_id ?? null : null;
      const finalistNames = semifinalMatches
        .map((match) => predictionsByMatchId.get(match.id)?.predicted_winner_team_id ?? null)
        .filter((teamId): teamId is string => Boolean(teamId))
        .map((teamId) => getTeamName(teamNameById, teamId) ?? teamId);
      if (championPickId) {
        championPickCounts.set(championPickId, (championPickCounts.get(championPickId) ?? 0) + 1);
      }

      return {
        userId: member.user_id,
        name: userProfile?.name ?? "Player",
        avatarUrl: userProfile?.avatar_url ?? null,
        championPickId,
        finalistNames,
        status: deriveBracketHealthStatus(championPickId, finalMatch, predictionsByMatchId, knockoutMatches, previousMatchesByNextMatchId),
        predictionsByMatchId
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const mostPickedChampion = Array.from(championPickCounts.entries())
    .sort(
      (left, right) =>
        right[1] - left[1] ||
        (getTeamName(teamNameById, left[0]) ?? left[0]).localeCompare(getTeamName(teamNameById, right[0]) ?? right[0])
    )[0];

  const selectedMember = selectedPlayerId
    ? memberSummaries.find((member) => member.userId === selectedPlayerId) ?? null
    : null;

  return {
    groups: visibleGroups.map((group) => ({ id: group.id, name: group.name })),
    selectedGroupId: resolvedGroupId,
    selectedGroupName,
    selectedPlayerId: selectedMember?.userId ?? null,
    mostPickedChampion: mostPickedChampion
      ? {
          name: getTeamName(teamNameById, mostPickedChampion[0]) ?? mostPickedChampion[0],
          count: mostPickedChampion[1]
        }
      : null,
    members: memberSummaries.map((member) => ({
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
      championPickName: member.championPickId ? getTeamName(teamNameById, member.championPickId) : null,
      championPickCount: member.championPickId ? championPickCounts.get(member.championPickId) ?? 0 : 0,
      isUniqueChampionPick: Boolean(member.championPickId) && (championPickCounts.get(member.championPickId!) ?? 0) === 1,
      finalistNames: member.finalistNames,
      status: member.status
    })),
    selectedPlayerBracket: selectedMember
      ? {
          userId: selectedMember.userId,
          name: selectedMember.name,
          championPickName: selectedMember.championPickId ? getTeamName(teamNameById, selectedMember.championPickId) : null,
          finalistNames: selectedMember.finalistNames,
          status: selectedMember.status,
          matches: knockoutMatches.map((match) => ({
            matchId: match.id,
            stage: normalizeKnockoutStage(match.stage) ?? "final",
            stageLabel: formatMatchStage(match.stage),
            homeTeamName: getTeamName(teamNameById, match.home_team_id) ?? "TBD",
            awayTeamName: getTeamName(teamNameById, match.away_team_id) ?? "TBD",
            predictedWinnerName: getTeamName(
              teamNameById,
              selectedMember.predictionsByMatchId.get(match.id)?.predicted_winner_team_id ?? null
            ),
            actualWinnerName: getTeamName(teamNameById, match.winner_team_id),
            status: match.status
          }))
        }
      : null
  };
}

async function getBracketEditState(adminSupabase: ReturnType<typeof createAdminClient>): Promise<BracketEditState> {
  const { data: matches, error } = await adminSupabase
    .from("matches")
    .select("kickoff_time,stage,home_team_id,away_team_id")
    .neq("stage", "group")
    .order("kickoff_time", { ascending: true });

  if (error) {
    logSafeSupabaseError("get-bracket-edit-state", error);
    throw formatSafeSupabaseError(error, "Could not load knockout edit state.", "Knockout edit state");
  }

  const firstRoundOf32Kickoff =
    ((matches ?? []) as Array<{
      kickoff_time: string;
      stage: MatchStage;
      home_team_id?: string | null;
      away_team_id?: string | null;
    }>)
      .filter((match) => isRoundOf32Stage(match.stage) && match.home_team_id && match.away_team_id)
      .map((match) => match.kickoff_time)
      .find(Boolean) ?? null;
  if (!firstRoundOf32Kickoff) {
    return { editable: false, reason: "not_seeded", firstRoundOf32Kickoff: null };
  }

  return { editable: true, firstRoundOf32Kickoff };
}

function isKnockoutMatchLocked(
  match: Pick<MatchRow, "status" | "kickoff_time">
) {
  if (match.status === "final" || match.status === "live" || match.status === "locked") {
    return true;
  }

  if (!match.kickoff_time) {
    return false;
  }

  return new Date(match.kickoff_time).getTime() <= Date.now();
}

async function clearInvalidDescendantPredictions(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userId: string,
  rootMatchId: string
) {
  const knockoutData = await fetchKnockoutData(adminSupabase);
  const { data: predictionRows, error: predictionsError } = await adminSupabase
    .from("bracket_predictions")
    .select("id,user_id,match_id,predicted_winner_team_id,created_at,updated_at")
    .eq("user_id", userId);

  if (predictionsError) {
    throw predictionsError;
  }

  const predictionsByMatchId = new Map(
    ((predictionRows ?? []) as BracketPredictionRow[]).map((prediction) => [prediction.match_id, prediction])
  );
  const descendantIds = collectDescendantMatchIds(rootMatchId, knockoutData.matchesById);
  const descendants = knockoutData.matches
    .filter((match) => descendantIds.has(match.id))
    .sort((left, right) => getStageOrder(normalizeKnockoutStage(left.stage)) - getStageOrder(normalizeKnockoutStage(right.stage)));

  const invalidPredictionIds: string[] = [];
  for (const match of descendants) {
    const prediction = predictionsByMatchId.get(match.id);
    if (!prediction) {
      continue;
    }

    const availableTeams = getAvailablePredictedTeamsForMatch(
      match,
      knockoutData.previousMatchesByNextMatchId,
      predictionsByMatchId,
      knockoutData.teamsById
    );
    const validTeamIds = [availableTeams.homeTeam?.id ?? null, availableTeams.awayTeam?.id ?? null].filter(
      (teamId): teamId is string => Boolean(teamId)
    );

    if (!validTeamIds.includes(prediction.predicted_winner_team_id)) {
      invalidPredictionIds.push(prediction.id);
      predictionsByMatchId.delete(match.id);
    }
  }

  if (invalidPredictionIds.length === 0) {
    return;
  }

  const { error } = await adminSupabase
    .from("bracket_predictions")
    .delete()
    .in("id", invalidPredictionIds);

  if (error) {
    throw error;
  }
}

async function fetchKnockoutData(adminSupabase: ReturnType<typeof createAdminClient>) {
  const [{ data: matchRows, error: matchesError }, status] = await Promise.all([
    adminSupabase
    .from("matches")
    .select("id,stage,kickoff_time,status,home_team_id,away_team_id,home_source,away_source,home_score,away_score,winner_team_id,next_match_id,next_match_slot")
    .neq("stage", "group"),
    fetchKnockoutStructureStatus()
  ]);

  if (matchesError) {
    logSafeSupabaseError("fetch-knockout-data-matches", matchesError);
    throw formatSafeSupabaseError(matchesError, "Could not load knockout matches.", "Knockout matches");
  }

  const matches = ((matchRows ?? []) as MatchRow[])
    .filter((match) => isKnockoutStage(match.stage))
    .sort((left, right) => {
      const stageOrder = getStageOrder(normalizeKnockoutStage(left.stage)) - getStageOrder(normalizeKnockoutStage(right.stage));
      if (stageOrder !== 0) {
        return stageOrder;
      }

      return left.kickoff_time.localeCompare(right.kickoff_time);
    });

  const teamIds = new Set<string>();
  for (const match of matches) {
    if (match.home_team_id) teamIds.add(match.home_team_id);
    if (match.away_team_id) teamIds.add(match.away_team_id);
    if (match.winner_team_id) teamIds.add(match.winner_team_id);
  }

  const { data: teams, error: teamsError } =
    teamIds.size > 0
      ? await adminSupabase.from("teams").select("id,name,short_name,flag_emoji,group_name").in("id", Array.from(teamIds))
      : { data: [], error: null };

  if (teamsError) {
    logSafeSupabaseError("fetch-knockout-data-teams", teamsError, { teamCount: teamIds.size });
    throw formatSafeSupabaseError(teamsError, "Could not load knockout teams.", "Knockout teams");
  }

  const teamsById = new Map<string, BracketTeamOption>(
    ((teams ?? []) as TeamRow[]).map((team) => [
      team.id,
      {
        id: team.id,
        name: team.name || team.short_name || team.id,
        shortName: team.short_name || team.name || team.id,
        flagEmoji: team.flag_emoji || undefined,
        groupName: team.group_name ?? null
      }
    ])
  );

  const matchesById = new Map(matches.map((match) => [match.id, match]));
  const previousMatchesByNextMatchId = new Map<string, MatchRow[]>();
  for (const match of matches) {
    if (!match.next_match_id) {
      continue;
    }

    const current = previousMatchesByNextMatchId.get(match.next_match_id) ?? [];
    current.push(match);
    previousMatchesByNextMatchId.set(match.next_match_id, current);
  }

  return {
    matches,
    matchesById,
    teamsById,
    previousMatchesByNextMatchId,
    status
  };
}

function buildKnockoutBracketStages(
  matches: MatchRow[],
  teamsById: Map<string, BracketTeamOption>,
  predictionsByMatchId: Map<string, BracketPrediction>,
  scoresByMatchId: Map<string, BracketScore>,
  isLocked: boolean,
  options: {
    mode?: "official" | "projected";
    projectedSourceByMatchId?: Map<string, { home: ProjectedMatchScoreSource; away: ProjectedMatchScoreSource }>;
    projectedTeamByMatchId?: Map<string, { homeTeamId: string | null; awayTeamId: string | null }>;
  } = {}
): KnockoutBracketStageView[] {
  const mode = options.mode ?? "official";
  const stagesById = new Map<CanonicalKnockoutStage, KnockoutBracketMatchView[]>();
  const previousMatchesByNextMatchId = buildPreviousMatchesByNextMatchId(matches);

  for (const match of matches) {
    const stage = normalizeKnockoutStage(match.stage);
    if (!stage) {
      continue;
    }

    const previousMatches = previousMatchesByNextMatchId.get(match.id) ?? [];
    const homeSource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "home");
    const awaySource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "away");
    const availableTeams = getAvailablePredictedTeamsForMatch(
      match,
      previousMatchesByNextMatchId,
      predictionsByMatchId,
      teamsById,
      options.projectedTeamByMatchId,
      mode
    );
    const savedPrediction = predictionsByMatchId.get(match.id) ?? null;
    const savedHomeScore = savedPrediction?.predictedHomeScore ?? null;
    const savedAwayScore = savedPrediction?.predictedAwayScore ?? null;
    const predictedWinnerTeamId = savedPrediction?.predictedWinnerTeamId ?? null;
    const persistedScore = scoresByMatchId.get(match.id) ?? null;
    const computedScoreBreakdown =
      savedPrediction && match.status === "final"
        ? scoreBracketPrediction(
            {
              stage: match.stage,
              status: match.status,
              homeScore: match.home_score ?? null,
              awayScore: match.away_score ?? null,
              winnerTeamId: match.winner_team_id ?? null
            },
            {
              predictedWinnerTeamId,
              predictedHomeScore: savedHomeScore,
              predictedAwayScore: savedAwayScore
            }
          )
        : null;
    const validPredictedWinnerTeamId =
      predictedWinnerTeamId &&
      [availableTeams.homeTeam?.id, availableTeams.awayTeam?.id].includes(predictedWinnerTeamId)
        ? predictedWinnerTeamId
        : null;
    const projectedSources = options.projectedSourceByMatchId?.get(match.id);
    const matchIsLocked = isLocked || isKnockoutMatchLocked(match);

    const currentStageMatches = stagesById.get(stage) ?? [];
    currentStageMatches.push({
      matchId: match.id,
      stage,
      stageLabel: formatMatchStage(match.stage),
      title: buildMatchTitle(stage, currentStageMatches.length + 1),
      kickoffTime: match.kickoff_time,
      status: match.status,
      seededHomeTeam: match.home_team_id ? teamsById.get(match.home_team_id) ?? null : null,
      seededAwayTeam: match.away_team_id ? teamsById.get(match.away_team_id) ?? null : null,
      homeSourceMatchId: homeSource?.id ?? null,
      awaySourceMatchId: awaySource?.id ?? null,
      homeSourceLabel: getMatchSlotLabel(match.home_source, homeSource),
      awaySourceLabel: getMatchSlotLabel(match.away_source, awaySource),
      homeTeam: availableTeams.homeTeam,
      awayTeam: availableTeams.awayTeam,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null,
      predictedHomeScore: savedHomeScore,
      predictedAwayScore: savedAwayScore,
      savedHomeScore,
      savedAwayScore,
      predictedWinnerTeamId: validPredictedWinnerTeamId,
      savedWinnerTeamId: validPredictedWinnerTeamId,
      savedAt: savedPrediction?.updatedAt ?? null,
      actualWinnerTeamId: match.winner_team_id ?? null,
      awardedPoints: computedScoreBreakdown?.points ?? persistedScore?.points ?? null,
      exactScorePoints: computedScoreBreakdown?.exactScorePoints ?? persistedScore?.exactScorePoints ?? null,
      isCorrectWinner: computedScoreBreakdown?.isCorrect ?? persistedScore?.isCorrect ?? null,
      isLocked: matchIsLocked,
      canSelectWinner: Boolean(availableTeams.homeTeam && availableTeams.awayTeam) && !matchIsLocked,
      viewMode: mode,
      homeResolutionSource: projectedSources?.home ?? availableTeams.homeResolutionSource,
      awayResolutionSource: projectedSources?.away ?? availableTeams.awayResolutionSource
    });
    if (process.env.NODE_ENV !== "production" && stage !== "r32") {
      console.debug("[knockout-slot-resolution]", {
        round: stage,
        matchId: match.id,
        homeSource: match.home_source ?? null,
        awaySource: match.away_source ?? null,
        homeResolvedTeamId: availableTeams.homeTeam?.id ?? null,
        homeResolvedTeamName: availableTeams.homeTeam?.name ?? null,
        awayResolvedTeamId: availableTeams.awayTeam?.id ?? null,
        awayResolvedTeamName: availableTeams.awayTeam?.name ?? null,
        homeUnresolvedReason: availableTeams.homeTeam ? null : resolveSlotUnresolvedReason(homeSource, mode),
        awayUnresolvedReason: availableTeams.awayTeam ? null : resolveSlotUnresolvedReason(awaySource, mode)
      });
    }
    stagesById.set(stage, currentStageMatches);
  }

  return (["r32", "r16", "qf", "sf", "final", "third"] as CanonicalKnockoutStage[])
    .map((stage) => ({
      stage,
      label: formatMatchStage(stage),
      matches: stagesById.get(stage) ?? []
    }))
    .filter((stage) => stage.matches.length > 0);
}

function getAvailablePredictedTeamsForMatch(
  match: MatchRow,
  previousMatchesByNextMatchId: Map<string, MatchRow[]>,
  predictionsByMatchId: Map<string, { predictedWinnerTeamId?: string; predicted_winner_team_id?: string }>,
  teamsById: Map<string, BracketTeamOption>,
  projectedTeamByMatchId?: Map<string, { homeTeamId: string | null; awayTeamId: string | null }>,
  mode: "official" | "projected" = "official"
): {
  homeTeam: BracketTeamOption | null;
  awayTeam: BracketTeamOption | null;
  homeResolutionSource: ProjectedMatchScoreSource;
  awayResolutionSource: ProjectedMatchScoreSource;
} {
  const { homeTeamId, awayTeamId, homeResolutionSource, awayResolutionSource } = getAvailableKnockoutTeamIdsForMatch(
    match,
    previousMatchesByNextMatchId,
    predictionsByMatchId,
    mode,
    projectedTeamByMatchId
  );

  return {
    homeTeam: homeTeamId ? teamsById.get(homeTeamId) ?? null : null,
    awayTeam: awayTeamId ? teamsById.get(awayTeamId) ?? null : null,
    homeResolutionSource,
    awayResolutionSource
  };
}

function getAvailableKnockoutTeamIdsForMatch(
  match: MatchRow,
  previousMatchesByNextMatchId: Map<string, MatchRow[]>,
  predictionsByMatchId: Map<string, { predictedWinnerTeamId?: string; predicted_winner_team_id?: string }>,
  mode: "official" | "projected",
  projectedTeamByMatchId?: Map<string, { homeTeamId: string | null; awayTeamId: string | null }>
): {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeResolutionSource: ProjectedMatchScoreSource;
  awayResolutionSource: ProjectedMatchScoreSource;
} {
  const previousMatches = previousMatchesByNextMatchId.get(match.id) ?? [];
  const homeSource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "home");
  const awaySource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "away");
  const projectedTeams = projectedTeamByMatchId?.get(match.id);
  const resolvedHome = resolveKnockoutSourceTeam(homeSource, predictionsByMatchId, mode);
  const resolvedAway = resolveKnockoutSourceTeam(awaySource, predictionsByMatchId, mode);

  return {
    homeTeamId: resolvedHome.teamId ?? projectedTeams?.homeTeamId ?? match.home_team_id ?? null,
    awayTeamId: resolvedAway.teamId ?? projectedTeams?.awayTeamId ?? match.away_team_id ?? null,
    homeResolutionSource:
      resolvedHome.source ??
      ((projectedTeams?.homeTeamId ? "prediction" : match.home_team_id ? "actual" : "missing") as ProjectedMatchScoreSource),
    awayResolutionSource:
      resolvedAway.source ??
      ((projectedTeams?.awayTeamId ? "prediction" : match.away_team_id ? "actual" : "missing") as ProjectedMatchScoreSource)
  };
}

function buildPreviousMatchesByNextMatchId(matches: MatchRow[]) {
  const previousMatchesByNextMatchId = new Map<string, MatchRow[]>();

  for (const match of matches) {
    if (!match.next_match_id) {
      continue;
    }

    const current = previousMatchesByNextMatchId.get(match.next_match_id) ?? [];
    current.push(match);
    previousMatchesByNextMatchId.set(match.next_match_id, current);
  }

  return previousMatchesByNextMatchId;
}

function resolveKnockoutSourceTeam(
  sourceMatch: MatchRow | undefined,
  predictionsByMatchId: Map<string, { predictedWinnerTeamId?: string; predicted_winner_team_id?: string }>,
  mode: "official" | "projected"
): { teamId: string | null; source: ProjectedMatchScoreSource } {
  if (!sourceMatch) {
    return { teamId: null, source: "missing" as const };
  }

  if (sourceMatch.status === "final" && sourceMatch.winner_team_id) {
    return { teamId: sourceMatch.winner_team_id, source: "actual" as const };
  }

  const predictedWinnerTeamId =
    predictionsByMatchId.get(sourceMatch.id)?.predictedWinnerTeamId ??
    predictionsByMatchId.get(sourceMatch.id)?.predicted_winner_team_id ??
    null;
  if (predictedWinnerTeamId) {
    return { teamId: predictedWinnerTeamId, source: "prediction" as const };
  }

  return { teamId: null, source: mode === "projected" ? "prediction" : "missing" };
}

function resolveSlotUnresolvedReason(sourceMatch: MatchRow | undefined, mode: "official" | "projected") {
  if (!sourceMatch) {
    return "no_source_match";
  }

  if (sourceMatch.status !== "final") {
    return mode === "official" || mode === "projected" ? "projected_pick_missing" : "source_match_not_final";
  }

  if (!sourceMatch.winner_team_id) {
    return mode === "projected" || mode === "official" ? "projected_pick_missing" : "source_match_missing_winner";
  }

  return mode === "projected" ? "projected_pick_missing" : "official_winner_unresolved";
}

function buildMatchTitle(stage: CanonicalKnockoutStage, index: number) {
  switch (stage) {
    case "r32":
      return `Match ${index}`;
    case "r16":
      return `Round of 16 Match ${index}`;
    case "qf":
      return `Quarter-final ${index}`;
    case "sf":
      return `Semi-final ${index}`;
    case "final":
      return "Final";
    case "third":
      return "Third Place Match";
    default:
      return `${formatMatchStage(stage)} ${index}`;
  }
}

function getMatchSlotLabel(
  directSourceLabel: string | null | undefined,
  sourceMatch: MatchRow | undefined
) {
  if (directSourceLabel?.trim()) {
    return directSourceLabel.trim();
  }

  if (!sourceMatch) {
    return null;
  }

  return `Winner of ${formatMatchStage(sourceMatch.stage)}`;
}

function collectDescendantMatchIds(rootMatchId: string, matchesById: Map<string, MatchRow>) {
  const descendants = new Set<string>();
  let nextMatchId = matchesById.get(rootMatchId)?.next_match_id ?? null;

  while (nextMatchId) {
    descendants.add(nextMatchId);
    nextMatchId = matchesById.get(nextMatchId)?.next_match_id ?? null;
  }

  return descendants;
}

function mapBracketPredictionRow(row: BracketPredictionRow): BracketPrediction {
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    predictedHomeScore: row.predicted_home_score,
    predictedAwayScore: row.predicted_away_score,
    predictedWinnerTeamId: row.predicted_winner_team_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeBracketScore(score: number) {
  if (!Number.isFinite(score)) {
    throw new Error("Enter a valid knockout score.");
  }

  return Math.max(0, Math.trunc(score));
}

function inferBracketWinnerTeamId({
  homeScore,
  awayScore,
  homeTeamId,
  awayTeamId,
  explicitWinnerTeamId
}: {
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
  awayTeamId: string;
  explicitWinnerTeamId: string | null;
}) {
  if (homeScore > awayScore) {
    return homeTeamId;
  }

  if (awayScore > homeScore) {
    return awayTeamId;
  }

  if (explicitWinnerTeamId && [homeTeamId, awayTeamId].includes(explicitWinnerTeamId)) {
    return explicitWinnerTeamId;
  }

  return null;
}

function mapBracketScoreRow(row: BracketScoreRow): BracketScore {
  return {
    id: row.id,
    userId: row.user_id,
    matchId: row.match_id,
    stage: row.stage,
    predictedWinnerTeamId: row.predicted_winner_team_id,
    actualWinnerTeamId: row.actual_winner_team_id,
    roundPoints: row.round_points,
    exactScorePoints: row.champion_points,
    points: row.points,
    isCorrect: row.is_correct,
    scoredAt: row.scored_at
  };
}

export async function scoreFinalizedKnockoutMatchWithClient(
  adminSupabase: ReturnType<typeof createAdminClient>,
  matchId: string
) {
  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_score,away_score,winner_team_id")
    .eq("id", matchId)
    .single();

  if (matchError) {
    throw matchError;
  }

  const matchRow = match as Pick<MatchRow, "id" | "stage" | "status" | "home_score" | "away_score" | "winner_team_id">;
  if (!matchRow.winner_team_id || matchRow.status !== "final" || !isKnockoutStage(matchRow.stage)) {
    return 0;
  }

  const { data: predictions, error: predictionsError } = await adminSupabase
    .from("bracket_predictions")
    .select("id,user_id,match_id,predicted_home_score,predicted_away_score,predicted_winner_team_id,created_at,updated_at")
    .eq("match_id", matchId);

  if (predictionsError) {
    throw predictionsError;
  }

  const predictionRows = (predictions ?? []) as BracketPredictionRow[];
  if (predictionRows.length === 0) {
    return 0;
  }

  const scoredAt = new Date().toISOString();
  const { error: upsertError } = await adminSupabase.from("bracket_scores").upsert(
    predictionRows.map((prediction) => {
      const breakdown = scoreBracketPrediction(
        {
          stage: matchRow.stage,
          status: matchRow.status,
          homeScore: matchRow.home_score ?? null,
          awayScore: matchRow.away_score ?? null,
          winnerTeamId: matchRow.winner_team_id
        },
        {
          predictedWinnerTeamId: prediction.predicted_winner_team_id,
          predictedHomeScore: prediction.predicted_home_score ?? null,
          predictedAwayScore: prediction.predicted_away_score ?? null
        }
      );

      return {
        user_id: prediction.user_id,
        match_id: prediction.match_id,
        stage: matchRow.stage,
        predicted_winner_team_id: prediction.predicted_winner_team_id,
        actual_winner_team_id: matchRow.winner_team_id,
        round_points: breakdown.roundPoints,
        champion_points: breakdown.exactScorePoints,
        points: breakdown.points,
        is_correct: breakdown.isCorrect,
        scored_at: scoredAt
      };
    }),
    { onConflict: "user_id,match_id" }
  );

  if (upsertError) {
    throw upsertError;
  }

  return predictionRows.length;
}

export async function resetKnockoutMatchScoring(matchId: string) {
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("bracket_scores").delete().eq("match_id", matchId);
  if (error) {
    throw error;
  }
}

function deriveBracketHealthStatus(
  championPickId: string | null,
  finalMatch: MatchRow | null,
  predictionsByMatchId: Map<string, BracketPredictionRow>,
  knockoutMatches: MatchRow[],
  previousMatchesByNextMatchId: Map<string, MatchRow[]>
): BracketHealthStatus {
  if (!championPickId || !finalMatch) {
    return "at_risk";
  }

  const championEliminated = knockoutMatches.some(
    (match) =>
      match.status === "final" &&
      match.winner_team_id &&
      [match.home_team_id, match.away_team_id].includes(championPickId) &&
      match.winner_team_id !== championPickId
  );
  if (championEliminated) {
    return "eliminated";
  }

  const championPath = collectPredictedChampionPath(
    finalMatch.id,
    championPickId,
    predictionsByMatchId,
    previousMatchesByNextMatchId,
    new Set<string>()
  );
  const pathBrokenByResults = Array.from(championPath.matchIds).some((matchId) => {
    const match = knockoutMatches.find((candidate) => candidate.id === matchId);
    const predictedWinnerId = predictionsByMatchId.get(matchId)?.predicted_winner_team_id ?? null;
    return Boolean(match?.status === "final" && match.winner_team_id && predictedWinnerId && match.winner_team_id !== predictedWinnerId);
  });

  return championPath.brokenStructure || pathBrokenByResults ? "at_risk" : "alive";
}

function collectPredictedChampionPath(
  matchId: string,
  championTeamId: string,
  predictionsByMatchId: Map<string, BracketPredictionRow>,
  previousMatchesByNextMatchId: Map<string, MatchRow[]>,
  seenMatchIds: Set<string>
): { matchIds: Set<string>; brokenStructure: boolean } {
  if (seenMatchIds.has(matchId)) {
    return { matchIds: new Set(), brokenStructure: false };
  }

  seenMatchIds.add(matchId);
  const matchIds = new Set<string>([matchId]);
  const previousMatches = previousMatchesByNextMatchId.get(matchId) ?? [];

  if (previousMatches.length === 0) {
    return { matchIds, brokenStructure: false };
  }

  const matchingPreviousMatch = previousMatches.find(
    (match) => predictionsByMatchId.get(match.id)?.predicted_winner_team_id === championTeamId
  );

  if (!matchingPreviousMatch) {
    return { matchIds, brokenStructure: true };
  }

  const previousPath = collectPredictedChampionPath(
    matchingPreviousMatch.id,
    championTeamId,
    predictionsByMatchId,
    previousMatchesByNextMatchId,
    seenMatchIds
  );

  for (const previousMatchId of previousPath.matchIds) {
    matchIds.add(previousMatchId);
  }

  return {
    matchIds,
    brokenStructure: previousPath.brokenStructure
  };
}

function getStageOrder(stage: CanonicalKnockoutStage | null) {
  switch (stage) {
    case "r32":
      return 0;
    case "r16":
      return 1;
    case "qf":
      return 2;
    case "sf":
      return 3;
    case "third":
      return 4;
    case "final":
      return 5;
    default:
      return 99;
  }
}

function unwrapJoinedUser(
  value?: { id: string; name: string; avatar_url?: string | null } | Array<{ id: string; name: string; avatar_url?: string | null }> | null
) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getTeamName(teamNameById: Map<string, string>, teamId: string | null | undefined) {
  if (!teamId) {
    return null;
  }

  return teamNameById.get(teamId) ?? teamId;
}
