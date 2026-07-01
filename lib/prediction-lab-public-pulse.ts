import "server-only";

import { warnOptionalFeatureOnce } from "@/lib/schema-safety";
import type { PredictionLabMatchInput } from "@/lib/prediction-lab";

export type PredictionLabPublicMatchPulse = {
  homePercent: number;
  awayPercent: number;
  provider: "api-football";
};

type ApiFootballPredictionRow = {
  predictions?: {
    percent?: {
      home?: string | number | null;
      away?: string | number | null;
    } | null;
  } | null;
};

const PREDICTION_LAB_PUBLIC_PULSE_REVALIDATE_SECONDS = 60 * 5;

export async function fetchPredictionLabPublicPulse(input: {
  matches: PredictionLabMatchInput[];
}): Promise<Map<string, PredictionLabPublicMatchPulse>> {
  const provider = (process.env.MATCH_API_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = process.env.MATCH_API_KEY?.trim() ?? "";
  const baseUrl = process.env.MATCH_API_BASE_URL?.trim() || "https://v3.football.api-sports.io";

  if (provider !== "api-football" || !apiKey) {
    return new Map();
  }

  const seededMatches = input.matches.filter(
    (match) => Boolean(match.externalId && match.homeTeamId && match.awayTeamId)
  );
  if (seededMatches.length === 0) {
    return new Map();
  }

  const entries = await Promise.all(
    seededMatches.map(async (match) => {
      const requestUrl = new URL("/predictions", baseUrl);
      requestUrl.searchParams.set("fixture", match.externalId!);

      try {
        const response = await fetch(requestUrl.toString(), {
          headers: {
            "x-apisports-key": apiKey
          },
          next: {
            revalidate: PREDICTION_LAB_PUBLIC_PULSE_REVALIDATE_SECONDS
          }
        });

        if (!response.ok) {
          warnOptionalFeatureOnce(
            "prediction-lab-public-pulse-http",
            "Prediction Lab public pulse could not load; keeping Rank + Form as the fallback.",
            `API-Football predictions returned ${response.status} for fixture ${match.externalId}.`
          );
          return null;
        }

        const payload = (await response.json()) as { response?: ApiFootballPredictionRow[] | null };
        const row = payload.response?.[0] ?? null;
        const homePercent = parseApiFootballPercent(row?.predictions?.percent?.home ?? null);
        const awayPercent = parseApiFootballPercent(row?.predictions?.percent?.away ?? null);
        if (homePercent === null || awayPercent === null) {
          return null;
        }

        const total = homePercent + awayPercent;
        if (total <= 0) {
          return null;
        }

        return [
          match.id,
          {
            homePercent: round1((homePercent / total) * 100),
            awayPercent: round1((awayPercent / total) * 100),
            provider: "api-football" as const
          }
        ] as const;
      } catch (error) {
        warnOptionalFeatureOnce(
          "prediction-lab-public-pulse-fetch",
          "Prediction Lab public pulse could not load; keeping Rank + Form as the fallback.",
          error instanceof Error ? error.message : String(error)
        );
        return null;
      }
    })
  );

  return new Map(entries.filter((entry): entry is readonly [string, PredictionLabPublicMatchPulse] => Boolean(entry)));
}

function parseApiFootballPercent(value: string | number | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
