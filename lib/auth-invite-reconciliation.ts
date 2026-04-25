import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AuthUserForReconciliation = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
};

type InviteRow = {
  email: string;
  display_name: string;
  role: "player" | "admin";
  status: "pending" | "accepted" | "revoked" | "expired" | "failed";
  accepted_at?: string | null;
};

type GroupInviteRow = {
  id: string;
  group_id: string;
  normalized_email: string;
  suggested_display_name?: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at?: string | null;
  accepted_at?: string | null;
  accepted_by_user_id?: string | null;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "player" | "admin";
};

type GroupRow = {
  id: string;
  membership_limit: number;
  status: "active" | "archived";
};

export type InviteReconciliationResult = {
  ok: boolean;
  normalizedEmail?: string;
  profileCreated: boolean;
  appInviteAccepted: boolean;
  groupInvitesAccepted: number;
  notes: string[];
};

export async function reconcileInvitesForAuthUser(user: AuthUserForReconciliation): Promise<InviteReconciliationResult> {
  const normalizedEmail = user.email?.trim().toLowerCase();
  const notes: string[] = [];

  if (!normalizedEmail) {
    notes.push("No email was present on the authenticated user.");
    return {
      ok: false,
      profileCreated: false,
      appInviteAccepted: false,
      groupInvitesAccepted: 0,
      notes
    };
  }

  if (!user.email_confirmed_at) {
    notes.push("User email is not confirmed yet. Skipping invite reconciliation.");
    return {
      ok: true,
      normalizedEmail,
      profileCreated: false,
      appInviteAccepted: false,
      groupInvitesAccepted: 0,
      notes
    };
  }

  const adminSupabase = createAdminClient();
  const [{ data: existingProfile, error: profileError }, { data: appInvite, error: appInviteError }, { data: groupInvites, error: groupInvitesError }] =
    await Promise.all([
      adminSupabase.from("users").select("id,name,email,role").eq("id", user.id).maybeSingle(),
      adminSupabase
        .from("invites")
        .select("email,display_name,role,status,accepted_at")
        .eq("email", normalizedEmail)
        .maybeSingle(),
      adminSupabase
        .from("group_invites")
        .select("id,group_id,normalized_email,suggested_display_name,status,expires_at,accepted_at,accepted_by_user_id")
        .eq("normalized_email", normalizedEmail)
        .eq("status", "pending")
    ]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  if (appInviteError) {
    throw new Error(appInviteError.message);
  }

  if (groupInvitesError) {
    throw new Error(groupInvitesError.message);
  }

  let profile = (existingProfile as UserRow | null) ?? null;
  let profileCreated = false;

  if (!profile) {
    const derivedName =
      ((appInvite as InviteRow | null)?.display_name?.trim() ||
        ((groupInvites as GroupInviteRow[] | null)?.find((invite) => invite.suggested_display_name?.trim())?.suggested_display_name?.trim()) ||
        normalizedEmail.split("@")[0]) ?? "Player";
    const derivedRole = ((appInvite as InviteRow | null)?.role ?? "player") as UserRow["role"];

    const { data: insertedProfile, error: insertProfileError } = await adminSupabase
      .from("users")
      .insert({
        id: user.id,
        name: derivedName,
        email: normalizedEmail,
        role: derivedRole,
        needs_profile_setup: true
      })
      .select("id,name,email,role")
      .single();

    if (insertProfileError) {
      throw new Error(insertProfileError.message);
    }

    profile = insertedProfile as UserRow;
    profileCreated = true;
    notes.push("Created a public.users profile during post-confirmation reconciliation.");
  }

  let appInviteAccepted = false;
  if (appInvite && !appInvite.accepted_at) {
    const { error: updateInviteError } = await adminSupabase
      .from("invites")
      .update({
        accepted_at: new Date().toISOString(),
        status: "accepted",
        last_error: null
      })
      .eq("email", normalizedEmail);

    if (updateInviteError) {
      throw new Error(updateInviteError.message);
    }

    appInviteAccepted = true;
    notes.push("Marked the app invite accepted after confirmed authentication.");
  }

  let groupInvitesAccepted = 0;
  for (const invite of ((groupInvites ?? []) as GroupInviteRow[])) {
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      const { error: expireInviteError } = await adminSupabase
        .from("group_invites")
        .update({ status: "expired" })
        .eq("id", invite.id);

      if (expireInviteError) {
        throw new Error(expireInviteError.message);
      }

      notes.push(`Expired stale group invite ${invite.id}.`);
      continue;
    }

    const { data: group, error: groupError } = await adminSupabase
      .from("groups")
      .select("id,membership_limit,status")
      .eq("id", invite.group_id)
      .maybeSingle();

    if (groupError) {
      throw new Error(groupError.message);
    }

    if (!group) {
      notes.push(`Skipped group invite ${invite.id} because the group no longer exists.`);
      continue;
    }

    if ((group as GroupRow).status !== "active") {
      notes.push(`Skipped group invite ${invite.id} because the group is not active.`);
      continue;
    }

    const { data: membership, error: membershipLookupError } = await adminSupabase
      .from("group_members")
      .select("id")
      .eq("group_id", invite.group_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipLookupError) {
      throw new Error(membershipLookupError.message);
    }

    if (!membership) {
      const { count: memberCount, error: memberCountError } = await adminSupabase
        .from("group_members")
        .select("id", { count: "exact", head: true })
        .eq("group_id", invite.group_id);

      if (memberCountError) {
        throw new Error(memberCountError.message);
      }

      if ((memberCount ?? 0) >= (group as GroupRow).membership_limit) {
        notes.push(`Skipped group invite ${invite.id} because the group is full.`);
        continue;
      }

      const { error: membershipInsertError } = await adminSupabase.from("group_members").insert({
        group_id: invite.group_id,
        user_id: user.id,
        role: "member"
      });

      if (membershipInsertError) {
        throw new Error(membershipInsertError.message);
      }
    }

    const { error: acceptGroupInviteError } = await adminSupabase
      .from("group_invites")
      .update({
        status: "accepted",
        accepted_by_user_id: user.id,
        accepted_at: new Date().toISOString()
      })
      .eq("id", invite.id);

    if (acceptGroupInviteError) {
      throw new Error(acceptGroupInviteError.message);
    }

    groupInvitesAccepted += 1;
  }

  if (groupInvitesAccepted > 0) {
    notes.push(`Accepted ${groupInvitesAccepted} pending group invite${groupInvitesAccepted === 1 ? "" : "s"}.`);
  }

  return {
    ok: true,
    normalizedEmail,
    profileCreated,
    appInviteAccepted,
    groupInvitesAccepted,
    notes
  };
}
