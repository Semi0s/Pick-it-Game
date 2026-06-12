"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { fetchGroupInvitePreviewAction } from "@/app/group-invite-preview/actions";
import { showAppToast } from "@/lib/app-toast";
import { authenticateWithEmail, isUsingDemoAuthFallback, sendCurrentUserPasswordReset } from "@/lib/auth-client";
import { clearPendingConfirmationEmail, storePendingConfirmationEmail } from "@/lib/auth-confirmation";
import { normalizeLanguage } from "@/lib/i18n";
import { getSupportedLanguageOptions, t } from "@/lib/strings";
import { useViewportAwarePopoverPlacement } from "@/lib/use-viewport-aware-popover-placement";

type AuthMode = "login" | "signup";
const ATTENTION_MESSAGE_CLASS =
  "rounded-[0.9rem] border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700";

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
  const [showConfirmationReminderLink, setShowConfirmationReminderLink] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isAccessCodeOpen, setIsAccessCodeOpen] = useState(Boolean(normalizedInitialAccessCode));
  const [invitePreviewError, setInvitePreviewError] = useState<string | null>(null);
  const [inviteContext, setInviteContext] = useState<{
    groupName: string;
    email: string;
    existingAccount: boolean;
    status: string;
    expiresAt: string | null;
  } | null>(null);
  const isDemoFallback = isUsingDemoAuthFallback();
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const languagePopoverPlacement = useViewportAwarePopoverPlacement({
    isOpen: isLanguageMenuOpen,
    anchorRef: languageMenuRef,
    maxHeight: 260,
    minUsefulHeight: 148
  });
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
      setIsAccessCodeOpen(true);
    }
  }, [normalizedInitialAccessCode, promoManagerCode]);

  useEffect(() => {
    if (!isLanguageMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLanguageMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageMenuOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setShowConfirmationReminderLink(false);
    if (isInvitePreviewLoading) {
      setError(t(uiLanguage, "common.loading"));
      return;
    }

    if (mode === "signup" && existingAccountInviteFlow) {
      setMode("login");
      setNotice(t(uiLanguage, "auth.accountExistsSignInToAcceptInvite"));
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
      if (mode === "login" && isConfirmationRequiredMessage(result.message)) {
        storePendingConfirmationEmail(email);
        setShowConfirmationReminderLink(true);
        setError(t(uiLanguage, "auth.confirmEmailBeforeSignIn"));
        return;
      }

      if (mode === "signup" && isExistingAccountSignupMessage(result.message)) {
        setMode("login");
        setNotice(
          !accessCode.trim()
            ? t(uiLanguage, "auth.accountExistsSignInToRestore")
            : normalizedMessage.includes("already in this group")
            ? t(uiLanguage, "auth.accountExistsAlreadyInGroup")
            : t(uiLanguage, "auth.accountExistsSignInToJoin")
        );
        return;
      }

      setError(result.message);
      return;
    }

    if (result.needsEmailConfirmation) {
      storePendingConfirmationEmail(email);
      router.replace(`/check-email?status=signup&lang=${encodeURIComponent(uiLanguage)}`);
      router.refresh();
      return;
    }

    clearPendingConfirmationEmail();

    if (result.message) {
      showAppToast({ tone: "success", text: result.message });
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
    setIsLanguageMenuOpen(false);
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

  function handleOpenCheckEmailReminder() {
    storePendingConfirmationEmail(email);
    router.push(`/check-email?status=signin&lang=${encodeURIComponent(uiLanguage)}`);
  }

  const showInviteContextFeedback = !isEmailConfirmationNotice && emailBoundInviteFlow && Boolean(inviteContext);
  const showPromoInviteFeedback = !showInviteContextFeedback && !isEmailConfirmationNotice && !confirmed && Boolean(promoManagerCode);
  const showInviteLoginFeedback =
    !showInviteContextFeedback && !showPromoInviteFeedback && !isEmailConfirmationNotice && !confirmed && inviteFlow && mode === "login";
  const hasFeedbackMessages =
    isEmailConfirmationNotice ||
    confirmed ||
    (!confirmed && reset) ||
    showInviteContextFeedback ||
    showPromoInviteFeedback ||
    showInviteLoginFeedback ||
    Boolean(callbackError) ||
    Boolean(invitePreviewError) ||
    Boolean(error) ||
    Boolean(notice && !isEmailConfirmationNotice);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        <div ref={languageMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setIsLanguageMenuOpen((current) => !current)}
            className="inline-flex h-8 items-center gap-1 rounded-[0.85rem] border border-gray-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light sm:h-9 sm:px-2"
            aria-haspopup="menu"
            aria-expanded={isLanguageMenuOpen}
            aria-label={t(uiLanguage, "common.language")}
          >
            <Globe aria-hidden className="h-[18px] w-[18px] text-accent-dark" />
            <span>{uiLanguage.toUpperCase()}</span>
            <ChevronDown aria-hidden className="h-3 w-3 text-gray-500" />
          </button>
          {isLanguageMenuOpen ? (
            <div
              style={languagePopoverPlacement.style}
              className={`absolute right-0 z-20 min-w-40 overflow-y-auto rounded-[1rem] border border-gray-200 bg-white p-1 shadow-lg ${languagePopoverPlacement.className}`}
            >
              {getSupportedLanguageOptions(uiLanguage).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleLanguageChange(option.value)}
                  className={`flex w-full items-center justify-between rounded-[0.75rem] px-3 py-2 text-left text-sm font-semibold transition ${
                    option.value === uiLanguage ? "bg-accent-light text-accent-dark" : "text-gray-700 hover:bg-gray-50"
                  }`}
                  role="menuitem"
                >
                  <span>{option.label}</span>
                  <span className="text-xs font-black uppercase">{option.value}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative grid grid-cols-2 overflow-hidden rounded-full border border-gray-200 bg-white p-1 shadow-inner shadow-gray-200/70">
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full shadow-soft transition-[transform,border-radius,background-color] duration-300 ease-out motion-reduce:transition-none ${
            mode === "signup"
              ? "translate-x-full rounded-l-[0.4rem] rounded-r-full bg-orange-500"
              : "translate-x-0 rounded-l-full rounded-r-[0.4rem] bg-accent"
          }`}
        />
        <ModeButton label={t(uiLanguage, "auth.signIn")} mode="login" isActive={mode === "login"} onClick={() => setMode("login")} />
        <ModeButton
          label={t(uiLanguage, "auth.signUp")}
          mode="signup"
          isActive={mode === "signup"}
          onClick={() => setMode("signup")}
          disabled={existingAccountInviteFlow}
        />
      </div>

      {hasFeedbackMessages ? (
        <div className="space-y-2">
          {isEmailConfirmationNotice ? (
            <div className="rounded-[1.1rem] border-2 border-red-200 bg-red-50 px-4 py-4 text-center shadow-soft">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-red-700">{t(uiLanguage, "auth.almostThere")}</p>
              <p className="mt-2 text-lg font-black leading-tight text-red-900">
                {t(uiLanguage, "auth.checkEmailToConfirm")}
              </p>
              <p className="mt-2 text-sm font-semibold text-red-800">{t(uiLanguage, "auth.thenComeBack")}</p>
            </div>
          ) : null}

          {confirmed ? (
            <p className={ATTENTION_MESSAGE_CLASS}>{t(uiLanguage, "auth.confirmed")}</p>
          ) : null}

          {!confirmed && reset ? (
            <p className={ATTENTION_MESSAGE_CLASS}>{t(uiLanguage, "auth.passwordUpdated")}</p>
          ) : null}

          {showInviteContextFeedback && inviteContext ? (
            <p className={ATTENTION_MESSAGE_CLASS}>
              {inviteContext.status !== "pending"
                ? t(uiLanguage, "auth.inactiveInvite")
                : confirmed
                  ? t(uiLanguage, "auth.confirmedJoinGroup", { groupName: inviteContext.groupName })
                  : mode === "login"
                    ? t(uiLanguage, "auth.invitedToGroupSignIn", { groupName: inviteContext.groupName, email: inviteContext.email })
                    : t(uiLanguage, "auth.invitedToGroupCreate", { groupName: inviteContext.groupName, email: inviteContext.email })}
            </p>
          ) : showPromoInviteFeedback ? (
            <p className={ATTENTION_MESSAGE_CLASS}>{t(uiLanguage, "promoInvite.signupNotice")}</p>
          ) : showInviteLoginFeedback ? (
            <p className={ATTENTION_MESSAGE_CLASS}>{t(uiLanguage, "auth.useInvitedEmailToJoin")}</p>
          ) : null}

          {callbackError ? (
            <p className={ATTENTION_MESSAGE_CLASS}>{callbackError}</p>
          ) : null}

          {invitePreviewError ? (
            <p className={ATTENTION_MESSAGE_CLASS}>{invitePreviewError}</p>
          ) : null}

          {error ? (
            <p className={ATTENTION_MESSAGE_CLASS}>
              {error}
              {showConfirmationReminderLink ? (
                <button
                  type="button"
                  onClick={handleOpenCheckEmailReminder}
                  className="mt-2 block text-sm font-black uppercase tracking-[0.12em] text-red-800 underline underline-offset-4"
                >
                  {t(uiLanguage, "auth.openCheckEmailReminder")}
                </button>
              ) : null}
            </p>
          ) : null}

          {notice && !isEmailConfirmationNotice ? (
            <p className={ATTENTION_MESSAGE_CLASS}>{notice}</p>
          ) : null}
        </div>
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

      {mode === "signup" && !emailBoundInviteFlow && !promoManagerCode ? (
        <p className="rounded-[0.9rem] border border-accent-light bg-accent-light/30 px-3 py-2 text-sm font-semibold leading-6 text-gray-700">
          {t(uiLanguage, "auth.freePlayerSignupIntro")}
        </p>
      ) : null}

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
        <div className="block">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="auth-access-code" className="text-sm font-semibold text-gray-800">
              {t(uiLanguage, "auth.accessCodeOptional")}
            </label>
            <button
              type="button"
              onClick={() => setIsAccessCodeOpen((current) => !current)}
              aria-expanded={isAccessCodeOpen}
              aria-controls="auth-access-code-panel"
              className="inline-flex items-center gap-1 px-0 py-0 text-[10px] font-semibold uppercase tracking-wide text-gray-700 transition hover:text-accent-dark"
            >
              {isAccessCodeOpen ? (
                <ChevronUp aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown aria-hidden className="h-3.5 w-3.5" />
              )}
              {t(uiLanguage, isAccessCodeOpen ? "common.less" : "common.more")}
            </button>
          </div>
          {isAccessCodeOpen ? (
            <div id="auth-access-code-panel">
              <input
                id="auth-access-code"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder={t(uiLanguage, "auth.accessCodePlaceholder")}
                autoComplete="one-time-code"
              />
              <p className="mt-2 text-sm font-medium text-gray-600">
                {t(uiLanguage, mode === "login" ? "auth.accessCodeHelp" : "auth.accessCodeSignupHelp")}
              </p>
            </div>
          ) : null}
        </div>
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

      <div className="sticky bottom-0 -mx-1 mt-1 bg-white/95 px-1 pb-1 pt-3 backdrop-blur supports-[backdrop-filter]:bg-white/85">
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
      </div>
      {isDemoFallback ? (
        <p className="text-sm leading-6 text-gray-600">
          Supabase env vars are missing, so demo auth is active. Try alex@example.com, jamie@example.com,
          morgan@example.com, or admin@example.com with any 6+ character password.
        </p>
      ) : null}
    </form>
  );
}

function isConfirmationRequiredMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("confirm") &&
    normalizedMessage.includes("email") &&
    (normalizedMessage.includes("before signing in") ||
      normalizedMessage.includes("confirmation") ||
      normalizedMessage.includes("not confirmed"))
  );
}

function isExistingAccountSignupMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedMessage.includes("already has an account") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already been registered") ||
    normalizedMessage.includes("already has account state")
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
      aria-pressed={isActive}
      className={`relative z-10 rounded-[0.85rem] px-3 py-2 text-sm font-bold transition-colors duration-200 motion-reduce:transition-none ${
        disabled
          ? "cursor-not-allowed text-gray-400"
          : isActive
            ? "text-white"
            : mode === "signup"
              ? "text-gray-600 hover:text-orange-700"
              : "text-gray-600 hover:text-accent-dark"
      }`}
    >
      {label}
    </button>
  );
}
