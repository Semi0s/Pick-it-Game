import { PUBLIC_SIGNUP_DEFAULT_GROUP_ID_KEY, fetchTextAppSetting } from "@/lib/app-settings";
import { fetchUserBracketPredictions } from "@/lib/bracket-predictions";
import { fetchPredictionLabAvailability } from "@/lib/prediction-lab-availability";
import { fetchPredictionLabPublicPulse, type PredictionLabPublicMatchPulse } from "@/lib/prediction-lab-public-pulse";
import {
  PREDICTION_LAB_AVERAGE_MIN_COUNT,
  PREDICTION_LAB_DEFAULT_SETTINGS,
  PREDICTION_LAB_TOURNAMENT_ID,
  buildPredictionLabInputs,
  normalizePredictionLabSettings,
  type PredictionLabAverageSummary,
  type PredictionLabBracketPick,
  type PredictionLabMatchInput,
  type PredictionLabSettings,
  type PredictionLabTeamHealthSummary,
  type PredictionLabTeamInput
} from "@/lib/prediction-lab";
import { isMissingRelationError, warnOptionalFeatureOnce } from "@/lib/schema-safety";
import { SIDE_PICK_DEFAULT_GROUP_NAME } from "@/lib/side-picks";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Match, Team } from "@/lib/types";

type AdminSupabase = ReturnType<typeof createAdminClient>;

export type PredictionLabGroupContext = {
  id: string;
  name: string;
};

export type PredictionLabPageData = {
  tournamentId: string;
  group: PredictionLabGroupContext | null;
  initialSettings: PredictionLabSettings;
  averageSummary: PredictionLabAverageSummary;
  activeTeams: PredictionLabTeamInput[];
  teamHealthSummary: PredictionLabTeamHealthSummary;
  publicMatchPulseRows: Array<PredictionLabPublicMatchPulse & { matchId: string }>;
  upcomingMatches: PredictionLabMatchInput[];
  userBracketPicks: PredictionLabBracketPick[];
};

type PredictionLabSettingsRow = {
  user_id: string;
  tournament_id: string;
  group_id?: string | null;
  upset_level: number;
  seed_strength: number;
  momentum: number;
  crowd_confidence: number;
  road_ahead: number;
  created_at?: string;
  updated_at?: string;
};

export async function fetchPredictionLabPageData(userId: string): Promise<PredictionLabPageData> {
  const adminSupabase = createAdminClient();
  const [group, teams, matches, savedSettings] = await Promise.all([
    fetchPredictionLabGroup(adminSupabase),
    fetchPredictionLabTeams(adminSupabase),
    fetchPredictionLabMatches(adminSupabase),
    fetchPredictionLabSettings(adminSupabase, userId)
  ]);
  const { activeTeams, upcomingMatches } = buildPredictionLabInputs({ teams, matches });
  const predictionTeams = activeTeams.length > 0 ? activeTeams : buildPredictionLabFallbackTeams(teams);
  const [userBracketPicks, teamHealthSummary, publicMatchPulseByMatchId] = await Promise.all([
    fetchPredictionLabBracketPicks(userId),
    fetchPredictionLabAvailability({
      teams: predictionTeams.map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.shortName
      }))
    }),
    fetchPredictionLabPublicPulse({
      matches: upcomingMatches
    })
  ]);

  return {
    tournamentId: PREDICTION_LAB_TOURNAMENT_ID,
    group,
    initialSettings: savedSettings,
    averageSummary: await fetchPredictionLabAverageSummary(adminSupabase, group?.id ?? null),
    activeTeams: predictionTeams,
    teamHealthSummary,
    publicMatchPulseRows: Array.from(publicMatchPulseByMatchId.entries()).map(([matchId, pulse]) => ({
      matchId,
      ...pulse
    })),
    upcomingMatches,
    userBracketPicks
  };
}

