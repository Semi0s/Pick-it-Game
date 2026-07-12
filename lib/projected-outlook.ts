import type { DashboardScoringHistoryPoint, DashboardScoringMovementSummary } from "./leaderboard-movement-helpers.ts";
import {
  getAdvanceViaThirdProbabilityResult,
  getPickProbabilityForTeam,
  type PickProbabilityResult,
  type PickProbabilityStandingsRow,
  type PickProbabilityTeam
} from "./group-pick-probability.ts";
import type { LightSeedBuilderSnapshot } from "./group-stage-modes.ts";
import { normalizeGroupKey } from "./group-standings.ts";
import { buildPredictedAdvancementByTeamId } from "./group-stage-predicted-advancement.ts";
import { GROUP_PHASE_GROUP_MAX_POINTS, scoreGroupPhaseGroupPrediction } from "./group-phase-scoring.ts";
import { buildQualifiedTeamSeeds } from "./knockout-seeding.ts";

export type ProjectionCheckpointTriggerType = "initial" | "match_final" | "result_update";
export type ProjectionRangeKind = "likely" | "scenario" | "opportunity";
export type ProjectedOutlookMode = "scenario" | "stakes" | "history";

export type ProjectionCheckpointMatch = {
  id: string;
  kickoffTime: string | null;
  groupLabel?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string;
  awayTeamShortName: string;
  homeTeamFlagEmoji?: string | null;
  awayTeamFlagEmoji?: string | null;
};

export type ProjectionCheckpointRange = {
  rangeLowPoints: number;
  rangeHighPoints: number;
  rangeKind?: ProjectionRangeKind | null;
  maxPossiblePoints?: number | null;
  remainingPossiblePoints?: number | null;
};

export type ProjectedOutlookStandingRow = {
  teamId: string;
  rank: number;
  played: number;
  points: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalsFor: number;
  goalsAgainst?: number;
  goalDifference: number;
  teamName?: string | null;
  teamShortName?: string | null;
  teamCode?: string | null;
  flagEmoji?: string | null;
  groupName?: string | null;
};

export type ProjectedOutlookCurrentStandings = {
  byGroup: ReadonlyMap<string, ProjectedOutlookStandingRow[]>;
};

export type ProjectedOutlookMatchSummary = {
  id: string;
  status: "scheduled" | "locked" | "live" | "final";
  kickoffTime: string | null;
  groupLabel?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShortName: string;
  awayTeamShortName: string;
  homeTeamFlagEmoji?: string | null;
  awayTeamFlagEmoji?: string | null;
};

export type ProjectedOutlookScoringRules = {
  winnerPoints: number;
  runnerUpPoints: number;
  thirdPlacePoints: number;
  topTwoAnyOrderBonus: number;
  thirdPlaceQualificationPoints: number;
  completeLadderBonus: number;
};

export type ProjectedOutlookHistoryPoint = {
  checkpointId: string;
  createdAt: string;
  triggerType: ProjectionCheckpointTriggerType;
  triggerMatchId: string | null;
  triggerLabel: string;
  compactLabel: string;
  detailTimestampLabel: string;
  projectedFinalPoints: number;
  projectedRank: number | null;
  lockedPoints: number | null;
  projectedRemainingPoints: number | null;
  likelyLowPoints: number | null;
  likelyHighPoints: number | null;
  rangeKind: ProjectionRangeKind | null;
  maxPossiblePoints: number | null;
  remainingPossiblePoints: number | null;
  changeFromPrevious: number | null;
};

export type ProjectionOutlookRecentMovementRow = {
  id: string;
  compactLabel: string;
  triggerLabel: string;
  timestampLabel: string;
  changeFromPrevious: number | null;
};

export type ProjectionOutlookSummary = {
  mode: ProjectedOutlookMode;
  projectedFinalPoints: number | null;
  projectedRank: number | null;
  lockedPoints: number | null;
  upsideDelta: number | null;
  downsideDelta: number | null;
  pointsAtStake: number | null;
  rangeKind: ProjectionRangeKind | null;
  rangeLabel: string | null;
  sinceLastResultDelta: number | null;
  ceilingPoints: number | null;
  atRiskNextPoints: number | null;
};

export type PickExposureStatus =
  | "locked"
  | "at_risk_next"
  | "live_later"
  | "lost";

export type PickExposureViewModel = {
  teamId: string;
  label: string;
  compactLabel: string;
  groupId?: string;
  route: "top_two" | "third_place";
  points: number;
  status: PickExposureStatus;
};

export type BracketCeilingSummary = {
  submittedCeilingPoints: number | null;
  currentCeilingPoints: number | null;
  lockedPoints: number | null;
  atRiskNextPoints: number | null;
  stillLiveLaterPoints: number | null;
  lostCeilingPoints: number | null;
};

export type BracketCeilingTimelinePoint = {
  id: string;
  label: string;
  compactLabel: string;
  ceilingPoints: number;
  lostDelta?: number;
  triggerLabel?: string;
};

export type ProjectionOutlookScenarioCardViewModel = {
  kind: "scenario";
  matchId: string;
  title: string;
  compactTitle: string;
  kickoffLabel?: string;
  playerPickSummary: string;
  downsideDelta: number;
  upsideDelta: number;
  impactScore: number;
  scenarios: Array<{
    id: string;
    label: string;
    shortLabel?: string;
    projectedFinalPoints: number;
    deltaProjectedPoints: number;
    tone: "good" | "bad" | "neutral" | "mixed";
  }>;
};

export type ProjectionOutlookStakesCardViewModel = {
  kind: "stakes";
  matchId: string;
  title: string;
  compactTitle: string;
  displayLabel: string;
  shortDisplayLabel: string;
  kickoffAt?: string | null;
  kickoffLabel?: string;
  pickSummary: string;
  pointsAtStake: number | null;
  helpsLabel?: string;
  hurtsLabel?: string;
  affectedPickLabels: string[];
  probabilityChips: Array<{
    teamId: string;
    label: string;
  }>;
  pickChips: PickExposureViewModel[];
  goalDifferenceSensitive: boolean;
  impactScore: number;
};

export type ProjectionOutlookCardViewModel =
  | ProjectionOutlookScenarioCardViewModel
  | ProjectionOutlookStakesCardViewModel;

export type CeilingRiskPoint = {
  id: string;
  kind: "history" | "now" | "future_best" | "future_worst";
  label: string;
  shortLabel: string;
  dateLabel?: string | null;
  ceilingPoints: number;
  checkpointCompactLabel?: string | null;
  checkpointDisplayLabel?: string | null;
  lostSincePrevious?: number | null;
};

export type CeilingRiskSummary = {
  projectedPoints: number | null;
  ceilingPoints: number | null;
  atRiskNextPoints: number | null;
  rank: number | null;
};

export type DecisiveMatchCard = {
  matchId: string;
  compactLabel: string;
  shortLabel: string;
  kickoffAt: string | null;
  kickoffLabel: string | null;
  pointsAtStake: number | null;
  affectedPickLabels: string[];
  probabilityChips: Array<{
    teamId: string;
    label: string;
  }>;
  goalDifferenceSensitive: boolean;
  impactScore: number;
};

export type CeilingRiskTooltip = {
  pointId: string;
  title: string;
  lines: string[];
};

export type CeilingRiskGraphModel = {
  summary: CeilingRiskSummary;
  graphPoints: CeilingRiskPoint[];
  futureWedge: {
    nowPoints: number;
    bestPoints: number;
    worstPoints: number;
  } | null;
  decisiveMatches: DecisiveMatchCard[];
  tooltipsByPointId: Record<string, CeilingRiskTooltip>;
  projectedRankVerified: boolean;
};

export type DashboardProjectedOutlookSummary = {
  mode: ProjectedOutlookMode;
  summary: ProjectionOutlookSummary;
  currentProjectedFinal: number | null;
  currentProjectedRank: number | null;
  lockedInPoints: number | null;
  projectedRemainingPoints: number | null;
  likelyLowPoints: number | null;
  likelyHighPoints: number | null;
  maxPossiblePoints: number | null;
  remainingPossiblePoints: number | null;
  sinceLastResult: number | null;
  latestCheckpointLabel: string | null;
  history: ProjectedOutlookHistoryPoint[];
  recentMovementRows: ProjectionOutlookRecentMovementRow[];
  swingCards: ProjectionOutlookCardViewModel[];
  stakesCards: ProjectionOutlookStakesCardViewModel[];
  exposures: PickExposureViewModel[];
  ceiling: BracketCeilingSummary;
  ceilingTimeline: BracketCeilingTimelinePoint[];
  ceilingRiskGraph: CeilingRiskGraphModel;
  ceilingVisualMode: "burn_down" | "current_bar" | "unavailable";
  swingCardsNotice: string | null;
  hasMeaningfulHistory: boolean;
};

