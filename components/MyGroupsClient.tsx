"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  acceptGroupInviteAction,
  cancelGroupInviteAction,
  createGroupAction,
  createGroupInviteAction,
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
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { formatDate } from "@/components/admin/AdminInvitesClient";
import {
  ActionButton,
  HierarchyPanel,
  InlineConfirmation,
  ManagementBadge,
  ManagementCard,
  ManagementDatum,
  ManagementEmptyState,
  ManagementGrid,
  ManagementIntro,
  ManagementToolbar
} from "@/components/player-management/Shared";

type MyGroupsClientProps = {
  inviteToken?: string;
};

type ToastState = { tone: "success" | "error"; text: string } | null;

export function MyGroupsClient({ inviteToken }: MyGroupsClientProps) {
  const [summary, setSummary] = useState<FetchMyGroupsResult | null>(null);
  const [managedGroupsResult, setManagedGroupsResult] = useState<ListManagedGroupPlayersResult | null>(null);
  const [message, setMessage] = useState<ToastState>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [membershipLimit, setMembershipLimit] = useState("");
  const [inviteForms, setInviteForms] = useState<Record<string, { email: string; suggestedDisplayName: string }>>({});
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
  const [searchValue, setSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState<"all" | "members" | "invites">("all");
  const [confirmation, setConfirmation] = useState<{
    key: string;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

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

  const groups = useMemo(
    () => (managedGroupsResult?.ok ? managedGroupsResult.groups : []),
    [managedGroupsResult]
  );
  const filteredGroups = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return groups.filter((group) => {
      const matchesSearch =
        !query ||
        group.name.toLowerCase().includes(query) ||
        group.members.some((member) => member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query)) ||
        group.invites.some((invite) => invite.email.toLowerCase().includes(query) || (invite.suggestedDisplayName ?? "").toLowerCase().includes(query));

      if (!matchesSearch) {
        return false;
      }

      if (filterValue === "members") {
        return group.members.length > 0;
      }

      if (filterValue === "invites") {
        return group.invites.length > 0;
      }

      return true;
    });
  }, [filterValue, groups, searchValue]);
  const currentUser = summary?.ok ? summary.currentUser : null;
  const isSignedIn = Boolean(currentUser);
  const canCreateGroups = summary?.ok && summary.currentUser.role === "admin"
    ? true
    : Boolean(summary?.ok && summary.managerAccess.enabled);

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

  const inviteLoginPath = inviteToken ? `/login?flow=invite&next=${encodeURIComponent(`/my-groups?invite=${inviteToken}`)}` : "/login";
  const inviteSignupPath = inviteToken
    ? `/login?mode=signup&flow=invite&next=${encodeURIComponent(`/my-groups?invite=${inviteToken}`)}`
    : "/login?mode=signup";

  return (
    <section className="space-y-5">
      <ManagementIntro
        eyebrow="My Groups"
        title="Create and manage private pools."
        description="Keep one set of picks across the app, then compete inside the groups you manage or join."
      />
      <HierarchyPanel />

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

      <ManagementCard
        title="Manager access"
        subtitle={
          summary?.ok && summary.currentUser.role === "admin"
            ? "Super admins do not have group or manager limits."
            : "Managers can only act inside groups they manage."
        }
        badges={
          summary?.ok
            ? (
                <>
                  <ManagementBadge label={summary.currentUser.role === "admin" ? "super admin" : "manager"} tone={summary.currentUser.role === "admin" ? "accent" : "neutral"} />
                  <ManagementBadge
                    label={
                      summary.currentUser.role === "admin"
                        ? "unlimited"
                        : summary.managerAccess.enabled
                          ? "limited by assigned permissions"
                          : "participant"
                    }
                    tone={summary.currentUser.role === "admin" ? "accent" : "neutral"}
                  />
                </>
              )
            : undefined
        }
      >
        {isLoading ? (
          <p className="mt-3 text-sm font-semibold text-gray-600">Loading your access...</p>
        ) : summary?.ok ? (
          <div className="space-y-2 text-sm font-semibold text-gray-700">
            <p>
              {summary.currentUser.role === "admin"
                ? "Super admin access is active."
                : summary.managerAccess.enabled
                  ? `Manager access is enabled. You can manage up to ${summary.managerAccess.maxGroups} group${summary.managerAccess.maxGroups === 1 ? "" : "s"} with up to ${summary.managerAccess.maxMembersPerGroup} members each.`
                  : "Manager access is not enabled for this account yet."}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-gray-600">{summary?.message ?? "Sign in to manage groups."}</p>
        )}
      </ManagementCard>

      {canCreateGroups ? (
        <form onSubmit={handleCreateGroup} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-lg font-bold">Create a group</h3>
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
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-bold">Manage Players</h3>
          <p className="mt-1 text-sm font-semibold text-gray-600">See members, invites, and group capacity for every group you manage.</p>
        </div>
        <ManagementToolbar
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          filterValue={filterValue}
          onFilterChange={(value) => setFilterValue(value as "all" | "members" | "invites")}
          filters={[
            { value: "all", label: "All groups" },
            { value: "members", label: "Groups with members" },
            { value: "invites", label: "Groups with invites" }
          ]}
        />
        {isLoading ? (
          <ManagementEmptyState message="Loading groups..." />
        ) : filteredGroups.length === 0 ? (
          <ManagementEmptyState message="No groups match the current search or filter." />
        ) : (
          filteredGroups.map((group) => {
            const formState = inviteForms[group.id] ?? { email: "", suggestedDisplayName: "" };

            return (
              <ManagementCard
                key={group.id}
                title={group.name}
                subtitle={`${group.memberCount} members · ${group.pendingInviteCount} pending invites`}
                badges={
                  <>
                    <ManagementBadge label={group.status} tone={group.status === "active" ? "success" : "neutral"} />
                    <ManagementBadge label={`limit ${group.membershipLimit}`} tone="neutral" />
                  </>
                }
              >
                <ManagementGrid>
                  <ManagementDatum label="Capacity" value={`${group.memberCount + group.pendingInviteCount} / ${group.membershipLimit} used`} />
                  <ManagementDatum label="Members" value={group.memberCount} />
                  <ManagementDatum label="Pending invites" value={group.pendingInviteCount} />
                  <ManagementDatum label="Scope" value="Managers can only act inside assigned groups." />
                </ManagementGrid>

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
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold text-gray-800">Suggested display name</span>
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
                  </label>
                  <ActionButton type="submit" disabled={submittingInviteForGroup === group.id} fullWidth>
                    {submittingInviteForGroup === group.id ? "Sending invite..." : "Send Group Invite"}
                  </ActionButton>
                </form>

                <div className="space-y-2">
                  <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Members</h4>
                  {group.members.length === 0 ? (
                    <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">No members yet.</p>
                  ) : (
                    group.members.map((member) => (
                      <div key={member.membershipId} className="rounded-md border border-gray-200 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-gray-950">{member.name}</p>
                            <p className="truncate text-sm font-semibold text-gray-600">{member.email}</p>
                            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {member.role} · Joined {formatDate(member.joinedAt)}
                            </p>
                          </div>
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
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Invites</h4>
                  {group.invites.length === 0 ? (
                    <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">No invites yet.</p>
                  ) : (
                    group.invites.map((invite) => {
                      const inviteStatusLabel = invite.status === "revoked" ? "canceled" : invite.status;
                      const editValue = editingInviteNames[invite.id] ?? invite.suggestedDisplayName ?? "";

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

                          {invite.status === "pending" ? (
                            <div className="space-y-2">
                              <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Suggested display name</span>
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
                    })
                  )}
                </div>
              </ManagementCard>
            );
          })
        )}
      </section>
    </section>
  );
}
