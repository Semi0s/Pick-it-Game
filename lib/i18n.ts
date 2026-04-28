export const supportedLanguages = ["en", "es"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];

export const defaultLanguage: SupportedLanguage = "en";

export function normalizeLanguage(input?: string | null): SupportedLanguage {
  const normalized = input?.trim().toLowerCase();
  if (normalized && supportedLanguages.includes(normalized as SupportedLanguage)) {
    return normalized as SupportedLanguage;
  }

  return defaultLanguage;
}

export function getUserPreferredLanguage(profile?: { preferredLanguage?: string | null } | null): SupportedLanguage {
  return normalizeLanguage(profile?.preferredLanguage);
}

export function getLegalLanguageForUser(profile?: { preferredLanguage?: string | null } | null): SupportedLanguage {
  return getUserPreferredLanguage(profile);
}

export function appendLanguageToPath(path: string, language?: string | null) {
  const normalizedLanguage = normalizeLanguage(language);
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("lang", normalizedLanguage);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
