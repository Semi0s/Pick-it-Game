import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { isMissingRelationError } from "@/lib/schema-safety";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, message: "You must be signed in to delete your account." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { confirmationText?: string } | null;
  const normalizedEmail = user.email?.trim().toLowerCase() ?? "";
  const confirmationText = body?.confirmationText?.trim().toLowerCase() ?? "";

  if (!normalizedEmail) {
    return NextResponse.json({ ok: false, message: "Your account email could not be confirmed." }, { status: 400 });
  }

  if (confirmationText !== normalizedEmail) {
    return NextResponse.json({ ok: false, message: `Type ${normalizedEmail} to confirm account deletion.` }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const [ownedGroupsResult, managedGroupsResult, ownedOrganizationsResult] = await Promise.all([
    adminSupabase.from("groups").select("id,name", { count: "exact" }).eq("owner_user_id", user.id).eq("status", "active"),
    adminSupabase
      .from("group_members")
      .select("group_id,group:groups!group_members_group_id_fkey(id,name,status)")
      .eq("user_id", user.id)
      .eq("role", "manager"),
    adminSupabase.from("organizations").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id)
  ]);

  if (ownedGroupsResult.error || managedGroupsResult.error || ownedOrganizationsResult.error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          ownedGroupsResult.error?.message ??
          managedGroupsResult.error?.message ??
          ownedOrganizationsResult.error?.message ??
          "Could not validate account ownership state."
      },
      { status: 400 }
    );
  }

  const activeManagedGroups = ((managedGroupsResult.data ?? []) as Array<{
    group_id: string;
    group?: { id?: string; name?: string; status?: string | null } | Array<{ id?: string; name?: string; status?: string | null }> | null;
  }>).filter((membership) => {
    const group = Array.isArray(membership.group) ? membership.group[0] : membership.group;
    return group?.status === "active";
  });

  if ((ownedGroupsResult.count ?? 0) > 0 || activeManagedGroups.length > 0 || (ownedOrganizationsResult.count ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "Transfer or leave any owned/managed groups and organizations before deleting your account."
      },
      { status: 400 }
    );
  }

  const deleteOptional = async (table: string, column: string, value: string) => {
    const result = await adminSupabase.from(table).delete().eq(column, value);
    if (result.error && !isMissingRelationError(result.error.message, `public.${table}`)) {
      throw new Error(result.error.message);
    }
  };

  try {
    await Promise.all([
      deleteOptional("group_members", "user_id", user.id),
      deleteOptional("predictions", "user_id", user.id),
      deleteOptional("prediction_scores", "user_id", user.id),
      deleteOptional("bracket_predictions", "user_id", user.id),
      deleteOptional("projected_bracket_predictions", "user_id", user.id),
      deleteOptional("bracket_scores", "user_id", user.id),
      deleteOptional("bracket_picks", "user_id", user.id),
      deleteOptional("side_picks", "user_id", user.id),
      deleteOptional("leaderboard_events", "user_id", user.id),
      deleteOptional("leaderboard_events", "related_user_id", user.id),
      deleteOptional("leaderboard_snapshots", "user_id", user.id),
      deleteOptional("notifications", "user_id", user.id),
      deleteOptional("push_tokens", "user_id", user.id),
      deleteOptional("user_trophies", "user_id", user.id)
    ]);

    const { error: deleteProfileError } = await adminSupabase.from("users").delete().eq("id", user.id);
    if (deleteProfileError) {
      throw new Error(deleteProfileError.message);
    }

    const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(user.id);
    if (deleteAuthError) {
      throw new Error(deleteAuthError.message);
    }

    return NextResponse.json({ ok: true, message: "Your account was deleted." });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not delete your account."
      },
      { status: 400 }
    );
  }
}
