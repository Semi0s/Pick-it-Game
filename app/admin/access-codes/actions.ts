"use server";

import { revalidatePath } from "next/cache";
import { normalizeAccessCode } from "@/lib/access-codes";
import { validateAccessCodeAvailability } from "@/lib/access-codes-server";
import { normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";
import {
  normalizeAccessCodeType,
  normalizeSuperLinkGrantTier,
  type AccessCodeType
} from "@/lib/super-link-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { CommercialTier } from "@/lib/tier-access";
import type { UserRole } from "@/lib/types";

export type AdminAccessCode = {
  id: string;
  code: string;
  label: string;
  notes?: string | null;
  active: boolean;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  codeType: AccessCodeType;
  grantsPlanTier: CommercialTier;
  grantsGroupMembership: boolean;
  defaultRole: UserRole;
  defaultLanguage: SupportedLanguage;
  createdAt: string;
  updatedAt: string;
  redemptions: Array<{
    id: string;
    email: string;
    redeemedAt: string;
    userId: string;
    targetGroupId?: string | null;
    grantedPlanTier?: CommercialTier | null;
  }>;
};

export type AccessCodeGroupOption = {
  id: string;
  name: string;
  status: "active" | "archived";
  membershipLimit: number;
  memberCount: number;
};

type SuperAdminResult = { ok: true; userId: string } | { ok: false; message: string };

type AccessCodeActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const ACCESS_CODE_PATTERN = /^[A-Za-z0-9-]{4,24}$/;

export async function fetchAdminAccessCodesAction(): Promise<
  { ok: true; codes: AdminAccessCode[] } | { ok: false; message: string }
> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("access_codes")
    .select(
      "id,code,label,notes,active,max_uses,used_count,expires_at,group_id,code_type,grants_plan_tier,grants_group_membership,default_role,default_language,created_at,updated_at,created_by,group:groups(id,name,status),owner:users!access_codes_created_by_fkey(id,name,email),redemptions:access_code_redemptions(id,email,redeemed_at,user_id,target_group_id,granted_plan_tier)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, message: error.message };
  }

  const codes = ((data ?? []) as Array<{
    id: string;
    code: string;
    label: string;
    notes?: string | null;
    active: boolean;
    max_uses?: number | null;
    used_count: number;
    expires_at?: string | null;
    group_id?: string | null;
    default_role: UserRole;
    default_language: string;
    code_type?: string | null;
    grants_plan_tier?: string | null;
    grants_group_membership?: boolean | null;
    created_at: string;
    updated_at: string;
    created_by?: string | null;
    group?: { id: string; name: string; status: "active" | "archived" } | Array<{ id: string; name: string; status: "active" | "archived" }> | null;
    owner?: { id: string; name: string; email: string } | Array<{ id: string; name: string; email: string }> | null;
    redemptions?: Array<{
      id: string;
      email: string;
      redeemed_at: string;
      user_id: string;
      target_group_id?: string | null;
      granted_plan_tier?: string | null;
    }> | null;
  }>).map((row) => {
    const group = unwrapRelation(row.group);
    const owner = unwrapRelation(row.owner);
    return {
      id: row.id,
      code: row.code,
      label: row.label,
      notes: row.notes ?? null,
      active: row.active,
      maxUses: row.max_uses ?? null,
      usedCount: row.used_count,
      expiresAt: row.expires_at ?? null,
      groupId: row.group_id ?? null,
      groupName: group?.name ?? null,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      codeType: normalizeAccessCodeType(row.code_type),
      grantsPlanTier: normalizeSuperLinkGrantTier(row.grants_plan_tier),
      grantsGroupMembership: row.grants_group_membership !== false,
      defaultRole: row.default_role,
      defaultLanguage: normalizeLanguage(row.default_language),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      redemptions: (row.redemptions ?? []).map((redemption) => ({
        id: redemption.id,
        email: redemption.email,
        redeemedAt: redemption.redeemed_at,
        userId: redemption.user_id,
        targetGroupId: redemption.target_group_id ?? null,
        grantedPlanTier: redemption.granted_plan_tier ? normalizeSuperLinkGrantTier(redemption.granted_plan_tier) : null
      }))
    } satisfies AdminAccessCode;
  });

  return { ok: true, codes };
}

