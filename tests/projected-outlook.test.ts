import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCeilingRiskChartModel,
  buildPlayerPickExposures,
  buildProjectionOutlookViewModel,
  buildUpcomingMatchStakes,
  createEmptyDashboardProjectedOutlookSummary,
  resolveProjectionEventLabel
} from "../lib/projected-outlook.ts";

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
      {
        groupName: "Group D",
        rankedTeamIds: ["usa", "aus", "tur", "par"]
      }
    ],
    thirdPlaceRankings: [{ teamId: "tur", rank: 1 }]
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
      ]
    ])
  };
}

function createUpcomingMatch() {
  return {
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
  };
}

function createAllMatches(status: "scheduled" | "locked" | "live" | "final" = "scheduled") {
  return [
    {
      id: "g-21",
      status,
      kickoffTime: "2026-06-14T15:00:00.000Z",
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
    createUpcomingMatch()
  ];
}

test("empty projected history returns an empty outlook state", () => {
  assert.deepEqual(
    buildProjectionOutlookViewModel({
      projected: createScoreSummary(),
      official: createScoreSummary()
    }),
    createEmptyDashboardProjectedOutlookSummary()
  );
});

test("multiple result checkpoints produce ordered projected outlook points with compact match labels", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 121.2,
      currentRank: 4,
      history: [
        {
          matchId: "group:g-02:pre",
          createdAt: "2026-06-11T18:00:00.000Z",
          totalPoints: 118.6,
          rank: 7
        },
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 122.2,
          rank: 5
        },
        {
          matchId: "group:g-03",
          createdAt: "2026-06-13T06:00:00.000Z",
          totalPoints: 121.2,
          rank: 4
        }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 38,
      currentRank: 18,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 18,
          rank: 22
        },
        {
          matchId: "g-03",
          createdAt: "2026-06-13T06:00:00.000Z",
          totalPoints: 38,
          rank: 18
        }
      ]
    }),
    checkpointMatchesById: new Map([
      [
        "g-02",
        {
          id: "g-02",
          kickoffTime: "2026-06-12T06:00:00.000Z",
          groupLabel: "Group D",
          homeTeamName: "Germany",
          awayTeamName: "Ecuador",
          homeTeamShortName: "GER",
          awayTeamShortName: "ECU",
          homeTeamFlagEmoji: "🇩🇪",
          awayTeamFlagEmoji: "🇪🇨"
        }
      ],
      [
        "g-03",
        {
          id: "g-03",
          kickoffTime: "2026-06-13T06:00:00.000Z",
          groupLabel: "Group B",
          homeTeamName: "Bosnia-Herzegovina",
          awayTeamName: "Qatar",
          homeTeamShortName: "BIH",
          awayTeamShortName: "QAT",
          homeTeamFlagEmoji: "🇧🇦",
          awayTeamFlagEmoji: "🇶🇦"
        }
      ]
    ])
  });

  assert.equal(summary.history.length, 3);
  assert.equal(summary.history[0]?.triggerLabel, "Start");
  assert.equal(summary.history[1]?.triggerLabel, "After Germany vs Ecuador");
  assert.equal(summary.history[2]?.triggerLabel, "After Bosnia-Herzegovina vs Qatar");
  assert.equal(summary.history[1]?.compactLabel, "GER-ECU");
  assert.equal(summary.history[2]?.compactLabel, "BIH-QAT");
  assert.equal(summary.history[0]?.lockedPoints, 0);
  assert.equal(summary.history[1]?.lockedPoints, 18);
  assert.equal(summary.history[2]?.lockedPoints, 38);
  assert.equal(summary.summary.projectedFinalPoints, 121.2);
  assert.equal(summary.summary.projectedRank, 4);
  assert.equal(summary.ceilingRiskGraph.projectedRankVerified, false);
  assert.equal(summary.summary.lockedPoints, 38);
  assert.equal(summary.sinceLastResult, -1);
  assert.equal(summary.hasMeaningfulHistory, true);
  assert.equal(summary.recentMovementRows[0]?.compactLabel, "BIH-QAT");
  assert.equal(summary.recentMovementRows[0]?.triggerLabel, "BIH-QAT");
  assert.equal(summary.recentMovementRows[0]?.timestampLabel, "");
});

