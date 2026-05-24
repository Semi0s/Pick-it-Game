"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import { TrophyBadge } from "@/components/TrophyBadge";
import { clearCurrentUserTestPredictionsAction } from "@/app/admin/actions";
import {
  clearCurrentUserAvatar,
  deleteCurrentUserAccount,
  fetchCurrentLegalDocumentForProfile,
  fetchCurrentBracketScoreSummary,
  fetchCurrentUserTrophies,
  registerCurrentBrowserPushNotifications,
  signOutCurrentUser,
  sendCurrentUserPasswordReset,
  updateCurrentUserHomeTeam,
  updateCurrentUserFollowedTeams,
  updateCurrentUserPreferredLanguage,
  updateCurrentUserNotificationPreferences,
  uploadCurrentUserAvatar
} from "@/lib/auth-client";
import { getAccessLevel, getAccessLevelDescription, getAccessLevelLabel } from "@/lib/access-levels";
import { showAppToast } from "@/lib/app-toast";
import type { LegalDocument } from "@/lib/legal";
import { getStrings } from "@/lib/strings";
import { teams } from "@/lib/mock-data";
import { ADMIN_UI_RESET_SIGNAL_STORAGE_KEY } from "@/lib/ui-storage-keys";
import type { UserTrophy } from "@/lib/types";
import type { CurrentLegalDocument } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";

const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";

