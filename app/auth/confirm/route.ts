import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const DEFAULT_NEXT_PATH = "/reset-password";

type SupportedOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export async function GET(request: NextRequest) {
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
  const cookieBuffer: Array<{ name: string; value: string; options: CookieOptions }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookieBuffer.push(...cookiesToSet);
        }
      }
    }
  );

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as SupportedOtpType | null;

  let errorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("Failed to exchange auth code for session during confirmation.", error);
      errorMessage = error.message;
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type
    });

    if (error) {
      console.error("Failed to verify OTP during confirmation.", error);
      errorMessage = error.message;
    }
  } else {
    errorMessage = "This link is missing required recovery details. Request a new password reset email.";
  }

  const redirectUrl = new URL(nextPath, request.url);
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
