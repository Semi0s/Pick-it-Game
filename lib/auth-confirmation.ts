import { redactEmailAddress } from "./redact-email.ts";

export const PENDING_CONFIRMATION_EMAIL_STORAGE_KEY = "pickit:pending-confirmation-email";

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
}

export function readPendingConfirmationEmail() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return normalizeConfirmationEmail(window.sessionStorage.getItem(PENDING_CONFIRMATION_EMAIL_STORAGE_KEY) ?? "");
  } catch (error) {
    console.warn("Could not read pending confirmation email.", error);
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
}
