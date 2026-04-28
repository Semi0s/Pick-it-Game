const PRODUCTION_SITE_URL = "https://pick-it-game2026.vercel.app";

export function getSiteUrl() {
  const publicSiteUrl = resolveConfiguredPublicSiteUrl({ allowLocal: true });
  if (publicSiteUrl) {
    return publicSiteUrl;
  }

  if (typeof window !== "undefined") {
    return normalize(window.location.origin);
  }

  return "http://localhost:3000";
}

export function getPublicSiteUrl() {
  const publicSiteUrl = resolveConfiguredPublicSiteUrl({ allowLocal: false });
  if (publicSiteUrl) {
    return publicSiteUrl;
  }

  if (typeof window !== "undefined") {
    const origin = normalize(window.location.origin);
    if (!isLocalOrigin(origin)) {
      return origin;
    }
  }

  return PRODUCTION_SITE_URL;
}

function resolveConfiguredPublicSiteUrl({ allowLocal }: { allowLocal: boolean }) {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    const normalized = normalize(process.env.NEXT_PUBLIC_SITE_URL);
    if (allowLocal || !isLocalOrigin(normalized)) {
      return normalized;
    }
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    const normalized = normalize(process.env.NEXT_PUBLIC_APP_URL);
    if (allowLocal || !isLocalOrigin(normalized)) {
      return normalized;
    }
  }

  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    const normalized = normalize(`https://${process.env.NEXT_PUBLIC_VERCEL_URL}`);
    if (allowLocal || !isLocalOrigin(normalized)) {
      return normalized;
    }
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }

  return null;
}

function isLocalOrigin(origin: string) {
  return origin.includes("localhost") || origin.includes("127.0.0.1");
}

function normalize(url: string) {
  return url.startsWith("http") ? url.replace(/\/$/, "") : `https://${url.replace(/\/$/, "")}`;
}