test("current projection checkpoint is synthesized when persisted projected history is stale", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 121.2,
      currentRank: 4,
      history: [
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 122.2,
          rank: 5
        }
      ]
    }),
    currentProjection: {
      checkpointId: "group:g-03",
      createdAt: "2026-06-13T06:00:00.000Z",
      projectedFinalPoints: 119.4,
      projectedRank: null
    },
    official: createScoreSummary({
      currentPoints: 18,
      currentRank: 22,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 18,
          rank: 22
        }
      ]
    }),
    checkpointMatchesById: new Map([
      [
        "g-02",
        {
          id: "g-02",
          kickoffTime: "2026-06-12T06:00:00.000Z",
          groupLabel: "Group D",
          homeTeamName: "Germany",
          awayTeamName: "Ecuador",
          homeTeamShortName: "GER",
          awayTeamShortName: "ECU",
          homeTeamFlagEmoji: "🇩🇪",
          awayTeamFlagEmoji: "🇪🇨"
        }
      ],
      [
        "g-03",
        {
          id: "g-03",
          kickoffTime: "2026-06-13T06:00:00.000Z",
          groupLabel: "Group B",
          homeTeamName: "Bosnia-Herzegovina",
          awayTeamName: "Qatar",
          homeTeamShortName: "BIH",
          awayTeamShortName: "QAT",
          homeTeamFlagEmoji: "🇧🇦",
          awayTeamFlagEmoji: "🇶🇦"
        }
      ]
    ])
  });

  assert.equal(summary.history.length, 2);
  assert.equal(summary.history[1]?.checkpointId, "group:g-03");
  assert.equal(summary.history[1]?.projectedFinalPoints, 119.4);
  assert.equal(summary.history[1]?.triggerLabel, "After Bosnia-Herzegovina vs Qatar");
  assert.equal(summary.summary.projectedFinalPoints, 119.4);
});

test("summary cards expose upside and downside when a trusted range exists", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 121.2,
      currentRank: 5,
      history: [
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 121.2,
          rank: 5
        }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 38,
      currentRank: 18,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 38,
          rank: 18
        }
      ]
    }),
    checkpointRangesById: new Map([
      [
        "group:g-02",
        {
          rangeLowPoints: 112,
          rangeHighPoints: 138.5,
          rangeKind: "likely"
        }
      ]
    ])
  });

  assert.equal(summary.summary.upsideDelta, 17.3);
  assert.equal(summary.summary.downsideDelta, -9.2);
  assert.equal(summary.summary.rangeKind, "likely");
  assert.equal(summary.summary.rangeLabel, "Likely range");
});

test("summary omits upside and downside safely when range is unavailable", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 110,
      currentRank: 9,
      history: [
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 110,
          rank: 9
        }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 12,
      currentRank: 40,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 12,
          rank: 40
        }
      ]
    })
  });

  assert.equal(summary.mode, "history");
  assert.equal(summary.summary.upsideDelta, null);
  assert.equal(summary.summary.downsideDelta, null);
  assert.equal(summary.summary.rangeLabel, null);
});

test("single projected checkpoint returns an insufficient-history outlook", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 122.2,
      currentRank: 5,
      history: [
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 122.2,
          rank: 5
        }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 18,
      currentRank: 22,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T06:00:00.000Z",
          totalPoints: 18,
          rank: 22
        }
      ]
    })
  });

  assert.equal(summary.history.length, 1);
  assert.equal(summary.hasMeaningfulHistory, false);
  assert.equal(summary.lockedInPoints, 18);
  assert.equal(summary.projectedRemainingPoints, 104.2);
});

