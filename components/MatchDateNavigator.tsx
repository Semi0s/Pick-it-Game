"use client";

import Link from "next/link";
import { HorizontalChoiceRail } from "@/components/player-management/Shared";
import { tournamentCalendar, formatCalendarDate } from "@/lib/tournament-calendar";

type MatchDateNavigatorProps = {
  availableDateKeys?: string[];
};

const stageTabs = [
  { id: "group", label: "Group Dates" },
  { id: "knockout", label: "Knockout Dates" }
];

export function MatchDateNavigator({ availableDateKeys = [] }: MatchDateNavigatorProps) {
  const availableDates = new Set(availableDateKeys);
  const groupDates = tournamentCalendar.filter((entry) => entry.stage === "group");
  const knockoutDates = tournamentCalendar.filter((entry) => entry.stage !== "group");

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Match Calendar</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">Jump by date</h3>
      </div>

      <HorizontalChoiceRail showControls={stageTabs.length > 1}>
        {stageTabs.map((tab) => (
          <a
            key={tab.id}
            href={`#${tab.id}-dates`}
            className="shrink-0 rounded-md bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700"
          >
            {tab.label}
          </a>
        ))}
      </HorizontalChoiceRail>

      <DateStrip id="group-dates" entries={groupDates} availableDates={availableDates} />
      <DateStrip id="knockout-dates" entries={knockoutDates} availableDates={availableDates} />
    </section>
  );
}

type DateStripProps = {
  id: string;
  entries: typeof tournamentCalendar;
  availableDates: Set<string>;
};

function DateStrip({ id, entries, availableDates }: DateStripProps) {
  const isGroupStrip = id === "group-dates";

  return (
    <div id={id} className="scroll-mt-24">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        {isGroupStrip ? "Group Stage" : "Knockout Stage"}
      </p>
      <HorizontalChoiceRail showControls={entries.length > 1}>
        {entries.map((entry) => {
          const hasLoadedMatches = availableDates.has(entry.date);
          const href = isGroupStrip ? `#match-date-${entry.date}` : "/knockout";
          const content = (
            <>
              <span className="text-sm font-black">{formatCalendarDate(entry.date)}</span>
              <span className="text-[11px] font-bold text-gray-500">{entry.shortLabel}</span>
              <span className="text-[11px] font-semibold text-gray-500">
                {entry.matchCount} {entry.matchCount === 1 ? "match" : "matches"}
              </span>
            </>
          );

          if (!isGroupStrip) {
            return (
              <Link
                key={entry.date}
                href={href}
                className="flex min-w-24 shrink-0 flex-col rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left"
              >
                {content}
              </Link>
            );
          }

          return (
            <a
              key={entry.date}
              href={href}
              className={`flex min-w-24 shrink-0 flex-col rounded-md border px-3 py-2 text-left ${
                hasLoadedMatches
                  ? "border-accent bg-accent-light text-accent-dark"
                  : "border-gray-200 bg-gray-50 text-gray-600"
              }`}
            >
              {content}
            </a>
          );
        })}
      </HorizontalChoiceRail>
    </div>
  );
}