export type ProjectedOutlookChartPoint = {
  checkpointId: string;
  label: string;
  secondaryLabel: string | null;
  kind: "checkpoint" | "future";
  projectedFinalPoints: number | null;
  futureProjectedFinalPoints: number | null;
  rangeLowPoints: number | null;
  rangeHighPoints: number | null;
  rangeLowBase: number | null;
  rangeBandSize: number | null;
  rangeKind: ProjectionRangeKind | null;
};

export type PlayerPickExposure = {
  byGroup: Map<string, PlayerPickGroupExposure>;
  byTeamId: Map<string, PlayerPickTeamExposure>;
  predictedAdvancingTeamIds: Set<string>;
  selectedThirdPlaceQualifierTeamIds: Set<string>;
  totalPossiblePoints: number;
};

export type PlayerPickGroupExposure = {
  groupName: string;
  predictedTeamIds: string[];
  predictedAdvancingTeamIds: string[];
  predictedThirdPlaceQualifierTeamIds: string[];
  pointsAtStakeUpperBound: number;
};

export type PlayerPickTeamExposure = {
  teamId: string;
  groupName: string;
  teamShortName: string;
  predictedGroupRank: number | null;
  predictedThirdPlaceRank: number | null;
  isPredictedToAdvance: boolean;
  pointsAtStakeUpperBound: number;
  currentRank: number | null;
};

type ParsedProjectionCheckpoint = {
  checkpointId: string;
  triggerType: ProjectionCheckpointTriggerType;
  triggerMatchId: string | null;
};

type ProjectionCheckpointDisplayLabel = {
  triggerLabel: string;
  compactLabel: string;
  detailTimestampLabel: string;
};

const DEFAULT_SCORING_RULES: ProjectedOutlookScoringRules = {
  winnerPoints: 5,
  runnerUpPoints: 3,
  thirdPlacePoints: 2,
  topTwoAnyOrderBonus: 1,
  thirdPlaceQualificationPoints: 1,
  completeLadderBonus: 2
};

export function createEmptyDashboardProjectedOutlookSummary(): DashboardProjectedOutlookSummary {
  return {
    mode: "history",
    summary: {
      mode: "history",
      projectedFinalPoints: null,
      projectedRank: null,
      lockedPoints: null,
      upsideDelta: null,
      downsideDelta: null,
      pointsAtStake: null,
      rangeKind: null,
      rangeLabel: null,
      sinceLastResultDelta: null,
      ceilingPoints: null,
      atRiskNextPoints: null
    },
    currentProjectedFinal: null,
    currentProjectedRank: null,
    lockedInPoints: null,
    projectedRemainingPoints: null,
    likelyLowPoints: null,
    likelyHighPoints: null,
    maxPossiblePoints: null,
    remainingPossiblePoints: null,
    sinceLastResult: null,
    latestCheckpointLabel: null,
    history: [],
    recentMovementRows: [],
    swingCards: [],
    stakesCards: [],
    exposures: [],
    ceiling: {
      submittedCeilingPoints: null,
      currentCeilingPoints: null,
      lockedPoints: null,
      atRiskNextPoints: null,
      stillLiveLaterPoints: null,
      lostCeilingPoints: null
    },
    ceilingTimeline: [],
    ceilingRiskGraph: {
      summary: {
        projectedPoints: null,
        ceilingPoints: null,
        atRiskNextPoints: null,
        rank: null
      },
      graphPoints: [],
      futureWedge: null,
      decisiveMatches: [],
      tooltipsByPointId: {},
      projectedRankVerified: false
    },
    ceilingVisualMode: "unavailable",
    swingCardsNotice: null,
    hasMeaningfulHistory: false
  };
}

export function buildPlayerPickExposures(
  snapshot: LightSeedBuilderSnapshot | null | undefined,
  scoringRules: ProjectedOutlookScoringRules = DEFAULT_SCORING_RULES,
  currentStandings?: ProjectedOutlookCurrentStandings | null
): PlayerPickExposure {
  const predictedAdvancement = buildPredictedAdvancementByTeamId(snapshot ?? undefined);
  const selectedThirdPlaceQualifierTeamIds = new Set(
    (snapshot?.thirdPlaceRankings ?? []).map((ranking) => ranking.teamId?.trim()).filter((teamId): teamId is string => Boolean(teamId))
  );
  const byGroup = new Map<string, PlayerPickGroupExposure>();
  const byTeamId = new Map<string, PlayerPickTeamExposure>();

  for (const ranking of snapshot?.groupRankings ?? []) {
    const groupName = normalizeGroupKey(ranking.groupName) ?? ranking.groupName;
    const predictedTeamIds = ranking.rankedTeamIds.slice(0, 4).filter(Boolean);
    const groupRows = currentStandings?.byGroup.get(groupName) ?? [];
    const currentRankByTeamId = new Map(groupRows.map((row) => [row.teamId, row.rank] as const));

    const predictedAdvancingTeamIds = predictedTeamIds.filter((teamId) => predictedAdvancement.get(teamId)?.isPredictedToAdvance);
    const predictedThirdPlaceQualifiers = predictedTeamIds.filter((teamId) => selectedThirdPlaceQualifierTeamIds.has(teamId));

    byGroup.set(groupName, {
      groupName,
      predictedTeamIds,
      predictedAdvancingTeamIds,
      predictedThirdPlaceQualifierTeamIds: predictedThirdPlaceQualifiers,
      pointsAtStakeUpperBound: GROUP_POINTS_MAX(scoringRules)
    });

    predictedTeamIds.forEach((teamId, index) => {
      const predictedGroupRank = index + 1;
      const predictedThirdPlaceRank = predictedAdvancement.get(teamId)?.predictedThirdPlaceRank ?? null;
      const pointsAtStakeUpperBound = getPointsAtStakeForPredictedRank({
        predictedGroupRank,
        selectedAsThirdPlaceQualifier: selectedThirdPlaceQualifierTeamIds.has(teamId),
        scoringRules
      });

      byTeamId.set(teamId, {
        teamId,
        groupName,
        teamShortName: teamId.toUpperCase(),
        predictedGroupRank,
        predictedThirdPlaceRank,
        isPredictedToAdvance: predictedAdvancement.get(teamId)?.isPredictedToAdvance ?? false,
        pointsAtStakeUpperBound,
        currentRank: currentRankByTeamId.get(teamId) ?? null
      });
    });
  }

  return {
    byGroup,
    byTeamId,
    predictedAdvancingTeamIds: new Set(
      Array.from(predictedAdvancement.entries())
        .filter(([, decoration]) => decoration.isPredictedToAdvance)
        .map(([teamId]) => teamId)
    ),
    selectedThirdPlaceQualifierTeamIds,
    totalPossiblePoints: (snapshot?.groupRankings.length ?? 0) * GROUP_POINTS_MAX(scoringRules)
  };
}