test("player pick exposures capture advancing teams and total possible points", () => {
  const exposures = buildPlayerPickExposures(createSnapshot(), undefined, createCurrentStandings());

  assert.equal(exposures.predictedAdvancingTeamIds.has("usa"), true);
  assert.equal(exposures.predictedAdvancingTeamIds.has("aus"), true);
  assert.equal(exposures.predictedAdvancingTeamIds.has("tur"), true);
  assert.equal(exposures.predictedAdvancingTeamIds.has("par"), false);
  assert.equal(exposures.byTeamId.get("tur")?.predictedThirdPlaceRank, 1);
  assert.equal(exposures.totalPossiblePoints, 14);
});

test("upcoming match stakes are built from exposures and current standings", () => {
  const stakes = buildUpcomingMatchStakes({
    exposures: buildPlayerPickExposures(createSnapshot(), undefined, createCurrentStandings()),
    upcomingMatches: [createUpcomingMatch()],
    currentStandings: createCurrentStandings(),
    language: "en"
  });

  assert.equal(stakes.length, 1);
  assert.equal(stakes[0]?.kind, "stakes");
  assert.equal(stakes[0]?.compactTitle, "TUR-PAR");
  assert.equal(stakes[0]?.displayLabel, "🇹🇷 TUR vs 🇵🇾 PAR");
  assert.equal(stakes[0]?.pointsAtStake, 5);
  assert.match(stakes[0]?.pickSummary ?? "", /Turkey|TUR|qualify/i);
});

test("projection event labels prefer human-readable match names and compact matchup labels", () => {
  const label = resolveProjectionEventLabel({
    checkpoint: {
      triggerType: "match_final",
      triggerMatchId: "g-02"
    },
    checkpointMatch: {
      id: "g-02",
      kickoffTime: "2026-06-12T22:52:00.000Z",
      groupLabel: "Group D",
      homeTeamName: "Germany",
      awayTeamName: "Curaçao",
      homeTeamShortName: "GER",
      awayTeamShortName: "CUW",
      homeTeamFlagEmoji: "🇩🇪",
      awayTeamFlagEmoji: "🇨🇼"
    },
    createdAt: "2026-06-12T22:52:00.000Z",
    language: "en"
  });

  assert.equal(label.triggerLabel, "After Germany vs Curaçao");
  assert.equal(label.compactLabel, "GER-CUW");
  assert.match(label.detailTimestampLabel, /6\/12/);
});

test("projection event labels fall back safely when no match metadata exists", () => {
  const label = resolveProjectionEventLabel({
    checkpoint: {
      triggerType: "match_final",
      triggerMatchId: "g-04"
    },
    checkpointMatch: null,
    createdAt: "2026-06-12T22:52:00.000Z",
    language: "en"
  });

  assert.equal(label.triggerLabel, "After Group Match 4");
  assert.equal(label.compactLabel, "Match 4");
});

