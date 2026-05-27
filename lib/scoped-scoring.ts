import { normalizeKnockoutStage } from "@/lib/match-stage";
import {
  buildProjectedGroupStandings,
  buildQualifiedTeamSeeds,
  getRequiredThirdPlaceQualifierCount,
  type GroupStageMatchForSeeding,
  type KnockoutPlaceholderMatch
} from "@/lib/knockout-seeding";
import { isMissingAnyRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { calculateCanonicalLeaderboardScores, sumScoreRowsByUser } from "@/lib/canonical-scoring";
import { recomputeGroupPhaseLadderScores } from "@/lib/group-phase-ladder-recompute";
import { normalizeGroupKey } from "@/lib/group-standings";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGroupStageMode, type GroupStageMode } from "@/lib/group-stage-modes";
import type { MatchStatus, Team } from "@/lib/types";

export type ScoringScope = "standard" | "group_custom";
export type ManagedGroupRulesetStatus = "draft" | "active" | "locked" | "superseded" | "archived";
export type ManagedGroupRulesetPresetKey =
  | "classic"
  | "high_volatility"
  | "finals_jackpot"
  | "side_picks_heavy"
  | "executive_challenge";

export const GROUP_RULESET_BONUS_LIMITS = {
  earlyGroupStageCompletionBonus: 10,
  knockoutCompletionBonus: 10,
  finalMatchupBonus: 15,
  exactFinalScoreBonus: 25,
  sidePickBonusCap: 25
} as const;

export type ManagedGroupRulesetInput = {
  status?: ManagedGroupRulesetStatus | null;
  groupStageMode?: GroupStageMode | null;
  groupStagePredictionDepth?: "simple_results" | "full_match_scores" | null;
  fullMatchScoringVariant?: "classic" | "goal_difference_bonus" | null;
  groupBonusMode?: "classic" | "early_bird" | "high_stakes" | "all_in" | null;
  groupStagePicksDueAt?: string | null;
  knockoutPicksDueAt?: string | null;
  scoringSettingsLockedAt?: string | null;
  earlyGroupStageCompletionBonus?: number | null;
  knockoutCompletionBonus?: number | null;
  finalMatchupBonus?: number | null;
  exactFinalScoreBonus?: number | null;
  sidePickPackageKey?: string | null;
};

export type ManagedGroupRulesetPreset = {
  key: ManagedGroupRulesetPresetKey;
  label: string;
  description: string;
  ruleset: Required<ManagedGroupRulesetInput>;
};

const GROUP_RULESET_STATUS_PRIORITY: ManagedGroupRulesetStatus[] = [
  "active",
  "locked",
  "draft",
  "superseded",
  "archived"
];

export const MANAGED_GROUP_RULESET_PRESETS: ManagedGroupRulesetPreset[] = [
  {
    key: "classic",
    label: "Classic",
    description: "No custom bonuses. Standard scoring only inside the group.",
    ruleset: {
      status: "active",
      groupStageMode: "full_scores",
      groupStagePredictionDepth: "full_match_scores",
      fullMatchScoringVariant: "classic",
      groupBonusMode: "classic",
      groupStagePicksDueAt: null,
      knockoutPicksDueAt: null,
      scoringSettingsLockedAt: null,
      earlyGroupStageCompletionBonus: 0,
      knockoutCompletionBonus: 0,
      finalMatchupBonus: 0,
      exactFinalScoreBonus: 0,
      sidePickPackageKey: null
    }
  },
  {
    key: "high_volatility",
    label: "High Volatility",
    description: "Adds small completion bonuses and a bigger late-round swing.",
    ruleset: {
      status: "active",
      groupStageMode: "full_scores",
      groupStagePredictionDepth: "full_match_scores",
      fullMatchScoringVariant: "classic",
      groupBonusMode: "high_stakes",
      groupStagePicksDueAt: null,
      knockoutPicksDueAt: null,
      scoringSettingsLockedAt: null,
      earlyGroupStageCompletionBonus: 10,
      knockoutCompletionBonus: 5,
      finalMatchupBonus: 12,
      exactFinalScoreBonus: 10,
      sidePickPackageKey: null
    }
  },
  {
    key: "finals_jackpot",
    label: "Finals Jackpot",
    description: "Keeps the group calm early and makes the final matter most.",
    ruleset: {
      status: "active",
      groupStageMode: "full_scores",
      groupStagePredictionDepth: "full_match_scores",
      fullMatchScoringVariant: "classic",
      groupBonusMode: "all_in",
      groupStagePicksDueAt: null,
      knockoutPicksDueAt: null,
      scoringSettingsLockedAt: null,
      earlyGroupStageCompletionBonus: 0,
      knockoutCompletionBonus: 0,
      finalMatchupBonus: 15,
      exactFinalScoreBonus: 25,
      sidePickPackageKey: null
    }
  },
  {
    key: "side_picks_heavy",
    label: "Side Picks Heavy",
    description: "Leaves match bonuses light and leans on this group's local side picks.",
    ruleset: {
      status: "active",
      groupStageMode: "full_scores",
      groupStagePredictionDepth: "full_match_scores",
      fullMatchScoringVariant: "classic",
      groupBonusMode: "classic",
      groupStagePicksDueAt: null,
      knockoutPicksDueAt: null,
      scoringSettingsLockedAt: null,
      earlyGroupStageCompletionBonus: 0,
      knockoutCompletionBonus: 0,
      finalMatchupBonus: 5,
      exactFinalScoreBonus: 5,
      sidePickPackageKey: "group-local-underdogs"
    }
  },
  {
    key: "executive_challenge",
    label: "Executive Challenge",
    description: "Balanced group-local bonuses with a sharper finals reward.",
    ruleset: {
      status: "active",
      groupStageMode: "full_scores",
      groupStagePredictionDepth: "full_match_scores",
      fullMatchScoringVariant: "classic",
      groupBonusMode: "all_in",
      groupStagePicksDueAt: null,
      knockoutPicksDueAt: null,
      scoringSettingsLockedAt: null,
      earlyGroupStageCompletionBonus: 8,
      knockoutCompletionBonus: 5,
      finalMatchupBonus: 10,
      exactFinalScoreBonus: 20,
      sidePickPackageKey: "group-local-underdogs"
    }
  }
];

