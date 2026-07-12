"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
import { TeamFlag } from "@/components/TeamFlag";
import { TeamPickerMenu } from "@/components/TeamPickerMenu";
import { TrophyBadge } from "@/components/TrophyBadge";
import { VisualThemeMenu } from "@/components/VisualThemeMenu";
import {
  clearCurrentUserAvatar,
  deleteCurrentUserAccount,
  fetchCurrentUserTrophies,
  registerCurrentBrowserPushNotifications,
  signOutCurrentUser,
  sendCurrentUserPasswordReset,
  updateCurrentUserDisplayName,
  updateCurrentUserHomeTeam,
  updateCurrentUserFollowedTeams,
  updateCurrentUserPreferredLanguage,
  updateCurrentUserNotificationPreferences,
  updateCurrentUserVisualTheme,
  uploadCurrentUserAvatar
} from "@/lib/auth-client";
import { getAccessLevel } from "@/lib/access-levels";
import { showAppToast } from "@/lib/app-toast";
import {
  getAvatarImageInputAcceptAttribute,
  getAvatarImageProcessingErrorMessage,
  processAvatarImage
} from "@/lib/avatar-image-processing";
import { getSpecialVisualThemeOption } from "@/lib/localized-card-themes";
import { getStrings, getSupportedLanguageOptions, t } from "@/lib/strings";
import { teams } from "@/lib/mock-data";
import { compareAccessLevels, resolveTierAccess } from "@/lib/tier-access";
import { ADMIN_UI_RESET_SIGNAL_STORAGE_KEY } from "@/lib/ui-storage-keys";
import type { UserTrophy } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";
import {
  getVisualThemeSelectOptions,
  getVisualThemeSelectValue,
  parseVisualThemeSelectValue
} from "@/lib/visual-theme-options";

const TROPHY_STATE_CHANGED_EVENT = "pickit:trophies-updated";
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "pickit@semiosdesign.com";
const PRIVACY_POLICY_URL = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL?.trim() || "/privacy";

type ProfileTeam = (typeof teams)[number];

