import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXPECTED_KNOCKOUT_MATCH_COUNTS,
  formatMatchStage,
  isKnockoutStage,
  isRoundOf32Stage,
  normalizeKnockoutStage,
  type CanonicalKnockoutStage
} from "@/lib/match-stage";
import type { BracketPrediction, MatchNextSlot, MatchStage, MatchStatus } from "@/lib/types";

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

    return mapBracketPredictionRow(data as BracketPredictionRow);
  }

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

  return mapBracketPredictionRow(data as BracketPredictionRow);
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
