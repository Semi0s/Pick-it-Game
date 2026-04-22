const PRODUCTION_SITE_URL = "https://pick-it-game2026.vercel.app";

export function getSiteUrl() {
  // 1. Explicit env override (BEST)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return normalize(process.env.NEXT_PUBLIC_SITE_URL);
  }

  // 2. App URL fallback
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return normalize(process.env.NEXT_PUBLIC_APP_URL);
  }

  // 3. Vercel URL (auto-provided)
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return normalize(`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`);
  }

  // 4. Force production fallback (VERY IMPORTANT)
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }

  // 5. Browser fallback (only if NOT localhost)
  if (typeof window !== "undefined") {
    const origin = normalize(window.location.origin);
    if (!origin.includes("localhost")) {
      return origin;
    }
  }

  // 6. Final fallback (dev only)
  return "http://localhost:3000";
}

function normalize(url: string) {
  return url.startsWith("http") ? url.replace(/\/$/, "") : `https://${url.replace(/\/$/, "")}`;
}