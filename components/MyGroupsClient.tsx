"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import {
  acceptGroupInviteAction,
  assignCaptainsPassAction,
  awardManagedGroupTrophyAction,
  cancelGroupInviteAction,
  createCaptainManagedGroupInviteAction,
  createGroupAction,
  createGroupInviteAction,
  createManagedGroupInviteCodeAction,
  createManagedGroupTrophyAction,
  deactivateManagedGroupInviteCodeAction,
  deleteManagedGroupAction,
  fetchManagedGroupDetailAction,
  fetchGroupInvitePreviewAction,
  fetchMyGroupsAction,
  removeManagedGroupAllowedEmailAction,
  removeManagedGroupAvatarAction,
  removeGroupMemberAction,
  resendGroupInviteAction,
  saveManagedGroupAllowedEmailsAction,
  uploadManagedGroupAvatarAction,
  updateManagedGroupAccessAction,
  updateManagedGroupProfileAction,
  updateManagedGroupLimitAction,
  updateGroupInviteNameAction,
  type ManagedGroupDetails,
  type FetchMyGroupsResult,
  type MyManagedGroup
} from "@/app/my-groups/actions";
import { Avatar } from "@/components/Avatar";
import { DismissibleHelperText, useDismissedHelperState } from "@/components/DismissibleHelperText";
import { ManagedTrophyAwardSheet } from "@/components/ManagedTrophyAwardSheet";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { OrganizationBrandingPanel } from "@/components/OrganizationBrandingPanel";
import { TierIconBadge } from "@/components/TierIconBadge";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { showAppToast } from "@/lib/app-toast";
import { formatDateOnly } from "@/lib/date-time";
import {
  appendExplainerLanguageToPath,
  appendLanguageToPath,
  normalizeExplainerLanguage,
  normalizeLanguage,
  type ExplainerLanguage,
  type SupportedLanguage
} from "@/lib/i18n";
import {
  ActionButton,
  HierarchyPanel,
  InlineDisclosureButton,
  InlineConfirmation,
  InviteEntryForm,
  InlineTextConfirmation,
  ManagementBadge,
  ManagementCard,
  ManagementDatum,
  ManagementEmptyState,
  ManagementGrid,
  ManagementIntro,
  normalizeInviteTokenInput,
  useSessionDisclosureState
} from "@/components/player-management/Shared";
import {
  MAX_GROUP_AVATAR_FILE_BYTES,
  getGroupInviteSourceLabel,
  getGroupJoinSourceLabel,
  MAX_CAPTAIN_PRIVATE_GROUP_MEMBERS,
  normalizeGroupAccessMode
} from "@/lib/group-management";
import { redactEmailAddress } from "@/lib/redact-email";

type MyGroupsClientProps = {
  inviteToken?: string;
  inviteLanguage?: string;
  inviteHelperLanguage?: string;
  forceCreateGroupOpen?: boolean;
};

type ToastState = { tone: "success" | "error" | "tip"; text: string } | null;
const PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY = "pickit:play-explainer-language";
const GROUP_DISCLOSURE_STORAGE_KEY = "my-groups-expanded-groups";
const GROUP_INVITE_CODE_SECTION_STORAGE_KEY = "my-groups-expanded-group-invite-code-sections";
const GROUP_LIMIT_SECTION_STORAGE_KEY = "my-groups-expanded-group-limit-sections";
const GROUP_PEOPLE_SECTION_STORAGE_KEY = "my-groups-expanded-group-people-sections";
const GROUP_TROPHY_SECTION_STORAGE_KEY = "my-groups-expanded-group-trophy-sections";
const GROUP_INFO_SECTION_STORAGE_KEY = "my-groups-expanded-group-info-sections";
const CREATE_GROUP_DISCLOSURE_STORAGE_KEY = "my-groups-create-group";
const GROUP_LIMIT_WARNING_DISMISS_PREFIX = "pickit:tip:my-groups-group-limit-warning";
const TROPHY_PROMPTS = [
  { name: "Office Oracle", icon: "🧠", description: "Sees the result before the rest of the room does." },
  { name: "The Messi of Marketing", icon: "🐐", description: "Turns bold calls into highlight reels." },
  { name: "Data Wizard", icon: "📊", description: "Backs every pick with suspiciously good logic." },
  { name: "Drama King", icon: "🎭", description: "Never met a chaotic scoreline they didn't love." }
] as const;

type GroupAvatarDraft = {
  file: File | null;
  previewUrl: string | null;
  removeCurrent: boolean;
};

