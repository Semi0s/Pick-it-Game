"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { completeProfileSetupAction } from "@/app/profile-setup/actions";
import { showAppToast } from "@/lib/app-toast";
import { useCurrentUser } from "@/lib/use-current-user";

export function ProfileSetupForm() {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const placeholderName = useMemo(() => {
    if (!user) {
      return "";
    }

    return user.name || user.email.split("@")[0] || "Player";
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login?next=/profile-setup&mode=signup");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && user?.needsLegalAcceptance) {
      router.replace("/legal/accept?next=/profile-setup");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && user && !user.needsLegalAcceptance && !user.needsProfileSetup) {
      router.replace("/dashboard");
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  if (isLoading || !user || user.needsLegalAcceptance) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        Loading profile setup...
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    const result = await completeProfileSetupAction({
      displayName: displayName || placeholderName,
      username
    });

    setIsSubmitting(false);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });

    if (!result.ok) {
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <section className="mx-auto max-w-md space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Profile setup</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">Choose how you appear in the app.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">
          Finish this once so your group invites, scores, and leaderboard view all use the name and username you choose.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <label className="block">
          <span className="text-sm font-bold text-gray-800">Display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={placeholderName}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-gray-800">Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Pick a username"
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            required
          />
          <p className="mt-2 text-sm font-semibold text-gray-500">
            3-24 characters. Use letters, numbers, spaces, periods, hyphens, or underscores.
          </p>
        </label>

        {message ? (
          <p
            className={`rounded-md border px-3 py-2 text-sm font-semibold ${
              message.tone === "success"
                ? "border-accent-light bg-accent-light text-accent-dark"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white shadow-soft"
        >
          {isSubmitting ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </section>
  );
}
