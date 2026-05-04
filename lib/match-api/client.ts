import { fetchApiFootballMatches } from "@/lib/match-api/providers/api-football";

export type ExternalMatchStatus = "scheduled" | "live" | "final";

export type NormalizedExternalMatch = {
  external_id: string;
  kickoff_at: string;
  status: ExternalMatchStatus;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
};

export async function fetchMatchesByDate({
  startDate,
  endDate
}: {
  startDate: string;
  endDate: string;
}): Promise<NormalizedExternalMatch[]> {
  const syncEnabled = process.env.ENABLE_MATCH_SYNC === "true";
  const provider = (process.env.MATCH_API_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = process.env.MATCH_API_KEY?.trim() ?? "";

  if (!syncEnabled || !provider || !apiKey) {
    return [];
  }

  switch (provider) {
    case "api-football":
      return fetchApiFootballMatches({ startDate, endDate, apiKey });
    default:
      console.info("[match-api] Unknown provider configured. Skipping sync.", { provider });
      return [];
  }
}
