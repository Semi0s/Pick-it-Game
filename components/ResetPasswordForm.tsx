"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeLanguage, type AppLanguage } from "@/lib/i18n";
import { t } from "@/lib/strings";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [uiLanguage, setUiLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const supabase = createClient();
    const language = normalizeLanguage(new URLSearchParams(window.location.search).get("lang"));
    setUiLanguage(language);

    async function prepareRecoverySession() {
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const urlError = searchParams.get("error") ?? searchParams.get("error_description");
        const urlErrorCode = searchParams.get("error_code");

        if (urlErrorCode === "missing_pkce_verifier" || isMissingPkceCodeVerifierError(urlError)) {
          setError(t(language, "auth.resetLinkVerifierMissing"));
          return;
        }

        if (urlError) {
          setError(urlError === "missing_pkce_verifier" ? t(language, "auth.resetLinkVerifierMissing") : urlError);
          return;
        }

        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("Failed to exchange recovery code on reset page.", exchangeError);
            setError(exchangeError.message);
            return;
          }
        } else if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email"
          });

          if (verifyError) {
            console.error("Failed to verify recovery OTP on reset page.", verifyError);
            setError(verifyError.message);
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });

          if (sessionError) {
            console.error("Failed to set recovery session from URL hash.", sessionError);
            setError(sessionError.message);
            return;
          }
        }

        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          setError(t(language, "auth.resetLinkExpired"));
          return;
        }

        setNotice(t(language, "auth.resetLinkReady"));
        setIsReady(true);
      } catch (caughtError) {
        console.error("Unexpected error while preparing recovery session.", caughtError);
        setError(t(language, "auth.resetPrepareFailed"));
      }
    }

    prepareRecoverySession();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 6) {
      setError(t(uiLanguage, "auth.passwordTooShort"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t(uiLanguage, "auth.passwordsDoNotMatch"));
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?reset=1");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-gray-800">{t(uiLanguage, "auth.newPassword")}</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          placeholder={t(uiLanguage, "auth.passwordMinPlaceholder")}
          autoComplete="new-password"
          required
          disabled={!isReady || isSubmitting}
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gray-800">{t(uiLanguage, "auth.confirmNewPassword")}</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          placeholder={t(uiLanguage, "auth.repeatNewPasswordPlaceholder")}
          autoComplete="new-password"
          required
          disabled={!isReady || isSubmitting}
        />
      </label>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!isReady || isSubmitting}
        className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
      >
        {isSubmitting ? t(uiLanguage, "auth.updatingPassword") : t(uiLanguage, "auth.updatePassword")}
      </button>

      <p className="text-sm leading-6 text-gray-600">
        {t(uiLanguage, "auth.alreadyBackIn")}{" "}
        <Link href="/login" className="font-bold text-accent-dark underline-offset-2 hover:underline">
          {t(uiLanguage, "auth.returnToSignIn")}
        </Link>
      </p>
    </form>
  );
}

function isMissingPkceCodeVerifierError(message?: string | null) {
  return message?.toLowerCase().includes("pkce code verifier not found in storage") ?? false;
}
