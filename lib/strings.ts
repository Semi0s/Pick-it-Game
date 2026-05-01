import { defaultLanguage, normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";

export const strings = {
  en: {
    continue: "Continue",
    save: "Save",
    cancel: "Cancel",
    profile: "Profile",
    play: "Play",
    myPicks: "My Picks",
    knockoutPicks: "Knockout Picks",
    myGroups: "My Groups",
    results: "Leaderboards",
    leaderboard: "Leaderboard",
    theArena: "The Arena",
    myProfile: "My Profile",
    termsOfUse: "Terms of Use",
    privacyPolicy: "Privacy Policy",
    agreeToTerms: "I have read and agree to the Terms of Use.",
    acceptAndContinue: "Accept and Continue",
    language: "Language",
    english: "English",
    spanish: "Spanish"
  },
  es: {
    continue: "Continuar",
    save: "Guardar",
    cancel: "Cancelar",
    profile: "Perfil",
    play: "Jugar",
    myPicks: "Mis Picks",
    knockoutPicks: "Picks Knockout",
    myGroups: "Mis Grupos",
    results: "Posiciones",
    leaderboard: "Clasificación",
    theArena: "La Arena",
    myProfile: "Mi Perfil",
    termsOfUse: "Términos de Uso",
    privacyPolicy: "Política de Privacidad",
    agreeToTerms: "He leído y acepto los Términos de Uso.",
    acceptAndContinue: "Aceptar y Continuar",
    language: "Idioma",
    english: "Inglés",
    spanish: "Español"
  }
} as const;

export function getStrings(language?: string | null) {
  const normalized = normalizeLanguage(language);
  return strings[normalized] ?? strings[defaultLanguage];
}

export function getLanguageLabel(language: SupportedLanguage, uiLanguage?: string | null) {
  const copy = getStrings(uiLanguage);
  return language === "es" ? copy.spanish : copy.english;
}
