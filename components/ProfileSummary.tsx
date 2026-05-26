"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import { TrophyBadge } from "@/components/TrophyBadge";
import { VisualThemeMenu } from "@/components/VisualThemeMenu";
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
  updateCurrentUserVisualTheme,
  uploadCurrentUserAvatar
} from "@/lib/auth-client";
import { getAccessLevel } from "@/lib/access-levels";
import { showAppToast } from "@/lib/app-toast";
import { normalizeLanguage } from "@/lib/i18n";
import { getSpecialVisualThemeOption } from "@/lib/localized-card-themes";
import type { LegalDocument } from "@/lib/legal";
import { getLanguageLabel, getStrings, getSupportedLanguageOptions, t } from "@/lib/strings";
import { teams } from "@/lib/mock-data";
import { resolveTierAccess } from "@/lib/tier-access";
import { ADMIN_UI_RESET_SIGNAL_STORAGE_KEY } from "@/lib/ui-storage-keys";
import type { UserTrophy } from "@/lib/types";
import type { CurrentLegalDocument } from "@/lib/auth-client";
import { useCurrentUser } from "@/lib/use-current-user";
import {
  getVisualThemeSelectOptions,
  getVisualThemeSelectValue,
  parseVisualThemeSelectValue
} from "@/lib/visual-theme-options";

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
  const [isProfileEditingOpen, setIsProfileEditingOpen] = useSessionDisclosureState("profile-editing-disclosure", false);
  const [isFollowedTeamsOpen, setIsFollowedTeamsOpen] = useSessionDisclosureState("profile-followed-teams-disclosure", false);
  const [followedTeamIdsDraft, setFollowedTeamIdsDraft] = useState<string[]>([]);
  const [followedTeamSelection, setFollowedTeamSelection] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const sortedTeams = useMemo(
    () => [...teams].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    []
  );
  const visualThemeOptions = useMemo(() => getVisualThemeSelectOptions(sortedTeams), [sortedTeams]);
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
      <div className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        {t(null, "profile.loadingProfile")}
      </div>
    );
  }

  const copy = getStrings(user.preferredLanguage);
  const uiLanguage = user.preferredLanguage;
  const currentAccessLevel = getAccessLevel(user);
  const currentTierAccess = resolveTierAccess({
    role: user.role,
    planTier: user.planTier,
    managerLimits: user.managerLimits ?? null
  });
  const hasOrganizerResetAccess = currentAccessLevel !== "player" || managedGroupCount > 0;
  const canUseSelfServiceTestingReset = selfServiceTestResetEnabled && hasOrganizerResetAccess;
  const canSeeSelfServiceTestingResetHint =
    showSelfServiceTestResetHint && hasOrganizerResetAccess && !selfServiceTestResetEnabled;
  const hasPendingFollowedTeamsChanges =
    JSON.stringify(followedTeamIdsDraft) !== JSON.stringify(user.followedTeamIds ?? []);
  const allTeamsFollowed = sortedTeams.length > 0 && followedTeamIdsDraft.length === sortedTeams.length;
  const selectedSpecialVisualTheme = getSpecialVisualThemeOption(user.visualThemeId ?? null);
  const membershipSummaryLines = currentTierAccess.limits.isUnlimited
    ? [
        t(uiLanguage, "profile.membershipUnlimitedGroups"),
        t(uiLanguage, "profile.membershipUnlimitedMembers"),
        t(uiLanguage, "profile.membershipUnlimitedPlayers")
      ]
    : currentTierAccess.accessLevel === "player"
      ? []
      : [
          t(uiLanguage, "profile.membershipMaxGroups", { count: currentTierAccess.limits.maxGroups ?? 0 }),
          t(uiLanguage, "profile.membershipMaxMembersPerGroup", { count: currentTierAccess.limits.maxMembersPerGroup ?? 0 }),
          t(uiLanguage, "profile.membershipMaxTotalPlayers", { count: currentTierAccess.limits.maxTotalPlayers ?? 0 })
        ];

  async function handleVisualThemeSelectionChange(value: string) {
    const selection = parseVisualThemeSelectValue(value);

    setIsUpdatingHomeTeam(true);
    setNotificationMessage(null);

    const updateSteps = selection.visualThemeId
      ? [() => updateCurrentUserVisualTheme(selection.visualThemeId), () => updateCurrentUserHomeTeam(null)]
      : [
          () => updateCurrentUserHomeTeam(selection.homeTeamId),
          ...(user?.visualThemeId ? [() => updateCurrentUserVisualTheme(null)] : [])
        ];

    for (const updateStep of updateSteps) {
      const result = await updateStep();
      if (!result.ok) {
        setNotificationMessage({
          tone: "error",
          text: result.message ?? t(user?.preferredLanguage, "errors.generic")
        });
        setIsUpdatingHomeTeam(false);
        return;
      }
    }

    setNotificationMessage({
      tone: "success",
      text: selection.visualThemeId
        ? "Visual theme updated."
        : selection.homeTeamId
          ? "Home team updated."
          : "Visual theme reset to Auto/default."
    });
    await refresh();
    setIsUpdatingHomeTeam(false);
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[1.15rem] bg-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(uiLanguage, "profile.profile")}</p>
          <div className="rounded-[0.75rem] bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:py-2">
            {t(uiLanguage, "profile.active")}
          </div>
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-4">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="lg" className="rounded-lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black leading-tight sm:text-2xl">{user.name}</h2>
            {membershipSummaryLines.length > 0 ? (
              <div className="mt-2 space-y-0.5 text-sm leading-tight text-accent-dark">
                {membershipSummaryLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
            <p className="mt-2 truncate text-sm text-gray-600">{user.email}</p>
            <div className="mt-2">
              {user.homeTeamId ? (
                <HomeTeamBadge teamId={user.homeTeamId} />
              ) : selectedSpecialVisualTheme ? (
                <span className="ui-chip-sm border border-gray-200 bg-white font-bold text-gray-700">
                  {selectedSpecialVisualTheme.icon} {selectedSpecialVisualTheme.label}
                </span>
              ) : (
                <p className="text-sm text-gray-500">{t(uiLanguage, "profile.noHomeTeamSelected")}</p>
              )}
            </div>
          </div>
        </div>
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
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-accent bg-accent px-3 py-2 text-xs font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
            >
              {isUploadingAvatar
                ? t(uiLanguage, "profile.uploading")
                : user.avatarUrl
                  ? t(uiLanguage, "profile.updateAvatar")
                  : t(uiLanguage, "profile.uploadAvatar")}
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
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
              >
                {isUploadingAvatar ? t(uiLanguage, "auth.working") : t(uiLanguage, "profile.removeAvatar")}
              </button>
            ) : (
              <div />
            )}
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">{t(uiLanguage, "profile.avatarUploadHelp")}</p>
        </div>
      </div>

      <div className="ui-card p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold">{t(uiLanguage, "profile.profileEditing")}</h3>
          <InlineDisclosureButton
            isOpen={isProfileEditingOpen}
            variant="subtle"
            onClick={() => setIsProfileEditingOpen((current) => !current)}
            className="shrink-0"
          />
        </div>
        {isProfileEditingOpen ? (
          <>
            <label className="mt-4 block">
              <span className="text-sm font-bold text-gray-800">{t(uiLanguage, "profile.visualTheme")}</span>
              <p className="mt-1 text-sm font-semibold text-gray-500">{t(uiLanguage, "profile.visualThemeHelp")}</p>
              <VisualThemeMenu
                value={getVisualThemeSelectValue({
                  homeTeamId: user.homeTeamId ?? null,
                  visualThemeId: user.visualThemeId ?? null
                })}
                disabled={isUpdatingHomeTeam}
                options={visualThemeOptions}
                placeholder={t(uiLanguage, "profile.autoDefaultTheme")}
                onChange={(nextValue) => {
                  void handleVisualThemeSelectionChange(nextValue);
                }}
              />
            </label>
            <div id="followed-teams" className="mt-4 rounded-[1.15rem] border border-gray-200 bg-gray-50/70 p-3 scroll-mt-24">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-gray-800">{t(uiLanguage, "profile.followedTeams")}</p>
                <div className="ui-chip-sm border border-gray-200 bg-white font-bold uppercase tracking-wide text-gray-700">
                  {allTeamsFollowed ? t(uiLanguage, "profile.allTeams") : selectedFollowedTeams.length}
                </div>
              </div>
              <p className="mt-1 text-sm font-normal text-gray-500">{t(uiLanguage, "profile.appFocusReminders")}</p>
              <div className="mt-2 flex justify-end">
                <InlineDisclosureButton
                  isOpen={isFollowedTeamsOpen}
                  variant="subtle"
                  onClick={() => setIsFollowedTeamsOpen((current) => !current)}
                />
              </div>
              {isFollowedTeamsOpen ? (
                <>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">{t(uiLanguage, "profile.chooseTeamToFollow")}</span>
                      <select
                        value={followedTeamSelection}
                        onChange={(event) => setFollowedTeamSelection(event.target.value)}
                        className="w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                      >
                        <option value="">{t(uiLanguage, "profile.addTeam")}</option>
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
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-accent bg-accent px-3 py-2 text-xs font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                      >
                        {t(uiLanguage, "profile.addTeam")}
                      </button>
                      <button
                        type="button"
                        disabled={allTeamsFollowed || sortedTeams.length === 0}
                        onClick={() => {
                          setFollowedTeamIdsDraft(sortedTeams.map((team) => team.id));
                          setFollowedTeamSelection("");
                        }}
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                      >
                        {t(uiLanguage, "profile.addAllTeams")}
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
                        className="ui-chip-sm border border-gray-300 bg-white font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                      >
                        {t(uiLanguage, "profile.clear")}
                      </button>
                    ) : null}
                  </div>
                  {allTeamsFollowed ? (
                    <p className="mt-3 rounded-[0.9rem] border border-accent-light bg-accent-light/40 px-3 py-3 text-sm font-semibold text-accent-dark">
                      {t(uiLanguage, "profile.allTeamsDashboardReminders")}
                    </p>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {selectedFollowedTeams.length > 0 ? (
                      selectedFollowedTeams.map((team) => (
                        <div key={team.id} className="flex items-start justify-between gap-3 rounded-[0.9rem] border border-gray-200 bg-white px-3 py-2">
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
                            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 sm:text-sm"
                          >
                            {t(uiLanguage, "common.remove")}
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-[0.9rem] border border-dashed border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-500">
                        {t(uiLanguage, "profile.noTeamsSelected")}
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
                          text: result.message ?? t(user.preferredLanguage, "errors.generic")
                        });
                        if (result.ok) {
                          await refresh();
                        }
                        setIsUpdatingFollowedTeams(false);
                      }}
                      className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-accent bg-accent px-3 py-2 text-xs font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                    >
                      {isUpdatingFollowedTeams ? t(user.preferredLanguage, "common.saving") : t(user.preferredLanguage, "profile.saveFollowedTeams")}
                    </button>
                    <p className="text-xs font-semibold text-gray-500">{t(user.preferredLanguage, "profile.remindersFollowTeams")}</p>
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
                    text: result.message ?? t(user.preferredLanguage, "errors.generic")
                  });
                  if (result.ok) {
                    await refresh();
                  }
                  setIsUpdatingLanguage(false);
                }}
                className="mt-2 w-full rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {getSupportedLanguageOptions(user.preferredLanguage).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
                  className="inline-flex rounded-[0.9rem] border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark"
                >
                  {t(uiLanguage, "profile.signOut")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteAccountPrompt((current) => !current)}
                  className="inline-flex rounded-[0.9rem] border border-rose-300 bg-white px-4 py-3 text-sm font-bold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50"
                >
                  {t(uiLanguage, "profile.deleteMyAccount")}
                </button>
              </div>
              {showDeleteAccountPrompt ? (
                <div className="mt-3 rounded-[1rem] border border-rose-200 bg-rose-50/70 p-3">
                  <p className="text-sm font-semibold text-rose-800">
                    {t(uiLanguage, "profile.deleteAccountConfirm", { email: user.email?.trim().toLowerCase() })}
                  </p>
                  <input
                    type="text"
                    value={deleteAccountConfirmation}
                    onChange={(event) => setDeleteAccountConfirmation(event.target.value)}
                    placeholder={user.email?.trim().toLowerCase() ?? "your email"}
                    className="mt-3 w-full rounded-[0.9rem] border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
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
                          text: result.message ?? t(uiLanguage, "profile.couldNotDeleteAccount")
                        });
                        if (result.ok) {
                          await signOutCurrentUser();
                          router.replace("/login");
                          router.refresh();
                          return;
                        }
                        setIsDeletingAccount(false);
                      }}
                      className="inline-flex rounded-[0.9rem] border border-rose-600 bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
                    >
                      {isDeletingAccount ? t(uiLanguage, "profile.deleting") : t(uiLanguage, "profile.permanentlyDeleteAccount")}
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingAccount}
                      onClick={() => {
                        setShowDeleteAccountPrompt(false);
                        setDeleteAccountConfirmation("");
                      }}
                      className="inline-flex rounded-[0.9rem] border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700"
                    >
                      {t(uiLanguage, "common.cancel")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="ui-card p-4">
        <h3 className="text-lg font-bold">{t(uiLanguage, "profile.notifications")}</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t(uiLanguage, "profile.notificationsDescription")}
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
                          text: result.message ?? t(user.preferredLanguage, "errors.generic")
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
            ? t(uiLanguage, "profile.sending")
            : user.notificationsEnabled
              ? t(uiLanguage, "profile.notificationsOn")
              : t(uiLanguage, "profile.turnOnNotifications")}
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
            {t(uiLanguage, "profile.enablePushInstructions")}
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
                    ? t(uiLanguage, "profile.turnOnLeaderboardNotificationsFirst")
                    : (result.message ?? t(user.preferredLanguage, "errors.generic"))
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
              ? t(uiLanguage, "profile.enabling")
              : user.pushNotificationsEnabled
                ? t(uiLanguage, "profile.pushEnabled")
                : t(uiLanguage, "profile.enablePushNotifications")}
          </button>
          <p className="mt-2 text-xs font-semibold text-gray-500">
            {t(uiLanguage, "profile.pushDescription")}
          </p>
        </div>
      </div>

      <div className="ui-card p-4">
        <h3 className="text-lg font-bold">{t(uiLanguage, "profile.passwordTitle")}</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {t(uiLanguage, "profile.passwordDescription")}
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
              text: result.message ?? t(user.preferredLanguage, "errors.generic")
            });
            setIsSendingReset(false);
          }}
          className="mt-4 w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
        >
          {isSendingReset ? t(uiLanguage, "profile.sending") : t(uiLanguage, "profile.resetMyPassword")}
        </button>
      </div>

      {canSeeSelfServiceTestingResetHint ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">Testing Tools</h3>
            <span className="ui-chip-sm border border-amber-300 bg-white font-bold uppercase tracking-wide text-amber-800">
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
                <span className="ui-chip-sm border border-amber-300 bg-white font-bold uppercase tracking-wide text-amber-800">
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

      <div className="ui-card p-4">
        <h3 className="text-lg font-bold">{t(uiLanguage, "profile.trophies")}</h3>
        {isLoadingTrophies ? (
          <p className="mt-2 text-sm leading-6 text-gray-600">{t(uiLanguage, "profile.loadingTrophies")}</p>
        ) : trophies.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-gray-600">{t(uiLanguage, "profile.noTrophiesYet")}</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {trophies.map((trophy) => (
              <div key={`${trophy.id}-${trophy.awardedAt}`} className="flex items-center gap-3 rounded-[1rem] bg-gray-100 px-3 py-3">
                <TrophyBadge icon={trophy.icon} tier={trophy.tier} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-950">{trophy.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ui-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{t(uiLanguage, "profile.knockoutBracket")}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {t(uiLanguage, "profile.knockoutScoreSeparate")}
            </p>
          </div>
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {t(uiLanguage, "common.pointsShort", { points: bracketScoreSummary.bracketPoints })}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{t(uiLanguage, "bracket.correctPicks")}</p>
            <p className="mt-1 text-2xl font-black text-gray-950">{bracketScoreSummary.correctPicks}</p>
          </div>
          <div className="rounded-md bg-gray-100 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{t(uiLanguage, "bracket.bracketPoints")}</p>
            <p className="mt-1 text-2xl font-black text-gray-950">{bracketScoreSummary.bracketPoints}</p>
          </div>
        </div>
        <a
          href="/knockout"
          className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
        >
          {t(uiLanguage, "bracket.openKnockoutPicks")}
        </a>
      </div>

      <div className="ui-card p-4">
        <h3 className="text-lg font-bold">{copy.termsOfUse}</h3>
        <div className="mt-4 rounded-md bg-gray-100 px-4 py-4">
          <p className="text-sm font-bold text-gray-900">
            {currentLegalDocument?.title ?? user.currentEulaTitle ?? copy.termsOfUse}
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-500">
            {(currentLegalDocument?.body ?? user.currentEulaBody)
              ? t(user.preferredLanguage, "legal.activeTermsLanguage", {
                  termsLabel: copy.termsOfUse.toLowerCase(),
                  languageLabel: getLanguageLabel(normalizeLanguage(currentLegalDocument?.language ?? user.currentEulaLanguage), user.preferredLanguage)
                })
              : t(user.preferredLanguage, "legal.termsUnavailable")}
          </p>
          {(currentLegalDocument?.body ?? user.currentEulaBody) ? (
            <div className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm font-semibold leading-6 text-gray-700">
              {currentLegalDocument?.body ?? user.currentEulaBody}
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">
              {t(user.preferredLanguage, "legal.reviewCurrentTerms")}
            </p>
          )}
        </div>
        {user.needsLegalAcceptance ? (
          <a
            href="/legal/accept?next=/profile"
            className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            {t(uiLanguage, "profile.reviewAcceptTerms")}
          </a>
        ) : (
          <p className="mt-4 text-sm font-semibold text-gray-600">
            {t(uiLanguage, "profile.currentOnTerms")}
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
