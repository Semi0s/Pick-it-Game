import type { NormalizedExternalMatch } from "@/lib/match-api/client";

type ApiFootballFixtureRow = {
  fixture?: {
    id?: number | null;
    date?: string | null;
    status?: {
      short?: string | null;
    } | null;
  } | null;
  teams?: {
    home?: { name?: string | null } | null;
    away?: { name?: string | null } | null;
  } | null;
  goals?: {
    home?: number | null;
    away?: number | null;
  } | null;
};

export async function fetchApiFootballMatches({
  startDate,
  endDate,
  apiKey
}: {
  startDate: string;
  endDate: string;
  apiKey: string;
}): Promise<NormalizedExternalMatch[]> {
  if (!apiKey) {
    console.info("[match-api] API-Football skipped because no API key was provided.", {
      startDate,
      endDate
    });
    return [];
  }

  const baseUrl = process.env.MATCH_API_BASE_URL?.trim() || "https://v3.football.api-sports.io";
  const leagueId = process.env.MATCH_API_LEAGUE_ID?.trim() ?? "";
  const season = process.env.MATCH_API_SEASON?.trim() ?? "";
  const requestUrl = new URL("/fixtures", baseUrl);
  requestUrl.searchParams.set("from", startDate);
  requestUrl.searchParams.set("to", endDate);
  if (leagueId) {
    requestUrl.searchParams.set("league", leagueId);
  }
  if (season) {
    requestUrl.searchParams.set("season", season);
  }

  const response = await fetch(requestUrl.toString(), {
    headers: {
      "x-apisports-key": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Match provider returned ${response.status}.`);
  }

  const payload = (await response.json()) as { response?: ApiFootballFixtureRow[] | null };
  const rawRows = (payload.response ?? []) as ApiFootballFixtureRow[];
  console.info("[match-api] API-Football response received.", {
    startDate,
    endDate,
    baseUrl,
    leagueId: leagueId || null,
    season: season || null,
    requestUrl: requestUrl.toString(),
    fixtureCount: rawRows.length,
    sampleFixtureIds: rawRows.slice(0, 3).map((row) => row.fixture?.id ?? null)
  });

  return rawRows
    .map((row) => {
      const externalId = row.fixture?.id != null ? String(row.fixture.id) : "";
      const kickoffAt = row.fixture?.date ?? "";
      const homeTeamName = row.teams?.home?.name?.trim() ?? "";
      const awayTeamName = row.teams?.away?.name?.trim() ?? "";

      if (!externalId || !kickoffAt || !homeTeamName || !awayTeamName) {
        return null;
      }

      return {
        external_id: externalId,
        kickoff_at: kickoffAt,
        status: normalizeApiFootballStatus(row.fixture?.status?.short ?? null),
        home_team_name: homeTeamName,
        away_team_name: awayTeamName,
        home_score: row.goals?.home ?? null,
        away_score: row.goals?.away ?? null
      } satisfies NormalizedExternalMatch;
    })
    .filter((row): row is NormalizedExternalMatch => Boolean(row));
}

function normalizeApiFootballStatus(status: string | null) {
  const normalized = (status ?? "").trim().toUpperCase();

  if (["FT", "AET", "PEN"].includes(normalized)) {
    return "final" as const;
  }

  if (["NS", "TBD", "PST", "CANC", "ABD", "SUSP", "INT"].includes(normalized)) {
    return "scheduled" as const;
  }

  return "live" as const;
}
