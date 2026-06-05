export function normalizeRankingSlotsForPersistence(
  rankedTeamIds: readonly (string | null | undefined)[],
  validTeamIds?: ReadonlySet<string>
) {
  const seenTeamIds = new Set<string>();
  const normalized = rankedTeamIds.map((teamId) => {
    const normalizedTeamId = teamId?.trim() || "";
    if (
      !normalizedTeamId ||
      seenTeamIds.has(normalizedTeamId) ||
      (validTeamIds && !validTeamIds.has(normalizedTeamId))
    ) {
      return "";
    }

    seenTeamIds.add(normalizedTeamId);
    return normalizedTeamId;
  });

  return trimTrailingEmptySlots(normalized);
}

export function completeRankingSlotsForProjection(
  rankedTeamIds: readonly (string | null | undefined)[],
  defaultTeamIds: readonly string[]
) {
  const validTeamIds = defaultTeamIds.length > 0 ? new Set(defaultTeamIds) : undefined;
  const normalized = normalizeRankingSlotsForPersistence(rankedTeamIds, validTeamIds);
  const firstTeamId = normalized[0] ?? "";
  const secondTeamId = normalized[1] ?? "";

  if (!firstTeamId || !secondTeamId || firstTeamId === secondTeamId) {
    return normalized;
  }

  const selectedTeamIds = new Set(normalized.filter(Boolean));
  const lowerRankedTeamIds = normalized.slice(2).filter((teamId): teamId is string => Boolean(teamId));

  return [
    firstTeamId,
    secondTeamId,
    ...lowerRankedTeamIds,
    ...defaultTeamIds.filter((teamId) => !selectedTeamIds.has(teamId))
  ];
}

function trimTrailingEmptySlots(rankedTeamIds: string[]) {
  let lastRankedIndex = -1;
  for (let index = rankedTeamIds.length - 1; index >= 0; index -= 1) {
    if (rankedTeamIds[index]) {
      lastRankedIndex = index;
      break;
    }
  }

  return lastRankedIndex >= 0 ? rankedTeamIds.slice(0, lastRankedIndex + 1) : [];
}
