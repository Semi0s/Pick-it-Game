import { AppShell } from "@/components/AppShell";
import { GroupPageClient } from "@/components/GroupPageClient";
import { fetchKnockoutStructureStatus, safeFetchKnockoutStructureStatusFallback } from "@/lib/bracket-predictions";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { normalizeLanguage } from "@/lib/i18n";
import { getSafeSupabaseErrorInfo, isLikelySchemaDriftError, logSafeSupabaseError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";
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
    const adminSupabase = createAdminClient();
    const localMatches = getGroupMatches().map((match) => ({
      ...match,
      homeTeam: getTeam(match.homeTeamId),
      awayTeam: getTeam(match.awayTeamId)
    }));

    const [fullUserResult, fallbackUserResult] = await Promise.all([
      supabase
        .from("users")
        .select("id,name,email,avatar_url,home_team_id,preferred_language,role,total_points")
        .eq("id", authUser.id)
        .maybeSingle(),
      supabase
        .from("users")
        .select("id,name,email,role,total_points")
        .eq("id", authUser.id)
        .maybeSingle()
    ]);

    const userQuery = fullUserResult.error ? fallbackUserResult : fullUserResult;
    if (fullUserResult.error && fallbackUserResult.error) {
      logSafeSupabaseError("groups-page-user-load", fullUserResult.error, { userId: authUser.id });
    }

    let matchesResult;
    let predictionsResult;

    try {
      [matchesResult, predictionsResult] = await Promise.all([
        supabase
          .from("matches")
          .select("id,status,home_score,away_score,winner_team_id")
          .eq("stage", "group"),
        adminSupabase
          .from("predictions")
          .select(
            "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded,updated_at"
          )
          .eq("user_id", authUser.id)
      ]);
    } catch (error) {
      logSafeSupabaseError("groups-page-load", error, { userId: authUser.id, recoverable: true });
      if (isLikelySchemaDriftError(error, ["matches", "predictions", "bracket_predictions", "bracket_scores"])) {
        const fallbackUserRow = (userQuery.data as Partial<UserRow> | null) ?? null;
        if (fallbackUserRow) {
          initialUser = {
            id: fallbackUserRow.id ?? authUser.id,
            name: fallbackUserRow.name ?? authUser.email ?? "Player",
            email: fallbackUserRow.email ?? authUser.email ?? "",
            avatarUrl: undefined,
            homeTeamId: null,
            preferredLanguage: normalizeLanguage(null),
            role: (fallbackUserRow.role as UserProfile["role"] | undefined) ?? "player",
            totalPoints: fallbackUserRow.total_points ?? 0
          };
        }

        initialMatches = localMatches;
        initialPredictions = [];
        initialKnockoutSeeded = false;
      } else {
        const safeError = getSafeSupabaseErrorInfo(error, "Could not load My Picks right now.");
        throw new Error(`This section is temporarily unavailable while the app database is being updated. ${safeError.message}${safeError.hint ? ` Hint: ${safeError.hint}` : ""}`);
      }
    }

    const userRow = (userQuery.data as UserRow | null) ?? null;
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

    let knockoutStatusResult = safeFetchKnockoutStructureStatusFallback();
    try {
      knockoutStatusResult = await fetchKnockoutStructureStatus();
    } catch (error) {
      logSafeSupabaseError("groups-page-knockout-status", error, {
        userId: authUser.id,
        recoverable: true
      });
      knockoutStatusResult = safeFetchKnockoutStructureStatusFallback();
    }

    if (matchesResult && predictionsResult) {
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
