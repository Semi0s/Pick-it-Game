import { NextResponse } from "next/server";
import { fetchTournamentTransitionSettings } from "@/lib/tournament-transition";

export async function GET() {
  try {
    const settings = await fetchTournamentTransitionSettings();
    return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load tournament transition settings."
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
