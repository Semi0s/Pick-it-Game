import { notFound } from "next/navigation";

import { DashboardProjectedOutlookDevPreview } from "@/components/dashboard/DashboardCommandCenter";
import { buildProjectionOutlookViewModel } from "@/lib/projected-outlook";

function createScoreSummary(overrides?: {
  currentPoints?: number | null;
  currentRank?: number | null;
  history?: Array<{
    matchId: string;
    createdAt: string;
    totalPoints: number;
    rank: number;
  }>;
}) {
  return {
    currentPoints: overrides?.currentPoints ?? null,
    currentRank: overrides?.currentRank ?? null,
    currentPacePoints: null,
    previousPoints: null,
    previousRank: null,
    previousPacePoints: null,
    pointsChange: null,
    rankChange: null,
    deltaFromPace: null,
    latestSnapshotAt: null,
    previousSnapshotAt: null,
    comparisonMode: "none" as const,
    history:
      overrides?.history?.map((point) => ({
        matchId: point.matchId,
        createdAt: point.createdAt,
        totalPoints: point.totalPoints,
        pacePoints: null,
        rank: point.rank,
        pointsDelta: null,
        rankDelta: null,
        paceDelta: null
      })) ?? []
  };
}

function createSnapshot() {
  return {
    groupRankings: [
      { groupName: "Group D", rankedTeamIds: ["usa", "aus", "tur", "par"] },
      { groupName: "Group B", rankedTeamIds: ["sui", "can", "qat", "bih"] }
    ],
    thirdPlaceRankings: [
      { teamId: "tur", rank: 1 },
      { teamId: "qat", rank: 2 }
    ]
  };
}

function createCurrentStandings() {
  return {
    byGroup: new Map([
      [
        "Group D",
        [
          { teamId: "usa", rank: 1, played: 1, points: 3, goalsFor: 2, goalDifference: 2 },
          { teamId: "aus", rank: 2, played: 1, points: 1, goalsFor: 1, goalDifference: 0 },
          { teamId: "tur", rank: 3, played: 1, points: 1, goalsFor: 1, goalDifference: 0 },
          { teamId: "par", rank: 4, played: 1, points: 0, goalsFor: 0, goalDifference: -2 }
        ]
      ],
      [
        "Group B",
        [
          { teamId: "sui", rank: 1, played: 1, points: 3, goalsFor: 2, goalDifference: 2 },
          { teamId: "can", rank: 2, played: 1, points: 1, goalsFor: 1, goalDifference: 0 },
          { teamId: "qat", rank: 3, played: 1, points: 1, goalsFor: 1, goalDifference: 0 },
          { teamId: "bih", rank: 4, played: 1, points: 0, goalsFor: 0, goalDifference: -2 }
        ]
      ]
    ])
  };
}

function createUpcomingMatches() {
  return [
    {
      id: "g-22",
      status: "scheduled" as const,
      kickoffTime: "2026-06-14T18:00:00.000Z",
      groupLabel: "Group D",
      homeTeamId: "tur",
      awayTeamId: "par",
      homeTeamName: "Türkiye",
      awayTeamName: "Paraguay",
      homeTeamShortName: "TUR",
      awayTeamShortName: "PAR",
      homeTeamFlagEmoji: "🇹🇷",
      awayTeamFlagEmoji: "🇵🇾"
    },
    {
      id: "g-11",
      status: "scheduled" as const,
      kickoffTime: "2026-06-14T12:00:00.000Z",
      groupLabel: "Group B",
      homeTeamId: "qat",
      awayTeamId: "bih",
      homeTeamName: "Qatar",
      awayTeamName: "Bosnia-Herzegovina",
      homeTeamShortName: "QAT",
      awayTeamShortName: "BIH",
      homeTeamFlagEmoji: "🇶🇦",
      awayTeamFlagEmoji: "🇧🇦"
    }
  ];
}

