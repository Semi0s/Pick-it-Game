export const supportedLanguages = ["en", "es", "fr", "pt", "de"] as const;
export const explainerLanguages = supportedLanguages;

export type AppLanguage = (typeof supportedLanguages)[number];
export type SupportedLanguage = AppLanguage;
export type ExplainerLanguage = (typeof explainerLanguages)[number];

export const defaultLanguage: SupportedLanguage = "en";
export const defaultExplainerLanguage: ExplainerLanguage = "en";
export const APP_LANGUAGE_STORAGE_KEY = "pickit:app-language";
export const APP_LANGUAGE_COOKIE_KEY = "pickit_app_language";
export const PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY = "pickit:play-explainer-language";
export const HELPER_LANGUAGE_CHANGED_EVENT = "pickit:helper-language-changed";

export function resolveAppLanguage(input?: {
  userLanguage?: string | null;
  storedLanguage?: string | null;
  browserLanguage?: string | null;
  fallbackLanguage?: string | null;
}): AppLanguage {
  if (input?.userLanguage) {
    return normalizeLanguage(input.userLanguage);
  }

  if (input?.storedLanguage) {
    return normalizeLanguage(input.storedLanguage);
  }

  if (input?.browserLanguage) {
    return normalizeLanguage(input.browserLanguage);
  }

  return normalizeLanguage(input?.fallbackLanguage);
}

export function getInviteLanguageForExplainerLanguage(input?: string | null): SupportedLanguage {
  return normalizeExplainerLanguage(input);
}

export function normalizeLanguage(input?: string | null): SupportedLanguage {
  const normalized = input?.trim().toLowerCase().replace("_", "-");
  const baseLanguage = normalized?.split("-")[0];
  if (normalized && supportedLanguages.includes(normalized as SupportedLanguage)) {
    return normalized as SupportedLanguage;
  }

  if (baseLanguage && supportedLanguages.includes(baseLanguage as SupportedLanguage)) {
    return baseLanguage as SupportedLanguage;
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
  const normalized = input?.trim().toLowerCase().replace("_", "-");
  const baseLanguage = normalized?.split("-")[0];
  if (normalized && explainerLanguages.includes(normalized as ExplainerLanguage)) {
    return normalized as ExplainerLanguage;
  }

  if (baseLanguage && explainerLanguages.includes(baseLanguage as ExplainerLanguage)) {
    return baseLanguage as ExplainerLanguage;
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