export async function fetchAccessCodeGroupsAction(): Promise<
  { ok: true; groups: AccessCodeGroupOption[] } | { ok: false; message: string }
> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("groups")
    .select("id,name,status,membership_limit,group_members(count)")
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, message: error.message };
  }

  const groups = ((data ?? []) as Array<{
    id: string;
    name: string;
    status: "active" | "archived";
    membership_limit: number;
    group_members?: Array<{ count: number | null }> | { count: number | null } | null;
  }>).map((group) => ({
    id: group.id,
    name: group.name,
    status: group.status,
    membershipLimit: group.membership_limit,
    memberCount: unwrapCount(group.group_members)
  }));

  return { ok: true, groups };
}

export async function createAccessCodeAction(input: {
  code: string;
  label: string;
  notes?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
  groupId?: string | null;
  codeType?: AccessCodeType;
  grantsPlanTier?: CommercialTier;
  grantsGroupMembership?: boolean;
  defaultLanguage?: SupportedLanguage;
  active?: boolean;
}): Promise<AccessCodeActionResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const normalizedCode = normalizeAccessCode(input.code);
  const displayCode = input.code.trim().toUpperCase();
  const label = input.label.trim();
  const codeType = normalizeAccessCodeType(input.codeType);
  const grantsPlanTier = codeType === "super_link" ? normalizeSuperLinkGrantTier(input.grantsPlanTier) : "player";
  const grantsGroupMembership = input.grantsGroupMembership ?? true;
  const targetGroupId = input.groupId?.trim() ? input.groupId.trim() : null;

  if (!ACCESS_CODE_PATTERN.test(displayCode)) {
    return { ok: false, message: "Code must be 4-24 characters and use only letters, numbers, or hyphens." };
  }

  if (!label) {
    return { ok: false, message: "Label is required." };
  }

  if (input.maxUses !== null && input.maxUses !== undefined && input.maxUses <= 0) {
    return { ok: false, message: "Max uses must be greater than zero when provided." };
  }

  if (codeType === "super_link" && (!targetGroupId || !grantsGroupMembership)) {
    return { ok: false, message: "Super Links must target a group and grant group membership." };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("access_codes").insert({
    code: displayCode,
    normalized_code: normalizedCode,
    label,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    active: input.active ?? true,
    max_uses: input.maxUses ?? null,
    expires_at: input.expiresAt?.trim() ? new Date(input.expiresAt).toISOString() : null,
    group_id: targetGroupId,
    code_type: codeType,
    grants_plan_tier: grantsPlanTier,
    grants_group_membership: grantsGroupMembership,
    default_role: "player",
    default_language: normalizeLanguage(input.defaultLanguage),
    created_by: superAdminCheck.userId
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "That access code already exists. Choose another one." };
    }

    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invites");
  revalidatePath("/admin/players");

  return { ok: true, message: codeType === "super_link" ? "Super Link created." : `Access code ${displayCode} created.` };
}

export async function setAccessCodeActiveStateAction(
  id: string,
  active: boolean
): Promise<AccessCodeActionResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from("access_codes")
    .update({
      active,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invites");
  revalidatePath("/admin/players");

  return {
    ok: true,
    message: active ? "Access code activated." : "Access code deactivated."
  };
}

export async function validateAccessCodeForAdminAction(code: string): Promise<AccessCodeActionResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const result = await validateAccessCodeAvailability(code);
  return result.ok ? { ok: true, message: "Access code is available." } : { ok: false, message: result.message };
}

async function assertCurrentUserIsSuperAdmin(): Promise<SuperAdminResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in as a super admin to manage access codes." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false, message: "Only super admins can manage access codes." };
  }

  return { ok: true, userId: user.id };
}

function unwrapRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function unwrapCount(
  value: Array<{ count: number | null }> | { count: number | null } | null | undefined
) {
  if (Array.isArray(value)) {
    return value[0]?.count ?? 0;
  }

  return value?.count ?? 0;
}
