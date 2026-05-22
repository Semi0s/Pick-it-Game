import "server-only";

import { getKnockoutMatchMaxPoints } from "@/lib/bracket-scoring";
import {
  computeGlobalChallengeScore,
  computeGroupStrategyComponent,
  computeKnockoutGlobalComponent,
  createEmptyQualifierStatus,
  normalizeGroupStrategyAdjustments,
  type GlobalChallengeScoreBreakdown
} from "@/lib/global-challenge";
import { buildProjectedGroupStandings, buildQualifiedTeamSeeds, getRequiredThirdPlaceQualifierCount } from "@/lib/knockout-seeding";
import { GROUP_PHASE_START_AT, KNOCKOUT_PHASE_START_AT } from "@/lib/play-mode";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { TournamentEntrySettings } from "@/lib/tournament-entry";
import { getGroupMatches, teams as demoTeams } from "@/lib/mock-data.ts";
import type { Match, Team } from "@/lib/types";

type UserSettingsStrategyRow = {
  user_id: string;
  tournament_entry_state?: string | null;
  group_strategy_adjustments?: unknown;
  group_strategy_heart_pick_team_id?: string | null;
};

type MatchRow = {
  id: string;
  stage: string;
  group_name?: string | null;
  status: "scheduled" | "locked" | "live" | "final";
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_source?: string | null;
  away_source?: string | null;
  kickoff_time?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  group_name: string;
  fifa_rank: number;
  flag_emoji: string;
};

type BracketScoreRow = {
  user_id: string;
  points?: number | null;
};

export type GlobalChallengeUserSummary = GlobalChallengeScoreBreakdown & {
  userId: string;
  tournamentEntryState: TournamentEntrySettings["tournamentEntryState"];
  prompt: string | null;
  groupPhaseStartAt: string;
  knockoutPhaseStartAt: string;
};

export async function fetchGlobalChallengeSummaryForUser(userId: string): Promise<GlobalChallengeUserSummary> {
  const summaries = await fetchGlobalChallengeSummaries([userId]);
  return summaries.get(userId) ?? buildEmptyUserSummary(userId, null);
}

export async function fetchGlobalChallengeSummaries(userIds: string[]): Promise<Map<string, GlobalChallengeUserSummary>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, GlobalChallengeUserSummary>();

  if (uniqueUserIds.length === 0) {
    return result;
  }

  if (!hasSupabaseConfig()) {
    for (const userId of uniqueUserIds) {
      result.set(userId, buildEmptyUserSummary(userId, null));
    }
    return result;
  }

  const adminSupabase = createAdminClient();
  const [teams, matches, strategyRows, bracketScoreRows] = await Promise.all([
    fetchTeams(adminSupabase),
    fetchMatches(adminSupabase),
    fetchStrategyRows(adminSupabase, uniqueUserIds),
    fetchBracketScoreRows(adminSupabase, uniqueUserIds)
  ]);

  const qualifierStatus = computeActualQualifierStatus(matches, teams);
  const knockoutRawMaxPoints = matches
    .filter((match) => match.stage !== "group")
    .reduce((sum, match) => sum + getKnockoutMatchMaxPoints(match.stage as Match["stage"]), 0);
  const bracketPointsByUserId = new Map<string, number>();
  for (const row of bracketScoreRows) {
    bracketPointsByUserId.set(row.user_id, (bracketPointsByUserId.get(row.user_id) ?? 0) + Math.max(0, row.points ?? 0));
  }

  const strategyByUserId = new Map(strategyRows.map((row) => [row.user_id, row]));
  for (const userId of uniqueUserIds) {
    const strategyRow = strategyByUserId.get(userId) ?? null;
    const groupStrategy = computeGroupStrategyComponent({
      adjustments: normalizeGroupStrategyAdjustments(strategyRow?.group_strategy_adjustments),
      heartPickTeamId: strategyRow?.group_strategy_heart_pick_team_id ?? null,
      qualifierStatus,
      tournamentEntryState: normalizeTournamentEntryState(strategyRow?.tournament_entry_state)
    });
    const knockout = computeKnockoutGlobalComponent(bracketPointsByUserId.get(userId) ?? 0, knockoutRawMaxPoints);
    const combined = computeGlobalChallengeScore({
      groupStrategy,
      knockout
    });
    result.set(userId, {
      ...combined,
      userId,
      tournamentEntryState: normalizeTournamentEntryState(strategyRow?.tournament_entry_state),
      prompt: resolveGlobalChallengePrompt({
        hasActiveGroupStrategy:
          normalizeTournamentEntryState(strategyRow?.tournament_entry_state) === "active" ||
          normalizeTournamentEntryState(strategyRow?.tournament_entry_state) === "locked",
        qualifierStatusFinal: qualifierStatus.allGroupsFinal
      }),
      groupPhaseStartAt: GROUP_PHASE_START_AT,
      knockoutPhaseStartAt: KNOCKOUT_PHASE_START_AT
    });
  }

  return result;
}

function buildEmptyUserSummary(
  userId: string,
  tournamentEntryState: TournamentEntrySettings["tournamentEntryState"]
): GlobalChallengeUserSummary {
  return {
    ...computeGlobalChallengeScore({
      groupStrategy: computeGroupStrategyComponent({
        adjustments: {},
        heartPickTeamId: null,
        qualifierStatus: createEmptyQualifierStatus(),
        tournamentEntryState
      }),
      knockout: computeKnockoutGlobalComponent(0, 0)
    }),
    userId,
    tournamentEntryState,
    prompt: resolveGlobalChallengePrompt({
      hasActiveGroupStrategy: false,
      qualifierStatusFinal: false
    }),
    groupPhaseStartAt: GROUP_PHASE_START_AT,
    knockoutPhaseStartAt: KNOCKOUT_PHASE_START_AT
  };
}

