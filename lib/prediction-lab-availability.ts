import "server-only";

import { resolveTeamIdByName } from "@/lib/match-sync/team-resolution";
import type { PredictionLabTeamAvailability, PredictionLabTeamHealthSummary } from "@/lib/prediction-lab";
import { warnOptionalFeatureOnce } from "@/lib/schema-safety";
import type { Team } from "@/lib/types";

type ApiFootballInjuryRow = {
  fixture?: {
    date?: string | null;
  } | null;
  team?: {
    name?: string | null;
  } | null;
};

type TeamLookupRow = {
  id: string;
  name: string;
  short_name?: string | null;
};

const PREDICTION_LAB_AVAILABILITY_REVALIDATE_SECONDS = 60 * 5;

export async function fetchPredictionLabAvailability(input: {
  teams: Array<Pick<Team, "id" | "name" | "shortName">>;
}): Promise<PredictionLabTeamHealthSummary> {
  const provider = (process.env.MATCH_API_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = process.env.MATCH_API_KEY?.trim() ?? "";
  const leagueId = process.env.MATCH_API_LEAGUE_ID?.trim() ?? "";
  const season = process.env.MATCH_API_SEASON?.trim() ?? "";
  const checkedAt = new Date().toISOString();

  if (provider !== "api-football" || !apiKey || !leagueId || !season || input.teams.length === 0) {
    return {
      status: "not_configured",
      teams: [],
      checkedAt,
      refreshIntervalSeconds: PREDICTION_LAB_AVAILABILITY_REVALIDATE_SECONDS
    };
  }

  const requestUrl = new URL("/injuries", process.env.MATCH_API_BASE_URL?.trim() || "https://v3.football.api-sports.io");
  requestUrl.searchParams.set("league", leagueId);
  requestUrl.searchParams.set("season", season);

  try {
    const response = await fetch(requestUrl.toString(), {
      headers: {
        "x-apisports-key": apiKey
      },
      next: {
        revalidate: PREDICTION_LAB_AVAILABILITY_REVALIDATE_SECONDS
      }
    });

    if (!response.ok) {
      warnOptionalFeatureOnce(
        "prediction-lab-availability-http",
        "Prediction Lab availability feed is unavailable; keeping the availability beam off.",
        `API-Football injuries returned ${response.status}.`
      );
      return {
        status: "provider_error",
        teams: [],
        checkedAt,
        refreshIntervalSeconds: PREDICTION_LAB_AVAILABILITY_REVALIDATE_SECONDS
      };
    }

    const payload = (await response.json()) as {
      response?: ApiFootballInjuryRow[] | null;
    };
    const rows = (payload.response ?? []) as ApiFootballInjuryRow[];
    if (rows.length === 0) {
      return {
        status: "provider_empty",
        teams: [],
        checkedAt,
        refreshIntervalSeconds: PREDICTION_LAB_AVAILABILITY_REVALIDATE_SECONDS
      };
    }

    const teams = input.teams.map<TeamLookupRow>((team) => ({
      id: team.id,
      name: team.name,
      short_name: team.shortName
    }));

    const summaryByTeamId = new Map<string, PredictionLabTeamAvailability>();
    for (const row of rows) {
      const providerTeamName = row.team?.name?.trim() ?? "";
      if (!providerTeamName) {
        continue;
      }

      const teamId = resolveTeamIdByName(providerTeamName, teams);
      if (!teamId) {
        continue;
      }

      const current = summaryByTeamId.get(teamId) ?? {
        teamId,
        flaggedCount: 0,
        updatedAt: null
      };

      current.flaggedCount += 1;
      current.updatedAt = latestIsoDate(current.updatedAt, row.fixture?.date ?? null);
      summaryByTeamId.set(teamId, current);
    }

    return {
      status: summaryByTeamId.size > 0 ? "ok" : "mapping_empty",
      teams: Array.from(summaryByTeamId.values()),
      checkedAt,
      refreshIntervalSeconds: PREDICTION_LAB_AVAILABILITY_REVALIDATE_SECONDS
    };
  } catch (error) {
    warnOptionalFeatureOnce(
      "prediction-lab-availability-fetch",
      "Prediction Lab availability feed could not be loaded; keeping the availability beam off.",
      error instanceof Error ? error.message : String(error)
    );
    return {
      status: "provider_error",
      teams: [],
      checkedAt,
      refreshIntervalSeconds: PREDICTION_LAB_AVAILABILITY_REVALIDATE_SECONDS
    };
  }
}

function latestIsoDate(current: string | null, next: string | null) {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  const currentTimestamp = Date.parse(current);
  const nextTimestamp = Date.parse(next);
  if (!Number.isFinite(currentTimestamp) || !Number.isFinite(nextTimestamp)) {
    return current;
  }

  return nextTimestamp > currentTimestamp ? next : current;
}
