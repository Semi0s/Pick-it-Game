"use client";

import { getTeam } from "@/lib/mock-data";

export function HomeTeamBadge({
  teamId,
  label = "Home Team",
  className = ""
}: {
  teamId?: string | null;
  label?: string;
  className?: string;
}) {
  const team = getTeam(teamId ?? undefined);
  if (!team) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white/85 px-2.5 py-1 text-xs font-bold text-gray-700 ${className}`.trim()}
    >
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[11px]"
      >
        {team.flagEmoji}
      </span>
      {label ? <span className="text-gray-500">{label}</span> : null}
      <span className="text-gray-900">{team.name}</span>
    </span>
  );
}