test("ceiling risk graph model creates a future wedge from ceiling and at-risk points", () => {
  const chartModel = buildCeilingRiskChartModel({
    history: [
      {
      checkpointId: "group:g-02",
      createdAt: "2026-06-12T22:52:00.000Z",
      triggerType: "match_final",
      triggerMatchId: "g-02",
      triggerLabel: "After Germany vs Curaçao",
      compactLabel: "GER-CUW",
      detailTimestampLabel: "6/12, 10:52 PM",
      projectedFinalPoints: 121.2,
      projectedRank: 5,
      lockedPoints: 38,
      projectedRemainingPoints: 83.2,
      likelyLowPoints: 112,
      likelyHighPoints: 138.5,
      rangeKind: "likely",
      maxPossiblePoints: null,
      remainingPossiblePoints: null,
      changeFromPrevious: 1.2
      }
    ],
    ceiling: {
      submittedCeilingPoints: 168,
      currentCeilingPoints: 168,
      lockedPoints: 38,
      atRiskNextPoints: 42,
      stillLiveLaterPoints: 88,
      lostCeilingPoints: 0
    },
    summary: {
      mode: "stakes",
      projectedFinalPoints: 121.2,
      projectedRank: 5,
      lockedPoints: 38,
      upsideDelta: null,
      downsideDelta: null,
      pointsAtStake: 42,
      rangeKind: null,
      rangeLabel: null,
      sinceLastResultDelta: 1.2,
      ceilingPoints: 168,
      atRiskNextPoints: 42
    },
    stakesCards: [
      {
        kind: "stakes",
        matchId: "g-22",
        title: "Türkiye vs Paraguay",
        compactTitle: "TUR-PAR",
        displayLabel: "🇹🇷 TUR vs 🇵🇾 PAR",
        shortDisplayLabel: "TUR-PAR",
        kickoffLabel: "6/14 · 6:00 PM",
        pickSummary: "You picked TUR to qualify as 3rd.",
        pointsAtStake: 5,
        helpsLabel: "TUR result",
        hurtsLabel: "PAR swing",
        affectedPickLabels: ["TUR to qualify as 3rd"],
        pickChips: [],
        goalDifferenceSensitive: true,
        impactScore: 5
      }
    ]
  });

  assert.equal(chartModel.futureWedge?.bestPoints, 168);
  assert.equal(chartModel.futureWedge?.worstPoints, 126);
  assert.equal(chartModel.futureWedge?.worstPoints, 168 - 42);
  assert.equal(chartModel.graphPoints.some((point) => point.kind === "now"), true);
  assert.equal(chartModel.graphPoints.some((point) => point.kind === "future_best"), true);
  assert.equal(chartModel.graphPoints.some((point) => point.kind === "future_worst"), true);
  assert.equal(chartModel.tooltipsByPointId["future-worst"]?.title, "Risk next");
  assert.equal(chartModel.decisiveMatches[0]?.compactLabel, "🇹🇷 TUR vs 🇵🇾 PAR");
  assert.equal(chartModel.graphPoints.find((point) => point.kind === "now")?.shortLabel, "6/12");
  assert.equal(chartModel.graphPoints.find((point) => point.kind === "future_best")?.shortLabel, "6/14");
});

test("ceiling risk graph omits the future wedge when at-risk points are unavailable", () => {
  const chartModel = buildCeilingRiskChartModel({
    history: [],
    ceiling: {
      submittedCeilingPoints: 168,
      currentCeilingPoints: 168,
      lockedPoints: 38,
      atRiskNextPoints: 0,
      stillLiveLaterPoints: 88,
      lostCeilingPoints: 0
    },
    summary: {
      mode: "history",
      projectedFinalPoints: 121.2,
      projectedRank: 5,
      lockedPoints: 38,
      upsideDelta: null,
      downsideDelta: null,
      pointsAtStake: null,
      rangeKind: null,
      rangeLabel: null,
      sinceLastResultDelta: null,
      ceilingPoints: 168,
      atRiskNextPoints: 0
    },
    stakesCards: []
  });

  assert.equal(chartModel.futureWedge, null);
  assert.equal(chartModel.graphPoints.some((point) => point.kind === "future_best"), false);
});

test("projected outlook falls back to stakes mode before history mode", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 121.2,
      currentRank: 5,
      history: [
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 121.2,
          rank: 5
        }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 38,
      currentRank: 18,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 38,
          rank: 18
        }
      ]
    }),
    snapshot: createSnapshot(),
    currentStandings: createCurrentStandings(),
    allMatches: createAllMatches(),
    upcomingMatches: [createUpcomingMatch()]
  });

  assert.equal(summary.mode, "stakes");
  assert.equal(summary.summary.mode, "stakes");
  assert.equal(summary.summary.pointsAtStake, 5);
  assert.equal(summary.ceiling.currentCeilingPoints, 14);
  assert.equal(summary.ceiling.atRiskNextPoints, 5);
  assert.equal(summary.ceiling.stillLiveLaterPoints, 9);
  assert.equal(summary.swingCards.length, 1);
  assert.equal(summary.swingCards[0]?.kind, "stakes");
  assert.equal(summary.swingCardsNotice, null);
});

