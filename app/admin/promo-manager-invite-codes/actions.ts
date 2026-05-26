"use server";

import { revalidatePath } from "next/cache";
import {
  formatPromoManagerInviteCode,
  getPromoManagerInviteAvailability,
  normalizePromoManagerInviteCode,
  PROMO_MANAGER_INVITE_CODE_PATTERN,
  type PromoManagerInviteStatus
} from "@/lib/promo-manager-invite-codes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getPublicSiteUrl } from "@/lib/site-url";

export type AdminPromoManagerInviteCode = {
  id: string;
  code: string;
  campaignName: string;
  publicTitle?: string | null;
  publicDescription?: string | null;
  status: PromoManagerInviteStatus;
  maxRedemptions: number;
  redemptionCount: number;
  remainingSlots: number;
  targetGroupId?: string | null;
  targetGroupName?: string | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
  sourceCampaign?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  shareLink: string;
  createdAt: string;
  updatedAt: string;
  redemptions: Array<{
    id: string;
    email: string;
    userId: string;
    redeemedAt: string;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
  }>;
};

export type PromoManagerInviteGroupOption = {
  id: string;
  name: string;
  status: "active" | "archived";
  membershipLimit: number;
  memberCount: number;
};

type SuperAdminResult = { ok: true; userId: string } | { ok: false; message: string };
type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function fetchAdminPromoManagerInviteCodesAction(): Promise<
  { ok: true; codes: AdminPromoManagerInviteCode[] } | { ok: false; message: string }
> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("promo_manager_invite_codes")
    .select(
      "id,code,campaign_name,public_title,public_description,status,max_redemptions,redemption_count,target_group_id,starts_at,expires_at,notes,source_campaign,created_at,updated_at,target_group:groups!promo_manager_invite_codes_target_group_id_fkey(id,name,status),created_by:users!promo_manager_invite_codes_created_by_super_admin_id_fkey(id,name,email),redemptions:promo_manager_invite_redemptions(id,email,user_id,redeemed_at,utm_source,utm_medium,utm_campaign,utm_content)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, message: error.message };
  }

  const siteUrl = getPublicSiteUrl().replace(/\/$/, "");
  const codes = ((data ?? []) as Array<{
    id: string;
    code: string;
    campaign_name: string;
    public_title?: string | null;
    public_description?: string | null;
    status: PromoManagerInviteStatus;
    max_redemptions: number;
    redemption_count: number;
    target_group_id?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    notes?: string | null;
    source_campaign?: string | null;
    created_at: string;
    updated_at: string;
    target_group?: { id: string; name: string; status: "active" | "archived" } | Array<{ id: string; name: string; status: "active" | "archived" }> | null;
    created_by?: { id: string; name?: string | null; email?: string | null } | Array<{ id: string; name?: string | null; email?: string | null }> | null;
    redemptions?: Array<{
      id: string;
      email: string;
      user_id: string;
      redeemed_at: string;
      utm_source?: string | null;
      utm_medium?: string | null;
      utm_campaign?: string | null;
      utm_content?: string | null;
    }> | null;
  }>).map((row) => {
    const targetGroup = unwrapRelation(row.target_group);
    const createdBy = unwrapRelation(row.created_by);
    return {
      id: row.id,
      code: row.code,
      campaignName: row.campaign_name,
      publicTitle: row.public_title ?? null,
      publicDescription: row.public_description ?? null,
      status: row.status,
      maxRedemptions: row.max_redemptions,
      redemptionCount: row.redemption_count,
      remainingSlots: Math.max(0, row.max_redemptions - row.redemption_count),
      targetGroupId: row.target_group_id ?? null,
      targetGroupName: targetGroup?.name ?? null,
      startsAt: row.starts_at ?? null,
      expiresAt: row.expires_at ?? null,
      notes: row.notes ?? null,
      sourceCampaign: row.source_campaign ?? null,
      createdByName: createdBy?.name ?? null,
      createdByEmail: createdBy?.email ?? null,
      shareLink: `${siteUrl}/invite/${encodeURIComponent(row.code)}`,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      redemptions: (row.redemptions ?? []).map((redemption) => ({
        id: redemption.id,
        email: redemption.email,
        userId: redemption.user_id,
        redeemedAt: redemption.redeemed_at,
        utmSource: redemption.utm_source ?? null,
        utmMedium: redemption.utm_medium ?? null,
        utmCampaign: redemption.utm_campaign ?? null,
        utmContent: redemption.utm_content ?? null
      }))
    } satisfies AdminPromoManagerInviteCode;
  });

  return { ok: true, codes };
}

