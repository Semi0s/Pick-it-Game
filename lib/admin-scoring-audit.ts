import { scoreBracketPrediction } from "@/lib/bracket-scoring";
import {
  calculateCanonicalLeaderboardScores,
  sumScoreRowsByUser
} from "@/lib/canonical-scoring";
import { recomputeGroupPhaseLadderScores } from "@/lib/group-phase-ladder-recompute";
import { scoreGroupStagePrediction } from "@/lib/group-scoring";
import { normalizeGroupKey } from "@/lib/group-standings";
import {
  buildProjectedGroupStandings,
  buildQualifiedTeamSeeds,
  getRequiredThirdPlaceQualifierCount,
  type GroupStageMatchForSeeding,
  type KnockoutPlaceholderMatch
} from "@/lib/knockout-seeding";
import { normalizeKnockoutStage } from "@/lib/match-stage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MatchStage, MatchStatus, Team } from "@/lib/types";

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type MatchRow = {
  id: string;
  stage: MatchStage;
  group_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_source: string | null;
  away_source: string | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
};

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id: string | null;
  predicted_is_draw: boolean;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  points_awarded: number | null;
};

type PredictionScoreRow = {
  prediction_id: string;
  match_id: string;
  user_id: string;
  points: number | null;
  outcome_points: number | null;
  exact_score_points: number | null;
  goal_difference_points: number | null;
};

type BracketPredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id: string | null;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
};

type BracketScoreRow = {
  user_id: string;
  match_id: string;
  points: number | null;
  round_points: number | null;
  champion_points: number | null;
  is_correct: boolean | null;
};

type UserTotalRow = {
  id: string;
  total_points: number | null;
};

type LeaderboardEntryRow = {
  user_id: string;
  total_points: number | null;
  rank: number | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  group_name: string;
  fifa_rank: number | null;
  flag_emoji: string | null;
};

type GroupSeedRankingRow = {
  user_id: string;
  group_name: string;
  rank_position: number;
  team_id: string;
};

type ThirdPlaceRankingRow = {
  user_id: string;
  team_id: string;
  rank_position: number;
};

type SidePickScoreRow = {
  group_id: string | null;
  user_id: string;
  scoring_scope: "standard" | "group_custom" | string;
  points: number | null;
};

type GroupMemberRow = {
  group_id: string;
  user_id: string;
};