test("projected outlook builds a current ceiling bar model from live group exposures", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 121.2,
      currentRank: 5,
      history: [
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 121.2,
          rank: 5
        }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 38,
      currentRank: 18,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 38,
          rank: 18
        }
      ]
    }),
    snapshot: createSnapshot(),
    currentStandings: createCurrentStandings(),
    allMatches: createAllMatches(),
    upcomingMatches: [createUpcomingMatch()]
  });

  assert.equal(summary.ceilingVisualMode, "current_bar");
  assert.equal(summary.ceiling.submittedCeilingPoints, 14);
  assert.equal(summary.ceiling.currentCeilingPoints, 14);
  assert.equal(summary.ceiling.atRiskNextPoints, 5);
  assert.equal(summary.ceiling.stillLiveLaterPoints, 9);
  assert.equal(summary.ceiling.lostCeilingPoints, 0);
  assert.equal(summary.exposures.some((chip) => chip.status === "at_risk_next" && chip.teamId === "tur"), true);
  assert.equal(summary.ceilingRiskGraph.futureWedge?.bestPoints, 14);
  assert.equal(summary.ceilingRiskGraph.futureWedge?.worstPoints, 9);
});

test("ceiling risk graph limits decisive matches to the top two", () => {
  const summary = buildProjectionOutlookViewModel({
    projected: createScoreSummary({
      currentPoints: 121.2,
      currentRank: 5,
      history: [
        {
          matchId: "group:g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 121.2,
          rank: 5
        }
      ]
    }),
    official: createScoreSummary({
      currentPoints: 38,
      currentRank: 18,
      history: [
        {
          matchId: "g-02",
          createdAt: "2026-06-12T22:52:00.000Z",
          totalPoints: 38,
          rank: 18
        }
      ]
    }),
    snapshot: {
      groupRankings: [
        { groupName: "Group D", rankedTeamIds: ["usa", "aus", "tur", "par"] },
        { groupName: "Group B", rankedTeamIds: ["sui", "can", "qat", "bih"] }
      ],
      thirdPlaceRankings: [{ teamId: "tur", rank: 1 }, { teamId: "qat", rank: 2 }]
    },
    currentStandings: {
      byGroup: new Map([
        ["Group D", createCurrentStandings().byGroup.get("Group D") ?? []],
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
    },
    allMatches: [
      ...createAllMatches(),
      {
        id: "g-11",
        status: "scheduled",
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
    ],
    upcomingMatches: [
      createUpcomingMatch(),
      {
        id: "g-11",
        status: "scheduled",
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
      },
      {
        id: "g-21",
        status: "scheduled",
        kickoffTime: "2026-06-15T12:00:00.000Z",
        groupLabel: "Group D",
        homeTeamId: "usa",
        awayTeamId: "aus",
        homeTeamName: "United States",
        awayTeamName: "Australia",
        homeTeamShortName: "USA",
        awayTeamShortName: "AUS",
        homeTeamFlagEmoji: "🇺🇸",
        awayTeamFlagEmoji: "🇦🇺"
      }
    ]
  });

  assert.equal(summary.ceilingRiskGraph.decisiveMatches.length, 2);
});

test("upcoming match stakes prefer sooner kickoff when points at stake are tied", () => {
  const stakes = buildUpcomingMatchStakes({
    exposures: buildPlayerPickExposures(
      {
        groupRankings: [
          { groupName: "Group D", rankedTeamIds: ["usa", "aus", "tur", "par"] },
          { groupName: "Group B", rankedTeamIds: ["sui", "can", "qat", "bih"] }
        ],
        thirdPlaceRankings: [{ teamId: "tur", rank: 1 }, { teamId: "qat", rank: 2 }]
      },
      undefined,
      {
        byGroup: new Map([
          ["Group D", createCurrentStandings().byGroup.get("Group D") ?? []],
          [
            "Group B",
            [
              { teamId: "sui", rank: 1, played: 1, points: 3, goalsFor: 2, goalDifference: 2, teamName: "Switzerland", teamShortName: "SUI", teamCode: "SUI", flagEmoji: "🇨🇭" },
              { teamId: "can", rank: 2, played: 1, points: 1, goalsFor: 1, goalDifference: 0, teamName: "Canada", teamShortName: "CAN", teamCode: "CAN", flagEmoji: "🇨🇦" },
              { teamId: "qat", rank: 3, played: 1, points: 1, goalsFor: 1, goalDifference: 0, teamName: "Qatar", teamShortName: "QAT", teamCode: "QAT", flagEmoji: "🇶🇦" },
              { teamId: "bih", rank: 4, played: 1, points: 0, goalsFor: 0, goalDifference: -2, teamName: "Bosnia-Herzegovina", teamShortName: "BIH", teamCode: "BIH", flagEmoji: "🇧🇦" }
            ]
          ]
        ])
      }
    ),
    upcomingMatches: [
      {
        id: "g-22",
        status: "scheduled",
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
        status: "scheduled",
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
    ],
    currentStandings: {
      byGroup: new Map([
        ["Group D", createCurrentStandings().byGroup.get("Group D") ?? []],
        [
          "Group B",
          [
            { teamId: "sui", rank: 1, played: 1, points: 3, goalsFor: 2, goalDifference: 2, teamName: "Switzerland", teamShortName: "SUI", teamCode: "SUI", flagEmoji: "🇨🇭" },
            { teamId: "can", rank: 2, played: 1, points: 1, goalsFor: 1, goalDifference: 0, teamName: "Canada", teamShortName: "CAN", teamCode: "CAN", flagEmoji: "🇨🇦" },
            { teamId: "qat", rank: 3, played: 1, points: 1, goalsFor: 1, goalDifference: 0, teamName: "Qatar", teamShortName: "QAT", teamCode: "QAT", flagEmoji: "🇶🇦" },
            { teamId: "bih", rank: 4, played: 1, points: 0, goalsFor: 0, goalDifference: -2, teamName: "Bosnia-Herzegovina", teamShortName: "BIH", teamCode: "BIH", flagEmoji: "🇧🇦" }
          ]
        ]
      ])
    },
    language: "en"
  });

  assert.equal(stakes[0]?.matchId, "g-11");
  assert.equal(stakes[1]?.matchId, "g-22");
});

test("upcoming match stakes include trustworthy team-keyed probability chips", () => {
  const groupDStandings = [
    { teamId: "usa", rank: 1, played: 1, points: 3, goalsFor: 2, goalDifference: 2, teamName: "United States", teamShortName: "USA", teamCode: "USA", flagEmoji: "🇺🇸" },
    { teamId: "aus", rank: 2, played: 1, points: 1, goalsFor: 1, goalDifference: 0, teamName: "Australia", teamShortName: "AUS", teamCode: "AUS", flagEmoji: "🇦🇺" },
    { teamId: "tur", rank: 3, played: 1, points: 1, goalsFor: 1, goalDifference: 0, teamName: "Türkiye", teamShortName: "TUR", teamCode: "TUR", flagEmoji: "🇹🇷" },
    { teamId: "par", rank: 4, played: 1, points: 0, goalsFor: 0, goalDifference: -2, teamName: "Paraguay", teamShortName: "PAR", teamCode: "PAR", flagEmoji: "🇵🇾" }
  ];
  const stakes = buildUpcomingMatchStakes({
    exposures: buildPlayerPickExposures(createSnapshot(), undefined, {
      byGroup: new Map([["Group D", groupDStandings]])
    }),
    upcomingMatches: [createUpcomingMatch()],
    currentStandings: {
      byGroup: new Map([["Group D", groupDStandings]])
    },
    language: "en"
  });

  assert.equal(stakes[0]?.probabilityChips.length, 1);
  assert.match(stakes[0]?.probabilityChips[0]?.label ?? "", /TUR \d+% 3Q/);
});

test("upcoming match stakes omit probability chips when standings metadata is unavailable", () => {
  const stakes = buildUpcomingMatchStakes({
    exposures: buildPlayerPickExposures(createSnapshot(), undefined, createCurrentStandings()),
    upcomingMatches: [createUpcomingMatch()],
    currentStandings: null,
    language: "en"
  });

  assert.equal(stakes[0]?.probabilityChips.length ?? 0, 0);
});
