export type TournamentCalendarEntry = {
  date: string;
  stage: "group" | "round_of_32" | "round_of_16" | "quarterfinal" | "semifinal" | "final";
  label: string;
  shortLabel: string;
  matchCount: number;
};

export const tournamentCalendar: TournamentCalendarEntry[] = [
  { date: "2026-06-11", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 2 },
  { date: "2026-06-12", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 2 },
  { date: "2026-06-13", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-14", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-15", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-16", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-17", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-18", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-19", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-20", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-21", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-22", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-23", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 4 },
  { date: "2026-06-24", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 6 },
  { date: "2026-06-25", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 6 },
  { date: "2026-06-26", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 6 },
  { date: "2026-06-27", stage: "group", label: "Group Stage", shortLabel: "Groups", matchCount: 6 },
  { date: "2026-06-28", stage: "round_of_32", label: "Round of 32", shortLabel: "R32", matchCount: 3 },
  { date: "2026-06-29", stage: "round_of_32", label: "Round of 32", shortLabel: "R32", matchCount: 3 },
  { date: "2026-06-30", stage: "round_of_32", label: "Round of 32", shortLabel: "R32", matchCount: 3 },
  { date: "2026-07-01", stage: "round_of_32", label: "Round of 32", shortLabel: "R32", matchCount: 3 },
  { date: "2026-07-02", stage: "round_of_32", label: "Round of 32", shortLabel: "R32", matchCount: 2 },
  { date: "2026-07-03", stage: "round_of_32", label: "Round of 32", shortLabel: "R32", matchCount: 2 },
  { date: "2026-07-04", stage: "round_of_16", label: "Round of 16", shortLabel: "R16", matchCount: 2 },
  { date: "2026-07-05", stage: "round_of_16", label: "Round of 16", shortLabel: "R16", matchCount: 2 },
  { date: "2026-07-06", stage: "round_of_16", label: "Round of 16", shortLabel: "R16", matchCount: 2 },
  { date: "2026-07-07", stage: "round_of_16", label: "Round of 16", shortLabel: "R16", matchCount: 2 },
  { date: "2026-07-09", stage: "quarterfinal", label: "Quarterfinals", shortLabel: "QF", matchCount: 2 },
  { date: "2026-07-10", stage: "quarterfinal", label: "Quarterfinals", shortLabel: "QF", matchCount: 1 },
  { date: "2026-07-11", stage: "quarterfinal", label: "Quarterfinals", shortLabel: "QF", matchCount: 1 },
  { date: "2026-07-14", stage: "semifinal", label: "Semifinals", shortLabel: "SF", matchCount: 1 },
  { date: "2026-07-15", stage: "semifinal", label: "Semifinals", shortLabel: "SF", matchCount: 1 },
  { date: "2026-07-19", stage: "final", label: "Final", shortLabel: "Final", matchCount: 1 }
];

export function getMatchDateKey(kickoffTime: string) {
  return kickoffTime.slice(0, 10);
}

export function formatCalendarDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00.000Z`));
}
