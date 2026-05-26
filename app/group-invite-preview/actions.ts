"use server";

import { createHash } from "crypto";
import {
  normalizeExplainerLanguage,
  normalizeLanguage,
  type ExplainerLanguage,
  type SupportedLanguage
} from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";

type GroupInviteStatus = "pending" | "accepted" | "revoked" | "expired";

export type GroupInvitePreviewResult =
  | {
      ok: true;
      invite: {
        groupId: string;
        groupName: string;
        inviterLabel: string;
        email: string;
        existingAccount: boolean;
        suggestedDisplayName?: string | null;
        customMessage?: string | null;
        language?: SupportedLanguage;
        helperLanguage?: ExplainerLanguage;
        status: GroupInviteStatus;
        expiresAt: string | null;
      };
    }
  | {
      ok: false;
      message: string;
    };

export async function fetchGroupInvitePreviewAction(token: string): Promise<GroupInvitePreviewResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false, message: "Invite token is required." };
  }

  try {
    const adminSupabase = createAdminClient();
    const tokenHash = hashInviteToken(trimmedToken);
    const { data, error } = await adminSupabase
      .from("group_invites")
      .select(
        "group_id,email,suggested_display_name,custom_message,language,helper_language,status,expires_at,groups(name),invited_by:users!group_invites_invited_by_user_id_fkey(name,email)"
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      return { ok: false, message: error.message };
    }

    if (!data) {
      return { ok: false, message: "That invite could not be found." };
    }

    const groupName =
      Array.isArray(data.groups) ? data.groups[0]?.name :
      (data.groups as { name?: string } | null)?.name;
    const invitedBy = Array.isArray(data.invited_by) ? data.invited_by[0] : data.invited_by;
    const inviterLabel = invitedBy?.name?.trim() || invitedBy?.email?.trim() || "A group manager";
    const existingAccount = Boolean(await findUserIdByEmail(adminSupabase, normalizeEmail(data.email)));

    return {
      ok: true,
      invite: {
        groupId: data.group_id,
        groupName: groupName ?? "Group",
        inviterLabel,
        email: data.email,
        existingAccount,
        suggestedDisplayName: data.suggested_display_name ?? null,
        customMessage: data.custom_message ?? null,
        language: normalizeLanguage((data as { language?: string | null }).language ?? null),
        helperLanguage: normalizeExplainerLanguage((data as { helper_language?: string | null }).helper_language ?? null),
        status: data.status,
        expiresAt: data.expires_at ?? null
      }
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not load the invite."
    };
  }
}

async function findUserIdByEmail(adminSupabase: ReturnType<typeof createAdminClient>, normalizedEmail: string) {
  const { data, error } = await adminSupabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
