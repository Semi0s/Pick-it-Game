import "server-only";

import { scoreBracketPrediction } from "@/lib/bracket-scoring";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPECTED_KNOCKOUT_MATCH_COUNTS,
  formatMatchStage,
  isKnockoutStage,
  isRoundOf32Stage,
  normalizeKnockoutStage,
  type CanonicalKnockoutStage
} from "@/lib/match-stage";
import type { BracketPrediction, BracketScore, MatchNextSlot, MatchStage, MatchStatus } from "@/lib/types";

type MatchRow = {
  id: string;
  stage: MatchStage;
  kickoff_time: string;
  status: MatchStatus;
  home_team_id?: string | null;
  away_team_id?: string | null;
  winner_team_id?: string | null;
  next_match_id?: string | null;
  next_match_slot?: MatchNextSlot | null;
};

type BracketPredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
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
  points: number;
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
  homeTeam: BracketTeamOption | null;
  awayTeam: BracketTeamOption | null;
  predictedWinnerTeamId: string | null;
  actualWinnerTeamId: string | null;
  awardedPoints: number;
  isCorrectWinner: boolean | null;
  isLocked: boolean;
  canSelectWinner: boolean;
};

export type KnockoutBracketStageView = {
  stage: CanonicalKnockoutStage;
  label: string;
  matches: KnockoutBracketMatchView[];
};

export type KnockoutBracketEditorView = {
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
};

export type BracketScoreSummary = {
  bracketPoints: number;
  correctPicks: number;
};

export async function canEditBracketPredictions() {
  const adminSupabase = createAdminClient();
  const editState = await getBracketEditState(adminSupabase);
  return editState.editable;
}

export async function fetchUserBracketPredictions(userId: string): Promise<BracketPrediction[]> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("bracket_predictions")
    .select("id,user_id,match_id,predicted_winner_team_id,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as BracketPredictionRow[]).map(mapBracketPredictionRow);
}

export async function saveBracketPrediction(
  userId: string,
  matchId: string,
  teamId: string
): Promise<BracketPrediction> {
  const adminSupabase = createAdminClient();
  const editState = await getBracketEditState(adminSupabase);
  if (!editState.editable) {
    if (editState.reason === "not_seeded") {
      throw new Error("Knockout picks are not available until the Round of 32 is seeded.");
    }

    throw new Error("Knockout picks are locked because the first Round of 32 match has already started.");
  }

  const { data: match, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,stage,kickoff_time,status,home_team_id,away_team_id,winner_team_id,next_match_id,next_match_slot")
    .eq("id", matchId)
    .single();

  if (matchError) {
    throw matchError;
  }

  const matchRow = match as MatchRow;
  if (!isKnockoutStage(matchRow.stage)) {
    throw new Error("Bracket picks can only be saved for knockout matches.");
  }

  if (!matchRow.home_team_id || !matchRow.away_team_id) {
    throw new Error(`This ${formatMatchStage(matchRow.stage).toLowerCase()} match is not fully seeded yet.`);
  }

  if (![matchRow.home_team_id, matchRow.away_team_id].includes(teamId)) {
    throw new Error("Choose one of the two teams in this match.");
  }

  const now = new Date().toISOString();
  const { data: existingPrediction, error: existingPredictionError } = await adminSupabase
    .from("bracket_predictions")
    .select("id")
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (existingPredictionError) {
    throw existingPredictionError;
  }

  let savedPrediction: BracketPrediction;
  if ((existingPrediction as { id?: string } | null)?.id) {
    const { data, error } = await adminSupabase
      .from("bracket_predictions")
      .update({
        predicted_winner_team_id: teamId,
        updated_at: now
      })
      .eq("id", (existingPrediction as { id: string }).id)
      .select("id,user_id,match_id,predicted_winner_team_id,created_at,updated_at")
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
        match_id: matchId,
        predicted_winner_team_id: teamId,
        updated_at: now
      })
      .select("id,user_id,match_id,predicted_winner_team_id,created_at,updated_at")
      .single();

    if (error) {
      throw error;
    }

    savedPrediction = mapBracketPredictionRow(data as BracketPredictionRow);
  }

  await clearInvalidDescendantPredictions(adminSupabase, userId, matchId);
  return savedPrediction;
}

