import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getAccessCodeBlockedMessage, getAccessCodeFailureReasonFromMessage } from "@/lib/access-codes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type RedeemAccessCodeRow = {
  code_id: string;
  group_id: string | null;
  already_redeemed: boolean;
  already_member: boolean;
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
    const { data, error } = await adminSupabase.rpc("redeem_access_code_for_existing_user", {
      auth_email: user.email,
      auth_user_id: user.id,
      raw_code: code
    });

    if (error) {
      console.warn("[access-code:redeem] Existing user redemption failed.", {
        userId: user.id,
        message: error.message
      });
      const reason = getAccessCodeFailureReasonFromMessage(error.message) ?? "redemption_failed";
      const message =
        reason === "redemption_failed"
          ? "That code looked valid, but we could not finish joining the group."
          : getAccessCodeBlockedMessage(reason);
      return NextResponse.json({ ok: false, message }, { status: 400 });
    }

    const row = Array.isArray(data) ? (data[0] as RedeemAccessCodeRow | undefined) : (data as RedeemAccessCodeRow | null);
    revalidatePath("/dashboard");
    revalidatePath("/my-groups");
    revalidatePath("/groups");
    revalidatePath("/leaderboard");
    revalidatePath("/profile");

    return NextResponse.json({
      ok: true,
      groupId: row?.group_id ?? null,
      alreadyMember: Boolean(row?.already_member),
      alreadyRedeemed: Boolean(row?.already_redeemed),
      message: row?.already_member
        ? "You are already in that group. No new account is needed."
        : row?.group_id
          ? "Group joined."
          : "Invite code applied."
    });
  } catch (error) {
    console.error("[access-code:redeem] Existing user redemption crashed.", error);
    return NextResponse.json(
      { ok: false, message: "That code looked valid, but we could not finish joining the group." },
      { status: 500 }
    );
  }
}
