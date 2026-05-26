"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchGroupInvitePreviewAction } from "@/app/group-invite-preview/actions";
import { completeProfileSetupAction } from "@/app/profile-setup/actions";
import { VisualThemeMenu } from "@/components/VisualThemeMenu";
import { showAppToast } from "@/lib/app-toast";
import {
  APP_LANGUAGE_COOKIE_KEY,
  APP_LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY,
  type AppLanguage
} from "@/lib/i18n";
import { teams } from "@/lib/mock-data";
import { getSupportedLanguageOptions, t } from "@/lib/strings";
import { useCurrentUser } from "@/lib/use-current-user";
import {
  getVisualThemeSelectOptions,
  getVisualThemeSelectValue,
  parseVisualThemeSelectValue
} from "@/lib/visual-theme-options";

export function ProfileSetupForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const { user, isLoading } = useCurrentUser();
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage | "">("");
  const [visualThemeSelection, setVisualThemeSelection] = useState("");
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
  const visualThemeOptions = useMemo(() => getVisualThemeSelectOptions(sortedTeams), [sortedTeams]);

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
    setVisualThemeSelection(
      (current) =>
        current ||
        getVisualThemeSelectValue({
          homeTeamId: user.homeTeamId ?? null,
          visualThemeId: user.visualThemeId ?? null
        })
    );
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
      <div className="rounded-[1rem] bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        {t(user?.preferredLanguage, "profile.loadingSetup")}
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);
    const parsedVisualThemeSelection = parseVisualThemeSelectValue(visualThemeSelection);

    const result = await completeProfileSetupAction({
      displayName: displayName || placeholderName,
      preferredLanguage: preferredLanguage || "en",
      homeTeamId: parsedVisualThemeSelection.homeTeamId,
      visualThemeId: parsedVisualThemeSelection.visualThemeId
    });

    setIsSubmitting(false);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });

    if (!result.ok) {
      return;
    }

    try {
      const nextLanguage = preferredLanguage || "en";
      window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage);
      window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, nextLanguage);
      window.document.cookie = `${APP_LANGUAGE_COOKIE_KEY}=${nextLanguage}; path=/; max-age=31536000; samesite=lax`;
    } catch (error) {
      console.warn("Could not persist preferred language during profile setup.", error);
    }

    router.replace("/start-playing");
    router.refresh();
  }

  const uiLanguage = normalizeLanguage(preferredLanguage || user.preferredLanguage);

  return (
    <section className="mx-auto max-w-md space-y-5">
      <div className="rounded-[1.15rem] bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(uiLanguage, "profile.profileSetup")}</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">{t(uiLanguage, "profile.chooseAppearance")}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">
          {t(uiLanguage, "profile.setupIntro")}
        </p>
        {inviteGroupName ? (
          <p className="mt-2 text-sm font-semibold leading-6 text-accent-dark">
            {t(uiLanguage, "profile.finishJoiningGroup", { groupName: inviteGroupName })}
          </p>
        ) : null}
        <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">{t(uiLanguage, "profile.emailSignIn")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-[1.15rem] border border-gray-200 bg-white p-5">
        <label className="block">
          <span className="text-sm font-bold text-gray-800">{t(uiLanguage, "profile.displayName")}</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={placeholderName}
            className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            required
          />
          <p className="mt-2 text-sm font-semibold text-gray-500">{t(uiLanguage, "profile.displayNameHelp")}</p>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-gray-800">{t(uiLanguage, "profile.preferredLanguage")}</span>
          <p className="mt-1 text-sm font-semibold text-gray-500">{t(uiLanguage, "profile.languageHelp")}</p>
          <select
            value={preferredLanguage}
            onChange={(event) => setPreferredLanguage(normalizeLanguage(event.target.value))}
            className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          >
            {getSupportedLanguageOptions(uiLanguage).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-gray-800">{t(uiLanguage, "profile.visualTheme")}</span>
          <p className="mt-1 text-sm font-semibold text-gray-500">
            {t(uiLanguage, "profile.visualThemeHelp")}
          </p>
          <VisualThemeMenu
            value={visualThemeSelection}
            options={visualThemeOptions}
            placeholder={t(uiLanguage, "profile.autoDefaultTheme")}
            onChange={setVisualThemeSelection}
          />
          <p className="mt-2 text-sm font-semibold text-gray-500">
            {t(uiLanguage, "profile.changeLater")}
          </p>
        </label>

        {message ? (
          <p
            className={`rounded-[0.9rem] border px-3 py-2 text-sm font-semibold ${
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
          className="w-full rounded-[0.9rem] bg-accent px-4 py-3 text-base font-bold text-white shadow-soft"
        >
          {isSubmitting ? t(uiLanguage, "common.saving") : t(uiLanguage, "profile.enterPickIt")}
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
