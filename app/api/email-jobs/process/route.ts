import { NextResponse, type NextRequest } from "next/server";
import { runEmailJobsWorker } from "@/lib/email-jobs-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  const auth = getAuthorizationState(request);

  if (!auth.authorized) {
    console.warn("[email-jobs] Unauthorized worker request rejected.", {
      method: request.method,
      path: request.nextUrl.pathname,
      source: auth.source
    });
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEmailJobsWorker(auth.source);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Email job processing failed."
      },
      { status: 500 }
    );
  }
}

function getAuthorizationState(request: NextRequest) {
  const secret = process.env.EMAIL_JOB_SECRET ?? process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  const userAgent = request.headers.get("user-agent");

  if (!secret) {
    return {
      authorized: process.env.NODE_ENV !== "production",
      source:
        vercelCronHeader ? "vercel-cron-header-no-secret"
        : authHeader ? "bearer-no-secret"
        : cronHeader ? "x-cron-secret-no-secret"
        : userAgent?.includes("vercel-cron") ? "vercel-cron-user-agent-no-secret"
        : "no-secret-configured"
    };
  }

  if (authHeader === `Bearer ${secret}`) {
    return { authorized: true, source: "bearer" };
  }

  if (cronHeader === secret) {
    return { authorized: true, source: "x-cron-secret" };
  }

  if (vercelCronHeader && userAgent?.includes("vercel-cron")) {
    return { authorized: false, source: "vercel-cron-header-without-secret-match" };
  }

  return { authorized: false, source: "unauthorized" };
}
