"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminPlayerHealthAction,
  removeManagerAccessAction,
  resetUserAccess,
  updateUserDisplayNameAction,
  upsertManagerLimitsAction
} from "@/app/admin/actions";
import type { AdminPlayerHealthRow } from "@/lib/admin-player-health";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { AdminInvitesSection, formatDate } from "@/components/admin/AdminInvitesClient";
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

const FILTERS = [
  { value: "all", label: "All players" },
  { value: "manager", label: "Managers" },
  { value: "attention", label: "Needs attention" },
  { value: "pending", label: "Pending signup or confirmation" }
] as const;

export function AdminPlayersClient() {
  const [players, setPlayers] = useState<AdminPlayerHealthRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sendingResetForUserId, setSendingResetForUserId] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [managerEditor, setManagerEditor] = useState<{
    userId: string;
    displayName: string;
    maxGroups: string;
    maxMembersPerGroup: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    key: string;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    loadPlayers().finally(() => setIsLoading(false));
  }, []);

  async function loadPlayers() {
    const result = await fetchAdminPlayerHealthAction();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setPlayers(result.players);
  }

  const filteredPlayers = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    return players.filter((player) => {
      const matchesSearch =
        !query ||
        player.displayName.toLowerCase().includes(query) ||
        player.email.toLowerCase().includes(query);

      if (!matchesSearch) {
        return false;
      }

      if (filterValue === "manager") {
        return player.roleLabel === "admin" || player.isManager;
      }

      if (filterValue === "attention") {
        return player.healthBadge === "mismatch" || player.healthBadge === "needs_attention";
      }

      if (filterValue === "pending") {
        return ["pending_signup", "pending_confirmation", "pending_first_login"].includes(player.healthBadge);
      }

      return true;
    });
  }, [filterValue, players, searchValue]);

  async function refreshPlayers() {
    setMessage(null);
    setIsLoading(true);
    await loadPlayers();
    setIsLoading(false);
  }

  async function handleResetUserAccess(player: AdminPlayerHealthRow) {
    if (!player.appUserId) {
      setMessage({ tone: "error", text: "This row does not have an app user profile to reset yet." });
      return;
    }

    setSendingResetForUserId(player.appUserId);
    setMessage(null);

    try {
      const result = await resetUserAccess({ userId: player.appUserId, email: player.email });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        await loadPlayers();
      }
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setSendingResetForUserId(null);
    }
  }

  async function withAction(actionKey: string, task: () => Promise<void>) {
    setActiveActionKey(actionKey);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setActiveActionKey(null);
    }
  }

  return (
    <div className="space-y-5">
      <ManagementIntro
        eyebrow="Players"
        title="Manage players and managers."
        description="See and manage all your players here"
      />
      <HierarchyPanel />
      <AdminInvitesSection showHeader={false} showInviteList={false} />
      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

      {managerEditor ? (
        <ManagementCard
          title={`Manager access for ${managerEditor.displayName}`}
          subtitle="Set the limits that will apply to this manager."
          actions={
            <>
              <ActionButton
                onClick={() => {
                  void withAction(`manager-${managerEditor.userId}`, async () => {
                    const result = await upsertManagerLimitsAction({
                      userId: managerEditor.userId,
                      maxGroups: Number(managerEditor.maxGroups),
                      maxMembersPerGroup: Number(managerEditor.maxMembersPerGroup)
                    });
                    setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                    if (result.ok) {
                      setManagerEditor(null);
                      await loadPlayers();
                    }
                  });
                }}
                disabled={activeActionKey === `manager-${managerEditor.userId}`}
                tone="accent"
              >
                {activeActionKey === `manager-${managerEditor.userId}` ? "Saving..." : "Save Manager Limits"}
              </ActionButton>
              <ActionButton onClick={() => setManagerEditor(null)} disabled={activeActionKey === `manager-${managerEditor.userId}`}>
                Cancel
              </ActionButton>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Max groups</span>
              <input
                type="number"
                min={1}
                value={managerEditor.maxGroups}
                onChange={(event) =>
                  setManagerEditor((current) => current ? { ...current, maxGroups: event.target.value } : current)
                }
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Max members per group</span>
              <input
                type="number"
                min={1}
                value={managerEditor.maxMembersPerGroup}
                onChange={(event) =>
                  setManagerEditor((current) => current ? { ...current, maxMembersPerGroup: event.target.value } : current)
                }
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
            </label>
          </div>
        </ManagementCard>
      ) : null}

      {confirmation ? (
        <InlineConfirmation
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.confirmLabel}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(null)}
          isPending={activeActionKey === confirmation.key}
        />
      ) : null}

      <ManagementToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filterValue={filterValue}
        onFilterChange={(value) => setFilterValue(value as (typeof FILTERS)[number]["value"])}
        filters={FILTERS.map((filter) => ({ ...filter }))}
        trailing={
          !isLoading ? (
            <ActionButton onClick={() => void refreshPlayers()}>Refresh Auth Status</ActionButton>
          ) : null
        }
      />

      <section className="space-y-3">
        <div>
          <h3 className="text-xl font-black">Player management</h3>
          <p className="mt-1 text-sm font-semibold text-gray-600">
            Same management system, with super-admin controls layered on top.
          </p>
        </div>

        {isLoading ? <ManagementEmptyState message="Loading players..." /> : null}
        {!isLoading && filteredPlayers.length === 0 ? (
          <ManagementEmptyState message="No players match the current search or filter." />
        ) : null}

        {!isLoading
          ? filteredPlayers.map((player) => (
              <ManagementCard
                key={player.key}
                title={player.displayName}
                subtitle={player.email}
                badges={
                  <>
                    <ManagementBadge label={player.roleLabel === "admin" ? "super admin" : "player"} tone={player.roleLabel === "admin" ? "accent" : "neutral"} />
                    <ManagementBadge
                      label={
                        player.roleLabel === "admin"
                          ? "manager access via super admin"
                          : player.isManager
                            ? "manager"
                            : "participant"
                      }
                      tone={player.roleLabel === "admin" || player.isManager ? "accent" : "neutral"}
                    />
                    <ManagementBadge label={formatStateLabel(player.healthBadge)} tone={getHealthTone(player.healthBadge)} />
                  </>
                }
                actions={
                  <>
                    {player.appUserId ? (
                      <ActionButton
                        onClick={() => {
                          const currentName = player.displayName;
                          const nextName = window.prompt(`Update display name for ${currentName}`, currentName);
                          if (!nextName || nextName.trim() === currentName) {
                            return;
                          }

                          void withAction(`rename-${player.appUserId}`, async () => {
                            const result = await updateUserDisplayNameAction(player.appUserId!, nextName);
                            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                            if (result.ok) {
                              await loadPlayers();
                            }
                          });
                        }}
                        disabled={activeActionKey === `rename-${player.appUserId}`}
                      >
                        {activeActionKey === `rename-${player.appUserId}` ? "Saving..." : "Edit Display Name"}
                      </ActionButton>
                    ) : null}
                    {player.appUserId ? (
                      <ActionButton
                        onClick={() => handleManagerAccess(player)}
                        disabled={activeActionKey === `manager-${player.appUserId}`}
                      >
                        {player.roleLabel === "admin"
                          ? "Super Admin"
                          : activeActionKey === `manager-${player.appUserId}`
                            ? "Saving..."
                            : player.isManager
                              ? "Edit Manager Limits"
                              : "Make Manager"}
                      </ActionButton>
                    ) : null}
                    {player.appUserId && player.isManager && player.roleLabel !== "admin" ? (
                      <ActionButton
                        tone="danger"
                        onClick={() => {
                          setConfirmation({
                            key: `remove-manager-${player.appUserId}`,
                            title: `Remove manager access for ${player.displayName}?`,
                            description: "Their groups, players, account, and predictions will stay intact. This only removes their manager entitlement.",
                            confirmLabel: "Remove Manager Access",
                            onConfirm: () => {
                              void withAction(`remove-manager-${player.appUserId}`, async () => {
                                const result = await removeManagerAccessAction(player.appUserId!);
                                setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                                if (result.ok) {
                                  setConfirmation(null);
                                  await loadPlayers();
                                }
                              });
                            }
                          });
                        }}
                        disabled={activeActionKey === `remove-manager-${player.appUserId}`}
                      >
                        {activeActionKey === `remove-manager-${player.appUserId}` ? "Removing..." : "Remove Manager Access"}
                      </ActionButton>
                    ) : null}
                    <ActionButton
                      onClick={() => void handleResetUserAccess(player)}
                      disabled={sendingResetForUserId === player.appUserId || !player.appUserId}
                    >
                      {sendingResetForUserId === player.appUserId ? "Resetting..." : "Reset User Access"}
                    </ActionButton>
                  </>
                }
              >
                <ManagementGrid>
                  <ManagementDatum label="App" value={`${formatStateLabel(player.appState)}${player.userStatus ? ` (${player.userStatus})` : ""}`} />
                  <ManagementDatum label="Auth" value={formatStateLabel(player.authState)} />
                  <ManagementDatum label="Invite" value={formatStateLabel(player.inviteState)} />
                  <ManagementDatum
                    label="Manager status"
                    value={
                      player.roleLabel === "admin"
                        ? "Super Admin · Unlimited"
                        : player.isManager
                          ? `Manager · ${player.currentGroupsUsed} / ${player.maxGroups ?? 0} groups · ${player.currentMembersUsed} / ${player.maxMembersPerGroup ?? 0} members`
                          : "Player · Participant"
                    }
                  />
                  <ManagementDatum label="Limits" value={formatLimitSummary(player)} />
                  <ManagementDatum label="Points" value={player.totalPoints} />
                  <ManagementDatum label="Created" value={player.createdAt ? formatDate(player.createdAt) : "—"} />
                  <ManagementDatum label="Last sign in" value={player.lastSignInAt ? formatDate(player.lastSignInAt) : "Never"} />
                  <ManagementDatum label="Email confirmed" value={player.emailConfirmedAt ? formatDate(player.emailConfirmedAt) : "Not yet"} />
                  <ManagementDatum label="Invite accepted" value={player.acceptedAt ? formatDate(player.acceptedAt) : "No"} />
                  <ManagementDatum label="Send attempts" value={player.inviteSendAttempts} />
                  <ManagementDatum label="Last invite send" value={player.inviteLastSentAt ? formatDate(player.inviteLastSentAt) : "Not sent"} />
                  <ManagementDatum
                    label="Ids"
                    fullWidth
                    value={
                      <div className="space-y-1 text-xs font-semibold text-gray-700">
                        <p>App: {player.appUserId ? truncateId(player.appUserId) : "—"}</p>
                        <p>Auth: {player.authUserId ? truncateId(player.authUserId) : "—"}</p>
                      </div>
                    }
                  />
                  <ManagementDatum
                    label="Notes"
                    fullWidth
                    value={
                      <div className="space-y-1 text-sm font-semibold text-gray-900">
                        {player.troubleshootingNotes.length > 0 ? (
                          player.troubleshootingNotes.map((note) => <p key={note}>{note}</p>)
                        ) : (
                          <p>No obvious auth or invite mismatch detected.</p>
                        )}
                        {player.inviteLastError ? <p>{player.inviteLastError}</p> : null}
                      </div>
                    }
                  />
                </ManagementGrid>
              </ManagementCard>
            ))
          : null}
      </section>
    </div>
  );

  async function handleManagerAccess(player: AdminPlayerHealthRow) {
    if (!player.appUserId || player.roleLabel === "admin") {
      return;
    }

    setManagerEditor({
      userId: player.appUserId,
      displayName: player.displayName,
      maxGroups: String(player.maxGroups ?? 1),
      maxMembersPerGroup: String(player.maxMembersPerGroup ?? 15)
    });
  }
}

function getHealthTone(status: AdminPlayerHealthRow["healthBadge"]) {
  if (status === "healthy") {
    return "success";
  }

  if (status === "mismatch" || status === "needs_attention") {
    return "danger";
  }

  return "warning";
}

function formatStateLabel(value: string) {
  return value.replace(/_/g, " ");
}

function truncateId(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function formatLimitSummary(player: AdminPlayerHealthRow) {
  if (player.roleLabel === "admin") {
    return "Unlimited access";
  }

  if (!player.isManager) {
    return "Not a manager";
  }

  const withinGroups = player.maxGroups ? player.currentGroupsUsed <= player.maxGroups : true;
  const withinMembers = player.maxMembersPerGroup ? player.currentMembersUsed <= player.maxMembersPerGroup : true;

  return `${withinGroups && withinMembers ? "Within limit" : "At or over limit"} · ${player.currentGroupsUsed} / ${player.maxGroups ?? 0} groups · ${player.currentMembersUsed} / ${player.maxMembersPerGroup ?? 0} members`;
}
