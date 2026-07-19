import { fetchUserBracketScores } from "./bracket-predictions";
import type {
  ChampionshipFinaleSummary
} from "./championship-finale-types";
import {
  buildChampionshipBadges,
  deriveChampionshipFinaleState,
  deriveFinalePercentile,
  deriveFinaleTopPercent,
  summarizeBestRound
} from "./championship-finale-logic";
import {
  fetchGlobalLeaderboardRows,
  fetchLeaderboardSwitcherContext,
  type LeaderboardGroupNavItem
} from "./leaderboard-data";
import { normalizeKnockoutStageForMatch } from "./match-stage";
import { fetchTournamentTransitionSettings } from "./tournament-transition";
import type { BracketScore } from "./types";
import { createAdminClient } from "./supabase/admin";
import { fetchLeaderboardFeatureSettings } from "./app-settings";

type MatchPreviewRow = {
  id: string;
  stage?: string | null;
  status?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  finalized_at?: string | null;
  last_synced_at?: string | null;
  updated_at?: string | null;
};

type TeamPreviewRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

export async function fetchChampionshipFinaleSummary(userId: string): Promise<ChampionshipFinaleSummary | null> {
  const [settings, transitionSettings] = await Promise.all([
    fetchLeaderboardFeatureSettings(),
    fetchTournamentTransitionSettings().catch(() => null)
  ]);
  const [globalRows, switcher, bracketScores] = await Promise.all([
    fetchGlobalLeaderboardRows("global_top10", settings.perfect_pick_enabled, "official"),
    fetchLeaderboardSwitcherContext(),
    fetchUserBracketScores(userId).catch(() => [])
  ]);

  if (globalRows.length === 0) {
    return null;
  }

  const currentUserRow = globalRows.find((row) => row.id === userId);
  if (!currentUserRow) {
    return null;
  }

  const champion = globalRows[0] ?? null;
  const bestGroup = selectBestGroupFinish([...switcher.joinedGroups, ...switcher.managedGroups]);
  const finalRank = currentUserRow.rank ?? globalRows.findIndex((row) => row.id === userId) + 1;
  const totalPlayers = globalRows.length;
  const playersBeaten = Math.max(totalPlayers - finalRank, 0);
  const percentile = deriveFinalePercentile(finalRank, totalPlayers);
  const topPercent = deriveFinaleTopPercent(finalRank, totalPlayers);
  const badges = buildChampionshipBadges({
    finalRank,
    totalPlayers,
    bestGroupRank: bestGroup?.rank ?? null
  });
  const bestRound = summarizeBestRound(bracketScores);
  const biggestPick = await fetchBiggestPickLabel(bracketScores);
  const finalMatchState = await fetchFinalMatchState();
  const finalizedAt = finalMatchState?.finalizedAt ?? (await fetchFinalizedTimestamp());
  const finaleState = deriveChampionshipFinaleState({
    transitionModality: transitionSettings?.modality ?? null,
    hasFinalMatchResult: finalMatchState?.isFinal ?? false
  });

  return {
    isFinalized: finaleState.isFinalized,
    isPendingVerification: finaleState.isPendingVerification,
    finalizedAt,
    champion: champion
      ? {
          userId: champion.id,
          name: champion.name,
          score: champion.totalPoints,
          rank: champion.rank
        }
      : null,
    user: {
      userId,
      displayName: currentUserRow.name,
      finalRank,
      totalPlayers,
      finalScore: currentUserRow.totalPoints,
      playersBeaten,
      percentile,
      topPercent,
      bestGroupRank: bestGroup?.rank ?? null,
      bestGroupName: bestGroup?.label ?? null,
      bestGroupTotalPlayers: bestGroup?.totalPlayers ?? null,
      bestRound,
      biggestPick,
      badges
    }
  };
}

async function fetchFinalMatchState() {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,status,finalized_at,last_synced_at,updated_at")
    .or("stage.eq.final,id.eq.final-01,id.eq.M104");

  if (error) {
    return null;
  }

  const finalMatch = ((data as MatchPreviewRow[] | null) ?? [])
    .filter((match) => normalizeKnockoutStageForMatch({ stage: match.stage, matchId: match.id }) === "final")
    .sort((left, right) => {
      const leftTimestamp = left.finalized_at ?? left.last_synced_at ?? left.updated_at ?? "";
      const rightTimestamp = right.finalized_at ?? right.last_synced_at ?? right.updated_at ?? "";
      return rightTimestamp.localeCompare(leftTimestamp);
    })[0];

  if (!finalMatch) {
    return null;
  }

  return {
    isFinal: finalMatch.status === "final",
    finalizedAt: finalMatch.finalized_at ?? finalMatch.last_synced_at ?? finalMatch.updated_at ?? null
  };
}

async function fetchFinalizedTimestamp() {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("bracket_scores")
    .select("scored_at")
    .order("scored_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return (data as { scored_at?: string | null } | null)?.scored_at ?? null;
}

async function fetchBiggestPickLabel(scores: BracketScore[]) {
  const topScore = [...scores]
    .filter((score) => score.isCorrect && (score.points ?? 0) > 0)
    .sort((left, right) => (right.points ?? 0) - (left.points ?? 0) || right.scoredAt.localeCompare(left.scoredAt))[0];

  if (!topScore) {
    return null;
  }

  const adminSupabase = createAdminClient();
  const { data: matchData, error: matchError } = await adminSupabase
    .from("matches")
    .select("id,home_team_id,away_team_id")
    .eq("id", topScore.matchId)
    .maybeSingle();

  if (matchError || !matchData) {
    return {
      label: topScore.matchId,
      points: topScore.points ?? 0
    };
  }

  const match = matchData as MatchPreviewRow;
  const teamIds = [match.home_team_id, match.away_team_id].filter((value): value is string => Boolean(value));
  const { data: teamData, error: teamError } =
    teamIds.length > 0
      ? await adminSupabase.from("teams").select("id,name,short_name").in("id", teamIds)
      : { data: [], error: null };

  if (teamError) {
    return {
      label: topScore.matchId,
      points: topScore.points ?? 0
    };
  }

  const teamMap = new Map<string, string>(
    ((teamData as TeamPreviewRow[] | null) ?? []).map((team) => [team.id, team.name || team.short_name || team.id])
  );

  return {
    label: [teamMap.get(match.home_team_id ?? ""), teamMap.get(match.away_team_id ?? "")]
      .filter((value): value is string => Boolean(value))
      .join(" vs ") || topScore.matchId,
    points: topScore.points ?? 0
  };
}

function selectBestGroupFinish(groups: LeaderboardGroupNavItem[]) {
  const dedupedById = new Map<string, LeaderboardGroupNavItem>();

  for (const group of groups) {
    const existing = dedupedById.get(group.id);
    if (!existing) {
      dedupedById.set(group.id, group);
      continue;
    }

    const existingRank = existing.rank ?? Number.POSITIVE_INFINITY;
    const nextRank = group.rank ?? Number.POSITIVE_INFINITY;
    if (nextRank < existingRank) {
      dedupedById.set(group.id, group);
    }
  }

  return Array.from(dedupedById.values())
    .filter((group) => typeof group.rank === "number")
    .sort((left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY))[0] ?? null;
}
