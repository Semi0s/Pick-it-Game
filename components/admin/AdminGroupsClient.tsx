"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addUserToGroupAction,
  changeGroupOwnerAction,
  fetchAdminGroupsAction,
  removeUserFromGroupAction,
  updateGroupLimitAction,
  updateManagerLimitsAction,
  type AdminGroupSummary,
  type AdminManagerSummary
} from "@/app/admin/actions";
import { Avatar } from "@/components/Avatar";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { showAppToast } from "@/lib/app-toast";
import { getRoleBadgeLabel } from "@/lib/access-levels";
import { formatDateOnly } from "@/lib/date-time";
import {
  ActionButton,
  InlineDisclosureButton,
  InlineConfirmation,
  ManagementBadge,
  ManagementCard,
  ManagementDatum,
  ManagementEmptyState,
  ManagementGrid,
  ManagementIntro,
  ManagementSection,
  ManagementToolbar,
  useSessionDisclosureState
} from "@/components/player-management/Shared";

export function AdminGroupsClient() {
  return <AdminGroupsSection />;
}

export function AdminGroupsSection({
  showIntro = true,
  showPlayerManagementLink = true
}: {
  showIntro?: boolean;
  showPlayerManagementLink?: boolean;
}) {
  const [groups, setGroups] = useState<AdminGroupSummary[]>([]);
  const [managers, setManagers] = useState<AdminManagerSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [managerForms, setManagerForms] = useState<Record<string, { maxGroups: string; maxMembersPerGroup: string }>>({});
  const [groupLimitForms, setGroupLimitForms] = useState<Record<string, string>>({});
  const [groupAddForms, setGroupAddForms] = useState<Record<string, { userIdentifier: string; role: "member" | "manager"; overrideCapacity: boolean }>>({});
  const [groupOwnerForms, setGroupOwnerForms] = useState<Record<string, string>>({});
  const [searchValue, setSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState<"all" | "needs_help" | "active" | "archived">("all");
  const [confirmation, setConfirmation] = useState<{
    key: string;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  async function load() {
    setIsLoading(true);
    const result = await fetchAdminGroupsAction();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      setIsLoading(false);
      return;
    }

    setGroups(result.groups);
    setManagers(result.managers);
    setManagerForms(
      Object.fromEntries(
        result.managers.map((manager) => [
          manager.userId,
          {
            maxGroups: String(manager.maxGroups),
            maxMembersPerGroup: String(manager.maxMembersPerGroup)
          }
        ])
      )
    );
    setGroupLimitForms(Object.fromEntries(result.groups.map((group) => [group.id, String(group.membershipLimit)])));
    setGroupAddForms(
      Object.fromEntries(
        result.groups.map((group) => [
          group.id,
          {
            userIdentifier: "",
            role: "member" as const,
            overrideCapacity: false
          }
        ])
      )
    );
    setGroupOwnerForms(Object.fromEntries(result.groups.map((group) => [group.id, group.ownerEmail ?? group.ownerUserId ?? ""])));
    setIsLoading(false);
  }

  async function withAction(key: string, task: () => Promise<void>) {
    setActiveKey(key);
    setMessage(null);
    try {
      await task();
    } finally {
      setActiveKey(null);
    }
  }

  const sortedGroups = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return groups.filter((group) => {
      const matchesSearch =
        !query ||
        group.name.toLowerCase().includes(query) ||
        (group.ownerName ?? "").toLowerCase().includes(query) ||
        (group.ownerEmail ?? "").toLowerCase().includes(query) ||
        group.members.some(
          (member) =>
            member.name.toLowerCase().includes(query) ||
            member.email.toLowerCase().includes(query)
        );

      if (!matchesSearch) {
        return false;
      }

      if (filterValue === "active") {
        return group.status === "active";
      }

      if (filterValue === "archived") {
        return group.status === "archived";
      }

      if (filterValue === "needs_help") {
        return group.memberCount >= group.membershipLimit || !group.ownerUserId;
      }

      return true;
    });
  }, [filterValue, groups, searchValue]);

  const groupsNeedingHelpCount = useMemo(
    () => groups.filter((group) => group.memberCount >= group.membershipLimit || !group.ownerUserId).length,
    [groups]
  );

  return (
    <div className="space-y-5">
      {showIntro ? (
        <ManagementIntro
          eyebrow="Groups"
          title="Manage every group."
          description="Super admins can adjust manager limits, place existing players into groups, and repair ownership or capacity issues without touching gameplay data."
        />
      ) : null}

      {showPlayerManagementLink ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/players"
            className="inline-flex rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            Open Player Management
          </Link>
        </div>
      ) : null}

      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

      {confirmation ? (
        <InlineConfirmation
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
          isPending={activeKey === confirmation.key}
        />
      ) : null}

      <ManagementSection
        title="Manager Limits"
        description="Compact organizer limit cards that can be reused later for League Director and Branded League tooling."
        storageKey="admin-groups:manager-limits-section"
        defaultOpen={false}
        badge={<ManagementBadge label={`${managers.length} managers`} tone="warning" />}
      >
        {isLoading ? <ManagementEmptyState message="Loading manager limits..." /> : null}
        {!isLoading && managers.length === 0 ? <ManagementEmptyState message="No managers yet." /> : null}
        {!isLoading
          ? managers.map((manager) => {
              const form = managerForms[manager.userId] ?? {
                maxGroups: String(manager.maxGroups),
                maxMembersPerGroup: String(manager.maxMembersPerGroup)
              };

              return (
                <CompactManagerLimitCard
                  key={manager.userId}
                  manager={manager}
                  form={form}
                  isPending={activeKey === `manager-${manager.userId}`}
                  onChangeForm={(nextForm) =>
                    setManagerForms((current) => ({
                      ...current,
                      [manager.userId]: nextForm
                    }))
                  }
                  onSave={() => {
                    void withAction(`manager-${manager.userId}`, async () => {
                      const result = await updateManagerLimitsAction(
                        manager.userId,
                        Number(form.maxGroups),
                        Number(form.maxMembersPerGroup)
                      );
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await load();
                      }
                    });
                  }}
                />
              );
            })
          : null}
      </ManagementSection>

      <ManagementSection
        title="Group Management"
        description="Compact summaries for large group counts with the full repair controls tucked into the expanded state."
        storageKey="admin-groups:all-groups-section"
        defaultOpen
        badge={<ManagementBadge label={`${sortedGroups.length} groups`} tone="neutral" />}
      >
        <ManagementToolbar
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          filterValue={filterValue}
          onFilterChange={(value) => setFilterValue(value as "all" | "needs_help" | "active" | "archived")}
          filters={[
            { value: "all", label: "All groups" },
            { value: "needs_help", label: `Needs help (${groupsNeedingHelpCount})` },
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" }
          ]}
          className="sticky top-20 z-10 shadow-sm"
        />

        {isLoading ? <ManagementEmptyState message="Loading groups..." /> : null}
        {!isLoading && sortedGroups.length === 0 ? (
          <ManagementEmptyState message="No groups match the current search or filter." />
        ) : null}
        {!isLoading
          ? sortedGroups.map((group) => {
              const addForm = groupAddForms[group.id] ?? {
                userIdentifier: "",
                role: "member" as const,
                overrideCapacity: false
              };
              const groupLimit = groupLimitForms[group.id] ?? String(group.membershipLimit);
              const ownerIdentifier = groupOwnerForms[group.id] ?? (group.ownerEmail ?? group.ownerUserId ?? "");

              return (
                <CompactGroupManagementCard
                  key={group.id}
                  group={group}
                  groupLimit={groupLimit}
                  addForm={addForm}
                  ownerIdentifier={ownerIdentifier}
                  activeKey={activeKey}
                  onGroupLimitChange={(value) =>
                    setGroupLimitForms((current) => ({
                      ...current,
                      [group.id]: value
                    }))
                  }
                  onAddFormChange={(nextForm) =>
                    setGroupAddForms((current) => ({
                      ...current,
                      [group.id]: nextForm
                    }))
                  }
                  onOwnerIdentifierChange={(value) =>
                    setGroupOwnerForms((current) => ({
                      ...current,
                      [group.id]: value
                    }))
                  }
                  onSaveLimit={() => {
                    void withAction(`limit-${group.id}`, async () => {
                      const result = await updateGroupLimitAction(group.id, Number(groupLimit));
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await load();
                      }
                    });
                  }}
                  onAddUser={() => {
                    void withAction(`add-${group.id}`, async () => {
                      const result = await addUserToGroupAction({
                        userId: addForm.userIdentifier,
                        groupId: group.id,
                        role: addForm.role,
                        overrideCapacity: addForm.overrideCapacity
                      });
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await load();
                      }
                    });
                  }}
                  onChangeOwner={() => {
                    void withAction(`owner-${group.id}`, async () => {
                      const result = await changeGroupOwnerAction(group.id, ownerIdentifier);
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await load();
                      }
                    });
                  }}
                  onRemoveMember={(member) => {
                    setConfirmation({
                      key: `remove-${group.id}-${member.userId}`,
                      title: `Remove ${member.name} from ${group.name}?`,
                      description:
                        "This only removes the group membership. Their account, predictions, and any memberships in other groups stay intact.",
                      confirmLabel: "Remove From Group",
                      onConfirm: () => {
                        void withAction(`remove-${group.id}-${member.userId}`, async () => {
                          const result = await removeUserFromGroupAction(member.userId, group.id);
                          setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                          if (result.ok) {
                            setConfirmation(null);
                            await load();
                          }
                        });
                      }
                    });
                  }}
                />
              );
            })
          : null}
      </ManagementSection>
    </div>
  );
}

