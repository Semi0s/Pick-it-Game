"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import {
  acceptGroupInviteAction,
  awardManagedGroupTrophyAction,
  cancelGroupInviteAction,
  createGroupAction,
  createGroupInviteAction,
  createManagedGroupTrophyAction,
  deleteManagedGroupAction,
  fetchGroupInvitePreviewAction,
  fetchMyGroupsAction,
  listManagedGroupPlayersAction,
  removeGroupMemberAction,
  resendGroupInviteAction,
  updateManagedGroupLimitAction,
  updateGroupInviteNameAction,
  type FetchMyGroupsResult,
  type ListManagedGroupPlayersResult,
  type MyManagedGroup
} from "@/app/my-groups/actions";
import { fetchInviteAutocompleteAction, type InviteAutocompleteOption } from "@/app/invites/actions";
import { Avatar } from "@/components/Avatar";
import { ManagedTrophyAwardSheet } from "@/components/ManagedTrophyAwardSheet";
import { AdminInvitesSection } from "@/components/admin/AdminInvitesClient";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { formatDate } from "@/components/admin/AdminInvitesClient";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { TrophyCelebration } from "@/components/TrophyCelebration";
import { appendLanguageToPath, normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";
import {
  ActionButton,
  HierarchyPanel,
  InlineConfirmation,
  InviteEntryForm,
  InlineTextConfirmation,
  ManagementBadge,
  ManagementCard,
  ManagementDatum,
  ManagementEmptyState,
  ManagementGrid,
  ManagementIntro,
  normalizeInviteTokenInput
} from "@/components/player-management/Shared";

type MyGroupsClientProps = {
  inviteToken?: string;
  inviteLanguage?: string;
};

type ToastState = { tone: "success" | "error"; text: string } | null;
const GROUP_DISCLOSURE_STORAGE_KEY = "my-groups-expanded-groups";
const GROUP_LIMIT_SECTION_STORAGE_KEY = "my-groups-expanded-group-limit-sections";
const GROUP_PEOPLE_SECTION_STORAGE_KEY = "my-groups-expanded-group-people-sections";
const GROUP_TROPHY_SECTION_STORAGE_KEY = "my-groups-expanded-group-trophy-sections";
const GROUP_INFO_SECTION_STORAGE_KEY = "my-groups-expanded-group-info-sections";
const TROPHY_PROMPTS = [
  { name: "Office Oracle", icon: "🧠", description: "Sees the result before the rest of the room does." },
  { name: "The Messi of Marketing", icon: "🐐", description: "Turns bold calls into highlight reels." },
  { name: "Data Wizard", icon: "📊", description: "Backs every pick with suspiciously good logic." },
  { name: "Drama King", icon: "🎭", description: "Never met a chaotic scoreline they didn't love." }
] as const;

export function MyGroupsClient({ inviteToken, inviteLanguage }: MyGroupsClientProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<FetchMyGroupsResult | null>(null);
  const [managedGroupsResult, setManagedGroupsResult] = useState<ListManagedGroupPlayersResult | null>(null);
  const [message, setMessage] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [membershipLimit, setMembershipLimit] = useState("");
  const [groupLimitForms, setGroupLimitForms] = useState<Record<string, string>>({});
  const [inviteForms, setInviteForms] = useState<Record<string, { email: string; suggestedDisplayName: string; language: SupportedLanguage }>>({});
  const [inviteSuggestions, setInviteSuggestions] = useState<Record<string, InviteAutocompleteOption[]>>({});
  const [editingInviteNames, setEditingInviteNames] = useState<Record<string, string>>({});
  const [submittingInviteForGroup, setSubmittingInviteForGroup] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [invitePreviewMessage, setInvitePreviewMessage] = useState<ToastState>(null);
  const [invitePreview, setInvitePreview] = useState<{
    groupName: string;
    email: string;
    language: SupportedLanguage;
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
  const [expandedGroupLimitIds, setExpandedGroupLimitIds] = useState<string[]>([]);
  const [expandedPeopleInviteIds, setExpandedPeopleInviteIds] = useState<string[]>([]);
  const [expandedTrophyIds, setExpandedTrophyIds] = useState<string[]>([]);
  const [expandedGroupInfoIds, setExpandedGroupInfoIds] = useState<string[]>([]);
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

  const load = useCallback(async () => {
    setIsLoading(true);
    const [summaryResult, groupsResult] = await Promise.all([
      fetchMyGroupsAction(),
      listManagedGroupPlayersAction()
    ]);

    setSummary(summaryResult);
    setManagedGroupsResult(groupsResult);
    if (groupsResult.ok) {
      setGroupLimitForms(
        Object.fromEntries(groupsResult.groups.map((group) => [group.id, String(group.membershipLimit)]))
      );
    }

    if (!summaryResult.ok && !inviteToken) {
      setMessage({ tone: "error", text: summaryResult.message });
    }

    if (!groupsResult.ok && summaryResult.ok) {
      setMessage({ tone: "error", text: groupsResult.message });
    }

    setIsLoading(false);
  }, [inviteToken]);

  useEffect(() => {
    void load();
  }, [load]);

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
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(GROUP_DISCLOSURE_STORAGE_KEY, JSON.stringify(expandedGroupIds));
      window.localStorage.removeItem(GROUP_DISCLOSURE_STORAGE_KEY);
    } catch (error) {
      console.warn("Could not save group disclosure state.", error);
    }
  }, [expandedGroupIds]);

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
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(GROUP_LIMIT_SECTION_STORAGE_KEY, JSON.stringify(expandedGroupLimitIds));
    } catch (error) {
      console.warn("Could not save group limit disclosure state.", error);
    }
  }, [expandedGroupLimitIds]);

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
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(GROUP_PEOPLE_SECTION_STORAGE_KEY, JSON.stringify(expandedPeopleInviteIds));
    } catch (error) {
      console.warn("Could not save people disclosure state.", error);
    }
  }, [expandedPeopleInviteIds]);

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
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(GROUP_TROPHY_SECTION_STORAGE_KEY, JSON.stringify(expandedTrophyIds));
    } catch (error) {
      console.warn("Could not save trophy disclosure state.", error);
    }
  }, [expandedTrophyIds]);

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
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(GROUP_INFO_SECTION_STORAGE_KEY, JSON.stringify(expandedGroupInfoIds));
    } catch (error) {
      console.warn("Could not save group info disclosure state.", error);
    }
  }, [expandedGroupInfoIds]);

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
          language: normalizeLanguage(result.invite.language ?? inviteLanguage),
          status: result.invite.status,
          expiresAt: result.invite.expiresAt
        });
      })
      .finally(() => setIsLoadingInvitePreview(false));
  }, [inviteLanguage, inviteToken]);

  useEffect(() => {
    let isActive = true;

    async function loadSuggestions() {
      const entries = Object.entries(inviteForms);
      if (entries.length === 0) {
        if (isActive) {
          setInviteSuggestions({});
        }
        return;
      }

      const results = await Promise.all(
        entries.map(async ([groupId, formState]) => {
          const normalized = formState.email.trim().toLowerCase();
          if (normalized.length < 2) {
            return [groupId, []] as const;
          }

          return [groupId, await fetchInviteAutocompleteAction(normalized)] as const;
        })
      );

      if (!isActive) {
        return;
      }

      setInviteSuggestions(
        Object.fromEntries(results)
      );
    }

    void loadSuggestions();

    return () => {
      isActive = false;
    };
  }, [inviteForms]);

  const groups = useMemo(
    () => (managedGroupsResult?.ok ? managedGroupsResult.groups : []),
    [managedGroupsResult]
  );
  const managerCustomTrophiesEnabled = managedGroupsResult?.ok
    ? managedGroupsResult.managerCustomTrophiesEnabled
    : false;
  const currentUserId = summary?.ok ? summary.currentUser.userId : null;
  const canSelfAwardTrophies = summary?.ok ? summary.currentUser.role === "admin" : false;
  const currentUser = summary?.ok ? summary.currentUser : null;
  const isSignedIn = Boolean(currentUser);
  const hasAnyGroups = summary?.ok ? summary.groupAccess.hasAnyGroups : false;
  const activeHierarchyLevel =
    summary?.ok
      ? summary.currentUser.role === "admin"
        ? "super_admin"
        : summary.managerAccess.enabled
          ? "manager"
          : "player"
      : undefined;
  const isSuperAdmin = summary?.ok && summary.currentUser.role === "admin";
  const managerGroupLimitReached = Boolean(
    summary?.ok &&
      summary.currentUser.role !== "admin" &&
      summary.managerAccess.enabled &&
      summary.managerAccess.maxGroups !== undefined &&
      summary.groupAccess.managedGroupCount >= summary.managerAccess.maxGroups
  );
  const canCreateGroups = summary?.ok && summary.currentUser.role === "admin"
    ? true
    : Boolean(summary?.ok && summary.managerAccess.enabled);
  const filteredGroups = useMemo(() => {
    const orderedGroups = [...groups].sort((left, right) => {
      if (left.canManage !== right.canManage) {
        return left.canManage ? -1 : 1;
      }

      return 0;
    });

    if (!isSuperAdmin) {
      return orderedGroups;
    }

    const query = superAdminGroupQuery.trim().toLowerCase();
    if (!query) {
      return orderedGroups;
    }

    return orderedGroups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groups, isSuperAdmin, superAdminGroupQuery]);
  const activeTrophyGroup = trophySheetTarget ? groups.find((group) => group.id === trophySheetTarget.groupId) ?? null : null;
  const activeTrophyMember = activeTrophyGroup
    ? activeTrophyGroup.members.find((member) => member.userId === trophySheetTarget?.userId) ?? null
    : null;

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingGroup(true);
    setMessage(null);

    const result = await createGroupAction({
      name: groupName,
      membershipLimit: membershipLimit ? Number(membershipLimit) : undefined
    });

    setMessage({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      setGroupName("");
      setMembershipLimit("");
      await load();
    }

    setIsCreatingGroup(false);
  }

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>, group: MyManagedGroup) {
    event.preventDefault();
    setSubmittingInviteForGroup(group.id);
    setMessage(null);

    const defaultLanguage = normalizeLanguage(summary?.ok ? summary.currentUser.preferredLanguage : undefined);
    const formState = inviteForms[group.id] ?? { email: "", suggestedDisplayName: "", language: defaultLanguage };
    const result = await createGroupInviteAction({
      groupId: group.id,
      email: formState.email,
      suggestedDisplayName: formState.suggestedDisplayName,
      language: formState.language
    });

    setMessage({
      tone: result.ok ? "success" : "error",
      text: result.message
    });

    if (result.ok) {
      const resetLanguage = normalizeLanguage(summary?.ok ? summary.currentUser.preferredLanguage : undefined);
      setInviteForms((current) => ({
        ...current,
        [group.id]: { email: "", suggestedDisplayName: "", language: resetLanguage }
      }));
      await load();
    }

    setSubmittingInviteForGroup(null);
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
    setExpandedGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId]
    );
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
  const inviteReturnPath = inviteToken
    ? appendLanguageToPath(`/my-groups?invite=${inviteToken}`, resolvedInviteLanguage)
    : undefined;
  const inviteLoginPath = inviteToken
    ? `/login?flow=invite&lang=${resolvedInviteLanguage}&next=${encodeURIComponent(inviteReturnPath ?? "/my-groups")}`
    : "/login";
  const inviteSignupPath = inviteToken
    ? `/login?mode=signup&flow=invite&lang=${resolvedInviteLanguage}&next=${encodeURIComponent(inviteReturnPath ?? "/my-groups")}`
    : "/login?mode=signup";

  return (
    <section className="space-y-5">
      <ManagementIntro
        eyebrow="Groups"
        title="Play in groups and manage them"
        description="Players see the groups they belong to. Managers get group controls. Super admins get an elevated control layer at the top."
        statusChip={
          summary?.ok
            ? `${summary.groupAccess.joinedGroupCount} joined · ${summary.groupAccess.managedGroupCount} managed`
            : null
        }
      />

      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

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
                {invitePreview.expiresAt ? ` · Expires ${formatDate(invitePreview.expiresAt)}` : ""}
              </p>
              {invitePreviewMessage ? (
                <AdminMessage tone={invitePreviewMessage.tone} message={invitePreviewMessage.text} />
              ) : null}
              {isSignedIn && invitePreview.status === "pending" ? (
                <ActionButton type="button" onClick={handleAcceptInvite} disabled={isAcceptingInvite} tone="accent" fullWidth>
                  {isAcceptingInvite ? "Joining..." : "Join Group"}
                </ActionButton>
              ) : isSignedIn ? (
                <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                  This invite has already been handled for your account.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-600">
                    Sign in or create your account with the invited email first. You can come right back to this invite.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      href={inviteLoginPath}
                      className="rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-center text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                    >
                      Sign In
                    </Link>
                    <Link
                      href={inviteSignupPath}
                      className="rounded-md border border-accent bg-accent px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
                    >
                      Create Account
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : invitePreviewMessage ? (
            <div className="mt-3">
              <AdminMessage tone={invitePreviewMessage.tone} message={invitePreviewMessage.text} />
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
              <ManagementBadge label="super admin" tone="accent" />
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
            <AdminInvitesSection showHeader={false} showInviteList={false} />
          </div>
        </ManagementCard>
      ) : null}

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
            {inviteEntryError ? <AdminMessage tone="error" message={inviteEntryError} /> : null}
          </div>
        </ManagementCard>
      ) : null}

      {canCreateGroups ? (
        managerGroupLimitReached ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2 text-sm font-semibold text-amber-800">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                You are already using all {summary?.ok ? summary.managerAccess.maxGroups : 0} of your available groups.
                Ask a super admin if you need a higher group limit.
              </p>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleCreateGroup}
            className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4 transition-colors"
          >
            <h3 className="text-lg font-bold">{summary?.ok && summary.currentUser.role === "admin" ? "Create a group (Unlimited)" : "Create a group"}</h3>
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
              <span className="text-sm font-bold text-gray-800">Membership limit</span>
              <input
                type="number"
                min={1}
                value={membershipLimit}
                onChange={(event) => setMembershipLimit(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="Leave blank for the default"
              />
            </label>
            <ActionButton type="submit" disabled={isCreatingGroup} tone="accent" fullWidth>
              {isCreatingGroup ? "Creating..." : "Create Group"}
            </ActionButton>
          </form>
        )
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-bold">Groups</h3>
          <p className="mt-1 text-sm font-semibold text-gray-600">
            {summary?.ok && summary.currentUser.role === "admin"
              ? "See every group, members, invites, and the admin control layer."
              : summary?.ok && summary.managerAccess.enabled
                ? "See your groups, members, invites, and the limits that apply to you."
                : "See the groups you belong to and who is in them."}
          </p>
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
                : summary?.ok && !summary.groupAccess.hasAnyGroups
                ? "No managed groups yet. Use a new invite link or create a group if you have manager access."
                : "No groups available right now."
            }
          />
        ) : (
          filteredGroups.map((group) => {
            const defaultInviteLanguage = normalizeLanguage(summary?.ok ? summary.currentUser.preferredLanguage : undefined);
            const formState = inviteForms[group.id] ?? { email: "", suggestedDisplayName: "", language: defaultInviteLanguage };
            const trophyDraft = groupTrophyDrafts[group.id] ?? { name: "", icon: "", description: "" };
            const groupLimitFormValue = groupLimitForms[group.id] ?? String(group.membershipLimit);
            const usesDisclosure = true;
            const isExpanded = usesDisclosure ? expandedGroupIds.includes(group.id) : true;
            const isGroupLimitExpanded = expandedGroupLimitIds.includes(group.id);
            const isPeopleInvitesExpanded = expandedPeopleInviteIds.includes(group.id);
            const isTrophyExpanded = expandedTrophyIds.includes(group.id);
            const isGroupInfoExpanded = expandedGroupInfoIds.includes(group.id);
            const managerTrophies = group.trophies.filter(
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
            const activeMembers = group.members.filter((member) => member.role === "member");

            return (
              <ManagementCard
                key={group.id}
                title={group.name}
                titleClassName="text-2xl"
                className="bg-gray-50"
                subtitle={
                  group.canManage
                    ? `${group.memberCount} members · ${group.pendingInviteCount} pending invites`
                    : `${group.memberCount} members`
                }
                badges={
                  <>
                    <ManagementBadge label={group.status} tone={group.status === "active" ? "success" : "neutral"} />
                    <ManagementBadge label={`${group.membershipLimit} seats`} tone="neutral" />
                    {group.userRole === "super_admin" ? (
                      <ManagementBadge label="super admin" tone="accent" />
                    ) : group.userRole === "manager" ? (
                      <ManagementBadge label="manager" tone="accent" />
                    ) : (
                      <ManagementBadge label="player" tone="neutral" />
                    )}
                  </>
                }
                headerActions={
                  usesDisclosure ? (
                    <button
                      type="button"
                      onClick={() => toggleExpandedGroup(group.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Hide ${group.name} details` : `Open ${group.name} details`}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                      {isExpanded ? "Hide" : "Open"}
                    </button>
                  ) : null
                }
              >
                {isExpanded ? (
                  <>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={getGroupLeaderboardHref(group)}
                        className="inline-flex"
                      >
                        <ActionButton>View Leaderboard</ActionButton>
                      </Link>
                    </div>

                    {group.canManage ? (
                    <>
                    <form className="mt-4 space-y-3" onSubmit={(event) => handleCreateInvite(event, group)}>
                      <label className="block">
                        <span className="text-sm font-bold text-gray-800">Invite by email</span>
                        <input
                          type="email"
                          required
                          value={formState.email}
                          onChange={(event) =>
                            setInviteForms((current) => ({
                              ...current,
                              [group.id]: {
                                ...formState,
                                email: event.target.value
                              }
                            }))
                          }
                          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                        />
                        {(inviteSuggestions[group.id] ?? []).length > 0 ? (
                          <div className="mt-2 space-y-2">
                            <p className="text-xs font-semibold text-gray-500">
                              Suggestions include existing players and previous app invites.
                            </p>
                            <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                              {(inviteSuggestions[group.id] ?? []).map((suggestion) => (
                                <button
                                  key={suggestion.email}
                                  type="button"
                                  onClick={() =>
                                    setInviteForms((current) => ({
                                      ...current,
                                      [group.id]: {
                                        ...formState,
                                        email: suggestion.email
                                      }
                                    }))
                                  }
                                  className="block w-full rounded-md bg-white px-3 py-2 text-left text-sm font-semibold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                                >
                                  {suggestion.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </label>
                      <label className="block">
                        <span className="text-sm font-bold text-gray-800">Suggested name (temporary)</span>
                        <input
                          value={formState.suggestedDisplayName}
                          onChange={(event) =>
                            setInviteForms((current) => ({
                              ...current,
                              [group.id]: {
                                ...formState,
                                suggestedDisplayName: event.target.value
                              }
                            }))
                          }
                          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                        />
                        <p className="mt-2 text-xs font-semibold text-gray-500">
                          This only helps identify the invite. Players still choose their own profile name during setup.
                        </p>
                      </label>
                      <label className="block">
                        <span className="text-sm font-bold text-gray-800">Invite language</span>
                        <select
                          value={formState.language}
                          onChange={(event) =>
                            setInviteForms((current) => ({
                              ...current,
                              [group.id]: {
                                ...formState,
                                language: normalizeLanguage(event.target.value)
                              }
                            }))
                          }
                          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                        >
                          <option value="en">English</option>
                          <option value="es">Spanish</option>
                        </select>
                        <p className="mt-2 text-xs font-semibold text-gray-500">
                          Choose the language your invitee will see during signup. This language will be used for the
                          invitation email and first signup experience.
                        </p>
                      </label>
                      <ActionButton type="submit" disabled={submittingInviteForGroup === group.id} fullWidth>
                        {submittingInviteForGroup === group.id ? "Sending invite..." : "Send Group Invite"}
                      </ActionButton>
                    </form>
                    <div className="h-2" aria-hidden />
                    </>
                    ) : null}

                    {group.canManage ? (() => {
                  const directoryState = groupDirectoryState[group.id] ?? { search: "", filter: "all" as const };
                  const normalizedQuery = directoryState.search.trim().toLowerCase();
                  const filteredMembers = group.members.filter((member) => {
                    const matchesSearch =
                      !normalizedQuery ||
                      member.name.toLowerCase().includes(normalizedQuery) ||
                      member.email.toLowerCase().includes(normalizedQuery);

                    if (!matchesSearch) {
                      return false;
                    }

                    return directoryState.filter === "all" || directoryState.filter === "members";
                  });
                  const filteredInvites = group.invites.filter((invite) => {
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
                    <div className="space-y-3">
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">People & invites</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {group.members.length} members · {group.invites.length} invites
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleExpandedSection(group.id, setExpandedPeopleInviteIds)}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
                            aria-expanded={isPeopleInvitesExpanded}
                            aria-label={isPeopleInvitesExpanded ? `Hide ${group.name} people and invites` : `Open ${group.name} people and invites`}
                          >
                            {isPeopleInvitesExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                            {isPeopleInvitesExpanded ? "Hide" : "Open"}
                          </button>
                        </div>

                        {isPeopleInvitesExpanded ? (
                          <>
                      {(() => {
                        const pendingInviteCount = group.invites.filter((invite) => invite.status === "pending").length;
                        const acceptedInviteCount = group.invites.filter((invite) => invite.status === "accepted").length;
                        const filterOptions = [
                          { value: "all", label: `All (${group.members.length + group.invites.length})` },
                          { value: "members", label: `Members (${group.members.length})` },
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
                                  <p className="truncate text-sm font-semibold text-gray-600">{member.email}</p>
                                  {member.homeTeamId ? (
                                    <div className="mt-2">
                                      <HomeTeamBadge teamId={member.homeTeamId} />
                                    </div>
                                  ) : null}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {member.trophies.length > 0 ? (
                                      member.trophies.map((trophy) => (
                                        <span
                                          key={`${member.membershipId}-${trophy.id}`}
                                          className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700"
                                        >
                                          {trophy.icon} {trophy.name}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-xs font-semibold text-gray-500">No trophies yet</span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {member.role} · Joined {formatDate(member.joinedAt)}
                                  </p>
                                </div>
                              </div>
                                  {group.canManage && (member.userId !== currentUserId || canSelfAwardTrophies) ? (
                                    <div className="flex flex-col items-end gap-2">
                                      <button
                                        type="button"
                                      onClick={() => {
                                        setTrophySheetTarget({ groupId: group.id, userId: member.userId });
                                    }}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-lg transition hover:border-amber-300 hover:bg-amber-100"
                                    aria-label={`Award ${member.name} a trophy`}
                                  >
                                    🏆
                                  </button>
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
                          const inviteStatusLabel = invite.status === "revoked" ? "canceled" : invite.status;
                          const editValue = editingInviteNames[invite.id] ?? invite.suggestedDisplayName ?? "";
                          const isInviteEditorExpanded = expandedInviteEditorIds.includes(invite.id);

                          return (
                            <div key={invite.id} className="space-y-3 rounded-md border border-gray-200 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-gray-950">{invite.email}</p>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {inviteStatusLabel}
                                    {invite.expiresAt ? ` · Expires ${formatDate(invite.expiresAt)}` : ""}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-gray-500">
                                    {invite.invitedByLabel ? `Invited by ${invite.invitedByLabel}` : "Group invite"}
                                    {invite.lastSentAt ? ` · Last sent ${formatDate(invite.lastSentAt)}` : ""}
                                    {` · Send attempts ${invite.sendAttempts}`}
                                  </p>
                                  {invite.lastError ? (
                                    <p className="mt-1 text-xs font-semibold text-red-700">{invite.lastError}</p>
                                  ) : null}
                                </div>
                                <div className="flex flex-col gap-2">
                                  {invite.status !== "accepted" ? (
                                    <>
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
                              {group.members.length} members
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {group.members.map((member) => (
                            <div key={member.membershipId} className="rounded-md border border-gray-200 px-3 py-3">
                              <div className="flex items-start gap-3">
                                <Avatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-gray-950">{member.name}</p>
                                  <p className="truncate text-sm font-semibold text-gray-600">{member.email}</p>
                                  {member.homeTeamId ? (
                                    <div className="mt-2">
                                      <HomeTeamBadge teamId={member.homeTeamId} />
                                    </div>
                                  ) : null}
                                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    {member.role} · Joined {formatDate(member.joinedAt)}
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
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Group limit</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {isSuperAdmin
                                ? "Adjust this group directly with unlimited super admin access."
                                : `Your current manager allowance is ${summary?.ok ? summary.managerAccess.maxMembersPerGroup : group.membershipLimit} members per group.`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleExpandedSection(group.id, setExpandedGroupLimitIds)}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
                            aria-expanded={isGroupLimitExpanded}
                            aria-label={isGroupLimitExpanded ? `Hide ${group.name} group limit` : `Open ${group.name} group limit`}
                          >
                            {isGroupLimitExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                            {isGroupLimitExpanded ? "Hide" : "Open"}
                          </button>
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
                              disabled={actionKey === `update-group-limit-${group.id}`}
                              fullWidth
                            >
                              {actionKey === `update-group-limit-${group.id}` ? "Saving limit..." : "Save Group Limit"}
                            </ActionButton>
                          </form>
                        ) : null}
                      </div>
                    ) : null}

                    {group.canManage ? (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Trophies</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {coreTrophies.length} core · {customTrophies.length} of 10 custom
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleExpandedSection(group.id, setExpandedTrophyIds)}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
                            aria-expanded={isTrophyExpanded}
                            aria-label={isTrophyExpanded ? `Hide ${group.name} trophies` : `Open ${group.name} trophies`}
                          >
                            {isTrophyExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                            {isTrophyExpanded ? "Hide" : "Open"}
                          </button>
                        </div>

                        {isTrophyExpanded ? (
                          <>
                            {group.userRole === "super_admin" || managerCustomTrophiesEnabled ? (
                              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-600">
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
                              <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-600">
                                Custom trophy creation is manager-only and currently turned off.
                              </div>
                            )}

                            <div className="mt-4 space-y-2">
                              {orderedManagerTrophies.length > 0 ? (
                                orderedManagerTrophies.map((trophy) => {
                                  const selectedUserId = groupTrophyAwardSelections[group.id]?.[trophy.id] ?? "";
                                  const alreadyAwardedUserIds = new Set(
                                    group.members
                                      .filter((member) => member.trophies.some((awarded) => awarded.id === trophy.id))
                                      .map((member) => member.userId)
                                  );
                                  const eligibleMembers = activeMembers.filter(
                                    (member) =>
                                      (canSelfAwardTrophies || member.userId !== currentUserId) &&
                                      !alreadyAwardedUserIds.has(member.userId)
                                  );

                                  return (
                                    <div key={trophy.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
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
                                <div className="rounded-md bg-gray-100 px-3 py-3 text-sm font-semibold text-gray-600">
                                  <p>No trophies available yet</p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    Save a custom trophy to recognize a player in this group.
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-600">
                              Want the fastest path? Open a player row and tap <span className="font-black text-gray-900">🏆</span> for quick awarding.
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {group.canManage ? (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Details</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              Capacity, access, and delete controls.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleExpandedSection(group.id, setExpandedGroupInfoIds)}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light"
                            aria-expanded={isGroupInfoExpanded}
                            aria-label={isGroupInfoExpanded ? `Hide ${group.name} details` : `Open ${group.name} details`}
                          >
                            {isGroupInfoExpanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
                            {isGroupInfoExpanded ? "Hide" : "Open"}
                          </button>
                        </div>

                        {isGroupInfoExpanded ? (
                          <div className="mt-3 space-y-4">
                            <ManagementGrid>
                              <ManagementDatum label="Capacity" value={`${group.memberCount + group.pendingInviteCount} / ${group.membershipLimit} seats used`} />
                              <ManagementDatum label="Group limit" value={`${group.membershipLimit} members`} />
                              <ManagementDatum label="Members" value={group.memberCount} />
                              <ManagementDatum label="Pending invites" value={group.pendingInviteCount} />
                              <ManagementDatum
                                label="Your access"
                                value={
                                  group.userRole === "super_admin"
                                    ? "Super Admin"
                                    : group.userRole === "manager"
                                      ? "Manager"
                                      : "Player"
                                }
                              />
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
                    ) : null}
                  </>
                ) : null}
              </ManagementCard>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <HierarchyPanel activeLevel={activeHierarchyLevel} />

        <ManagementCard
          title="Your access"
          subtitle={
            summary?.ok && summary.currentUser.role === "admin"
              ? "Unlimited controls inside Groups."
              : summary?.ok && summary.managerAccess.enabled
                ? "Your manager limits and current usage."
                : "Your current group access."
          }
        >
          {isLoading ? (
            <p className="mt-3 text-sm font-semibold text-gray-600">Loading your access...</p>
          ) : summary?.ok ? (
            <ManagementGrid>
              <ManagementDatum
                label="Joined groups"
                value={`${summary.groupAccess.joinedGroupCount}`}
              />
              <ManagementDatum
                label="Managed groups"
                value={
                  summary.currentUser.role === "admin"
                    ? "Unlimited"
                    : summary.managerAccess.enabled
                      ? `${summary.groupAccess.managedGroupCount} / ${summary.managerAccess.maxGroups}`
                      : "None"
                }
              />
              <ManagementDatum
                label="New group limit"
                value={
                  summary.currentUser.role === "admin"
                    ? "Unlimited"
                    : summary.managerAccess.enabled
                      ? `${summary.managerAccess.maxMembersPerGroup} members`
                      : "Not enabled"
                }
              />
              <ManagementDatum
                label="Scope"
                value={
                  summary.currentUser.role === "admin"
                    ? "All groups"
                    : summary.managerAccess.enabled
                      ? "Assigned groups only"
                      : "Joined groups only"
                }
              />
            </ManagementGrid>
          ) : (
            <p className="mt-3 text-sm font-semibold text-gray-600">{summary?.message ?? "Sign in to manage groups."}</p>
          )}
        </ManagementCard>
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