export async function savePredictionLabSettings(input: {
  userId: string;
  groupId: string | null;
  settings: PredictionLabSettings;
}): Promise<{
  settings: PredictionLabSettings;
  averageSummary: PredictionLabAverageSummary;
}> {
  const adminSupabase = createAdminClient();
  const settings = normalizePredictionLabSettings(input.settings);
  const { error } = await adminSupabase.from("prediction_lab_settings").upsert(
    {
      user_id: input.userId,
      tournament_id: PREDICTION_LAB_TOURNAMENT_ID,
      group_id: input.groupId,
      upset_level: settings.scheduleLoad,
      seed_strength: settings.availability,
      momentum: settings.formQuality,
      crowd_confidence: settings.crowdPulse,
      road_ahead: 55,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,tournament_id" }
  );

  if (error) {
    if (isMissingRelationError(error.message, "prediction_lab_settings")) {
      throw new Error("Prediction Lab settings are not available yet. Apply the prediction_lab_settings migration first.");
    }

    throw new Error(error.message);
  }

  return {
    settings,
    averageSummary: await fetchPredictionLabAverageSummary(adminSupabase, input.groupId)
  };
}

async function fetchPredictionLabSettings(
  adminSupabase: AdminSupabase,
  userId: string
): Promise<PredictionLabSettings> {
  const { data, error } = await adminSupabase
    .from("prediction_lab_settings")
    .select("user_id,tournament_id,group_id,upset_level,seed_strength,momentum,crowd_confidence,road_ahead,created_at,updated_at")
    .eq("user_id", userId)
    .eq("tournament_id", PREDICTION_LAB_TOURNAMENT_ID)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error.message, "prediction_lab_settings")) {
      warnOptionalFeatureOnce(
        "prediction-lab-settings-missing",
        "Prediction Lab settings table is unavailable; defaulting to local-only settings.",
        error.message
      );
      return { ...PREDICTION_LAB_DEFAULT_SETTINGS };
    }

    throw new Error(error.message);
  }

  const row = data as PredictionLabSettingsRow | null;
  if (!row) {
    return { ...PREDICTION_LAB_DEFAULT_SETTINGS };
  }

  return normalizePredictionLabSettings({
    scheduleLoad: row.upset_level,
    availability: row.seed_strength,
    formQuality: row.momentum,
    crowdPulse: row.crowd_confidence
  });
}

async function fetchPredictionLabAverageSummary(
  adminSupabase: AdminSupabase,
  groupId: string | null
): Promise<PredictionLabAverageSummary> {
  if (!groupId) {
    return {
      groupCount: 0,
      averageSettings: null
    };
  }

  const { data, error } = await adminSupabase
    .from("prediction_lab_settings")
    .select("user_id,upset_level,seed_strength,momentum,crowd_confidence,road_ahead")
    .eq("group_id", groupId)
    .eq("tournament_id", PREDICTION_LAB_TOURNAMENT_ID);

  if (error) {
    if (isMissingRelationError(error.message, "prediction_lab_settings")) {
      warnOptionalFeatureOnce(
        "prediction-lab-averages-missing",
        "Prediction Lab averages table is unavailable; hiding anonymous averages.",
        error.message
      );
      return {
        groupCount: 0,
        averageSettings: null
      };
    }

    throw new Error(error.message);
  }

  const rows = ((data as Array<{
    user_id: string;
    upset_level: number;
    seed_strength: number;
    momentum: number;
    crowd_confidence: number;
    road_ahead: number;
  }> | null) ?? []);

  if (rows.length < PREDICTION_LAB_AVERAGE_MIN_COUNT) {
    return {
      groupCount: rows.length,
      averageSettings: null
    };
  }

  const total = rows.reduce(
    (sum, row) => ({
      scheduleLoad: sum.scheduleLoad + row.upset_level,
      availability: sum.availability + row.seed_strength,
      formQuality: sum.formQuality + row.momentum,
      crowdPulse: sum.crowdPulse + row.crowd_confidence
    }),
    {
      scheduleLoad: 0,
      availability: 0,
      formQuality: 0,
      crowdPulse: 0
    }
  );

  return {
    groupCount: rows.length,
    averageSettings: normalizePredictionLabSettings({
      scheduleLoad: total.scheduleLoad / rows.length,
      availability: total.availability / rows.length,
      formQuality: total.formQuality / rows.length,
      crowdPulse: total.crowdPulse / rows.length
    })
  };
}

