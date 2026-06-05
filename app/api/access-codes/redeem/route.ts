import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAccessCodeBlockedMessage, getAccessCodeFailureReasonFromMessage, normalizeAccessCode } from "@/lib/access-codes";
import { getEffectiveGroupSeatLimit } from "@/lib/group-tier-limits";
import {
  getCommercialTierLabel,
  normalizeAccessCodeType,
  normalizeSuperLinkGrantTier,
  shouldApplyCommercialTierGrant
} from "@/lib/super-link-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { CommercialTier } from "@/lib/tier-access";

type RedeemAccessCodeRow = {
  code_id: string;
  group_id: string | null;
  already_redeemed: boolean;
  already_member: boolean;
};

type AdminSupabaseClient = ReturnType<typeof createAdminClient>;

type AuthUserForAccessCode = {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
};

type AccessCodeRow = {
  id: string;
  active: boolean;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  group_id?: string | null;
  code_type?: string | null;
  grants_plan_tier?: string | null;
  grants_group_membership?: boolean | null;
};

type GroupRow = {
  id: string;
  status: "active" | "archived";
  access_mode?: "open_by_code" | "restricted_by_email" | "closed" | null;
  membership_limit: number;
  owner_user_id?: string | null;
};

type AccessCodeRedeemResult =
  | {
      ok: true;
      row: RedeemAccessCodeRow;
    }
  | {
      ok: false;
      message: string;
    };

