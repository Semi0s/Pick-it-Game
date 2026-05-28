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

    const existingAccount = await hasExistingAppUser(body.email);

    console.info("[access-code:validate] Access code is available.", {
      existingAccount
    });
    return NextResponse.json({ ok: true, existingAccount }, { status: 200 });
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

async function hasExistingAppUser(email?: string) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
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
    return false;
  }

  return Boolean(data);
}
