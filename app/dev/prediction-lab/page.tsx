import { notFound } from "next/navigation";
import { SidePicksClient } from "@/components/SidePicksClient";
import type { PredictionLabPageData } from "@/lib/prediction-lab-data";

function createPreviewData(): PredictionLabPageData {
  return {
    tournamentId: "world_cup_2026",
    group: {
      id: "preview-group",
      name: "FIFA 2026 Predictions"
    },
    initialSettings: {
      scheduleLoad: 67,
      availability: 33,
      formQuality: 67,
      crowdPulse: 33
    },
    averageSummary: {
      groupCount: 12,
      averageSettings: {
        scheduleLoad: 33,
        availability: 33,
        formQuality: 67,
        crowdPulse: 67
      }
    },
    teamHealthSummary: {
      status: "ok",
      checkedAt: "2026-07-03T10:05:00.000Z",
      refreshIntervalSeconds: 300,
      teams: [
        { teamId: "can", flaggedCount: 2, updatedAt: "2026-07-03T10:00:00.000Z" },
        { teamId: "mar", flaggedCount: 0, updatedAt: "2026-07-03T10:00:00.000Z" },
        { teamId: "fra", flaggedCount: 1, updatedAt: "2026-07-03T10:00:00.000Z" }
      ]
    },
    publicMatchPulseRows: [
      { matchId: "r16-01", homePercent: 46, awayPercent: 54, provider: "api-football" },
      { matchId: "r16-02", homePercent: 63, awayPercent: 37, provider: "api-football" }
    ],
    activeTeams: [
      { id: "bra", name: "Brazil", shortName: "BRA", flagEmoji: "🇧🇷", fifaRank: 3, seedScore: 0.92, momentumScore: 0.74, pathScore: 0.7, roundsRemaining: 4, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1, matchesPlayed: 2, lastPlayedAt: "2026-07-01T18:00:00.000Z" },
      { id: "mar", name: "Morocco", shortName: "MAR", flagEmoji: "🇲🇦", fifaRank: 11, seedScore: 0.78, momentumScore: 0.7, pathScore: 0.67, roundsRemaining: 4, wins: 2, draws: 1, losses: 0, goalsFor: 4, goalsAgainst: 2, matchesPlayed: 3, lastPlayedAt: "2026-07-01T20:00:00.000Z" },
      { id: "can", name: "Canada", shortName: "CAN", flagEmoji: "🇨🇦", fifaRank: 27, seedScore: 0.48, momentumScore: 0.73, pathScore: 0.63, roundsRemaining: 4, wins: 2, draws: 0, losses: 1, goalsFor: 3, goalsAgainst: 2, matchesPlayed: 3, lastPlayedAt: "2026-06-30T19:00:00.000Z" },
      { id: "par", name: "Paraguay", shortName: "PAR", flagEmoji: "🇵🇾", fifaRank: 41, seedScore: 0.31, momentumScore: 0.69, pathScore: 0.61, roundsRemaining: 4, wins: 1, draws: 2, losses: 0, goalsFor: 3, goalsAgainst: 2, matchesPlayed: 3, lastPlayedAt: "2026-06-30T21:00:00.000Z" },
      { id: "fra", name: "France", shortName: "FRA", flagEmoji: "🇫🇷", fifaRank: 2, seedScore: 0.95, momentumScore: 0.72, pathScore: 0.66, roundsRemaining: 4, wins: 2, draws: 0, losses: 0, goalsFor: 6, goalsAgainst: 2, matchesPlayed: 2, lastPlayedAt: "2026-07-02T18:00:00.000Z" },
      { id: "swe", name: "Sweden", shortName: "SWE", flagEmoji: "🇸🇪", fifaRank: 17, seedScore: 0.67, momentumScore: 0.58, pathScore: 0.59, roundsRemaining: 4, wins: 1, draws: 1, losses: 1, goalsFor: 2, goalsAgainst: 2, matchesPlayed: 3, lastPlayedAt: "2026-07-02T18:00:00.000Z" },
      { id: "mex", name: "Mexico", shortName: "MEX", flagEmoji: "🇲🇽", fifaRank: 15, seedScore: 0.69, momentumScore: 0.62, pathScore: 0.64, roundsRemaining: 4, wins: 1, draws: 1, losses: 1, goalsFor: 3, goalsAgainst: 3, matchesPlayed: 3, lastPlayedAt: "2026-07-03T18:00:00.000Z" },
      { id: "ecu", name: "Ecuador", shortName: "ECU", flagEmoji: "🇪🇨", fifaRank: 24, seedScore: 0.55, momentumScore: 0.6, pathScore: 0.57, roundsRemaining: 4, wins: 1, draws: 1, losses: 1, goalsFor: 2, goalsAgainst: 2, matchesPlayed: 3, lastPlayedAt: "2026-07-03T18:00:00.000Z" }
    ],
    upcomingMatches: [
      {
        id: "r16-01",
        stage: "r16",
        status: "scheduled",
        kickoffAt: "2026-07-04T18:00:00.000Z",
        homeTeamId: "can",
        awayTeamId: "mar",
        homeTeamName: "Canada",
        awayTeamName: "Morocco",
        homeTeamShortName: "CAN",
        awayTeamShortName: "MAR",
        homeTeamFlagEmoji: "🇨🇦",
        awayTeamFlagEmoji: "🇲🇦",
        homeSource: "Winner of r32-01",
        awaySource: "Winner of r32-03",
        nextMatchId: "qf-01",
        nextMatchSlot: "home"
      },
      {
        id: "r16-02",
        stage: "r16",
        status: "scheduled",
        kickoffAt: "2026-07-04T22:00:00.000Z",
        homeTeamId: "bra",
        awayTeamId: "par",
        homeTeamName: "Brazil",
        awayTeamName: "Paraguay",
        homeTeamShortName: "BRA",
        awayTeamShortName: "PAR",
        homeTeamFlagEmoji: "🇧🇷",
        awayTeamFlagEmoji: "🇵🇾",
        homeSource: "Winner of r32-04",
        awaySource: "Winner of r32-02",
        nextMatchId: "qf-01",
        nextMatchSlot: "away"
      }
    ],
    userBracketPicks: [
      { matchId: "r16-01", predictedWinnerTeamId: "mar" },
      { matchId: "r16-02", predictedWinnerTeamId: "bra" }
    ]
  };
}

export default function PredictionLabDevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const data = createPreviewData();
  const widths = [320, 360, 390, 430];

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.04em]">Prediction Lab preview</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">Dev-only responsive harness for the voided Side Picks replacement.</p>
        </div>

        <section className="space-y-2 md:hidden">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Responsive viewport preview</p>
          <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
            <div className="p-3">
              <SidePicksClient {...data} previewMode />
            </div>
          </div>
        </section>

        <div className="hidden gap-6 md:grid xl:grid-cols-2">
          {widths.map((width) => (
            <section key={width} className="space-y-2">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{width}px container</p>
              <div
                className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm"
                data-preview-width={width}
                style={{ width }}
              >
                <div className="p-3">
                  <SidePicksClient {...data} previewMode />
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