export function ProfileSummary({
  initialLegalDocument,
  managedGroupCount = 0,
  selfServiceTestResetEnabled = false,
  showSelfServiceTestResetHint = false
}: {
  initialLegalDocument?: LegalDocument | null;
  managedGroupCount?: number;
  selfServiceTestResetEnabled?: boolean;
  showSelfServiceTestResetHint?: boolean;
}) {
  const router = useRouter();
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
  const [isUpdatingFollowedTeams, setIsUpdatingFollowedTeams] = useState(false);
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [deleteAccountMessage, setDeleteAccountMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showDeleteAccountPrompt, setShowDeleteAccountPrompt] = useState(false);
  const [isTestingToolsOpen, setIsTestingToolsOpen] = useSessionDisclosureState("profile-testing-tools-disclosure", false);
  const [testingResetConfirmation, setTestingResetConfirmation] = useState("");
  const [testingResetAcknowledged, setTestingResetAcknowledged] = useState(false);
  const [testingResetReason, setTestingResetReason] = useState("");
  const [isClearingTestPredictions, setIsClearingTestPredictions] = useState(false);
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
  const [isTopCardOpen, setIsTopCardOpen] = useSessionDisclosureState("profile-top-card-disclosure", true);
  const [isFollowedTeamsOpen, setIsFollowedTeamsOpen] = useSessionDisclosureState("profile-followed-teams-disclosure", false);
  const [followedTeamIdsDraft, setFollowedTeamIdsDraft] = useState<string[]>([]);
  const [followedTeamSelection, setFollowedTeamSelection] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const sortedTeams = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    []
  );
  const selectedFollowedTeams = useMemo(
    () => sortedTeams.filter((team) => followedTeamIdsDraft.includes(team.id)),
    [followedTeamIdsDraft, sortedTeams]
  );
  const availableFollowedTeamOptions = useMemo(
    () => sortedTeams.filter((team) => !followedTeamIdsDraft.includes(team.id)),
    [followedTeamIdsDraft, sortedTeams]
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

    const handleAdminResetSignal = (event: StorageEvent) => {
      if (event.key === ADMIN_UI_RESET_SIGNAL_STORAGE_KEY) {
        refreshTrophies();
      }
    };

    window.addEventListener(TROPHY_STATE_CHANGED_EVENT, refreshTrophies as EventListener);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("storage", handleAdminResetSignal);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.removeEventListener(TROPHY_STATE_CHANGED_EVENT, refreshTrophies as EventListener);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("storage", handleAdminResetSignal);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [user?.id]);

  useEffect(() => {
    setFollowedTeamIdsDraft(user?.followedTeamIds ?? []);
  }, [user?.followedTeamIds]);

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
    if (deleteAccountMessage) {
      showAppToast(deleteAccountMessage);
    }
  }, [deleteAccountMessage]);

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
  const currentAccessLevel = getAccessLevel(user);
  const hasOrganizerResetAccess = currentAccessLevel !== "player" || managedGroupCount > 0;
  const canUseSelfServiceTestingReset = selfServiceTestResetEnabled && hasOrganizerResetAccess;
  const canSeeSelfServiceTestingResetHint =
    showSelfServiceTestResetHint && hasOrganizerResetAccess && !selfServiceTestResetEnabled;
  const hasPendingFollowedTeamsChanges =
    JSON.stringify(followedTeamIdsDraft) !== JSON.stringify(user.followedTeamIds ?? []);
  const allTeamsFollowed = sortedTeams.length > 0 && followedTeamIdsDraft.length === sortedTeams.length;

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
        <div id="followed-teams" className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 p-3 scroll-mt-24">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-gray-800">Followed Teams</p>
              <p className="mt-1 text-sm font-semibold text-gray-500">
                These teams tune your dashboard reminder and stay ready for future League and My Picks views.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-gray-700">
                {allTeamsFollowed ? "All teams" : `${selectedFollowedTeams.length} team${selectedFollowedTeams.length === 1 ? "" : "s"}`}
              </div>
              <InlineDisclosureButton
                isOpen={isFollowedTeamsOpen}
                variant="subtle"
                onClick={() => setIsFollowedTeamsOpen((current) => !current)}
              />
            </div>
          </div>
          {isFollowedTeamsOpen ? (
            <>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Choose a team to follow</span>
                  <select
                    value={followedTeamSelection}
                    onChange={(event) => setFollowedTeamSelection(event.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  >
                    <option value="">Add a team</option>
                    {availableFollowedTeamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.groupName} · {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!followedTeamSelection || allTeamsFollowed}
                    onClick={() => {
                      if (!followedTeamSelection) {
                        return;
                      }

                      setFollowedTeamIdsDraft((current) =>
                        current.includes(followedTeamSelection) ? current : [...current, followedTeamSelection]
                      );
                      setFollowedTeamSelection("");
                    }}
                    className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-accent bg-accent px-3 py-2 text-xs font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                  >
                    Add Team
                  </button>
                  <button
                    type="button"
                    disabled={allTeamsFollowed || sortedTeams.length === 0}
                    onClick={() => {
                      setFollowedTeamIdsDraft(sortedTeams.map((team) => team.id));
                      setFollowedTeamSelection("");
                    }}
                    className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                  >
                    Add All Teams
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {user.homeTeamId && !followedTeamIdsDraft.includes(user.homeTeamId) ? (
                  <button
                    type="button"
                    onClick={() => setFollowedTeamIdsDraft((current) => [user.homeTeamId as string, ...current])}
                    className="ui-chip-sm border border-gray-300 bg-white font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                  >
                    Add Home Team
                  </button>
                ) : null}
                {followedTeamIdsDraft.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFollowedTeamIdsDraft([]);
                      setFollowedTeamSelection("");
                    }}
                    className="ui-chip-sm border border-gray-300 bg-white font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {allTeamsFollowed ? (
                <p className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm font-semibold text-green-700">
                  All teams are included in your dashboard reminders.
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                {selectedFollowedTeams.length > 0 ? (
                  selectedFollowedTeams.map((team) => (
                    <div key={team.id} className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-950">
                          {team.flagEmoji ? `${team.flagEmoji} ` : ""}{team.name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-gray-500">{team.groupName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFollowedTeamIdsDraft((current) => current.filter((teamId) => teamId !== team.id))
                        }
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 sm:text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-500">
                    No teams selected yet.
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isUpdatingFollowedTeams || !hasPendingFollowedTeamsChanges}
                  onClick={async () => {
                    setIsUpdatingFollowedTeams(true);
                    setNotificationMessage(null);
                    const result = await updateCurrentUserFollowedTeams(followedTeamIdsDraft);
                    setNotificationMessage({
                      tone: result.ok ? "success" : "error",
                      text: result.message ?? "Something went wrong."
                    });
                    if (result.ok) {
                      await refresh();
                    }
                    setIsUpdatingFollowedTeams(false);
                  }}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-accent bg-accent px-3 py-2 text-xs font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                >
                  {isUpdatingFollowedTeams ? "Saving..." : "Save Followed Teams"}
                </button>
                <p className="text-xs font-semibold text-gray-500">Your dashboard reminder follows these teams.</p>
              </div>
            </>
          ) : null}
        </div>
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
        <div className="mt-5 border-t border-gray-200 pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                await signOutCurrentUser();
                router.replace("/login");
                router.refresh();
              }}
              className="inline-flex rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteAccountPrompt((current) => !current)}
              className="inline-flex rounded-md border border-rose-300 bg-white px-4 py-3 text-sm font-bold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
            >
              Delete my account
            </button>
          </div>
          {showDeleteAccountPrompt ? (
            <div className="mt-3 rounded-md border border-rose-200 bg-rose-50/70 p-3">
              <p className="text-sm font-semibold text-rose-800">
                This permanently deletes your account. Type <span className="font-black">{user.email?.trim().toLowerCase()}</span> to confirm.
              </p>
              <input
                type="text"
                value={deleteAccountConfirmation}
                onChange={(event) => setDeleteAccountConfirmation(event.target.value)}
                placeholder={user.email?.trim().toLowerCase() ?? "your email"}
                className="mt-3 w-full rounded-md border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isDeletingAccount || deleteAccountConfirmation.trim().toLowerCase() !== (user.email?.trim().toLowerCase() ?? "")}
                  onClick={async () => {
                    setIsDeletingAccount(true);
                    setDeleteAccountMessage(null);
                    const result = await deleteCurrentUserAccount(deleteAccountConfirmation);
                    setDeleteAccountMessage({
                      tone: result.ok ? "success" : "error",
                      text: result.message ?? "Could not delete your account."
                    });
                    if (result.ok) {
                      await signOutCurrentUser();
                      router.replace("/login");
                      router.refresh();
                      return;
                    }
                    setIsDeletingAccount(false);
                  }}
                  className="inline-flex rounded-md border border-rose-600 bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
                >
                  {isDeletingAccount ? "Deleting..." : "Permanently delete account"}
                </button>
                <button
                  type="button"
                  disabled={isDeletingAccount}
                  onClick={() => {
                    setShowDeleteAccountPrompt(false);
                    setDeleteAccountConfirmation("");
                  }}
                  className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
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

      {canSeeSelfServiceTestingResetHint ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">Testing Tools</h3>
            <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
              Hidden
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-700">
            The self-service testing reset is available for Captain tier and above, but it is currently disabled in this environment.
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-900/80">
            Set <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-[11px]">ENABLE_SELF_SERVICE_TEST_RESETS=true</code>{" "}
            and restart the app to show the <span className="font-bold">Clear My Test Predictions</span> panel on this page.
          </p>
        </div>
      ) : null}

      {canUseSelfServiceTestingReset ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold">Testing Tools</h3>
                <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                  Testing only
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                Use this only while testing. It clears your saved picks so you can run through the experience again.
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-900/80">
                Visible only when <code className="rounded bg-white/80 px-1 py-0.5 font-mono text-[11px]">ENABLE_SELF_SERVICE_TEST_RESETS=true</code>.
              </p>
            </div>
            <InlineDisclosureButton
              isOpen={isTestingToolsOpen}
              variant="chip"
              onClick={() => setIsTestingToolsOpen((current) => !current)}
            />
          </div>

          {!isTestingToolsOpen ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-white/80 px-4 py-3">
              <p className="text-sm font-semibold text-gray-800">Clear My Test Predictions</p>
              <p className="mt-1 text-sm text-gray-600">
                Hidden by default. Open this section to clear your saved group-stage and knockout testing picks.
              </p>
            </div>
          ) : null}

          {isTestingToolsOpen ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-md border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700">
                This is for testing only. It will clear your saved prediction data so you can test the app again. This cannot be undone.
              </div>

              <div className="rounded-md bg-white px-4 py-4">
                <p className="text-sm font-bold text-gray-900">Clear your test predictions?</p>
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  This will clear your saved group-stage, knockout, and projected knockout picks. Your account, groups, profile, and invitations will remain.
                </p>

                <label className="mt-4 block">
                  <span className="text-sm font-bold text-gray-800">Typed confirmation</span>
                  <input
                    value={testingResetConfirmation}
                    onChange={(event) => setTestingResetConfirmation(event.target.value)}
                    placeholder="RESET MY PICKS"
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>

                <label className="mt-4 block">
                  <span className="text-sm font-bold text-gray-800">Reason</span>
                  <input
                    value={testingResetReason}
                    onChange={(event) => setTestingResetReason(event.target.value)}
                    placeholder="Testing reset reason"
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>

                <label className="mt-4 flex items-start gap-3 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={testingResetAcknowledged}
                    onChange={(event) => setTestingResetAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                  />
                  <span>I understand this will clear my saved test predictions.</span>
                </label>

                <button
                  type="button"
                  disabled={isClearingTestPredictions}
                  onClick={async () => {
                    setIsClearingTestPredictions(true);
                    const result = await clearCurrentUserTestPredictionsAction({
                      confirmationText: testingResetConfirmation,
                      acknowledged: testingResetAcknowledged,
                      reason: testingResetReason
                    });
                    showAppToast({
                      tone: result.ok ? "success" : "error",
                      text: result.ok ? "Your test predictions were cleared." : (result.message ?? "Could not clear your test predictions. Please try again.")
                    });
                    if (result.ok) {
                      setTestingResetConfirmation("");
                      setTestingResetAcknowledged(false);
                      setTestingResetReason("");
                      await refresh();
                    }
                    setIsClearingTestPredictions(false);
                  }}
                  className="mt-4 w-full rounded-md border border-rose-300 bg-rose-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                >
                  {isClearingTestPredictions ? "Clearing..." : "Clear My Test Predictions"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
