import { NextResponse } from "next/server";
import { canEditPrediction } from "@/lib/prediction-state";
import { getAutoPickForMatch } from "@/lib/auto-pick";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { MatchProbabilitySnapshot, MatchWithTeams } from "@/lib/types";

type MatchRow = {
  id: string;
  status: MatchWithTeams["status"];
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
};

type MatchProbabilitySnapshotRow = {
  id: string;
  match_id: string;
  source: MatchProbabilitySnapshot["source"];
  home_win_probability: number;
  draw_probability: number;
  away_win_probability: number;
  over_2_5_probability?: number | null;
  confidence?: number | null;
  source_url?: string | null;
  fetched_at: string;
};

type PredictionRow = {
  match_id: string;
};

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
    }

    const localMatches = getGroupMatches().map((match) => ({
      ...match,
      homeTeam: getTeam(match.homeTeamId),
      awayTeam: getTeam(match.awayTeamId)
    }));

    const { data: matchRows, error: matchesError } = await supabase
      .from("matches")
      .select("id,status,home_score,away_score,winner_team_id")
      .eq("stage", "group");

    if (matchesError) {
      return NextResponse.json({ ok: false, message: matchesError.message }, { status: 500 });
    }

    const rowsById = new Map(((matchRows as MatchRow[] | null) ?? []).map((row) => [row.id, row]));
    const matches = localMatches.map((match) => {
      const row = rowsById.get(match.id);
      if (!row) {
        return match;
      }

      return {
        ...match,
        status: row.status,
        homeScore: row.home_score ?? undefined,
        awayScore: row.away_score ?? undefined,
        winnerTeamId: row.winner_team_id ?? undefined
      };
    });

    const { data: predictionRows, error: predictionsError } = await supabase
      .from("predictions")
      .select("match_id")
      .eq("user_id", user.id);

    if (predictionsError) {
      return NextResponse.json({ ok: false, message: predictionsError.message }, { status: 500 });
    }

    const savedMatchIds = new Set(((predictionRows as PredictionRow[] | null) ?? []).map((row) => row.match_id));
    const openMatches = [...matches]
      .filter((match) => canEditPrediction(match.status))
      .sort((left, right) => left.kickoffTime.localeCompare(right.kickoffTime));
    const nextMatch =
      openMatches
        .filter((match) => !savedMatchIds.has(match.id))[0] ?? null;

    if (!nextMatch) {
      const message =
        openMatches.length > 0
          ? "You have already saved every open match. You can still edit any saved pick until kickoff."
          : "No open matches available right now.";

      return NextResponse.json({ ok: false, message }, { status: 404 });
    }

    const { data: snapshotRows, error: snapshotsError } = await supabase
      .from("match_probability_snapshots")
      .select(
        "id,match_id,source,home_win_probability,draw_probability,away_win_probability,over_2_5_probability,confidence,source_url,fetched_at"
      )
      .eq("match_id", nextMatch.id)
      .order("fetched_at", { ascending: false });

    if (snapshotsError) {
      return NextResponse.json({ ok: false, message: snapshotsError.message }, { status: 500 });
    }

    const snapshots: MatchProbabilitySnapshot[] = ((snapshotRows as MatchProbabilitySnapshotRow[] | null) ?? []).map(
      (row) => ({
        id: row.id,
        matchId: row.match_id,
        source: row.source,
        homeWinProbability: row.home_win_probability,
        drawProbability: row.draw_probability,
        awayWinProbability: row.away_win_probability,
        over25Probability: row.over_2_5_probability ?? null,
        confidence: row.confidence ?? null,
        sourceUrl: row.source_url ?? null,
        fetchedAt: row.fetched_at
      })
    );

    return NextResponse.json({
      ok: true,
      suggestion: getAutoPickForMatch(nextMatch, snapshots)
    });
  } catch (error) {
    console.error("Could not generate auto pick.", error);
    return NextResponse.json({ ok: false, message: "Could not generate an auto pick right now." }, { status: 500 });
  }
}
