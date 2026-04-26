"use client";

import { demoUsers } from "@/lib/mock-data";
import { getAllStoredPredictions } from "@/lib/prediction-store";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import type { Prediction, UserProfile, UserTrophy } from "@/lib/types";

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  home_team_id?: string | null;
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
  points_awarded: number;
};

type LeaderboardEntryRow = {
  user_id: string;
  total_points: number;
  rank: number;
};

type UserTrophyRow = {
  awarded_at: string;
  trophies:
    | {
        id: string;
        key: string;
        name: string;
        description: string;
        icon: string;
        tier?: "bronze" | "silver" | "gold" | "special" | null;
      }
    | {
        id: string;
        key: string;
        name: string;
        description: string;
        icon: string;
        tier?: "bronze" | "silver" | "gold" | "special" | null;
      }[]
    | null;
};

export type SocialPrediction = Prediction & {
  user: UserProfile;
};

export async function fetchPredictionsForMatches(matchIds: string[]): Promise<SocialPrediction[]> {
  if (matchIds.length === 0) {
    return [];
  }

  if (!hasSupabaseConfig()) {
    return getLocalSocialPredictions().filter((prediction) => matchIds.includes(prediction.matchId));
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("predictions")
      .select("id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded")
      .in("match_id", matchIds)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return mapPredictionRowsWithUsers(supabase, (data as PredictionRow[]) ?? []);
  } catch (error) {
    console.error("Failed to load public predictions for matches.", error);
    throw error;
  }
}

export async function fetchPredictionsForUser(userId: string): Promise<SocialPrediction[]> {
  if (!hasSupabaseConfig()) {
    return getLocalSocialPredictions().filter((prediction) => prediction.userId === userId);
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("predictions")
      .select("id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded")
      .eq("user_id", userId)
      .order("match_id", { ascending: true });

    if (error) {
      throw error;
    }

    return mapPredictionRowsWithUsers(supabase, (data as PredictionRow[]) ?? []);
  } catch (error) {
    console.error(`Failed to load public predictions for user ${userId}.`, error);
    throw error;
  }
}

export async function fetchLeaderboardUsers(): Promise<UserProfile[]> {
  if (!hasSupabaseConfig()) {
    return [...demoUsers].sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
  }

  try {
    const supabase = createClient();
    const { data: leaderboardData, error: leaderboardError } = await supabase
      .from("leaderboard_entries")
      .select("user_id,total_points,rank")
      .order("rank", { ascending: true })
      .order("total_points", { ascending: false });

    if (!leaderboardError && leaderboardData && leaderboardData.length > 0) {
      const usersById = await fetchUsersByIds(
        supabase,
        (leaderboardData as LeaderboardEntryRow[]).map((entry) => entry.user_id)
      );

      return (leaderboardData as LeaderboardEntryRow[])
        .map((entry) => {
          const joinedUser = usersById.get(entry.user_id);
          return joinedUser ? { ...mapUserRow(joinedUser), totalPoints: entry.total_points } : null;
        })
        .filter(Boolean) as UserProfile[];
    }

    const { data, error } = await supabase
      .from("users")
      .select("id,name,email,avatar_url,home_team_id,role,total_points")
      .order("total_points", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data as UserRow[]).map(mapUserRow);
  } catch (error) {
    console.error("Failed to load leaderboard users.", error);
    throw error;
  }
}

export async function fetchTrophiesForUser(userId: string): Promise<UserTrophy[]> {
  if (!hasSupabaseConfig() || !userId.trim()) {
    return [];
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_trophies")
      .select("awarded_at,trophies(id,key,name,description,icon,tier)")
      .eq("user_id", userId)
      .order("awarded_at", { ascending: false });

    if (error) {
      throw error;
    }

    return ((data as UserTrophyRow[] | null) ?? [])
      .map((row) => ({
        ...row,
        trophies: Array.isArray(row.trophies) ? (row.trophies[0] ?? null) : row.trophies
      }))
      .filter((row) => row.trophies)
      .map((row) => ({
        id: row.trophies!.id,
        key: row.trophies!.key,
        name: row.trophies!.name,
        description: row.trophies!.description,
        icon: row.trophies!.icon,
        tier: row.trophies!.tier ?? "special",
        awardedAt: row.awarded_at
      }));
  } catch (error) {
    console.error(`Failed to load trophies for user ${userId}.`, error);
    return [];
  }
}

function getLocalSocialPredictions(): SocialPrediction[] {
  return getAllStoredPredictions()
    .map((prediction) => {
      const user = demoUsers.find((profile) => profile.id === prediction.userId);
      return user ? { ...prediction, user } : null;
    })
    .filter(Boolean) as SocialPrediction[];
}

async function mapPredictionRowsWithUsers(
  supabase: ReturnType<typeof createClient>,
  rows: PredictionRow[]
): Promise<SocialPrediction[]> {
  const usersById = await fetchUsersByIds(
    supabase,
    rows.map((row) => row.user_id)
  );

  return rows
    .map((row) => {
      const user = usersById.get(row.user_id);
      if (!user) {
        return null;
      }

      return {
        id: row.id,
        userId: row.user_id,
        matchId: row.match_id,
        predictedWinnerTeamId: row.predicted_winner_team_id ?? undefined,
        predictedIsDraw: row.predicted_is_draw,
        predictedHomeScore: row.predicted_home_score ?? undefined,
        predictedAwayScore: row.predicted_away_score ?? undefined,
        pointsAwarded: row.points_awarded,
        user: mapUserRow(user)
      };
    })
    .filter(Boolean) as SocialPrediction[];
}

async function fetchUsersByIds(
  supabase: ReturnType<typeof createClient>,
  userIds: string[]
): Promise<Map<string, UserRow>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("users")
    .select("id,name,email,avatar_url,home_team_id,role,total_points")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map(((data as UserRow[]) ?? []).map((user) => [user.id, user]));
}

function mapUserRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    homeTeamId: row.home_team_id ?? null,
    role: row.role,
    totalPoints: row.total_points
  };
}
