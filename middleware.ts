import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const protectedRoutes = ["/dashboard", "/groups", "/leaderboard", "/profile", "/admin"];

export async function middleware(request: NextRequest) {
  if (!hasSupabaseConfig()) {
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

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/groups/:path*",
    "/leaderboard/:path*",
    "/profile/:path*",
    "/login"
  ]
};