export function buildUpcomingMatchStakes(input: {
  exposures: PlayerPickExposure;
  upcomingMatches: ProjectedOutlookMatchSummary[];
  currentStandings?: ProjectedOutlookCurrentStandings | null;
  language?: string | null;
}): ProjectionOutlookStakesCardViewModel[] {
  const cards: ProjectionOutlookStakesCardViewModel[] = [];

  for (const match of input.upcomingMatches) {
    const groupName = normalizeGroupKey(match.groupLabel) ?? match.groupLabel ?? null;
    if (!groupName) {
      continue;
    }

    const groupExposure = input.exposures.byGroup.get(groupName) ?? null;
    const homeExposure = match.homeTeamId ? input.exposures.byTeamId.get(match.homeTeamId) ?? null : null;
    const awayExposure = match.awayTeamId ? input.exposures.byTeamId.get(match.awayTeamId) ?? null : null;
    if (!groupExposure && !homeExposure && !awayExposure) {
      continue;
    }

    const directlyAffectedTeams = [homeExposure, awayExposure].filter(
      (exposure): exposure is PlayerPickTeamExposure => Boolean(exposure && exposure.isPredictedToAdvance)
    );
    if (directlyAffectedTeams.length === 0) {
      continue;
    }
    const affectedPickLabels = directlyAffectedTeams.map((exposure) => buildPredictedTeamLabel(exposure));
    const pointsAtStake =
      directlyAffectedTeams.length > 0
        ? Math.max(...directlyAffectedTeams.map((exposure) => exposure.pointsAtStakeUpperBound))
        : groupExposure?.pointsAtStakeUpperBound ?? null;
    const pickSummary = buildStakePickSummary({
      groupName,
      directlyAffectedTeams,
      groupExposure
    });
    const scenarioText = buildStakeScenarioText({
      match,
      directlyAffectedTeams,
      groupName,
      currentStandings: input.currentStandings ?? null
    });
    const probabilityChips = buildStakeProbabilityChips({
      directlyAffectedTeams,
      currentStandings: input.currentStandings ?? null,
      exposures: input.exposures
    });

    cards.push({
      kind: "stakes",
      matchId: match.id,
      title: `${match.homeTeamName} vs ${match.awayTeamName}`,
      compactTitle: `${match.homeTeamShortName}-${match.awayTeamShortName}`,
      displayLabel: `${formatFlagCodeLabel(match.homeTeamFlagEmoji, match.homeTeamShortName)} vs ${formatFlagCodeLabel(match.awayTeamFlagEmoji, match.awayTeamShortName)}`,
      shortDisplayLabel: `${match.homeTeamShortName}-${match.awayTeamShortName}`,
      kickoffAt: match.kickoffTime,
      kickoffLabel: formatKickoffLabel(match.kickoffTime, input.language),
      pickSummary,
      pointsAtStake: pointsAtStake !== null ? roundOutlookMetric(pointsAtStake) : null,
      helpsLabel: scenarioText.helpsLabel,
      hurtsLabel: scenarioText.hurtsLabel,
      affectedPickLabels,
      probabilityChips,
      pickChips: directlyAffectedTeams.map((exposure) => toExposureChip(exposure)),
      goalDifferenceSensitive: directlyAffectedTeams.some((exposure) => exposure.predictedGroupRank === 3),
      impactScore: pointsAtStake ?? directlyAffectedTeams.length ?? 0
    });
  }

  return cards
    .sort((left, right) => {
      if (right.impactScore !== left.impactScore) {
        return right.impactScore - left.impactScore;
      }
      const kickoffDiff = compareKickoffTimes(left.kickoffAt, right.kickoffAt);
      if (kickoffDiff !== 0) {
        return kickoffDiff;
      }
      if (right.pickChips.length !== left.pickChips.length) {
        return right.pickChips.length - left.pickChips.length;
      }
      return left.title.localeCompare(right.title);
    })
    .slice(0, 2);
}

export function buildProjectionOutlookViewModel(input: {
  projected: DashboardScoringMovementSummary;
  official?: DashboardScoringMovementSummary | null;
  currentProjection?: {
    checkpointId: string | null;
    createdAt?: string | null;
    projectedFinalPoints: number | null;
    projectedRank?: number | null;
  } | null;
  checkpointMatchesById?: ReadonlyMap<string, ProjectionCheckpointMatch> | null;
  checkpointRangesById?: ReadonlyMap<string, ProjectionCheckpointRange> | null;
  snapshot?: LightSeedBuilderSnapshot | null;
  currentStandings?: ProjectedOutlookCurrentStandings | null;
  allMatches?: ProjectedOutlookMatchSummary[] | null;
  upcomingMatches?: ProjectedOutlookMatchSummary[] | null;
  scoringRules?: ProjectedOutlookScoringRules | null;
  language?: string | null;
}): DashboardProjectedOutlookSummary {
  const projectedHistory = synchronizeCurrentProjectionHistory({
    history: input.projected.history,
    currentProjection: input.currentProjection ?? null,
    fallbackRank: input.projected.currentRank ?? null,
    fallbackCreatedAt: input.projected.latestSnapshotAt ?? null
  });
  if (projectedHistory.length === 0) {
    return createEmptyDashboardProjectedOutlookSummary();
  }

  const scoringRules = input.scoringRules ?? DEFAULT_SCORING_RULES;
  const exposures = buildPlayerPickExposures(input.snapshot, scoringRules, input.currentStandings);
  const stakesCards = buildUpcomingMatchStakes({
    exposures,
    upcomingMatches: (input.upcomingMatches ?? []).filter((match) => match.status === "scheduled" || match.status === "locked" || match.status === "live"),
    currentStandings: input.currentStandings,
    language: input.language
  });
  const ceilingModel = buildBracketCeilingModel({
    snapshot: input.snapshot,
    exposures,
    stakesCards,
    currentStandings: input.currentStandings,
    allMatches: input.allMatches,
    scoringRules
  });

  const officialHistory = sortHistoryAscending(input.official?.history ?? []);
  const officialHistoryByMatchId = new Map(officialHistory.map((point) => [point.matchId, point] as const));
  const fallbackOfficialCurrentPoints =
    typeof input.official?.currentPoints === "number" ? input.official.currentPoints : 0;

  const totalPossiblePoints = exposures.totalPossiblePoints > 0 ? exposures.totalPossiblePoints : null;
  const history = projectedHistory.map((point, index) => {
    const checkpoint = parseProjectionCheckpoint(point.matchId);
    const labels = resolveProjectionEventLabel({
      checkpoint,
      checkpointMatch: checkpoint.triggerMatchId
        ? input.checkpointMatchesById?.get(checkpoint.triggerMatchId) ?? null
        : null,
      createdAt: point.createdAt,
      language: input.language
    });
    const rangeMeta =
      input.checkpointRangesById?.get(checkpoint.checkpointId) ??
      (checkpoint.triggerMatchId ? input.checkpointRangesById?.get(checkpoint.triggerMatchId) : null) ??
      null;
    const lockedPoints = resolveLockedPointsForCheckpoint({
      projectedPoint: point,
      officialHistory,
      officialHistoryByMatchId,
      fallbackCurrentPoints: fallbackOfficialCurrentPoints
    });
    const maxPossiblePoints = resolveMaxPossiblePoints({
      explicitMax: rangeMeta?.maxPossiblePoints ?? null,
      totalPossiblePoints,
      lockedPoints
    });
    const remainingPossiblePoints =
      typeof rangeMeta?.remainingPossiblePoints === "number"
        ? roundOutlookMetric(rangeMeta.remainingPossiblePoints)
        : maxPossiblePoints !== null && typeof lockedPoints === "number"
          ? roundOutlookMetric(Math.max(0, maxPossiblePoints - lockedPoints))
          : null;
    const projectedRemainingPoints =
      lockedPoints === null ? null : roundOutlookMetric(Math.max(0, point.totalPoints - lockedPoints));

    return {
      checkpointId: checkpoint.checkpointId,
      createdAt: point.createdAt,
      triggerType: checkpoint.triggerType,
      triggerMatchId: checkpoint.triggerMatchId,
      triggerLabel: labels.triggerLabel,
      compactLabel: labels.compactLabel,
      detailTimestampLabel: labels.detailTimestampLabel,
      projectedFinalPoints: roundOutlookMetric(point.totalPoints),
      projectedRank: point.rank,
      lockedPoints,
      projectedRemainingPoints,
      likelyLowPoints:
        typeof rangeMeta?.rangeLowPoints === "number" ? roundOutlookMetric(rangeMeta.rangeLowPoints) : null,
      likelyHighPoints:
        typeof rangeMeta?.rangeHighPoints === "number" ? roundOutlookMetric(rangeMeta.rangeHighPoints) : null,
      rangeKind: rangeMeta?.rangeKind ?? (rangeMeta ? "likely" : null),
      maxPossiblePoints,
      remainingPossiblePoints,
      changeFromPrevious:
        index === 0 ? null : roundOutlookMetric(point.totalPoints - projectedHistory[index - 1]!.totalPoints)
    } satisfies ProjectedOutlookHistoryPoint;
  });

  const latest = history.at(-1) ?? null;
  if (!latest) {
    return createEmptyDashboardProjectedOutlookSummary();
  }

  const scenarioCards: ProjectionOutlookScenarioCardViewModel[] = [];
  const hasScenarioMode = scenarioCards.length > 0;
  const hasStakesMode =
    stakesCards.length > 0 ||
    (ceilingModel.ceiling.atRiskNextPoints ?? 0) > 0 ||
    (ceilingModel.ceiling.stillLiveLaterPoints ?? 0) > 0;
  const mode: ProjectedOutlookMode = hasScenarioMode ? "scenario" : hasStakesMode ? "stakes" : "history";

  const summaryRange = resolveLatestProjectionRange(latest);
  const summary: ProjectionOutlookSummary = {
    mode,
    projectedFinalPoints: latest.projectedFinalPoints,
    projectedRank: latest.projectedRank,
    lockedPoints: latest.lockedPoints,
    upsideDelta:
      summaryRange && latest.projectedFinalPoints !== null
        ? roundOutlookMetric(summaryRange.high - latest.projectedFinalPoints)
        : null,
    downsideDelta:
      summaryRange && latest.projectedFinalPoints !== null
        ? roundOutlookMetric(summaryRange.low - latest.projectedFinalPoints)
        : null,
    pointsAtStake:
      mode === "stakes"
        ? roundOutlookMetric(
            Math.max(
              ceilingModel.ceiling.atRiskNextPoints ?? 0,
              ...stakesCards.map((card) => card.pointsAtStake ?? 0)
            )
          )
        : null,
    rangeKind: summaryRange?.kind ?? null,
    rangeLabel: summaryRange ? getProjectionRangeLabel(summaryRange.kind) : null,
    sinceLastResultDelta: latest.changeFromPrevious,
    ceilingPoints: ceilingModel.ceiling.currentCeilingPoints,
    atRiskNextPoints: ceilingModel.ceiling.atRiskNextPoints
  };

  const swingCards: ProjectionOutlookCardViewModel[] =
    mode === "scenario"
      ? scenarioCards
      : mode === "stakes"
        ? stakesCards
        : [];
  const ceilingRiskGraph = buildCeilingRiskChartModel({
    history,
    ceiling: ceilingModel.ceiling,
    summary,
    stakesCards
  });

  return {
    mode,
    summary,
    currentProjectedFinal: latest.projectedFinalPoints,
    currentProjectedRank: latest.projectedRank,
    lockedInPoints: latest.lockedPoints,
    projectedRemainingPoints: latest.projectedRemainingPoints,
    likelyLowPoints: latest.likelyLowPoints,
    likelyHighPoints: latest.likelyHighPoints,
    maxPossiblePoints: latest.maxPossiblePoints,
    remainingPossiblePoints: latest.remainingPossiblePoints,
    sinceLastResult: latest.changeFromPrevious,
    latestCheckpointLabel: latest.triggerLabel,
    history,
    recentMovementRows: buildRecentMovementRows(history),
    swingCards,
    stakesCards,
    exposures: ceilingModel.exposures,
    ceiling: ceilingModel.ceiling,
    ceilingTimeline: ceilingModel.ceilingTimeline,
    ceilingRiskGraph,
    ceilingVisualMode: ceilingModel.ceilingVisualMode,
    swingCardsNotice:
      null,
    hasMeaningfulHistory: history.length >= 2
  };
}