export async function fetchPromoManagerInviteGroupsAction(): Promise<
  { ok: true; groups: PromoManagerInviteGroupOption[] } | { ok: false; message: string }
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

export async function createPromoManagerInviteCodeAction(input: {
  code: string;
  campaignName: string;
  publicTitle?: string;
  publicDescription?: string;
  maxRedemptions: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  targetGroupId?: string | null;
  notes?: string;
  sourceCampaign?: string;
}): Promise<ActionResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const displayCode = formatPromoManagerInviteCode(input.code);
  const normalizedCode = normalizePromoManagerInviteCode(displayCode);
  const campaignName = input.campaignName.trim();

  if (!PROMO_MANAGER_INVITE_CODE_PATTERN.test(displayCode)) {
    return { ok: false, message: "Code must be 4-32 characters and use only letters, numbers, or hyphens." };
  }

  if (!campaignName) {
    return { ok: false, message: "Campaign name is required." };
  }

  if (!Number.isFinite(input.maxRedemptions) || input.maxRedemptions <= 0) {
    return { ok: false, message: "Max redemptions must be greater than zero." };
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("promo_manager_invite_codes").insert({
    code: displayCode,
    normalized_code: normalizedCode,
    campaign_name: campaignName,
    public_title: input.publicTitle?.trim() ? input.publicTitle.trim() : null,
    public_description: input.publicDescription?.trim() ? input.publicDescription.trim() : null,
    max_redemptions: Math.floor(input.maxRedemptions),
    starts_at: input.startsAt?.trim() ? new Date(input.startsAt).toISOString() : null,
    expires_at: input.expiresAt?.trim() ? new Date(input.expiresAt).toISOString() : null,
    target_group_id: input.targetGroupId?.trim() ? input.targetGroupId.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    source_campaign: input.sourceCampaign?.trim() ? input.sourceCampaign.trim() : null,
    created_by_super_admin_id: superAdminCheck.userId
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "That promo code already exists. Choose another one." };
    }

    return { ok: false, message: error.message };
  }

  revalidatePromoManagerInvitePaths();
  return { ok: true, message: `Promo manager invite ${displayCode} created.` };
}

export async function setPromoManagerInviteCodeStatusAction(
  id: string,
  status: Extract<PromoManagerInviteStatus, "active" | "paused" | "archived">
): Promise<ActionResult> {
  const superAdminCheck = await assertCurrentUserIsSuperAdmin();
  if (!superAdminCheck.ok) {
    return superAdminCheck;
  }

  const adminSupabase = createAdminClient();
  const { data: current, error: currentError } = await adminSupabase
    .from("promo_manager_invite_codes")
    .select("status,starts_at,expires_at,redemption_count,max_redemptions")
    .eq("id", id)
    .maybeSingle();

  if (currentError) {
    return { ok: false, message: currentError.message };
  }

  const row = current as {
    status: PromoManagerInviteStatus;
    starts_at?: string | null;
    expires_at?: string | null;
    redemption_count: number;
    max_redemptions: number;
  } | null;

  if (!row) {
    return { ok: false, message: "Promo invite code not found." };
  }

  if (status === "active") {
    const availability = getPromoManagerInviteAvailability({
      status: "active",
      startsAt: row.starts_at ?? null,
      expiresAt: row.expires_at ?? null,
      redemptionCount: row.redemption_count,
      maxRedemptions: row.max_redemptions
    });

    if (!availability.claimable && availability.reason !== "not_started") {
      const reason = availability.reason ?? "unavailable";
      return { ok: false, message: `Cannot reactivate this code because it is ${reason.replace("_", " ")}.` };
    }
  }

  const { error } = await adminSupabase
    .from("promo_manager_invite_codes")
    .update({
      status,
      archived_at: status === "archived" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePromoManagerInvitePaths();
  return { ok: true, message: `Promo manager invite ${status === "active" ? "reactivated" : status}.` };
}

async function assertCurrentUserIsSuperAdmin(): Promise<SuperAdminResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, message: "You must be signed in as a super admin to manage promo manager invite codes." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return { ok: false, message: "Only super admins can manage promo manager invite codes." };
  }

  return { ok: true, userId: user.id };
}

function revalidatePromoManagerInvitePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/invites");
  revalidatePath("/admin/players");
  revalidatePath("/invite/[code]", "page");
}

function unwrapRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function unwrapCount(value: Array<{ count: number | null }> | { count: number | null } | null | undefined) {
  return Array.isArray(value) ? value[0]?.count ?? 0 : value?.count ?? 0;
}
