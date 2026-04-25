import { createAdminClient } from "@/lib/supabase/admin";

type LeaderboardSnapshotRow = {
  match_id: string;
  user_id: string;
  group_id?: string | null;
  rank: number;
  total_points: number;
  created_at: string;
};

export type GlobalLeaderboardRankMovement = {
  user_id: string;
  current_rank: number;
  previous_rank: number | null;
  rank_delta: number | null;
  current_points: number;
  previous_points: number | null;
  points_delta: number | null;
};

export type GroupLeaderboardRankMovement = GlobalLeaderboardRankMovement;

export async function fetchGlobalLeaderboardRankMovement(
  matchId: string
): Promise<GlobalLeaderboardRankMovement[]> {
  return fetchScopedLeaderboardRankMovement({ scopeType: "global", matchId });
}

export async function fetchGroupLeaderboardRankMovement(
  matchId: string,
  groupId: string
): Promise<GroupLeaderboardRankMovement[]> {
  return fetchScopedLeaderboardRankMovement({ scopeType: "group", matchId, groupId });
}

async function fetchScopedLeaderboardRankMovement({
  scopeType,
  matchId,
  groupId
}: {
  scopeType: "global" | "group";
  matchId: string;
  groupId?: string;
}): Promise<GlobalLeaderboardRankMovement[]> {
  const adminSupabase = createAdminClient();
  const trimmedMatchId = matchId.trim();
  const trimmedGroupId = groupId?.trim();

  if (!trimmedMatchId || (scopeType === "group" && !trimmedGroupId)) {
    return [];
  }

  let currentSnapshotQuery = adminSupabase
    .from("leaderboard_snapshots")
    .select("match_id,user_id,group_id,rank,total_points,created_at")
    .eq("scope_type", scopeType)
    .eq("match_id", trimmedMatchId)
    .order("rank", { ascending: true });

  currentSnapshotQuery =
    scopeType === "group"
      ? currentSnapshotQuery.eq("group_id", trimmedGroupId!)
      : currentSnapshotQuery.is("group_id", null);

  const { data: currentSnapshotData, error: currentSnapshotError } = await currentSnapshotQuery.order("user_id", {
    ascending: true
  });

  if (currentSnapshotError) {
    throw new Error(currentSnapshotError.message);
  }

  const currentSnapshots = (currentSnapshotData as LeaderboardSnapshotRow[] | null) ?? [];
  if (currentSnapshots.length === 0) {
    return [];
  }

  const currentSnapshotCreatedAt = currentSnapshots[0]?.created_at;
  if (!currentSnapshotCreatedAt) {
    return currentSnapshots.map((snapshot) => ({
      user_id: snapshot.user_id,
      current_rank: snapshot.rank,
      previous_rank: null,
      rank_delta: null,
      current_points: snapshot.total_points,
      previous_points: null,
      points_delta: null
    }));
  }

  let previousSnapshotCandidatesQuery = adminSupabase
    .from("leaderboard_snapshots")
    .select("match_id,group_id,created_at")
    .eq("scope_type", scopeType)
    .lt("created_at", currentSnapshotCreatedAt)
    .order("created_at", { ascending: false })
    .limit(500);

  previousSnapshotCandidatesQuery =
    scopeType === "group"
      ? previousSnapshotCandidatesQuery.eq("group_id", trimmedGroupId!)
      : previousSnapshotCandidatesQuery.is("group_id", null);

  const {
    data: previousSnapshotCandidates,
    error: previousSnapshotCandidatesError
  } = await previousSnapshotCandidatesQuery;

  if (previousSnapshotCandidatesError) {
    throw new Error(previousSnapshotCandidatesError.message);
  }

  const previousMatchId =
    (
      (previousSnapshotCandidates as Pick<LeaderboardSnapshotRow, "match_id" | "group_id" | "created_at">[] | null) ??
      []
    ).find(
      (row) => row.match_id !== trimmedMatchId
    )?.match_id ?? null;

  if (!previousMatchId) {
    return currentSnapshots.map((snapshot) => ({
      user_id: snapshot.user_id,
      current_rank: snapshot.rank,
      previous_rank: null,
      rank_delta: null,
      current_points: snapshot.total_points,
      previous_points: null,
      points_delta: null
    }));
  }

  let previousSnapshotQuery = adminSupabase
    .from("leaderboard_snapshots")
    .select("match_id,user_id,group_id,rank,total_points,created_at")
    .eq("scope_type", scopeType)
    .eq("match_id", previousMatchId);

  previousSnapshotQuery =
    scopeType === "group"
      ? previousSnapshotQuery.eq("group_id", trimmedGroupId!)
      : previousSnapshotQuery.is("group_id", null);

  const { data: previousSnapshotData, error: previousSnapshotError } = await previousSnapshotQuery;

  if (previousSnapshotError) {
    throw new Error(previousSnapshotError.message);
  }

  const previousSnapshots = new Map(
    (((previousSnapshotData as LeaderboardSnapshotRow[] | null) ?? []).map((snapshot) => [
      snapshot.user_id,
      snapshot
    ]))
  );

  return currentSnapshots.map((snapshot) => {
    const previousSnapshot = previousSnapshots.get(snapshot.user_id) ?? null;
    const previousRank = previousSnapshot?.rank ?? null;
    const previousPoints = previousSnapshot?.total_points ?? null;

    return {
      user_id: snapshot.user_id,
      current_rank: snapshot.rank,
      previous_rank: previousRank,
      rank_delta: previousRank === null ? null : previousRank - snapshot.rank,
      current_points: snapshot.total_points,
      previous_points: previousPoints,
      points_delta: previousPoints === null ? null : snapshot.total_points - previousPoints
    };
  });
}