function buildBracketCeilingModel(input: {
  snapshot?: LightSeedBuilderSnapshot | null;
  exposures: PlayerPickExposure;
  stakesCards: ProjectionOutlookStakesCardViewModel[];
  currentStandings?: ProjectedOutlookCurrentStandings | null;
  allMatches?: ProjectedOutlookMatchSummary[] | null;
  scoringRules: ProjectedOutlookScoringRules;
}): {
  ceiling: BracketCeilingSummary;
  exposures: PickExposureViewModel[];
  ceilingTimeline: BracketCeilingTimelinePoint[];
  ceilingVisualMode: "burn_down" | "current_bar" | "unavailable";
} {
  const allMatches = (input.allMatches ?? []).filter((match) => normalizeGroupKey(match.groupLabel));
  const nonFinalCountByGroup = new Map<string, number>();
  for (const match of allMatches) {
    const groupName = normalizeGroupKey(match.groupLabel) ?? match.groupLabel ?? null;
    if (!groupName) {
      continue;
    }

    if (match.status !== "final") {
      nonFinalCountByGroup.set(groupName, (nonFinalCountByGroup.get(groupName) ?? 0) + 1);
    }
  }

  const allGroupsFinal =
    input.currentStandings?.byGroup.size
      ? Array.from(input.currentStandings.byGroup.keys()).every((groupName) => (nonFinalCountByGroup.get(groupName) ?? 0) === 0)
      : false;
  const resolvedQualifiedThirdPlaceTeamIds = allGroupsFinal
    ? resolveQualifiedThirdPlaceTeamIds(input.currentStandings, input.snapshot)
    : null;
  const atRiskTeamIds = new Set(
    input.stakesCards.flatMap((card) => card.pickChips.map((chip) => chip.teamId))
  );

  let submittedCeilingPoints = 0;
  let currentCeilingPoints = 0;
  let lockedPoints = 0;
  let atRiskNextPoints = 0;
  let stillLiveLaterPoints = 0;
  let lostCeilingPoints = 0;
  const exposures: PickExposureViewModel[] = [];

  for (const [groupName, groupExposure] of input.exposures.byGroup.entries()) {
    submittedCeilingPoints += GROUP_POINTS_MAX(input.scoringRules);
    const groupRows = input.currentStandings?.byGroup.get(groupName) ?? [];
    const isGroupFinal = (nonFinalCountByGroup.get(groupName) ?? 0) === 0 && groupRows.length >= 4;
    const finalizedOutcome = isGroupFinal
      ? scoreFinalizedGroupCeiling({
          groupName,
          predictedTeamIds: groupExposure.predictedTeamIds,
          selectedThirdPlaceQualifierTeamIds: new Set(groupExposure.predictedThirdPlaceQualifierTeamIds),
          groupRows,
          allGroupsFinal,
          resolvedQualifiedThirdPlaceTeamIds
        })
      : null;

    const groupLockedPoints = finalizedOutcome?.lockedPoints ?? 0;
    const groupCurrentCeilingPoints = finalizedOutcome?.currentCeilingPoints ?? GROUP_POINTS_MAX(input.scoringRules);
    const groupLostPoints = finalizedOutcome?.lostPoints ?? 0;

    currentCeilingPoints += groupCurrentCeilingPoints;
    lockedPoints += groupLockedPoints;
    lostCeilingPoints += groupLostPoints;
    let groupAtRiskPoints = 0;

    for (const teamId of groupExposure.predictedAdvancingTeamIds) {
      const teamExposure = input.exposures.byTeamId.get(teamId);
      if (!teamExposure) {
        continue;
      }

      const status: PickExposureStatus = finalizedOutcome
        ? resolveExposureStatusForFinalizedGroup({
          teamId,
          teamExposure,
          currentGroupRows: groupRows,
          selectedThirdPlaceQualifierTeamIds: new Set(groupExposure.predictedThirdPlaceQualifierTeamIds),
          actualQualifiedThirdPlaceTeamIds: resolvedQualifiedThirdPlaceTeamIds
        })
        : atRiskTeamIds.has(teamId)
          ? "at_risk_next"
          : "live_later";

      const chip = toExposureChip(teamExposure, status);
      exposures.push(chip);

      if (status === "at_risk_next") {
        groupAtRiskPoints += chip.points;
      }
    }

    if (!finalizedOutcome) {
      const cappedGroupAtRiskPoints = Math.min(groupCurrentCeilingPoints, groupAtRiskPoints);
      atRiskNextPoints += cappedGroupAtRiskPoints;
      stillLiveLaterPoints += Math.max(0, groupCurrentCeilingPoints - cappedGroupAtRiskPoints);
    }
  }

  const ceiling: BracketCeilingSummary = {
    submittedCeilingPoints: submittedCeilingPoints > 0 ? submittedCeilingPoints : null,
    currentCeilingPoints: submittedCeilingPoints > 0 ? currentCeilingPoints : null,
    lockedPoints: submittedCeilingPoints > 0 ? lockedPoints : null,
    atRiskNextPoints: atRiskNextPoints > 0 ? roundOutlookMetric(atRiskNextPoints) : 0,
    stillLiveLaterPoints: stillLiveLaterPoints > 0 ? roundOutlookMetric(stillLiveLaterPoints) : 0,
    lostCeilingPoints: lostCeilingPoints > 0 ? roundOutlookMetric(lostCeilingPoints) : 0
  };

  return {
    ceiling,
    exposures,
    ceilingTimeline: [],
    ceilingVisualMode: ceiling.submittedCeilingPoints !== null ? "current_bar" : "unavailable"
  };
}

