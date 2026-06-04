import type { GroupSeedRankingInput } from "@/lib/knockout-seeding";

export const GROUP_STAGE_UNSAVED_DRAFT_STORAGE_KEY = "pickit:group-stage-builder-unsaved-draft:v1";

export type UnsavedGroupStageDraft = {
  groupRankings: GroupSeedRankingInput[];
  thirdPlaceRankings: string[];
  touchedGroupNames: string[];
  hasTouchedThirdPlaceRanking: boolean;
  changedSinceAt: string;
};

export function parseUnsavedGroupStageDraft(rawValue: string | null | undefined): UnsavedGroupStageDraft | null {
  if (!rawValue) {
    return null;
  }

  try {
    const draft = JSON.parse(rawValue) as Partial<UnsavedGroupStageDraft>;
    if (!Array.isArray(draft.groupRankings) || draft.groupRankings.length === 0) {
      return null;
    }

    const groupRankings = draft.groupRankings
      .filter((ranking): ranking is GroupSeedRankingInput =>
        typeof ranking?.groupName === "string" &&
        ranking.groupName.length > 0 &&
        Array.isArray(ranking.rankedTeamIds)
      )
      .map((ranking) => ({
        groupName: ranking.groupName,
        rankedTeamIds: ranking.rankedTeamIds.filter((teamId): teamId is string => typeof teamId === "string" && teamId.length > 0)
      }))
      .filter((ranking) => ranking.rankedTeamIds.length > 0);

    if (groupRankings.length === 0) {
      return null;
    }

    return {
      groupRankings,
      thirdPlaceRankings: Array.isArray(draft.thirdPlaceRankings)
        ? draft.thirdPlaceRankings.filter((teamId): teamId is string => typeof teamId === "string")
        : [],
      touchedGroupNames: Array.isArray(draft.touchedGroupNames)
        ? draft.touchedGroupNames.filter((groupName): groupName is string => typeof groupName === "string" && groupName.length > 0)
        : groupRankings.map((ranking) => ranking.groupName),
      hasTouchedThirdPlaceRanking: Boolean(draft.hasTouchedThirdPlaceRanking),
      changedSinceAt: typeof draft.changedSinceAt === "string" ? draft.changedSinceAt : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function hasCurrentUnsavedGroupStageDraft(
  rawValue: string | null | undefined,
  options: { lastCommittedAt?: string | null } = {}
): boolean {
  const draft = parseUnsavedGroupStageDraft(rawValue);
  if (!draft) {
    return false;
  }

  if (!options.lastCommittedAt) {
    return true;
  }

  const changedSinceMs = new Date(draft.changedSinceAt).getTime();
  const committedMs = new Date(options.lastCommittedAt).getTime();

  if (!Number.isFinite(changedSinceMs) || !Number.isFinite(committedMs)) {
    return true;
  }

  return changedSinceMs > committedMs;
}
