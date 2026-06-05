import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCESS_CODE_ERROR_KEY,
  getAccessCodeBlockedMessage,
  normalizeAccessCode,
  type AccessCodeFailureReason
} from "@/lib/access-codes";
import { getEffectiveGroupSeatLimit } from "@/lib/group-tier-limits";
import type { UserRole } from "@/lib/types";

type AccessCodeRow = {
  id: string;
  code: string;
  normalized_code: string;
  label: string;
  notes?: string | null;
  active: boolean;
  max_uses?: number | null;
  used_count: number;
  expires_at?: string | null;
  group_id?: string | null;
  code_type?: string | null;
  grants_plan_tier?: string | null;
  grants_group_membership?: boolean | null;
  default_role: UserRole;
  default_language: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

type GroupRow = {
  id: string;
  name: string;
  status: "active" | "archived";
  access_mode?: "open_by_code" | "restricted_by_email" | "closed" | null;
  membership_limit: number;
  owner_user_id?: string | null;
};

export type AccessCodeAvailability =
  | {
      ok: true;
      code: {
        id: string;
        code: string;
        label: string;
        notes?: string | null;
        groupId?: string | null;
        codeType: string;
        grantsPlanTier: string;
        grantsGroupMembership: boolean;
        defaultRole: UserRole;
        defaultLanguage: string;
        maxUses?: number | null;
        usedCount: number;
        expiresAt?: string | null;
      };
    }
  | {
      ok: false;
      reason: AccessCodeFailureReason;
      message: string;
    };

export async function validateAccessCodeAvailability(rawCode: string, email?: string): Promise<AccessCodeAvailability> {
  const normalizedCode = normalizeAccessCode(rawCode);
  if (!normalizedCode) {
    return invalidAvailability("invalid");
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("access_codes")
    .select(
      "id,code,normalized_code,label,notes,active,max_uses,used_count,expires_at,group_id,code_type,grants_plan_tier,grants_group_membership,default_role,default_language,created_by,created_at,updated_at"
    )
    .eq("normalized_code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const code = (data as AccessCodeRow | null) ?? null;
  if (!code) {
    return invalidAvailability("invalid");
  }

  if (!code.active) {
    return invalidAvailability("inactive");
  }

  if (code.expires_at && new Date(code.expires_at).getTime() <= Date.now()) {
    return invalidAvailability("expired");
  }

  if (code.max_uses !== null && code.max_uses !== undefined && code.used_count >= code.max_uses) {
    return invalidAvailability("full");
  }

  const grantsGroupMembership = code.grants_group_membership !== false;

  if (code.group_id && grantsGroupMembership) {
    const [{ data: group, error: groupError }, { count, error: memberCountError }] = await Promise.all([
      adminSupabase
        .from("groups")
        .select("id,name,status,access_mode,membership_limit,owner_user_id")
        .eq("id", code.group_id)
        .maybeSingle(),
      adminSupabase.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", code.group_id)
    ]);

    if (groupError) {
      throw new Error(groupError.message);
    }

    if (memberCountError) {
      throw new Error(memberCountError.message);
    }

    const resolvedGroup = (group as GroupRow | null) ?? null;
    if (!resolvedGroup || resolvedGroup.status !== "active") {
      return invalidAvailability("group_unavailable");
    }

    if (resolvedGroup.access_mode === "closed") {
      return invalidAvailability("group_unavailable");
    }

    if (resolvedGroup.access_mode === "restricted_by_email" && email?.trim()) {
      const normalizedEmail = email.trim().toLowerCase();
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
        return invalidAvailability("group_restricted");
      }
    }

    const effectiveSeatLimit = await getEffectiveGroupSeatLimit(adminSupabase, resolvedGroup);
    if ((count ?? 0) >= effectiveSeatLimit) {
      return invalidAvailability("group_full");
    }
  }

  return {
    ok: true,
    code: {
      id: code.id,
      code: code.code,
      label: code.label,
      notes: code.notes ?? null,
      groupId: code.group_id ?? null,
      codeType: code.code_type ?? "standard",
      grantsPlanTier: code.grants_plan_tier ?? "player",
      grantsGroupMembership,
      defaultRole: code.default_role,
      defaultLanguage: code.default_language,
      maxUses: code.max_uses ?? null,
      usedCount: code.used_count,
      expiresAt: code.expires_at ?? null
    }
  };
}

function invalidAvailability(reason: AccessCodeFailureReason): AccessCodeAvailability {
  return {
    ok: false,
    reason,
    message: getAccessCodeBlockedMessage(reason)
  };
}

export function getAccessCodeDbErrorKey(reason: AccessCodeFailureReason) {
  if (reason === "invalid") {
    return ACCESS_CODE_ERROR_KEY.invalid;
  }

  if (reason === "inactive") {
    return ACCESS_CODE_ERROR_KEY.inactive;
  }

  if (reason === "expired") {
    return ACCESS_CODE_ERROR_KEY.expired;
  }

  if (reason === "full") {
    return ACCESS_CODE_ERROR_KEY.full;
  }

  if (reason === "group_full") {
    return ACCESS_CODE_ERROR_KEY.groupFull;
  }

  if (reason === "group_restricted") {
    return ACCESS_CODE_ERROR_KEY.groupRestricted;
  }

  return ACCESS_CODE_ERROR_KEY.groupUnavailable;
}
