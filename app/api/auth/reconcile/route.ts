import { NextResponse } from "next/server";
import { reconcileInvitesForAuthUser } from "@/lib/auth-invite-reconciliation";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, message: "No authenticated user found." }, { status: 401 });
    }

    const result = await reconcileInvitesForAuthUser({
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at
    });

    console.info("Auth invite reconciliation via API route completed.", {
      userId: user.id,
      email: user.email,
      result
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Auth invite reconciliation via API route failed.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Invite reconciliation failed."
      },
      { status: 500 }
    );
  }
}