export type ManagedGroupRulesetSummary = {
  id: string;
  groupId: string;
  version: number;
  status: ManagedGroupRulesetStatus;
  groupStageMode: GroupStageMode;
  groupStagePredictionDepth: "simple_results" | "full_match_scores";
  fullMatchScoringVariant: "classic" | "goal_difference_bonus" | null;
  groupBonusMode: "classic" | "early_bird" | "high_stakes" | "all_in";
  groupStagePicksDueAt: string | null;
  knockoutPicksDueAt: string | null;
  scoringSettingsLockedAt: string | null;
  presetKey: ManagedGroupRulesetPresetKey | null;
  earlyGroupStageCompletionBonus: number;
  knockoutCompletionBonus: number;
  finalMatchupBonus: number;
  exactFinalScoreBonus: number;
  sidePickPackageId: string | null;
  sidePickPackageName: string | null;
  sidePickPackageScope: ScoringScope | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SidePickPackageOption = {
  id: string;
  key: string;
  name: string;
  description: string;
  scoringScope: ScoringScope;
  definitionCount: number;
};

type GroupRulesetRow = {
  id: string;
  group_id: string;
  version: number;
  status: ManagedGroupRulesetStatus;
  group_stage_mode?: string | null;
  group_stage_prediction_depth?: string | null;
  full_match_scoring_variant?: string | null;
  group_bonus_mode?: string | null;
  group_stage_picks_due_at?: string | null;
  knockout_picks_due_at?: string | null;
  scoring_settings_locked_at?: string | null;
  early_group_stage_completion_bonus: number;
  knockout_completion_bonus: number;
  final_matchup_bonus: number;
  exact_final_score_bonus: number;
  side_pick_package_id?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
  side_pick_package?:
    | {
        id: string;
        key?: string;
        name: string;
        scoring_scope: ScoringScope;
      }
    | Array<{
        id: string;
        key?: string;
        name: string;
        scoring_scope: ScoringScope;
      }>
    | null;
};

type SidePickPackageRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  scoring_scope: ScoringScope;
  active: boolean;
};

type SidePickDefinitionRow = {
  id: string;
  package_id: string;
};

type GroupMemberRow = {
  group_id: string;
  user_id: string;
};

type MatchRow = {
  id: string;
  stage: string;
  group_name?: string | null;
  kickoff_time: string;
  status: string;
  home_source?: string | null;
  away_source?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  short_name: string;
  group_name: string;
  fifa_rank?: number | null;
  flag_emoji?: string | null;
};

type UserGroupSeedRankingScoreRow = {
  user_id: string;
  group_name: string;
  rank_position: number;
  team_id: string;
};

type UserBestThirdRankingScoreRow = {
  user_id: string;
  team_id: string;
  rank_position: number;
};

type BracketPredictionRow = {
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
  updated_at?: string | null;
};

type UserGroupSeedRankingRow = {
  user_id: string;
  group_name: string;
  rank_position: number;
  updated_at?: string | null;
};

type UserBestThirdRankingRow = {
  user_id: string;
  team_id: string;
  rank_position: number;
  updated_at?: string | null;
};

type GroupBonusScoreInsert = {
  group_id: string;
  user_id: string;
  ruleset_id: string;
  bonus_type: "early_group_stage_completion" | "knockout_completion" | "final_matchup" | "exact_final_score";
  scoring_scope: "group_custom";
  points: number;
  metadata: Record<string, unknown>;
};

type ScoreAccumulator = Map<string, Map<string, number>>;