export async function fetchKnockoutStructureStatus(): Promise<KnockoutStructureStatus> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,kickoff_time")
    .neq("stage", "group");

  if (error) {
    throw error;
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
  for (const row of ((data ?? []) as Array<{ id: string; stage: MatchStage; kickoff_time: string }>)) {
    const canonicalStage = normalizeKnockoutStage(row.stage);
    if (!canonicalStage) {
      continue;
    }

    counts[canonicalStage] += 1;

    if (isRoundOf32Stage(row.stage) && row.kickoff_time) {
      if (!firstRoundOf32Kickoff || row.kickoff_time < firstRoundOf32Kickoff) {
        firstRoundOf32Kickoff = row.kickoff_time;
      }
    }
  }

  const isFullySeeded = (Object.keys(EXPECTED_KNOCKOUT_MATCH_COUNTS) as CanonicalKnockoutStage[]).every(
    (stage) => counts[stage] >= EXPECTED_KNOCKOUT_MATCH_COUNTS[stage]
  );

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
    bracketPoints: scoreRows.reduce((sum, score) => sum + score.points, 0),
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
    isSeeded: knockoutData.status.isFullySeeded,
    isLocked: !editState.editable,
    lockReason: editState.editable ? null : editState.reason,
    firstRoundOf32Kickoff: knockoutData.status.firstRoundOf32Kickoff,
    bracketPoints: scoreSummary.bracketPoints,
    correctPicks: scoreSummary.correctPicks,
    stages: stages.filter((stage) => stage.stage !== "third"),
    champion: championTeamId ? knockoutData.teamsById.get(championTeamId) ?? null : null,
    thirdPlace: stages.find((stage) => stage.stage === "third")?.matches[0] ?? null,
    predictions
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
    throw error;
  }

  return ((data ?? []) as BracketScoreRow[]).map(mapBracketScoreRow);
}

