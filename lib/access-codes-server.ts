import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCESS_CODE_ERROR_KEY,
  getAccessCodeBlockedMessage,
  normalizeAccessCode,
  type AccessCodeFailureReason
} from "@/lib/access-codes";
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
  membership_limit: number;
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

export async function validateAccessCodeAvailability(rawCode: string): Promise<AccessCodeAvailability> {
  const normalizedCode = normalizeAccessCode(rawCode);
  if (!normalizedCode) {
    return invalidAvailability("invalid");
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("access_codes")
    .select(
      "id,code,normalized_code,label,notes,active,max_uses,used_count,expires_at,group_id,default_role,default_language,created_by,created_at,updated_at"
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

  if (code.group_id) {
    const [{ data: group, error: groupError }, { count, error: memberCountError }] = await Promise.all([
      adminSupabase.from("groups").select("id,name,status,membership_limit").eq("id", code.group_id).maybeSingle(),
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

    if ((count ?? 0) >= resolvedGroup.membership_limit) {
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

  return ACCESS_CODE_ERROR_KEY.groupUnavailable;
}