async function fetchPredictionLabGroup(adminSupabase: AdminSupabase): Promise<PredictionLabGroupContext | null> {
  const configuredGroupId = await fetchTextAppSetting(PUBLIC_SIGNUP_DEFAULT_GROUP_ID_KEY, null).catch(() => null);
  const query = adminSupabase.from("groups").select("id,name").limit(1);
  const result = configuredGroupId
    ? await query.eq("id", configuredGroupId).maybeSingle()
    : await adminSupabase
        .from("groups")
        .select("id,name")
        .eq("name", SIDE_PICK_DEFAULT_GROUP_NAME)
        .limit(1)
        .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (result.data) {
    return result.data as PredictionLabGroupContext;
  }

  const fallback = await adminSupabase
    .from("groups")
    .select("id,name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return (fallback.data as PredictionLabGroupContext | null) ?? null;
}

async function fetchPredictionLabTeams(adminSupabase: AdminSupabase): Promise<Team[]> {
  const { data, error } = await adminSupabase
    .from("teams")
    .select("id,name,short_name,group_name,fifa_rank,flag_emoji")
    .order("fifa_rank", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<{
    id: string;
    name: string;
    short_name: string;
    group_name: string;
    fifa_rank: number | null;
    flag_emoji: string | null;
  }> | null) ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    shortName: team.short_name,
    groupName: team.group_name,
    fifaRank: team.fifa_rank ?? 0,
    flagEmoji: team.flag_emoji ?? ""
  }));
}

async function fetchPredictionLabMatches(adminSupabase: AdminSupabase): Promise<Match[]> {
  const { data, error } = await adminSupabase
    .from("matches")
    .select("id,stage,status,external_id,home_team_id,away_team_id,home_source,away_source,kickoff_time,kickoff_at,home_score,away_score,winner_team_id,next_match_id,next_match_slot")
    .in("stage", ["group", "r32", "r16", "qf", "sf", "final"])
    .order("kickoff_time", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data as Array<{
    id: string;
    stage: Match["stage"];
    status: Match["status"];
    external_id?: string | null;
    home_team_id?: string | null;
    away_team_id?: string | null;
    home_source?: string | null;
    away_source?: string | null;
    kickoff_time?: string | null;
    kickoff_at?: string | null;
    home_score?: number | null;
    away_score?: number | null;
    winner_team_id?: string | null;
    next_match_id?: string | null;
    next_match_slot?: Match["nextMatchSlot"] | null;
  }> | null) ?? []).map((match) => ({
    id: match.id,
    stage: match.stage,
    status: match.status,
    externalId: match.external_id ?? null,
    homeTeamId: match.home_team_id ?? undefined,
    awayTeamId: match.away_team_id ?? undefined,
    homeSource: match.home_source ?? undefined,
    awaySource: match.away_source ?? undefined,
    kickoffTime: match.kickoff_time ?? match.kickoff_at ?? "",
    kickoffAt: match.kickoff_at ?? null,
    homeScore: match.home_score ?? undefined,
    awayScore: match.away_score ?? undefined,
    winnerTeamId: match.winner_team_id ?? undefined,
    nextMatchId: match.next_match_id ?? null,
    nextMatchSlot: match.next_match_slot ?? null
  }));
}

async function fetchPredictionLabBracketPicks(userId: string): Promise<PredictionLabBracketPick[]> {
  try {
    const predictions = await fetchUserBracketPredictions(userId);
    return predictions
      .filter((prediction) => prediction.predictedWinnerTeamId)
      .map((prediction) => ({
        matchId: prediction.matchId,
        predictedWinnerTeamId: prediction.predictedWinnerTeamId
      }));
  } catch {
    return [];
  }
}

function buildPredictionLabFallbackTeams(teams: Team[]): PredictionLabTeamInput[] {
  return teams
    .slice(0, 16)
    .map((team, index, rows) => ({
      id: team.id,
      name: team.name,
      shortName: team.shortName,
      flagEmoji: team.flagEmoji,
      fifaRank: team.fifaRank,
      seedScore: rows.length <= 1 ? 0.5 : 1 - index / (rows.length - 1),
      momentumScore: 0.5,
      pathScore: 0.5,
      roundsRemaining: 5,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      matchesPlayed: 0,
      lastPlayedAt: null
    }));
}
