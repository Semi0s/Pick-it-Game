import { fetchActiveGroupRulesets } from "@/lib/scoped-scoring";
import { normalizeGroupKey } from "@/lib/group-standings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Team } from "@/lib/types";

export type GroupStageMode = "full_scores" | "light_seed_builder";

export type EffectiveGroupStageMode = {
  mode: GroupStageMode;
  isAmbiguous: boolean;
  sourceGroupIds: string[];
};

export type GroupSeedRankingRow = {
  groupName: string;
  rankedTeamIds: string[];
};

export type ThirdPlaceRankingRow = {
  teamId: string;
  rank: number;
};

export type LightSeedBuilderSnapshot = {
  groupRankings: GroupSeedRankingRow[];
  thirdPlaceRankings: ThirdPlaceRankingRow[];
};

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type GroupMemberRow = {
  group_id: string;
};

type GroupOwnerRow = {
  id: string;
};

type GroupSeedRankingRecord = {
  group_name: string;
  rank_position: number;
  team_id: string;
};

type ThirdPlaceRankingRecord = {
  team_id: string;
  rank_position: number;
};

export function normalizeGroupStageMode(value?: string | null): GroupStageMode {
  return value === "light_seed_builder" ? "light_seed_builder" : "full_scores";
}

export async function resolveEffectiveUserGroupStageMode(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<EffectiveGroupStageMode> {
  const [{ data: membershipRows, error: membershipError }, { data: ownedRows, error: ownedError }] = await Promise.all([
    adminSupabase.from("group_members").select("group_id").eq("user_id", userId),
    adminSupabase.from("groups").select("id").eq("owner_user_id", userId)
  ]);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (ownedError) {
    throw new Error(ownedError.message);
  }

  const groupIds = Array.from(
    new Set([
      ...((membershipRows ?? []) as GroupMemberRow[]).map((row) => row.group_id),
      ...((ownedRows ?? []) as GroupOwnerRow[]).map((row) => row.id)
    ])
  ).filter(Boolean);

  if (groupIds.length === 0) {
    return {
      mode: "full_scores",
      isAmbiguous: false,
      sourceGroupIds: []
    };
  }

  const rulesets = await fetchActiveGroupRulesets(adminSupabase, groupIds);
  const modeByGroupId = new Map(
    Array.from(rulesets.entries()).map(([groupId, ruleset]) => [
      groupId,
      normalizeGroupStageMode(ruleset.groupStageMode)
    ])
  );
  const distinctModes = Array.from(new Set(Array.from(modeByGroupId.values())));

  if (distinctModes.length !== 1) {
    return {
      mode: "full_scores",
      isAmbiguous: distinctModes.length > 1,
      sourceGroupIds: Array.from(modeByGroupId.keys())
    };
  }

  return {
    mode: distinctModes[0],
    isAmbiguous: false,
    sourceGroupIds: Array.from(modeByGroupId.keys())
  };
}

export async function fetchUserLightSeedBuilderSnapshot(
  adminSupabase: AdminSupabaseClient,
  userId: string
): Promise<LightSeedBuilderSnapshot> {
  const [{ data: groupRankingRows, error: groupRankingError }, { data: thirdPlaceRows, error: thirdPlaceError }] =
    await Promise.all([
      adminSupabase
        .from("user_group_seed_rankings")
        .select("group_name,rank_position,team_id")
        .eq("user_id", userId)
        .order("group_name", { ascending: true })
        .order("rank_position", { ascending: true }),
      adminSupabase
        .from("user_best_third_rankings")
        .select("team_id,rank_position")
        .eq("user_id", userId)
        .order("rank_position", { ascending: true })
    ]);

  if (groupRankingError) {
    throw new Error(groupRankingError.message);
  }

  if (thirdPlaceError) {
    throw new Error(thirdPlaceError.message);
  }

  const groupRankingMap = new Map<string, string[]>();
  for (const row of (groupRankingRows ?? []) as GroupSeedRankingRecord[]) {
    const groupName = normalizeGroupKey(row.group_name) ?? row.group_name;
    const current = groupRankingMap.get(groupName) ?? [];
    current.push(row.team_id);
    groupRankingMap.set(groupName, current);
  }

  return {
    groupRankings: Array.from(groupRankingMap.entries())
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([groupName, rankedTeamIds]) => ({
        groupName,
        rankedTeamIds
      })),
    thirdPlaceRankings: ((thirdPlaceRows ?? []) as ThirdPlaceRankingRecord[]).map((row) => ({
      teamId: row.team_id,
      rank: row.rank_position
    }))
  };
}

export function buildDefaultLightSeedBuilderSnapshot(teams: Team[]): LightSeedBuilderSnapshot {
  const teamsByGroup = new Map<string, Team[]>();
  for (const team of teams) {
    const groupName = normalizeGroupKey(team.groupName) ?? team.groupName;
    const current = teamsByGroup.get(groupName) ?? [];
    current.push(team);
    teamsByGroup.set(groupName, current);
  }

  return {
    groupRankings: Array.from(teamsByGroup.entries())
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([groupName, groupTeams]) => ({
        groupName,
        rankedTeamIds: [...groupTeams]
          .sort((left, right) => {
            const rankDelta = (left.fifaRank ?? Number.MAX_SAFE_INTEGER) - (right.fifaRank ?? Number.MAX_SAFE_INTEGER);
            if (rankDelta !== 0) {
              return rankDelta;
            }
            return left.name.localeCompare(right.name);
          })
          .map((team) => team.id)
      })),
    thirdPlaceRankings: []
  };
}
