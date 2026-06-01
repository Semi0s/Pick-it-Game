import { normalizeGroupKey } from "@/lib/group-standings";
import type { UnsavedGroupStageDraft } from "@/lib/group-stage-unsaved-draft";
import type { LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import type { ProjectedRoundOf32Match } from "@/lib/knockout-seeding";

export type ScenarioImpactAffectedSlot = {
  slotId: string;
  matchId: string;
  side: "home" | "away";
  previousTeamId: string | null;
  currentTeamId: string | null;
};

export type ScenarioImpactTeam = {
  id: string;
  groupName: string;
};

export type ScenarioImpactSummary = {
  riskDelta: number;
  upsideDelta: number;
  affectedPickCount: number;
  openThirdPlaceSlots: number;
  isScenarioValid: boolean;
  affectedSlots: ScenarioImpactAffectedSlot[];
};

export function getScenarioSlotId(matchId: string, side: "home" | "away") {
  return `${matchId}:${side}`;
}

export function formatSignedScenarioDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export function calculateScenarioImpactFromProjectedMatches({
  savedMatches,
  scenarioMatches,
  activeGroupName,
  teamsById,
  openThirdPlaceSlots
}: {
  savedMatches: ProjectedRoundOf32Match[] | null;
  scenarioMatches: ProjectedRoundOf32Match[];
  activeGroupName: string | null;
  teamsById: Map<string, ScenarioImpactTeam>;
  openThirdPlaceSlots: number;
}): ScenarioImpactSummary {
  const affectedSlots: ScenarioImpactAffectedSlot[] = [];
  const savedMatchById = new Map((savedMatches ?? []).map((match) => [match.matchId, match]));

  for (const scenarioMatch of scenarioMatches) {
    const savedMatch = savedMatchById.get(scenarioMatch.matchId);
    if (!savedMatch) {
      continue;
    }

    (["home", "away"] as const).forEach((side) => {
      const savedSide = savedMatch[side];
      const scenarioSide = scenarioMatch[side];
      if (getProjectedSideIdentity(savedSide) === getProjectedSideIdentity(scenarioSide)) {
        return;
      }

      const shouldCountForActiveGroup =
        !activeGroupName ||
        projectedSideReferencesGroup(savedSide, activeGroupName, teamsById) ||
        projectedSideReferencesGroup(scenarioSide, activeGroupName, teamsById);

      if (!shouldCountForActiveGroup) {
        return;
      }

      affectedSlots.push({
        slotId: getScenarioSlotId(scenarioMatch.matchId, side),
        matchId: scenarioMatch.matchId,
        side,
        previousTeamId: savedSide.teamId,
        currentTeamId: scenarioSide.teamId
      });
    });
  }

  return buildScenarioImpactSummary(affectedSlots, openThirdPlaceSlots);
}

export function calculateScenarioImpactFromSeedDraft({
  savedSnapshot,
  draft,
  requiredThirdPlaceCount
}: {
  savedSnapshot: LightSeedBuilderSnapshot | null | undefined;
  draft: UnsavedGroupStageDraft | null | undefined;
  requiredThirdPlaceCount: number;
}): ScenarioImpactSummary | null {
  if (!savedSnapshot || !draft) {
    return null;
  }

  const affectedSlots: ScenarioImpactAffectedSlot[] = [];
  const savedRankingsByGroup = new Map(
    savedSnapshot.groupRankings.map((ranking) => [
      normalizeGroupKey(ranking.groupName) ?? ranking.groupName,
      ranking.rankedTeamIds
    ])
  );

  for (const ranking of draft.groupRankings) {
    const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
    const savedRanking = savedRankingsByGroup.get(groupName);
    if (!savedRanking) {
      continue;
    }

    for (let index = 0; index < Math.min(3, ranking.rankedTeamIds.length, savedRanking.length); index += 1) {
      const previousTeamId = savedRanking[index] ?? null;
      const currentTeamId = ranking.rankedTeamIds[index] ?? null;
      if (previousTeamId === currentTeamId) {
        continue;
      }

      affectedSlots.push({
        slotId: `${groupName}:${index + 1}`,
        matchId: groupName,
        side: index % 2 === 0 ? "home" : "away",
        previousTeamId,
        currentTeamId
      });
    }
  }

  const savedThirdPlaceIds = savedSnapshot.thirdPlaceRankings
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .slice(0, requiredThirdPlaceCount)
    .map((ranking) => ranking.teamId);
  const draftThirdPlaceIds = draft.thirdPlaceRankings.slice(0, requiredThirdPlaceCount);
  const thirdPlaceCount = Math.max(savedThirdPlaceIds.length, draftThirdPlaceIds.length);

  for (let index = 0; index < thirdPlaceCount; index += 1) {
    const previousTeamId = savedThirdPlaceIds[index] ?? null;
    const currentTeamId = draftThirdPlaceIds[index] ?? null;
    if (previousTeamId === currentTeamId) {
      continue;
    }

    affectedSlots.push({
      slotId: `third:${index + 1}`,
      matchId: "third-place-qualifiers",
      side: index % 2 === 0 ? "home" : "away",
      previousTeamId,
      currentTeamId
    });
  }

  const openThirdPlaceSlots = Math.max(0, requiredThirdPlaceCount - draftThirdPlaceIds.length);
  return buildScenarioImpactSummary(affectedSlots, openThirdPlaceSlots);
}

function getProjectedSideIdentity(side: ProjectedRoundOf32Match["home"] | ProjectedRoundOf32Match["away"]) {
  return side.teamId ?? side.sourceSlot ?? side.sourceLabel;
}

function projectedSideReferencesGroup(
  side: ProjectedRoundOf32Match["home"] | ProjectedRoundOf32Match["away"] | undefined,
  groupName: string | null,
  teamsById: Map<string, ScenarioImpactTeam>
) {
  if (!side || !groupName) {
    return false;
  }

  const normalizedGroupName = normalizeGroupKey(groupName) ?? groupName;
  if (side.teamId && teamsById.get(side.teamId)?.groupName === normalizedGroupName) {
    return true;
  }

  const sourceSlot = side.sourceSlot?.toUpperCase();
  if (sourceSlot?.endsWith(normalizedGroupName)) {
    return true;
  }

  const sourceLabel = side.sourceLabel.toUpperCase();
  return sourceLabel.includes(`GROUP ${normalizedGroupName}`) || sourceLabel.includes(`/${normalizedGroupName}`);
}

function buildScenarioImpactSummary(
  affectedSlots: ScenarioImpactAffectedSlot[],
  openThirdPlaceSlots: number
): ScenarioImpactSummary {
  // TODO: Replace this deterministic placeholder with simulation-derived P20/P80
  // deltas once the scoring simulator can compare saved-vs-scenario brackets.
  const affectedPickCount = affectedSlots.length;
  return {
    riskDelta: affectedPickCount > 0 ? -Math.max(1, Math.ceil(affectedPickCount * 2)) : 0,
    upsideDelta: affectedPickCount > 0 ? Math.max(1, affectedPickCount * 6) : 0,
    affectedPickCount,
    openThirdPlaceSlots,
    isScenarioValid: openThirdPlaceSlots === 0,
    affectedSlots
  };
}
