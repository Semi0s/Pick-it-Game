"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fetchGroupInvitePreviewAction } from "@/app/group-invite-preview/actions";
import { authenticateWithEmail, isUsingDemoAuthFallback, sendCurrentUserPasswordReset } from "@/lib/auth-client";
import { normalizeLanguage } from "@/lib/i18n";
import { getSupportedLanguageOptions, t } from "@/lib/strings";

type AuthMode = "login" | "signup";

export function LoginForm({
  confirmed = false,
  reset = false,
  initialMode = "login",
  flow,
  language,
  callbackError,
  nextPath,
  inviteToken,
  initialAccessCode,
  promoManagerCode
}: {
  confirmed?: boolean;
  reset?: boolean;
  initialMode?: AuthMode;
  flow?: string;
  language?: string;
  callbackError?: string;
  nextPath?: string;
  inviteToken?: string | null;
  initialAccessCode?: string | null;
  promoManagerCode?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const uiLanguage = normalizeLanguage(language);
  const inviteFlow = flow === "invite";
  const normalizedInitialAccessCode = promoManagerCode ? "" : initialAccessCode?.trim() ?? "";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState(normalizedInitialAccessCode);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [invitePreviewError, setInvitePreviewError] = useState<string | null>(null);
  const [inviteContext, setInviteContext] = useState<{
    groupName: string;
    email: string;
    existingAccount: boolean;
    status: string;
    expiresAt: string | null;
  } | null>(null);
  const isDemoFallback = isUsingDemoAuthFallback();
  const emailBoundInviteFlow = inviteFlow && Boolean(inviteToken);
  const existingAccountInviteFlow = emailBoundInviteFlow && inviteContext?.existingAccount === true;
  const isInvitePreviewLoading = emailBoundInviteFlow && !inviteContext && !invitePreviewError;
  const isEmailConfirmationNotice =
    mode === "login" &&
    Boolean(notice) &&
    notice?.toLowerCase().includes("confirm your account") === true;

  useEffect(() => {
    if (!inviteToken) {
      setInviteContext(null);
      setInvitePreviewError(null);
      return;
    }

    let isMounted = true;
    setInvitePreviewError(null);
    fetchGroupInvitePreviewAction(inviteToken).then((result) => {
      if (!isMounted) {
        return;
      }

      if (!result.ok) {
        setInviteContext(null);
        setInvitePreviewError(result.message);
        return;
      }

      setInviteContext({
        groupName: result.invite.groupName,
        email: result.invite.email,
        existingAccount: result.invite.existingAccount,
        status: result.invite.status,
        expiresAt: result.invite.expiresAt
      });
    });

    return () => {
      isMounted = false;
    };
  }, [inviteToken]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!inviteContext?.email) {
      return;
    }

    setEmail((current) => current || inviteContext.email);
  }, [inviteContext?.email]);

  useEffect(() => {
    if (existingAccountInviteFlow) {
      setMode("login");
    }
  }, [existingAccountInviteFlow]);

  useEffect(() => {
    if (promoManagerCode) {
      setAccessCode("");
      return;
    }

    if (normalizedInitialAccessCode) {
      setAccessCode((current) => current || normalizedInitialAccessCode);
    }
  }, [normalizedInitialAccessCode, promoManagerCode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (isInvitePreviewLoading) {
      setError(t(uiLanguage, "common.loading"));
      return;
    }

    if (mode === "signup" && existingAccountInviteFlow) {
      setMode("login");
      setNotice(t(uiLanguage, "auth.accountExistsSignInToAcceptInvite"));
      return;
    }

    if (mode === "signup" && !emailBoundInviteFlow && !promoManagerCode && !accessCode.trim()) {
      setError(t(uiLanguage, "auth.accessCodeRequired"));
      return;
    }

    setIsSubmitting(true);
    const result = await authenticateWithEmail(mode, email, password, {
      nextPath,
      flow,
      language,
      accessCode: !promoManagerCode && accessCode.trim() ? accessCode : undefined,
      promoManagerCode: mode === "signup" ? promoManagerCode ?? undefined : undefined
    });
    setIsSubmitting(false);

    if (!result.ok) {
      const normalizedMessage = result.message.toLowerCase();
      if (mode === "signup" && accessCode.trim() && normalizedMessage.includes("already has an account")) {
        setMode("login");
        setNotice(
          normalizedMessage.includes("already in this group")
            ? t(uiLanguage, "auth.accountExistsAlreadyInGroup")
            : t(uiLanguage, "auth.accountExistsSignInToJoin")
        );
        return;
      }

      setError(result.message);
      return;
    }

    if (result.needsEmailConfirmation) {
      setMode("login");
      setNotice(result.message ?? t(uiLanguage, "auth.confirmAccountFallback"));
      return;
    }

    if (result.user?.needsLegalAcceptance) {
      router.replace(`/legal/accept${nextPath?.startsWith("/") ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
      router.refresh();
      return;
    }

    if (result.user?.needsProfileSetup) {
      router.replace(nextPath?.startsWith("/") ? `/profile-setup?next=${encodeURIComponent(nextPath)}` : "/profile-setup");
      router.refresh();
      return;
    }

    router.replace(nextPath?.startsWith("/") ? nextPath : "/dashboard");
    router.refresh();
  }

  function handleLanguageChange(nextLanguage: string) {
    const normalizedLanguage = normalizeLanguage(nextLanguage);
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", normalizedLanguage);
    params.set("mode", mode);
    if (!promoManagerCode && accessCode.trim()) {
      params.set("accessCode", accessCode.trim());
    }
    router.replace(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  async function handlePasswordReset() {
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError(t(uiLanguage, "auth.enterEmailForReset"));
      return;
    }

    setIsSendingReset(true);
    const result = await sendCurrentUserPasswordReset(email);
    setIsSendingReset(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setNotice(result.message ?? t(uiLanguage, "auth.resetLinkSent"));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">{t(uiLanguage, "common.language")}</span>
        <select
          value={uiLanguage}
          onChange={(event) => handleLanguageChange(event.target.value)}
          className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold text-gray-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          aria-label={t(uiLanguage, "common.language")}
        >
          {getSupportedLanguageOptions(uiLanguage).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 rounded-[1rem] bg-white p-1">
        <ModeButton label={t(uiLanguage, "auth.signIn")} mode="login" isActive={mode === "login"} onClick={() => setMode("login")} />
        <ModeButton
          label={t(uiLanguage, "auth.signUp")}
          mode="signup"
          isActive={mode === "signup"}
          onClick={() => setMode("signup")}
          disabled={existingAccountInviteFlow}
        />
      </div>

      {isEmailConfirmationNotice ? (
        <div className="rounded-[1.1rem] border-2 border-green-300 bg-green-100 px-4 py-4 text-center shadow-soft">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-green-700">{t(uiLanguage, "auth.almostThere")}</p>
          <p className="mt-2 text-lg font-black leading-tight text-green-900">
            {t(uiLanguage, "auth.checkEmailToConfirm")}
          </p>
          <p className="mt-2 text-sm font-semibold text-green-800">{t(uiLanguage, "auth.thenComeBack")}</p>
        </div>
      ) : null}

      {confirmed ? (
        <p className="rounded-[0.9rem] border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          {t(uiLanguage, "auth.confirmed")}
        </p>
      ) : null}

      {!confirmed && reset ? (
        <p className="rounded-[0.9rem] border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          {t(uiLanguage, "auth.passwordUpdated")}
        </p>
      ) : null}

      {!isEmailConfirmationNotice && emailBoundInviteFlow && inviteContext ? (
        <p className="rounded-[0.9rem] border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {inviteContext.status !== "pending"
            ? t(uiLanguage, "auth.inactiveInvite")
            : confirmed
              ? t(uiLanguage, "auth.confirmedJoinGroup", { groupName: inviteContext.groupName })
              : mode === "login"
                ? t(uiLanguage, "auth.invitedToGroupSignIn", { groupName: inviteContext.groupName, email: inviteContext.email })
                : t(uiLanguage, "auth.invitedToGroupCreate", { groupName: inviteContext.groupName, email: inviteContext.email })}
        </p>
      ) : !isEmailConfirmationNotice && !confirmed && promoManagerCode ? (
        <p className="rounded-[0.9rem] border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {t(uiLanguage, "promoInvite.signupNotice")}
        </p>
      ) : !isEmailConfirmationNotice && !confirmed && inviteFlow && mode === "login" ? (
        <p className="rounded-[0.9rem] border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {t(uiLanguage, "auth.useInvitedEmailToJoin")}
        </p>
      ) : null}

      {callbackError ? (
        <p className="rounded-[0.9rem] border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {callbackError}
        </p>
      ) : null}

      {invitePreviewError ? (
        <p className="rounded-[0.9rem] border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {invitePreviewError}
        </p>
      ) : null}

      <label className="block">
        <span className="text-sm font-semibold text-gray-800">{t(uiLanguage, "auth.email")}</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        {emailBoundInviteFlow && inviteContext?.email ? (
          <p className="mt-2 text-sm font-medium text-gray-600">
            {t(uiLanguage, "auth.useInvitedEmail", { email: inviteContext.email })}
          </p>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gray-800">{t(uiLanguage, "auth.password")}</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          placeholder={t(uiLanguage, "auth.passwordPlaceholder")}
          autoComplete="current-password"
          required
        />
      </label>

      {!emailBoundInviteFlow && !promoManagerCode ? (
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">
            {t(uiLanguage, mode === "login" ? "auth.accessCodeOptional" : "auth.accessCode")}
          </span>
          <input
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            placeholder={t(uiLanguage, "auth.accessCodePlaceholder")}
            autoComplete="one-time-code"
          />
          <p className="mt-2 text-sm font-medium text-gray-600">
            {t(uiLanguage, mode === "login" ? "auth.accessCodeHelp" : "auth.accessCodeSignupHelp")}
          </p>
        </label>
      ) : null}

      {mode === "login" ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={isSendingReset || isSubmitting}
            className="text-sm font-bold text-accent-dark"
          >
            {isSendingReset ? t(uiLanguage, "auth.sendingReset") : t(uiLanguage, "auth.forgotPassword")}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-[0.9rem] border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {notice && !isEmailConfirmationNotice ? (
        <p className="rounded-[0.9rem] border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || isInvitePreviewLoading}
        className={`w-full rounded-[0.9rem] px-4 py-3 text-base font-bold text-white shadow-soft ${
          mode === "signup" ? "bg-orange-500 hover:bg-orange-500/95" : "bg-accent hover:bg-accent/95"
        }`}
      >
        {isSubmitting || isInvitePreviewLoading
          ? t(uiLanguage, "auth.working")
          : emailBoundInviteFlow
            ? mode === "login"
              ? confirmed
                ? t(uiLanguage, "auth.signInToFinishJoining")
                : t(uiLanguage, "auth.signInToJoin")
              : t(uiLanguage, "auth.createAccountToJoin")
            : mode === "login"
              ? accessCode.trim()
                ? t(uiLanguage, "auth.signInToJoin")
                : t(uiLanguage, "auth.signIn")
              : t(uiLanguage, "auth.createAccount")}
      </button>
      {!isDemoFallback ? (
        <div className="rounded-[1rem] border border-accent-light bg-white/95 px-2.5 py-2 text-accent-dark">
          <div className="flex flex-col items-center text-center">
            <p className="text-[11px] font-black uppercase tracking-wide">
              <span className="block">{t(uiLanguage, "auth.requestAccessLine1")}</span>
              <span className="block">{t(uiLanguage, "auth.requestAccessLine2")}</span>
            </p>
          </div>
          <div className="mt-2 flex justify-center">
            <a
              href="https://www.semiosdesign.com/pick-it-game"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-[0.75rem] border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
            >
              {t(uiLanguage, "auth.contactUs")}
            </a>
          </div>
        </div>
      ) : null}
      {isDemoFallback ? (
        <p className="text-sm leading-6 text-gray-600">
          Supabase env vars are missing, so demo auth is active. Try alex@example.com, jamie@example.com,
          morgan@example.com, or admin@example.com with any 6+ character password.
        </p>
      ) : null}
    </form>
  );
}

type ModeButtonProps = {
  label: string;
  mode: AuthMode;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
};

function ModeButton({ label, mode, isActive, onClick, disabled = false }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-[0.85rem] px-3 py-2 text-sm font-bold ${
        disabled
          ? "cursor-not-allowed text-gray-400"
          : isActive
            ? mode === "signup"
              ? "bg-orange-500 text-white"
              : "bg-accent text-white"
            : "text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}
