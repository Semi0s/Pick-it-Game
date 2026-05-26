import { normalizeLanguage, type AppLanguage } from "@/lib/i18n";

const localeByLanguage: Record<AppLanguage, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  pt: "pt",
  de: "de"
};

export function getIntlLocale(language?: string | null) {
  return localeByLanguage[normalizeLanguage(language)];
}

export function formatNumber(value: number, language?: string | null, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(getIntlLocale(language), options).format(value);
}

export function formatDate(
  date: Date | string | number,
  language?: string | null,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
) {
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(new Date(date));
}

export function formatTime(
  date: Date | string | number,
  language?: string | null,
  options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }
) {
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(new Date(date));
}

export function formatDateTime(
  date: Date | string | number,
  language?: string | null,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
) {
  return new Intl.DateTimeFormat(getIntlLocale(language), options).format(new Date(date));
}

export function formatRelativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, language?: string | null) {
  return new Intl.RelativeTimeFormat(getIntlLocale(language), { numeric: "auto" }).format(value, unit);
}

export function formatRank(value: number | null | undefined, language?: string | null) {
  if (typeof value !== "number") {
    return "—";
  }

  return `#${formatNumber(value, language)}`;
}

export function formatDuration(
  duration: { days?: number; hours?: number; minutes?: number },
  language?: string | null
) {
  const parts = [
    typeof duration.days === "number" ? ["day", duration.days] : null,
    typeof duration.hours === "number" ? ["hour", duration.hours] : null,
    typeof duration.minutes === "number" ? ["minute", duration.minutes] : null
  ].filter((part): part is [Intl.RelativeTimeFormatUnit, number] => Boolean(part));

  const formatter = new Intl.NumberFormat(getIntlLocale(language), { maximumFractionDigits: 0 });
  const unitFormatter = new Intl.RelativeTimeFormat(getIntlLocale(language), { numeric: "always" });

  return parts
    .map(([unit, value]) => unitFormatter.formatToParts(value, unit).map((part) => (part.type === "integer" ? formatter.format(value) : part.value)).join(""))
    .join(" ");
}
