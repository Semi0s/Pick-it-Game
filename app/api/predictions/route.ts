import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_winner_team_id?: string | null;
  predicted_is_draw: boolean;
  predicted_home_score?: number | null;
  predicted_away_score?: number | null;
  points_awarded?: number | null;
  updated_at?: string | null;
};

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, message: "You must be signed in to load predictions." }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("predictions")
      .select(
        "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded,updated_at"
      )
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to load current user predictions via API route.", { userId: user.id, error });
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      predictions: ((data ?? []) as PredictionRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        matchId: row.match_id,
        predictedWinnerTeamId: row.predicted_winner_team_id ?? undefined,
        predictedIsDraw: row.predicted_is_draw,
        predictedHomeScore: row.predicted_home_score ?? undefined,
        predictedAwayScore: row.predicted_away_score ?? undefined,
        pointsAwarded: row.points_awarded ?? 0,
        updatedAt: row.updated_at ?? undefined
      }))
    });
  } catch (error) {
    console.error("Unexpected predictions API failure.", error);
    return NextResponse.json({ ok: false, message: "Could not load predictions." }, { status: 500 });
  }
}