export function normalizeManagedGroupRulesetStatus(value?: string | null): ManagedGroupRulesetStatus {
  if (!value) {
    return "active";
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return GROUP_RULESET_STATUS_PRIORITY.find((status) => status === normalized) ?? "active";
}

export function resolveManagedGroupRulesetPreset(
  key: ManagedGroupRulesetPresetKey | null | undefined
): ManagedGroupRulesetPreset {
  return (
    MANAGED_GROUP_RULESET_PRESETS.find((preset) => preset.key === key) ??
    MANAGED_GROUP_RULESET_PRESETS[0]
  );
}

export function deriveManagedGroupRulesetPresetKey(
  input: Pick<
    ManagedGroupRulesetInput,
    | "earlyGroupStageCompletionBonus"
    | "knockoutCompletionBonus"
    | "finalMatchupBonus"
    | "exactFinalScoreBonus"
    | "sidePickPackageKey"
  >
): ManagedGroupRulesetPresetKey | null {
  const normalizedInput = validateManagedGroupRulesetInput(input);

  const matchedPreset = MANAGED_GROUP_RULESET_PRESETS.find((preset) => {
    const ruleset = validateManagedGroupRulesetInput(preset.ruleset);
    return (
      ruleset.earlyGroupStageCompletionBonus === normalizedInput.earlyGroupStageCompletionBonus &&
      ruleset.knockoutCompletionBonus === normalizedInput.knockoutCompletionBonus &&
      ruleset.finalMatchupBonus === normalizedInput.finalMatchupBonus &&
      ruleset.exactFinalScoreBonus === normalizedInput.exactFinalScoreBonus &&
      (ruleset.sidePickPackageKey ?? null) === (normalizedInput.sidePickPackageKey ?? null)
    );
  });

  return matchedPreset?.key ?? null;
}

export function validateManagedGroupRulesetInput(input: ManagedGroupRulesetInput) {
  return {
    status: normalizeManagedGroupRulesetStatus(input.status),
    groupStageMode: normalizeGroupStageMode(input.groupStageMode),
    earlyGroupStageCompletionBonus: normalizeBonusValue(
      input.earlyGroupStageCompletionBonus,
      GROUP_RULESET_BONUS_LIMITS.earlyGroupStageCompletionBonus
    ),
    knockoutCompletionBonus: normalizeBonusValue(
      input.knockoutCompletionBonus,
      GROUP_RULESET_BONUS_LIMITS.knockoutCompletionBonus
    ),
    finalMatchupBonus: normalizeBonusValue(
      input.finalMatchupBonus,
      GROUP_RULESET_BONUS_LIMITS.finalMatchupBonus
    ),
    exactFinalScoreBonus: normalizeBonusValue(
      input.exactFinalScoreBonus,
      GROUP_RULESET_BONUS_LIMITS.exactFinalScoreBonus
    ),
    sidePickPackageKey: input.sidePickPackageKey?.trim() || null
  };
}

export function summarizeManagedGroupRuleset(
  ruleset: Pick<
    ManagedGroupRulesetSummary,
    | "status"
    | "groupStagePredictionDepth"
    | "fullMatchScoringVariant"
    | "groupBonusMode"
    | "earlyGroupStageCompletionBonus"
    | "knockoutCompletionBonus"
    | "finalMatchupBonus"
    | "exactFinalScoreBonus"
    | "sidePickPackageName"
  >
) {
  const activeItems = [
    ruleset.fullMatchScoringVariant === "goal_difference_bonus" ? "Goal Difference Bonus" : "Classic score grading",
    ruleset.groupBonusMode
      ? `Bonus mode: ${ruleset.groupBonusMode.replace(/_/g, " ")}`
      : null,
    ruleset.earlyGroupStageCompletionBonus > 0
      ? `Early completion +${ruleset.earlyGroupStageCompletionBonus}`
      : null,
    ruleset.knockoutCompletionBonus > 0
      ? `Knockout completion +${ruleset.knockoutCompletionBonus}`
      : null,
    ruleset.finalMatchupBonus > 0 ? `Final matchup +${ruleset.finalMatchupBonus}` : null,
    ruleset.exactFinalScoreBonus > 0 ? `Exact final score +${ruleset.exactFinalScoreBonus}` : null,
    ruleset.sidePickPackageName ? `Side picks: ${ruleset.sidePickPackageName}` : null
  ].filter((item): item is string => Boolean(item));

  return {
    statusLabel: ruleset.status.replace(/_/g, " "),
    summary: activeItems.length > 0 ? activeItems.join(" · ") : "Classic ruleset with no custom bonuses enabled."
  };
}

export async function fetchActiveGroupRulesets(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds: string[]
): Promise<Map<string, ManagedGroupRulesetSummary>> {
  const uniqueGroupIds = Array.from(new Set(groupIds)).filter(Boolean);
  if (uniqueGroupIds.length === 0) {
    return new Map();
  }

  const { data, error } = await adminSupabase
    .from("group_rulesets")
    .select(
      "id,group_id,version,status,group_stage_mode,group_stage_prediction_depth,full_match_scoring_variant,group_bonus_mode,group_stage_picks_due_at,knockout_picks_due_at,scoring_settings_locked_at,early_group_stage_completion_bonus,knockout_completion_bonus,final_matchup_bonus,exact_final_score_bonus,side_pick_package_id,created_by_user_id,created_at,updated_at,side_pick_package:side_pick_packages(id,key,name,scoring_scope)"
    )
    .in("group_id", uniqueGroupIds)
    .in("status", ["active", "locked", "draft"])
    .order("version", { ascending: false });

  if (error) {
    if (isMissingAnyRelationError(error.message, ["group_rulesets", "side_pick_packages"])) {
      warnOptionalFeatureOnce(
        "group-rulesets-missing",
        "Group ruleset tables are not available yet. Falling back to standard-only scoring.",
        error.message
      );
      return new Map();
    }

    throw new Error(error.message);
  }

  const summaries = (((data ?? []) as GroupRulesetRow[]).map((row) => {
      const sidePickPackage = Array.isArray(row.side_pick_package) ? (row.side_pick_package[0] ?? null) : row.side_pick_package;

      return {
        id: row.id,
        groupId: row.group_id,
        version: row.version,
        status: row.status,
        presetKey: deriveManagedGroupRulesetPresetKey({
          earlyGroupStageCompletionBonus: row.early_group_stage_completion_bonus ?? 0,
          knockoutCompletionBonus: row.knockout_completion_bonus ?? 0,
          finalMatchupBonus: row.final_matchup_bonus ?? 0,
          exactFinalScoreBonus: row.exact_final_score_bonus ?? 0,
          sidePickPackageKey: sidePickPackage?.key ?? null
        }),
        groupStageMode: normalizeGroupStageMode(row.group_stage_mode),
        groupStagePredictionDepth: normalizeGroupStagePredictionDepth(row.group_stage_prediction_depth),
        fullMatchScoringVariant: normalizeFullMatchScoringVariant(row.full_match_scoring_variant),
        groupBonusMode: normalizeGroupBonusMode(row.group_bonus_mode),
        groupStagePicksDueAt: row.group_stage_picks_due_at ?? null,
        knockoutPicksDueAt: row.knockout_picks_due_at ?? null,
        scoringSettingsLockedAt: row.scoring_settings_locked_at ?? null,
        earlyGroupStageCompletionBonus: row.early_group_stage_completion_bonus ?? 0,
        knockoutCompletionBonus: row.knockout_completion_bonus ?? 0,
        finalMatchupBonus: row.final_matchup_bonus ?? 0,
        exactFinalScoreBonus: row.exact_final_score_bonus ?? 0,
        sidePickPackageId: row.side_pick_package_id ?? null,
        sidePickPackageName: sidePickPackage?.name ?? null,
        sidePickPackageScope: sidePickPackage?.scoring_scope ?? null,
        createdByUserId: row.created_by_user_id ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } satisfies ManagedGroupRulesetSummary;
    })) ?? [];

  const selectedRulesets = new Map<string, ManagedGroupRulesetSummary>();
  for (const ruleset of summaries) {
    const current = selectedRulesets.get(ruleset.groupId);
    if (!current) {
      selectedRulesets.set(ruleset.groupId, ruleset);
      continue;
    }

    const nextPriority = GROUP_RULESET_STATUS_PRIORITY.indexOf(ruleset.status);
    const currentPriority = GROUP_RULESET_STATUS_PRIORITY.indexOf(current.status);
    if (nextPriority < currentPriority || (nextPriority === currentPriority && ruleset.version > current.version)) {
      selectedRulesets.set(ruleset.groupId, ruleset);
    }
  }

  return selectedRulesets;
}

export function normalizeGroupStagePredictionDepth(value?: string | null): "simple_results" | "full_match_scores" {
  return value === "simple_results" ? "simple_results" : "full_match_scores";
}

export function normalizeFullMatchScoringVariant(value?: string | null): "classic" | "goal_difference_bonus" | null {
  if (value === "goal_difference_bonus") {
    return "goal_difference_bonus";
  }

  return value === "classic" ? "classic" : null;
}

export function normalizeGroupBonusMode(value?: string | null): "classic" | "early_bird" | "high_stakes" | "all_in" {
  switch (value) {
    case "early_bird":
    case "high_stakes":
    case "all_in":
      return value;
    default:
      return "classic";
  }
}

export async function fetchSidePickPackageOptions(
  adminSupabase: ReturnType<typeof createAdminClient>,
  scope?: ScoringScope
): Promise<SidePickPackageOption[]> {
  let packagesQuery = adminSupabase
    .from("side_pick_packages")
    .select("id,key,name,description,scoring_scope,active")
    .eq("active", true)
    .order("name", { ascending: true });

  if (scope) {
    packagesQuery = packagesQuery.eq("scoring_scope", scope);
  }

  const [{ data: packages, error: packagesError }, { data: definitions, error: definitionsError }] = await Promise.all([
    packagesQuery,
    adminSupabase.from("side_pick_definitions").select("id,package_id").eq("active", true)
  ]);

  if (packagesError || definitionsError) {
    const message = packagesError?.message ?? definitionsError?.message ?? "Could not load side-pick packages.";
    if (isMissingAnyRelationError(message, ["side_pick_packages", "side_pick_definitions"])) {
      warnOptionalFeatureOnce(
        "side-pick-packages-missing",
        "Side-pick package tables are not available yet. Package selection will stay hidden.",
        message
      );
      return [];
    }

    throw new Error(message);
  }

  const countsByPackage = new Map<string, number>();
  for (const row of ((definitions ?? []) as SidePickDefinitionRow[])) {
    countsByPackage.set(row.package_id, (countsByPackage.get(row.package_id) ?? 0) + 1);
  }

  return (((packages ?? []) as SidePickPackageRow[]).map((pkg) => ({
    id: pkg.id,
    key: pkg.key,
    name: pkg.name,
    description: pkg.description,
    scoringScope: pkg.scoring_scope,
    definitionCount: countsByPackage.get(pkg.id) ?? 0
  })));
}

export async function fetchStandardSidePickTotalsByUser(
  adminSupabase: ReturnType<typeof createAdminClient>
): Promise<Map<string, number>> {
  const { data, error } = await adminSupabase
    .from("side_pick_scores")
    .select("user_id,points")
    .eq("scoring_scope", "standard");

  if (error) {
    if (isMissingAnyRelationError(error.message, ["side_pick_scores"])) {
      warnOptionalFeatureOnce(
        "side-pick-scores-missing",
        "Side-pick score tables are not available yet. Standard scoring will ignore side picks for now.",
        error.message
      );
      return new Map();
    }

    throw new Error(error.message);
  }

  const totals = new Map<string, number>();
  for (const row of ((data ?? []) as Array<{ user_id: string; points: number | null }>)) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + (row.points ?? 0));
  }

  return totals;
}