function resolveGlobalChallengePrompt(params: {
  hasActiveGroupStrategy: boolean;
  qualifierStatusFinal: boolean;
}) {
  const now = Date.now();
  if (!params.hasActiveGroupStrategy && now < new Date(GROUP_PHASE_START_AT).getTime()) {
    return "Build your Group Strategy before kickoff to compete on the Global Leaderboard.";
  }

  if (!params.hasActiveGroupStrategy && now >= new Date(GROUP_PHASE_START_AT).getTime()) {
    return "Tournament strategy entries are locked. You can still make knockout picks when the bracket opens.";
  }

  if (params.hasActiveGroupStrategy && !params.qualifierStatusFinal) {
    return "Group Strategy is submitted. Knockout Picks open once the bracket is set.";
  }

  return null;
}

function normalizeTournamentEntryState(value?: string | null): TournamentEntrySettings["tournamentEntryState"] {
  return value === "draft" || value === "active" || value === "locked" || value === "inactive" || value === "archived"
    ? value
    : null;
}

async function fetchTeams(adminSupabase: ReturnType<typeof createAdminClient>): Promise<Team[]> {
  const { data, error } = await adminSupabase
    .from("teams")
    .select("id,name,short_name,group_name,fifa_rank,flag_emoji")
    .order("group_name", { ascending: true })
    .order("fifa_rank", { ascending: true });

  if (error) {
    return demoTeams;
  }

  return (((data as TeamRow[] | null) ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    fifaRank: team.fifa_rank,
    flagEmoji: team.flag_emoji
  }))) || demoTeams;
}

async function fetchMatches(adminSupabase: ReturnType<typeof createAdminClient>): Promise<MatchRow[]> {
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,group_name,status,home_team_id,away_team_id,home_score,away_score,home_source,away_source,kickoff_time")
    .order("kickoff_time", { ascending: true });

  if (error) {
    return getGroupMatches().map((match) => ({
      id: match.id,
      stage: match.stage,
      group_name: match.groupName,
      status: match.status,
      home_team_id: match.homeTeamId,
      away_team_id: match.awayTeamId,
      home_score: match.homeScore,
      away_score: match.awayScore,
      kickoff_time: match.kickoffTime
    }));
  }

  return (data as MatchRow[] | null) ?? [];
}

async function fetchStrategyRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<UserSettingsStrategyRow[]> {
  const { data, error } = await adminSupabase
    .from("user_settings")
    .select("user_id,tournament_entry_state,group_strategy_adjustments,group_strategy_heart_pick_team_id")
    .in("user_id", userIds);

  if (error && !isMissingGlobalChallengeSchemaError(error.message)) {
    throw new Error(error.message);
  }

  return (data as UserSettingsStrategyRow[] | null) ?? [];
}

async function fetchBracketScoreRows(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<BracketScoreRow[]> {
  const { data, error } = await adminSupabase
    .from("bracket_scores")
    .select("user_id,points")
    .in("user_id", userIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data as BracketScoreRow[] | null) ?? [];
}

function computeActualQualifierStatus(matches: MatchRow[], teams: Team[]) {
  const groupMatches = matches.filter((match) => match.stage === "group");
  if (groupMatches.length === 0 || teams.length === 0) {
    return createEmptyQualifierStatus();
  }

  const allGroupsFinal = groupMatches.every((match) => match.status === "final");
  if (!allGroupsFinal) {
    return {
      qualifiedTeamIds: new Set<string>(),
      allGroupsFinal: false
    };
  }

  const standings = buildProjectedGroupStandings(
    groupMatches.map((match) => ({
      id: match.id,
      stage: match.stage,
      groupName: match.group_name ?? null,
      status: match.status,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null
    })),
    teams
  );
  const standingsRows = new Map(Array.from(standings.entries()).map(([group, value]) => [group, value.rows]));
  const requiredThirdPlaceCount = getRequiredThirdPlaceQualifierCount(
    matches
      .filter((match) => match.stage === "r32" || match.stage === "round_of_32")
      .map((match) => ({
        id: match.id,
        stage: match.stage,
        homeSource: match.home_source ?? null,
        awaySource: match.away_source ?? null,
        homeTeamId: match.home_team_id ?? null,
        awayTeamId: match.away_team_id ?? null,
        status: match.status
      }))
  );
  const { automaticQualifiers, rankedThirdPlaceTeams } = buildQualifiedTeamSeeds(standingsRows, requiredThirdPlaceCount || 8);
  const qualifiedTeamIds = new Set<string>([
    ...Array.from(automaticQualifiers.values()).map((seed) => seed.teamId),
    ...rankedThirdPlaceTeams.map((seed) => seed.teamId)
  ]);

  return {
    qualifiedTeamIds,
    allGroupsFinal: true
  };
}

function isMissingGlobalChallengeSchemaError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("column \"group_strategy_adjustments\" does not exist") ||
    normalized.includes("column \"group_strategy_heart_pick_team_id\" does not exist") ||
    (normalized.includes("user_settings") && normalized.includes("schema cache"))
  );
}
