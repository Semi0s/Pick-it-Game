export const supportedLanguages = ["en", "es"] as const;
export const explainerLanguages = ["en", "es", "fr", "pt", "de"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];
export type ExplainerLanguage = (typeof explainerLanguages)[number];

export const defaultLanguage: SupportedLanguage = "en";
export const defaultExplainerLanguage: ExplainerLanguage = "en";
export const PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY = "pickit:play-explainer-language";

export function getInviteLanguageForExplainerLanguage(input?: string | null): SupportedLanguage {
  const helperLanguage = normalizeExplainerLanguage(input);
  if (helperLanguage === "es") {
    return "es";
  }

  return "en";
}

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

export function normalizeExplainerLanguage(input?: string | null): ExplainerLanguage {
  const normalized = input?.trim().toLowerCase();
  if (normalized && explainerLanguages.includes(normalized as ExplainerLanguage)) {
    return normalized as ExplainerLanguage;
  }

  return defaultExplainerLanguage;
}

export function getExplainerLanguageForUser(profile?: { preferredLanguage?: string | null } | null): ExplainerLanguage {
  return normalizeExplainerLanguage(profile?.preferredLanguage);
}

export function appendLanguageToPath(path: string, language?: string | null) {
  const normalizedLanguage = normalizeLanguage(language);
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("lang", normalizedLanguage);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function appendExplainerLanguageToPath(path: string, helperLanguage?: string | null) {
  const normalizedHelperLanguage = normalizeExplainerLanguage(helperLanguage);
  const [pathname, search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  params.set("helperLang", normalizedHelperLanguage);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
