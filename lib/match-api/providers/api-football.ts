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
    return [];
  }

  const baseUrl = process.env.MATCH_API_BASE_URL?.trim() || "https://v3.football.api-sports.io";
  const response = await fetch(`${baseUrl}/fixtures?from=${startDate}&to=${endDate}`, {
    headers: {
      "x-apisports-key": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Match provider returned ${response.status}.`);
  }

  const payload = (await response.json()) as { response?: ApiFootballFixtureRow[] | null };

  return ((payload.response ?? []) as ApiFootballFixtureRow[])
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
