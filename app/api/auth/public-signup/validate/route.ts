import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const EXISTING_ACCOUNT_MESSAGE =
  "That email already has account state in PICK-IT. Sign in or reset your password. If you recently deleted your profile, signing in will restore free Player access when possible.";

type PublicSignupValidateBody = {
  email?: string;
};

type AuthUserSummary = {
  id: string;
  email?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublicSignupValidateBody;
    const normalizedEmail = body.email?.trim().toLowerCase() ?? "";

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const [authUser, appProfileResult] = await Promise.all([
      findAuthUserByEmail(adminSupabase, normalizedEmail),
      adminSupabase.from("users").select("id").eq("email", normalizedEmail).maybeSingle()
    ]);

    if (appProfileResult.error) {
      throw new Error(appProfileResult.error.message);
    }

    const hasExistingAccountState = Boolean(authUser || appProfileResult.data);
    return NextResponse.json({
      ok: true,
      existingAccount: hasExistingAccountState,
      message: hasExistingAccountState ? EXISTING_ACCOUNT_MESSAGE : null
    });
  } catch (error) {
    console.error("Could not validate public signup account state.", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Could not verify free Player signup right now. Try again or contact support."
      },
      { status: 500 }
    );
  }
}

async function findAuthUserByEmail(
  adminSupabase: ReturnType<typeof createAdminClient>,
  normalizedEmail: string
): Promise<AuthUserSummary | null> {
  let page = 1;

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(error.message);
    }

    const matchedUser = data.users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail);
    if (matchedUser) {
      return {
        id: matchedUser.id,
        email: matchedUser.email
      };
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}