export async function fetchGroupCustomScoreTotals(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds: string[]
): Promise<ScoreAccumulator> {
  const uniqueGroupIds = Array.from(new Set(groupIds)).filter(Boolean);
  if (uniqueGroupIds.length === 0) {
    return new Map();
  }

  // Group-local bonuses and group-local side picks never roll into the
  // standard global totals. They are aggregated per group only.
  const [bonusResult, sidePickResult] = await Promise.all([
    adminSupabase
      .from("group_bonus_scores")
      .select("group_id,user_id,points")
      .in("group_id", uniqueGroupIds)
      .eq("scoring_scope", "group_custom"),
    adminSupabase
      .from("side_pick_scores")
      .select("group_id,user_id,points")
      .in("group_id", uniqueGroupIds)
      .eq("scoring_scope", "group_custom")
  ]);

  const message = bonusResult.error?.message ?? sidePickResult.error?.message ?? null;
  if (message) {
    if (isMissingAnyRelationError(message, ["group_bonus_scores", "side_pick_scores"])) {
      warnOptionalFeatureOnce(
        "group-custom-scores-missing",
        "Group-local bonus tables are not available yet. Group leaderboards will stay on standard scoring.",
        message
      );
      return new Map();
    }

    throw new Error(message);
  }

  const totals: ScoreAccumulator = new Map();
  const addRows = (rows: Array<{ group_id: string; user_id: string; points: number | null }>) => {
    for (const row of rows) {
      const groupMap = totals.get(row.group_id) ?? new Map<string, number>();
      groupMap.set(row.user_id, (groupMap.get(row.user_id) ?? 0) + (row.points ?? 0));
      totals.set(row.group_id, groupMap);
    }
  };

  addRows((bonusResult.data ?? []) as Array<{ group_id: string; user_id: string; points: number | null }>);
  addRows((sidePickResult.data ?? []) as Array<{ group_id: string; user_id: string; points: number | null }>);

  return totals;
}

