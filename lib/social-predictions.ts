"use client";

import { demoUsers } from "@/lib/mock-data";
import { getAllStoredPredictions } from "@/lib/prediction-store";
import { createClient } from "@/lib/supabase/client";
import type { Prediction, UserProfile } from "@/lib/types";

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
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
  users?: UserRow | UserRow[] | null;
};

export type SocialPrediction = Prediction & {
  user: UserProfile;
};

export async function fetchPredictionsForMatches(matchIds: string[]): Promise<SocialPrediction[]> {
  if (matchIds.length === 0) {
    return [];
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("predictions")
      .select(
        "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded,users:user_id(id,name,email,avatar_url,role,total_points)"
      )
      .in("match_id", matchIds)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data as PredictionRow[]).map(mapPredictionRow).filter(Boolean) as SocialPrediction[];
  } catch {
    return getLocalSocialPredictions().filter((prediction) => matchIds.includes(prediction.matchId));
  }
}

export async function fetchPredictionsForUser(userId: string): Promise<SocialPrediction[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("predictions")
      .select(
        "id,user_id,match_id,predicted_winner_team_id,predicted_is_draw,predicted_home_score,predicted_away_score,points_awarded,users:user_id(id,name,email,avatar_url,role,total_points)"
      )
      .eq("user_id", userId)
      .order("match_id", { ascending: true });

    if (error) {
      throw error;
    }

    return (data as PredictionRow[]).map(mapPredictionRow).filter(Boolean) as SocialPrediction[];
  } catch {
    return getLocalSocialPredictions().filter((prediction) => prediction.userId === userId);
  }
}

export async function fetchLeaderboardUsers(): Promise<UserProfile[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("users")
      .select("id,name,email,avatar_url,role,total_points")
      .order("total_points", { ascending: false })
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data as UserRow[]).map(mapUserRow);
  } catch {
    return [...demoUsers].sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
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

function mapPredictionRow(row: PredictionRow): SocialPrediction | null {
  const joinedUser = Array.isArray(row.users) ? row.users[0] : row.users;
  if (!joinedUser) {
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
    user: mapUserRow(joinedUser)
  };
}

function mapUserRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    role: row.role,
    totalPoints: row.total_points
  };
}