type AuditQueryClient = {
  from: (tableName: string) => {
    select: (columns: string) => {
      range: (
        from: number,
        to: number
      ) => Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export type AdminScoringAuditMismatch = {
  kind: string;
  id: string;
  userId?: string;
  matchId?: string;
  expected: number | string | boolean | null;
  actual: number | string | boolean | null;
};

export type AdminScoringAuditCheck = {
  key: string;
  label: string;
  count: number;
  tone: "ok" | "warning" | "danger";
  description: string;
};

export type AdminScoringAuditReport = {
  generatedAt: string;
  counts: {
    usersChecked: number;
    groupsChecked: number;
    matchesChecked: number;
    groupPredictionsChecked: number;
    knockoutPredictionsChecked: number;
    mismatches: number;
    duplicateGroupPredictions: number;
    duplicateKnockoutPredictions: number;
    missingMatches: number;
    staleKnockoutScoreRows: number;
    orphanScoreRows: number;
    nonKnockoutScoreRows: number;
    canonicalTotalMismatches: number;
  };
  checks: AdminScoringAuditCheck[];
  warnings: string[];
  mismatches: AdminScoringAuditMismatch[];
  terminalOnlyInterventions: string[];
};

export async function runReadOnlyAdminScoringAudit(
  adminSupabase: AdminSupabaseClient
): Promise<AdminScoringAuditReport> {
  const auditQueryClient = adminSupabase as unknown as AuditQueryClient;
  const report: AdminScoringAuditReport = {
    generatedAt: new Date().toISOString(),
    counts: {
      usersChecked: 0,
      groupsChecked: 0,
      matchesChecked: 0,
      groupPredictionsChecked: 0,
      knockoutPredictionsChecked: 0,
      mismatches: 0,
      duplicateGroupPredictions: 0,
      duplicateKnockoutPredictions: 0,
      missingMatches: 0,
      staleKnockoutScoreRows: 0,
      orphanScoreRows: 0,
      nonKnockoutScoreRows: 0,
      canonicalTotalMismatches: 0
    },
    checks: [],
    warnings: [],
    mismatches: [],
    terminalOnlyInterventions: [
      "Full scoring-audit --apply repair remains terminal-only until scripts/scoring-audit.ts is fully extracted into a shared repair library.",
      "Destructive stale-row deletion remains terminal-only or behind existing explicit reset tools."
    ]
  };

  const [
    matches,
    teams,
    predictions,
    predictionScores,
    bracketPredictions,
    bracketScores,
    users,
    leaderboardEntries,
    groupSeedRankings,
    thirdPlaceRankings,
    sidePickScores,
    groupMembers
  ] = await Promise.all([
    fetchAll<MatchRow>(
      auditQueryClient,
      "matches",
      "id,stage,group_name,home_team_id,away_team_id,home_source,away_source,status,home_score,away_score,winner_team_id"
    ),
    fetchAll<TeamRow>(auditQueryClient, "teams", "id,name,short_name,group_name,fifa_rank,flag_emoji"),
    fetchAll<PredictionRow>(
      auditQueryClient,
      "predictions",
      "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded"
    ),
    fetchAll<PredictionScoreRow>(
      auditQueryClient,
      "prediction_scores",
      "prediction_id,match_id,user_id,points,outcome_points,exact_score_points,goal_difference_points"
    ),
    fetchAll<BracketPredictionRow>(
      auditQueryClient,
      "bracket_predictions",
      "id,user_id,match_id,predicted_winner_team_id,predicted_home_score,predicted_away_score"
    ),
    fetchAll<BracketScoreRow>(
      auditQueryClient,
      "bracket_scores",
      "user_id,match_id,points,round_points,champion_points,is_correct"
    ),
    fetchAll<UserTotalRow>(auditQueryClient, "users", "id,total_points"),
    fetchAll<LeaderboardEntryRow>(auditQueryClient, "leaderboard_entries", "user_id,total_points,rank"),
    fetchAll<GroupSeedRankingRow>(auditQueryClient, "user_group_seed_rankings", "user_id,group_name,rank_position,team_id"),
    fetchAll<ThirdPlaceRankingRow>(auditQueryClient, "user_best_third_rankings", "user_id,team_id,rank_position"),
    fetchAll<SidePickScoreRow>(auditQueryClient, "side_pick_scores", "group_id,user_id,scoring_scope,points"),
    fetchAll<GroupMemberRow>(auditQueryClient, "group_members", "group_id,user_id")
  ]);

  report.counts.usersChecked = users.length;
  report.counts.groupsChecked = new Set(groupMembers.map((row) => row.group_id)).size;
  report.counts.matchesChecked = matches.length;
  report.counts.groupPredictionsChecked = predictions.length;
  report.counts.knockoutPredictionsChecked = bracketPredictions.length;
  report.counts.duplicateGroupPredictions = countDuplicateKeys(predictions, (row) => `${row.user_id}:${row.match_id}`);
  report.counts.duplicateKnockoutPredictions = countDuplicateKeys(
    bracketPredictions,
    (row) => `${row.user_id}:${row.match_id}`
  );

  const matchesById = new Map(matches.map((match) => [match.id, match] as const));
  const predictionScoresByKey = new Map(
    predictionScores.map((score) => [`${score.prediction_id}:${score.match_id}`, score] as const)
  );
  const bracketScoresByKey = new Map(
    bracketScores.map((score) => [`${score.user_id}:${score.match_id}`, score] as const)
  );
  const recomputedKnockoutScoresByUser = new Map<string, number>();
  const expectedBracketScoreKeys = new Set<string>();

  for (const prediction of predictions) {
    const match = matchesById.get(prediction.match_id);
    if (!match) {
      report.counts.missingMatches += 1;
      report.warnings.push(`Prediction ${prediction.id} references missing match ${prediction.match_id}.`);
      continue;
    }

    const expected = scoreGroupStagePrediction(
      {
        predictedWinnerTeamId: prediction.predicted_winner_team_id,
        predictedIsDraw: prediction.predicted_is_draw,
        predictedHomeScore: prediction.predicted_home_score,
        predictedAwayScore: prediction.predicted_away_score
      },
      {
        stage: match.stage,
        status: match.status,
        homeTeamId: match.home_team_id,
        awayTeamId: match.away_team_id,
        homeScore: match.home_score,
        awayScore: match.away_score,
        winnerTeamId: match.winner_team_id
      }
    );

    recordMismatch(report, {
      kind: "prediction.points_awarded",
      id: prediction.id,
      userId: prediction.user_id,
      matchId: prediction.match_id,
      expected: expected.points,
      actual: prediction.points_awarded ?? 0
    });

    const scoreRow = predictionScoresByKey.get(`${prediction.id}:${prediction.match_id}`) ?? null;
    if (scoreRow || expected.points > 0) {
      recordMismatch(report, {
        kind: "prediction_scores.points",
        id: prediction.id,
        userId: prediction.user_id,
        matchId: prediction.match_id,
        expected: expected.points,
        actual: scoreRow?.points ?? null
      });
    }
  }

  for (const prediction of bracketPredictions) {
    const match = matchesById.get(prediction.match_id);
    if (!match) {
      report.counts.missingMatches += 1;
      report.warnings.push(`Bracket prediction ${prediction.id} references missing match ${prediction.match_id}.`);
      continue;
    }

    if (!normalizeKnockoutStage(match.stage)) {
      continue;
    }

    expectedBracketScoreKeys.add(`${prediction.user_id}:${prediction.match_id}`);
    const expected = scoreBracketPrediction(
      {
        stage: match.stage,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
        winnerTeamId: match.winner_team_id
      },
      {
        predictedWinnerTeamId: prediction.predicted_winner_team_id,
        predictedHomeScore: prediction.predicted_home_score,
        predictedAwayScore: prediction.predicted_away_score
      }
    );
    recomputedKnockoutScoresByUser.set(
      prediction.user_id,
      (recomputedKnockoutScoresByUser.get(prediction.user_id) ?? 0) + expected.points
    );
    const scoreRow = bracketScoresByKey.get(`${prediction.user_id}:${prediction.match_id}`) ?? null;
    if (scoreRow || expected.points > 0) {
      recordMismatch(report, {
        kind: "bracket_scores.points",
        id: prediction.id,
        userId: prediction.user_id,
        matchId: prediction.match_id,
        expected: expected.points,
        actual: scoreRow?.points ?? null
      });
      recordMismatch(report, {
        kind: "bracket_scores.round_points",
        id: prediction.id,
        userId: prediction.user_id,
        matchId: prediction.match_id,
        expected: expected.roundPoints,
        actual: scoreRow?.round_points ?? null
      });
      recordMismatch(report, {
        kind: "bracket_scores.exact_score_points",
        id: prediction.id,
        userId: prediction.user_id,
        matchId: prediction.match_id,
        expected: expected.exactScorePoints,
        actual: scoreRow?.champion_points ?? null
      });
    }
  }

  for (const scoreRow of bracketScores) {
    const key = `${scoreRow.user_id}:${scoreRow.match_id}`;
    const match = matchesById.get(scoreRow.match_id) ?? null;
    if (!match) {
      report.counts.missingMatches += 1;
      report.counts.staleKnockoutScoreRows += 1;
      recordMismatch(report, {
        kind: "bracket_scores.missing_match",
        id: key,
        userId: scoreRow.user_id,
        matchId: scoreRow.match_id,
        expected: "valid knockout match",
        actual: null
      });
      continue;
    }

    if (!normalizeKnockoutStage(match.stage)) {
      report.counts.nonKnockoutScoreRows += 1;
      report.counts.staleKnockoutScoreRows += 1;
      recordMismatch(report, {
        kind: "bracket_scores.non_knockout_match",
        id: key,
        userId: scoreRow.user_id,
        matchId: scoreRow.match_id,
        expected: "knockout match",
        actual: match.stage
      });
      continue;
    }

    if (!expectedBracketScoreKeys.has(key)) {
      report.counts.orphanScoreRows += 1;
      report.counts.staleKnockoutScoreRows += 1;
      recordMismatch(report, {
        kind: "bracket_scores.orphaned_score",
        id: key,
        userId: scoreRow.user_id,
        matchId: scoreRow.match_id,
        expected: "matching bracket prediction",
        actual: null
      });
    }
  }

  const userIds = users.map((user) => user.id);
  const groupPhaseContext = buildActualGroupPhaseContext({ matches, teams });
  const groupPhaseScores = recomputeGroupPhaseLadderScores({
    userIds,
    actualOutcomes: groupPhaseContext.actualOutcomes,
    requiredThirdPlaceQualifierCount: groupPhaseContext.requiredThirdPlaceQualifierCount,
    groupSeedRankings: groupSeedRankings.map((row) => ({
      ...row,
      group_name: normalizeGroupKey(row.group_name) ?? row.group_name
    })),
    thirdPlaceRankings,
    isScorable: groupPhaseContext.isScorable
  });
  const groupPhaseTotals = new Map(
    Array.from(groupPhaseScores.entries()).map(([userId, summary]) => [userId, summary.points] as const)
  );
  const standardSidePickTotals = sumScoreRowsByUser(
    sidePickScores.filter((row) => row.scoring_scope === "standard")
  );
  const rankedUserTotals = calculateCanonicalLeaderboardScores({
    users: userIds,
    groupPhaseScores: groupPhaseTotals,
    knockoutScores: recomputedKnockoutScoresByUser,
    standardSidePickScores: standardSidePickTotals
  });
  const leaderboardByUserId = new Map(leaderboardEntries.map((entry) => [entry.user_id, entry] as const));
  const usersById = new Map(users.map((user) => [user.id, user] as const));

  for (const rankedUser of rankedUserTotals) {
    const user = usersById.get(rankedUser.user_id) ?? null;
    const leaderboardEntry = leaderboardByUserId.get(rankedUser.user_id) ?? null;
    recordMismatch(report, {
      kind: "users.total_points",
      id: rankedUser.user_id,
      userId: rankedUser.user_id,
      expected: rankedUser.total_points,
      actual: user?.total_points ?? null
    });
    recordMismatch(report, {
      kind: "leaderboard_entries.total_points",
      id: rankedUser.user_id,
      userId: rankedUser.user_id,
      expected: rankedUser.total_points,
      actual: leaderboardEntry?.total_points ?? null
    });
    recordMismatch(report, {
      kind: "leaderboard_entries.rank",
      id: rankedUser.user_id,
      userId: rankedUser.user_id,
      expected: rankedUser.rank,
      actual: leaderboardEntry?.rank ?? null
    });
  }

  report.counts.canonicalTotalMismatches = report.mismatches.filter((mismatch) =>
    mismatch.kind === "users.total_points" ||
    mismatch.kind === "leaderboard_entries.total_points" ||
    mismatch.kind === "leaderboard_entries.rank"
  ).length;
  report.counts.mismatches = report.mismatches.length;
  report.mismatches = report.mismatches.slice(0, 50);

  report.checks = [
    buildAuditCheck({
      key: "duplicates",
      label: "Duplicate predictions",
      count: report.counts.duplicateGroupPredictions + report.counts.duplicateKnockoutPredictions,
      description: "Duplicate group or knockout prediction rows."
    }),
    buildAuditCheck({
      key: "missing_matches",
      label: "Missing match references",
      count: report.counts.missingMatches,
      description: "Predictions or score rows attached to missing matches."
    }),
    buildAuditCheck({
      key: "stale_knockout_scores",
      label: "Stale knockout score rows",
      count: report.counts.staleKnockoutScoreRows,
      description: "Bracket score rows that are orphaned, non-knockout, or attached to missing matches."
    }),
    buildAuditCheck({
      key: "canonical_totals",
      label: "Cached total mismatches",
      count: report.counts.canonicalTotalMismatches,
      description: "users.total_points or leaderboard_entries differ from canonical recomputation."
    }),
    buildAuditCheck({
      key: "scoring_mismatches",
      label: "Scoring row mismatches",
      count: report.counts.mismatches,
      description: "Any scoring, cache, rank, or row-level mismatch detected by the read-only audit."
    })
  ];

  if (!groupPhaseContext.isScorable) {
    report.warnings.push("Group Phase ladder scoring is not fully scorable until all group-stage actual outcomes are complete.");
  }

  return report;
}

async function fetchAll<T>(supabase: AuditQueryClient, tableName: string, select: string): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(tableName)
      .select(select)
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }
  }
}

