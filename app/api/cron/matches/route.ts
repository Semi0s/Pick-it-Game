import { NextResponse, type NextRequest } from "next/server";
import { runMatchSyncJob } from "@/app/api/sync/matches/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleMatchCronRequest(request);
}

export async function POST(request: NextRequest) {
  return handleMatchCronRequest(request);
}

async function handleMatchCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (!cronSecret || bearerToken !== cronSecret) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMatchSyncJob();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Match sync failed."
      },
      { status: 500 }
    );
  }
}