export function buildCeilingRiskChartModel(input: {
  history: ProjectedOutlookHistoryPoint[];
  ceiling: BracketCeilingSummary;
  summary: ProjectionOutlookSummary;
  stakesCards: ProjectionOutlookStakesCardViewModel[];
}): CeilingRiskGraphModel {
  const latest = input.history.at(-1) ?? null;
  const currentProjected = input.summary.projectedFinalPoints;
  const currentCeiling = input.ceiling.currentCeilingPoints;
  const atRiskNext = input.ceiling.atRiskNextPoints;
  const nextCompactDateLabel = deriveCompactKickoffDateLabel(input.stakesCards[0]?.kickoffLabel ?? null);
  const nextDateLabel = input.stakesCards[0]?.kickoffLabel ?? latest?.detailTimestampLabel ?? null;

  const graphPoints: CeilingRiskPoint[] = [];
  const tooltipsByPointId: Record<string, CeilingRiskTooltip> = {};

  const addPoint = (point: CeilingRiskPoint, tooltip: CeilingRiskTooltip) => {
    graphPoints.push(point);
    tooltipsByPointId[point.id] = tooltip;
  };

  const historicalCeilingSeries = buildHistoricalProjectedSeries(input.history);

  for (const point of historicalCeilingSeries) {
    addPoint(
      point,
      point.kind === "now"
        ? {
            pointId: point.id,
            title: "Now",
            lines: [
              `Projected ${formatPlainOutlookNumber(point.ceilingPoints)}`,
              typeof currentCeiling === "number" ? `Ceiling ${formatPlainOutlookNumber(currentCeiling)}` : null,
              `At risk next ${formatPlainOutlookNumber(input.summary.atRiskNextPoints)}`
            ].filter((value): value is string => Boolean(value))
          }
        : {
            pointId: point.id,
            title: point.dateLabel ?? point.label,
            lines: [
              point.checkpointDisplayLabel ?? point.label,
              `Projected ${formatPlainOutlookNumber(point.ceilingPoints)}`,
              typeof point.lostSincePrevious === "number" && point.lostSincePrevious !== 0
                ? `Change ${point.lostSincePrevious > 0 ? "-" : "+"}${formatPlainOutlookNumber(Math.abs(point.lostSincePrevious))}`
                : null
            ].filter((value): value is string => Boolean(value))
          }
    );
  }

  const futureWedge =
    typeof currentCeiling === "number" &&
    typeof atRiskNext === "number" &&
    atRiskNext > 0
      ? {
          nowPoints: roundOutlookMetric(currentProjected ?? currentCeiling),
          bestPoints: roundOutlookMetric(currentCeiling),
          worstPoints: roundOutlookMetric(Math.max(0, currentCeiling - atRiskNext))
        }
      : null;

  if (futureWedge) {
    const bestId = "future-best";
    const worstId = "future-worst";
    addPoint(
      {
        id: bestId,
        kind: "future_best",
        label: "Best near-term path",
        shortLabel: nextCompactDateLabel ?? (latest ? formatCompactMonthDayLabel(latest.createdAt) : "Next"),
        dateLabel: nextDateLabel,
        ceilingPoints: futureWedge.bestPoints,
        checkpointCompactLabel: latest?.compactLabel ?? null,
        checkpointDisplayLabel: latest?.triggerLabel ?? null
      },
      {
        pointId: bestId,
        title: "Best near-term path",
        lines: [`Ceiling holds at ${formatPlainOutlookNumber(futureWedge.bestPoints)}`]
      }
    );
    addPoint(
      {
        id: worstId,
        kind: "future_worst",
        label: "If the next results go against you",
        shortLabel: nextCompactDateLabel ?? (latest ? formatCompactMonthDayLabel(latest.createdAt) : "Next"),
        dateLabel: nextDateLabel,
        ceilingPoints: futureWedge.worstPoints,
        checkpointCompactLabel: latest?.compactLabel ?? null,
        checkpointDisplayLabel: latest?.triggerLabel ?? null,
        lostSincePrevious: roundOutlookMetric(futureWedge.bestPoints - futureWedge.worstPoints)
      },
      {
        pointId: worstId,
        title: "Risk next",
        lines: [
          `Ceiling drops to ${formatPlainOutlookNumber(futureWedge.worstPoints)}`,
          `Swing ${formatPlainOutlookNumber(futureWedge.bestPoints - futureWedge.worstPoints)}`
        ]
      }
    );
  }

  return {
    summary: {
      projectedPoints: input.summary.projectedFinalPoints,
      ceilingPoints: currentCeiling,
      atRiskNextPoints: atRiskNext,
      rank: input.summary.projectedRank
    },
    graphPoints,
    futureWedge,
    decisiveMatches: input.stakesCards.slice(0, 2).map((card) => ({
      matchId: card.matchId,
      compactLabel: card.displayLabel,
      shortLabel: card.shortDisplayLabel,
      kickoffAt: card.kickoffAt ?? null,
      kickoffLabel: card.kickoffLabel ?? null,
      pointsAtStake: card.pointsAtStake,
      affectedPickLabels: card.affectedPickLabels,
      probabilityChips: card.probabilityChips,
      goalDifferenceSensitive: card.goalDifferenceSensitive,
      impactScore: card.impactScore
    })),
    tooltipsByPointId,
    projectedRankVerified: false
  };
}

export function buildProjectedOutlookChartModel(input: {
  history: ProjectedOutlookHistoryPoint[];
  ceiling: BracketCeilingSummary;
  summary: ProjectionOutlookSummary;
  stakesCards?: ProjectionOutlookStakesCardViewModel[];
}) {
  return buildCeilingRiskChartModel({
    history: input.history,
    ceiling: input.ceiling,
    summary: input.summary,
    stakesCards: input.stakesCards ?? []
  });
}

function buildRecentMovementRows(history: ProjectedOutlookHistoryPoint[]): ProjectionOutlookRecentMovementRow[] {
  return history
    .filter((point, index) => index > 0)
    .slice()
    .reverse()
    .map((point) => ({
      id: `${point.checkpointId}:${point.createdAt}`,
      compactLabel: point.compactLabel,
      triggerLabel: point.compactLabel,
      timestampLabel: "",
      changeFromPrevious: point.changeFromPrevious
    }));
}

function buildHistoricalProjectedSeries(history: ProjectedOutlookHistoryPoint[]): CeilingRiskPoint[] {
  const points: CeilingRiskPoint[] = [];
  const latest = history.at(-1) ?? null;

  if (!latest) {
    return points;
  }

  const middlePoints = history.slice(0, -1);
  let previousProjected: number | null = null;
  for (const point of middlePoints) {
    const projectedPoints = roundOutlookMetric(point.projectedFinalPoints);
    const delta =
      previousProjected === null ? null : roundOutlookMetric(projectedPoints - previousProjected);
    previousProjected = projectedPoints;
    points.push({
      id: `history:${point.checkpointId}`,
      kind: "history",
      label: point.triggerLabel,
      shortLabel: formatCompactMonthDayLabel(point.createdAt),
      dateLabel: point.detailTimestampLabel,
      ceilingPoints: projectedPoints,
      checkpointCompactLabel: point.compactLabel,
      checkpointDisplayLabel: point.triggerLabel,
      lostSincePrevious: delta
    });
  }

  const nowProjected = roundOutlookMetric(latest.projectedFinalPoints);
  const nowDelta =
    previousProjected === null ? null : roundOutlookMetric(nowProjected - previousProjected);
  points.push({
    id: `now:${latest.checkpointId}`,
    kind: "now",
    label: "Now",
    shortLabel: formatCompactMonthDayLabel(latest.createdAt),
    dateLabel: latest.detailTimestampLabel,
    ceilingPoints: nowProjected,
    checkpointCompactLabel: latest.compactLabel,
    checkpointDisplayLabel: latest.triggerLabel,
    lostSincePrevious: nowDelta
  });

  return dedupeCeilingRiskPoints(points);
}

function dedupeCeilingRiskPoints(points: CeilingRiskPoint[]) {
  const result: CeilingRiskPoint[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.kind === point.kind &&
      previous.shortLabel === point.shortLabel &&
      previous.ceilingPoints === point.ceilingPoints
    ) {
      continue;
    }
    result.push(point);
  }
  return result;
}

function formatCompactMonthDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Now";
  }

  return new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric"
  }).format(date);
}

