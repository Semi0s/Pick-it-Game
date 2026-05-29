"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { resendSignupConfirmationEmail } from "@/lib/auth-client";
import {
  clearPendingConfirmationEmail,
  isValidConfirmationEmail,
  maskConfirmationEmail,
  readPendingConfirmationEmail,
  storePendingConfirmationEmail
} from "@/lib/auth-confirmation";
import { appendLanguageToPath, normalizeLanguage } from "@/lib/i18n";
import { t } from "@/lib/strings";

const ATTENTION_STATUS_CLASS = "mt-2 text-xs font-semibold text-red-700";
const ATTENTION_ERROR_CLASS =
  "mt-2 rounded-[0.75rem] border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700";

export function CheckEmailClient({ language }: { language?: string | null }) {
  const uiLanguage = normalizeLanguage(language);
  const [email, setEmail] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const signInHref = appendLanguageToPath("/login", uiLanguage);
  const signupHref = appendLanguageToPath("/login?mode=signup", uiLanguage);

  useEffect(() => {
    const pendingEmail = readPendingConfirmationEmail();
    setEmail(pendingEmail);
    setResendEmail(pendingEmail);
  }, []);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);

    if (!isValidConfirmationEmail(resendEmail)) {
      setError(t(uiLanguage, "auth.enterValidEmail"));
      return;
    }

    setIsResending(true);
    const result = await resendSignupConfirmationEmail(resendEmail, { language: uiLanguage });
    setIsResending(false);

    if (!result.ok) {
      setError(t(uiLanguage, "auth.confirmationEmailSendFailed"));
      return;
    }

    storePendingConfirmationEmail(resendEmail);
    const normalizedEmail = resendEmail.trim().toLowerCase();
    setEmail(normalizedEmail);
    setResendEmail(normalizedEmail);
    setNotice(t(uiLanguage, "auth.confirmationEmailSent"));
  }

  function handleDifferentEmail() {
    clearPendingConfirmationEmail();
  }

  return (
    <div className="rounded-[1.5rem] border border-white/65 bg-white/95 p-5 text-center shadow-2xl shadow-black/25">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[1rem] border border-accent-light bg-accent-light/40 text-accent-dark">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7.5h16v9H4z" />
          <path d="m4.5 8 7.5 5.5L19.5 8" />
        </svg>
      </div>

      <p className="mt-4 text-[11px] font-black uppercase tracking-[0.24em] text-accent-dark">
        {t(uiLanguage, "auth.almostThere")}
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950">{t(uiLanguage, "auth.checkEmailTitle")}</h1>
      <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">{t(uiLanguage, "auth.checkEmailBody")}</p>

      <div className="mt-4 rounded-[1rem] border border-gray-200 bg-gray-50 px-3 py-3">
        {email ? (
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
            {t(uiLanguage, "auth.checkEmailSentTo")}
            <span className="mt-1 block text-sm normal-case tracking-normal text-gray-900">{maskConfirmationEmail(email)}</span>
          </p>
        ) : (
          <p className="text-sm font-semibold text-gray-700">{t(uiLanguage, "auth.checkEmailGenericAddress")}</p>
        )}
      </div>

      <p className="mt-1 text-sm font-medium text-gray-600">{t(uiLanguage, "auth.checkEmailHelper")}</p>

      <div className="mt-5 grid gap-2">
        <Link
          href={signInHref}
          className="inline-flex min-h-11 items-center justify-center rounded-[1rem] bg-accent px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-accent-text shadow-soft transition hover:bg-accent-dark"
        >
          {t(uiLanguage, "auth.goToSignIn")}
        </Link>
      </div>

      <form onSubmit={handleResend} className="mt-5 rounded-[1.15rem] border border-gray-200 bg-white px-3 pb-2 pt-3 text-left">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-red-700">{t(uiLanguage, "auth.needAnotherLink")}</p>
        <label className="mt-3 block">
          <span className="sr-only">{t(uiLanguage, "auth.email")}</span>
          <input
            type="email"
            value={resendEmail}
            onChange={(event) => setResendEmail(event.target.value)}
            className="w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <button
          type="submit"
          disabled={isResending}
          className="mt-2 inline-flex w-full items-center justify-center rounded-[0.9rem] border border-gray-300 bg-gray-50 px-3 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-gray-900 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResending ? t(uiLanguage, "auth.resendingConfirmationEmail") : t(uiLanguage, "auth.resendConfirmationEmail")}
        </button>
        <p className="mt-2 text-[10px] font-medium leading-4 text-gray-500">{t(uiLanguage, "auth.checkEmailSpam")}</p>
        {notice ? (
          <div aria-live="polite" className={ATTENTION_STATUS_CLASS}>
            {notice}
          </div>
        ) : null}
        {error ? (
          <p aria-live="assertive" className={ATTENTION_ERROR_CLASS}>
            {error}
          </p>
        ) : null}
      </form>

      <Link
        href={signupHref}
        onClick={handleDifferentEmail}
        className="mt-4 inline-flex text-xs font-bold uppercase tracking-[0.14em] text-gray-500 transition hover:text-accent-dark"
      >
        {t(uiLanguage, "auth.useDifferentEmail")}
      </Link>
    </div>
  );
}