export async function rebuildGroupCustomBonusScores(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds?: string[]
): Promise<void> {
  const rulesets = await fetchActiveGroupRulesetsForRebuild(adminSupabase, groupIds);
  if (rulesets.length === 0) {
    return;
  }

  const scopedGroupIds = rulesets.map((ruleset) => ruleset.group_id);
  const [{ data: memberships, error: membershipsError }, { data: matches, error: matchesError }] = await Promise.all([
    adminSupabase.from("group_members").select("group_id,user_id").in("group_id", scopedGroupIds),
    adminSupabase
      .from("matches")
      .select("id,stage,group_name,kickoff_time,status,home_team_id,away_team_id,home_score,away_score,winner_team_id")
      .order("kickoff_time", { ascending: true })
  ]);

  if (membershipsError || matchesError) {
    throw new Error(membershipsError?.message ?? matchesError?.message ?? "Could not rebuild group bonus scores.");
  }

  const memberRows = (memberships ?? []) as GroupMemberRow[];
  const matchRows = (matches ?? []) as MatchRow[];
  const userIds = Array.from(new Set(memberRows.map((row) => row.user_id)));

  const [
    { data: bracketPredictions, error: bracketPredictionsError },
    { data: seedRankings, error: seedRankingsError },
    { data: bestThirdRankings, error: bestThirdRankingsError }
  ] = await Promise.all([
      adminSupabase
        .from("bracket_predictions")
        .select("user_id,match_id,predicted_winner_team_id,predicted_home_score,predicted_away_score,updated_at")
        .in("user_id", userIds),
      adminSupabase
        .from("user_group_seed_rankings")
        .select("user_id,group_name,rank_position,updated_at")
        .in("user_id", userIds),
      adminSupabase
        .from("user_best_third_rankings")
        .select("user_id,team_id,rank_position,updated_at")
        .in("user_id", userIds)
    ]);

  if (bracketPredictionsError || seedRankingsError || bestThirdRankingsError) {
    throw new Error(
      bracketPredictionsError?.message ??
        seedRankingsError?.message ??
        bestThirdRankingsError?.message ??
        "Could not load predictions for group bonus scoring."
    );
  }

  await adminSupabase.from("group_bonus_scores").delete().in("group_id", scopedGroupIds);

  const inserts = buildGroupBonusScoreRows({
    rulesets,
    memberships: memberRows,
    matches: matchRows,
    bracketPredictions: (bracketPredictions ?? []) as BracketPredictionRow[],
    groupSeedRankings: (seedRankings ?? []) as UserGroupSeedRankingRow[],
    bestThirdRankings: (bestThirdRankings ?? []) as UserBestThirdRankingRow[]
  });

  if (inserts.length === 0) {
    return;
  }

  const { error: insertError } = await adminSupabase.from("group_bonus_scores").insert(inserts);
  if (insertError) {
    throw new Error(insertError.message);
  }
}

