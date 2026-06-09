import { NextResponse } from "next/server";
import { fetchPublicPlayerSignupStatus } from "@/lib/public-player-signup";

export async function GET() {
  try {
    const status = await fetchPublicPlayerSignupStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    console.error("Could not load public Player signup status.", error);
    return NextResponse.json(
      {
        ok: false,
        enabled: false,
        defaultGroupId: null,
        defaultGroupName: "FIFA 2026 Predictions",
        defaultTier: "player",
        message: "Free Player signup is not ready yet. Try an invite or access code, or contact support."
      },
      { status: 500 }
    );
  }
}
