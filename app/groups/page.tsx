import { AppShell } from "@/components/AppShell";
import { GroupPageClient } from "@/components/GroupPageClient";
import { fetchKnockoutStructureStatus } from "@/lib/bracket-predictions";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { normalizeLanguage } from "@/lib/i18n";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { MatchWithTeams, Prediction, UserProfile } from "@/lib/types";

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
  preferred_language?: string | null;
  role: UserProfile["role"];
  total_points: number;
};

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

type MatchRow = {
  id: string;
  status: MatchWithTeams["status"];
  home_score?: number | null;
  away_score?: number | null;
  winner_team_id?: string | null;
};

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: authUser }
  } = await supabase.auth.getUser();

  let initialUser: UserProfile | null = null;
  let initialMatches: MatchWithTeams[] | undefined;
  let initialPredictions: Prediction[] | undefined;
  let initialKnockoutSeeded: boolean | undefined;

  if (authUser) {
    const [userResult, matchesResult, predictionsResult, knockoutStatusResult] = await Promise.all([
      supabase
        .from("users")
        .select("id,name,email,avatar_url,home_team_id,preferred_language,role,total_points")
        .eq("id", authUser.id)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("id,status,home_score,away_score,winner_team_id")
        .eq("stage", "group"),
      supabase
        .from("predictions")
        .select(
          "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded,updated_at"
        )
        .eq("user_id", authUser.id),
      fetchKnockoutStructureStatus()
    ]);

    const userRow = userResult.data as UserRow | null;
    if (userRow) {
      initialUser = {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        avatarUrl: userRow.avatar_url ?? undefined,
        homeTeamId: userRow.home_team_id ?? null,
        preferredLanguage: normalizeLanguage(userRow.preferred_language),
        role: userRow.role,
        totalPoints: userRow.total_points
      };
    }

    const localMatches = getGroupMatches().map((match) => ({
      ...match,
      homeTeam: getTeam(match.homeTeamId),
      awayTeam: getTeam(match.awayTeamId)
    }));
    const liveRowsById = new Map(((matchesResult.data ?? []) as MatchRow[]).map((row) => [row.id, row]));
    initialMatches = localMatches.map((match) => {
      const row = liveRowsById.get(match.id);
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

    initialPredictions = ((predictionsResult.data ?? []) as PredictionRow[]).map((row) => ({
      id: row.id,
      userId: row.user_id,
      matchId: row.match_id,
      predictedWinnerTeamId: row.predicted_winner_team_id ?? undefined,
      predictedIsDraw: row.predicted_is_draw,
      predictedHomeScore: row.predicted_home_score ?? undefined,
      predictedAwayScore: row.predicted_away_score ?? undefined,
      pointsAwarded: row.points_awarded ?? 0,
      updatedAt: row.updated_at ?? undefined
    }));

    initialKnockoutSeeded = knockoutStatusResult.isFullySeeded;
  }

  return (
    <AppShell>
      <GroupPageClient
        initialUser={initialUser}
        initialMatches={initialMatches}
        initialPredictions={initialPredictions}
        initialKnockoutSeeded={initialKnockoutSeeded}
      />
    </AppShell>
  );
}
