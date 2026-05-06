"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import { TrophyBadge } from "@/components/TrophyBadge";
import {
  clearCurrentUserAvatar,
  fetchCurrentLegalDocumentForProfile,
  fetchCurrentBracketScoreSummary,
  fetchCurrentUserTrophies,
  registerCurrentBrowserPushNotifications,
  sendCurrentUserPasswordReset,
  updateCurrentUserHomeTeam,
  updateCurrentUserPreferredLanguage,
  updateCurrentUserNotificationPreferences,
  uploadCurrentUserAvatar
} from "@/lib/auth-client";
import { getAccessLevelDescription, getAccessLevelLabel } from "@/lib/access-levels";
import { showAppToast } from "@/lib/app-toast";
import type { LegalDocument } from "@/lib/legal";
import { getStrings } from "@/lib/strings";
import { teams } from "@/lib/mock-data";
import type { UserTrophy } from "@/lib/types";
import type { CurrentLegalDocument } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";

const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";

export function ProfileSummary({ initialLegalDocument }: { initialLegalDocument?: LegalDocument | null }) {
  const { user, isLoading, refresh } = useCurrentUser();
  const [passwordMessage, setPasswordMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [isUpdatingHomeTeam, setIsUpdatingHomeTeam] = useState(false);
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  const [trophies, setTrophies] = useState<UserTrophy[]>([]);
  const [isLoadingTrophies, setIsLoadingTrophies] = useState(true);
  const [currentLegalDocument, setCurrentLegalDocument] = useState<CurrentLegalDocument | null>(
    initialLegalDocument
      ? {
          language: initialLegalDocument.language,
          requiredVersion: initialLegalDocument.requiredVersion,
          title: initialLegalDocument.title,
          body: initialLegalDocument.body
        }
      : null
  );
  const [bracketScoreSummary, setBracketScoreSummary] = useState<{ bracketPoints: number; correctPicks: number }>({
    bracketPoints: 0,
    correctPicks: 0
  });
  const [isTopCardOpen, setIsTopCardOpen] = useSessionDisclosureState("profile-top-card-disclosure", false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const sortedTeams = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function loadTrophies(showLoading = true) {
      if (showLoading) {
        setIsLoadingTrophies(true);
      }
      const earnedTrophies = await fetchCurrentUserTrophies();
      if (isMounted) {
        setTrophies(earnedTrophies);
        setIsLoadingTrophies(false);
      }
    }

    void loadTrophies();

    const refreshTrophies = () => {
      void loadTrophies(false);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refreshTrophies();
      }
    };

    window.addEventListener(TROPHY_STATE_CHANGED_EVENT, refreshTrophies as EventListener);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.removeEventListener(TROPHY_STATE_CHANGED_EVENT, refreshTrophies as EventListener);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [user?.id]);

  useEffect(() => {
    if (passwordMessage) {
      showAppToast(passwordMessage);
    }
  }, [passwordMessage]);

  useEffect(() => {
    if (notificationMessage) {
      showAppToast(notificationMessage);
    }
  }, [notificationMessage]);

  useEffect(() => {
    let isMounted = true;

    const preferredLanguage = user?.preferredLanguage ?? null;
    if (
      currentLegalDocument &&
      (!preferredLanguage || currentLegalDocument.language === preferredLanguage)
    ) {
      return () => {
        isMounted = false;
      };
    }

    async function loadCurrentLegalDocument() {
      const document = await fetchCurrentLegalDocumentForProfile(user?.preferredLanguage);
      if (isMounted) {
        setCurrentLegalDocument(document ?? currentLegalDocument);
      }
    }

    void loadCurrentLegalDocument();

    return () => {
      isMounted = false;
    };
  }, [currentLegalDocument, user?.preferredLanguage]);

  useEffect(() => {
    let isMounted = true;

    async function loadBracketSummary() {
      const summary = await fetchCurrentBracketScoreSummary();
      if (isMounted) {
        setBracketScoreSummary(summary);
      }
    }

    void loadBracketSummary();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  if (isLoading || !user) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        Loading profile...
      </div>
    );
  }

  const copy = getStrings(user.preferredLanguage);

  return (
    <section className="space-y-5">
      <div className="rounded-lg bg-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Profile</p>
          <div className="rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:py-2">
            Membership Active
          </div>
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-4">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="lg" className="rounded-lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black leading-tight sm:text-2xl">{user.name}</h2>
            <div className="mt-3 flex justify-start">
              <InlineDisclosureButton
                isOpen={isTopCardOpen}
                variant="subtle"
                onClick={() => setIsTopCardOpen((current) => !current)}
              />
            </div>
            {isTopCardOpen ? (
              <>
                <p className="mt-2 text-sm text-accent-dark">
                  {getAccessLevelLabel(user)}
                  {getAccessLevelDescription(user) ? ` · ${getAccessLevelDescription(user)}` : ""}
                </p>
                <p className="truncate text-sm text-gray-600">{user.email}</p>
                <div className="mt-2">
                  {user.homeTeamId ? (
                    <HomeTeamBadge teamId={user.homeTeamId} />
                  ) : (
                    <p className="text-sm text-gray-500">No home team selected</p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
        {isTopCardOpen ? (
          <div className="mt-4 mx-auto max-w-xl text-center">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              setIsUploadingAvatar(true);
              setPasswordMessage(null);
              setNotificationMessage(null);
              const result = await uploadCurrentUserAvatar(file);
              setPasswordMessage({ tone: result.ok ? "success" : "error", text: result.message });
              if (result.ok) {
                await refresh();
              }
              setIsUploadingAvatar(false);
              event.target.value = "";
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isUploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-accent bg-accent px-3 py-2 text-xs font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
            >
              {isUploadingAvatar ? "Uploading..." : user.avatarUrl ? "Update Avatar" : "Upload Avatar"}
            </button>
            {user.avatarUrl ? (
              <button
                type="button"
                disabled={isUploadingAvatar}
                onClick={async () => {
                  setIsUploadingAvatar(true);
                  setPasswordMessage(null);
                  setNotificationMessage(null);
                  const result = await clearCurrentUserAvatar();
                  setPasswordMessage({
                    tone: result.ok ? "success" : "error",
                    text: result.message ?? "Avatar updated."
                  });
                  if (result.ok) {
                    await refresh();
                  }
                  setIsUploadingAvatar(false);
                }}
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
              >
                {isUploadingAvatar ? "Working..." : "Remove Avatar"}
              </button>
            ) : (
              <div />
            )}
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">Optional. If upload fails, your initials stay in place.</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Profile editing</h3>
        <label className="mt-4 block">
          <span className="text-sm font-bold text-gray-800">Home Team</span>
          <p className="mt-1 text-sm font-semibold text-gray-500">Choose the team you&apos;re backing.</p>
          <select
            value={user.homeTeamId ?? ""}
            disabled={isUpdatingHomeTeam}
            onChange={async (event) => {
              setIsUpdatingHomeTeam(true);
              setNotificationMessage(null);
              const result = await updateCurrentUserHomeTeam(event.target.value || null);
              setNotificationMessage({
                tone: result.ok ? "success" : "error",
                text: result.message ?? "Something went wrong."
              });
              if (result.ok) {
                await refresh();
              }
              setIsUpdatingHomeTeam(false);
            }}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
          >
            <option value="">No home team selected</option>
            {sortedTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.flagEmoji} {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-bold text-gray-800">{copy.language}</span>
          <select
            value={user.preferredLanguage ?? "en"}
            disabled={isUpdatingLanguage}
            onChange={async (event) => {
              setIsUpdatingLanguage(true);
              setNotificationMessage(null);
              const result = await updateCurrentUserPreferredLanguage(event.target.value);
              setNotificationMessage({
                tone: result.ok ? "success" : "error",
                text: result.message ?? "Something went wrong."
              });
              if (result.ok) {
                await refresh();
              }
              setIsUpdatingLanguage(false);
            }}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
          >
            <option value="en">{copy.english}</option>
            <option value="es">{copy.spanish}</option>
          </select>
        </label>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Notifications</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Opt in to the big moments only: Perfect Picks, Daily Winner, major jumps up the table, and new comments on
          your activity.
        </p>
        <button
          type="button"
          disabled={isUpdatingNotifications}
          onClick={async () => {
            setIsUpdatingNotifications(true);
            setNotificationMessage(null);
            const result = await updateCurrentUserNotificationPreferences(!(user.notificationsEnabled ?? false));
            setNotificationMessage({
              tone: result.ok ? "success" : "error",
              text: result.message ?? "Something went wrong."
            });
            if (result.ok) {
              await refresh();
            }
            setIsUpdatingNotifications(false);
          }}
          className={`mt-4 inline-flex rounded-md border px-4 py-3 text-sm font-bold transition ${
            user.notificationsEnabled
              ? "border-accent bg-accent-light text-accent-dark"
              : "border-gray-300 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
          } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500`}
        >
          {isUpdatingNotifications
            ? "Updating..."
            : user.notificationsEnabled
              ? "Notifications On"
              : "Turn On Notifications"}
        </button>
        {notificationMessage ? (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold ${
              notificationMessage.tone === "success"
                ? "border-accent-light bg-accent-light text-accent-dark"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notificationMessage.text}
          </p>
        ) : null}
        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-700">
            Enable push notifications for this browser or device.
          </p>
          <button
            type="button"
            disabled={isRegisteringPush || !(user.notificationsEnabled ?? false)}
            onClick={async () => {
              setIsRegisteringPush(true);
              setNotificationMessage(null);
              const result = await registerCurrentBrowserPushNotifications();
              setNotificationMessage({
                tone: result.ok ? "success" : "error",
                text:
                  !(user.notificationsEnabled ?? false) && !result.ok
                    ? "Turn on leaderboard notifications first."
                    : (result.message ?? "Something went wrong.")
              });
              if (result.ok) {
                await refresh();
              }
              setIsRegisteringPush(false);
            }}
            className={`mt-3 inline-flex rounded-md border px-4 py-3 text-sm font-bold transition ${
              user.pushNotificationsEnabled
                ? "border-accent bg-accent-light text-accent-dark"
                : "border-gray-300 bg-white text-gray-800 hover:border-accent hover:bg-accent-light"
            } disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500`}
          >
            {isRegisteringPush
              ? "Enabling..."
              : user.pushNotificationsEnabled
                ? "Push Enabled"
                : "Enable Push Notifications"}
          </button>
          <p className="mt-2 text-xs font-semibold text-gray-500">
            We only use push for Perfect Picks, Daily Winners, big jumps up the table, and new comments.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Password</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Send yourself a password reset email if you want to change how you sign in.
        </p>
        {passwordMessage ? (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold ${
              passwordMessage.tone === "success"
                ? "border-accent-light bg-accent-light text-accent-dark"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {passwordMessage.text}
          </p>
        ) : null}
        <button
          type="button"
          disabled={isSendingReset}
          onClick={async () => {
            setIsSendingReset(true);
            setPasswordMessage(null);
            const result = await sendCurrentUserPasswordReset(user.email);
            setPasswordMessage({
              tone: result.ok ? "success" : "error",
              text: result.message ?? "Something went wrong."
            });
            setIsSendingReset(false);
          }}
          className="mt-4 w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
        >
          {isSendingReset ? "Sending..." : "Reset My Password"}
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Trophies</h3>
        {isLoadingTrophies ? (
          <p className="mt-2 text-sm leading-6 text-gray-600">Loading trophies...</p>
        ) : trophies.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-gray-600">No trophies yet</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {trophies.map((trophy) => (
              <div key={`${trophy.id}-${trophy.awardedAt}`} className="flex items-center gap-3 rounded-lg bg-gray-100 px-3 py-3">
                <TrophyBadge icon={trophy.icon} tier={trophy.tier} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-950">{trophy.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Knockout Bracket</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Your knockout score stays separate from the main leaderboard for now.
            </p>
          </div>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {bracketScoreSummary.bracketPoints} pts
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Correct picks</p>
            <p className="mt-1 text-2xl font-black text-gray-950">{bracketScoreSummary.correctPicks}</p>
          </div>
          <div className="rounded-md bg-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Bracket points</p>
            <p className="mt-1 text-2xl font-black text-gray-950">{bracketScoreSummary.bracketPoints}</p>
          </div>
        </div>
        <a
          href="/knockout"
          className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
        >
          Open Knockout Picks
        </a>
      </div>

      <div className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">{copy.termsOfUse}</h3>
        <div className="mt-4 rounded-md bg-gray-100 px-4 py-4">
          <p className="text-sm font-bold text-gray-900">
            {currentLegalDocument?.title ?? user.currentEulaTitle ?? copy.termsOfUse}
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-500">
            {(currentLegalDocument?.body ?? user.currentEulaBody)
              ? `Showing the active ${copy.termsOfUse.toLowerCase()} in ${
                  (currentLegalDocument?.language ?? user.currentEulaLanguage) === "es" ? copy.spanish : copy.english
                }.`
              : "The active terms are not available in this profile view right now."}
          </p>
          {(currentLegalDocument?.body ?? user.currentEulaBody) ? (
            <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">
              {currentLegalDocument?.body ?? user.currentEulaBody}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">
              Use the button below to open the current acceptance screen and review the active terms directly.
            </p>
          )}
        </div>
        {user.needsLegalAcceptance ? (
          <a
            href="/legal/accept?next=/profile"
            className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Review and Accept Terms
          </a>
        ) : (
          <p className="mt-4 text-sm font-semibold text-gray-600">
            You&apos;re current on the active terms shown above.
          </p>
        )}
      </div>

      {user.role === "admin" ? (
        <div className="rounded-lg border border-accent-light bg-accent-light/40 p-4">
          <h3 className="text-lg font-bold">Super admin access</h3>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            Groups is your main operational hub, with deeper player and manager tools available when you need them.
          </p>
          <a
            href="/admin/players"
            className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Open Player Management
          </a>
        </div>
      ) : null}

    </section>
  );
}