function buildActualGroupPhaseContext(input: {
  matches: MatchRow[];
  teams: TeamRow[];
}) {
  const appTeams: Team[] = input.teams.map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    fifaRank: team.fifa_rank ?? 0,
    flagEmoji: team.flag_emoji ?? ""
  }));
  const groupMatches: GroupStageMatchForSeeding[] = input.matches
    .filter((match) => match.stage === "group")
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      groupName: match.group_name,
      status: match.status,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      homeScore: match.home_score,
      awayScore: match.away_score
    }));
  const projectedStandings = buildProjectedGroupStandings(groupMatches, appTeams);
  const standingsRows = new Map(
    Array.from(projectedStandings.entries()).map(([groupName, standings]) => [groupName, standings.rows] as const)
  );
  const isScorable =
    projectedStandings.size > 0 &&
    Array.from(projectedStandings.values()).every((standings) => standings.isComplete && standings.isFullyActual);
  const roundOf32Placeholders = input.matches
    .filter((match) => match.stage === "r32" || match.stage === "round_of_32")
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      homeSource: match.home_source,
      awaySource: match.away_source,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      status: match.status
    })) satisfies KnockoutPlaceholderMatch[];
  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders) || 8;
  const { rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(standingsRows, requiredThirdPlaceQualifierCount);
  const qualifiedThirdPlaceIds = new Set(rankedThirdPlaceTeams.map((team) => team.teamId));

  return {
    requiredThirdPlaceQualifierCount,
    isScorable,
    actualOutcomes: Array.from(standingsRows.entries())
      .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }))
      .map(([groupName, rows]) => ({
        groupName,
        rankedTeamIds: rows.slice(0, 4).map((row) => row.teamId),
        thirdPlaceQualified: rows[2] ? qualifiedThirdPlaceIds.has(rows[2].teamId) : null
      }))
  };
}

function recordMismatch(report: AdminScoringAuditReport, mismatch: AdminScoringAuditMismatch) {
  if (mismatch.expected === mismatch.actual) {
    return;
  }

  report.mismatches.push(mismatch);
}

function countDuplicateKeys<T>(rows: T[], getKey: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.values()).filter((count) => count > 1).length;
}

function buildAuditCheck(input: {
  key: string;
  label: string;
  count: number;
  description: string;
}): AdminScoringAuditCheck {
  return {
    ...input,
    tone: input.count === 0 ? "ok" : input.count >= 10 ? "danger" : "warning"
  };
}