type AccessCodeSuccessContext = {
  codeType: "standard" | "super_link";
  grantsPlanTier: CommercialTier;
  groupName?: string | null;
  userRole?: "player" | "admin" | null;
  userPlanTier?: CommercialTier | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim() ?? "";

    if (!code) {
      return NextResponse.json({ ok: false, message: getAccessCodeBlockedMessage("invalid") }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user?.email) {
      return NextResponse.json({ ok: false, message: "Sign in before using an invite code." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    await ensureAccessCodeProfile(adminSupabase, {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata as Record<string, unknown> | undefined
    });

    const { data, error } = await adminSupabase.rpc("redeem_access_code_for_existing_user", {
      auth_email: user.email,
      auth_user_id: user.id,
      raw_code: code
    });

    if (error) {
      console.warn("[access-code:redeem] Existing user redemption failed.", {
        userId: user.id,
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message
      });
      const reason = getAccessCodeFailureReasonFromMessage(error.message) ?? "redemption_failed";
      if (reason !== "redemption_failed") {
        return NextResponse.json({ ok: false, message: getAccessCodeBlockedMessage(reason) }, { status: 400 });
      }

      const fallbackResult = await redeemAccessCodeWithAdminFallback(adminSupabase, {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata as Record<string, unknown> | undefined
      }, code);

      if (!fallbackResult.ok) {
        return NextResponse.json({ ok: false, message: fallbackResult.message }, { status: 400 });
      }

      revalidateAccessCodeSurfaces();
      const context = await fetchAccessCodeSuccessContext(adminSupabase, fallbackResult.row.code_id, user.id);
      return NextResponse.json(buildAccessCodeSuccessPayload(fallbackResult.row, context));
    }

    const row = Array.isArray(data) ? (data[0] as RedeemAccessCodeRow | undefined) : (data as RedeemAccessCodeRow | null);
    revalidateAccessCodeSurfaces();
    const context = row?.code_id ? await fetchAccessCodeSuccessContext(adminSupabase, row.code_id, user.id) : null;
    return NextResponse.json(buildAccessCodeSuccessPayload(row, context));
  } catch (error) {
    console.error("[access-code:redeem] Existing user redemption crashed.", error);
    return NextResponse.json(
      { ok: false, message: "That code looked valid, but we could not finish joining the group." },
      { status: 500 }
    );
  }
}

async function redeemAccessCodeWithAdminFallback(
  adminSupabase: AdminSupabaseClient,
  user: AuthUserForAccessCode,
  rawCode: string
): Promise<AccessCodeRedeemResult> {
  try {
    const normalizedCode = normalizeAccessCode(rawCode);
    const normalizedEmail = user.email.trim().toLowerCase();
    if (!normalizedCode) {
      return { ok: false, message: getAccessCodeBlockedMessage("invalid") };
    }

    const { data: accessCode, error: codeLookupError } = await adminSupabase
      .from("access_codes")
      .select("id,active,max_uses,used_count,expires_at,group_id,code_type,grants_plan_tier,grants_group_membership")
      .eq("normalized_code", normalizedCode)
      .maybeSingle();

    if (codeLookupError) {
      throw new Error(codeLookupError.message);
    }

    const code = (accessCode as AccessCodeRow | null) ?? null;
    if (!code) {
      return { ok: false, message: getAccessCodeBlockedMessage("invalid") };
    }

    if (!code.active) {
      return { ok: false, message: getAccessCodeBlockedMessage("inactive") };
    }

    if (code.expires_at && new Date(code.expires_at).getTime() <= Date.now()) {
      return { ok: false, message: getAccessCodeBlockedMessage("expired") };
    }

    let alreadyMember = false;
    let memberCount = 0;
    let effectiveSeatLimit = Number.POSITIVE_INFINITY;
    const grantsGroupMembership = code.grants_group_membership !== false;
    const grantsPlanTier = normalizeSuperLinkGrantTier(code.grants_plan_tier);

    if (code.group_id && grantsGroupMembership) {
      const { data: group, error: groupLookupError } = await adminSupabase
        .from("groups")
        .select("id,status,access_mode,membership_limit,owner_user_id")
        .eq("id", code.group_id)
        .maybeSingle();

      if (groupLookupError) {
        throw new Error(groupLookupError.message);
      }

      const resolvedGroup = (group as GroupRow | null) ?? null;
      if (!resolvedGroup || resolvedGroup.status !== "active" || resolvedGroup.access_mode === "closed") {
        return { ok: false, message: getAccessCodeBlockedMessage("group_unavailable") };
      }

      if (resolvedGroup.access_mode === "restricted_by_email") {
        const { data: allowedEmail, error: allowedEmailError } = await adminSupabase
          .from("group_allowed_emails")
          .select("id")
          .eq("group_id", code.group_id)
          .eq("email_normalized", normalizedEmail)
          .maybeSingle();

        if (allowedEmailError) {
          throw new Error(allowedEmailError.message);
        }

        if (!allowedEmail) {
          return { ok: false, message: getAccessCodeBlockedMessage("group_restricted") };
        }
      }

      const [{ data: existingMembership, error: membershipLookupError }, { count, error: memberCountError }] = await Promise.all([
        adminSupabase.from("group_members").select("id").eq("group_id", code.group_id).eq("user_id", user.id).maybeSingle(),
        adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", code.group_id)
      ]);

      if (membershipLookupError) {
        throw new Error(membershipLookupError.message);
      }

      if (memberCountError) {
        throw new Error(memberCountError.message);
      }

      alreadyMember = Boolean(existingMembership);
      memberCount = count ?? 0;
      effectiveSeatLimit = await getEffectiveGroupSeatLimit(adminSupabase, resolvedGroup);
    }

    const existingRedemption = await findAccessCodeRedemption(adminSupabase, code.id, user.id, normalizedEmail);
    const alreadyRedeemed = Boolean(existingRedemption);

    if (!alreadyRedeemed) {
      if (code.max_uses !== null && code.max_uses !== undefined && code.used_count >= code.max_uses) {
        return { ok: false, message: getAccessCodeBlockedMessage("full") };
      }

      if (code.group_id && grantsGroupMembership && !alreadyMember && memberCount >= effectiveSeatLimit) {
        return { ok: false, message: getAccessCodeBlockedMessage("group_full") };
      }

      const { data: updatedCode, error: updateCodeError } = await adminSupabase
        .from("access_codes")
        .update({
          used_count: code.used_count + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", code.id)
        .eq("used_count", code.used_count)
        .select("id,used_count")
        .maybeSingle();

      if (updateCodeError) {
        throw new Error(updateCodeError.message);
      }

      if (!updatedCode) {
        return { ok: false, message: "That code is being claimed right now. Please try again." };
      }

      await insertAccessCodeRedemption(adminSupabase, code.id, user, normalizedEmail, {
        targetGroupId: code.group_id ?? null,
        grantedPlanTier: grantsPlanTier
      });
    }

    if (code.group_id && grantsGroupMembership && !alreadyMember) {
      await insertGroupMembershipFromAccessCode(adminSupabase, code.group_id, user.id);
    }

    await applyAccessCodePlanTierGrant(adminSupabase, user.id, grantsPlanTier);

    return {
      ok: true,
      row: {
        code_id: code.id,
        group_id: code.group_id ?? null,
        already_redeemed: alreadyRedeemed,
        already_member: alreadyMember
      }
    };
  } catch (fallbackError) {
    console.error("[access-code:redeem] Admin fallback redemption failed.", fallbackError);
    return { ok: false, message: "That code looked valid, but we could not finish joining the group." };
  }
}

async function findAccessCodeRedemption(
  adminSupabase: AdminSupabaseClient,
  codeId: string,
  userId: string,
  normalizedEmail: string
) {
  const { data: userRedemption, error: userRedemptionError } = await adminSupabase
    .from("access_code_redemptions")
    .select("id")
    .eq("code_id", codeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (userRedemptionError) {
    throw new Error(userRedemptionError.message);
  }

  if (userRedemption) {
    return userRedemption;
  }

  const { data: emailRedemption, error: emailRedemptionError } = await adminSupabase
    .from("access_code_redemptions")
    .select("id")
    .eq("code_id", codeId)
    .eq("normalized_email", normalizedEmail)
    .maybeSingle();

  if (emailRedemptionError) {
    throw new Error(emailRedemptionError.message);
  }

  return emailRedemption;
}

async function insertAccessCodeRedemption(
  adminSupabase: AdminSupabaseClient,
  codeId: string,
  user: AuthUserForAccessCode,
  normalizedEmail: string,
  context?: {
    targetGroupId?: string | null;
    grantedPlanTier?: CommercialTier | null;
  }
) {
  const { error } = await adminSupabase.from("access_code_redemptions").insert({
    code_id: codeId,
    user_id: user.id,
    email: user.email,
    normalized_email: normalizedEmail,
    target_group_id: context?.targetGroupId ?? null,
    granted_plan_tier: context?.grantedPlanTier ?? null,
    status: "redeemed"
  });

  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}

async function applyAccessCodePlanTierGrant(
  adminSupabase: AdminSupabaseClient,
  userId: string,
  grantedPlanTier: CommercialTier
) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("plan_tier")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const currentPlanTier = normalizeSuperLinkGrantTier((data as { plan_tier?: string | null } | null)?.plan_tier ?? null);
  if (!shouldApplyCommercialTierGrant(currentPlanTier, grantedPlanTier)) {
    return;
  }

  const { error: updateError } = await adminSupabase
    .from("users")
    .update({
      plan_tier: grantedPlanTier,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function insertGroupMembershipFromAccessCode(
  adminSupabase: AdminSupabaseClient,
  groupId: string,
  userId: string
) {
  const { error } = await adminSupabase.from("group_members").insert({
    group_id: groupId,
    user_id: userId,
    role: "member",
    join_source: "manager_code"
  });

  if (!error || error.code === "23505") {
    return;
  }

  if (error.code !== "42703") {
    throw new Error(error.message);
  }

  const { error: legacyInsertError } = await adminSupabase.from("group_members").insert({
    group_id: groupId,
    user_id: userId,
    role: "member"
  });

  if (legacyInsertError && legacyInsertError.code !== "23505") {
    throw new Error(legacyInsertError.message);
  }
}

function revalidateAccessCodeSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/my-groups");
  revalidatePath("/groups");
  revalidatePath("/leaderboard");
  revalidatePath("/profile");
}

async function fetchAccessCodeSuccessContext(
  adminSupabase: AdminSupabaseClient,
  codeId: string,
  userId: string
): Promise<AccessCodeSuccessContext | null> {
  const [{ data: accessCode, error: accessCodeError }, { data: user, error: userError }] = await Promise.all([
    adminSupabase
      .from("access_codes")
      .select("code_type,grants_plan_tier,group:groups(name)")
      .eq("id", codeId)
      .maybeSingle(),
    adminSupabase
      .from("users")
      .select("role,plan_tier")
      .eq("id", userId)
      .maybeSingle()
  ]);

  if (accessCodeError) {
    throw new Error(accessCodeError.message);
  }

  if (userError) {
    throw new Error(userError.message);
  }

  const accessCodeRow = accessCode as {
    code_type?: string | null;
    grants_plan_tier?: string | null;
    group?: { name?: string | null } | Array<{ name?: string | null }> | null;
  } | null;
  const userRow = user as { role?: "player" | "admin" | null; plan_tier?: string | null } | null;

  if (!accessCodeRow) {
    return null;
  }

  const group = Array.isArray(accessCodeRow.group) ? accessCodeRow.group[0] ?? null : accessCodeRow.group ?? null;
  return {
    codeType: normalizeAccessCodeType(accessCodeRow.code_type),
    grantsPlanTier: normalizeSuperLinkGrantTier(accessCodeRow.grants_plan_tier),
    groupName: group?.name ?? null,
    userRole: userRow?.role ?? null,
    userPlanTier: normalizeSuperLinkGrantTier(userRow?.plan_tier ?? null)
  };
}

function buildAccessCodeSuccessPayload(row?: RedeemAccessCodeRow | null, context?: AccessCodeSuccessContext | null) {
  const message = buildAccessCodeSuccessMessage(row, context);

  return {
    ok: true,
    groupId: row?.group_id ?? null,
    alreadyMember: Boolean(row?.already_member),
    alreadyRedeemed: Boolean(row?.already_redeemed),
    message
  };
}

function buildAccessCodeSuccessMessage(row?: RedeemAccessCodeRow | null, context?: AccessCodeSuccessContext | null) {
  if (context?.codeType === "super_link") {
    const groupName = context.groupName ?? "the group";
    const grantedTierLabel = getCommercialTierLabel(context.grantsPlanTier);
    const preservedHigherAccess =
      context.userRole === "admin" ||
      (context.userPlanTier ? shouldApplyCommercialTierGrant(context.grantsPlanTier, context.userPlanTier) : false);

    if (preservedHigherAccess) {
      return `You're in! You joined ${groupName}. Your existing access level was preserved.`;
    }

    return `You're in! You joined ${groupName} as a ${grantedTierLabel}.`;
  }

  if (row?.already_member) {
    return "You are already in that group. No new account is needed.";
  }

  if (row?.group_id) {
    return "Group joined.";
  }

  return "Invite code applied.";
}

async function ensureAccessCodeProfile(adminSupabase: AdminSupabaseClient, user: AuthUserForAccessCode) {
  const normalizedEmail = user.email.trim().toLowerCase();
  const { data: existingProfile, error: profileLookupError } = await adminSupabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileLookupError) {
    throw new Error(profileLookupError.message);
  }

  if (existingProfile) {
    return;
  }

  const { error: insertProfileError } = await adminSupabase.from("users").insert({
    id: user.id,
    email: normalizedEmail,
    name: deriveAccessCodeProfileName(user),
    role: "player",
    needs_profile_setup: true
  });

  if (insertProfileError) {
    throw new Error(insertProfileError.message);
  }

  console.info("[access-code:redeem] Created missing profile before existing-user access-code redemption.", {
    userId: user.id,
    email: normalizedEmail
  });
}

function deriveAccessCodeProfileName(user: AuthUserForAccessCode) {
  const metadataName =
    typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "";

  return metadataName || user.email.split("@")[0] || "Player";
}
