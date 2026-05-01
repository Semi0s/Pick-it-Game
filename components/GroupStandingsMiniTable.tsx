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
  className
}: {
  rows: MiniGroupStandingsRow[];
  homeTeamId?: string | null;
  movementByTeamId?: Record<string, MiniGroupStandingsMovement>;
  className?: string;
}) {
  return (
    <div className={className ?? ""}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-[10px]">
          <thead className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Team</th>
              <th className="px-2 py-1.5 text-right">P</th>
              <th className="px-2 py-1.5 text-right">W</th>
              <th className="px-2 py-1.5 text-right">D</th>
              <th className="px-2 py-1.5 text-right">L</th>
              <th className="px-2 py-1.5 text-right">GF</th>
              <th className="px-2 py-1.5 text-right">GA</th>
              <th className="px-2 py-1.5 text-right">GD</th>
              <th className="px-2 py-1.5 text-right">Pts</th>
              <th className="px-2 py-1.5 text-center">Advance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row, index) => {
              const isHomeTeam = Boolean(homeTeamId && row.teamId === homeTeamId);
              const movement = movementByTeamId?.[row.teamId];

              return (
                <tr key={row.teamId} className={isHomeTeam ? "bg-amber-50" : ""}>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <p className="truncate font-semibold uppercase tracking-wide text-gray-900">{row.shortName}</p>
                      {movement ? (
                        <span
                          className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            movement === "up" ? "bg-amber-100 text-gray-800" : "bg-amber-100 text-gray-800"
                          }`}
                        >
                          {movement === "up" ? "↑ up" : "↓ down"}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{row.played}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{row.wins}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{row.draws}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{row.losses}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{row.goalsFor}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{row.goalsAgainst}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{row.goalDifference}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-gray-900">{row.points}</td>
                  <td className="px-2 py-1.5 text-center">
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
