import { normalizeGroupKey } from "./group-standings.ts";

export type GroupTopTwoRankingInput = {
  groupName: string;
  rankedTeamIds: readonly string[];
};

export type GroupTopTwoCompletionInput = {
  groupNames: readonly string[];
  rankings: readonly GroupTopTwoRankingInput[];
  teamIdsByGroup?: ReadonlyMap<string, ReadonlySet<string>>;
  touchedGroupNames?: ReadonlySet<string>;
};

export type GroupTopTwoCompletionStatus = {
  isComplete: boolean;
  completeGroupNames: Set<string>;
  incompleteGroupNames: string[];
};

export function getGroupTopTwoCompletionStatus(input: GroupTopTwoCompletionInput): GroupTopTwoCompletionStatus {
  const rankingByGroup = new Map(
    input.rankings.map((ranking) => [normalizeGroupName(ranking.groupName), ranking.rankedTeamIds] as const)
  );
  const completeGroupNames = new Set<string>();
  const incompleteGroupNames: string[] = [];

  for (const rawGroupName of input.groupNames) {
    const groupName = normalizeGroupName(rawGroupName);
    const rankedTeamIds = rankingByGroup.get(groupName) ?? [];
    const validTeamIds = input.teamIdsByGroup?.get(groupName);
    const isTouched = input.touchedGroupNames ? input.touchedGroupNames.has(groupName) : true;

    if (isTouched && hasCompleteTopTwo(rankedTeamIds, validTeamIds)) {
      completeGroupNames.add(groupName);
    } else {
      incompleteGroupNames.push(groupName);
    }
  }

  return {
    isComplete: input.groupNames.length > 0 && incompleteGroupNames.length === 0,
    completeGroupNames,
    incompleteGroupNames
  };
}

export function hasCompleteTopTwo(
  rankedTeamIds: readonly string[],
  validTeamIds?: ReadonlySet<string>
) {
  const firstTeamId = normalizeTeamId(rankedTeamIds[0]);
  const secondTeamId = normalizeTeamId(rankedTeamIds[1]);

  if (!firstTeamId || !secondTeamId || firstTeamId === secondTeamId) {
    return false;
  }

  if (validTeamIds && (!validTeamIds.has(firstTeamId) || !validTeamIds.has(secondTeamId))) {
    return false;
  }

  return true;
}

function normalizeGroupName(groupName: string) {
  return normalizeGroupKey(groupName) ?? groupName;
}

function normalizeTeamId(teamId?: string | null) {
  return teamId?.trim() || null;
}
