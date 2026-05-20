"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchGroupInvitePreviewAction } from "@/app/my-groups/actions";
import { authenticateWithEmail, isUsingDemoAuthFallback, sendCurrentUserPasswordReset } from "@/lib/auth-client";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";

type AuthMode = "login" | "signup";

export function LoginForm({
  confirmed = false,
  reset = false,
  initialMode = "login",
  flow,
  language,
  callbackError,
  nextPath,
  inviteToken
}: {
  confirmed?: boolean;
  reset?: boolean;
  initialMode?: AuthMode;
  flow?: string;
  language?: string;
  callbackError?: string;
  nextPath?: string;
  inviteToken?: string | null;
}) {
  const router = useRouter();
  const inviteFlow = flow === "invite";
  const signupContext = initialMode === "signup";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isInviteInfoOpen, setIsInviteInfoOpen] = useSessionDisclosureState("login-invite-info-disclosure", false);
  const [inviteContext, setInviteContext] = useState<{
    groupName: string;
    email: string;
    existingAccount: boolean;
    status: string;
    expiresAt: string | null;
  } | null>(null);
  const isDemoFallback = isUsingDemoAuthFallback();
  const emailBoundInviteFlow = inviteFlow && Boolean(inviteToken);
  const isEmailConfirmationNotice =
    mode === "login" &&
    Boolean(notice) &&
    notice?.toLowerCase().includes("confirm your account") === true;

  useEffect(() => {
    if (!inviteToken) {
      setInviteContext(null);
      return;
    }

    let isMounted = true;
    fetchGroupInvitePreviewAction(inviteToken).then((result) => {
      if (!isMounted || !result.ok) {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    const result = await authenticateWithEmail(mode, email, password, {
      nextPath,
      flow,
      language,
      accessCode: mode === "signup" ? accessCode : undefined
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (result.needsEmailConfirmation) {
      setMode("login");
      setNotice(result.message ?? "Check your email to confirm your account, then sign in.");
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

  async function handlePasswordReset() {
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError("Enter your email first, then tap Forgot password?");
      return;
    }

    setIsSendingReset(true);
    const result = await sendCurrentUserPasswordReset(email);
    setIsSendingReset(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setNotice(result.message ?? "Check your email for the password reset link.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1">
        <ModeButton label="Sign in" isActive={mode === "login"} onClick={() => setMode("login")} />
        <ModeButton label="Sign up" isActive={mode === "signup"} onClick={() => setMode("signup")} />
      </div>

      {isEmailConfirmationNotice ? (
        <div className="rounded-xl border-2 border-green-300 bg-green-100 px-4 py-4 text-center shadow-soft">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-green-700">Almost there</p>
          <p className="mt-2 text-lg font-black leading-tight text-green-900">
            Check your email to confirm your account.
          </p>
          <p className="mt-2 text-sm font-semibold text-green-800">Then come back here and sign in.</p>
        </div>
      ) : null}

      {confirmed ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          Your email has been confirmed. Sign in below.
        </p>
      ) : null}

      {!confirmed && reset ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          Your password has been updated. Sign in below.
        </p>
      ) : null}

      {!isEmailConfirmationNotice && emailBoundInviteFlow && inviteContext ? (
        <p className="rounded-md border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {inviteContext.status !== "pending"
            ? "This invite is no longer active. Ask the organizer for a fresh link if you still need access."
            : confirmed
              ? `Your email is confirmed. Sign in to finish joining ${inviteContext.groupName}.`
              : mode === "login"
                ? `You've been invited to join ${inviteContext.groupName}. Sign in with ${inviteContext.email} to continue.`
                : `You've been invited to join ${inviteContext.groupName}. Create an account with ${inviteContext.email} to continue.`}
        </p>
      ) : !isEmailConfirmationNotice && !confirmed && (inviteFlow || signupContext) ? (
        <p className="rounded-md border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {inviteFlow && mode === "login"
            ? "Use the invited email to sign in and complete your group join."
            : "Use your invited email or the access code from your group organizer to create your account."}
        </p>
      ) : null}

      {callbackError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {callbackError}
        </p>
      ) : null}

      <label className="block">
        <span className="text-sm font-semibold text-gray-800">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        {emailBoundInviteFlow && inviteContext?.email ? (
          <p className="mt-2 text-sm font-medium text-gray-600">
            Use the invited email: {inviteContext.email}
          </p>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gray-800">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          placeholder="At least 6 characters"
          autoComplete="current-password"
          required
        />
      </label>

      {mode === "signup" && !emailBoundInviteFlow ? (
        <label className="block">
          <span className="text-sm font-semibold text-gray-800">Access code</span>
          <input
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            placeholder="Enter your access code"
            autoComplete="one-time-code"
          />
          <p className="mt-2 text-sm font-medium text-gray-600">
            Enter the access code provided by your group organizer.
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
            {isSendingReset ? "Sending reset..." : "Forgot password?"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {notice && !isEmailConfirmationNotice ? (
        <p className="rounded-md border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full rounded-md px-4 py-3 text-base font-bold text-white shadow-soft ${
          mode === "signup" ? "bg-orange-500 hover:bg-orange-500/95" : "bg-accent hover:bg-accent/95"
        }`}
      >
        {isSubmitting
          ? "Working..."
          : emailBoundInviteFlow
            ? mode === "login"
              ? confirmed
                ? "Sign in to finish joining"
                : "Sign in to join"
              : "Create account to join"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
      </button>
      {!isDemoFallback ? (
        <div className="rounded-md border border-accent-light bg-white/95 px-2.5 py-2 text-accent-dark">
          <div className="flex flex-col items-center text-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide">
                Invite-only access • Limited membership
              </p>
            </div>
            <div className="mt-1.5">
              <InlineDisclosureButton
                isOpen={isInviteInfoOpen}
                variant="subtle"
                onClick={() => setIsInviteInfoOpen((current) => !current)}
              />
            </div>
          </div>
          {isInviteInfoOpen ? (
            <>
              <p className="mt-2 border-t border-accent-light pt-2 text-[11px] font-medium">
                Sign up with the email you were invited to the pool.
              </p>
              <p className="mt-2 text-[11px] font-medium text-gray-700">
                If you would like to be placed on the waiting list please visit:
              </p>
              <div className="mt-1.5 flex justify-center">
                <a
                  href="https://www.semiosdesign.com/pick-it-game"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
                >
                  Add Me To The List
                </a>
              </div>
            </>
          ) : null}
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
  isActive: boolean;
  onClick: () => void;
};

function ModeButton({ label, isActive, onClick }: ModeButtonProps) {
  const isSignupButton = label.toLowerCase() === "sign up";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-bold ${
        isActive ? (isSignupButton ? "bg-orange-500 text-white" : "bg-accent text-white") : "text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}
