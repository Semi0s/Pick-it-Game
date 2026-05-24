import type { CSSProperties } from "react";
import type { SupportedLanguage } from "@/lib/i18n";

export type LocalizedCardPatternVariant = "bands" | "ribbons" | "emblem" | "minimal";

export type LocalizedCardTheme = {
  id: string;
  label: string;
  colors: string[];
  mainBackground: string;
  textColor: string;
  secondaryTextColor?: string;
  controlSurface?: string;
  controlText?: string;
  borderColor?: string;
  controlZoneTint?: string;
  patternVariant?: LocalizedCardPatternVariant;
  emblemAsset?: string;
};

export type LocalizedCardThemeInput = {
  homeTeamId?: string | null;
  countryCode?: string | null;
  marketCode?: string | null;
  preferredLanguage?: SupportedLanguage | string | null;
};

export const localizedCardThemes = {
  generic: {
    id: "generic",
    label: "Generic",
    colors: ["#F3F4F6", "#E5E7EB", "#D1D5DB"],
    mainBackground: "#F3F4F6",
    textColor: "#111827",
    secondaryTextColor: "#4B5563",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#374151",
    borderColor: "#E5E7EB",
    controlZoneTint: "rgba(255,255,255,0.14)",
    patternVariant: "minimal"
  },
  colombia: {
    id: "colombia",
    label: "Colombia",
    colors: ["#FCD116", "#003893", "#CE1126"],
    mainBackground: "#003893",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#1D4ED8",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "bands"
  },
  ecuador: {
    id: "ecuador",
    label: "Ecuador",
    colors: ["#FCD116", "#003893", "#CE1126"],
    mainBackground: "#003893",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#1D4ED8",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem"
  },
  germany: {
    id: "germany",
    label: "Germany",
    colors: ["#000000", "#DD0000", "#FFCE00"],
    mainBackground: "#1D1718",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.86)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#3F3F46",
    controlZoneTint: "rgba(255,255,255,0.1)",
    patternVariant: "bands"
  },
  japan: {
    id: "japan",
    label: "Japan",
    colors: ["#FFFFFF", "#BC002D"],
    mainBackground: "#FFFDFB",
    textColor: "#111111",
    secondaryTextColor: "#3F3F46",
    controlSurface: "rgba(255,255,255,0.94)",
    controlText: "#1F2937",
    borderColor: "#E5E7EB",
    controlZoneTint: "rgba(255,255,255,0.16)",
    patternVariant: "minimal"
  },
  usa: {
    id: "usa",
    label: "United States",
    colors: ["#B22234", "#FFFFFF", "#3C3B6E"],
    mainBackground: "#3C3B6E",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#4F46E5",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "ribbons"
  },
  mexico: {
    id: "mexico",
    label: "Mexico",
    colors: ["#006847", "#FFFFFF", "#CE1126"],
    mainBackground: "#006847",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#047857",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem"
  },
  brazil: {
    id: "brazil",
    label: "Brazil",
    colors: ["#009B3A", "#FFDF00", "#002776"],
    mainBackground: "#009B3A",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#10B981",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "bands"
  },
  argentina: {
    id: "argentina",
    label: "Argentina",
    colors: ["#74ACDF", "#FFFFFF", "#F6B40E"],
    mainBackground: "#74ACDF",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#60A5FA",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem"
  },
  france: {
    id: "france",
    label: "France",
    colors: ["#0055A4", "#FFFFFF", "#EF4135"],
    mainBackground: "#0055A4",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#2563EB",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "bands"
  },
  england: {
    id: "england",
    label: "England",
    colors: ["#FFFFFF", "#CE1126"],
    mainBackground: "#FFFDFB",
    textColor: "#111111",
    secondaryTextColor: "#3F3F46",
    controlSurface: "rgba(255,255,255,0.94)",
    controlText: "#1F2937",
    borderColor: "#E5E7EB",
    controlZoneTint: "rgba(255,255,255,0.16)",
    patternVariant: "minimal"
  }
} satisfies Record<string, LocalizedCardTheme>;

