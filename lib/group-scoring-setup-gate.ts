import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeGroupBonusMode } from "@/lib/scoped-scoring";

type ManagedLegacyGroupRow = {
  id: string;
  name: string;
  status: string;
};

type GroupMemberRoleRow = {
  group_id: string;
};

type GroupRulesetGateRow = {
  id: string;
  group_id: string;
  version: number;
  status: string;
  group_stage_prediction_depth?: string | null;
  full_match_scoring_variant?: string | null;
  group_bonus_mode?: string | null;
  group_stage_picks_due_at?: string | null;
  knockout_picks_due_at?: string | null;
  scoring_settings_locked_at?: string | null;
};

export type LegacyGroupScoringSetupItem = {
  groupId: string;
  groupName: string;
  latestRulesetId: string | null;
  latestVersion: number;
  hasLockedSettings: boolean;
  missingFields: string[];
};

export async function fetchManagedLegacyScoringGroups(userId: string): Promise<LegacyGroupScoringSetupItem[]> {
  const adminSupabase = createAdminClient();
  const [{ data: ownedGroups, error: ownedGroupsError }, { data: managerMemberships, error: managerMembershipsError }] =
    await Promise.all([
      adminSupabase.from("groups").select("id,name,status").eq("owner_user_id", userId).eq("status", "active"),
      adminSupabase.from("group_members").select("group_id").eq("user_id", userId).eq("role", "manager")
    ]);

  if (ownedGroupsError) {
    throw new Error(ownedGroupsError.message);
  }

  if (managerMembershipsError) {
    throw new Error(managerMembershipsError.message);
  }

  const manageableGroupIds = Array.from(
    new Set([
      ...(((ownedGroups ?? []) as ManagedLegacyGroupRow[]).map((group) => group.id)),
      ...(((managerMemberships ?? []) as GroupMemberRoleRow[]).map((membership) => membership.group_id))
    ])
  );

  if (manageableGroupIds.length === 0) {
    return [];
  }

  const [groupsResult, rulesetsResult] = await Promise.all([
    adminSupabase.from("groups").select("id,name,status").in("id", manageableGroupIds).eq("status", "active"),
    adminSupabase
      .from("group_rulesets")
      .select(
        "id,group_id,version,status,group_stage_prediction_depth,full_match_scoring_variant,group_bonus_mode,group_stage_picks_due_at,knockout_picks_due_at,scoring_settings_locked_at"
      )
      .in("group_id", manageableGroupIds)
      .in("status", ["active", "locked", "draft"])
      .order("version", { ascending: false })
  ]);

  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  if (rulesetsResult.error) {
    throw new Error(rulesetsResult.error.message);
  }

  const latestRulesetByGroupId = new Map<string, GroupRulesetGateRow>();
  for (const ruleset of (rulesetsResult.data ?? []) as GroupRulesetGateRow[]) {
    if (!latestRulesetByGroupId.has(ruleset.group_id)) {
      latestRulesetByGroupId.set(ruleset.group_id, ruleset);
    }
  }

  return ((groupsResult.data ?? []) as ManagedLegacyGroupRow[])
    .map((group) => {
      const latestRuleset = latestRulesetByGroupId.get(group.id) ?? null;
      const missingFields = getMissingScoringSetupFields(latestRuleset);
      return {
        groupId: group.id,
        groupName: group.name,
        latestRulesetId: latestRuleset?.id ?? null,
        latestVersion: latestRuleset?.version ?? 0,
        hasLockedSettings: Boolean(latestRuleset?.scoring_settings_locked_at),
        missingFields
      } satisfies LegacyGroupScoringSetupItem;
    })
    .filter((group) => group.missingFields.length > 0 || !group.hasLockedSettings);
}

export async function redirectIfLegacyScoringSetupRequired(input: { userId: string; pathname: string; search?: string }) {
  if (input.pathname.startsWith("/groups/scoring-setup")) {
    return;
  }

  const legacyGroups = await fetchManagedLegacyScoringGroups(input.userId);
  if (legacyGroups.length === 0) {
    return;
  }

  const nextPath = `${input.pathname}${input.search ?? ""}`;
  redirect(`/groups/scoring-setup?next=${encodeURIComponent(nextPath)}`);
}

export async function fetchUnconfiguredMemberScoringGroupNotice(userId: string): Promise<string | null> {
  const adminSupabase = createAdminClient();
  const [{ data: memberships, error: membershipsError }, { data: ownedGroups, error: ownedGroupsError }] = await Promise.all([
    adminSupabase.from("group_members").select("group_id,role").eq("user_id", userId),
    adminSupabase.from("groups").select("id").eq("owner_user_id", userId).eq("status", "active")
  ]);

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  if (ownedGroupsError) {
    throw new Error(ownedGroupsError.message);
  }

  const managedGroupIds = new Set<string>([
    ...(((ownedGroups ?? []) as Array<{ id: string }>).map((group) => group.id)),
    ...(((memberships ?? []) as Array<{ group_id: string; role: string }>).filter((membership) => membership.role === "manager").map((membership) => membership.group_id))
  ]);

  const memberOnlyGroupIds = (((memberships ?? []) as Array<{ group_id: string; role: string }>)
    .filter((membership) => membership.role !== "manager" && !managedGroupIds.has(membership.group_id))
    .map((membership) => membership.group_id));

  if (memberOnlyGroupIds.length === 0) {
    return null;
  }

  const legacyGroups = await fetchLegacyGroupsByIds(memberOnlyGroupIds);
  return legacyGroups.length > 0
    ? "This group’s scoring settings are waiting for the Manager to finalize."
    : null;
}

async function fetchLegacyGroupsByIds(groupIds: string[]) {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("group_rulesets")
    .select(
      "id,group_id,version,status,group_stage_prediction_depth,full_match_scoring_variant,group_bonus_mode,group_stage_picks_due_at,knockout_picks_due_at,scoring_settings_locked_at"
    )
    .in("group_id", groupIds)
    .in("status", ["active", "locked", "draft"])
    .order("version", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const latestByGroupId = new Map<string, GroupRulesetGateRow>();
  for (const ruleset of (data ?? []) as GroupRulesetGateRow[]) {
    if (!latestByGroupId.has(ruleset.group_id)) {
      latestByGroupId.set(ruleset.group_id, ruleset);
    }
  }

  return groupIds.filter((groupId) => {
    const latestRuleset = latestByGroupId.get(groupId) ?? null;
    const missingFields = getMissingScoringSetupFields(latestRuleset);
    return missingFields.length > 0 || !latestRuleset?.scoring_settings_locked_at;
  });
}

function getMissingScoringSetupFields(ruleset: GroupRulesetGateRow | null) {
  if (!ruleset) {
    return [
      "group_bonus_mode",
      "group_stage_picks_due_at",
      "knockout_picks_due_at",
      "scoring_settings_locked_at"
    ];
  }

  const missingFields: string[] = [];
  const groupBonusMode = normalizeGroupBonusMode(ruleset.group_bonus_mode);

  if (!ruleset.group_bonus_mode || !groupBonusMode) {
    missingFields.push("group_bonus_mode");
  }

  if (!ruleset.group_stage_picks_due_at) {
    missingFields.push("group_stage_picks_due_at");
  }

  if (!ruleset.knockout_picks_due_at) {
    missingFields.push("knockout_picks_due_at");
  }

  if (!ruleset.scoring_settings_locked_at) {
    missingFields.push("scoring_settings_locked_at");
  }

  return missingFields;
}
