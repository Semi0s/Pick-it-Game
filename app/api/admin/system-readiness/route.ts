import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemReadinessReport } from "@/lib/system-readiness";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, message: "You must be signed in." }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      report: await getSystemReadinessReport()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Could not load system readiness."
      },
      { status: 500 }
    );
  }
}
