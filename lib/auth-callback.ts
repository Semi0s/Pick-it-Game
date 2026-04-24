import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { reconcileInvitesForAuthUser } from "@/lib/auth-invite-reconciliation";

const DEFAULT_NEXT_PATH = "/reset-password";

type SupportedOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export async function handleAuthCallback(nextRequest: NextRequest) {
  const nextPath = getSafeNextPath(nextRequest.nextUrl.searchParams.get("next"));
  const cookieBuffer: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return nextRequest.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookieBuffer.push(...cookiesToSet);
      }
    }
  });

  const code = nextRequest.nextUrl.searchParams.get("code");
  const tokenHash = nextRequest.nextUrl.searchParams.get("token_hash");
  const type = nextRequest.nextUrl.searchParams.get("type") as SupportedOtpType | null;

  console.info("Auth callback received.", {
    pathname: nextRequest.nextUrl.pathname,
    nextPath,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type
  });

  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    console.info("exchangeCodeForSession completed.", { ok: !error, message: error?.message ?? null });
    if (error) {
      console.error("Failed to exchange auth code for session during callback.", error);
      errorMessage = error.message;
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type
    });

    console.info("verifyOtp completed.", { ok: !error, type, message: error?.message ?? null });
    if (error) {
      console.error("Failed to verify OTP during callback.", error);
      errorMessage = error.message;
    }
  } else {
    errorMessage = "This link is missing required confirmation details. Request a new email and try again.";
  }

  if (!errorMessage) {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Auth callback could not load the authenticated user after exchange.", userError);
      errorMessage = userError?.message ?? "Could not load the confirmed user session.";
    } else {
      try {
        const reconciliationResult = await reconcileInvitesForAuthUser({
          id: user.id,
          email: user.email,
          email_confirmed_at: user.email_confirmed_at
        });

        console.info("Auth callback invite reconciliation completed.", {
          userId: user.id,
          email: user.email,
          result: reconciliationResult
        });
      } catch (reconciliationError) {
        console.error("Auth callback invite reconciliation failed.", reconciliationError);
        errorMessage =
          reconciliationError instanceof Error ? reconciliationError.message : "Could not reconcile pending invites.";
      }
    }
  }

  const redirectUrl = new URL(nextPath, nextRequest.url);
  if (errorMessage) {
    redirectUrl.searchParams.set("error", errorMessage);
  }

  const response = NextResponse.redirect(redirectUrl);
  cookieBuffer.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) {
    return DEFAULT_NEXT_PATH;
  }

  return value;
}
