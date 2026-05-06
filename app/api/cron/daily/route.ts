import { NextResponse, type NextRequest } from "next/server";
import { runEmailJobsWorker } from "@/app/api/email-jobs/process/route";
import { runMatchSyncJob } from "@/app/api/sync/matches/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleDailyCronRequest(request);
}

export async function POST(request: NextRequest) {
  return handleDailyCronRequest(request);
}

async function handleDailyCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim() ?? "";
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  if (!cronSecret || bearerToken !== cronSecret) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const [emailJobs, matchSync] = await Promise.allSettled([
    runEmailJobsWorker("vercel-cron"),
    runMatchSyncJob()
  ]);

  const emailJobsResult =
    emailJobs.status === "fulfilled"
      ? emailJobs.value
      : { ok: false, message: emailJobs.reason instanceof Error ? emailJobs.reason.message : "Email job processing failed." };

  const matchSyncResult =
    matchSync.status === "fulfilled"
      ? matchSync.value
      : { ok: false, message: matchSync.reason instanceof Error ? matchSync.reason.message : "Match sync failed." };

  const ok =
    emailJobs.status === "fulfilled" &&
    matchSync.status === "fulfilled" &&
    emailJobsResult.ok !== false &&
    matchSyncResult.ok !== false;

  return NextResponse.json(
    {
      ok,
      emailJobs: emailJobsResult,
      matchSync: matchSyncResult
    },
    { status: ok ? 200 : 500 }
  );
}
