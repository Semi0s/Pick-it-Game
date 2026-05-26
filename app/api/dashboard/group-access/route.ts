import { NextResponse } from "next/server";
import { fetchDashboardGroupAccessDataForCurrentUser } from "@/lib/dashboard-group-access";

export async function GET() {
  try {
    const result = await fetchDashboardGroupAccessDataForCurrentUser();
    return NextResponse.json(result, { status: result.ok ? 200 : 401 });
  } catch (error) {
    console.error("Failed to load dashboard group access.", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load dashboard group access."
      },
      { status: 500 }
    );
  }
}
