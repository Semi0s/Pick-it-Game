import { NextResponse } from "next/server";
import { validateAccessCodeAvailability } from "@/lib/access-codes-server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; email?: string };
    const preview = (body.code ?? "").replace(/\s+/g, "").trim().toLowerCase();
    console.info("[access-code:validate] Validating access code.", {
      hasCode: Boolean(preview),
      codePreview: preview ? `${preview.slice(0, 4)}...` : null
    });

    const result = await validateAccessCodeAvailability(body.code ?? "", body.email ?? "");

    if (!result.ok) {
      console.warn("[access-code:validate] Access code unavailable.", {
        reason: result.reason
      });
      return NextResponse.json(result, { status: 200 });
    }

    const existingUserState = await getExistingAccessCodeUserState(body.email, result.code.groupId);

    console.info("[access-code:validate] Access code is available.", {
      existingAccount: existingUserState.existingAccount,
      alreadyMember: existingUserState.alreadyMember
    });
    return NextResponse.json({ ok: true, ...existingUserState }, { status: 200 });
  } catch (error) {
    console.error("Could not validate access code.", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Could not validate that code right now."
      },
      { status: 500 }
    );
  }
}

async function getExistingAccessCodeUserState(email?: string, groupId?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return { existingAccount: false, alreadyMember: false };
  }

  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    console.warn("[access-code:validate] Could not check whether account already exists.", {
      message: error.message
    });
    return { existingAccount: false, alreadyMember: false };
  }

  if (!data?.id) {
    return { existingAccount: false, alreadyMember: false };
  }

  if (!groupId) {
    return { existingAccount: true, alreadyMember: false };
  }

  const { data: member, error: memberError } = await adminSupabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", data.id)
    .maybeSingle();

  if (memberError) {
    console.warn("[access-code:validate] Could not check whether account is already in access-code group.", {
      message: memberError.message
    });
    return { existingAccount: true, alreadyMember: false };
  }

  return { existingAccount: true, alreadyMember: Boolean(member) };
}
