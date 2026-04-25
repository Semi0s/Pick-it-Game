import { NextResponse } from "next/server";
import type { LeaderboardSwitcherView } from "@/lib/leaderboard-data";
import { fetchLeaderboardPageData } from "@/lib/leaderboard-data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const leaderboardData = await fetchLeaderboardPageData({
      view: (url.searchParams.get("view") as LeaderboardSwitcherView | null) ?? undefined,
      groupId: url.searchParams.get("groupId") ?? undefined,
      managerId: url.searchParams.get("managerId") ?? undefined
    });
    return NextResponse.json({ ok: true, ...leaderboardData });
  } catch (error) {
    console.error("Failed to load leaderboard API data.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load the leaderboard right now."
      },
      { status: 500 }
    );
  }
}