function CompactManagerLimitCard({
  manager,
  form,
  isPending,
  onChangeForm,
  onSave
}: {
  manager: AdminManagerSummary;
  form: { maxGroups: string; maxMembersPerGroup: string };
  isPending: boolean;
  onChangeForm: (nextForm: { maxGroups: string; maxMembersPerGroup: string }) => void;
  onSave: () => void;
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState(`admin-groups:manager:${manager.userId}`, false);

  return (
    <ManagementCard
      title={manager.name}
      subtitle={manager.email}
      badges={
        <>
          <ManagementBadge label="manager" tone="warning" />
          <ManagementBadge label={`${manager.currentGroupsUsed} / ${manager.maxGroups} groups`} tone="neutral" />
        </>
      }
      headerActions={<InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <ManagementDatum label="Groups" value={`${manager.currentGroupsUsed} / ${manager.maxGroups}`} />
        <ManagementDatum label="Member cap" value={manager.maxMembersPerGroup} />
        <ManagementDatum label="Access" value="Manager" />
      </div>
      {isOpen ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Max groups</span>
            <input
              type="number"
              min={1}
              value={form.maxGroups}
              onChange={(event) => onChangeForm({ ...form, maxGroups: event.target.value })}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Max members per group</span>
            <input
              type="number"
              min={1}
              value={form.maxMembersPerGroup}
              onChange={(event) => onChangeForm({ ...form, maxMembersPerGroup: event.target.value })}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <div className="sm:col-span-2">
            <ActionButton tone="accent" disabled={isPending} onClick={onSave}>
              {isPending ? "Saving..." : "Save Limits"}
            </ActionButton>
          </div>
        </div>
      ) : null}
    </ManagementCard>
  );
}

function CompactGroupManagementCard({
  group,
  groupLimit,
  addForm,
  ownerIdentifier,
  activeKey,
  onGroupLimitChange,
  onAddFormChange,
  onOwnerIdentifierChange,
  onSaveLimit,
  onAddUser,
  onChangeOwner,
  onRemoveMember
}: {
  group: AdminGroupSummary;
  groupLimit: string;
  addForm: { userIdentifier: string; role: "member" | "manager"; overrideCapacity: boolean };
  ownerIdentifier: string;
  activeKey: string | null;
  onGroupLimitChange: (value: string) => void;
  onAddFormChange: (value: { userIdentifier: string; role: "member" | "manager"; overrideCapacity: boolean }) => void;
  onOwnerIdentifierChange: (value: string) => void;
  onSaveLimit: () => void;
  onAddUser: () => void;
  onChangeOwner: () => void;
  onRemoveMember: (member: AdminGroupSummary["members"][number]) => void;
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState(`admin-groups:group:${group.id}`, false);
  const isFull = group.memberCount >= group.membershipLimit;

  return (
    <ManagementCard
      title={group.name}
      titleClassName="text-xl"
      subtitle={
        group.ownerEmail
          ? `Owner: ${group.ownerName ?? "Unknown"} · ${group.ownerEmail}`
          : "No owner assigned · Super Admin fallback active"
      }
      badges={
        <>
          <ManagementBadge label={group.status} tone={group.status === "active" ? "success" : "neutral"} />
          <ManagementBadge label={`${group.memberCount} / ${group.membershipLimit} members`} tone={isFull ? "warning" : "neutral"} />
          <ManagementBadge label={group.activeAccessCodeCount > 0 ? `${group.activeAccessCodeCount} active codes` : "No active code"} tone={group.activeAccessCodeCount > 0 ? "accent" : "neutral"} />
          {group.pendingInviteCount > 0 ? <ManagementBadge label={`${group.pendingInviteCount} pending invites`} tone="warning" /> : null}
          {!group.ownerUserId ? <ManagementBadge label="No owner" tone="danger" /> : null}
          {!group.ownerUserId ? <ManagementBadge label="Super Admin fallback" tone="warning" /> : null}
          {group.staleInviteCount > 0 ? <ManagementBadge label={`${group.staleInviteCount} stale invite`} tone="danger" /> : null}
        </>
      }
      headerActions={<InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ManagementDatum
          label="Owner / manager"
          value={group.ownerName ?? "Unassigned"}
          note={!group.ownerUserId ? "Super Admin fallback active" : undefined}
        />
        <ManagementDatum label="Invite / code" value={group.activeAccessCodeCount > 0 ? "Code live" : "No live code"} />
        <ManagementDatum label="Pending invites" value={group.pendingInviteCount} />
        <ManagementDatum
          label="Warnings"
          value={!group.ownerUserId ? "Owner missing" : isFull ? "Full" : group.staleInviteCount > 0 ? "Stale invite" : "Clear"}
        />
      </div>

      {isOpen ? (
        <>
          <ManagementGrid>
            <ManagementDatum label="Membership limit" value={group.membershipLimit} />
            <ManagementDatum label="Current members" value={group.memberCount} />
            <ManagementDatum label="Owner id" value={group.ownerUserId ?? "—"} />
            <ManagementDatum label="Status" value={group.status} />
          </ManagementGrid>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-black text-gray-950">Edit group limit</p>
              <label className="mt-3 block">
                <span className="text-sm font-bold text-gray-800">Membership limit</span>
                <input
                  type="number"
                  min={1}
                  value={groupLimit}
                  onChange={(event) => onGroupLimitChange(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                />
              </label>
              <div className="mt-3">
                <ActionButton tone="accent" disabled={activeKey === `limit-${group.id}`} onClick={onSaveLimit}>
                  {activeKey === `limit-${group.id}` ? "Saving..." : "Save Limit"}
                </ActionButton>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-black text-gray-950">Add existing user</p>
              <label className="mt-3 block">
                <span className="text-sm font-bold text-gray-800">User email or id</span>
                <input
                  value={addForm.userIdentifier}
                  onChange={(event) => onAddFormChange({ ...addForm, userIdentifier: event.target.value })}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                />
              </label>
              <label className="mt-3 block">
                <span className="text-sm font-bold text-gray-800">Role in group</span>
                <select
                  value={addForm.role}
                  onChange={(event) => onAddFormChange({ ...addForm, role: event.target.value as "member" | "manager" })}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={addForm.overrideCapacity}
                  onChange={(event) => onAddFormChange({ ...addForm, overrideCapacity: event.target.checked })}
                />
                Override capacity if full
              </label>
              <div className="mt-3">
                <ActionButton tone="accent" disabled={activeKey === `add-${group.id}`} onClick={onAddUser}>
                  {activeKey === `add-${group.id}` ? "Adding..." : "Add To Group"}
                </ActionButton>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-black text-gray-950">Change owner</p>
              <label className="mt-3 block">
                <span className="text-sm font-bold text-gray-800">New owner email or id</span>
                <input
                  value={ownerIdentifier}
                  onChange={(event) => onOwnerIdentifierChange(event.target.value)}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton tone="accent" disabled={activeKey === `owner-${group.id}`} onClick={onChangeOwner}>
                  {activeKey === `owner-${group.id}` ? "Saving..." : "Change Owner"}
                </ActionButton>
                <Link
                  href="/leaderboard"
                  className="inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                >
                  View Leaderboards
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-sm font-black text-gray-950">Members</p>
            {group.members.length === 0 ? (
              <ManagementEmptyState message="No members in this group yet." />
            ) : (
              group.members.map((member) => (
                <div
                  key={member.membershipId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <Avatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-gray-950">{member.name}</p>
                      <p className="truncate text-sm font-semibold text-gray-600">{member.email}</p>
                      <p className="text-xs font-semibold text-gray-500">Joined {formatDateOnly(member.joinedAt)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ManagementBadge label={getRoleBadgeLabel(member.role)} tone={member.role === "manager" ? "warning" : "neutral"} />
                    <ActionButton
                      tone="danger"
                      disabled={activeKey === `remove-${group.id}-${member.userId}`}
                      onClick={() => onRemoveMember(member)}
                    >
                      {activeKey === `remove-${group.id}-${member.userId}` ? "Removing..." : "Remove"}
                    </ActionButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </ManagementCard>
  );
}
