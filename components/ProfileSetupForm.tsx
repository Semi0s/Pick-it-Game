"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchGroupInvitePreviewAction } from "@/app/group-invite-preview/actions";
import { completeProfileSetupAction } from "@/app/profile-setup/actions";
import { TeamPickerMenu } from "@/components/TeamPickerMenu";
import { TeamFlag } from "@/components/TeamFlag";
import { VisualThemeMenu } from "@/components/VisualThemeMenu";
import { showAppToast } from "@/lib/app-toast";
import {
  registerCurrentBrowserPushNotifications,
  updateCurrentUserNotificationPreferences
} from "@/lib/auth-client";
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
  const { user, isLoading, refresh } = useCurrentUser();
  const [displayName, setDisplayName] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<AppLanguage | "">("");
  const [visualThemeSelection, setVisualThemeSelection] = useState("");
  const [followedTeamIdsDraft, setFollowedTeamIdsDraft] = useState<string[]>([]);
  const [followedTeamSelection, setFollowedTeamSelection] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
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
  const sortedFollowTeams = useMemo(
    () =>
      [...teams].sort((left, right) => {
        const groupCompare = left.groupName.localeCompare(right.groupName, undefined, { sensitivity: "base" });
        return groupCompare || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }),
    []
  );
  const visualThemeOptions = useMemo(() => getVisualThemeSelectOptions(sortedTeams), [sortedTeams]);
  const selectedFollowedTeams = useMemo(
    () => sortedFollowTeams.filter((team) => followedTeamIdsDraft.includes(team.id)),
    [followedTeamIdsDraft, sortedFollowTeams]
  );
  const availableFollowedTeamOptions = useMemo(
    () => sortedFollowTeams.filter((team) => !followedTeamIdsDraft.includes(team.id)),
    [followedTeamIdsDraft, sortedFollowTeams]
  );
  const selectedVisualThemeHomeTeamId = parseVisualThemeSelectValue(visualThemeSelection).homeTeamId;
  const canAddVisualThemeTeam =
    Boolean(selectedVisualThemeHomeTeamId) && !followedTeamIdsDraft.includes(selectedVisualThemeHomeTeamId as string);

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
    setFollowedTeamIdsDraft((current) => (current.length > 0 ? current : user.followedTeamIds ?? []));
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
      visualThemeId: parsedVisualThemeSelection.visualThemeId,
      followedTeamIds: followedTeamIdsDraft
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

        <div className="rounded-[1rem] border border-gray-200 bg-gray-50/80 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-gray-800">{t(uiLanguage, "profile.followedTeams")}</span>
              </div>
              <p className="mt-1 text-sm font-normal leading-5 text-gray-500">
                {t(uiLanguage, "profile.followedTeamsSetupHelp")}
              </p>
            </div>
            <span className="ui-chip-sm shrink-0 border border-gray-200 bg-white font-bold uppercase tracking-wide text-gray-700">
              {selectedFollowedTeams.length}
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <TeamPickerMenu
              value={followedTeamSelection}
              options={availableFollowedTeamOptions}
              placeholder={t(uiLanguage, "profile.addTeam")}
              ariaLabel={t(uiLanguage, "profile.chooseTeamToFollow")}
              onChange={setFollowedTeamSelection}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!followedTeamSelection}
                onClick={() => {
                  if (!followedTeamSelection) {
                    return;
                  }

                  setFollowedTeamIdsDraft((current) =>
                    current.includes(followedTeamSelection) ? current : [...current, followedTeamSelection]
                  );
                  setFollowedTeamSelection("");
                }}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border ui-button-accent px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {t(uiLanguage, "profile.addTeam")}
              </button>
              {canAddVisualThemeTeam ? (
                <button
                  type="button"
                  onClick={() => {
                    setFollowedTeamIdsDraft((current) =>
                      selectedVisualThemeHomeTeamId && !current.includes(selectedVisualThemeHomeTeamId)
                        ? [selectedVisualThemeHomeTeamId, ...current]
                        : current
                    );
                  }}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                >
                  {t(uiLanguage, "profile.addHomeTeam")}
                </button>
              ) : null}
              {followedTeamIdsDraft.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setFollowedTeamIdsDraft([]);
                    setFollowedTeamSelection("");
                  }}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                >
                  {t(uiLanguage, "profile.clear")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {selectedFollowedTeams.length > 0 ? (
              selectedFollowedTeams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setFollowedTeamIdsDraft((current) => current.filter((teamId) => teamId !== team.id))}
                  className="ui-chip-sm border border-gray-200 bg-white font-bold text-gray-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                  aria-label={`${t(uiLanguage, "common.remove")} ${team.name}`}
                >
                  <TeamFlag
                    flagEmoji={team.flagEmoji}
                    teamId={team.id}
                    shortName={team.shortName}
                    teamName={team.name}
                    className="h-[1em] w-[1.45em]"
                  />
                  <span>{team.shortName}</span>
                  <span aria-hidden>×</span>
                </button>
              ))
            ) : (
              <p className="text-xs font-semibold text-gray-500">{t(uiLanguage, "profile.noTeamsSelected")}</p>
            )}
          </div>
        </div>

        <div className="rounded-[1rem] border border-gray-200 bg-gray-50/80 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-gray-800">{t(uiLanguage, "profile.notifications")}</p>
                <span
                  className={`ui-chip-sm border font-bold uppercase tracking-wide ${
                    user.notificationsEnabled
                      ? "border-accent-light bg-accent-light text-accent-dark"
                      : "border-gray-200 bg-white text-gray-500"
                  }`}
                >
                  {user.notificationsEnabled
                    ? t(uiLanguage, "profile.notificationsOn")
                    : t(uiLanguage, "profile.notificationsOff")}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold leading-5 text-gray-500">
                {t(uiLanguage, "profile.notificationsSetupHelp")}
              </p>
            </div>
            <button
              type="button"
              disabled={isUpdatingNotifications}
              onClick={async () => {
                const nextNotificationsEnabled = !user.notificationsEnabled;
                setIsUpdatingNotifications(true);
                setMessage(null);
                try {
                  const result = await updateCurrentUserNotificationPreferences(nextNotificationsEnabled);
                  const pushResult =
                    result.ok && nextNotificationsEnabled ? await registerCurrentBrowserPushNotifications() : null;
                  setMessage({
                    tone: result.ok ? "success" : "error",
                    text: result.ok
                      ? t(
                          uiLanguage,
                          nextNotificationsEnabled
                            ? "profile.notificationsUpdatedOn"
                            : "profile.notificationsUpdatedOff"
                        ) + (pushResult?.message ? ` ${pushResult.message}` : "")
                      : result.message ?? t(uiLanguage, "errors.generic")
                  });
                  if (result.ok) {
                    await refresh();
                  }
                } catch {
                  setMessage({ tone: "error", text: t(uiLanguage, "errors.generic") });
                } finally {
                  setIsUpdatingNotifications(false);
                }
              }}
              className="inline-flex min-w-0 items-center justify-center rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-center text-xs font-bold leading-tight text-gray-800 [overflow-wrap:anywhere] transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {isUpdatingNotifications
                ? t(uiLanguage, "profile.sending")
                : user.notificationsEnabled
                  ? t(uiLanguage, "profile.turnOffNotifications")
                  : t(uiLanguage, "profile.turnOnNotifications")}
            </button>
          </div>
        </div>

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
