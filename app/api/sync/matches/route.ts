import { NextResponse, type NextRequest } from "next/server";
import { syncMatches } from "@/lib/match-sync/syncMatches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleSyncRequest(request);
}

export async function POST(request: NextRequest) {
  return handleSyncRequest(request);
}

export async function runMatchSyncJob() {
  return syncMatches();
}

async function handleSyncRequest(request: NextRequest) {
  const configuredSecret = process.env.MATCH_SYNC_SECRET?.trim() ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  const requestSecret = request.headers.get("x-match-sync-secret")?.trim() ?? "";
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  const authorized =
    (configuredSecret && requestSecret === configuredSecret) ||
    (cronSecret && bearerToken === cronSecret) ||
    (configuredSecret && bearerToken === configuredSecret);

  if (!authorized) {
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