export async function rebuildScopedLeaderboardState(
  adminSupabase: ReturnType<typeof createAdminClient>,
  options?: {
    triggeringMatchId?: string;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const triggeringMatchId = options?.triggeringMatchId?.trim() || null;

  try {
    await rebuildGroupCustomBonusScores(adminSupabase);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not rebuild group-local bonus scores."
    };
  }

  const [
    { data: bracketPoints, error: bracketPointsError },
    { data: users, error: usersError },
    standardSidePickTotals
  ] = await Promise.all([
    adminSupabase.from("bracket_scores").select("user_id,points"),
    adminSupabase.from("users").select("id"),
    fetchStandardSidePickTotalsByUser(adminSupabase)
  ]);

  if (bracketPointsError) {
    return { ok: false, message: bracketPointsError.message };
  }
  if (usersError) {
    return { ok: false, message: usersError.message };
  }

  const userIds = ((users ?? []) as Array<{ id: string }>).map((user) => user.id);
  let groupPhaseScores: Map<string, number>;
  try {
    groupPhaseScores = await fetchCanonicalGroupPhaseScoreTotals(adminSupabase, userIds);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not rebuild canonical Group Phase ladder scores."
    };
  }

  const knockoutScores = sumScoreRowsByUser((bracketPoints ?? []) as Array<{ user_id: string; points: number | null }>);
  // Canonical standard totals intentionally use the visible Group Phase
  // ladder source, not legacy per-match `predictions.points_awarded` rows.
  const canonicalEntries = calculateCanonicalLeaderboardScores({
    users: userIds,
    groupPhaseScores,
    knockoutScores,
    standardSidePickScores: standardSidePickTotals
  });
  const totalsByUser = new Map(canonicalEntries.map((entry) => [entry.user_id, entry.total_points] as const));

  const rankedEntries = canonicalEntries.map((entry) => ({
    user_id: entry.user_id,
    total_points: entry.total_points,
    rank: entry.rank,
    updated_at: new Date().toISOString()
  }));

  if (rankedEntries.length > 0) {
    const { error: leaderboardError } = await adminSupabase
      .from("leaderboard_entries")
      .upsert(rankedEntries, { onConflict: "user_id" });

    if (leaderboardError) {
      return { ok: false, message: leaderboardError.message };
    }

    if (triggeringMatchId) {
      const { error: snapshotDeleteError } = await adminSupabase
        .from("leaderboard_snapshots")
        .delete()
        .eq("scope_type", "global")
        .eq("match_id", triggeringMatchId)
        .is("group_id", null);

      if (snapshotDeleteError) {
        return { ok: false, message: snapshotDeleteError.message };
      }

      // Standard scoring is the only source for global standings and
      // average group comparison. Group-local custom points never land here.
      const { error: snapshotError } = await adminSupabase.from("leaderboard_snapshots").insert(
        rankedEntries.map((entry) => ({
          scope_type: "global",
          group_id: null,
          match_id: triggeringMatchId,
          user_id: entry.user_id,
          rank: entry.rank,
          total_points: entry.total_points
        }))
      );

      if (snapshotError) {
        return { ok: false, message: snapshotError.message };
      }

      const { data: groupMembers, error: groupMembersError } = await adminSupabase
        .from("group_members")
        .select("group_id,user_id");

      if (groupMembersError) {
        return { ok: false, message: groupMembersError.message };
      }

      const membersByGroupId = new Map<string, string[]>();
      for (const membership of (groupMembers as { group_id: string; user_id: string }[] | null) ?? []) {
        const existing = membersByGroupId.get(membership.group_id) ?? [];
        existing.push(membership.user_id);
        membersByGroupId.set(membership.group_id, existing);
      }

      const groupCustomTotals = await fetchGroupCustomScoreTotals(adminSupabase, Array.from(membersByGroupId.keys()));
      const groupSnapshotRows = Array.from(membersByGroupId.entries()).flatMap(([groupId, memberUserIds]) => {
        const customTotalsByUserId = groupCustomTotals.get(groupId) ?? new Map<string, number>();
        const rankedGroupEntries = calculateCanonicalLeaderboardScores({
          users: Array.from(new Set(memberUserIds)),
          groupPhaseScores,
          knockoutScores,
          standardSidePickScores: standardSidePickTotals,
          groupCustomScores: customTotalsByUserId,
          groupId,
          includeGroupCustom: true
        });

        return rankedGroupEntries.map((entry) => ({
          scope_type: "group",
          group_id: groupId,
          match_id: triggeringMatchId,
          user_id: entry.user_id,
          rank: entry.rank,
          total_points: entry.total_points
        }));
      });

      const { error: groupSnapshotDeleteError } = await adminSupabase
        .from("leaderboard_snapshots")
        .delete()
        .eq("scope_type", "group")
        .eq("match_id", triggeringMatchId);

      if (groupSnapshotDeleteError) {
        return { ok: false, message: groupSnapshotDeleteError.message };
      }

      if (groupSnapshotRows.length > 0) {
        const { error: groupSnapshotInsertError } = await adminSupabase
          .from("leaderboard_snapshots")
          .insert(groupSnapshotRows);

        if (groupSnapshotInsertError) {
          return { ok: false, message: groupSnapshotInsertError.message };
        }
      }
    }
  }

  const userTotalUpdates = ((users ?? []) as Array<{ id: string }>).map((user) =>
    adminSupabase.from("users").update({ total_points: totalsByUser.get(user.id) ?? 0 }).eq("id", user.id)
  );

  const userUpdateResults = await Promise.all(userTotalUpdates);
  const failedUserUpdate = userUpdateResults.find((result) => result.error);
  if (failedUserUpdate?.error) {
    return { ok: false, message: failedUserUpdate.error.message };
  }

  return { ok: true };
}

async function fetchCanonicalGroupPhaseScoreTotals(
  adminSupabase: ReturnType<typeof createAdminClient>,
  userIds: string[]
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return new Map<string, number>();
  }

  const [
    { data: matches, error: matchesError },
    { data: teams, error: teamsError },
    { data: groupSeedRankings, error: groupSeedRankingsError },
    { data: bestThirdRankings, error: bestThirdRankingsError }
  ] = await Promise.all([
    adminSupabase
      .from("matches")
      .select(
        "id,stage,group_name,kickoff_time,status,home_source,away_source,home_team_id,away_team_id,home_score,away_score,winner_team_id"
      ),
    adminSupabase.from("teams").select("id,name,short_name,group_name,fifa_rank,flag_emoji"),
    adminSupabase
      .from("user_group_seed_rankings")
      .select("user_id,group_name,rank_position,team_id")
      .in("user_id", uniqueUserIds),
    adminSupabase
      .from("user_best_third_rankings")
      .select("user_id,team_id,rank_position")
      .in("user_id", uniqueUserIds)
  ]);

  const message =
    matchesError?.message ??
    teamsError?.message ??
    groupSeedRankingsError?.message ??
    bestThirdRankingsError?.message ??
    null;
  if (message) {
    throw new Error(message);
  }

  const context = buildActualGroupPhaseContextForScoring({
    matches: (matches ?? []) as MatchRow[],
    teams: (teams ?? []) as TeamRow[]
  });
  const scores = recomputeGroupPhaseLadderScores({
    userIds: uniqueUserIds,
    actualOutcomes: context.actualOutcomes,
    requiredThirdPlaceQualifierCount: context.requiredThirdPlaceQualifierCount,
    groupSeedRankings: ((groupSeedRankings ?? []) as UserGroupSeedRankingScoreRow[]).map((row) => ({
      ...row,
      group_name: normalizeGroupKey(row.group_name) ?? row.group_name
    })),
    thirdPlaceRankings: (bestThirdRankings ?? []) as UserBestThirdRankingScoreRow[],
    isScorable: context.isScorable
  });

  return new Map(Array.from(scores.entries()).map(([userId, score]) => [userId, score.points] as const));
}

