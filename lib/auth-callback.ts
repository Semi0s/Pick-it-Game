import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { reconcileInvitesForAuthUser } from "@/lib/auth-invite-reconciliation";
import { appendLanguageToPath, normalizeLanguage } from "@/lib/i18n";
import { getSupabaseClientEnv } from "@/lib/supabase/env";

const DEFAULT_NEXT_PATH = "/reset-password";

type SupportedOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export async function handleAuthCallback(nextRequest: NextRequest) {
  const nextPath = getSafeNextPath(nextRequest.nextUrl.searchParams.get("next"));
  const requestedLanguage = nextRequest.nextUrl.searchParams.get("lang");
  const cookieBuffer: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const { supabaseUrl, supabaseAnonKey } = getSupabaseClientEnv();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
  const authError = nextRequest.nextUrl.searchParams.get("error");
  const authErrorCode = nextRequest.nextUrl.searchParams.get("error_code");
  const authErrorDescription = nextRequest.nextUrl.searchParams.get("error_description");

  console.info("Auth callback received.", {
    pathname: nextRequest.nextUrl.pathname,
    search: nextRequest.nextUrl.search,
    nextPath,
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type,
    authError,
    authErrorCode,
    hasAuthErrorDescription: Boolean(authErrorDescription)
  });

  let errorMessage: string | null = null;
  let confirmedUserEmail: string | null = null;
  let confirmedAt: string | null = null;

  if (authError || authErrorDescription) {
    errorMessage = authErrorDescription ?? authError ?? "Supabase returned an authentication error.";
    console.error("Supabase callback returned an explicit error.", {
      authError,
      authErrorCode,
      authErrorDescription
    });
  } else if (code) {
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
    } else if (!user.email_confirmed_at) {
      confirmedUserEmail = user.email ?? null;
      confirmedAt = user.email_confirmed_at ?? null;
      console.warn("Auth callback resolved a user session, but the email is still unconfirmed.", {
        userId: user.id,
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at ?? null
      });
      errorMessage = "Supabase did not confirm this email. Request a new confirmation email and try again.";
    } else {
      confirmedUserEmail = user.email ?? null;
      confirmedAt = user.email_confirmed_at ?? null;
      console.info("Auth callback confirmed user session.", {
        userId: user.id,
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at ?? null
      });
      try {
        if (requestedLanguage) {
          const normalizedLanguage = normalizeLanguage(requestedLanguage);
          const { error: languageUpdateError } = await supabase
            .from("users")
            .update({ preferred_language: normalizedLanguage })
            .eq("id", user.id);

          if (languageUpdateError) {
            console.warn("Auth callback could not persist preferred language.", {
              userId: user.id,
              language: normalizedLanguage,
              message: languageUpdateError.message
            });
          }
        }

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

  const redirectPath = requestedLanguage
    ? appendLanguageToPath(errorMessage ? removeConfirmedFlag(nextPath) : nextPath, requestedLanguage)
    : errorMessage
      ? removeConfirmedFlag(nextPath)
      : nextPath;
  const redirectUrl = new URL(redirectPath, nextRequest.url);
  if (errorMessage) {
    redirectUrl.searchParams.set("error", errorMessage);
  }

  console.info("Auth callback redirecting.", {
    redirectTo: `${redirectUrl.pathname}${redirectUrl.search}`,
    confirmedUserEmail,
    confirmedAt,
    hasError: Boolean(errorMessage)
  });

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

function removeConfirmedFlag(path: string) {
  const [pathname, search = ""] = path.split("?");
  if (!search) {
    return pathname;
  }

  const params = new URLSearchParams(search);
  params.delete("confirmed");
  const nextSearch = params.toString();
  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}
