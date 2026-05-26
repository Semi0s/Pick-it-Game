import {
  getPromoManagerInviteAvailability,
  normalizePromoManagerInviteCode,
  type PromoManagerInviteAvailabilityReason,
  type PromoManagerInviteStatus
} from "@/lib/promo-manager-invite-codes";
import { createAdminClient } from "@/lib/supabase/admin";

type PromoManagerInviteCodeRow = {
  id: string;
  code: string;
  normalized_code: string;
  campaign_name: string;
  public_title?: string | null;
  public_description?: string | null;
  status: PromoManagerInviteStatus;
  max_redemptions: number;
  redemption_count: number;
  target_group_id?: string | null;
  starts_at?: string | null;
  expires_at?: string | null;
  source_campaign?: string | null;
  created_at: string;
  updated_at: string;
};

export type PromoManagerInviteAvailability =
  | {
      ok: true;
      invite: {
        id: string;
        code: string;
        campaignName: string;
        publicTitle?: string | null;
        publicDescription?: string | null;
        status: PromoManagerInviteStatus;
        maxRedemptions: number;
        redemptionCount: number;
        targetGroupId?: string | null;
        startsAt?: string | null;
        expiresAt?: string | null;
      };
    }
  | {
      ok: false;
      reason: PromoManagerInviteAvailabilityReason;
      invite?: {
        code: string;
        campaignName: string;
        publicTitle?: string | null;
        publicDescription?: string | null;
      };
    };

export async function validatePromoManagerInviteCodeAvailability(rawCode: string): Promise<PromoManagerInviteAvailability> {
  const normalizedCode = normalizePromoManagerInviteCode(rawCode);
  if (!normalizedCode) {
    return { ok: false, reason: "invalid" };
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("promo_manager_invite_codes")
    .select("id,code,normalized_code,campaign_name,public_title,public_description,status,max_redemptions,redemption_count,target_group_id,starts_at,expires_at,source_campaign,created_at,updated_at")
    .eq("normalized_code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = (data as PromoManagerInviteCodeRow | null) ?? null;
  if (!row) {
    return { ok: false, reason: "invalid" };
  }

  const availability = getPromoManagerInviteAvailability({
    status: row.status,
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    redemptionCount: row.redemption_count,
    maxRedemptions: row.max_redemptions
  });

  if (!availability.claimable) {
    return {
      ok: false,
      reason: availability.reason ?? "unavailable",
      invite: {
        code: row.code,
        campaignName: row.campaign_name,
        publicTitle: row.public_title ?? null,
        publicDescription: row.public_description ?? null
      }
    };
  }

  if (row.target_group_id) {
    const [{ data: group, error: groupError }, { count, error: memberCountError }] = await Promise.all([
      adminSupabase
        .from("groups")
        .select("id,status,membership_limit")
        .eq("id", row.target_group_id)
        .maybeSingle(),
      adminSupabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", row.target_group_id)
    ]);

    if (groupError) {
      throw new Error(groupError.message);
    }

    if (memberCountError) {
      throw new Error(memberCountError.message);
    }

    const resolvedGroup = group as { id: string; status: "active" | "archived"; membership_limit: number } | null;
    if (!resolvedGroup || resolvedGroup.status !== "active" || (count ?? 0) >= resolvedGroup.membership_limit) {
      return {
        ok: false,
        reason: "full",
        invite: {
          code: row.code,
          campaignName: row.campaign_name,
          publicTitle: row.public_title ?? null,
          publicDescription: row.public_description ?? null
        }
      };
    }
  }

  return {
    ok: true,
    invite: {
      id: row.id,
      code: row.code,
      campaignName: row.campaign_name,
      publicTitle: row.public_title ?? null,
      publicDescription: row.public_description ?? null,
      status: row.status,
      maxRedemptions: row.max_redemptions,
      redemptionCount: row.redemption_count,
      targetGroupId: row.target_group_id ?? null,
      startsAt: row.starts_at ?? null,
      expiresAt: row.expires_at ?? null
    }
  };
}
