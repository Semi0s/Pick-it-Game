"use client";

import { Check } from "lucide-react";

export type MiniGroupStandingsRow = {
  teamId: string;
  teamName: string;
  shortName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type MiniGroupStandingsMovement = "up" | "down";

export function GroupStandingsMiniTable({
  rows,
  homeTeamId = null,
  movementByTeamId,
  className,
  showPlayedColumn = true,
  showMovementColumn = false
}: {
  rows: MiniGroupStandingsRow[];
  homeTeamId?: string | null;
  movementByTeamId?: Record<string, MiniGroupStandingsMovement>;
  className?: string;
  showPlayedColumn?: boolean;
  showMovementColumn?: boolean;
}) {
  return (
    <div className={className ?? ""}>
      <div className="overflow-x-auto">
        <table className="mx-auto min-w-[460px] w-full table-fixed divide-y divide-gray-200 text-[10px]">
          <colgroup>
            <col className="w-[74px]" />
            {showMovementColumn ? <col className="w-[24px]" /> : null}
            {showPlayedColumn ? <col className="w-[30px]" /> : null}
            <col className="w-[30px]" />
            <col className="w-[30px]" />
            <col className="w-[30px]" />
            <col className="w-[30px]" />
            <col className="w-[30px]" />
            <col className="w-[30px]" />
            <col className="w-[30px]" />
            <col className="w-[62px]" />
          </colgroup>
          <thead className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-1.5 py-1.5 text-center whitespace-nowrap">Team</th>
              {showMovementColumn ? <th className="px-1 py-1.5 text-center" aria-label="Movement" /> : null}
              {showPlayedColumn ? <th className="px-[0.6rem] py-1.5 text-center">P</th> : null}
              <th className="px-[0.6rem] py-1.5 text-center">W</th>
              <th className="px-[0.6rem] py-1.5 text-center">D</th>
              <th className="px-[0.6rem] py-1.5 text-center">L</th>
              <th className="px-[0.6rem] py-1.5 text-center">GF</th>
              <th className="px-[0.6rem] py-1.5 text-center">GA</th>
              <th className="px-[0.6rem] py-1.5 text-center">GD</th>
              <th className="px-[0.6rem] py-1.5 text-center">Pts</th>
              <th className="px-1.5 py-1.5 text-center whitespace-nowrap">Advance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row, index) => {
              const isHomeTeam = Boolean(homeTeamId && row.teamId === homeTeamId);
              const movement = movementByTeamId?.[row.teamId];
              const rowHighlightClass = isHomeTeam ? "bg-amber-100/80" : "";

              return (
                <tr key={row.teamId}>
                  <td className={`px-1.5 py-1.5 text-center ${rowHighlightClass}`}>
                    <p className="whitespace-nowrap font-semibold uppercase tracking-wide text-gray-900">{row.shortName}</p>
                  </td>
                  {showMovementColumn ? (
                    <td className={`px-1 py-1.5 text-center ${rowHighlightClass}`}>
                      {movement ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-800">
                          {movement === "up" ? "↑" : "↓"}
                        </span>
                      ) : null}
                    </td>
                  ) : null}
                  {showPlayedColumn ? (
                    <td className={`px-[0.6rem] py-1.5 text-center font-semibold text-gray-700 ${rowHighlightClass}`}>{row.played}</td>
                  ) : null}
                  <td className={`px-[0.6rem] py-1.5 text-center font-semibold text-gray-700 ${rowHighlightClass}`}>{row.wins}</td>
                  <td className={`px-[0.6rem] py-1.5 text-center font-semibold text-gray-700 ${rowHighlightClass}`}>{row.draws}</td>
                  <td className={`px-[0.6rem] py-1.5 text-center font-semibold text-gray-700 ${rowHighlightClass}`}>{row.losses}</td>
                  <td className={`px-[0.6rem] py-1.5 text-center font-semibold text-gray-700 ${rowHighlightClass}`}>{row.goalsFor}</td>
                  <td className={`px-[0.6rem] py-1.5 text-center font-semibold text-gray-700 ${rowHighlightClass}`}>{row.goalsAgainst}</td>
                  <td className={`px-[0.6rem] py-1.5 text-center font-semibold text-gray-700 ${rowHighlightClass}`}>{row.goalDifference}</td>
                  <td className={`px-[0.6rem] py-1.5 text-center font-bold text-gray-900 ${rowHighlightClass}`}>{row.points}</td>
                  <td className={`px-1.5 py-1.5 text-center ${rowHighlightClass}`}>
                    {index < 2 ? (
                      <span className="inline-flex items-center justify-center text-green-700">
                        <Check aria-hidden className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
