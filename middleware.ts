import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const protectedRoutes = ["/dashboard", "/groups", "/my-groups", "/leaderboard", "/profile", "/profile-setup", "/admin", "/legal/accept"];
const LEGAL_ACCEPT_PATH = "/legal/accept";

export async function middleware(request: NextRequest) {
  if (!hasSupabaseConfig()) {
    return NextResponse.next();
  }

  const bypassReason = getAuthBypassReason(request);
  if (bypassReason) {
    console.info("Middleware bypassing auth enforcement.", {
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      bypassReason
    });
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers
    }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers
            }
          });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isProtectedRoute = protectedRoutes.some(
    (route) => request.nextUrl.pathname === route || request.nextUrl.pathname.startsWith(`${route}/`)
  );

  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (isProtectedRoute && user) {
    const legalStatus = await getLegalGateStatus(supabase, user.id);

    if (legalStatus.needsAcceptance && request.nextUrl.pathname !== LEGAL_ACCEPT_PATH) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = LEGAL_ACCEPT_PATH;
      redirectUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(redirectUrl);
    }
  }

  const isAdminRoute = request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/");

  if (isAdminRoute && user) {
    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

    if (profile?.role !== "admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (request.nextUrl.pathname === "/login" && user) {
    const requestedNext = request.nextUrl.searchParams.get("next");
    const legalStatus = await getLegalGateStatus(supabase, user.id);
    if (legalStatus.needsAcceptance) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = LEGAL_ACCEPT_PATH;
      redirectUrl.search = "";
      if (requestedNext && requestedNext.startsWith("/")) {
        redirectUrl.searchParams.set("next", requestedNext);
      }
      return NextResponse.redirect(redirectUrl);
    }

    if (requestedNext && requestedNext.startsWith("/")) {
      return NextResponse.redirect(new URL(requestedNext, request.url));
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

function getAuthBypassReason(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;

  if (pathname.startsWith("/auth/callback")) {
    return "auth-callback-path";
  }

  if (pathname.startsWith("/auth/confirm")) {
    return "auth-confirm-path";
  }

  if (pathname === "/login" && hasAuthCallbackParams(searchParams)) {
    return "login-with-auth-params";
  }

  if (hasAuthCallbackParams(searchParams)) {
    return "auth-query-params";
  }

  return null;
}

function hasAuthCallbackParams(searchParams: URLSearchParams) {
  return (
    searchParams.has("token_hash") ||
    searchParams.has("code") ||
    searchParams.has("type")
  );
}

export const config = {
  matcher: [
    "/auth/:path*",
    "/admin/:path*",
    "/dashboard/:path*",
    "/groups/:path*",
    "/my-groups/:path*",
    "/leaderboard/:path*",
    "/legal/:path*",
    "/profile/:path*",
    "/profile-setup/:path*",
    "/login"
  ]
};

async function getLegalGateStatus(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
) {
  const [{ data: document, error: documentError }, { data: acceptance, error: acceptanceError }] = await Promise.all([
    supabase
      .from("legal_documents")
      .select("required_version")
      .eq("document_type", "eula")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("user_legal_acceptances")
      .select("document_version")
      .eq("user_id", userId)
      .eq("document_type", "eula")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (isMissingLegalTableError(documentError?.message) || isMissingLegalTableError(acceptanceError?.message)) {
    return { needsAcceptance: false };
  }

  const requiredVersion = (document as { required_version?: string } | null)?.required_version ?? null;
  const acceptedVersion = (acceptance as { document_version?: string } | null)?.document_version ?? null;
  return {
    needsAcceptance: Boolean(requiredVersion && acceptedVersion !== requiredVersion)
  };
}

function isMissingLegalTableError(message?: string | null) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    (normalized.includes("legal_documents") || normalized.includes("user_legal_acceptances")) &&
    (
      normalized.includes("schema cache") ||
      normalized.includes("does not exist") ||
      normalized.includes("could not find the table")
    )
  );
}
