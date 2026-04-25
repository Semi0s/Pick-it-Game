"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  acceptGroupInviteAction,
  cancelGroupInviteAction,
  createGroupAction,
  createGroupInviteAction,
  deleteManagedGroupAction,
  fetchGroupInvitePreviewAction,
  fetchMyGroupsAction,
  listManagedGroupPlayersAction,
  removeGroupMemberAction,
  resendGroupInviteAction,
  updateGroupInviteNameAction,
  type FetchMyGroupsResult,
  type ListManagedGroupPlayersResult,
  type MyManagedGroup
} from "@/app/my-groups/actions";
import { fetchInviteAutocompleteAction, type InviteAutocompleteOption } from "@/app/invites/actions";
import { AdminInvitesSection } from "@/components/admin/AdminInvitesClient";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { formatDate } from "@/components/admin/AdminInvitesClient";
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
};

type ToastState = { tone: "success" | "error"; text: string } | null;

export function MyGroupsClient({ inviteToken }: MyGroupsClientProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<FetchMyGroupsResult | null>(null);
  const [managedGroupsResult, setManagedGroupsResult] = useState<ListManagedGroupPlayersResult | null>(null);
  const [message, setMessage] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [membershipLimit, setMembershipLimit] = useState("");
  const [inviteForms, setInviteForms] = useState<Record<string, { email: string; suggestedDisplayName: string }>>({});
  const [inviteSuggestions, setInviteSuggestions] = useState<Record<string, InviteAutocompleteOption[]>>({});
  const [editingInviteNames, setEditingInviteNames] = useState<Record<string, string>>({});
  const [submittingInviteForGroup, setSubmittingInviteForGroup] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [invitePreviewMessage, setInvitePreviewMessage] = useState<ToastState>(null);
  const [invitePreview, setInvitePreview] = useState<{
    groupName: string;
    email: string;
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

  const load = useCallback(async () => {
    setIsLoading(true);
    const [summaryResult, groupsResult] = await Promise.all([
      fetchMyGroupsAction(),
      listManagedGroupPlayersAction()
    ]);

    setSummary(summaryResult);
    setManagedGroupsResult(groupsResult);

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
          status: result.invite.status,
          expiresAt: result.invite.expiresAt
        });
      })
      .finally(() => setIsLoadingInvitePreview(false));
  }, [inviteToken]);

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
    if (!isSuperAdmin) {
      return groups;
    }

    const query = superAdminGroupQuery.trim().toLowerCase();
    if (!query) {
      return groups;
    }

    return groups.filter((group) => group.name.toLowerCase().includes(query));
  }, [groups, isSuperAdmin, superAdminGroupQuery]);

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

    const formState = inviteForms[group.id] ?? { email: "", suggestedDisplayName: "" };
    const result = await createGroupInviteAction({
      groupId: group.id,
      email: formState.email,
      suggestedDisplayName: formState.suggestedDisplayName
    });

    setMessage({
      tone: result.ok ? "success" : "error",
      text: result.message
    });

    if (result.ok) {
      setInviteForms((current) => ({
        ...current,
        [group.id]: { email: "", suggestedDisplayName: "" }
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

  const inviteLoginPath = inviteToken ? `/login?flow=invite&next=${encodeURIComponent(`/my-groups?invite=${inviteToken}`)}` : "/login";
  const inviteSignupPath = inviteToken
    ? `/login?mode=signup&flow=invite&next=${encodeURIComponent(`/my-groups?invite=${inviteToken}`)}`
    : "/login?mode=signup";

  return (
    <section className="space-y-5">
      <ManagementIntro
        eyebrow="Groups"
        title="Play in groups and manage them"
        description="Players see the groups they belong to. Managers get group controls. Super admins get an elevated control layer at the top."
      />
      <HierarchyPanel activeLevel={activeHierarchyLevel} />

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
              label="Members per group"
              value={
                summary.currentUser.role === "admin"
                  ? "Unlimited"
                  : summary.managerAccess.enabled
                    ? `${summary.managerAccess.maxMembersPerGroup}`
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
        <form
          onSubmit={handleCreateGroup}
          className={`space-y-4 rounded-lg border p-4 transition-colors ${
            managerGroupLimitReached ? "border-gray-200 bg-gray-100" : "border-green-200 bg-green-50"
          }`}
        >
          <h3 className="text-lg font-bold">{summary?.ok && summary.currentUser.role === "admin" ? "Create a group (Unlimited)" : "Create a group"}</h3>
          {managerGroupLimitReached ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                You are already using all {summary?.ok ? summary.managerAccess.maxGroups : 0} of your available groups.
                Ask a super admin if you need a higher group limit.
              </p>
            </div>
          ) : null}
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Group name</span>
            <input
              required
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              disabled={managerGroupLimitReached}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Membership limit</span>
            <input
              type="number"
              min={1}
              value={membershipLimit}
              onChange={(event) => setMembershipLimit(event.target.value)}
              disabled={managerGroupLimitReached}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500"
              placeholder="Leave blank for the default"
            />
          </label>
          <ActionButton type="submit" disabled={isCreatingGroup || managerGroupLimitReached} tone="accent" fullWidth>
            {managerGroupLimitReached ? "Group limit reached" : isCreatingGroup ? "Creating..." : "Create Group"}
          </ActionButton>
        </form>
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
            const formState = inviteForms[group.id] ?? { email: "", suggestedDisplayName: "" };
            const isExpanded = !isSuperAdmin || expandedGroupIds.includes(group.id);

            return (
              <ManagementCard
                key={group.id}
                title={group.name}
                titleClassName="text-2xl"
                subtitle={
                  group.canManage
                    ? `${group.memberCount} members · ${group.pendingInviteCount} pending invites`
                    : `${group.memberCount} members`
                }
                badges={
                  <>
                    <ManagementBadge label={group.status} tone={group.status === "active" ? "success" : "neutral"} />
                    <ManagementBadge label={`limit ${group.membershipLimit}`} tone="neutral" />
                    {group.userRole === "super_admin" ? (
                      <ManagementBadge label="super admin" tone="accent" />
                    ) : group.userRole === "manager" ? (
                      <ManagementBadge label="manager" tone="accent" />
                    ) : (
                      <ManagementBadge label="player" tone="neutral" />
                    )}
                  </>
                }
              >
                <ManagementGrid>
                  <ManagementDatum label="Capacity" value={`${group.memberCount + group.pendingInviteCount} / ${group.membershipLimit} used`} />
                  <ManagementDatum label="Members" value={group.memberCount} />
                  <ManagementDatum label="Pending invites" value={group.canManage ? group.pendingInviteCount : "Manager only"} />
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
                {isSuperAdmin ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton onClick={() => toggleExpandedGroup(group.id)}>
                      {isExpanded ? "Hide Details" : "Open Group"}
                    </ActionButton>
                  </div>
                ) : null}

                {isExpanded && group.canManage ? (
                  <>
                    <div className="mt-4">
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
                      <ActionButton type="submit" disabled={submittingInviteForGroup === group.id} fullWidth>
                        {submittingInviteForGroup === group.id ? "Sending invite..." : "Send Group Invite"}
                      </ActionButton>
                    </form>
                  </>
                ) : isExpanded ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/leaderboard" className="inline-flex">
                      <ActionButton>View Leaderboard</ActionButton>
                    </Link>
                  </div>
                ) : null}

                {isExpanded ? (
                (() => {
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
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">People & invites</h4>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {group.members.length} members · {group.invites.length} invites
                            </p>
                          </div>
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

                      <div className="space-y-2">
                        {filteredMembers.map((member) => (
                          <div key={member.membershipId} className="rounded-md border border-gray-200 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-gray-950">{member.name}</p>
                                <p className="truncate text-sm font-semibold text-gray-600">{member.email}</p>
                                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  {member.role} · Joined {formatDate(member.joinedAt)}
                                </p>
                              </div>
                              {group.canManage && member.role === "member" ? (
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
                    </div>
                  );
                })()
                ) : null}
              </ManagementCard>
            );
          })
        )}
      </section>
    </section>
  );
}
