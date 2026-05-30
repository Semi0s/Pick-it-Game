"use client";

import { t } from "@/lib/strings";

export type MiniGroupStandingsRow = {
  teamId: string;
  teamName: string;
  teamCode?: string;
  flagEmoji?: string | null;
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
  isEliminated?: boolean;
  pickProbability?: {
    probability: number | null;
    predictedPlace: 1 | 2 | 3 | 4;
    mode: "exact_place" | "advance";
    targetLabel: "1st" | "2nd" | "advance";
  } | null;
};

export type MiniGroupStandingsMovement = "up" | "down";

export function GroupStandingsMiniTable({
  rows,
  movementByTeamId,
  className,
  showPlayedColumn = true,
  emptyState,
  language
}: {
  rows: MiniGroupStandingsRow[];
  movementByTeamId?: Record<string, MiniGroupStandingsMovement>;
  className?: string;
  showPlayedColumn?: boolean;
  emptyState?: string;
  language?: string | null;
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
      <div className="mx-auto w-full max-w-[38rem] md:max-w-[46rem]">
        <table className="mini-standings-table mx-auto w-full table-fixed divide-y divide-gray-200 text-[9px] sm:text-[10px] md:text-[12px]">
          <colgroup>
            <col className="w-[0.75rem] sm:w-[0.85rem] md:w-[1.65rem]" />
            <col className="w-[1.8rem] sm:w-[2.2rem] md:w-[3.25rem]" />
            <col className="w-[4.9rem] min-[390px]:w-[5.7rem] sm:w-[6.65rem] md:w-[8.5rem]" />
            {showPlayedColumn ? <col className="w-[0.8rem] sm:w-[0.95rem] md:w-[2rem]" /> : null}
            <col className="w-[0.8rem] sm:w-[0.95rem] md:w-[2rem]" />
            <col className="w-[0.8rem] sm:w-[0.95rem] md:w-[2rem]" />
            <col className="w-[0.8rem] sm:w-[0.95rem] md:w-[2rem]" />
            <col className="w-[1.05rem] sm:w-[1.25rem] md:w-[2.35rem]" />
            <col className="w-[1.15rem] sm:w-[1.35rem] md:w-[2.45rem]" />
            <col className="w-[6.65rem] min-[390px]:w-[7.65rem] sm:w-[8.65rem] md:w-[12rem]" />
          </colgroup>
          <thead className="text-[9px] font-bold uppercase tracking-wide text-gray-500 md:text-[11px]">
            <tr>
              <th className="px-0 py-1 text-center whitespace-nowrap md:py-2" aria-label="Movement" />
              <th className="px-0.5 py-1 text-center whitespace-nowrap md:py-2">
                <span className="triptych-micro-copy">{t(language, "leaderboard.rank")}</span>
              </th>
              <th className="py-1 pl-2 text-left whitespace-nowrap min-[390px]:pl-5 sm:pl-6 md:py-2 md:pl-8">
                <span className="triptych-micro-copy triptych-micro-copy-left">
                  {t(language, "dashboard.standingsTeamHeader")}
                </span>
              </th>
              {showPlayedColumn ? (
                <th className="px-0 py-1 text-center whitespace-nowrap md:py-2">
                  <span className="triptych-micro-copy">P</span>
                </th>
              ) : null}
              <th className="px-0 py-1 text-center whitespace-nowrap md:py-2">
                <span className="triptych-micro-copy">W</span>
              </th>
              <th className="px-0 py-1 text-center whitespace-nowrap md:py-2">
                <span className="triptych-micro-copy">D</span>
              </th>
              <th className="px-0 py-1 text-center whitespace-nowrap md:py-2">
                <span className="triptych-micro-copy">L</span>
              </th>
              <th className="px-0 py-1 text-center whitespace-nowrap md:py-2">
                <span className="triptych-micro-copy">GD</span>
              </th>
              <th className="px-0 py-1 text-center whitespace-nowrap md:py-2">
                <span className="triptych-micro-copy">Pts</span>
              </th>
              <th className="py-1 pl-4 text-left whitespace-nowrap sm:pl-5 md:py-2 md:pl-7" title={t(language, "dashboard.pickProbabilityTooltip")}>
                <span className="triptych-micro-copy triptych-micro-copy-left md:hidden">
                  {t(language, "dashboard.pickProbabilityShort")}
                </span>
                <span className="triptych-micro-copy triptych-micro-copy-left hidden md:inline-block">
                  {t(language, "dashboard.pickProbabilityHeader")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((row) => {
              const movement = movementByTeamId?.[row.teamId];
              const rowClassName =
                row.isQualifier
                  ? "bg-accent-light/25"
                  : row.isPossibleQualifier
                    ? "bg-accent-light/10"
                    : row.isEliminated
                      ? "bg-gray-100/70 opacity-80"
                      : "";

              return (
                <tr
                  key={row.teamId}
                  className={rowClassName}
                  title={row.isHomeTeam ? t(language, "dashboard.homeTeamMarker") : undefined}
                >
                  <td className="px-0 py-1 text-center md:py-2.5">
                    {movement ? (
                      <span
                        className={`triptych-micro-copy font-bold leading-none ${
                          movement === "up" ? "text-accent-dark" : "text-amber-700"
                        }`}
                        aria-label={movement === "up" ? "Moved up" : "Moved down"}
                      >
                        {movement === "up" ? "↑" : "↓"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-0.5 py-1 text-center font-bold text-gray-900 md:py-2.5">
                    <span className="inline-flex min-w-[1.35rem] items-center justify-center sm:min-w-[1.65rem]">
                      <span className="triptych-micro-copy">{row.rank}</span>
                    </span>
                  </td>
                  <td className="py-1 pl-2 pr-0 text-left min-[390px]:pl-5 sm:pl-6 md:py-2.5 md:pl-8">
                    <span className="flex min-w-0 items-center gap-1.5 md:gap-2">
                      {row.flagEmoji ? (
                        <span aria-hidden className="inline shrink-0 text-xs leading-none min-[390px]:text-sm sm:text-base md:text-lg">
                          {row.flagEmoji}
                        </span>
                      ) : null}
                      <span className="triptych-micro-copy triptych-micro-copy-left truncate font-semibold uppercase tracking-wide text-gray-900">
                        {row.teamCode ?? row.teamName}
                      </span>
                      {row.isHomeTeam ? (
                        <span
                          aria-hidden
                          className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 ring-1 ring-white md:h-2 md:w-2"
                        />
                      ) : null}
                    </span>
                  </td>
                  {showPlayedColumn ? (
                    <td className="px-0 py-1 text-center font-semibold text-gray-700 md:py-2.5">
                      <span className="triptych-micro-copy">{row.played}</span>
                    </td>
                  ) : null}
                  <td className="px-0 py-1 text-center font-semibold text-gray-700 md:py-2.5">
                    <span className="triptych-micro-copy">{row.wins}</span>
                  </td>
                  <td className="px-0 py-1 text-center font-semibold text-gray-700 md:py-2.5">
                    <span className="triptych-micro-copy">{row.draws}</span>
                  </td>
                  <td className="px-0 py-1 text-center font-semibold text-gray-700 md:py-2.5">
                    <span className="triptych-micro-copy">{row.losses}</span>
                  </td>
                  <td className="px-0 py-1 text-center font-semibold text-gray-700 md:py-2.5">
                    <span className="triptych-micro-copy">{row.goalDifference}</span>
                  </td>
                  <td className="px-0 py-1 text-center font-bold text-gray-900 md:py-2.5">
                    <span className="triptych-micro-copy">{row.points}</span>
                  </td>
                  <td className="py-1 pl-4 text-left sm:pl-5 md:py-2.5 md:pl-7">
                    <PickProbabilityCell row={row} language={language} />
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

function PickProbabilityCell({
  row,
  language
}: {
  row: MiniGroupStandingsRow;
  language?: string | null;
}) {
  const pickProbability = row.pickProbability;
  if (!pickProbability || pickProbability.probability === null) {
    return (
      <span className="flex w-full justify-start">
        <span className="triptych-micro-copy triptych-micro-copy-left block font-semibold text-gray-300">—</span>
      </span>
    );
  }

  const probability = Math.max(0, Math.min(100, pickProbability.probability));
  const isExactPlace = pickProbability.mode === "exact_place";
  const placeLabel =
    pickProbability.predictedPlace === 1 || pickProbability.predictedPlace === 2
      ? formatPredictedPlace(pickProbability.predictedPlace, language)
      : "";
  const ariaLabel = isExactPlace
    ? t(language, "dashboard.pickProbabilityExactAria", {
        percent: probability,
        place: placeLabel
      })
    : t(language, "dashboard.pickProbabilityAdvanceAria", {
        percent: probability
      });

  return (
    <span className="flex w-full justify-start">
      <span
        className="triptych-micro-copy triptych-micro-copy-left inline-flex max-w-full items-center justify-start gap-1 truncate text-left font-semibold leading-none text-gray-500 md:gap-2"
        title={ariaLabel}
        aria-label={ariaLabel}
      >
        <span
          aria-hidden
          className="relative inline-flex h-3.5 w-3.5 shrink-0 rounded-full md:h-5 md:w-5"
          style={{
            background: `conic-gradient(rgb(var(--app-accent-rgb)) ${probability * 3.6}deg, rgba(148, 163, 184, 0.22) 0deg)`
          }}
        >
          <span className="absolute inset-[3px] rounded-full bg-white md:inset-[4px]" />
        </span>
        <span className="min-w-0 truncate md:min-w-[8.5rem]">
          <span>{probability}%</span>
          {isExactPlace ? (
            <>
              <span className="hidden min-[390px]:inline"> {t(language, "dashboard.pickProbabilityForWord")} </span>
              <span className="hidden min-[390px]:inline text-accent-dark">{placeLabel}</span>
              <span className="hidden min-[360px]:inline min-[390px]:hidden"> </span>
              <span className="hidden min-[360px]:inline min-[390px]:hidden text-accent-dark">{placeLabel}</span>
            </>
          ) : (
            <>
              <span className="hidden min-[390px]:inline"> {t(language, "dashboard.pickProbabilityToAdvance")}</span>
              <span className="hidden min-[360px]:inline min-[390px]:hidden">
                {" "}
                {t(language, "dashboard.pickProbabilityAdvanceCompact")}
              </span>
            </>
          )}
        </span>
      </span>
    </span>
  );
}

function formatPredictedPlace(place: 1 | 2, language?: string | null) {
  if (place === 1) {
    return t(language, "dashboard.predictedPlaceFirst");
  }
  return t(language, "dashboard.predictedPlaceSecond");
}