export async function fetchUserBracketScoreSummary(userId: string): Promise<BracketScoreSummary> {
  const scores = await fetchUserBracketScores(userId);
  return {
    bracketPoints: scores.reduce((sum, score) => sum + score.points, 0),
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
  const fallbackGroupId = visibleGroups[0]?.id ?? null;
  const resolvedGroupId =
    selectedGroupId && visibleGroups.some((group) => group.id === selectedGroupId) ? selectedGroupId : fallbackGroupId;

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
        .select("id,stage,kickoff_time,status,home_team_id,away_team_id,winner_team_id,next_match_id,next_match_slot")
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
      ? await adminSupabase.from("teams").select("id,name,short_name").in("id", Array.from(teamIds))
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

  const selectedMember =
    (selectedPlayerId ? memberSummaries.find((member) => member.userId === selectedPlayerId) : null) ?? memberSummaries[0] ?? null;

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
    .select("kickoff_time,stage")
    .neq("stage", "group")
    .order("kickoff_time", { ascending: true });

  if (error) {
    throw error;
  }

  const firstRoundOf32Kickoff =
    ((matches ?? []) as Array<{ kickoff_time: string; stage: MatchStage }>)
      .filter((match) => isRoundOf32Stage(match.stage))
      .map((match) => match.kickoff_time)
      .find(Boolean) ?? null;
  if (!firstRoundOf32Kickoff) {
    return { editable: false, reason: "not_seeded", firstRoundOf32Kickoff: null };
  }

  if (new Date(firstRoundOf32Kickoff).getTime() <= Date.now()) {
    return { editable: false, reason: "locked", firstRoundOf32Kickoff };
  }

  return { editable: true, firstRoundOf32Kickoff };
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
      .select("id,stage,kickoff_time,status,home_team_id,away_team_id,winner_team_id,next_match_id,next_match_slot")
      .neq("stage", "group"),
    fetchKnockoutStructureStatus()
  ]);

  if (matchesError) {
    throw matchesError;
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
      ? await adminSupabase.from("teams").select("id,name,short_name").in("id", Array.from(teamIds))
      : { data: [], error: null };

  if (teamsError) {
    throw teamsError;
  }

  const teamsById = new Map<string, BracketTeamOption>(
    ((teams ?? []) as TeamRow[]).map((team) => [
      team.id,
      {
        id: team.id,
        name: team.name || team.short_name || team.id,
        shortName: team.short_name || team.name || team.id
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
  isLocked: boolean
): KnockoutBracketStageView[] {
  const stagesById = new Map<CanonicalKnockoutStage, KnockoutBracketMatchView[]>();
  const previousMatchesByNextMatchId = new Map<string, MatchRow[]>();
  for (const match of matches) {
    if (!match.next_match_id) {
      continue;
    }

    const current = previousMatchesByNextMatchId.get(match.next_match_id) ?? [];
    current.push(match);
    previousMatchesByNextMatchId.set(match.next_match_id, current);
  }

  for (const match of matches) {
    const stage = normalizeKnockoutStage(match.stage);
    if (!stage) {
      continue;
    }

    const previousMatches = previousMatchesByNextMatchId.get(match.id) ?? [];
    const homeSource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "home");
    const awaySource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "away");
    const availableTeams = getAvailablePredictedTeamsForMatch(match, previousMatchesByNextMatchId, predictionsByMatchId, teamsById);
    const predictedWinnerTeamId = predictionsByMatchId.get(match.id)?.predictedWinnerTeamId ?? null;
    const validPredictedWinnerTeamId =
      predictedWinnerTeamId &&
      [availableTeams.homeTeam?.id, availableTeams.awayTeam?.id].includes(predictedWinnerTeamId)
        ? predictedWinnerTeamId
        : null;

    const currentStageMatches = stagesById.get(stage) ?? [];
    currentStageMatches.push({
      matchId: match.id,
      stage,
      stageLabel: formatMatchStage(match.stage),
      title: `${formatMatchStage(match.stage)} ${currentStageMatches.length + 1}`,
      kickoffTime: match.kickoff_time,
      status: match.status,
      seededHomeTeam: match.home_team_id ? teamsById.get(match.home_team_id) ?? null : null,
      seededAwayTeam: match.away_team_id ? teamsById.get(match.away_team_id) ?? null : null,
      homeSourceMatchId: homeSource?.id ?? null,
      awaySourceMatchId: awaySource?.id ?? null,
      homeTeam: availableTeams.homeTeam,
      awayTeam: availableTeams.awayTeam,
      predictedWinnerTeamId: validPredictedWinnerTeamId,
      actualWinnerTeamId: match.winner_team_id ?? null,
      awardedPoints: scoresByMatchId.get(match.id)?.points ?? 0,
      isCorrectWinner: scoresByMatchId.get(match.id)?.isCorrect ?? null,
      isLocked,
      canSelectWinner: Boolean(availableTeams.homeTeam && availableTeams.awayTeam) && !isLocked
    });
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
  teamsById: Map<string, BracketTeamOption>
) {
  const previousMatches = previousMatchesByNextMatchId.get(match.id) ?? [];
  const homeSource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "home");
  const awaySource = previousMatches.find((previousMatch) => previousMatch.next_match_slot === "away");
  const homeTeamId =
    (homeSource
      ? predictionsByMatchId.get(homeSource.id)?.predictedWinnerTeamId ??
        predictionsByMatchId.get(homeSource.id)?.predicted_winner_team_id ??
        null
      : null) ??
    match.home_team_id ??
    null;
  const awayTeamId =
    (awaySource
      ? predictionsByMatchId.get(awaySource.id)?.predictedWinnerTeamId ??
        predictionsByMatchId.get(awaySource.id)?.predicted_winner_team_id ??
        null
      : null) ??
    match.away_team_id ??
    null;

  return {
    homeTeam: homeTeamId ? teamsById.get(homeTeamId) ?? null : null,
    awayTeam: awayTeamId ? teamsById.get(awayTeamId) ?? null : null
  };
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
    predictedWinnerTeamId: row.predicted_winner_team_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
    championPoints: row.champion_points,
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
    .select("id,stage,status,winner_team_id")
    .eq("id", matchId)
    .single();

  if (matchError) {
    throw matchError;
  }

  const matchRow = match as Pick<MatchRow, "id" | "stage" | "status" | "winner_team_id">;
  if (!matchRow.winner_team_id || matchRow.status !== "final" || !isKnockoutStage(matchRow.stage)) {
    return 0;
  }

  const { data: predictions, error: predictionsError } = await adminSupabase
    .from("bracket_predictions")
    .select("id,user_id,match_id,predicted_winner_team_id,created_at,updated_at")
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
          winnerTeamId: matchRow.winner_team_id
        },
        prediction.predicted_winner_team_id
      );

      return {
        user_id: prediction.user_id,
        match_id: prediction.match_id,
        stage: matchRow.stage,
        predicted_winner_team_id: prediction.predicted_winner_team_id,
        actual_winner_team_id: matchRow.winner_team_id,
        round_points: breakdown.roundPoints,
        champion_points: breakdown.championPoints,
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
