"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validatePromoManagerInviteCodeAvailability } from "@/lib/promo-manager-invite-codes-server";
import {
  getPromoManagerInviteReasonFromMessage,
  normalizePromoManagerInviteCode,
  type PromoManagerInviteAvailabilityReason
} from "@/lib/promo-manager-invite-codes";

const CLAIM_ATTEMPT_WINDOW_MS = 60 * 1000;
const MAX_CLAIM_ATTEMPTS_PER_WINDOW = 10;
const claimAttemptBuckets = new Map<string, { count: number; resetAt: number }>();

export async function fetchPromoManagerInvitePreviewAction(code: string) {
  const result = await validatePromoManagerInviteCodeAvailability(code);
  if (!result.ok) {
    return {
      ok: false as const,
      reason: result.reason,
      invite: result.invite ?? null
    };
  }

  return {
    ok: true as const,
    invite: result.invite
  };
}

export async function claimPromoManagerInviteCodeAction(input: {
  code: string;
  utm?: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
  };
}): Promise<
  | { ok: true; alreadyClaimed: boolean; message?: string }
  | { ok: false; reason: "auth_required" | PromoManagerInviteAvailabilityReason; message?: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, reason: "auth_required" };
  }

  const normalizedCode = normalizePromoManagerInviteCode(input.code);
  if (!normalizedCode) {
    return { ok: false, reason: "invalid" };
  }

  const adminSupabase = createAdminClient();
  const { data: inviteRow, error: inviteError } = await adminSupabase
    .from("promo_manager_invite_codes")
    .select("id")
    .eq("normalized_code", normalizedCode)
    .maybeSingle();

  if (inviteError) {
    return { ok: false, reason: "unavailable", message: inviteError.message };
  }

  const inviteId = (inviteRow as { id: string } | null)?.id ?? null;
  const email = user.email?.trim().toLowerCase();

  if (!email) {
    return { ok: false, reason: "unavailable", message: "Your account is missing an email address." };
  }

  if (!allowClaimAttempt(`${user.id}:${normalizedCode}`)) {
    return { ok: false, reason: "unavailable", message: "Too many claim attempts. Try again in a minute." };
  }

  let alreadyClaimed = false;
  if (inviteId) {
    const { data: existingRedemption } = await adminSupabase
      .from("promo_manager_invite_redemptions")
      .select("id")
      .eq("invite_code_id", inviteId)
      .or(`user_id.eq.${user.id},normalized_email.eq.${email}`)
      .maybeSingle();

    alreadyClaimed = Boolean(existingRedemption);
  }

  const { error } = await adminSupabase.rpc("redeem_promo_manager_invite_code_for_user", {
    p_auth_email: email,
    p_auth_user_id: user.id,
    p_raw_code: input.code,
    p_utm: sanitizeUtm(input.utm)
  });

  if (error) {
    return {
      ok: false,
      reason: getPromoManagerInviteReasonFromMessage(error.message) ?? "unavailable",
      message: error.message
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/my-groups");
  revalidatePath("/profile");
  revalidatePath("/admin/invites");
  revalidatePath("/invite/[code]", "page");

  return { ok: true, alreadyClaimed };
}

function sanitizeUtm(utm: { [key: string]: string | null | undefined } | null | undefined) {
  return {
    utm_source: sanitizeValue(utm?.utm_source),
    utm_medium: sanitizeValue(utm?.utm_medium),
    utm_campaign: sanitizeValue(utm?.utm_campaign),
    utm_content: sanitizeValue(utm?.utm_content)
  };
}

function sanitizeValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 160) : null;
}

function allowClaimAttempt(key: string) {
  const now = Date.now();
  const bucket = claimAttemptBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    claimAttemptBuckets.set(key, { count: 1, resetAt: now + CLAIM_ATTEMPT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= MAX_CLAIM_ATTEMPTS_PER_WINDOW) {
    return false;
  }

  bucket.count += 1;
  return true;
}