function compareTeamsByGroupThenName(left: ProfileTeam, right: ProfileTeam) {
  const groupComparison = left.groupName.localeCompare(right.groupName, undefined, {
    numeric: true,
    sensitivity: "base"
  });

  if (groupComparison !== 0) {
    return groupComparison;
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function getProfileAccessLabel(accessLevel: string) {
  switch (accessLevel) {
    case "captain":
      return "Captain";
    case "manager":
      return "Manager";
    case "director":
      return "Director";
    case "managing_director":
      return "Managing Director";
    case "super_admin":
      return "Super Admin";
    default:
      return "Player";
  }
}

export function ProfileSummary() {
  const router = useRouter();
  const { user, isLoading, refresh } = useCurrentUser();
  const [passwordMessage, setPasswordMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [notificationMessage, setNotificationMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isUpdatingDisplayName, setIsUpdatingDisplayName] = useState(false);
  const [avatarUploadStage, setAvatarUploadStage] = useState<"idle" | "preparing" | "uploading">("idle");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [isUpdatingHomeTeam, setIsUpdatingHomeTeam] = useState(false);
  const [isUpdatingFollowedTeams, setIsUpdatingFollowedTeams] = useState(false);
  const [isUpdatingLanguage, setIsUpdatingLanguage] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState("");
  const [deleteAccountMessage, setDeleteAccountMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showDeleteAccountPrompt, setShowDeleteAccountPrompt] = useState(false);
  const [trophies, setTrophies] = useState<UserTrophy[]>([]);
  const [isLoadingTrophies, setIsLoadingTrophies] = useState(true);
  const [isProfileEditingOpen, setIsProfileEditingOpen] = useSessionDisclosureState("profile-editing-disclosure", false);
  const [isFollowedTeamsOpen, setIsFollowedTeamsOpen] = useSessionDisclosureState("profile-followed-teams-disclosure", false);
  const [followedTeamIdsDraft, setFollowedTeamIdsDraft] = useState<string[]>([]);
  const [followedTeamSelection, setFollowedTeamSelection] = useState("");
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const isUploadingAvatar = avatarUploadStage !== "idle";
  const sortedTeams = useMemo(
    () => [...teams].sort(compareTeamsByGroupThenName),
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
    if (!avatarPreviewUrl?.startsWith("blob:")) {
      return;
    }

    return () => {
      URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    const openFollowedTeamsFromHash = () => {
      if (window.location.hash !== "#followed-teams") {
        return;
      }

      setIsProfileEditingOpen(true);
      setIsFollowedTeamsOpen(true);
    };

    openFollowedTeamsFromHash();
    window.addEventListener("hashchange", openFollowedTeamsFromHash);

    return () => {
      window.removeEventListener("hashchange", openFollowedTeamsFromHash);
    };
  }, [setIsFollowedTeamsOpen, setIsProfileEditingOpen]);

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
  const canEditDisplayName = compareAccessLevels(currentAccessLevel, "manager") >= 0;
  const allTeamsFollowed = sortedTeams.length > 0 && followedTeamIdsDraft.length === sortedTeams.length;
  const selectedSpecialVisualTheme = getSpecialVisualThemeOption(user.visualThemeId ?? null);
  const profileAccessLabel = getProfileAccessLabel(currentTierAccess.accessLevel);

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
        ? t(uiLanguage, "profile.homeTeamUpdated")
        : selection.homeTeamId
          ? t(uiLanguage, "profile.homeTeamUpdated")
          : t(uiLanguage, "profile.homeTeamReset")
    });
    await refresh();
    setIsUpdatingHomeTeam(false);
  }

  async function handleSetFollowedTeams(nextTeamIds: string[]) {
    if (isUpdatingFollowedTeams) {
      return;
    }

    const previousTeamIds = followedTeamIdsDraft;
    setIsUpdatingFollowedTeams(true);
    setNotificationMessage(null);
    setFollowedTeamIdsDraft(nextTeamIds);
    setFollowedTeamSelection("");

    const result = await updateCurrentUserFollowedTeams(nextTeamIds);
    setNotificationMessage({
      tone: result.ok ? "success" : "error",
      text: result.ok
        ? nextTeamIds.length > 0
          ? t(uiLanguage, "profile.followedTeamsUpdated")
          : t(uiLanguage, "profile.followedTeamsCleared")
        : (result.message ?? t(uiLanguage, "errors.generic"))
    });
    if (result.ok) {
      await refresh();
    } else {
      setFollowedTeamIdsDraft(previousTeamIds);
    }
    setIsUpdatingFollowedTeams(false);
  }

  async function handleChangeDisplayName() {
    if (!user || !canEditDisplayName || isUpdatingDisplayName) {
      return;
    }

    const currentDisplayName = user.name;
    const nextDisplayName = window.prompt(t(uiLanguage, "profile.changeDisplayNamePrompt"), currentDisplayName);
    if (nextDisplayName === null) {
      return;
    }

    if (nextDisplayName.trim() === currentDisplayName.trim()) {
      return;
    }

    setIsUpdatingDisplayName(true);
    setPasswordMessage(null);
    const result = await updateCurrentUserDisplayName(nextDisplayName);
    setPasswordMessage({
      tone: result.ok ? "success" : "error",
      text: result.ok ? t(uiLanguage, "profile.displayNameUpdated") : result.message ?? t(uiLanguage, "errors.generic")
    });
    if (result.ok) {
      await refresh();
    }
    setIsUpdatingDisplayName(false);
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[1.15rem] bg-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(uiLanguage, "profile.profile")}</p>
          <div className="ui-chip-sm border border-gray-200 bg-white font-bold text-gray-700">
            {profileAccessLabel}
          </div>
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-4">
          <Avatar name={user.name} avatarUrl={avatarPreviewUrl ?? user.avatarUrl} size="lg" className="rounded-lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black leading-tight sm:text-2xl">{user.name}</h2>
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
      </div>

      <div className="ui-card p-4">
        <h3 className="text-lg font-bold">Account</h3>
        {passwordMessage ? (
          <p
            className={`mt-3 rounded-[0.9rem] border px-3 py-2 text-sm font-semibold ${
              passwordMessage.tone === "success"
                ? "border-accent-light bg-accent-light text-accent-dark"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {passwordMessage.text}
          </p>
        ) : null}
        <div className={canEditDisplayName ? "mt-4 space-y-2" : "mt-4 grid gap-2 sm:grid-cols-2"}>
          <div className={canEditDisplayName ? "grid grid-cols-2 gap-2" : "contents"}>
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
              className="inline-flex min-w-0 items-center justify-center rounded-[0.9rem] border border-gray-300 bg-white px-4 py-3 text-center text-sm font-bold leading-tight text-gray-800 [overflow-wrap:anywhere] transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {isSendingReset ? t(uiLanguage, "profile.sending") : t(uiLanguage, "profile.resetMyPassword")}
            </button>
            {canEditDisplayName ? (
              <button
                type="button"
                disabled={isUpdatingDisplayName}
                onClick={() => void handleChangeDisplayName()}
                aria-label={t(uiLanguage, "profile.changeDisplayName")}
                className="inline-flex min-w-0 items-center justify-center rounded-[0.9rem] border border-gray-300 bg-white px-4 py-3 text-center text-sm font-bold leading-tight text-gray-800 [overflow-wrap:anywhere] transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {isUpdatingDisplayName ? t(uiLanguage, "profile.updatingDisplayName") : t(uiLanguage, "profile.displayNameAction")}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOutCurrentUser();
              router.replace("/login");
              router.refresh();
            }}
            className={`inline-flex min-w-0 items-center justify-center rounded-[0.9rem] border ui-button-accent px-4 py-3 text-center text-sm font-bold leading-tight [overflow-wrap:anywhere] transition ${
              canEditDisplayName ? "w-full" : ""
            }`}
          >
            {t(uiLanguage, "profile.signOut")}
          </button>
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
            <div className="mt-4 rounded-[1rem] border border-gray-200 bg-gray-50/70 p-3">
              <input
                ref={avatarInputRef}
                type="file"
                accept={getAvatarImageInputAcceptAttribute()}
                className="hidden"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }

                  setPasswordMessage(null);
                  setNotificationMessage(null);
                  setAvatarPreviewUrl(null);

                  try {
                    setAvatarUploadStage("preparing");
                    const processedAvatar = await processAvatarImage(file);
                    setAvatarPreviewUrl(processedAvatar.previewUrl);
                    setAvatarUploadStage("uploading");

                    const result = await uploadCurrentUserAvatar(processedAvatar.file);
                    setPasswordMessage({ tone: result.ok ? "success" : "error", text: result.message });
                    if (result.ok) {
                      await refresh();
                    }
                  } catch (caughtError) {
                    setPasswordMessage({
                      tone: "error",
                      text: getAvatarImageProcessingErrorMessage(caughtError)
                    });
                  } finally {
                    setAvatarUploadStage("idle");
                    setAvatarPreviewUrl(null);
                    input.value = "";
                  }
                }}
              />
              <div className="flex items-start gap-3">
                <Avatar name={user.name} avatarUrl={avatarPreviewUrl ?? user.avatarUrl} size="md" className="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-black text-gray-900">Profile photo</h4>
                  <p className="mt-1 text-sm font-semibold text-gray-500">{t(uiLanguage, "profile.avatarUploadHelp")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isUploadingAvatar}
                      onClick={() => avatarInputRef.current?.click()}
                      className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border ui-button-accent px-3 py-2 text-center text-xs font-bold leading-tight [overflow-wrap:anywhere] transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                    >
                      {avatarUploadStage === "preparing"
                        ? "Preparing image..."
                        : avatarUploadStage === "uploading"
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
                          setAvatarUploadStage("uploading");
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
                          setAvatarUploadStage("idle");
                        }}
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-center text-xs font-bold leading-tight text-gray-800 [overflow-wrap:anywhere] transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                      >
                        {isUploadingAvatar ? t(uiLanguage, "auth.working") : t(uiLanguage, "profile.removeAvatar")}
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>
                  {isUploadingAvatar ? (
                    <p className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-gray-600">
                      Media status: Updating
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
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
            <div id="followed-teams" className="mt-4 scroll-mt-24 rounded-[1rem] border border-gray-200 bg-gray-50/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-gray-900">{t(uiLanguage, "profile.followedTeams")}</h4>
                  <p className="mt-1 text-sm font-normal leading-5 text-gray-500">
                    {t(uiLanguage, "profile.appFocusReminders")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="ui-chip-sm border border-gray-200 bg-white font-bold uppercase tracking-wide text-gray-700">
                    {allTeamsFollowed ? t(uiLanguage, "profile.allTeams") : selectedFollowedTeams.length}
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
                    <div className="min-w-0 flex-1">
                      <TeamPickerMenu
                        value={followedTeamSelection}
                        options={availableFollowedTeamOptions}
                        placeholder={t(uiLanguage, "profile.addTeam")}
                        ariaLabel={t(uiLanguage, "profile.chooseTeamToFollow")}
                        disabled={isUpdatingFollowedTeams}
                        onChange={setFollowedTeamSelection}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isUpdatingFollowedTeams || !followedTeamSelection || allTeamsFollowed}
                        onClick={() => {
                          if (!followedTeamSelection) {
                            return;
                          }

                          const nextTeamIds = followedTeamIdsDraft.includes(followedTeamSelection)
                            ? followedTeamIdsDraft
                            : [...followedTeamIdsDraft, followedTeamSelection];
                          void handleSetFollowedTeams(nextTeamIds);
                        }}
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border ui-button-accent px-3 py-2 text-center text-xs font-bold leading-tight [overflow-wrap:anywhere] transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                      >
                        {isUpdatingFollowedTeams ? t(uiLanguage, "common.saving") : t(uiLanguage, "profile.addTeam")}
                      </button>
                      <button
                        type="button"
                        disabled={isUpdatingFollowedTeams || allTeamsFollowed || sortedTeams.length === 0}
                        onClick={() => {
                          void handleSetFollowedTeams(sortedTeams.map((team) => team.id));
                        }}
                        className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-gray-300 bg-white px-3 py-2 text-center text-xs font-bold leading-tight text-gray-800 [overflow-wrap:anywhere] transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
                      >
                        {t(uiLanguage, "profile.addAllTeams")}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {user.homeTeamId && !followedTeamIdsDraft.includes(user.homeTeamId) ? (
                      <button
                        type="button"
                        disabled={isUpdatingFollowedTeams}
                        onClick={() => {
                          void handleSetFollowedTeams([user.homeTeamId as string, ...followedTeamIdsDraft]);
                        }}
                        className="ui-chip-sm border border-gray-300 bg-white font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        {t(uiLanguage, "profile.addHomeTeam")}
                      </button>
                    ) : null}
                    {followedTeamIdsDraft.length > 0 ? (
                      <button
                        type="button"
                        disabled={isUpdatingFollowedTeams}
                        onClick={() => {
                          void handleSetFollowedTeams([]);
                        }}
                        className="ui-chip-sm border border-gray-300 bg-white font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
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
                              <span className="inline-flex items-center gap-1">
                                <TeamFlag
                                  flagEmoji={team.flagEmoji}
                                  teamId={team.id}
                                  shortName={team.shortName}
                                  teamName={team.name}
                                  className="h-[1em] w-[1.45em]"
                                />
                                <span>{team.name}</span>
                              </span>
                            </p>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              <span className="inline-flex items-center gap-1">
                                <span>{team.groupName}</span>
                                <TeamFlag
                                  flagEmoji={team.flagEmoji}
                                  teamId={team.id}
                                  shortName={team.shortName}
                                  teamName={team.name}
                                  className="h-[1em] w-[1.45em]"
                                />
                              </span>
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isUpdatingFollowedTeams}
                            onClick={() => {
                              void handleSetFollowedTeams(followedTeamIdsDraft.filter((teamId) => teamId !== team.id));
                            }}
                            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[0.85rem] border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 sm:text-sm"
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
                    <p className="text-xs font-semibold text-gray-500">{t(uiLanguage, "profile.remindersFollowTeams")}</p>
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
                className={`mt-4 inline-flex rounded-[0.9rem] border px-4 py-3 text-sm font-bold transition ${
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
                  className={`mt-3 rounded-[0.9rem] border px-3 py-2 text-sm font-semibold ${
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
                  className={`mt-3 inline-flex rounded-[0.9rem] border px-4 py-3 text-sm font-bold transition ${
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
            <div className="mt-5 border-t border-gray-200 pt-4">
              <div className="flex flex-wrap gap-2">
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
        <h3 className="text-lg font-bold">Support, privacy, and Terms of Service</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
          Report problems, objectionable content, account issues, or privacy questions from here. You can also review
          the Privacy Policy and Terms of Service. Account deletion is available above in Profile settings, with public
          help below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("PICK-IT! support request")}`}
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Report a problem
          </a>
          <a
            href={PRIVACY_POLICY_URL}
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            {copy.privacyPolicy}
          </a>
          <a
            href="/terms"
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            {copy.termsOfUse}
          </a>
          <a
            href="/support"
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Support
          </a>
          <a
            href="/support#account-deletion"
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Account deletion help
          </a>
        </div>
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
