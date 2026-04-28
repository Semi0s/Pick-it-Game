import { NextResponse } from "next/server";
import { fetchKnockoutStructureStatus } from "@/lib/bracket-predictions";

export async function GET() {
  try {
    const status = await fetchKnockoutStructureStatus();
    return NextResponse.json({ ok: true, isSeeded: status.isFullySeeded });
  } catch (error) {
    console.error("Failed to load knockout status.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load knockout status right now."
      },
      { status: 500 }
    );
  }
}
