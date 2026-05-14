"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchGroupInvitePreviewAction } from "@/app/my-groups/actions";
import { completeProfileSetupAction } from "@/app/profile-setup/actions";
import { showAppToast } from "@/lib/app-toast";
import { PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY } from "@/lib/i18n";
import { teams } from "@/lib/mock-data";
import { getStrings } from "@/lib/strings";
import { useCurrentUser } from "@/lib/use-current-user";

export function ProfileSetupForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "es" | "">("");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteGroupName, setInviteGroupName] = useState<string | null>(null);

  const placeholderName = useMemo(() => {
    if (!user) {
      return "";
    }

    return user.name || user.email.split("@")[0] || "Player";
  }, [user]);
  const sortedTeams = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    []
  );

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(nextPath?.startsWith("/") ? nextPath : "/profile-setup")}&mode=signup`);
    }
  }, [isLoading, nextPath, router, user]);

  useEffect(() => {
    if (!isLoading && user?.needsLegalAcceptance) {
      router.replace(`/legal/accept?next=${encodeURIComponent(nextPath?.startsWith("/") ? nextPath : "/profile-setup")}`);
    }
  }, [isLoading, nextPath, router, user]);

  useEffect(() => {
    if (!isLoading && user && !user.needsLegalAcceptance && !user.needsProfileSetup) {
      router.replace(nextPath?.startsWith("/") ? nextPath : "/dashboard");
    }
  }, [isLoading, nextPath, router, user]);

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setDisplayName((current) => current || placeholderName);
    setPreferredLanguage((current) => current || user.preferredLanguage || "en");
    setHomeTeamId((current) => current || user.homeTeamId || "");
  }, [placeholderName, user]);

  useEffect(() => {
    const inviteToken = extractInviteTokenFromNextPath(nextPath);
    if (!inviteToken) {
      setInviteGroupName(null);
      return;
    }

    let isMounted = true;
    fetchGroupInvitePreviewAction(inviteToken).then((result) => {
      if (isMounted && result.ok) {
        setInviteGroupName(result.invite.groupName);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [nextPath]);

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
      preferredLanguage: preferredLanguage || "en",
      homeTeamId: homeTeamId || null
    });

    setIsSubmitting(false);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });

    if (!result.ok) {
      return;
    }

    try {
      window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, preferredLanguage || "en");
    } catch (error) {
      console.warn("Could not persist preferred language during profile setup.", error);
    }

    router.replace(nextPath?.startsWith("/") ? nextPath : "/dashboard");
    router.refresh();
  }

  const copy = getStrings(preferredLanguage || user.preferredLanguage);

  return (
    <section className="mx-auto max-w-md space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Profile setup</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">Choose how you appear in the app.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">
          Finish this once so your picks, groups, and leaderboard show the right identity from the start.
        </p>
        {inviteGroupName ? (
          <p className="mt-2 text-sm font-semibold leading-6 text-accent-dark">
            Choose your display name to finish joining {inviteGroupName}.
          </p>
        ) : null}
        <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">Your email stays as your sign-in.</p>
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
          <p className="mt-2 text-sm font-semibold text-gray-500">This is how other players will see you.</p>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-gray-800">Preferred language</span>
          <p className="mt-1 text-sm font-semibold text-gray-500">Choose the language you want to use in the app.</p>
          <select
            value={preferredLanguage}
            onChange={(event) => setPreferredLanguage(event.target.value === "es" ? "es" : "en")}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          >
            <option value="en">{copy.english}</option>
            <option value="es">{copy.spanish}</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-gray-800">Home team</span>
          <p className="mt-1 text-sm font-semibold text-gray-500">
            Pick a team to follow and highlight throughout the game.
          </p>
          <select
            value={homeTeamId}
            onChange={(event) => setHomeTeamId(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          >
            <option value="">Skip for now</option>
            {sortedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.flagEmoji} {team.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm font-semibold text-gray-500">
            You can always change this later.
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
          {isSubmitting ? "Saving..." : "Enter PICK-IT!"}
        </button>
      </form>
    </section>
  );
}

function extractInviteTokenFromNextPath(nextPath?: string) {
  if (!nextPath?.startsWith("/")) {
    return null;
  }

  try {
    const url = new URL(nextPath, "https://example.test");
    return url.searchParams.get("invite");
  } catch {
    return null;
  }
}