function buildActualGroupPhaseContextForScoring(input: {
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
      groupName: match.group_name ?? null,
      status: match.status as MatchStatus,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      homeScore: match.home_score ?? null,
      awayScore: match.away_score ?? null
    }));
  const projectedStandings = buildProjectedGroupStandings(groupMatches, appTeams);
  const standingsRows = new Map(Array.from(projectedStandings.entries()).map(([groupName, standings]) => [groupName, standings.rows]));
  const isScorable =
    projectedStandings.size > 0 &&
    Array.from(projectedStandings.values()).every((standings) => standings.isComplete && standings.isFullyActual);
  const roundOf32Placeholders = input.matches
    .filter((match) => normalizeKnockoutStage(match.stage) === "r32")
    .map((match) => ({
      id: match.id,
      stage: match.stage,
      homeSource: match.home_source ?? null,
      awaySource: match.away_source ?? null,
      homeTeamId: match.home_team_id ?? null,
      awayTeamId: match.away_team_id ?? null,
      status: match.status as MatchStatus
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

async function fetchActiveGroupRulesetsForRebuild(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds?: string[]
) {
  let query = adminSupabase
    .from("group_rulesets")
    .select(
      "id,group_id,version,status,early_group_stage_completion_bonus,knockout_completion_bonus,final_matchup_bonus,exact_final_score_bonus"
      + ",group_stage_picks_due_at,knockout_picks_due_at"
    )
    .eq("status", "active");

  if (groupIds && groupIds.length > 0) {
    query = query.in("group_id", Array.from(new Set(groupIds)));
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingAnyRelationError(error.message, ["group_rulesets"])) {
      warnOptionalFeatureOnce(
        "group-rulesets-rebuild-missing",
        "Group rulesets are not available yet. Skipping group-local bonus recalculation.",
        error.message
      );
      return [];
    }

    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as Array<{
    id: string;
    group_id: string;
    version: number;
    status: ManagedGroupRulesetStatus;
    early_group_stage_completion_bonus: number;
    knockout_completion_bonus: number;
    final_matchup_bonus: number;
    exact_final_score_bonus: number;
    group_stage_picks_due_at?: string | null;
    knockout_picks_due_at?: string | null;
  }>);
}

function buildGroupBonusScoreRows(input: {
  rulesets: Array<{
    id: string;
    group_id: string;
    version: number;
    early_group_stage_completion_bonus: number;
    knockout_completion_bonus: number;
    final_matchup_bonus: number;
    exact_final_score_bonus: number;
    group_stage_picks_due_at?: string | null;
    knockout_picks_due_at?: string | null;
  }>;
  memberships: GroupMemberRow[];
  matches: MatchRow[];
  bracketPredictions: BracketPredictionRow[];
  groupSeedRankings: UserGroupSeedRankingRow[];
  bestThirdRankings: UserBestThirdRankingRow[];
}): GroupBonusScoreInsert[] {
  const membersByGroup = new Map<string, string[]>();
  for (const membership of input.memberships) {
    const list = membersByGroup.get(membership.group_id) ?? [];
    list.push(membership.user_id);
    membersByGroup.set(membership.group_id, list);
  }

  const groupMatches = input.matches.filter((match) => match.stage === "group");
  const earliestGroupKickoff = groupMatches[0]?.kickoff_time ?? null;
  const expectedGroupCount = new Set(
    groupMatches.map((match) => match.group_name?.trim() ?? "").filter((groupName) => groupName.length > 0)
  ).size;
  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(
    input.matches
      .filter((match) => normalizeKnockoutStage(match.stage) === "r32")
      .map((match) => ({
        id: match.id,
        stage: match.stage,
        status: match.status as "scheduled" | "locked" | "live" | "final",
        homeSource: null,
        awaySource: null,
        homeTeamId: match.home_team_id ?? null,
        awayTeamId: match.away_team_id ?? null
      }))
  );

  const knockoutMatches = input.matches.filter((match) => match.stage !== "group");
  const knockoutMatchIds = new Set(knockoutMatches.map((match) => match.id));
  const finalMatch = knockoutMatches.find((match) => normalizeKnockoutStage(match.stage) === "final") ?? null;
  const semifinalMatches = knockoutMatches.filter((match) => normalizeKnockoutStage(match.stage) === "sf");
  const actualFinalistIds = semifinalMatches
    .map((match) => match.winner_team_id ?? null)
    .filter((teamId): teamId is string => Boolean(teamId))
    .sort();

  const bracketPredictionsByUser = new Map<string, BracketPredictionRow[]>();
  for (const prediction of input.bracketPredictions) {
    const list = bracketPredictionsByUser.get(prediction.user_id) ?? [];
    list.push(prediction);
    bracketPredictionsByUser.set(prediction.user_id, list);
  }

  const seedRankingsByUser = new Map<string, UserGroupSeedRankingRow[]>();
  for (const ranking of input.groupSeedRankings) {
    const list = seedRankingsByUser.get(ranking.user_id) ?? [];
    list.push(ranking);
    seedRankingsByUser.set(ranking.user_id, list);
  }

  const bestThirdRankingsByUser = new Map<string, UserBestThirdRankingRow[]>();
  for (const ranking of input.bestThirdRankings) {
    const list = bestThirdRankingsByUser.get(ranking.user_id) ?? [];
    list.push(ranking);
    bestThirdRankingsByUser.set(ranking.user_id, list);
  }

  const inserts: GroupBonusScoreInsert[] = [];
  for (const ruleset of input.rulesets) {
    const memberUserIds = Array.from(new Set(membersByGroup.get(ruleset.group_id) ?? []));
    for (const userId of memberUserIds) {
      const userBracketPredictions = bracketPredictionsByUser.get(userId) ?? [];
      const bracketByMatchId = new Map(userBracketPredictions.map((prediction) => [prediction.match_id, prediction]));
      const userSeedRankings = seedRankingsByUser.get(userId) ?? [];
      const userBestThirdRankings = bestThirdRankingsByUser.get(userId) ?? [];
      const latestSeedBuilderUpdateAt = [
        ...userSeedRankings.map((ranking) => ranking.updated_at ?? null),
        ...userBestThirdRankings.map((ranking) => ranking.updated_at ?? null)
      ]
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
      const hasCompleteSeedBuilder =
        expectedGroupCount > 0 &&
        userSeedRankings.length === expectedGroupCount * 4 &&
        userBestThirdRankings.length >= requiredThirdPlaceQualifierCount;
      const groupStageCompletionCutoff = ruleset.group_stage_picks_due_at ?? earliestGroupKickoff;
      const knockoutCompletionCutoff = ruleset.knockout_picks_due_at ?? null;

      if (
        ruleset.early_group_stage_completion_bonus > 0 &&
        groupStageCompletionCutoff &&
        hasCompleteSeedBuilder &&
        latestSeedBuilderUpdateAt &&
        latestSeedBuilderUpdateAt <= groupStageCompletionCutoff
      ) {
        inserts.push({
          group_id: ruleset.group_id,
          user_id: userId,
          ruleset_id: ruleset.id,
          bonus_type: "early_group_stage_completion",
          scoring_scope: "group_custom",
          points: ruleset.early_group_stage_completion_bonus,
          metadata: { cutoff: groupStageCompletionCutoff }
        });
      }

      if (
        ruleset.knockout_completion_bonus > 0 &&
        knockoutMatchIds.size > 0 &&
        Array.from(knockoutMatchIds).every((matchId) => {
          const prediction = bracketByMatchId.get(matchId);
          if (!prediction?.predicted_winner_team_id) {
            return false;
          }

          if (!knockoutCompletionCutoff || !prediction.updated_at) {
            return Boolean(prediction.predicted_winner_team_id);
          }

          return prediction.updated_at <= knockoutCompletionCutoff;
        })
      ) {
        inserts.push({
          group_id: ruleset.group_id,
          user_id: userId,
          ruleset_id: ruleset.id,
          bonus_type: "knockout_completion",
          scoring_scope: "group_custom",
          points: ruleset.knockout_completion_bonus,
          metadata: { knockoutMatchCount: knockoutMatchIds.size }
        });
      }

      if (
        ruleset.final_matchup_bonus > 0 &&
        actualFinalistIds.length === 2
      ) {
        const predictedFinalistIds = semifinalMatches
          .map((match) => bracketByMatchId.get(match.id)?.predicted_winner_team_id ?? null)
          .filter((teamId): teamId is string => Boolean(teamId))
          .sort();

        if (
          predictedFinalistIds.length === actualFinalistIds.length &&
          predictedFinalistIds.every((teamId, index) => teamId === actualFinalistIds[index])
        ) {
          inserts.push({
            group_id: ruleset.group_id,
            user_id: userId,
            ruleset_id: ruleset.id,
            bonus_type: "final_matchup",
            scoring_scope: "group_custom",
            points: ruleset.final_matchup_bonus,
            metadata: { finalists: actualFinalistIds }
          });
        }
      }

      const finalPrediction = finalMatch ? bracketByMatchId.get(finalMatch.id) ?? null : null;
      const predictedFinalistIdsForExactScore = semifinalMatches
        .map((match) => bracketByMatchId.get(match.id)?.predicted_winner_team_id ?? null)
        .filter((teamId): teamId is string => Boolean(teamId))
        .sort();

      if (
        ruleset.exact_final_score_bonus > 0 &&
        finalMatch &&
        finalMatch.status === "final" &&
        finalMatch.home_score !== null &&
        finalMatch.home_score !== undefined &&
        finalMatch.away_score !== null &&
        finalMatch.away_score !== undefined &&
        predictedFinalistIdsForExactScore.length === actualFinalistIds.length &&
        predictedFinalistIdsForExactScore.every((teamId, index) => teamId === actualFinalistIds[index]) &&
        finalPrediction?.predicted_home_score === finalMatch.home_score &&
        finalPrediction?.predicted_away_score === finalMatch.away_score
      ) {
        inserts.push({
          group_id: ruleset.group_id,
          user_id: userId,
          ruleset_id: ruleset.id,
          bonus_type: "exact_final_score",
          scoring_scope: "group_custom",
          points: ruleset.exact_final_score_bonus,
          metadata: {
            matchId: finalMatch.id,
            homeScore: finalMatch.home_score,
            awayScore: finalMatch.away_score
          }
        });
      }
    }
  }

  return inserts;
}

function normalizeBonusValue(value: number | null | undefined, max: number) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(max, Math.floor(value)));
}
