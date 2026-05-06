"use client";

export type MiniGroupStandingsRow = {
  teamId: string;
  teamName: string;
  teamCode?: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  isHomeTeam?: boolean;
  isQualifier?: boolean;
  isPossibleQualifier?: boolean;
};

export type MiniGroupStandingsMovement = "up" | "down";

export function GroupStandingsMiniTable({
  rows,
  movementByTeamId,
  className,
  showPlayedColumn = true,
  emptyState
}: {
  rows: MiniGroupStandingsRow[];
  movementByTeamId?: Record<string, MiniGroupStandingsMovement>;
  className?: string;
  showPlayedColumn?: boolean;
  emptyState?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className={className ?? ""}>
        <p className="text-xs font-semibold text-gray-500">
          {emptyState ?? "Standings will appear as group matches go final."}
        </p>
      </div>
    );
  }

  return (
    <div className={className ?? ""}>
      <div className="mx-auto w-full max-w-[30rem]">
      <table className="mx-auto w-full table-fixed divide-y divide-gray-200 text-[9px] sm:text-[10px]">
        <colgroup>
          <col className="w-5 sm:w-6" />
          <col className="w-4 sm:w-5" />
          <col />
          {showPlayedColumn ? <col className="w-5 sm:w-6" /> : null}
          <col className="w-5 sm:w-6" />
          <col className="w-5 sm:w-6" />
          <col className="w-5 sm:w-6" />
          <col className="w-7 sm:w-8" />
          <col className="w-7 sm:w-8" />
        </colgroup>
        <thead className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-0.5 py-1 text-center whitespace-nowrap">#</th>
            <th className="px-0 py-1 text-center whitespace-nowrap" aria-label="Movement" />
            <th className="px-0.5 py-1 text-left whitespace-nowrap">Team</th>
            {showPlayedColumn ? <th className="px-0.5 py-1 text-center whitespace-nowrap">P</th> : null}
            <th className="px-0.5 py-1 text-center whitespace-nowrap">W</th>
            <th className="px-0.5 py-1 text-center whitespace-nowrap">D</th>
            <th className="px-0.5 py-1 text-center whitespace-nowrap">L</th>
            <th className="px-0.5 py-1 text-center whitespace-nowrap">GD</th>
            <th className="px-0.5 py-1 text-center whitespace-nowrap">Pts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row) => {
            const movement = movementByTeamId?.[row.teamId];
            const rowClassName = row.isQualifier
              ? row.isHomeTeam
                ? "bg-emerald-200/90"
                : "bg-emerald-50"
              : row.isPossibleQualifier
                ? "bg-emerald-50/60"
                : row.isHomeTeam
                  ? "bg-amber-100/80"
                  : "";

            return (
              <tr key={row.teamId} className={rowClassName}>
                <td className="px-0.5 py-1 text-center font-bold text-gray-900">
                  <span>{row.rank}</span>
                </td>
                <td className="px-0 py-1 text-center">
                  {movement ? (
                    <span
                      className={`text-[8px] font-bold leading-none ${
                        movement === "up" ? "text-emerald-700" : "text-amber-700"
                      }`}
                      aria-label={movement === "up" ? "Moved up" : "Moved down"}
                    >
                      {movement === "up" ? "↑" : "↓"}
                    </span>
                  ) : null}
                </td>
                <td className="px-0.5 py-1 text-left">
                  <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-gray-900 sm:text-[10px]">
                    {row.teamCode ?? row.teamName}
                  </p>
                </td>
                {showPlayedColumn ? (
                  <td className="px-0.5 py-1 text-center font-semibold text-gray-700">{row.played}</td>
                ) : null}
                <td className="px-0.5 py-1 text-center font-semibold text-gray-700">{row.wins}</td>
                <td className="px-0.5 py-1 text-center font-semibold text-gray-700">{row.draws}</td>
                <td className="px-0.5 py-1 text-center font-semibold text-gray-700">{row.losses}</td>
                <td className="px-0.5 py-1 text-center font-semibold text-gray-700">{row.goalDifference}</td>
                <td className="px-0.5 py-1 text-center font-bold text-gray-900">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
