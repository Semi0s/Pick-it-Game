import { redactEmailAddress } from "./redact-email.ts";

export const PENDING_CONFIRMATION_EMAIL_STORAGE_KEY = "pickit:pending-confirmation-email";
const PENDING_CONFIRMATION_EMAIL_FALLBACK_STORAGE_KEY = "pickit:pending-confirmation-email:v1";

export function normalizeConfirmationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidConfirmationEmail(email: string) {
  const normalizedEmail = normalizeConfirmationEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

export function maskConfirmationEmail(email: string) {
  return redactEmailAddress(normalizeConfirmationEmail(email));
}

export function storePendingConfirmationEmail(email: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedEmail = normalizeConfirmationEmail(email);
  if (!normalizedEmail) {
    return;
  }

  try {
    window.sessionStorage.setItem(PENDING_CONFIRMATION_EMAIL_STORAGE_KEY, normalizedEmail);
  } catch (error) {
    console.warn("Could not store pending confirmation email.", error);
  }

  try {
    window.localStorage.setItem(PENDING_CONFIRMATION_EMAIL_FALLBACK_STORAGE_KEY, normalizedEmail);
  } catch (error) {
    console.warn("Could not persist pending confirmation email.", error);
  }
}

export function readPendingConfirmationEmail() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const sessionValue = normalizeConfirmationEmail(window.sessionStorage.getItem(PENDING_CONFIRMATION_EMAIL_STORAGE_KEY) ?? "");
    if (sessionValue) {
      return sessionValue;
    }
  } catch (error) {
    console.warn("Could not read pending confirmation email.", error);
  }

  try {
    return normalizeConfirmationEmail(window.localStorage.getItem(PENDING_CONFIRMATION_EMAIL_FALLBACK_STORAGE_KEY) ?? "");
  } catch (error) {
    console.warn("Could not read persisted pending confirmation email.", error);
    return "";
  }
}

export function clearPendingConfirmationEmail() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(PENDING_CONFIRMATION_EMAIL_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear pending confirmation email.", error);
  }

  try {
    window.localStorage.removeItem(PENDING_CONFIRMATION_EMAIL_FALLBACK_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear persisted pending confirmation email.", error);
  }
}
