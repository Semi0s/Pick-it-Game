"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticateWithEmail, isUsingDemoAuthFallback, sendCurrentUserPasswordReset } from "@/lib/auth-client";

type AuthMode = "login" | "signup";

export function LoginForm({
  confirmed = false,
  reset = false,
  initialMode = "login",
  flow,
  callbackError,
  nextPath
}: {
  confirmed?: boolean;
  reset?: boolean;
  initialMode?: AuthMode;
  flow?: string;
  callbackError?: string;
  nextPath?: string;
}) {
  const router = useRouter();
  const inviteFlow = flow === "invite";
  const signupContext = initialMode === "signup";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const isDemoFallback = isUsingDemoAuthFallback();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    const result = await authenticateWithEmail(mode, email, password, {
      nextPath,
      flow
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (result.needsEmailConfirmation) {
      setNotice(result.message ?? "Check your email to confirm your account, then sign in.");
      return;
    }

    if (result.user?.needsLegalAcceptance) {
      router.replace(`/legal/accept${nextPath?.startsWith("/") ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
      router.refresh();
      return;
    }

    if (result.user?.needsProfileSetup) {
      router.replace("/profile-setup");
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
      {!isDemoFallback ? (
        <div className="rounded-md border border-accent-light bg-white px-3 py-3 text-accent-dark">
          <p className="text-base font-black uppercase tracking-wide">Invite-only access</p>
          <p className="mt-1 text-sm font-medium">Sign up with the email that was invited to the pool.</p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-1">
        <ModeButton label="Sign in" isActive={mode === "login"} onClick={() => setMode("login")} />
        <ModeButton label="Sign up" isActive={mode === "signup"} onClick={() => setMode("signup")} />
      </div>

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

      {!confirmed && (inviteFlow || signupContext) ? (
        <p className="rounded-md border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          Use your invited email to create your account or sign in below.
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

      {notice ? (
        <p className="rounded-md border border-accent-light bg-white px-3 py-2 text-sm font-medium text-accent-dark">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white shadow-soft"
      >
        {isSubmitting ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
      </button>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm font-bold ${
        isActive ? "bg-accent text-white" : "text-gray-600"
      }`}
    >
      {label}
    </button>
  );
}
