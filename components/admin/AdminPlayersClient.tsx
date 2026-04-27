"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteUserAndStartOverAction,
  fetchAdminPlayerHealthAction,
  fetchLeaderboardFeatureSettingsAction,
  fetchRequiredLegalDocumentAction,
  forceLegalReacceptanceAction,
  repairPendingInviteAction,
  resetTestingSocialStateAction,
  resendConfirmationOrOnboardingNudgeAction,
  removeManagerAccessAction,
  resetOnboardingStateAction,
  resetUserAccess,
  updateLeaderboardFeatureSettingAction,
  updateUserDisplayNameAction,
  upsertManagerLimitsAction
} from "@/app/admin/actions";
import type { AdminPlayerHealthRow } from "@/lib/admin-player-health";
import type { LeaderboardFeatureSettingKey, LeaderboardFeatureSettings } from "@/lib/app-settings";
import type { LegalDocument } from "@/lib/legal";
import type { SystemReadinessReport } from "@/lib/system-readiness";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { AdminGroupsSection } from "@/components/admin/AdminGroupsClient";
import { AdminInvitesSection, formatDate } from "@/components/admin/AdminInvitesClient";
import { Avatar } from "@/components/Avatar";
import {
  ActionButton,
  HierarchyPanel,
  InlineConfirmation,
  InlineTextConfirmation,
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
  const [leaderboardSettings, setLeaderboardSettings] = useState<LeaderboardFeatureSettings | null>(null);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const [systemReadiness, setSystemReadiness] = useState<SystemReadinessReport | null>(null);
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
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    key: string;
    email: string;
    displayName: string;
  } | null>(null);
  const [deleteConfirmationValue, setDeleteConfirmationValue] = useState("");
  const [legalEditor, setLegalEditor] = useState({
    documentType: "eula",
    requiredVersion: "2026-04-26-v1",
    title: "PICK-IT! Terms of Use",
    body: ""
  });

  useEffect(() => {
    Promise.all([loadPlayers(), loadLeaderboardSettings(), loadLegalDocument(), loadSystemReadiness()]).finally(() =>
      setIsLoading(false)
    );
  }, []);

  async function loadPlayers() {
    const result = await fetchAdminPlayerHealthAction();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setPlayers(result.players);
  }

  async function loadLeaderboardSettings() {
    const result = await fetchLeaderboardFeatureSettingsAction();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setLeaderboardSettings(result.settings);
  }

  async function loadLegalDocument() {
    const result = await fetchRequiredLegalDocumentAction();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setLegalDocument(result.document);
    if (result.document) {
      setLegalEditor({
        documentType: result.document.documentType,
        requiredVersion: result.document.requiredVersion,
        title: result.document.title,
        body: result.document.body
      });
    }
  }

  async function loadSystemReadiness() {
    const response = await fetch("/api/admin/system-readiness", { cache: "no-store" });
    const result = (await response.json()) as
      | { ok: true; report: SystemReadinessReport }
      | { ok: false; message?: string };

    if (!response.ok || !result.ok) {
      setMessage({
        tone: "error",
        text: result.ok ? "Could not load the system readiness report." : result.message ?? "Could not load the system readiness report."
      });
      return;
    }

    setSystemReadiness(result.report);
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
        return (
          ["pending_signup", "pending_confirmation", "pending_first_login"].includes(player.healthBadge) ||
          player.inviteState === "invite_not_sent" ||
          player.onboardingIncomplete
        );
      }

      return true;
    });
  }, [filterValue, players, searchValue]);

  async function refreshPlayers() {
    setMessage(null);
    setIsLoading(true);
    await Promise.all([loadPlayers(), loadLeaderboardSettings(), loadLegalDocument(), loadSystemReadiness()]);
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
      <ManagementCard
        title="System readiness"
        subtitle="Read-only diagnostic checks for schema, storage, and feature readiness."
      >
        <div className="space-y-4">
          {systemReadiness ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Checked {formatDate(systemReadiness.checkedAt)}
              </p>

              <ReadinessGroup
                title="Missing schema"
                emptyCopy="No missing tables or columns detected."
                items={systemReadiness.missingSchema.map((issue) => ({
                  key: issue.key,
                  label: issue.label,
                  detail: issue.detail
                }))}
              />

              <ReadinessGroup
                title="Storage / config issues"
                emptyCopy="No storage or config issues detected."
                items={systemReadiness.storageConfigIssues.map((issue) => ({
                  key: issue.key,
                  label: issue.label,
                  detail: issue.detail
                }))}
              />

              <div className="space-y-2">
                <p className="text-sm font-black text-gray-900">Feature readiness</p>
                <div className="space-y-2">
                  {systemReadiness.featureReadiness.map((item) => (
                    <div key={item.key} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-gray-950">{item.label}</p>
                          <p className="mt-1 text-sm font-semibold text-gray-600">{item.detail}</p>
                        </div>
                        <ManagementBadge
                          label={item.status}
                          tone={item.status === "ready" ? "accent" : item.status === "degraded" ? "warning" : "neutral"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold text-gray-600">Loading diagnostics...</p>
          )}
        </div>
      </ManagementCard>
      <ManagementCard
        title="Legal / Terms"
        subtitle="Update the required EULA version and require everyone to accept it before using the app again."
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold text-gray-600">
            This will require all users to accept the new terms before using the app again. Active sessions will be
            revoked where supported.
          </p>
          <ManagementGrid>
            <ManagementDatum label="Current version" value={legalDocument?.requiredVersion ?? "Not configured"} />
            <ManagementDatum label="Last updated" value={legalDocument?.updatedAt ? formatDate(legalDocument.updatedAt) : "—"} />
          </ManagementGrid>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Document type</span>
            <input
              value={legalEditor.documentType}
              onChange={(event) => setLegalEditor((current) => ({ ...current, documentType: event.target.value }))}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Required version</span>
            <input
              value={legalEditor.requiredVersion}
              onChange={(event) => setLegalEditor((current) => ({ ...current, requiredVersion: event.target.value }))}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Title</span>
            <input
              value={legalEditor.title}
              onChange={(event) => setLegalEditor((current) => ({ ...current, title: event.target.value }))}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Body</span>
            <textarea
              value={legalEditor.body}
              onChange={(event) => setLegalEditor((current) => ({ ...current, body: event.target.value }))}
              rows={10}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
          </label>
          <ActionButton
            tone="accent"
            disabled={activeActionKey === "force-legal-reacceptance"}
            onClick={() => {
              void withAction("force-legal-reacceptance", async () => {
                const result = await forceLegalReacceptanceAction(
                  legalEditor.documentType,
                  legalEditor.requiredVersion,
                  legalEditor.title,
                  legalEditor.body
                );
                setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                if (result.ok) {
                  await loadLegalDocument();
                }
              });
            }}
          >
            {activeActionKey === "force-legal-reacceptance" ? "Updating..." : "Require everyone to accept this version"}
          </ActionButton>
        </div>
      </ManagementCard>
      <ManagementCard
        title="Leaderboard highlights"
        subtitle="Super-admin controls for tournament-time spotlight features."
      >
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-600">
            These switches control what appears on the live leaderboard. All features stay off until you turn them on.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <LeaderboardSettingToggle
              label="Daily Winner"
              description="Show the top scorer or tied scorers for the current day."
              settingKey="daily_winner_enabled"
              settings={leaderboardSettings}
              activeActionKey={activeActionKey}
              onToggle={(enabled) => {
                void withAction(`leaderboard-setting-daily_winner_enabled`, async () => {
                  const result = await updateLeaderboardFeatureSettingAction("daily_winner_enabled", enabled);
                  setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                  if (result.ok) {
                    await loadLeaderboardSettings();
                  }
                });
              }}
            />
            <LeaderboardSettingToggle
              label="Perfect Pick"
              description="Show the exact-score badge for qualifying leaderboard rows."
              settingKey="perfect_pick_enabled"
              settings={leaderboardSettings}
              activeActionKey={activeActionKey}
              onToggle={(enabled) => {
                void withAction(`leaderboard-setting-perfect_pick_enabled`, async () => {
                  const result = await updateLeaderboardFeatureSettingAction("perfect_pick_enabled", enabled);
                  setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                  if (result.ok) {
                    await loadLeaderboardSettings();
                  }
                });
              }}
            />
            <LeaderboardSettingToggle
              label="Leaderboard Activity"
              description="Show rank movement arrows and point-change context."
              settingKey="leaderboard_activity_enabled"
              settings={leaderboardSettings}
              activeActionKey={activeActionKey}
              onToggle={(enabled) => {
                void withAction(`leaderboard-setting-leaderboard_activity_enabled`, async () => {
                  const result = await updateLeaderboardFeatureSettingAction("leaderboard_activity_enabled", enabled);
                  setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                  if (result.ok) {
                    await loadLeaderboardSettings();
                  }
                });
              }}
            />
          </div>
        </div>
      </ManagementCard>
      <ManagementCard
        title="Testing reset"
        subtitle="Clear social/testing artifacts, notifications, and leaderboard movement history without touching scoring or predictions."
      >
        <div className="space-y-4">
          <p className="text-sm font-semibold text-gray-600">
            This clears leaderboard comments, reactions, congratulates, notifications, leaderboard events, manually
            awarded trophies, and leaderboard snapshot history created during testing. Match scores, predictions, and
            leaderboard totals stay untouched.
          </p>
          <ActionButton
            tone="danger"
            disabled={activeActionKey === "reset-testing-social-state"}
            onClick={() =>
              setConfirmation({
                key: "reset-testing-social-state",
                title: "Reset testing social data?",
                description:
                  "This will remove comments, reactions, congratulates, notifications, leaderboard events, manually awarded trophies, and leaderboard movement history across the app. Scoring and predictions will not change.",
                confirmLabel: "Clear Testing Social + Movement Data",
                onConfirm: () => {
                  void withAction("reset-testing-social-state", async () => {
                    const result = await resetTestingSocialStateAction();
                    setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                    if (result.ok) {
                      setConfirmation(null);
                    }
                  });
                }
              })
            }
          >
            {activeActionKey === "reset-testing-social-state" ? "Clearing..." : "Clear Testing Social + Movement Data"}
          </ActionButton>
        </div>
      </ManagementCard>
      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

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

      {deleteConfirmation ? (
        <InlineTextConfirmation
          title={`Delete ${deleteConfirmation.displayName} and start over?`}
          description="This removes invite state, email jobs, group memberships, the app profile, and the auth user only when the account has no gameplay data. Predictions, scores, and leaderboard data are never deleted by this action."
          confirmLabel="Delete and Start Over"
          expectedValue="DELETE"
          inputLabel="Type DELETE to confirm"
          inputPlaceholder="DELETE"
          value={deleteConfirmationValue}
          onValueChange={setDeleteConfirmationValue}
          onConfirm={() => {
            void withAction(deleteConfirmation.key, async () => {
              const result = await deleteUserAndStartOverAction(deleteConfirmation.email, deleteConfirmationValue);
              setMessage({ tone: result.ok ? "success" : "error", text: result.message });
              if (result.ok) {
                setDeleteConfirmation(null);
                setDeleteConfirmationValue("");
                await loadPlayers();
              }
            });
          }}
          onCancel={() => {
            setDeleteConfirmation(null);
            setDeleteConfirmationValue("");
          }}
          isPending={activeActionKey === deleteConfirmation.key}
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
          ? filteredPlayers.map((player) => {
              const activeManagerEditor = managerEditor?.userId === player.appUserId ? managerEditor : null;

              return (
              <ManagementCard
                key={player.key}
                title={
                  <div className="flex items-center gap-3">
                    <Avatar name={player.displayName} avatarUrl={player.avatarUrl} size="md" />
                    <p className="truncate text-base font-black text-gray-950">{player.displayName}</p>
                  </div>
                }
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
                      {sendingResetForUserId === player.appUserId ? "Sending..." : "Send Password Reset"}
                    </ActionButton>
                    {player.authUserId ? (
                      <ActionButton
                        onClick={() => {
                          void withAction(`nudge-${player.email}`, async () => {
                            const result = await resendConfirmationOrOnboardingNudgeAction(player.email);
                            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                            if (result.ok) {
                              await loadPlayers();
                            }
                          });
                        }}
                        disabled={activeActionKey === `nudge-${player.email}`}
                      >
                        {activeActionKey === `nudge-${player.email}`
                          ? "Sending..."
                          : player.emailConfirmedAt
                            ? "Send Onboarding Reminder"
                            : "Resend Confirmation"}
                      </ActionButton>
                    ) : null}
                    {player.appUserId ? (
                      <ActionButton
                        onClick={() => {
                          void withAction(`reset-onboarding-${player.appUserId}`, async () => {
                            const result = await resetOnboardingStateAction(player.appUserId!);
                            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                            if (result.ok) {
                              await loadPlayers();
                            }
                          });
                        }}
                        disabled={activeActionKey === `reset-onboarding-${player.appUserId}`}
                      >
                        {activeActionKey === `reset-onboarding-${player.appUserId}` ? "Resetting..." : "Reset Profile Setup"}
                      </ActionButton>
                    ) : null}
                    {canRepairInvite(player) ? (
                      <ActionButton
                        onClick={() => {
                          void withAction(`repair-invite-${player.email}`, async () => {
                            const result = await repairPendingInviteAction(player.email);
                            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                            if (result.ok) {
                              await loadPlayers();
                            }
                          });
                        }}
                        disabled={activeActionKey === `repair-invite-${player.email}`}
                      >
                        {activeActionKey === `repair-invite-${player.email}`
                          ? "Repairing..."
                          : player.inviteDeliveryState === "not_sent"
                            ? "Repair Invite"
                            : "Resend Invite"}
                      </ActionButton>
                    ) : null}
                    <ActionButton
                      tone="danger"
                      onClick={() => {
                        setDeleteConfirmation({
                          key: `delete-start-over-${player.email}`,
                          email: player.email,
                          displayName: player.displayName
                        });
                        setDeleteConfirmationValue("");
                      }}
                      disabled={activeActionKey === `delete-start-over-${player.email}`}
                    >
                      {activeActionKey === `delete-start-over-${player.email}` ? "Deleting..." : "Delete and Start Over"}
                    </ActionButton>
                  </>
                }
              >
                <ManagementGrid>
                  <ManagementDatum label="Auth confirmed?" value={player.emailConfirmedAt ? "Yes" : "No"} />
                  <ManagementDatum label="Profile exists?" value={player.hasProfile ? "Yes" : "No"} />
                  <ManagementDatum label="Username set?" value={player.usernameSet ? "Yes" : "No"} />
                  <ManagementDatum label="App" value={`${formatStateLabel(player.appState)}${player.userStatus ? ` (${player.userStatus})` : ""}`} />
                  <ManagementDatum label="Auth" value={formatStateLabel(player.authState)} />
                  <ManagementDatum label="App invite status" value={formatStateLabel(player.inviteState)} />
                  <ManagementDatum label="Group invite status" value={player.groupInviteStatus} />
                  <ManagementDatum label="Delivery" value={formatDeliveryState(player)} />
                  <ManagementDatum label="Onboarding" value={player.onboardingIncomplete ? "Incomplete" : player.appUserId ? "Complete" : "Waiting for auth"} />
                  <ManagementDatum label="Group memberships" value={player.groupMembershipCount} />
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
                  <ManagementDatum label="Last confirmation sent" value={player.confirmationSentAt ? formatDate(player.confirmationSentAt) : "Not sent"} />
                  <ManagementDatum label="Username" value={player.username ?? "Not set"} />
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
                {activeManagerEditor ? (
                  <div className="mt-4 rounded-lg border border-accent-light bg-accent-light/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-gray-950">Manager access for {activeManagerEditor.displayName}</p>
                        <p className="mt-1 text-sm font-semibold text-gray-700">
                          Update the limits below, then save to promote or edit this manager.
                        </p>
                      </div>
                      <ManagementBadge label="editing manager access" tone="accent" />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-bold text-gray-800">Max groups</span>
                        <input
                          type="number"
                          min={1}
                          value={activeManagerEditor.maxGroups}
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
                          value={activeManagerEditor.maxMembersPerGroup}
                          onChange={(event) =>
                            setManagerEditor((current) => current ? { ...current, maxMembersPerGroup: event.target.value } : current)
                          }
                          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton
                        onClick={() => {
                          void withAction(`manager-${activeManagerEditor.userId}`, async () => {
                            const result = await upsertManagerLimitsAction({
                              userId: activeManagerEditor.userId,
                              maxGroups: Number(activeManagerEditor.maxGroups),
                              maxMembersPerGroup: Number(activeManagerEditor.maxMembersPerGroup)
                            });
                            setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                            if (result.ok) {
                              setManagerEditor(null);
                              await loadPlayers();
                            }
                          });
                        }}
                        disabled={activeActionKey === `manager-${activeManagerEditor.userId}`}
                        tone="accent"
                      >
                        {activeActionKey === `manager-${activeManagerEditor.userId}` ? "Saving..." : "Save Manager Limits"}
                      </ActionButton>
                      <ActionButton onClick={() => setManagerEditor(null)} disabled={activeActionKey === `manager-${activeManagerEditor.userId}`}>
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                ) : null}
              </ManagementCard>
            );
            })
          : null}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-xl font-black">Group management</h3>
          <p className="mt-1 text-sm font-semibold text-gray-600">
            Add existing players to groups, adjust group limits, and repair ownership without leaving this admin surface.
          </p>
        </div>
        <AdminGroupsSection showIntro={false} showPlayerManagementLink={false} />
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
      maxGroups: String(player.maxGroups ?? 3),
      maxMembersPerGroup: String(player.maxMembersPerGroup ?? 4)
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

function canRepairInvite(player: AdminPlayerHealthRow) {
  return (
    !player.authUserId &&
    (player.inviteState === "invited_pending" ||
      player.inviteState === "invite_not_sent" ||
      player.inviteState === "invite_failed" ||
      player.inviteState === "resend_needed")
  );
}

function formatDeliveryState(player: AdminPlayerHealthRow) {
  switch (player.inviteDeliveryState) {
    case "not_sent":
      return "Invite not sent";
    case "queued":
      return "Invite email queued";
    case "sent":
      return "Invite email sent";
    case "failed":
      return "Invite delivery failed";
    default:
      return player.inviteState === "not_invited" ? "No invite" : "Awaiting update";
  }
}

function ReadinessGroup({
  title,
  emptyCopy,
  items
}: {
  title: string;
  emptyCopy: string;
  items: Array<{ key: string; label: string; detail: string }>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-gray-900">{title}</p>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.key} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
              <p className="text-sm font-black text-gray-950">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-gray-600">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-600">
          {emptyCopy}
        </p>
      )}
    </div>
  );
}

function LeaderboardSettingToggle({
  label,
  description,
  settingKey,
  settings,
  activeActionKey,
  onToggle
}: {
  label: string;
  description: string;
  settingKey: LeaderboardFeatureSettingKey;
  settings: LeaderboardFeatureSettings | null;
  activeActionKey: string | null;
  onToggle: (enabled: boolean) => void;
}) {
  const value = settings?.[settingKey] ?? false;
  const isPending = activeActionKey === `leaderboard-setting-${settingKey}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-gray-950">{label}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!value)}
          disabled={isPending}
          className={`rounded-md px-3 py-2 text-sm font-bold ${
            value ? "bg-accent text-white" : "bg-gray-100 text-gray-700"
          } disabled:opacity-60`}
        >
          {isPending ? "Saving..." : value ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}
