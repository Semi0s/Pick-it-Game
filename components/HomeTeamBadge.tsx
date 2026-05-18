"use client";

import { getTeam } from "@/lib/mock-data";

export function HomeTeamBadge({
  teamId,
  label = "Home Team",
  className = "",
  compact = false
}: {
  teamId?: string | null;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const team = getTeam(teamId ?? undefined);
  if (!team) {
    return null;
  }

  return (
    <span
      className={`ui-chip-sm items-center border border-gray-200 bg-white/85 font-bold text-gray-700 ${
        compact ? "gap-1.5" : "gap-2"
      } ${className}`.trim()}
    >
      {compact ? (
        <span className="text-gray-900">{team.shortName}</span>
      ) : (
        <>
          {label ? <span className="text-gray-500">{label}</span> : null}
          <span className="text-gray-900">{team.name}</span>
        </>
      )}
    </span>
  );
}