const teamThemeById: Record<string, keyof typeof localizedCardThemes> = {
  col: "colombia",
  ecu: "ecuador",
  ger: "germany",
  jpn: "japan",
  usa: "usa",
  mex: "mexico",
  bra: "brazil",
  arg: "argentina",
  fra: "france",
  eng: "england"
};

const localeDefaultThemeByLanguage: Partial<Record<SupportedLanguage | string, keyof typeof localizedCardThemes>> = {
  en: "usa",
  es: "colombia",
  pt: "brazil",
  de: "germany",
  fr: "france"
};

const countryAliases: Record<string, keyof typeof localizedCardThemes> = {
  co: "colombia",
  col: "colombia",
  colombia: "colombia",
  ec: "ecuador",
  ecu: "ecuador",
  ecuador: "ecuador",
  de: "germany",
  ger: "germany",
  germany: "germany",
  jp: "japan",
  jpn: "japan",
  japan: "japan",
  us: "usa",
  usa: "usa",
  unitedstates: "usa",
  mx: "mexico",
  mex: "mexico",
  mexico: "mexico",
  br: "brazil",
  bra: "brazil",
  brazil: "brazil",
  ar: "argentina",
  arg: "argentina",
  argentina: "argentina",
  fr: "france",
  fra: "france",
  france: "france",
  eng: "england",
  england: "england"
};

export function resolveLocalizedCardThemeId(input: LocalizedCardThemeInput): keyof typeof localizedCardThemes {
  const normalizedHomeTeamId = normalizeKey(input.homeTeamId);
  if (normalizedHomeTeamId && teamThemeById[normalizedHomeTeamId]) {
    return teamThemeById[normalizedHomeTeamId];
  }

  const explicitCountryKey = normalizeKey(input.countryCode);
  if (explicitCountryKey && countryAliases[explicitCountryKey]) {
    return countryAliases[explicitCountryKey];
  }

  const explicitMarketKey = normalizeKey(input.marketCode);
  if (explicitMarketKey && countryAliases[explicitMarketKey]) {
    return countryAliases[explicitMarketKey];
  }

  const localeKey = normalizeKey(input.preferredLanguage);
  if (localeKey && localeDefaultThemeByLanguage[localeKey]) {
    return localeDefaultThemeByLanguage[localeKey] ?? "generic";
  }

  return "generic";
}

export function getLocalizedCardTheme(input: LocalizedCardThemeInput): LocalizedCardTheme {
  return localizedCardThemes[resolveLocalizedCardThemeId(input)] ?? localizedCardThemes.generic;
}

export function getLocalizedCardCssVars(theme: LocalizedCardTheme): CSSProperties {
  const accentPalette = normalizeThemeColors(theme.colors, theme.mainBackground);

  return {
    "--localized-card-bg": theme.mainBackground,
    "--localized-card-text": theme.textColor,
    "--localized-card-secondary-text": theme.secondaryTextColor ?? theme.textColor,
    "--localized-card-control-surface": theme.controlSurface ?? "rgba(255,255,255,0.92)",
    "--localized-card-control-text": theme.controlText ?? "#1F2937",
    "--localized-card-border": theme.borderColor ?? "#E5E7EB",
    "--localized-card-control-zone-tint": theme.controlZoneTint ?? "rgba(255,255,255,0.22)",
    "--localized-card-accent-1": accentPalette[0],
    "--localized-card-accent-2": accentPalette[1],
    "--localized-card-accent-3": accentPalette[2],
    "--localized-card-accent-4": accentPalette[3],
    "--localized-card-accent-5": accentPalette[4]
  } as CSSProperties;
}

function normalizeThemeColors(colors: string[], mainBackground: string) {
  const filtered = colors.filter(Boolean);
  const palette = filtered.length > 0 ? filtered : [mainBackground];
  const normalized: string[] = [];

  while (normalized.length < 5) {
    normalized.push(palette[normalized.length % palette.length]);
  }

  return normalized;
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
}
