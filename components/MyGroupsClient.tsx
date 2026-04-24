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
      <div className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">My Groups</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Create and manage private pools.</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Keep one set of picks across the app, then compete inside the groups you manage or join.
        </p>
      </div>

      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

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
                <button
                  type="button"
                  onClick={handleAcceptInvite}
                  disabled={isAcceptingInvite}
                  className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                >
                  {isAcceptingInvite ? "Joining..." : "Join Group"}
                </button>
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
                      className="rounded-md border border-gray-300 bg-white px-4 py-3 text-center text-sm font-bold text-gray-800"
                    >
                      Sign In
                    </Link>
                    <Link
                      href={inviteSignupPath}
                      className="rounded-md bg-accent px-4 py-3 text-center text-sm font-bold text-white"
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

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-lg font-bold">Manager access</h3>
        {isLoading ? (
          <p className="mt-3 text-sm font-semibold text-gray-600">Loading your access...</p>
        ) : summary?.ok ? (
          <div className="mt-3 space-y-2 text-sm font-semibold text-gray-700">
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
      </section>

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
          <button
            type="submit"
            disabled={isCreatingGroup}
            className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
          >
            {isCreatingGroup ? "Creating..." : "Create Group"}
          </button>
        </form>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-bold">Manage Players</h3>
          <p className="mt-1 text-sm font-semibold text-gray-600">See members, invites, and group capacity for every group you manage.</p>
        </div>
        {isLoading ? (
          <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading groups...</p>
        ) : groups.length === 0 ? (
          <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
            No managed groups yet.
          </p>
        ) : (
          groups.map((group) => {
            const formState = inviteForms[group.id] ?? { email: "", suggestedDisplayName: "" };

            return (
              <div key={group.id} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-gray-950">{group.name}</p>
                    <p className="mt-1 text-sm font-semibold text-gray-600">
                      {group.memberCount} members · {group.pendingInviteCount} pending invites · limit {group.membershipLimit}
                    </p>
                  </div>
                  <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold uppercase text-gray-700">
                    {group.status}
                  </span>
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
                  <button
                    type="submit"
                    disabled={submittingInviteForGroup === group.id}
                    className="w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                  >
                    {submittingInviteForGroup === group.id ? "Queueing invite..." : "Send Group Invite"}
                  </button>
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
                            <button
                              type="button"
                              disabled={actionKey === `remove-member-${member.membershipId}`}
                              onClick={() => {
                                if (!window.confirm(`Remove ${member.name} from ${group.name}?`)) {
                                  return;
                                }

                                void withAction(`remove-member-${member.membershipId}`, async () => {
                                  const result = await removeGroupMemberAction(group.id, member.userId);
                                  setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                  if (result.ok) {
                                    await load();
                                  }
                                });
                              }}
                              className="rounded-md border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-60"
                            >
                              Remove
                            </button>
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
                                  <button
                                    type="button"
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
                                    className="rounded-md border border-gray-300 px-3 py-2 text-xs font-bold text-gray-800 disabled:opacity-60"
                                  >
                                    Resend
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionKey === `cancel-invite-${invite.id}`}
                                    onClick={() => {
                                      if (!window.confirm(`Cancel the invite for ${invite.email}?`)) {
                                        return;
                                      }

                                      void withAction(`cancel-invite-${invite.id}`, async () => {
                                        const result = await cancelGroupInviteAction(invite.id);
                                        setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                        if (result.ok) {
                                          await load();
                                        }
                                      });
                                    }}
                                    className="rounded-md border border-red-200 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-60"
                                  >
                                    Cancel
                                  </button>
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
                              <button
                                type="button"
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
                                className="w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 disabled:opacity-60"
                              >
                                Save Suggested Name
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </section>
  );
}