export function MyGroupsClient({ inviteToken, inviteLanguage, inviteHelperLanguage, forceCreateGroupOpen }: MyGroupsClientProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<FetchMyGroupsResult | null>(null);
  const [message, setMessage] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [groupDetailsById, setGroupDetailsById] = useState<Record<string, ManagedGroupDetails>>({});
  const [loadingGroupDetailIds, setLoadingGroupDetailIds] = useState<Record<string, boolean>>({});
  const [groupDetailErrors, setGroupDetailErrors] = useState<Record<string, string>>({});
  const [managerCustomTrophiesEnabled, setManagerCustomTrophiesEnabled] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [membershipLimit, setMembershipLimit] = useState("");
  const [createGroupInviteEmails, setCreateGroupInviteEmails] = useState("");
  const [groupLimitForms, setGroupLimitForms] = useState<Record<string, string>>({});
  const [groupProfileDrafts, setGroupProfileDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const [groupAvatarDrafts, setGroupAvatarDrafts] = useState<Record<string, GroupAvatarDraft>>({});
  const [allowedEmailsDrafts, setAllowedEmailsDrafts] = useState<Record<string, string>>({});
  const [captainPassSelections, setCaptainPassSelections] = useState<Record<string, { userId: string; allowance: string }>>({});
  const [captainInviteEmailsByGroup, setCaptainInviteEmailsByGroup] = useState<Record<string, string>>({});
  const [editingInviteNames, setEditingInviteNames] = useState<Record<string, string>>({});
  const [newInviteEmailsByGroup, setNewInviteEmailsByGroup] = useState<Record<string, string>>({});
  const [inviteCodeDrafts, setInviteCodeDrafts] = useState<Record<string, string>>({});
  const [inviteCodeActionGroupId, setInviteCodeActionGroupId] = useState<string | null>(null);
  const [inviteCodeActionType, setInviteCodeActionType] = useState<"create" | "replace" | "deactivate" | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [manualInviteLinkByGroup, setManualInviteLinkByGroup] = useState<Record<string, { url: string; note: string }>>({});
  const [invitePreviewMessage, setInvitePreviewMessage] = useState<ToastState>(null);
  const [invitePreview, setInvitePreview] = useState<{
    groupName: string;
    email: string;
    existingAccount: boolean;
    customMessage?: string | null;
    language: SupportedLanguage;
    helperLanguage: ExplainerLanguage;
    status: string;
    expiresAt: string | null;
  } | null>(null);
  const [isLoadingInvitePreview, setIsLoadingInvitePreview] = useState(Boolean(inviteToken));
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    key: string;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    key: string;
    groupId: string;
    groupName: string;
  } | null>(null);
  const [deleteConfirmationValue, setDeleteConfirmationValue] = useState("");
  const [inviteEntryValue, setInviteEntryValue] = useState("");
  const [inviteEntryError, setInviteEntryError] = useState<string | null>(null);
  const [superAdminGroupQuery, setSuperAdminGroupQuery] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [groupDirectoryState, setGroupDirectoryState] = useState<
    Record<string, { search: string; filter: "all" | "members" | "pending" | "accepted" }>
  >({});
  const [expandedInviteEditorIds, setExpandedInviteEditorIds] = useState<string[]>([]);
  const [expandedInviteCodeIds, setExpandedInviteCodeIds] = useState<string[]>([]);
  const [expandedGroupLimitIds, setExpandedGroupLimitIds] = useState<string[]>([]);
  const [expandedPeopleInviteIds, setExpandedPeopleInviteIds] = useState<string[]>([]);
  const [expandedTrophyIds, setExpandedTrophyIds] = useState<string[]>([]);
  const [expandedGroupInfoIds, setExpandedGroupInfoIds] = useState<string[]>([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useSessionDisclosureState(CREATE_GROUP_DISCLOSURE_STORAGE_KEY, false);

  useEffect(() => {
    if (forceCreateGroupOpen) {
      setIsCreateGroupOpen(true);
    }
  }, [forceCreateGroupOpen, setIsCreateGroupOpen]);
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const [hasRestoredGroupDisclosureState, setHasRestoredGroupDisclosureState] = useState(false);
  const [hasRestoredGroupLimitState, setHasRestoredGroupLimitState] = useState(false);
  const [hasRestoredInviteCodeState, setHasRestoredInviteCodeState] = useState(false);
  const [hasRestoredPeopleInviteState, setHasRestoredPeopleInviteState] = useState(false);
  const [hasRestoredTrophyState, setHasRestoredTrophyState] = useState(false);
  const [hasRestoredGroupInfoState, setHasRestoredGroupInfoState] = useState(false);
  const [groupTrophyAwardSelections, setGroupTrophyAwardSelections] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const [groupTrophyDrafts, setGroupTrophyDrafts] = useState<Record<string, { name: string; icon: string; description: string }>>({});
  const [trophySheetTarget, setTrophySheetTarget] = useState<{ groupId: string; userId: string } | null>(null);
  const [celebrationTrophy, setCelebrationTrophy] = useState<{
    name: string;
    icon: string;
    tier?: "bronze" | "silver" | "gold" | "special" | null;
  } | null>(null);
  const groupAvatarInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setGroupDetailsById({});
    setLoadingGroupDetailIds({});
    setGroupDetailErrors({});
    setManagerCustomTrophiesEnabled(false);
    const summaryResult = await fetchMyGroupsAction();
    setSummary(summaryResult);

    if (!summaryResult.ok) {
      if (!inviteToken) {
        setMessage({ tone: "error", text: summaryResult.message });
      }
      setIsLoading(false);
      return;
    }

    const resolvedSummary = summaryResult;
    setGroupLimitForms(
      Object.fromEntries(resolvedSummary.groups.map((group) => [group.id, String(group.membershipLimit)]))
    );
    setGroupProfileDrafts(
      Object.fromEntries(
        resolvedSummary.groups.map((group) => [
          group.id,
          {
            name: group.name,
            description: group.description ?? ""
          }
        ])
      )
    );
    setIsLoading(false);
  }, [inviteToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      Object.values(groupAvatarDrafts).forEach((draft) => {
        if (draft.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(draft.previewUrl);
        }
      });
    };
  }, [groupAvatarDrafts]);

  const loadGroupDetail = useCallback(async (groupId: string, force = false) => {
    if (!force && (groupDetailsById[groupId] || loadingGroupDetailIds[groupId])) {
      return;
    }

    setLoadingGroupDetailIds((current) => ({ ...current, [groupId]: true }));
    setGroupDetailErrors((current) => {
      if (!current[groupId]) {
        return current;
      }

      const next = { ...current };
      delete next[groupId];
      return next;
    });

    const result = await fetchManagedGroupDetailAction(groupId);
    if (result.ok) {
      setGroupDetailsById((current) => ({ ...current, [groupId]: result.group }));
      setSummary((current) => {
        if (!current?.ok) {
          return current;
        }

        return {
          ...current,
          groups: current.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  name: result.group.name,
                  description: result.group.description ?? null,
                  avatarUrl: result.group.avatarUrl,
                  accessMode: result.group.accessMode,
                  membershipLimit: result.group.membershipLimit,
                  memberCount: result.group.memberCount,
                  pendingInviteCount: result.group.pendingInviteCount
                }
              : group
          )
        };
      });
      setGroupLimitForms((current) => ({ ...current, [groupId]: String(result.group.membershipLimit) }));
      setGroupProfileDrafts((current) => ({
        ...current,
        [groupId]: {
          name: result.group.name,
          description: result.group.description ?? ""
        }
      }));
      setManagerCustomTrophiesEnabled(result.managerCustomTrophiesEnabled);
    } else {
      setGroupDetailErrors((current) => ({ ...current, [groupId]: result.message }));
    }

    setLoadingGroupDetailIds((current) => {
      const next = { ...current };
      delete next[groupId];
      return next;
    });
  }, [groupDetailsById, loadingGroupDetailIds]);

  useEffect(() => {
    if (!summary?.ok) {
      return;
    }

    for (const groupId of expandedGroupIds) {
      if (!summary.groups.some((group) => group.id === groupId)) {
        continue;
      }

      if (!groupDetailsById[groupId] && !loadingGroupDetailIds[groupId] && !groupDetailErrors[groupId]) {
        void loadGroupDetail(groupId);
      }
    }
  }, [expandedGroupIds, groupDetailErrors, groupDetailsById, loadGroupDetail, loadingGroupDetailIds, summary]);

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  useEffect(() => {
    if (invitePreviewMessage) {
      showAppToast(invitePreviewMessage);
    }
  }, [invitePreviewMessage]);

  useEffect(() => {
    if (inviteEntryError) {
      showAppToast({ tone: "error", text: inviteEntryError });
    }
  }, [inviteEntryError]);

  useEffect(() => {
    if ((!confirmation && !deleteConfirmation) || typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      confirmationRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [confirmation, deleteConfirmation]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(GROUP_DISCLOSURE_STORAGE_KEY);
      const sessionStored = window.sessionStorage.getItem(GROUP_DISCLOSURE_STORAGE_KEY);
      const source = sessionStored ?? stored;
      if (!source) {
        return;
      }

      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        setExpandedGroupIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch (error) {
      console.warn("Could not restore saved group disclosure state.", error);
    } finally {
      setHasRestoredGroupDisclosureState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredGroupDisclosureState) {
      return;
    }

    try {
      window.sessionStorage.setItem(GROUP_DISCLOSURE_STORAGE_KEY, JSON.stringify(expandedGroupIds));
      window.localStorage.removeItem(GROUP_DISCLOSURE_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not save group disclosure state.", error);
    }
  }, [expandedGroupIds, hasRestoredGroupDisclosureState]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(GROUP_INVITE_CODE_SECTION_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setExpandedInviteCodeIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch (error) {
      console.warn("Could not restore saved invite code disclosure state.", error);
    } finally {
      setHasRestoredInviteCodeState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredInviteCodeState) {
      return;
    }

    try {
      window.sessionStorage.setItem(GROUP_INVITE_CODE_SECTION_STORAGE_KEY, JSON.stringify(expandedInviteCodeIds));
    } catch (error) {
      console.warn("Could not save invite code disclosure state.", error);
    }
  }, [expandedInviteCodeIds, hasRestoredInviteCodeState]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(GROUP_LIMIT_SECTION_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setExpandedGroupLimitIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch (error) {
      console.warn("Could not restore saved group limit disclosure state.", error);
    } finally {
      setHasRestoredGroupLimitState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredGroupLimitState) {
      return;
    }

    try {
      window.sessionStorage.setItem(GROUP_LIMIT_SECTION_STORAGE_KEY, JSON.stringify(expandedGroupLimitIds));
    } catch (error) {
      console.warn("Could not save group limit disclosure state.", error);
    }
  }, [expandedGroupLimitIds, hasRestoredGroupLimitState]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(GROUP_PEOPLE_SECTION_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setExpandedPeopleInviteIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch (error) {
      console.warn("Could not restore saved people disclosure state.", error);
    } finally {
      setHasRestoredPeopleInviteState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredPeopleInviteState) {
      return;
    }

    try {
      window.sessionStorage.setItem(GROUP_PEOPLE_SECTION_STORAGE_KEY, JSON.stringify(expandedPeopleInviteIds));
    } catch (error) {
      console.warn("Could not save people disclosure state.", error);
    }
  }, [expandedPeopleInviteIds, hasRestoredPeopleInviteState]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(GROUP_TROPHY_SECTION_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setExpandedTrophyIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch (error) {
      console.warn("Could not restore saved trophy disclosure state.", error);
    } finally {
      setHasRestoredTrophyState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredTrophyState) {
      return;
    }

    try {
      window.sessionStorage.setItem(GROUP_TROPHY_SECTION_STORAGE_KEY, JSON.stringify(expandedTrophyIds));
    } catch (error) {
      console.warn("Could not save trophy disclosure state.", error);
    }
  }, [expandedTrophyIds, hasRestoredTrophyState]);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(GROUP_INFO_SECTION_STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setExpandedGroupInfoIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch (error) {
      console.warn("Could not restore saved group info disclosure state.", error);
    } finally {
      setHasRestoredGroupInfoState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasRestoredGroupInfoState) {
      return;
    }

    try {
      window.sessionStorage.setItem(GROUP_INFO_SECTION_STORAGE_KEY, JSON.stringify(expandedGroupInfoIds));
    } catch (error) {
      console.warn("Could not save group info disclosure state.", error);
    }
  }, [expandedGroupInfoIds, hasRestoredGroupInfoState]);

  useEffect(() => {
    if (!inviteToken) {
      return;
    }

    setIsLoadingInvitePreview(true);
    fetchGroupInvitePreviewAction(inviteToken)
      .then((result) => {
        if (!result.ok) {
          setInvitePreviewMessage({ tone: "error", text: result.message });
          return;
        }

        setInvitePreview({
          groupName: result.invite.groupName,
          email: result.invite.email,
          existingAccount: result.invite.existingAccount,
          customMessage: result.invite.customMessage ?? null,
          language: normalizeLanguage(result.invite.language ?? inviteLanguage),
          helperLanguage: normalizeExplainerLanguage(result.invite.helperLanguage ?? inviteHelperLanguage),
          status: result.invite.status,
          expiresAt: result.invite.expiresAt
        });
      })
      .finally(() => setIsLoadingInvitePreview(false));
  }, [inviteHelperLanguage, inviteLanguage, inviteToken]);

  useEffect(() => {
    const helperLanguageSource = invitePreview?.helperLanguage ?? inviteHelperLanguage;
    if (!helperLanguageSource) {
      return;
    }

    const helperLanguage = normalizeExplainerLanguage(helperLanguageSource);

    try {
      window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, helperLanguage);
    } catch (error) {
      console.warn("Could not save invite helper language preference.", error);
    }
  }, [inviteHelperLanguage, invitePreview?.helperLanguage]);

  const summaryGroups = useMemo(() => (summary?.ok ? summary.groups : []), [summary]);
  const currentUserId = summary?.ok ? summary.currentUser.userId : null;
  const canSelfAwardTrophies = summary?.ok ? summary.currentUser.role === "admin" : false;
  const currentUser = summary?.ok ? summary.currentUser : null;
  const isSignedIn = Boolean(currentUser);
  const hasAnyGroups = summary?.ok ? summary.groupAccess.hasAnyGroups : false;
  const tierAccess = summary?.ok ? summary.tierAccess : null;
  const activeHierarchyLevel =
    summary?.ok
      ? summary.currentUser.accessLevel
      : undefined;
  const hierarchyActiveDetails = useMemo(() => {
    if (isLoading) {
      return ["Loading your access..."];
    }

    if (!summary?.ok) {
      return [summary?.message ?? "Sign in to manage groups."];
    }

    if (summary.currentUser.accessLevel === "super_admin") {
      return [
        `Joined groups: ${summary.groupAccess.joinedGroupCount}`,
        "Managed groups: Unlimited",
        "New group limit: Unlimited",
        "Scope: All groups"
      ];
    }

    if (summary.tierAccess.capabilities.canSeeOrganizerControls) {
      return [
        `Tier: ${summary.tierAccess.label}`,
        `Joined groups: ${summary.groupAccess.joinedGroupCount}`,
        `Managed groups: ${summary.groupAccess.managedGroupCount} / ${summary.tierAccess.limits.maxGroups}`,
        `Group member cap: ${summary.tierAccess.limits.maxMembersPerGroup} members`,
        summary.tierAccess.limits.maxTotalPlayers
          ? `League player cap: ${summary.tierAccess.limits.maxTotalPlayers} total players`
          : "League player cap: Not applied at this tier",
        "Scope: Assigned groups only"
      ];
    }

    return [
      `Joined groups: ${summary.groupAccess.joinedGroupCount}`,
      "Managed groups: None",
      "New group limit: Not enabled",
      "Scope: Joined groups only"
    ];
  }, [isLoading, summary]);
  const isSuperAdmin = summary?.ok && summary.currentUser.role === "admin";
  const managerGroupLimitReached = Boolean(
    summary?.ok &&
      summary.currentUser.role !== "admin" &&
      summary.tierAccess.limits.maxGroups !== null &&
      summary.groupAccess.managedGroupCount >= summary.tierAccess.limits.maxGroups
  );
  const canCreateGroups = Boolean(summary?.ok && summary.tierAccess.capabilities.canCreateGroup);
  const canManageSocialTrophies = Boolean(summary?.ok && summary.tierAccess.capabilities.canManageSocialTrophies);
  const groupLimitWarningStorageKey = `${GROUP_LIMIT_WARNING_DISMISS_PREFIX}:${currentUserId ?? "guest"}`;
  const groupLimitWarningState = useDismissedHelperState(groupLimitWarningStorageKey);
  const managedSummaryGroups = useMemo(() => summaryGroups.filter((group) => group.canManage), [summaryGroups]);
  const filteredGroups = useMemo(() => {
    const orderedGroups = [...managedSummaryGroups];

    if (!isSuperAdmin) {
      return orderedGroups;
    }

    const query = superAdminGroupQuery.trim().toLowerCase();
    if (!query) {
      return orderedGroups;
    }

    return orderedGroups.filter((group) => group.name.toLowerCase().includes(query));
  }, [managedSummaryGroups, isSuperAdmin, superAdminGroupQuery]);
  const activeTrophyGroup = trophySheetTarget ? groupDetailsById[trophySheetTarget.groupId] ?? null : null;
  const activeTrophyMember = activeTrophyGroup
    ? activeTrophyGroup.members.find((member) => member.userId === trophySheetTarget?.userId) ?? null
    : null;

  function clearGroupAvatarDraft(groupId: string) {
    setGroupAvatarDrafts((current) => {
      const draft = current[groupId];
      if (draft?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(draft.previewUrl);
      }

      if (!draft) {
        return current;
      }

      const next = { ...current };
      delete next[groupId];
      return next;
    });
  }

  async function handleGroupAvatarSelection(group: MyManagedGroup, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage({ tone: "error", text: "Use a JPG, PNG, or WEBP image for the group avatar." });
      event.target.value = "";
      return;
    }

    if (file.size > MAX_GROUP_AVATAR_FILE_BYTES) {
      setMessage({ tone: "error", text: "Choose a JPG, PNG, or WEBP image under 2 MB." });
      event.target.value = "";
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setGroupAvatarDrafts((current) => {
      const previous = current[group.id];
      if (previous?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previous.previewUrl);
      }

      return {
        ...current,
        [group.id]: {
          file,
          previewUrl: nextPreviewUrl,
          removeCurrent: false
        }
      };
    });

    event.target.value = "";
  }

  function handleRemoveGroupAvatar(group: MyManagedGroup) {
    setGroupAvatarDrafts((current) => {
      const previous = current[group.id];
      if (previous?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previous.previewUrl);
      }

      if (!group.avatarUrl) {
        if (!previous) {
          return current;
        }

        const next = { ...current };
        delete next[group.id];
        return next;
      }

      return {
        ...current,
        [group.id]: {
          file: null,
          previewUrl: null,
          removeCurrent: true
        }
      };
    });
  }

  function isGroupProfileDirty(
    group: MyManagedGroup,
    profileDraft: { name: string; description: string },
    avatarDraft?: GroupAvatarDraft | null
  ) {
    const hasNameChange = profileDraft.name.trim() !== group.name.trim();
    const hasDescriptionChange = profileDraft.description.trim() !== (group.description ?? "").trim();
    const hasAvatarUpload = Boolean(avatarDraft?.file);
    const hasAvatarRemoval = Boolean(avatarDraft?.removeCurrent && group.avatarUrl);

    return hasNameChange || hasDescriptionChange || hasAvatarUpload || hasAvatarRemoval;
  }

  async function handleRemoveSavedGroupAvatar(group: MyManagedGroup) {
    const result = await removeManagedGroupAvatarAction(group.id);
    if (!result.ok) {
      throw new Error(result.message);
    }
  }

  async function handleUploadSavedGroupAvatar(group: MyManagedGroup, file: File) {
    const formData = new FormData();
    formData.set("groupId", group.id);
    formData.set("file", file);
    const result = await uploadManagedGroupAvatarAction(formData);
    if (!result.ok) {
      throw new Error(result.message);
    }
  }

  async function handleRefreshManagedGroup(groupId: string) {
    await loadGroupDetail(groupId, true);
    await load();
  }

  async function handleSaveGroupProfile(group: MyManagedGroup) {
    const draft = groupProfileDrafts[group.id] ?? {
      name: group.name,
      description: group.description ?? ""
    };
    const avatarDraft = groupAvatarDrafts[group.id] ?? null;
    const hasProfileChanges =
      draft.name.trim() !== group.name.trim() ||
      draft.description.trim() !== (group.description ?? "").trim();
    const hasAvatarUpload = Boolean(avatarDraft?.file);
    const hasAvatarRemoval = Boolean(avatarDraft?.removeCurrent && group.avatarUrl);

    if (!hasProfileChanges && !hasAvatarUpload && !hasAvatarRemoval) {
      return;
    }

    await withAction(`save-group-profile-${group.id}`, async () => {
      try {
        if (hasProfileChanges) {
          const result = await updateManagedGroupProfileAction({
            groupId: group.id,
            name: draft.name,
            description: draft.description
          });

          if (!result.ok) {
            throw new Error(result.message);
          }
        }

        if (hasAvatarRemoval) {
          await handleRemoveSavedGroupAvatar(group);
        } else if (avatarDraft?.file) {
          await handleUploadSavedGroupAvatar(group, avatarDraft.file);
        }

        clearGroupAvatarDraft(group.id);
        await handleRefreshManagedGroup(group.id);
        setMessage({
          tone: "success",
          text:
            hasAvatarUpload || hasAvatarRemoval
              ? "Group profile and avatar updated."
              : "Group profile updated."
        });
      } catch (caughtError) {
        setMessage({
          tone: "error",
          text: caughtError instanceof Error ? caughtError.message : "Could not update that group."
        });
      }
    });
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingGroup(true);
    setMessage(null);

    const result = await createGroupAction({
      name: groupName,
      description: groupDescription,
      membershipLimit: membershipLimit ? Number(membershipLimit) : undefined,
      inviteEmailsText: createGroupInviteEmails
    });

    setMessage({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      setGroupName("");
      setGroupDescription("");
      setMembershipLimit("");
      setCreateGroupInviteEmails("");
      await load();
    }

    setIsCreatingGroup(false);
  }

  async function handleCreateInviteCode(group: MyManagedGroup, replaceExisting = false) {
    setInviteCodeActionGroupId(group.id);
    setInviteCodeActionType(replaceExisting ? "replace" : "create");
    setMessage(null);

    try {
      const result = await createManagedGroupInviteCodeAction({
        groupId: group.id,
        replaceExisting,
        customCode: inviteCodeDrafts[group.id] ?? ""
      });
      setMessage({
        tone: result.ok ? "success" : "error",
        text: result.message
      });

      if (result.ok) {
        setInviteCodeDrafts((current) => ({
          ...current,
          [group.id]: ""
        }));
        setGroupDetailsById((current) => {
          const existingGroup = current[group.id];
          if (!existingGroup) {
            return current;
          }

          return {
            ...current,
            [group.id]: {
              ...existingGroup,
              inviteCode: result.inviteCode
            }
          };
        });
        await loadGroupDetail(group.id, true);
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not update the invite code."
      });
    } finally {
      setInviteCodeActionGroupId(null);
      setInviteCodeActionType(null);
    }
  }

  async function handleDeactivateInviteCode(group: MyManagedGroup) {
    setInviteCodeActionGroupId(group.id);
    setInviteCodeActionType("deactivate");
    setMessage(null);

    try {
      const result = await deactivateManagedGroupInviteCodeAction(group.id);
      setMessage({
        tone: result.ok ? "success" : "error",
        text: result.message
      });

      if (result.ok) {
        setGroupDetailsById((current) => {
          const existingGroup = current[group.id];
          if (!existingGroup) {
            return current;
          }

          return {
            ...current,
            [group.id]: {
              ...existingGroup,
              inviteCode: null
            }
          };
        });
        await loadGroupDetail(group.id, true);
      }
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not deactivate the invite code."
      });
    } finally {
      setInviteCodeActionGroupId(null);
      setInviteCodeActionType(null);
    }
  }

  async function handleCreateEmailInvite(group: MyManagedGroup) {
    const email = newInviteEmailsByGroup[group.id]?.trim() ?? "";
    if (!email) {
      setMessage({ tone: "error", text: "Enter an email address first." });
      return;
    }

    await withAction(`create-email-invite-${group.id}`, async () => {
      const result = await createGroupInviteAction({
        groupId: group.id,
        email
      });

      if (result.ok) {
        let copiedToClipboard = false;
        try {
          await navigator.clipboard.writeText(result.claimUrl);
          copiedToClipboard = true;
        } catch (clipboardError) {
          console.warn("Could not copy group invite link.", clipboardError);
          setManualInviteLinkByGroup((current) => ({
            ...current,
            [group.id]: {
              url: result.claimUrl,
              note:
                result.deliveryStatus === "queue_failed"
                  ? "Invite created, but email could not be queued. Copy the link below and share it manually."
                  : "Invite email queued. The link is shown below if you also want to share it manually."
            }
          }));
        }

        setNewInviteEmailsByGroup((current) => ({
          ...current,
          [group.id]: ""
        }));

        if (copiedToClipboard && result.deliveryStatus !== "queue_failed") {
          setManualInviteLinkByGroup((current) => {
            if (!current[group.id]) {
              return current;
            }

            const next = { ...current };
            delete next[group.id];
            return next;
          });
        } else {
          setManualInviteLinkByGroup((current) => ({
            ...current,
            [group.id]: {
              url: result.claimUrl,
              note:
                result.deliveryStatus === "queue_failed"
                  ? "Invite created, but email could not be queued. Copy the link below and share it manually."
                  : "Copy failed. Copy the link from the field below."
            }
          }));
        }

        setMessage({
          tone: result.deliveryStatus === "queue_failed" || !copiedToClipboard ? "tip" : "success",
          text:
            result.deliveryStatus === "queue_failed"
              ? "Invite created, but email could not be queued. Copy the link from the field below and share it manually."
              : copiedToClipboard
                ? "Invite email queued. The invite link is also available if you want to share it manually."
                : "Copy failed. Copy the link from the field below."
        });

        await loadGroupDetail(group.id, true);
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  async function handleSaveGroupAccess(group: MyManagedGroup, nextAccessMode: string) {
    await withAction(`save-group-access-${group.id}`, async () => {
      const result = await updateManagedGroupAccessAction({
        groupId: group.id,
        accessMode: normalizeGroupAccessMode(nextAccessMode)
      });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        await loadGroupDetail(group.id, true);
        await load();
      }
    });
  }

  async function handleSaveAllowedEmails(group: MyManagedGroup) {
    const value = allowedEmailsDrafts[group.id]?.trim() ?? "";
    if (!value) {
      setMessage({ tone: "error", text: "Add at least one email first." });
      return;
    }

    await withAction(`save-allowed-emails-${group.id}`, async () => {
      const result = await saveManagedGroupAllowedEmailsAction({
        groupId: group.id,
        emailsText: value
      });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        const summary = result.summary;
        if (summary.invalidCount > 0 || summary.duplicateIgnoredCount > 0) {
          setMessage({
            tone: "tip",
            text: `${result.message} ${summary.duplicateIgnoredCount > 0 ? `${summary.duplicateIgnoredCount} duplicates ignored. ` : ""}${summary.invalidCount > 0 ? `${summary.invalidCount} invalid entries skipped.` : ""}`.trim()
          });
        }
        setAllowedEmailsDrafts((current) => ({ ...current, [group.id]: "" }));
        await loadGroupDetail(group.id, true);
      }
    });
  }

  async function handleRemoveAllowedEmail(group: MyManagedGroup, allowedEmailId: string) {
    await withAction(`remove-allowed-email-${allowedEmailId}`, async () => {
      const result = await removeManagedGroupAllowedEmailAction(group.id, allowedEmailId);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        await loadGroupDetail(group.id, true);
      }
    });
  }

  async function handleAssignCaptainsPass(group: MyManagedGroup) {
    const selection = captainPassSelections[group.id] ?? { userId: "", allowance: "1" };
    if (!selection.userId) {
      setMessage({ tone: "error", text: "Choose a trusted player first." });
      return;
    }

    await withAction(`assign-captains-pass-${group.id}`, async () => {
      const result = await assignCaptainsPassAction({
        groupId: group.id,
        captainUserId: selection.userId,
        inviteAllowance: Number(selection.allowance || "1")
      });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        await loadGroupDetail(group.id, true);
      }
    });
  }

  async function handleCreateCaptainInvite(group: MyManagedGroup) {
    const email = captainInviteEmailsByGroup[group.id]?.trim() ?? "";
    if (!email) {
      setMessage({ tone: "error", text: "Enter an email address first." });
      return;
    }

    await withAction(`create-captain-invite-${group.id}`, async () => {
      const result = await createCaptainManagedGroupInviteAction({
        groupId: group.id,
        email
      });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setCaptainInviteEmailsByGroup((current) => ({ ...current, [group.id]: "" }));
        await loadGroupDetail(group.id, true);
      }
    });
  }

  async function handleAcceptInvite() {
    if (!inviteToken) {
      return;
    }

    setIsAcceptingInvite(true);
    setInvitePreviewMessage(null);
    const result = await acceptGroupInviteAction({ token: inviteToken });
    setInvitePreviewMessage({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      await load();
    }
    setIsAcceptingInvite(false);
  }

  async function withAction(key: string, task: () => Promise<void>) {
    setActionKey(key);
    try {
      await task();
    } finally {
      setActionKey(null);
    }
  }

  async function handleAwardTrophyFromSheet(groupId: string, userId: string, trophyId: string) {
    await withAction(`award-trophy-${groupId}:${userId}:${trophyId}`, async () => {
      const result = await awardManagedGroupTrophyAction(groupId, userId, trophyId);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        if (!result.alreadyAwarded && result.trophy) {
          setCelebrationTrophy(result.trophy);
        }
        setTrophySheetTarget(null);
        await load();
      }
    });
  }

  async function handleAwardTrophyFromList(groupId: string, trophyId: string) {
    const selectedUserId = groupTrophyAwardSelections[groupId]?.[trophyId]?.trim() ?? "";
    if (!selectedUserId) {
      setMessage({ tone: "error", text: "Choose a player first." });
      return;
    }

    await withAction(`award-trophy-${groupId}:${selectedUserId}:${trophyId}`, async () => {
      const result = await awardManagedGroupTrophyAction(groupId, selectedUserId, trophyId);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        if (!result.alreadyAwarded && result.trophy) {
          setCelebrationTrophy(result.trophy);
        }
        setGroupTrophyAwardSelections((current) => ({
          ...current,
          [groupId]: {
            ...(current[groupId] ?? {}),
            [trophyId]: ""
          }
        }));
        await load();
      }
    });
  }

  async function handleCreateManagedTrophy(groupId: string) {
    const draft = groupTrophyDrafts[groupId] ?? { name: "", icon: "", description: "" };

    await withAction(`create-trophy-${groupId}`, async () => {
      const result = await createManagedGroupTrophyAction({
        groupId,
        name: draft.name,
        icon: draft.icon,
        description: draft.description
      });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setGroupTrophyDrafts((current) => ({
          ...current,
          [groupId]: { name: "", icon: "", description: "" }
        }));
        await load();
      }
    });
  }

  function handleInviteEntrySubmit() {
    const token = normalizeInviteTokenInput(inviteEntryValue);
    if (!token) {
      setInviteEntryError("Paste a valid invite link or token first.");
      return;
    }

    setInviteEntryError(null);
    router.push(`/my-groups?invite=${encodeURIComponent(token)}`);
  }

  function toggleExpandedGroup(groupId: string) {
    const shouldOpen = !expandedGroupIds.includes(groupId);
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );

    if (shouldOpen) {
      void loadGroupDetail(groupId);
    }
  }

  function toggleExpandedInviteEditor(inviteId: string) {
    setExpandedInviteEditorIds((current) =>
      current.includes(inviteId) ? current.filter((id) => id !== inviteId) : [...current, inviteId]
    );
  }

  function toggleExpandedSection(
    id: string,
    setExpanded: Dispatch<SetStateAction<string[]>>
  ) {
    setExpanded((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  }

  const resolvedInviteLanguage = normalizeLanguage(invitePreview?.language ?? inviteLanguage);
  const resolvedInviteHelperLanguage = normalizeExplainerLanguage(
    invitePreview?.helperLanguage ?? inviteHelperLanguage ?? resolvedInviteLanguage
  );
  const inviteReturnPath = inviteToken
    ? appendExplainerLanguageToPath(
        appendLanguageToPath(`/my-groups?invite=${inviteToken}`, resolvedInviteLanguage),
        resolvedInviteHelperLanguage
      )
    : undefined;
  const inviteLoginPath = inviteToken
    ? `/login?flow=invite&lang=${resolvedInviteLanguage}&next=${encodeURIComponent(inviteReturnPath ?? "/my-groups")}`
    : "/login";
  const inviteSignupPath = inviteToken
    ? `/login?mode=signup&flow=invite&lang=${resolvedInviteLanguage}&next=${encodeURIComponent(inviteReturnPath ?? "/my-groups")}`
    : "/login?mode=signup";
  const normalizedInviteEmail = invitePreview?.email?.trim().toLowerCase() ?? "";
  const normalizedCurrentUserEmail = currentUser?.email?.trim().toLowerCase() ?? "";
  const isInviteEmailMatch = Boolean(
    normalizedInviteEmail &&
      normalizedCurrentUserEmail &&
      normalizedInviteEmail === normalizedCurrentUserEmail
  );

  return (
    <section className="space-y-5">
      <ManagementIntro
        eyebrow="My Groups"
        title="Play in groups and manage them"
        description="Players see the groups they belong to. Organizers get the group controls their tier allows."
        statusChip={
          summary?.ok
            ? `${summary.groupAccess.joinedGroupCount} joined · ${summary.groupAccess.managedGroupCount} managed`
            : null
        }
        disclosureStorageKey="my-groups-intro"
        disclosurePlacement="bottom-right"
        collapseBodyWhenClosed
      />

      {confirmation || deleteConfirmation ? (
        <div ref={confirmationRef} className="scroll-mt-28 space-y-3">
          {confirmation ? (
            <InlineConfirmation
              title={confirmation.title}
              description={confirmation.description}
              confirmLabel={confirmation.confirmLabel}
              onConfirm={confirmation.onConfirm}
              onCancel={() => setConfirmation(null)}
              isPending={actionKey === confirmation.key}
            />
          ) : null}

          {deleteConfirmation ? (
            <InlineTextConfirmation
              title={`Delete ${deleteConfirmation.groupName}?`}
              description="This removes the group, its memberships, and its pending group invites. It does not delete player accounts, app-level invites, or predictions."
              confirmLabel="Delete Group"
              expectedValue={deleteConfirmation.groupName}
              inputLabel="Type the group name to confirm"
              inputPlaceholder={deleteConfirmation.groupName}
              value={deleteConfirmationValue}
              onValueChange={setDeleteConfirmationValue}
              onConfirm={() => {
                void withAction(deleteConfirmation.key, async () => {
                  const result = await deleteManagedGroupAction(deleteConfirmation.groupId, deleteConfirmationValue);
                  setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                  if (result.ok) {
                    setDeleteConfirmation(null);
                    setDeleteConfirmationValue("");
                    await load();
                  }
                });
              }}
              onCancel={() => {
                setDeleteConfirmation(null);
                setDeleteConfirmationValue("");
              }}
              isPending={actionKey === deleteConfirmation.key}
            />
          ) : null}
        </div>
      ) : null}

      {inviteToken ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-lg font-bold">Group invite</h3>
          {isLoadingInvitePreview ? (
            <p className="mt-3 text-sm font-semibold text-gray-600">Loading invite...</p>
          ) : invitePreview ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm font-semibold text-gray-700">
                Join <span className="font-black text-gray-950">{invitePreview.groupName}</span> with{" "}
                <span className="font-black text-gray-950">{invitePreview.email}</span>.
              </p>
              <p className="text-sm font-semibold text-gray-600">
                Status: {invitePreview.status}
                {invitePreview.expiresAt ? ` · Expires ${formatDateOnly(invitePreview.expiresAt)}` : ""}
              </p>
              {invitePreview.customMessage ? (
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Message from your group manager</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-gray-700">
                    {invitePreview.customMessage}
                  </p>
                </div>
              ) : null}
              {isSignedIn && invitePreview.status === "pending" && isInviteEmailMatch ? (
                <ActionButton type="button" onClick={handleAcceptInvite} disabled={isAcceptingInvite} tone="accent" fullWidth>
                  {isAcceptingInvite ? "Joining..." : "Join Group"}
                </ActionButton>
              ) : isSignedIn && invitePreview.status === "pending" ? (
                <div className="space-y-3">
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    This invite is limited to {invitePreview.email}. Please sign in with that email or ask the organizer to invite this account.
                  </p>
                  {invitePreview.existingAccount ? (
                    <Link
                      href={inviteLoginPath}
                      className="inline-flex w-full items-center justify-center rounded-md border border-accent bg-accent px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
                    >
                      Switch Account
                    </Link>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href={inviteSignupPath}
                        className="rounded-md border border-accent bg-accent px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
                      >
                        Create Account
                      </Link>
                      <Link
                        href={inviteLoginPath}
                        className="rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-center text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                      >
                        Switch Account
                      </Link>
                    </div>
                  )}
                </div>
              ) : isSignedIn ? (
                <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                  {invitePreview.status === "accepted"
                    ? `Invite accepted — welcome to ${invitePreview.groupName}.`
                    : invitePreview.status === "expired" || invitePreview.status === "revoked"
                      ? "Invite expired or canceled."
                      : "This invite has already been handled for your account."}
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-600">
                    {invitePreview.status !== "pending"
                      ? "Invite expired or canceled."
                      : invitePreview.existingAccount
                        ? "This invited email already has an account. Sign in with that email to join the group."
                        : "Sign in or create your account with the invited email first. You can come right back to this invite."}
                  </p>
                  {invitePreview.status !== "pending" ? null : invitePreview.existingAccount ? (
                    <Link
                      href={inviteLoginPath}
                      className="inline-flex w-full items-center justify-center rounded-md border border-accent bg-accent px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
                    >
                      Sign In To Join
                    </Link>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href={inviteSignupPath}
                        className="rounded-md border border-accent bg-accent px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
                      >
                        Create Account
                      </Link>
                      <Link
                        href={inviteLoginPath}
                        className="rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-center text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                      >
                        Sign In
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {summary?.ok && summary.currentUser.role === "admin" ? (
        <ManagementCard
          title="Admin Controls"
          subtitle="Full system control lives here without adding another dock tab."
          badges={
            <>
              <TierIconBadge accessLevel="super_admin" size={22} />
              <ManagementBadge label="unlimited" tone="accent" />
            </>
          }
          actions={
            <>
              <Link href="/admin/players" className="inline-flex">
                <ActionButton>Manage Players & Groups</ActionButton>
              </Link>
              <Link href="/admin/players" className="inline-flex">
                <ActionButton>Manage Managers</ActionButton>
              </Link>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm font-semibold leading-6 text-gray-600">
              Create groups without limits, invite players globally, and review every group from this hub.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/admin/invites" className="inline-flex">
                <ActionButton fullWidth>Open Invite Controls</ActionButton>
              </Link>
              <Link href="/admin/groups" className="inline-flex">
                <ActionButton fullWidth>Open Group Controls</ActionButton>
              </Link>
            </div>
          </div>
        </ManagementCard>
      ) : null}

      {summary?.ok && summary.tierAccess.capabilities.canManageOrganizationBranding ? <OrganizationBrandingPanel /> : null}

      {summary?.ok && !hasAnyGroups ? (
        <ManagementCard
          title="You are not in any groups right now."
          subtitle="Your account and predictions are still safe."
          actions={
            <>
              <Link href="/groups" className="inline-flex">
                <ActionButton>Go to Score Picks</ActionButton>
              </Link>
              <Link href="/login?mode=signup" className="inline-flex">
                <ActionButton>Use a New Invite</ActionButton>
              </Link>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm font-semibold leading-6 text-gray-600">
              If a manager deleted one of your groups, you can still sign in and keep playing anywhere else you are invited.
              Ask a manager for a fresh invite link when you are ready to join your next group.
            </p>
            <InviteEntryForm
              value={inviteEntryValue}
              onValueChange={(value) => {
                setInviteEntryValue(value);
                if (inviteEntryError) {
                  setInviteEntryError(null);
                }
              }}
              onSubmit={handleInviteEntrySubmit}
              submitLabel="Open Invite"
            />
          </div>
        </ManagementCard>
      ) : null}

      {canCreateGroups ? (
        managerGroupLimitReached ? (
          groupLimitWarningState.hasHydrated && !groupLimitWarningState.isDismissed ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-amber-800">
              <Info aria-hidden className="h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <DismissibleHelperText
                  storageKey={groupLimitWarningStorageKey}
                  dismissLabel="Hide this limit note"
                >
                  <p className="text-[11px] font-semibold leading-4 text-amber-800">
                    Your current tier allows {summary?.ok ? summary.tierAccess.limits.maxGroups : 0} group
                    {summary?.ok && summary.tierAccess.limits.maxGroups === 1 ? "" : "s"}.
                  </p>
                </DismissibleHelperText>
              </div>
            </div>
          </div>
          ) : null
        ) : (
          <form
            onSubmit={handleCreateGroup}
            className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4 transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">
                {summary?.ok && summary.currentUser.role === "admin" ? "Create a group (Unlimited)" : "Create a group"}
              </h3>
              <InlineDisclosureButton
                isOpen={isCreateGroupOpen}
                onClick={() => setIsCreateGroupOpen((current) => !current)}
              />
            </div>
            {isCreateGroupOpen ? (
              <>
                <label className="block">
                  <span className="text-sm font-bold text-gray-800">Group name</span>
                  <input
                    required
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-gray-800">Short description</span>
                  <textarea
                    value={groupDescription}
                    onChange={(event) => setGroupDescription(event.target.value)}
                    rows={2}
                    maxLength={250}
                    placeholder="The family World Cup pool - winner gets eternal bragging rights."
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                  <p className="mt-2 text-xs font-semibold text-gray-500">
                    Optional. Keep it short and friendly.
                  </p>
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-gray-800">Membership limit</span>
                  <input
                    type="number"
                    min={1}
                    value={membershipLimit}
                    onChange={(event) => setMembershipLimit(event.target.value)}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                    placeholder={
                      summary?.ok && summary.currentUser.role !== "admin" && tierAccess?.limits.maxMembersPerGroup
                        ? `Up to ${tierAccess.limits.maxMembersPerGroup}`
                        : "Leave blank for the default"
                    }
                  />
                  {summary?.ok && summary.currentUser.role !== "admin" && tierAccess?.limits.maxMembersPerGroup ? (
                    <p className="mt-2 text-xs font-semibold text-gray-500">
                      Your current tier allows up to {tierAccess.limits.maxMembersPerGroup} members per group.
                    </p>
                  ) : null}
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-gray-800">Invite specific players by email</span>
                  <textarea
                    value={createGroupInviteEmails}
                    onChange={(event) => setCreateGroupInviteEmails(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                    placeholder="name@example.com, teammate@example.com"
                  />
                  <p className="mt-2 text-xs font-semibold text-gray-500">
                    Optional. Use commas or new lines. We&apos;ll create pending email invites without changing the invite-code flow.
                  </p>
                </label>
                <p className="text-xs font-semibold text-gray-500">
                  You can add an avatar, access settings, and a Captain&apos;s Pass after the group is created.
                </p>
                <ActionButton type="submit" disabled={isCreatingGroup} tone="accent" fullWidth>
                  {isCreatingGroup ? "Creating..." : "Create Group"}
                </ActionButton>
              </>
            ) : null}
          </form>
        )
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-xl font-black">Managed Groups</h3>
        </div>
        {isSuperAdmin ? (
          <label className="block rounded-lg border border-gray-200 bg-white p-4">
            <span className="text-sm font-bold text-gray-800">Find a group</span>
            <input
              value={superAdminGroupQuery}
              onChange={(event) => setSuperAdminGroupQuery(event.target.value)}
              placeholder="Search by group name"
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
        ) : null}
        {isLoading ? (
          <ManagementEmptyState message="Loading groups..." />
        ) : filteredGroups.length === 0 ? (
          <ManagementEmptyState
            message={
              isSuperAdmin && superAdminGroupQuery.trim()
                ? "No groups match that search."
                : summary?.ok && !summary.groupAccess.managedGroupCount
                  ? "No managed groups yet. Create one if your tier includes group management."
                  : "No managed groups available right now."
            }
          />
        ) : (
          filteredGroups.map((group) => {
            const detailedGroup = groupDetailsById[group.id] ?? null;
            const isGroupDetailLoading = Boolean(loadingGroupDetailIds[group.id]);
            const groupDetailError = groupDetailErrors[group.id] ?? null;
            const groupMembers = detailedGroup?.members ?? [];
            const groupInvites = detailedGroup?.invites ?? [];
            const groupTrophies = detailedGroup?.trophies ?? [];
            const inviteCode = detailedGroup?.inviteCode ?? null;
            const inviteCodeDraft = inviteCodeDrafts[group.id] ?? "";
            const resolvedMemberCount = detailedGroup?.memberCount ?? group.memberCount;
            const resolvedPendingInviteCount = detailedGroup?.pendingInviteCount ?? group.pendingInviteCount;
            const trophyDraft = groupTrophyDrafts[group.id] ?? { name: "", icon: "", description: "" };
            const groupLimitFormValue = groupLimitForms[group.id] ?? String(group.membershipLimit);
            const usesDisclosure = true;
            const isExpanded = usesDisclosure ? expandedGroupIds.includes(group.id) : true;
            const compactMemberCount = resolvedMemberCount ?? 0;
            const isInviteCodeExpanded = expandedInviteCodeIds.includes(group.id);
            const isGroupLimitExpanded = expandedGroupLimitIds.includes(group.id);
            const isPeopleInvitesExpanded = expandedPeopleInviteIds.includes(group.id);
            const isTrophyExpanded = expandedTrophyIds.includes(group.id);
            const isGroupInfoExpanded = expandedGroupInfoIds.includes(group.id);
            const managerTrophies = groupTrophies.filter(
              (trophy) => trophy.awardSource === "manager" && trophy.scope === "group"
            );
            const coreTrophies = managerTrophies.filter((trophy) => !trophy.key.startsWith(`group_${group.id}_`));
            const customTrophies = managerTrophies.filter((trophy) => trophy.key.startsWith(`group_${group.id}_`));
            const orderedManagerTrophies = [...managerTrophies].sort((left, right) => {
              const leftIsCustom = left.key.startsWith(`group_${group.id}_`);
              const rightIsCustom = right.key.startsWith(`group_${group.id}_`);

              if (leftIsCustom !== rightIsCustom) {
                return leftIsCustom ? -1 : 1;
              }

              return left.name.localeCompare(right.name);
            });
            const hasReachedCustomTrophyLimit = customTrophies.length >= 10;
            const activeMembers = groupMembers.filter((member) => member.role === "member");
            const groupProfileDraft = groupProfileDrafts[group.id] ?? {
              name: group.name,
              description: group.description ?? ""
            };
            const avatarDraft = groupAvatarDrafts[group.id] ?? { file: null, previewUrl: null, removeCurrent: false };
            const avatarPreviewUrl = avatarDraft.previewUrl ?? (avatarDraft.removeCurrent ? undefined : group.avatarUrl ?? undefined);
            const isGroupProfileSaveReady = isGroupProfileDirty(group, groupProfileDraft, avatarDraft);
            const captainPassSelection = captainPassSelections[group.id] ?? { userId: "", allowance: "1" };
            const availableCaptainCandidates = activeMembers.filter((member) => member.userId !== currentUserId);
            const captainPass = detailedGroup?.captainPass ?? null;
            const isCaptainInviteHelperVisible = Boolean(captainPass?.canCurrentUserUseInvites && !group.canManage);
            const inviteAccessChipLabel =
              group.accessMode === "restricted_by_email" ? "Email" : group.accessMode === "closed" ? "Closed" : "Code";

            return (
              <ManagementCard
                key={group.id}
                title={
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={group.name} avatarUrl={group.avatarUrl} size="sm" />
                        <div className="min-w-0 truncate text-base font-black leading-tight text-gray-950">
                          {group.name}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-gray-700">
                        {compactMemberCount} member{compactMemberCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap gap-2">
                        <ManagementBadge label={inviteAccessChipLabel} tone="neutral" />
                      </div>
                      {usesDisclosure ? (
                        <InlineDisclosureButton
                          isOpen={isExpanded}
                          variant="subtle"
                          onClick={() => toggleExpandedGroup(group.id)}
                        />
                      ) : null}
                    </div>
                  </div>
                }
                className="bg-gray-50"
              >
                {isExpanded ? (
                  <>
                    <div className="mt-1 flex justify-end">
                      <Link
                        href={getGroupLeaderboardHref(group)}
                        className="inline-flex rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light hover:text-accent-dark"
                      >
                        Leaderboard
                      </Link>
                    </div>
                    {group.canManage ? (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Group Profile</h4>
                              <p className="mt-1 text-xs font-semibold text-gray-500">
                                Update the group name, avatar, and short description.
                              </p>
                            </div>
                            <Avatar name={groupProfileDraft.name || group.name} avatarUrl={avatarPreviewUrl} size="md" />
                          </div>
                          <div className="mt-3 space-y-3">
                            <input
                              ref={(node) => {
                                groupAvatarInputRefs.current[group.id] = node;
                              }}
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(event) => void handleGroupAvatarSelection(group, event)}
                            />
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  name={groupProfileDraft.name || group.name}
                                  avatarUrl={avatarPreviewUrl}
                                  size="md"
                                  className="rounded-lg"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-gray-900">
                                    {avatarDraft.file
                                      ? "Avatar selected"
                                      : avatarDraft.removeCurrent
                                        ? "Avatar will be removed"
                                        : group.avatarUrl
                                          ? "Avatar saved"
                                          : "No avatar yet"}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-gray-500">
                                    {avatarDraft.file
                                      ? "Local preview shown. Save Group Profile to apply it."
                                      : avatarDraft.removeCurrent
                                        ? "Save Group Profile to remove this avatar."
                                        : "Optional. If you skip it, your initials stay in place."}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <ActionButton
                                  type="button"
                                  disabled={actionKey === `save-group-profile-${group.id}`}
                                  onClick={() => groupAvatarInputRefs.current[group.id]?.click()}
                                  fullWidth
                                >
                                  Upload Avatar
                                </ActionButton>
                                {group.avatarUrl || avatarDraft.previewUrl ? (
                                  <ActionButton
                                    type="button"
                                    disabled={actionKey === `save-group-profile-${group.id}`}
                                    onClick={() => {
                                      handleRemoveGroupAvatar(group);
                                    }}
                                    fullWidth
                                  >
                                    Remove Avatar
                                  </ActionButton>
                                ) : (
                                  <div />
                                )}
                              </div>
                            </div>
                            <label className="block">
                              <span className="text-sm font-bold text-gray-800">Group name</span>
                              <input
                                value={groupProfileDraft.name}
                                onChange={(event) =>
                                  setGroupProfileDrafts((current) => ({
                                    ...current,
                                    [group.id]: {
                                      ...groupProfileDraft,
                                      name: event.target.value
                                    }
                                  }))
                                }
                                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                              />
                            </label>
                            <label className="block">
                              <span className="text-sm font-bold text-gray-800">Short description</span>
                              <textarea
                                value={groupProfileDraft.description}
                                onChange={(event) =>
                                  setGroupProfileDrafts((current) => ({
                                    ...current,
                                    [group.id]: {
                                      ...groupProfileDraft,
                                      description: event.target.value
                                    }
                                  }))
                                }
                                rows={2}
                                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                              />
                            </label>
                            <ActionButton
                              type="button"
                              disabled={actionKey === `save-group-profile-${group.id}` || !isGroupProfileSaveReady}
                              onClick={() => void handleSaveGroupProfile(group)}
                              tone={isGroupProfileSaveReady ? "accent" : "neutral"}
                              fullWidth
                            >
                              {actionKey === `save-group-profile-${group.id}` ? "Saving..." : "Save Group Profile"}
                            </ActionButton>
                          </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Restricted Email List</h4>
                              <p className="mt-1 text-xs font-semibold text-gray-500">
                                Approved emails for restricted groups. Existing members stay in place if you turn restriction on later.
                              </p>
                            </div>
                            <ManagementBadge
                              label={`${detailedGroup?.allowedEmails.length ?? 0} approved`}
                              tone={group.accessMode === "restricted_by_email" ? "accent" : "neutral"}
                            />
                          </div>
                          <div className="mt-3 space-y-3">
                            <label className="block">
                              <span className="text-sm font-bold text-gray-800">Add approved emails</span>
                              <textarea
                                value={allowedEmailsDrafts[group.id] ?? ""}
                                onChange={(event) =>
                                  setAllowedEmailsDrafts((current) => ({
                                    ...current,
                                    [group.id]: event.target.value
                                  }))
                                }
                                rows={4}
                                placeholder="player@example.com&#10;captain@example.com"
                                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                              />
                            </label>
                            <label className="block">
                              <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Upload CSV</span>
                              <input
                                type="file"
                                accept=".csv,text/csv"
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) {
                                    return;
                                  }

                                  void file.text().then((text) => {
                                    setAllowedEmailsDrafts((current) => ({
                                      ...current,
                                      [group.id]: text
                                    }));
                                  });
                                }}
                                className="mt-2 block w-full text-xs font-semibold text-gray-600"
                              />
                            </label>
                            <p className="text-xs font-semibold text-gray-500">
                              CSV support uses the <code>email</code> column when present. XLSX can follow later if we add it cleanly.
                            </p>
                            <ActionButton
                              type="button"
                              disabled={actionKey === `save-allowed-emails-${group.id}`}
                              onClick={() => void handleSaveAllowedEmails(group)}
                              fullWidth
                            >
                              {actionKey === `save-allowed-emails-${group.id}` ? "Saving..." : "Save Approved Emails"}
                            </ActionButton>
                            <div className="space-y-2">
                              {(detailedGroup?.allowedEmails ?? []).length > 0 ? (
                                detailedGroup?.allowedEmails.map((entry) => (
                                  <div key={entry.id} className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-black text-gray-950">{entry.email}</p>
                                      <p className="mt-1 text-xs font-semibold text-gray-500">
                                        {entry.status === "joined" ? `Joined as ${entry.joinedUserName ?? "player"}` : "Allowed"}
                                      </p>
                                    </div>
                                    <ActionButton
                                      type="button"
                                      tone="danger"
                                      disabled={actionKey === `remove-allowed-email-${entry.id}`}
                                      onClick={() => void handleRemoveAllowedEmail(group, entry.id)}
                                    >
                                      Remove
                                    </ActionButton>
                                  </div>
                                ))
                              ) : (
                                <p className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-600">
                                  No approved emails yet.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        {group.groupKind === "standard" ? (
                          <div className="rounded-lg border border-gray-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Captain’s Pass</h4>
                                <p className="mt-1 text-xs font-semibold text-gray-500">
                                  Give one trusted player limited invite power for this group. They also get one small private Captain Group of their own.
                                </p>
                              </div>
                              {captainPass ? (
                                <ManagementBadge label={captainPass.statusLabel} tone={captainPass.status === "claimed" ? "accent" : "neutral"} />
                              ) : null}
                            </div>
                            <div className="mt-3 space-y-3">
                              {captainPass ? (
                                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                                  <p className="text-sm font-black text-gray-950">
                                    {captainPass.captainName ?? "Captain"} · {captainPass.invitesRemaining} invite{captainPass.invitesRemaining === 1 ? "" : "s"} remaining
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-gray-500">
                                    Private group: {captainPass.captainPrivateGroupName ?? "Created"}
                                  </p>
                                </div>
                              ) : (
                                <>
                                  <label className="block">
                                    <span className="text-sm font-bold text-gray-800">Trusted player</span>
                                    <select
                                      value={captainPassSelection.userId}
                                      onChange={(event) =>
                                        setCaptainPassSelections((current) => ({
                                          ...current,
                                          [group.id]: {
                                            ...captainPassSelection,
                                            userId: event.target.value
                                          }
                                        }))
                                      }
                                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                    >
                                      <option value="">Choose a player</option>
                                      {availableCaptainCandidates.map((member) => (
                                        <option key={member.userId} value={member.userId}>
                                          {member.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block">
                                    <span className="text-sm font-bold text-gray-800">Invite allowance</span>
                                    <input
                                      type="number"
                                      min={1}
                                      max={6}
                                      value={captainPassSelection.allowance}
                                      onChange={(event) =>
                                        setCaptainPassSelections((current) => ({
                                          ...current,
                                          [group.id]: {
                                            ...captainPassSelection,
                                            allowance: event.target.value
                                          }
                                        }))
                                      }
                                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                    />
                                  </label>
                                  <p className="text-xs font-semibold text-gray-500">
                                    Choose how many people this Captain can invite into your group. This cannot exceed your remaining group capacity.
                                  </p>
                                  <ActionButton
                                    type="button"
                                    disabled={actionKey === `assign-captains-pass-${group.id}`}
                                    onClick={() => void handleAssignCaptainsPass(group)}
                                    fullWidth
                                  >
                                    {actionKey === `assign-captains-pass-${group.id}` ? "Saving..." : "Issue Captain’s Pass"}
                                  </ActionButton>
                                </>
                              )}
                            </div>
                          </div>
                        ) : null}

                      </div>
                    ) : null}
                    {isCaptainInviteHelperVisible ? (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Captain’s Pass</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Invite helpers for this manager group. {captainPass?.isRestrictedByEmail ? "This group is restricted by email. Captain invites only work for approved emails." : "Your remaining invites stop working if the group fills up."}
                            </p>
                          </div>
                          <ManagementBadge label={`${captainPass?.invitesRemaining ?? 0} left`} tone="accent" />
                        </div>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                          <label className="min-w-0 flex-1">
                            <span className="sr-only">Captain invite email</span>
                            <input
                              type="email"
                              value={captainInviteEmailsByGroup[group.id] ?? ""}
                              onChange={(event) =>
                                setCaptainInviteEmailsByGroup((current) => ({
                                  ...current,
                                  [group.id]: event.target.value
                                }))
                              }
                              placeholder="player@example.com"
                              className="w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                            />
                          </label>
                          <ActionButton
                            type="button"
                            disabled={actionKey === `create-captain-invite-${group.id}` || (captainPass?.invitesRemaining ?? 0) <= 0}
                            onClick={() => void handleCreateCaptainInvite(group)}
                          >
                            {actionKey === `create-captain-invite-${group.id}` ? "Creating..." : "Create Captain Invite"}
                          </ActionButton>
                        </div>
                      </div>
                    ) : null}
                    {group.canManage ? (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black uppercase tracking-wide text-gray-700">Access &amp; Invites</p>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Control how new members join, then share a code or direct invite that respects those rules.
                            </p>
                          </div>
                          <InlineDisclosureButton
                            isOpen={isInviteCodeExpanded}
                            variant="subtle"
                            onClick={() => toggleExpandedSection(group.id, setExpandedInviteCodeIds)}
                          />
                        </div>

                        {isInviteCodeExpanded ? (
                          <div className="mt-3 space-y-3">
                            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                              <label className="block">
                                <span className="text-sm font-bold text-gray-800">Access mode</span>
                                <select
                                  value={group.accessMode}
                                  onChange={(event) => void handleSaveGroupAccess(group, event.target.value)}
                                  disabled={actionKey === `save-group-access-${group.id}`}
                                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                >
                                  <option value="open_by_code">Open by code</option>
                                  <option value="restricted_by_email">Restricted by email</option>
                                  <option value="closed">Closed</option>
                                </select>
                              </label>
                              <p className="mt-2 text-xs font-semibold text-gray-500">
                                {group.accessMode === "restricted_by_email"
                                  ? "This group is restricted by email. Invite codes and Captain invites only work for approved emails."
                                  : group.accessMode === "closed"
                                    ? "This group is closed. You can still keep the current code for later, but no new joins will work while it stays closed."
                                    : "Anyone with an active code or direct invite can join until the group fills up."}
                              </p>
                            </div>
                            {isGroupDetailLoading && !inviteCode ? (
                              <p className="text-sm font-semibold text-gray-600">Loading invite code...</p>
                            ) : inviteCode ? (
                              <>
                                <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2">
                                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Invite status</p>
                                  <ManagementBadge label={detailedGroup?.inviteCodeStatusLabel ?? "Active"} tone={detailedGroup?.inviteCodeStatus === "active" ? "success" : "neutral"} />
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-3">
                                  <code className="text-base font-black uppercase tracking-[0.18em] text-gray-950">
                                    {inviteCode.code}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard
                                        .writeText(inviteCode.code)
                                        .then(() => {
                                          setMessage({ tone: "success", text: "Invite code copied." });
                                        })
                                        .catch((clipboardError) => {
                                          console.warn("Could not copy invite code.", clipboardError);
                                          setMessage({ tone: "tip", text: "Copy failed. Copy the code from this card manually." });
                                        });
                                    }}
                                    className="text-[10px] font-bold uppercase tracking-wide text-gray-600 transition hover:text-accent-dark"
                                  >
                                    Copy code
                                  </button>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <ActionButton
                                    type="button"
                                    onClick={() => {
                                      void navigator.clipboard
                                        .writeText(inviteCode.shareMessage)
                                        .then(() => {
                                          setMessage({ tone: "success", text: "Invite message copied." });
                                        })
                                        .catch((clipboardError) => {
                                          console.warn("Could not copy invite message.", clipboardError);
                                          setMessage({ tone: "tip", text: "Copy failed. Share the invite code or links from this card manually." });
                                        });
                                    }}
                                    fullWidth
                                  >
                                    Copy invite
                                  </ActionButton>
                                  <Link href={inviteCode.whatsAppUrl} target="_blank" rel="noreferrer" className="inline-flex">
                                    <ActionButton fullWidth>Send via WhatsApp</ActionButton>
                                  </Link>
                                  <a href={inviteCode.emailUrl} className="inline-flex">
                                    <ActionButton fullWidth>Send via Email</ActionButton>
                                  </a>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-3">
                                  <ActionButton
                                    type="button"
                                    disabled={inviteCodeActionGroupId === group.id}
                                    onClick={() => void handleDeactivateInviteCode(group)}
                                    fullWidth
                                    tone="danger"
                                  >
                                    {inviteCodeActionGroupId === group.id && inviteCodeActionType === "deactivate"
                                      ? "Deactivating..."
                                      : "Deactivate code"}
                                  </ActionButton>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-semibold text-gray-600">No active invite code.</p>
                                <div className="space-y-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
                                  <label className="block">
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
                                      Choose an invite code
                                    </span>
                                    <input
                                      type="text"
                                      value={inviteCodeDraft}
                                      onChange={(event) =>
                                        setInviteCodeDrafts((current) => ({
                                          ...current,
                                          [group.id]: event.target.value.toUpperCase()
                                        }))
                                      }
                                      disabled={inviteCodeActionGroupId === group.id}
                                      placeholder="Type your code here"
                                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold uppercase tracking-[0.14em] text-gray-950 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                      aria-label={`Choose an invite code for ${group.name}`}
                                    />
                                  </label>
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-[11px] font-semibold text-gray-500">
                                      Leave it blank and we&apos;ll make one for you.
                                    </p>
                                    <ActionButton
                                      type="button"
                                      disabled={inviteCodeActionGroupId === group.id}
                                      onClick={() => void handleCreateInviteCode(group)}
                                    >
                                      {inviteCodeActionGroupId === group.id && inviteCodeActionType === "create"
                                        ? "Activating..."
                                        : "Activate code"}
                                    </ActionButton>
                                  </div>
                                </div>
                              </>
                            )}
                            <div className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-3">
                              <div>
                                <p className="text-sm font-black text-gray-900">Invite specific player by email</p>
                                <p className="mt-1 text-xs font-semibold text-gray-500">
                                  Create a pending email invite and copy the join link for that player.
                                </p>
                              </div>
                              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
                                <label className="min-w-0 flex-1">
                                  <span className="sr-only">Invite player email</span>
                                  <input
                                    type="email"
                                    value={newInviteEmailsByGroup[group.id] ?? ""}
                                    onChange={(event) =>
                                      setNewInviteEmailsByGroup((current) => ({
                                        ...current,
                                        [group.id]: event.target.value
                                      }))
                                    }
                                    disabled={actionKey === `create-email-invite-${group.id}`}
                                    placeholder="player@example.com"
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                  />
                                </label>
                                <ActionButton
                                  type="button"
                                  disabled={actionKey === `create-email-invite-${group.id}`}
                                  onClick={() => void handleCreateEmailInvite(group)}
                                >
                                  {actionKey === `create-email-invite-${group.id}` ? "Creating..." : "Create Invite"}
                                </ActionButton>
                              </div>

                              {groupInvites.filter((invite) => invite.status === "pending").length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {groupInvites
                                    .filter((invite) => invite.status === "pending")
                                    .map((invite) => (
                                      <div
                                        key={`compact-invite-${invite.id}`}
                                        className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-black text-gray-950">{invite.email}</p>
                                          <p className="mt-1 text-xs font-semibold text-gray-500">
                                            {invite.existingAccount
                                              ? "Existing user — they can log in and join from the invite link."
                                              : "Pending signup."}
                                            {invite.expiresAt ? ` Expires ${formatDateOnly(invite.expiresAt)}.` : ""}
                                          </p>
                                        </div>
                                        <ActionButton
                                          tone="danger"
                                          disabled={actionKey === `cancel-inline-invite-${invite.id}`}
                                          onClick={() => {
                                            setConfirmation({
                                              key: `cancel-inline-invite-${invite.id}`,
                                              title: `Cancel the invite for ${invite.email}?`,
                                              description: "This only removes this pending group invite.",
                                              confirmLabel: "Cancel Invite",
                                              onConfirm: () => {
                                                void withAction(`cancel-inline-invite-${invite.id}`, async () => {
                                                  const result = await cancelGroupInviteAction(invite.id);
                                                  setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                                  if (result.ok) {
                                                    setConfirmation(null);
                                                    await loadGroupDetail(group.id, true);
                                                  }
                                                });
                                              }
                                            });
                                          }}
                                        >
                                          Cancel
                                        </ActionButton>
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <p className="mt-3 text-xs font-semibold text-gray-500">No pending email invites yet.</p>
                              )}

                              {manualInviteLinkByGroup[group.id] ? (
                                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
                                  <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                                    Copy invite link manually
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-amber-800">
                                    {manualInviteLinkByGroup[group.id].note}
                                  </p>
                                  <div className="mt-2 rounded-md border border-amber-200 bg-white px-3 py-2">
                                    <p className="break-all text-xs font-semibold text-gray-700">
                                      {manualInviteLinkByGroup[group.id].url}
                                    </p>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {!detailedGroup ? (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                        <div className="space-y-2">
                          <p className="text-sm font-black text-gray-900">Group details</p>
                          <p className="text-sm font-semibold text-gray-600">
                            {isGroupDetailLoading
                              ? "Loading members, invites, and trophies..."
                              : groupDetailError ?? "Open this group to load its detailed view."}
                          </p>
                        </div>
                        {groupDetailError ? (
                          <div className="mt-3">
                            <ActionButton type="button" onClick={() => void loadGroupDetail(group.id, true)}>
                              Retry
                            </ActionButton>
                          </div>
                        ) : null}
                      </div>
                    ) : group.canManage ? (() => {
                  const directoryState = groupDirectoryState[group.id] ?? { search: "", filter: "all" as const };
                  const normalizedQuery = directoryState.search.trim().toLowerCase();
                  const filteredMembers = groupMembers.filter((member) => {
                    const matchesSearch =
                      !normalizedQuery ||
                      member.name.toLowerCase().includes(normalizedQuery) ||
                      member.email.toLowerCase().includes(normalizedQuery);

                    if (!matchesSearch) {
                      return false;
                    }

                    return directoryState.filter === "all" || directoryState.filter === "members";
                  });
                  const filteredInvites = groupInvites.filter((invite) => {
                    const inviteStatusLabel = invite.status === "revoked" ? "canceled" : invite.status;
                    const matchesSearch =
                      !normalizedQuery ||
                      invite.email.toLowerCase().includes(normalizedQuery) ||
                      (invite.suggestedDisplayName ?? "").toLowerCase().includes(normalizedQuery) ||
                      (invite.invitedByLabel ?? "").toLowerCase().includes(normalizedQuery) ||
                      inviteStatusLabel.toLowerCase().includes(normalizedQuery);

                    if (!matchesSearch) {
                      return false;
                    }

                    if (directoryState.filter === "members") {
                      return false;
                    }

                    if (directoryState.filter === "pending") {
                      return invite.status === "pending";
                    }

                    if (directoryState.filter === "accepted") {
                      return invite.status === "accepted";
                    }

                    return true;
                  });

                  return (
                    <div className="mt-6 space-y-3">
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Members</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Search, filter, and manage members and pending invites for this group.
                            </p>
                          </div>
                          <InlineDisclosureButton
                            isOpen={isPeopleInvitesExpanded}
                            variant="subtle"
                            onClick={() => toggleExpandedSection(group.id, setExpandedPeopleInviteIds)}
                          />
                        </div>

                        {isPeopleInvitesExpanded ? (
                          <>
                      {(() => {
                        const pendingInviteCount = groupInvites.filter((invite) => invite.status === "pending").length;
                        const acceptedInviteCount = groupInvites.filter((invite) => invite.status === "accepted").length;
                        const filterOptions = [
                          { value: "all", label: `All (${groupMembers.length + groupInvites.length})` },
                          { value: "members", label: `Members (${groupMembers.length})` },
                          { value: "pending", label: `Pending (${pendingInviteCount})` },
                          { value: "accepted", label: `Accepted (${acceptedInviteCount})` }
                        ] as const;

                        return (
                      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-2">
                            {filterOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  setGroupDirectoryState((current) => ({
                                    ...current,
                                    [group.id]: {
                                      ...directoryState,
                                      filter: option.value as "all" | "members" | "pending" | "accepted"
                                    }
                                  }))
                                }
                                className={`rounded-md px-3 py-2 text-xs font-bold ${
                                  directoryState.filter === option.value
                                    ? "bg-accent-light text-accent-dark"
                                    : "bg-white text-gray-600"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="mt-3 block">
                          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Find person or invite</span>
                          <input
                            value={directoryState.search}
                            onChange={(event) =>
                              setGroupDirectoryState((current) => ({
                                ...current,
                                [group.id]: {
                                  ...directoryState,
                                  search: event.target.value
                                }
                              }))
                            }
                            placeholder="Search by name, email, or invite status"
                            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                          />
                        </label>
                      </div>
                        );
                      })()}

                      <div className="mt-3 space-y-2">
                        {filteredMembers.map((member) => (
                          <div key={member.membershipId} className="rounded-md border border-gray-200 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex items-start gap-3">
                                <Avatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-gray-950">{member.name}</p>
                                  <p className="truncate text-sm font-semibold text-gray-600">
                                    {isSuperAdmin ? member.email : redactEmailAddress(member.email)}
                                  </p>
                                  {member.homeTeamId ? (
                                    <div className="mt-2">
                                      <HomeTeamBadge teamId={member.homeTeamId} compact />
                                    </div>
                                  ) : null}
                                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {member.role} · {getGroupJoinSourceLabel(member.joinSource)} · Joined {formatDateOnly(member.joinedAt)}
                                  </p>
                                </div>
                              </div>
                                  {group.canManage ? (
                                    <div className="flex flex-col items-end gap-2">
                                      {member.role === "member" ? (
                                        <ActionButton
                                          tone="danger"
                                      disabled={actionKey === `remove-member-${member.membershipId}`}
                                      onClick={() => {
                                        setConfirmation({
                                          key: `remove-member-${member.membershipId}`,
                                          title: `Remove ${member.name} from ${group.name}?`,
                                          description: "They will keep their account, invites, and predictions. This only removes them from this group.",
                                          confirmLabel: "Remove Player",
                                          onConfirm: () => {
                                            void withAction(`remove-member-${member.membershipId}`, async () => {
                                              const result = await removeGroupMemberAction(group.id, member.userId);
                                              setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                              if (result.ok) {
                                                setConfirmation(null);
                                                await load();
                                              }
                                            });
                                          }
                                        });
                                      }}
                                    >
                                      Remove
                                    </ActionButton>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}

                        {filteredInvites.map((invite) => {
                          const inviteStatusLabel =
                            invite.status === "accepted"
                              ? "accepted"
                              : invite.status === "revoked"
                                ? "canceled"
                                : invite.status === "expired"
                                  ? "expired"
                                  : invite.emailStatus === "failed"
                                    ? "failed"
                                    : invite.emailStatus === "sent"
                                      ? "sent"
                                      : "pending";
                          const canResendInvite =
                            invite.status === "pending" &&
                            (invite.emailStatus === "pending" || invite.emailStatus === "sent" || invite.emailStatus === "failed");
                          const editValue = editingInviteNames[invite.id] ?? invite.suggestedDisplayName ?? "";
                          const isInviteEditorExpanded = expandedInviteEditorIds.includes(invite.id);

                          return (
                            <div key={invite.id} className="space-y-3 rounded-md border border-gray-200 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-gray-950">{invite.email}</p>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {inviteStatusLabel}
                                    {invite.expiresAt ? ` · Expires ${formatDateOnly(invite.expiresAt)}` : ""}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-gray-500">
                                    {invite.invitedByLabel ? `Invited by ${invite.invitedByLabel}` : "Group invite"}
                                    {` · ${getGroupInviteSourceLabel(invite.inviteSource)}`}
                                    {invite.emailSentAt ? ` · Last sent ${formatDateOnly(invite.emailSentAt)}` : ""}
                                    {` · Send attempts ${invite.emailAttemptCount}`}
                                  </p>
                                  {invite.emailError ? (
                                    <p className="mt-1 text-xs font-semibold text-red-700">Delivery failed. Try resend.</p>
                                  ) : null}
                                </div>
                                <div className="flex flex-col gap-2">
                                  {invite.status !== "accepted" ? (
                                    <>
                                      {canResendInvite ? (
                                        <ActionButton
                                          disabled={actionKey === `resend-invite-${invite.id}`}
                                          onClick={() =>
                                            void withAction(`resend-invite-${invite.id}`, async () => {
                                              const result = await resendGroupInviteAction(invite.id);
                                              setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                              if (result.ok) {
                                                await load();
                                              }
                                            })
                                          }
                                        >
                                          Resend
                                        </ActionButton>
                                      ) : null}
                                      <ActionButton
                                        onClick={() => toggleExpandedInviteEditor(invite.id)}
                                      >
                                        {isInviteEditorExpanded ? "Hide Edit" : "Edit Invite"}
                                      </ActionButton>
                                      <ActionButton
                                        tone="danger"
                                        disabled={actionKey === `cancel-invite-${invite.id}`}
                                        onClick={() => {
                                          setConfirmation({
                                            key: `cancel-invite-${invite.id}`,
                                            title: `Cancel the invite for ${invite.email}?`,
                                            description: "This only affects this group invite. It will not touch the user's account or any app-level invite.",
                                            confirmLabel: "Cancel Invite",
                                            onConfirm: () => {
                                              void withAction(`cancel-invite-${invite.id}`, async () => {
                                                const result = await cancelGroupInviteAction(invite.id);
                                                setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                                if (result.ok) {
                                                  setConfirmation(null);
                                                  await load();
                                                }
                                              });
                                            }
                                          });
                                        }}
                                      >
                                        Cancel
                                      </ActionButton>
                                    </>
                                  ) : null}
                                </div>
                              </div>

                              {invite.status === "pending" && isInviteEditorExpanded ? (
                                <div className="space-y-2 rounded-md bg-gray-50 p-3">
                                  <label className="block">
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Suggested name (temporary)</span>
                                    <input
                                      value={editValue}
                                      onChange={(event) =>
                                        setEditingInviteNames((current) => ({
                                          ...current,
                                          [invite.id]: event.target.value
                                        }))
                                      }
                                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                    />
                                  </label>
                                  <ActionButton
                                    disabled={actionKey === `update-invite-${invite.id}`}
                                    onClick={() =>
                                      void withAction(`update-invite-${invite.id}`, async () => {
                                        const result = await updateGroupInviteNameAction(invite.id, editValue);
                                        setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                        if (result.ok) {
                                          await load();
                                        }
                                      })
                                    }
                                    fullWidth
                                  >
                                    Save Suggested Name
                                  </ActionButton>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        {filteredMembers.length === 0 && filteredInvites.length === 0 ? (
                          <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">
                            No members or invites match this search.
                          </p>
                        ) : null}
                      </div>

                      {canManageSocialTrophies ? (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Trophies</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {coreTrophies.length} core · {customTrophies.length} of 10 custom
                            </p>
                          </div>
                          <InlineDisclosureButton
                            isOpen={isTrophyExpanded}
                            variant="subtle"
                            onClick={() => toggleExpandedSection(group.id, setExpandedTrophyIds)}
                          />
                        </div>

                        {isTrophyExpanded ? (
                          <>
                            {isSuperAdmin || managerCustomTrophiesEnabled ? (
                              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-600">
                                <div>
                                  <p className="font-black text-gray-900">Create Trophy</p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Core trophies stay consistent. Use a custom trophy when this group deserves its own running joke.
                                  </p>
                                  {hasReachedCustomTrophyLimit ? (
                                    <p className="mt-2 text-xs font-bold text-amber-800">
                                      This group has reached the 10 custom trophy limit.
                                    </p>
                                  ) : null}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]">
                                  <label className="block">
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Emoji</span>
                                    <input
                                      value={trophyDraft.icon}
                                      onChange={(event) =>
                                        setGroupTrophyDrafts((current) => ({
                                          ...current,
                                          [group.id]: {
                                            ...(current[group.id] ?? { name: "", icon: "", description: "" }),
                                            icon: event.target.value
                                          }
                                        }))
                                      }
                                      placeholder="🏅"
                                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-lg outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Name</span>
                                    <input
                                      value={trophyDraft.name}
                                      onChange={(event) =>
                                        setGroupTrophyDrafts((current) => ({
                                          ...current,
                                          [group.id]: {
                                            ...(current[group.id] ?? { name: "", icon: "", description: "" }),
                                            name: event.target.value
                                          }
                                        }))
                                      }
                                      placeholder="Late Night Legend"
                                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                    />
                                  </label>
                                </div>
                                <label className="block">
                                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Description</span>
                                  <textarea
                                    value={trophyDraft.description}
                                    onChange={(event) =>
                                      setGroupTrophyDrafts((current) => ({
                                        ...current,
                                        [group.id]: {
                                          ...(current[group.id] ?? { name: "", icon: "", description: "" }),
                                          description: event.target.value
                                        }
                                      }))
                                    }
                                    rows={2}
                                    placeholder="What makes this trophy fun?"
                                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                  />
                                </label>
                                <div className="space-y-2">
                                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Need ideas?</p>
                                  <div className="flex flex-wrap gap-2">
                                    {TROPHY_PROMPTS.map((prompt) => (
                                      <button
                                        key={prompt.name}
                                        type="button"
                                        onClick={() =>
                                          setGroupTrophyDrafts((current) => ({
                                            ...current,
                                            [group.id]: {
                                              name: prompt.name,
                                              icon: prompt.icon,
                                              description: prompt.description
                                            }
                                          }))
                                        }
                                        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-xs font-semibold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                                      >
                                        {prompt.icon} {prompt.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <ActionButton
                                  type="button"
                                  disabled={
                                    hasReachedCustomTrophyLimit ||
                                    actionKey === `create-trophy-${group.id}` ||
                                    !trophyDraft.name.trim() ||
                                    !trophyDraft.icon.trim()
                                  }
                                  onClick={() => void handleCreateManagedTrophy(group.id)}
                                  fullWidth
                                >
                                  {actionKey === `create-trophy-${group.id}` ? "Saving Trophy..." : "Save Custom Trophy"}
                                </ActionButton>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-600">
                                Custom trophy creation is only available for League organizers and is currently turned off.
                              </div>
                            )}

                            <div className="mt-4 space-y-2">
                              {orderedManagerTrophies.length > 0 ? (
                                orderedManagerTrophies.map((trophy) => {
                                  const selectedUserId = groupTrophyAwardSelections[group.id]?.[trophy.id] ?? "";
                                  const alreadyAwardedUserIds = new Set(
                                    groupMembers
                                      .filter((member) => member.trophies.some((awarded) => awarded.id === trophy.id))
                                      .map((member) => member.userId)
                                  );
                                  const eligibleMembers = activeMembers.filter(
                                    (member) =>
                                      (canSelfAwardTrophies || member.userId !== currentUserId) &&
                                      !alreadyAwardedUserIds.has(member.userId)
                                  );

                                  return (
                                    <div key={trophy.id} className="rounded-md border border-gray-200 bg-white px-3 py-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-black text-gray-950">
                                            {trophy.icon} {trophy.name}
                                          </p>
                                          <p className="mt-1 text-sm font-semibold text-gray-600">
                                            {trophy.description || "Group recognition trophy"}
                                          </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                          <ManagementBadge
                                            label={trophy.key.startsWith(`group_${group.id}_`) ? "custom" : "core"}
                                            tone={trophy.key.startsWith(`group_${group.id}_`) ? "neutral" : "accent"}
                                          />
                                          <span className="text-xs font-semibold text-gray-500">
                                            Awarded {trophy.awardedCount} time{trophy.awardedCount === 1 ? "" : "s"}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                        <label className="min-w-0 flex-1">
                                          <span className="sr-only">Select player to award {trophy.name}</span>
                                          <select
                                            value={selectedUserId}
                                            onChange={(event) =>
                                              setGroupTrophyAwardSelections((current) => ({
                                                ...current,
                                                [group.id]: {
                                                  ...(current[group.id] ?? {}),
                                                  [trophy.id]: event.target.value
                                                }
                                              }))
                                            }
                                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                                          >
                                            <option value="">
                                              {eligibleMembers.length > 0 ? "Choose a player to award" : "Everyone already has this trophy"}
                                            </option>
                                            {eligibleMembers.map((member) => (
                                              <option key={member.userId} value={member.userId}>
                                                {member.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <ActionButton
                                          type="button"
                                          disabled={
                                            !selectedUserId ||
                                            eligibleMembers.length === 0 ||
                                            actionKey === `award-trophy-${group.id}:${selectedUserId}:${trophy.id}`
                                          }
                                          onClick={() => void handleAwardTrophyFromList(group.id, trophy.id)}
                                        >
                                          {actionKey === `award-trophy-${group.id}:${selectedUserId}:${trophy.id}`
                                            ? "Awarding..."
                                            : "Award"}
                                        </ActionButton>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-md bg-white px-3 py-3 text-sm font-semibold text-gray-600">
                                  <p>No trophies available yet</p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Save a custom trophy to recognize a player in this group.
                                  </p>
                                </div>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                      ) : null}
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                    })() : (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Members</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {groupMembers.length} members
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {groupMembers.map((member) => (
                            <div key={member.membershipId} className="rounded-md border border-gray-200 px-3 py-3">
                              <div className="flex items-start gap-3">
                                <Avatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-gray-950">{member.name}</p>
                                  <p className="truncate text-sm font-semibold text-gray-600">
                                    {isSuperAdmin ? member.email : redactEmailAddress(member.email)}
                                  </p>
                                  {member.homeTeamId ? (
                                    <div className="mt-2">
                                      <HomeTeamBadge teamId={member.homeTeamId} compact />
                                    </div>
                                  ) : null}
                                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {member.role} · {getGroupJoinSourceLabel(member.joinSource)} · Joined {formatDateOnly(member.joinedAt)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {group.canManage ? (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Group Limits</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {group.groupKind === "captain_private"
                                ? `Captain Groups are fixed at ${MAX_CAPTAIN_PRIVATE_GROUP_MEMBERS} members.`
                                : isSuperAdmin
                                  ? "Adjust this group directly with unlimited super admin access."
                                  : `Your current tier allows up to ${summary?.ok ? summary.tierAccess.limits.maxMembersPerGroup : group.membershipLimit} members per group.`}
                            </p>
                          </div>
                          <InlineDisclosureButton
                            isOpen={isGroupLimitExpanded}
                            variant="subtle"
                            onClick={() => toggleExpandedSection(group.id, setExpandedGroupLimitIds)}
                          />
                        </div>

                        {isGroupLimitExpanded ? (
                          <form
                            className="mt-3 space-y-3"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void withAction(`update-group-limit-${group.id}`, async () => {
                                const result = await updateManagedGroupLimitAction(group.id, Number(groupLimitFormValue));
                                setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                if (result.ok) {
                                  await load();
                                }
                              });
                            }}
                          >
                            <label className="block">
                              <span className="text-sm font-bold text-gray-800">Seats for this group</span>
                              <input
                                type="number"
                                min={1}
                                value={groupLimitFormValue}
                                disabled={group.groupKind === "captain_private"}
                                onChange={(event) =>
                                  setGroupLimitForms((current) => ({
                                    ...current,
                                    [group.id]: event.target.value
                                  }))
                                }
                                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                              />
                            </label>
                            <ActionButton
                              type="submit"
                              disabled={group.groupKind === "captain_private" || actionKey === `update-group-limit-${group.id}`}
                              fullWidth
                            >
                              {group.groupKind === "captain_private"
                                ? "Captain Group Limit Locked"
                                : actionKey === `update-group-limit-${group.id}`
                                  ? "Saving limit..."
                                  : "Save Group Limit"}
                            </ActionButton>

                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                  <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Danger Zone</h4>
                                  <p className="mt-1 text-xs font-semibold text-gray-500">
                                    Delete this group only after removing everyone else.
                                  </p>
                                </div>
                                <InlineDisclosureButton
                                  isOpen={isGroupInfoExpanded}
                                  variant="subtle"
                                  onClick={() => toggleExpandedSection(group.id, setExpandedGroupInfoIds)}
                                />
                              </div>

                              {isGroupInfoExpanded ? (
                                <div className="mt-3 space-y-4">
                                  <ManagementGrid>
                                  <ManagementDatum
                                      label="Capacity"
                                      value={
                                        resolvedMemberCount !== undefined && resolvedPendingInviteCount !== undefined
                                          ? `${resolvedMemberCount + resolvedPendingInviteCount} / ${group.membershipLimit} seats used`
                                          : `Open group details to load seat usage`
                                      }
                                    />
                                    <ManagementDatum label="Description" value={group.description?.trim() || "None"} />
                                    <ManagementDatum label="Group limit" value={`${group.membershipLimit} members`} />
                                    <ManagementDatum label="Members" value={resolvedMemberCount ?? "—"} />
                                    <ManagementDatum label="Pending invites" value={resolvedPendingInviteCount ?? "—"} />
                                  </ManagementGrid>
                                  <ActionButton
                                    tone="danger"
                                    disabled={actionKey === `delete-group-${group.id}`}
                                    onClick={() => {
                                      setConfirmation(null);
                                      setDeleteConfirmation({
                                        key: `delete-group-${group.id}`,
                                        groupId: group.id,
                                        groupName: group.name
                                      });
                                      setDeleteConfirmationValue("");
                                    }}
                                    fullWidth
                                  >
                                    Delete Group
                                  </ActionButton>
                                </div>
                              ) : null}
                            </div>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </ManagementCard>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <HierarchyPanel activeLevel={activeHierarchyLevel} activeDetails={hierarchyActiveDetails} />
      </section>

      <ManagedTrophyAwardSheet
        open={Boolean(activeTrophyGroup && activeTrophyMember)}
        groupName={activeTrophyGroup?.name ?? ""}
        member={activeTrophyMember}
        trophies={activeTrophyGroup?.trophies ?? []}
        pendingTrophyId={activeTrophyGroup && activeTrophyMember ? getPendingTrophyId(actionKey, activeTrophyGroup.id, activeTrophyMember.userId) : null}
        onAward={(trophyId) => {
          if (!activeTrophyGroup || !activeTrophyMember) {
            return;
          }

          void handleAwardTrophyFromSheet(activeTrophyGroup.id, activeTrophyMember.userId, trophyId);
        }}
        onClose={() => setTrophySheetTarget(null)}
      />

      <TrophyCelebration
        open={Boolean(celebrationTrophy)}
        trophy={celebrationTrophy}
        onDismiss={() => setCelebrationTrophy(null)}
      />
    </section>
  );
}

function getGroupLeaderboardHref(group: MyManagedGroup) {
  const view = group.canManage ? "managed_groups" : "my_groups";
  return `/leaderboard?view=${view}&groupId=${encodeURIComponent(group.id)}`;
}

function getPendingTrophyId(activeActionKey: string | null, groupId: string, userId: string) {
  const prefix = `award-trophy-${groupId}:${userId}:`;
  if (!activeActionKey?.startsWith(prefix)) {
    return null;
  }

  return activeActionKey.slice(prefix.length) || null;
}