function createAllMatches() {
  return [
    {
      id: "g-02",
      status: "final" as const,
      kickoffTime: "2026-06-11T18:00:00.000Z",
      groupLabel: "Group D",
      homeTeamId: "usa",
      awayTeamId: "aus",
      homeTeamName: "United States",
      awayTeamName: "Australia",
      homeTeamShortName: "USA",
      awayTeamShortName: "AUS",
      homeTeamFlagEmoji: "🇺🇸",
      awayTeamFlagEmoji: "🇦🇺"
    },
    {
      id: "g-03",
      status: "final" as const,
      kickoffTime: "2026-06-12T18:00:00.000Z",
      groupLabel: "Group B",
      homeTeamId: "can",
      awayTeamId: "bih",
      homeTeamName: "Canada",
      awayTeamName: "Bosnia-Herzegovina",
      homeTeamShortName: "CAN",
      awayTeamShortName: "BIH",
      homeTeamFlagEmoji: "🇨🇦",
      awayTeamFlagEmoji: "🇧🇦"
    },
    ...createUpcomingMatches()
  ];
}

function createCheckpointMatches() {
  return new Map([
    [
      "g-02",
      {
        id: "g-02",
        kickoffTime: "2026-06-11T18:00:00.000Z",
        groupLabel: "Group D",
        homeTeamName: "United States",
        awayTeamName: "Australia",
        homeTeamShortName: "USA",
        awayTeamShortName: "AUS",
        homeTeamFlagEmoji: "🇺🇸",
        awayTeamFlagEmoji: "🇦🇺"
      }
    ],
    [
      "g-03",
      {
        id: "g-03",
        kickoffTime: "2026-06-12T18:00:00.000Z",
        groupLabel: "Group B",
        homeTeamName: "Canada",
        awayTeamName: "Bosnia-Herzegovina",
        homeTeamShortName: "CAN",
        awayTeamShortName: "BIH",
        homeTeamFlagEmoji: "🇨🇦",
        awayTeamFlagEmoji: "🇧🇦"
      }
    ],
    [
      "g-04",
      {
        id: "g-04",
        kickoffTime: "2026-06-13T18:00:00.000Z",
        groupLabel: "Group D",
        homeTeamName: "Türkiye",
        awayTeamName: "Paraguay",
        homeTeamShortName: "TUR",
        awayTeamShortName: "PAR",
        homeTeamFlagEmoji: "🇹🇷",
        awayTeamFlagEmoji: "🇵🇾"
      }
    ]
  ]);
}

function createMockProjectedOutlook() {
  return buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 121.2,
      currentRank: 4,
      history: [
        { matchId: "group:g-02:pre", createdAt: "2026-06-11T12:00:00.000Z", totalPoints: 150, rank: 8 },
        { matchId: "group:g-02", createdAt: "2026-06-11T22:00:00.000Z", totalPoints: 142.4, rank: 6 },
        { matchId: "group:g-03", createdAt: "2026-06-12T22:00:00.000Z", totalPoints: 136.8, rank: 5 },
        { matchId: "group:g-04", createdAt: "2026-06-13T18:00:00.000Z", totalPoints: 121.2, rank: 4 }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 38,
      currentRank: 18,
      history: [
        { matchId: "g-02", createdAt: "2026-06-11T22:00:00.000Z", totalPoints: 18, rank: 22 },
        { matchId: "g-03", createdAt: "2026-06-12T22:00:00.000Z", totalPoints: 26, rank: 20 },
        { matchId: "g-04", createdAt: "2026-06-13T18:00:00.000Z", totalPoints: 38, rank: 18 }
      ]
    }),
    snapshot: createSnapshot(),
    currentStandings: createCurrentStandings(),
    allMatches: createAllMatches(),
    upcomingMatches: createUpcomingMatches(),
    checkpointMatchesById: createCheckpointMatches()
  });
}

export default function ProjectedOutlookDevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const outlook = createMockProjectedOutlook();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.04em]">Projected outlook preview</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Dev-only responsive harness for 320, 360, 390, and 430 widths.
          </p>
        </div>
        <DashboardProjectedOutlookDevPreview outlook={outlook} />
      </div>
    </main>
  );
}
