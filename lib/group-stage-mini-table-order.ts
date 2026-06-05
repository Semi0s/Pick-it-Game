export type PredictionSlotOrderedRow<T> = {
  row: T;
  displayRank: number;
};

export function orderRowsByPredictionSlots<T extends { teamId: string }>(
  rows: readonly T[],
  predictedPlacementByTeamId: ReadonlyMap<string, number>
): Array<PredictionSlotOrderedRow<T>> {
  const teamIdsInRows = new Set(rows.map((row) => row.teamId));
  const usedTeamIds = new Set<string>();
  const usedRanks = new Set<number>();
  const predictedRowsByRank = new Map<number, T>();

  for (const row of rows) {
    const predictedRank = predictedPlacementByTeamId.get(row.teamId);
    if (
      !predictedRank ||
      predictedRank < 1 ||
      predictedRank > rows.length ||
      usedRanks.has(predictedRank) ||
      usedTeamIds.has(row.teamId) ||
      !teamIdsInRows.has(row.teamId)
    ) {
      continue;
    }

    predictedRowsByRank.set(predictedRank, row);
    usedRanks.add(predictedRank);
    usedTeamIds.add(row.teamId);
  }

  const unpredictedRows = rows.filter((row) => !usedTeamIds.has(row.teamId));
  let unpredictedIndex = 0;

  return Array.from({ length: rows.length }, (_, index) => {
    const displayRank = index + 1;
    const predictedRow = predictedRowsByRank.get(displayRank);
    if (predictedRow) {
      return { row: predictedRow, displayRank };
    }

    const fallbackRow = unpredictedRows[unpredictedIndex] ?? rows[index];
    unpredictedIndex += 1;
    return { row: fallbackRow, displayRank };
  });
}