function deriveCompactKickoffDateLabel(kickoffLabel: string | null) {
  if (!kickoffLabel) {
    return null;
  }

  const [datePart] = kickoffLabel.split("·");
  const normalized = datePart?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function compareKickoffTimes(leftValue: string | null | undefined, rightValue: string | null | undefined) {
  const leftTimestamp = parseKickoffTimestamp(leftValue);
  const rightTimestamp = parseKickoffTimestamp(rightValue);
  if (leftTimestamp === null && rightTimestamp === null) {
    return 0;
  }
  if (leftTimestamp === null) {
    return 1;
  }
  if (rightTimestamp === null) {
    return -1;
  }
  return leftTimestamp - rightTimestamp;
}

function parseKickoffTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildStakeProbabilityChips(input: {
  directlyAffectedTeams: PlayerPickTeamExposure[];
  currentStandings: ProjectedOutlookCurrentStandings | null;
  exposures: PlayerPickExposure;
}) {
  if (!input.currentStandings?.byGroup.size || input.directlyAffectedTeams.length === 0) {
    return [];
  }

  const teamsById = buildProbabilityTeamsById(input.currentStandings);
  const thirdPlacePool = buildThirdPlaceProbabilityPool({
    exposures: input.exposures,
    teamsById
  });

  return input.directlyAffectedTeams
    .map((exposure) => {
      const probability = getStakeProbabilityForExposure({
        exposure,
        currentStandings: input.currentStandings!,
        teamsById,
        thirdPlacePool
      });
      if (!probability || probability.probability === null || probability.isUnavailable) {
        return null;
      }

      return {
        teamId: exposure.teamId,
        label: formatStakeProbabilityChip(exposure.teamShortName, probability)
      };
    })
    .filter((chip): chip is { teamId: string; label: string } => Boolean(chip));
}

function buildProbabilityTeamsById(currentStandings: ProjectedOutlookCurrentStandings) {
  const teamsById = new Map<string, PickProbabilityTeam>();
  for (const [groupName, rows] of currentStandings.byGroup.entries()) {
    for (const row of rows) {
      teamsById.set(row.teamId, {
        id: row.teamId,
        name: row.teamName ?? row.teamCode ?? row.teamShortName ?? row.teamId.toUpperCase(),
        shortName: row.teamShortName ?? row.teamCode ?? row.teamId.toUpperCase(),
        groupName,
        fifaRank: 999,
        fifaPoints: null,
        flagEmoji: row.flagEmoji ?? ""
      });
    }
  }
  return teamsById;
}

function buildThirdPlaceProbabilityPool(input: {
  exposures: PlayerPickExposure;
  teamsById: Map<string, PickProbabilityTeam>;
}) {
  return Array.from(input.exposures.byTeamId.values())
    .filter((team) => team.predictedGroupRank === 3)
    .sort((left, right) => {
      const leftRank = left.predictedThirdPlaceRank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.predictedThirdPlaceRank ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.groupName.localeCompare(right.groupName);
    })
    .map((team) => input.teamsById.get(team.teamId) ?? null)
    .filter((team): team is PickProbabilityTeam => Boolean(team));
}

function getStakeProbabilityForExposure(input: {
  exposure: PlayerPickTeamExposure;
  currentStandings: ProjectedOutlookCurrentStandings;
  teamsById: Map<string, PickProbabilityTeam>;
  thirdPlacePool: PickProbabilityTeam[];
}): PickProbabilityResult | null {
  const team = input.teamsById.get(input.exposure.teamId);
  if (!team) {
    return null;
  }

  if (input.exposure.predictedGroupRank === 3 && input.exposure.predictedThirdPlaceRank) {
    return getAdvanceViaThirdProbabilityResult({
      team,
      thirdPlacePool: input.thirdPlacePool,
      thirdPlaceRankingIndex: Math.max(0, input.exposure.predictedThirdPlaceRank - 1),
      predictedPlace: 3
    });
  }

  if (input.exposure.predictedGroupRank !== 1 && input.exposure.predictedGroupRank !== 2) {
    return null;
  }

  const groupRows = input.currentStandings.byGroup.get(input.exposure.groupName) ?? [];
  const probabilityRows: PickProbabilityStandingsRow[] = groupRows.map((row) => ({
    teamId: row.teamId,
    rank: row.rank,
    played: row.played,
    goalsFor: row.goalsFor,
    goalDifference: row.goalDifference,
    points: row.points
  }));
  const groupTeams = groupRows
    .map((row) => input.teamsById.get(row.teamId) ?? null)
    .filter((candidate): candidate is PickProbabilityTeam => Boolean(candidate));

  return getPickProbabilityForTeam({
    rows: probabilityRows,
    remainingMatches: [],
    teamId: input.exposure.teamId,
    predictedPlace: input.exposure.predictedGroupRank,
    team,
    groupTeams,
    thirdPlacePool: input.thirdPlacePool,
    thirdPlaceRankingIndex:
      typeof input.exposure.predictedThirdPlaceRank === "number"
        ? Math.max(0, input.exposure.predictedThirdPlaceRank - 1)
        : null
  });
}

function formatStakeProbabilityChip(teamShortName: string, probability: PickProbabilityResult) {
  const percent = probability.probability === null ? "—" : `${probability.probability}%`;
  if (probability.mode === "advance_via_third") {
    return `${teamShortName} ${percent} 3Q`;
  }
  if (probability.targetLabel === "1st" || probability.targetLabel === "2nd") {
    return `${teamShortName} ${percent} ${probability.targetLabel}`;
  }
  return `${teamShortName} ${percent}`;
}

function formatFlagCodeLabel(flagEmoji: string | null | undefined, code: string | null | undefined) {
  const normalizedCode = (code ?? "").trim().toUpperCase();
  const normalizedFlagEmoji = (flagEmoji ?? "").trim();
  const isEnglandFlag =
    normalizedFlagEmoji === "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
  if (isEnglandFlag && normalizedCode) {
    return normalizedCode;
  }
  if (normalizedFlagEmoji && normalizedCode) {
    return `${normalizedFlagEmoji} ${normalizedCode}`;
  }
  if (normalizedCode) {
    return normalizedCode;
  }
  return normalizedFlagEmoji || "TBD";
}

function formatPlainOutlookNumber(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "—";
  }

  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function resolveLatestProjectionRange(point: ProjectedOutlookHistoryPoint): {
  low: number;
  high: number;
  kind: ProjectionRangeKind;
} | null {
  if (
    typeof point.likelyLowPoints === "number" &&
    typeof point.likelyHighPoints === "number" &&
    point.likelyHighPoints >= point.likelyLowPoints
  ) {
    return {
      low: point.likelyLowPoints,
      high: point.likelyHighPoints,
      kind: point.rangeKind ?? "likely"
    };
  }

  if (
    typeof point.lockedPoints === "number" &&
    typeof point.maxPossiblePoints === "number" &&
    point.maxPossiblePoints >= point.lockedPoints &&
    point.maxPossiblePoints > point.lockedPoints
  ) {
    return {
      low: point.lockedPoints,
      high: point.maxPossiblePoints,
      kind: "opportunity"
    };
  }

  return null;
}

function getProjectionRangeLabel(rangeKind: ProjectionRangeKind) {
  switch (rangeKind) {
    case "scenario":
      return "Swing window";
    case "opportunity":
      return "Opportunity window";
    case "likely":
    default:
      return "Likely range";
  }
}

function normalizeProjectionHistory(history: DashboardScoringHistoryPoint[]): DashboardScoringHistoryPoint[] {
  const latestByCheckpointId = new Map<string, DashboardScoringHistoryPoint>();

  for (const point of history) {
    const existing = latestByCheckpointId.get(point.matchId);
    if (!existing || new Date(point.createdAt).getTime() >= new Date(existing.createdAt).getTime()) {
      latestByCheckpointId.set(point.matchId, point);
    }
  }

  return sortHistoryAscending(Array.from(latestByCheckpointId.values()));
}

function synchronizeCurrentProjectionHistory(input: {
  history: DashboardScoringHistoryPoint[];
  currentProjection: {
    checkpointId: string | null;
    createdAt?: string | null;
    projectedFinalPoints: number | null;
    projectedRank?: number | null;
  } | null;
  fallbackRank: number | null;
  fallbackCreatedAt: string | null;
}) {
  const normalizedHistory = normalizeProjectionHistory(input.history);
  const checkpointId = input.currentProjection?.checkpointId?.trim() ?? "";
  const projectedFinalPoints = input.currentProjection?.projectedFinalPoints;

  if (!checkpointId || typeof projectedFinalPoints !== "number") {
    return normalizedHistory;
  }

  const existingIndex = normalizedHistory.findIndex((point) => point.matchId === checkpointId);
  const existingPoint = existingIndex >= 0 ? normalizedHistory[existingIndex] ?? null : null;
  const resolvedCreatedAt =
    input.currentProjection?.createdAt ??
    existingPoint?.createdAt ??
    input.fallbackCreatedAt ??
    new Date().toISOString();
  const resolvedRank =
    input.currentProjection?.projectedRank ??
    existingPoint?.rank ??
    input.fallbackRank ??
    1;

  const replacementPoint: DashboardScoringHistoryPoint = {
    matchId: checkpointId,
    createdAt: resolvedCreatedAt,
    totalPoints: roundOutlookMetric(projectedFinalPoints),
    pacePoints: existingPoint?.pacePoints ?? null,
    rank: resolvedRank,
    pointsDelta: existingPoint?.pointsDelta ?? null,
    rankDelta: existingPoint?.rankDelta ?? null,
    paceDelta:
      typeof existingPoint?.pacePoints === "number"
        ? roundOutlookMetric(projectedFinalPoints - existingPoint.pacePoints)
        : null
  };

  if (existingPoint) {
    if (
      existingPoint.totalPoints === replacementPoint.totalPoints &&
      existingPoint.rank === replacementPoint.rank &&
      existingPoint.createdAt === replacementPoint.createdAt
    ) {
      return normalizedHistory;
    }

    const nextHistory = normalizedHistory.slice();
    nextHistory.splice(existingIndex, 1, replacementPoint);
    return sortHistoryAscending(nextHistory);
  }

  return sortHistoryAscending([...normalizedHistory, replacementPoint]);
}

function sortHistoryAscending(history: DashboardScoringHistoryPoint[]) {
  return history
    .slice()
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function resolveLockedPointsForCheckpoint(input: {
  projectedPoint: DashboardScoringHistoryPoint;
  officialHistory: DashboardScoringHistoryPoint[];
  officialHistoryByMatchId: ReadonlyMap<string, DashboardScoringHistoryPoint>;
  fallbackCurrentPoints: number;
}): number | null {
  const parsedCheckpoint = parseProjectionCheckpoint(input.projectedPoint.matchId);

  if (parsedCheckpoint.triggerType === "initial") {
    return 0;
  }

  if (parsedCheckpoint.triggerMatchId) {
    const exactMatch = input.officialHistoryByMatchId.get(parsedCheckpoint.triggerMatchId);
    if (exactMatch) {
      return roundOutlookMetric(exactMatch.totalPoints);
    }
  }

  const previousOfficialSnapshot = input.officialHistory
    .filter((point) => new Date(point.createdAt).getTime() <= new Date(input.projectedPoint.createdAt).getTime())
    .at(-1);
  if (previousOfficialSnapshot) {
    return roundOutlookMetric(previousOfficialSnapshot.totalPoints);
  }

  return input.fallbackCurrentPoints > 0 ? roundOutlookMetric(input.fallbackCurrentPoints) : 0;
}

function parseProjectionCheckpoint(rawCheckpointId: string): ParsedProjectionCheckpoint {
  const trimmedCheckpointId = rawCheckpointId.trim();
  if (!trimmedCheckpointId || trimmedCheckpointId === "group:pre") {
    return {
      checkpointId: trimmedCheckpointId || "group:pre",
      triggerType: "initial",
      triggerMatchId: null
    };
  }

  if (trimmedCheckpointId.startsWith("group:")) {
    const suffix = trimmedCheckpointId.slice("group:".length);
    if (suffix.endsWith(":pre")) {
      const matchId = suffix.slice(0, -4).trim() || null;
      return {
        checkpointId: trimmedCheckpointId,
        triggerType: "initial",
        triggerMatchId: matchId
      };
    }

    return {
      checkpointId: trimmedCheckpointId,
      triggerType: "match_final",
      triggerMatchId: suffix.trim() || null
    };
  }

  return {
    checkpointId: trimmedCheckpointId,
    triggerType: "result_update",
    triggerMatchId: null
  };
}

export function resolveProjectionEventLabel(input: {
  checkpoint: { triggerType: ProjectionCheckpointTriggerType; triggerMatchId: string | null };
  checkpointMatch?: ProjectionCheckpointMatch | null;
  createdAt: string;
  language?: string | null;
}): ProjectionCheckpointDisplayLabel {
  const timestamp = formatProjectionTimestamp(input.createdAt, input.language);

  if (input.checkpoint.triggerType === "initial") {
    return {
      triggerLabel: "Start",
      compactLabel: "Start",
      detailTimestampLabel: timestamp
    };
  }

  if (input.checkpointMatch) {
    const fullHome = input.checkpointMatch.homeTeamName || input.checkpointMatch.homeTeamShortName || "Home";
    const fullAway = input.checkpointMatch.awayTeamName || input.checkpointMatch.awayTeamShortName || "Away";
    const shortHome = (input.checkpointMatch.homeTeamShortName || fullHome).toUpperCase();
    const shortAway = (input.checkpointMatch.awayTeamShortName || fullAway).toUpperCase();

    return {
      triggerLabel: `After ${fullHome} vs ${fullAway}`,
      compactLabel: `${shortHome}-${shortAway}`,
      detailTimestampLabel: timestamp
    };
  }

  if (input.checkpoint.triggerMatchId) {
    const matchOrdinal = parseMatchOrdinal(input.checkpoint.triggerMatchId);
    if (matchOrdinal !== null) {
      return {
        triggerLabel: `After Group Match ${matchOrdinal}`,
        compactLabel: `Match ${matchOrdinal}`,
        detailTimestampLabel: timestamp
      };
    }
  }

  return {
    triggerLabel: "Result update",
    compactLabel: "Update",
    detailTimestampLabel: timestamp
  };
}

function parseMatchOrdinal(matchId: string) {
  const match = matchId.match(/(\d+)\s*$/);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function resolveQualifiedThirdPlaceTeamIds(
  currentStandings: ProjectedOutlookCurrentStandings | null | undefined,
  snapshot: LightSeedBuilderSnapshot | null | undefined
) {
  if (!currentStandings?.byGroup.size || !snapshot?.groupRankings.length) {
    return null;
  }

  const thirdPlaceQualifierCount = snapshot.thirdPlaceRankings.length;
  if (thirdPlaceQualifierCount <= 0) {
    return new Set<string>();
  }

  const standingsForSeeding = new Map(
    Array.from(currentStandings.byGroup.entries()).map(([groupName, rows]) => [
      groupName,
      rows.map((row) => ({
        teamId: row.teamId,
        teamName: row.teamName ?? row.teamCode ?? row.teamId.toUpperCase(),
        teamCode: row.teamCode ?? row.teamShortName ?? row.teamId.toUpperCase(),
        flagEmoji: row.flagEmoji ?? null,
        played: row.played,
        wins: row.wins ?? 0,
        draws: row.draws ?? 0,
        losses: row.losses ?? 0,
        goalsAgainst: row.goalsAgainst ?? Math.max(0, row.goalsFor - row.goalDifference),
        groupName: row.groupName ?? groupName,
        finish: (Math.min(Math.max(row.rank, 1), 3) as 1 | 2 | 3),
        points: row.points,
        goalDifference: row.goalDifference,
        goalsFor: row.goalsFor,
        rank: row.rank
      }))
    ])
  );

  const qualified = buildQualifiedTeamSeeds(standingsForSeeding, thirdPlaceQualifierCount);
  return new Set(qualified.rankedThirdPlaceTeams.map((seed) => seed.teamId));
}

function scoreFinalizedGroupCeiling(input: {
  groupName: string;
  predictedTeamIds: string[];
  selectedThirdPlaceQualifierTeamIds: Set<string>;
  groupRows: ProjectedOutlookStandingRow[];
  allGroupsFinal: boolean;
  resolvedQualifiedThirdPlaceTeamIds: Set<string> | null;
}) {
  const actualRankedTeamIds = input.groupRows
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((row) => row.teamId)
    .slice(0, 4);
  const actualThirdTeamId = actualRankedTeamIds[2] ?? null;
  const actualThirdPlaceQualified =
    actualThirdTeamId && input.allGroupsFinal && input.resolvedQualifiedThirdPlaceTeamIds
      ? input.resolvedQualifiedThirdPlaceTeamIds.has(actualThirdTeamId)
      : null;
  const predictedThirdTeamId = input.predictedTeamIds[2] ?? null;
  const predictedThirdPlaceQualified =
    predictedThirdTeamId && input.selectedThirdPlaceQualifierTeamIds.has(predictedThirdTeamId) ? true : null;

  const score = scoreGroupPhaseGroupPrediction({
    actual: {
      groupName: input.groupName,
      rankedTeamIds: actualRankedTeamIds,
      thirdPlaceQualified: actualThirdPlaceQualified
    },
    predictedRankedTeamIds: input.predictedTeamIds,
    predictedThirdPlaceQualified
  });

  const unresolvedThirdPlaceQualificationPoint =
    actualThirdPlaceQualified === null && predictedThirdPlaceQualified !== null ? 1 : 0;
  const currentCeilingPoints = score.totalPoints + unresolvedThirdPlaceQualificationPoint;

  return {
    lockedPoints: score.totalPoints,
    currentCeilingPoints,
    lostPoints: Math.max(0, GROUP_PHASE_GROUP_MAX_POINTS - currentCeilingPoints)
  };
}

function resolveExposureStatusForFinalizedGroup(input: {
  teamExposure: PlayerPickTeamExposure;
  teamId: string;
  currentGroupRows: ProjectedOutlookStandingRow[];
  selectedThirdPlaceQualifierTeamIds: Set<string>;
  actualQualifiedThirdPlaceTeamIds: Set<string> | null;
}): PickExposureStatus {
  const actualRank = input.currentGroupRows.find((row) => row.teamId === input.teamId)?.rank ?? null;
  if (input.teamExposure.predictedGroupRank === 1 || input.teamExposure.predictedGroupRank === 2) {
    if (actualRank === 1 || actualRank === 2) {
      return "locked";
    }
    if (actualRank !== null) {
      return "lost";
    }
    return "live_later";
  }

  if (input.actualQualifiedThirdPlaceTeamIds === null) {
    return input.selectedThirdPlaceQualifierTeamIds.has(input.teamId) ? "live_later" : actualRank === 3 ? "locked" : "lost";
  }

  if (input.actualQualifiedThirdPlaceTeamIds.has(input.teamId)) {
    return "locked";
  }

  return input.selectedThirdPlaceQualifierTeamIds.has(input.teamId) ? "lost" : "locked";
}

function toExposureChip(
  exposure: PlayerPickTeamExposure,
  status: PickExposureStatus = "live_later"
): PickExposureViewModel {
  return {
    teamId: exposure.teamId,
    label: buildPredictedTeamLabel(exposure),
    compactLabel: exposure.teamShortName,
    groupId: exposure.groupName,
    route: exposure.predictedGroupRank === 3 ? "third_place" : "top_two",
    points: roundOutlookMetric(exposure.pointsAtStakeUpperBound),
    status
  };
}

function buildPredictedTeamLabel(exposure: PlayerPickTeamExposure) {
  if (exposure.predictedGroupRank === 1) {
    return `${exposure.teamShortName} to win ${exposure.groupName}`;
  }
  if (exposure.predictedGroupRank === 2) {
    return `${exposure.teamShortName} top 2`;
  }
  if (exposure.predictedGroupRank === 3 && exposure.predictedThirdPlaceRank) {
    return `${exposure.teamShortName} to qualify as 3rd`;
  }
  if (exposure.predictedGroupRank === 3) {
    return `${exposure.teamShortName} 3rd place`;
  }
  return `${exposure.teamShortName} in ${exposure.groupName}`;
}

function buildStakePickSummary(input: {
  groupName: string;
  directlyAffectedTeams: PlayerPickTeamExposure[];
  groupExposure: PlayerPickGroupExposure | null;
}) {
  if (input.directlyAffectedTeams.length === 1) {
    return `You picked ${buildPredictedTeamLabel(input.directlyAffectedTeams[0]!)}.`;
  }

  if (input.directlyAffectedTeams.length === 2) {
    return `You picked ${input.directlyAffectedTeams.map((team) => team.teamShortName).join(" and ")} to stay alive here.`;
  }

  if (input.groupExposure?.predictedAdvancingTeamIds.length) {
    return `This match affects your ${input.groupName} qualifiers.`;
  }

  return `This match affects your ${input.groupName} picks.`;
}

function buildStakeScenarioText(input: {
  match: ProjectedOutlookMatchSummary;
  directlyAffectedTeams: PlayerPickTeamExposure[];
  groupName: string;
  currentStandings: ProjectedOutlookCurrentStandings | null;
}) {
  if (input.directlyAffectedTeams.length === 1) {
    const team = input.directlyAffectedTeams[0]!;
    const opponentShortName =
      input.match.homeTeamId === team.teamId ? input.match.awayTeamShortName : input.match.homeTeamShortName;
    const currentRank = team.currentRank;
    if (team.predictedGroupRank === 3 && team.predictedThirdPlaceRank) {
      return {
        helpsLabel: `${team.teamShortName} result keeps the third-place route alive`,
        hurtsLabel: `${opponentShortName} swing can push ${team.teamShortName} out`
      };
    }

    return {
      helpsLabel:
        typeof currentRank === "number" && currentRank <= 2
          ? `${team.teamShortName} hold position`
          : `${team.teamShortName} move toward the top 2`,
      hurtsLabel: `${team.teamShortName} drop points against ${opponentShortName}`
    };
  }

  if (input.directlyAffectedTeams.length === 2) {
    return {
      helpsLabel: "A stable result keeps both of your picks in the mix",
      hurtsLabel: "A big swing can push one of your picks below the line"
    };
  }

  const standingsRows = input.currentStandings?.byGroup.get(input.groupName) ?? [];
  const leaderShortNames = standingsRows
    .slice(0, 2)
    .map((row) =>
      row.teamId === input.match.homeTeamId
        ? input.match.homeTeamShortName
        : row.teamId === input.match.awayTeamId
          ? input.match.awayTeamShortName
          : row.teamId.toUpperCase()
    )
    .filter(Boolean);

  return {
    helpsLabel: leaderShortNames.length > 0 ? `${leaderShortNames.join(" + ")} keep the table steady` : "A steady result protects your group picks",
    hurtsLabel: "A table shake-up can move your projected qualifiers"
  };
}

function formatKickoffLabel(value: string | null | undefined, language?: string | null) {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return `${formatLocaleDate(date, language, { month: "numeric", day: "numeric" })} · ${formatLocaleTime(date, language, {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function resolveMaxPossiblePoints(input: {
  explicitMax: number | null;
  totalPossiblePoints: number | null;
  lockedPoints: number | null;
}) {
  if (typeof input.explicitMax === "number") {
    return roundOutlookMetric(input.explicitMax);
  }

  if (typeof input.totalPossiblePoints === "number" && typeof input.lockedPoints === "number") {
    return roundOutlookMetric(Math.max(input.lockedPoints, input.totalPossiblePoints));
  }

  return null;
}

function getPointsAtStakeForPredictedRank(input: {
  predictedGroupRank: number;
  selectedAsThirdPlaceQualifier: boolean;
  scoringRules: ProjectedOutlookScoringRules;
}) {
  const { scoringRules } = input;
  switch (input.predictedGroupRank) {
    case 1:
      return scoringRules.winnerPoints + scoringRules.topTwoAnyOrderBonus + scoringRules.completeLadderBonus;
    case 2:
      return scoringRules.runnerUpPoints + scoringRules.topTwoAnyOrderBonus + scoringRules.completeLadderBonus;
    case 3:
      return (
        scoringRules.thirdPlacePoints +
        scoringRules.completeLadderBonus +
        (input.selectedAsThirdPlaceQualifier ? scoringRules.thirdPlaceQualificationPoints : 0)
      );
    default:
      return scoringRules.completeLadderBonus;
  }
}

function GROUP_POINTS_MAX(scoringRules: ProjectedOutlookScoringRules) {
  void scoringRules;
  return GROUP_PHASE_GROUP_MAX_POINTS;
}

function formatProjectionTimestamp(value: string, language?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${formatLocaleDate(date, language, { month: "numeric", day: "numeric" })}, ${formatLocaleTime(date, language, {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function roundOutlookMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function formatLocaleDate(date: Date, language: string | null | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(language || "en", {
    timeZone: "UTC",
    ...options
  }).format(date);
}

function formatLocaleTime(date: Date, language: string | null | undefined, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(language || "en", {
    timeZone: "UTC",
    ...options
  }).format(date);
}
