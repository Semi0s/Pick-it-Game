import { normalizeKnockoutStage } from "@/lib/match-stage";
import { isMissingAnyRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { createAdminClient } from "@/lib/supabase/admin";

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
  kickoff_time: string;
  status: string;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
};

type PredictionRow = {
  user_id: string;
  match_id: string;
  updated_at?: string | null;
};

type BracketPredictionRow = {
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
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
    | "earlyGroupStageCompletionBonus"
    | "knockoutCompletionBonus"
    | "finalMatchupBonus"
    | "exactFinalScoreBonus"
    | "sidePickPackageName"
  >
) {
  const activeItems = [
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
      "id,group_id,version,status,early_group_stage_completion_bonus,knockout_completion_bonus,final_matchup_bonus,exact_final_score_bonus,side_pick_package_id,created_by_user_id,created_at,updated_at,side_pick_package:side_pick_packages(id,key,name,scoring_scope)"
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
      .select("id,stage,kickoff_time,status,home_team_id,away_team_id,home_score,away_score,winner_team_id")
      .order("kickoff_time", { ascending: true })
  ]);

  if (membershipsError || matchesError) {
    throw new Error(membershipsError?.message ?? matchesError?.message ?? "Could not rebuild group bonus scores.");
  }

  const memberRows = (memberships ?? []) as GroupMemberRow[];
  const matchRows = (matches ?? []) as MatchRow[];
  const userIds = Array.from(new Set(memberRows.map((row) => row.user_id)));

  const [{ data: predictions, error: predictionsError }, { data: bracketPredictions, error: bracketPredictionsError }] =
    await Promise.all([
      adminSupabase
        .from("predictions")
        .select("user_id,match_id,updated_at")
        .in("user_id", userIds),
      adminSupabase
        .from("bracket_predictions")
        .select("user_id,match_id,predicted_winner_team_id,predicted_home_score,predicted_away_score")
        .in("user_id", userIds)
    ]);

  if (predictionsError || bracketPredictionsError) {
    throw new Error(
      predictionsError?.message ?? bracketPredictionsError?.message ?? "Could not load predictions for group bonus scoring."
    );
  }

  await adminSupabase.from("group_bonus_scores").delete().in("group_id", scopedGroupIds);

  const inserts = buildGroupBonusScoreRows({
    rulesets,
    memberships: memberRows,
    matches: matchRows,
    predictions: (predictions ?? []) as PredictionRow[],
    bracketPredictions: (bracketPredictions ?? []) as BracketPredictionRow[]
  });

  if (inserts.length === 0) {
    return;
  }

  const { error: insertError } = await adminSupabase.from("group_bonus_scores").insert(inserts);
  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function fetchActiveGroupRulesetsForRebuild(
  adminSupabase: ReturnType<typeof createAdminClient>,
  groupIds?: string[]
) {
  let query = adminSupabase
    .from("group_rulesets")
    .select(
      "id,group_id,version,status,early_group_stage_completion_bonus,knockout_completion_bonus,final_matchup_bonus,exact_final_score_bonus"
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

  return ((data ?? []) as Array<{
    id: string;
    group_id: string;
    version: number;
    status: ManagedGroupRulesetStatus;
    early_group_stage_completion_bonus: number;
    knockout_completion_bonus: number;
    final_matchup_bonus: number;
    exact_final_score_bonus: number;
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
  }>;
  memberships: GroupMemberRow[];
  matches: MatchRow[];
  predictions: PredictionRow[];
  bracketPredictions: BracketPredictionRow[];
}): GroupBonusScoreInsert[] {
  const membersByGroup = new Map<string, string[]>();
  for (const membership of input.memberships) {
    const list = membersByGroup.get(membership.group_id) ?? [];
    list.push(membership.user_id);
    membersByGroup.set(membership.group_id, list);
  }

  const groupMatches = input.matches.filter((match) => match.stage === "group");
  const earliestGroupKickoff = groupMatches[0]?.kickoff_time ?? null;
  const groupMatchIds = new Set(groupMatches.map((match) => match.id));

  const knockoutMatches = input.matches.filter((match) => match.stage !== "group");
  const knockoutMatchIds = new Set(knockoutMatches.map((match) => match.id));
  const finalMatch = knockoutMatches.find((match) => normalizeKnockoutStage(match.stage) === "final") ?? null;
  const semifinalMatches = knockoutMatches.filter((match) => normalizeKnockoutStage(match.stage) === "sf");
  const actualFinalistIds = semifinalMatches
    .map((match) => match.winner_team_id ?? null)
    .filter((teamId): teamId is string => Boolean(teamId))
    .sort();

  const predictionsByUser = new Map<string, PredictionRow[]>();
  for (const prediction of input.predictions) {
    const list = predictionsByUser.get(prediction.user_id) ?? [];
    list.push(prediction);
    predictionsByUser.set(prediction.user_id, list);
  }

  const bracketPredictionsByUser = new Map<string, BracketPredictionRow[]>();
  for (const prediction of input.bracketPredictions) {
    const list = bracketPredictionsByUser.get(prediction.user_id) ?? [];
    list.push(prediction);
    bracketPredictionsByUser.set(prediction.user_id, list);
  }

  const inserts: GroupBonusScoreInsert[] = [];
  for (const ruleset of input.rulesets) {
    const memberUserIds = Array.from(new Set(membersByGroup.get(ruleset.group_id) ?? []));
    for (const userId of memberUserIds) {
      const userPredictions = predictionsByUser.get(userId) ?? [];
      const userGroupPredictions = userPredictions.filter((prediction) => groupMatchIds.has(prediction.match_id));
      const userBracketPredictions = bracketPredictionsByUser.get(userId) ?? [];
      const bracketByMatchId = new Map(userBracketPredictions.map((prediction) => [prediction.match_id, prediction]));

      if (
        ruleset.early_group_stage_completion_bonus > 0 &&
        earliestGroupKickoff &&
        userGroupPredictions.length === groupMatchIds.size &&
        userGroupPredictions.every((prediction) => prediction.updated_at && prediction.updated_at <= earliestGroupKickoff)
      ) {
        inserts.push({
          group_id: ruleset.group_id,
          user_id: userId,
          ruleset_id: ruleset.id,
          bonus_type: "early_group_stage_completion",
          scoring_scope: "group_custom",
          points: ruleset.early_group_stage_completion_bonus,
          metadata: { cutoff: earliestGroupKickoff }
        });
      }

      if (
        ruleset.knockout_completion_bonus > 0 &&
        knockoutMatchIds.size > 0 &&
        Array.from(knockoutMatchIds).every((matchId) => Boolean(bracketByMatchId.get(matchId)?.predicted_winner_team_id))
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
