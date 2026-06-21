"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  deactivateOrganizerAccessAction,
  demoteUserWithImpactResolutionAction,
  deleteUserAndStartOverAction,
  fetchAdminPlayerHealthAction,
  fetchLeaderboardFeatureSettingsAction,
  fetchProjectedLeaderboardAuditAction,
  fetchPublicSignupSettingAction,
  getUserDemotionImpactAction,
  fetchRequiredLegalDocumentAction,
  forceLegalReacceptanceAction,
  repairPendingInviteAction,
  resendConfirmationOrOnboardingNudgeAction,
  resetOnboardingStateAction,
  resetUserAccess,
  updateLeaderboardFeatureSettingAction,
  updatePublicSignupSettingAction,
  updateUserCommercialTierAction,
  updateUserDisplayNameAction,
  upsertManagerLimitsAction,
  type DemotionCleanupOption,
  type DemotionImpactSummary
} from "@/app/admin/actions";
import type { AdminPlayerHealthRow } from "@/lib/admin-player-health";
import type { LeaderboardFeatureSettingKey, LeaderboardFeatureSettings } from "@/lib/app-settings";
import { getRoleBadgeLabel } from "@/lib/access-levels";
import { parseJsonResponse } from "@/lib/fetch-json";
import type { LegalDocument } from "@/lib/legal";
import type { SystemReadinessReport } from "@/lib/system-readiness";
import { showAppToast } from "@/lib/app-toast";
import { ADMIN_ASSIGNABLE_ACCESS_LEVELS, compareAccessLevels, getAccessLevelDisplayLabel, type AccessLevel } from "@/lib/tier-access";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { AdminGroupsSection } from "@/components/admin/AdminGroupsClient";
import { AdminInvitesSection, formatDate } from "@/components/admin/AdminInvitesClient";
import { AdminTournamentTransitionManager } from "@/components/admin/AdminTournamentTransitionManager";
import { AdminUpdatesManager } from "@/components/admin/AdminUpdatesManager";
import { Avatar } from "@/components/Avatar";
import { TierIconBadge } from "@/components/TierIconBadge";
import {
  ActionButton,
  HierarchyPanel,
  InlineConfirmation,
  InlineDisclosureButton,
  InlineTextConfirmation,
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

const FILTERS = [
  { value: "all", label: "All players" },
  { value: "manager", label: "Organizers" },
  { value: "attention", label: "Needs attention" },
  { value: "pending", label: "Pending signup or confirmation" }
] as const;

const SIGNUP_DATE_FILTERS = [
  { value: "any", label: "Any signup date" },
  { value: "on", label: "Signed up on" },
  { value: "since", label: "Signed up since" },
  { value: "before", label: "Signed up before" }
] as const;

type SignupDateFilterMode = (typeof SIGNUP_DATE_FILTERS)[number]["value"];

type AdminManagementTab = "setup" | "users" | "groups";

type ProjectedAuditRow = {
  userId: string;
  name: string;
  email: string;
  rank: number;
  rawProjectedPoints: number;
  projectedPoints: number;
  displayRoundDelta: number;
  thirdPlaceQualificationPoints: number;
  topTwoBonus: number;
  fullLadderBonus: number;
  hasSnapshot: boolean;
};

type ProjectedAuditBreakdown = {
  totalProjectedPoints: number;
  winnerPoints: number;
  runnerUpPoints: number;
  thirdPoints: number;
  topTwoBonus: number;
  thirdPlaceQualificationPoints: number;
  fullLadderBonus: number;
  groups: Array<{
    groupName: string;
    totalProjectedPoints: number;
    winnerPoints: number;
    runnerUpPoints: number;
    thirdPoints: number;
    topTwoBonus: number;
    thirdPlaceQualificationPoints: number;
    thirdQualificationProbability: number;
    fullLadderBonus: number;
    predictedThirdTeamId: string | null;
  }>;
};

export function AdminPlayersClient() {
  const [players, setPlayers] = useState<AdminPlayerHealthRow[]>([]);
  const [leaderboardSettings, setLeaderboardSettings] = useState<LeaderboardFeatureSettings | null>(null);
  const [publicSignupEnabled, setPublicSignupEnabled] = useState<boolean | null>(null);
  const [projectedAudit, setProjectedAudit] = useState<{
    projectionKey: string | null;
    generatedAt: string;
    topRows: ProjectedAuditRow[];
    selectedRow: ProjectedAuditRow | null;
    selectedBreakdown: ProjectedAuditBreakdown | null;
  } | null>(null);
  const [selectedProjectedAuditUserId, setSelectedProjectedAuditUserId] = useState("");
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const [systemReadiness, setSystemReadiness] = useState<SystemReadinessReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sendingResetForUserId, setSendingResetForUserId] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [signupDateFilterMode, setSignupDateFilterMode] = useState<SignupDateFilterMode>("any");
  const [signupDateFilterValue, setSignupDateFilterValue] = useState("");
  const [activeTab, setActiveTab] = useState<AdminManagementTab>("users");
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
    language: "en",
    requiredVersion: "2026-04-26-v2-en",
    title: "PICK-IT! Terms of Use",
    body: ""
  });

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

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

  async function loadPublicSignupSetting() {
    const result = await fetchPublicSignupSettingAction();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setPublicSignupEnabled(result.enabled);
  }

  const loadProjectedAudit = useCallback(async (selectedUserId?: string) => {
    const result = await fetchProjectedLeaderboardAuditAction({
      selectedUserId: (selectedUserId ?? "").trim() || null,
      limit: 10
    });
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setProjectedAudit({
      projectionKey: result.projectionKey,
      generatedAt: result.generatedAt,
      topRows: result.topRows as ProjectedAuditRow[],
      selectedRow: result.selectedRow as ProjectedAuditRow | null,
      selectedBreakdown: result.selectedBreakdown as ProjectedAuditBreakdown | null
    });
  }, []);

  const loadLegalDocument = useCallback(async (language = legalEditor.language) => {
    const result = await fetchRequiredLegalDocumentAction(legalEditor.documentType, language);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setLegalDocument(result.document);
    if (result.document) {
      setLegalEditor({
        documentType: result.document.documentType,
        language: result.document.language,
        requiredVersion: result.document.requiredVersion,
        title: result.document.title,
        body: result.document.body
      });
    }
  }, [legalEditor.documentType, legalEditor.language]);

  async function loadSystemReadiness() {
    const response = await fetch("/api/admin/system-readiness", { cache: "no-store" });
    const result = await parseJsonResponse<
      | { ok: true; report: SystemReadinessReport }
      | { ok: false; message?: string }
    >(response, "Could not load the system readiness report.", "system readiness");

    if (!response.ok || !result.ok) {
      setMessage({
        tone: "error",
        text: result.ok ? "Could not load the system readiness report." : result.message ?? "Could not load the system readiness report."
      });
      return;
    }

    setSystemReadiness(result.report);
  }

  useEffect(() => {
    Promise.all([loadPlayers(), loadLeaderboardSettings(), loadProjectedAudit(), loadPublicSignupSetting(), loadLegalDocument(), loadSystemReadiness()]).finally(() =>
      setIsLoading(false)
    );
  }, [loadLegalDocument, loadProjectedAudit]);

  useEffect(() => {
    void loadLegalDocument(legalEditor.language);
  }, [legalEditor.language, loadLegalDocument]);

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

      if (!matchesSignupDateFilter(player.createdAt, signupDateFilterMode, signupDateFilterValue)) {
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
  }, [filterValue, players, searchValue, signupDateFilterMode, signupDateFilterValue]);
  const attentionPlayerCount = useMemo(
    () => players.filter((player) => player.healthBadge === "mismatch" || player.healthBadge === "needs_attention").length,
    [players]
  );
  const managerPlayerCount = useMemo(
    () => players.filter((player) => player.roleLabel === "admin" || player.isManager).length,
    [players]
  );
  const readinessIssueCount =
    (systemReadiness?.missingSchema.length ?? 0) +
    (systemReadiness?.storageConfigIssues.length ?? 0) +
    (systemReadiness?.featureReadiness.filter((item) => item.status !== "ready").length ?? 0);

  async function refreshPlayers() {
    setMessage(null);
    setIsLoading(true);
    await Promise.all([loadPlayers(), loadLeaderboardSettings(), loadProjectedAudit(selectedProjectedAuditUserId), loadPublicSignupSetting(), loadLegalDocument(), loadSystemReadiness()]);
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
      <AdminManagementTabs
        activeTab={activeTab}
        tabs={[
          { value: "setup", label: "Setup", badge: readinessIssueCount > 0 ? `${readinessIssueCount} issues` : "ready" },
          { value: "users", label: "Users", badge: `${players.length} total` },
          { value: "groups", label: "Groups", badge: "tools" }
        ]}
        onChange={setActiveTab}
      />
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
          expectedValue={deleteConfirmation.email}
          inputLabel={`Type ${deleteConfirmation.email} to confirm`}
          inputPlaceholder={deleteConfirmation.email}
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

      {activeTab === "setup" ? (
        <div className="space-y-4">
          <AdminToolCard
            title="Invite access"
            storageKey="admin-players:setup-invite-access:v1"
            badge={<ManagementBadge label={`${managerPlayerCount} organizers`} tone="warning" />}
          >
            <p className="text-sm font-semibold text-gray-600">
              Promote, invite, and repair access while keeping demotions on the guarded player cards.
            </p>
            <div className="mt-4 space-y-4">
              <HierarchyPanel />
              <AdminInvitesSection showHeader={false} showInviteList={false} />
            </div>
          </AdminToolCard>

          <AdminToolCard
            title="Dashboard updates"
            storageKey="admin-players:dashboard-updates:v1"
            badge={<ManagementBadge label="updates" tone="neutral" />}
          >
            <AdminUpdatesManager embedded />
          </AdminToolCard>

          <AdminToolCard
            title="Tournament transition"
            storageKey="admin-players:tournament-transition:v1"
            badge={<ManagementBadge label="live mode" tone="accent" />}
          >
            <AdminTournamentTransitionManager />
          </AdminToolCard>

          <AdminToolCard
            title="System readiness"
            storageKey="admin-players:system-readiness:v1"
            badge={<ManagementBadge label={readinessIssueCount > 0 ? `${readinessIssueCount} issues` : "ready"} tone={readinessIssueCount > 0 ? "warning" : "accent"} />}
          >
            <p className="text-sm font-semibold text-gray-600">
              Read-only diagnostic checks for schema, storage, and feature readiness.
            </p>
            <div className="mt-4 space-y-4">
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
          </AdminToolCard>

          <AdminToolCard
            title="Legal / Terms"
            storageKey="admin-players:legal-terms:v1"
            badge={<ManagementBadge label={legalDocument?.requiredVersion ?? "not configured"} tone={legalDocument ? "neutral" : "warning"} />}
          >
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-600">
                Users will be required to accept the current terms in their selected language before continuing. Active
                sessions will be revoked where supported.
              </p>
              <ManagementGrid>
                <ManagementDatum label="Language" value={legalDocument?.language?.toUpperCase() ?? "Not configured"} />
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
                <span className="text-sm font-bold text-gray-800">Language</span>
                <select
                  value={legalEditor.language}
                  onChange={(event) => setLegalEditor((current) => ({ ...current, language: event.target.value }))}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                </select>
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
                      legalEditor.language,
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
          </AdminToolCard>

          <AdminToolCard
            title="Public Player signup"
            storageKey="admin-players:public-player-signup:v1"
            badge={<ManagementBadge label="signup mode" tone={publicSignupEnabled ? "success" : "warning"} />}
          >
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black text-gray-950">Free Player accounts</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">
                    When enabled, verified no-code signups create Player accounts and join FIFA 2026 Predictions. Invite links,
                    Super Links, and access codes still take priority for special groups or tiers.
                  </p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                    Default tier: Player · Default group: FIFA 2026 Predictions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextEnabled = !(publicSignupEnabled ?? true);
                    void withAction("public-player-signup", async () => {
                      const result = await updatePublicSignupSettingAction(nextEnabled);
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await loadPublicSignupSetting();
                      }
                    });
                  }}
                  disabled={activeActionKey === "public-player-signup" || publicSignupEnabled === null}
                  className={`rounded-md px-3 py-2 text-sm font-bold ${
                    publicSignupEnabled ? "bg-accent text-white" : "bg-gray-100 text-gray-700"
                  } disabled:opacity-60`}
                >
                  {activeActionKey === "public-player-signup" ? "Saving..." : publicSignupEnabled ? "On" : "Off"}
                </button>
              </div>
            </div>
          </AdminToolCard>

          <AdminToolCard
            title="Leaderboard highlights"
            storageKey="admin-players:leaderboard-highlights:v1"
            badge={<ManagementBadge label="feature flags" tone="neutral" />}
          >
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-600">
                These switches control what appears on the live leaderboard. All features stay off until you turn them on.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                <LeaderboardSettingToggle
                  label="Comments"
                  description="Free-form activity comments. Keep off until report, block, and moderation controls are ready."
                  settingKey="leaderboard_comments_enabled"
                  settings={leaderboardSettings}
                  activeActionKey={activeActionKey}
                  onToggle={(enabled) => {
                    void withAction(`leaderboard-setting-leaderboard_comments_enabled`, async () => {
                      const result = await updateLeaderboardFeatureSettingAction("leaderboard_comments_enabled", enabled);
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await loadLeaderboardSettings();
                      }
                    });
                  }}
                />
                <LeaderboardSettingToggle
                  label="Projected"
                  description="Show a separate projected leaderboard during live group play without changing official totals."
                  settingKey="projected_leaderboard_enabled"
                  settings={leaderboardSettings}
                  activeActionKey={activeActionKey}
                  onToggle={(enabled) => {
                    void withAction(`leaderboard-setting-projected_leaderboard_enabled`, async () => {
                      const result = await updateLeaderboardFeatureSettingAction("projected_leaderboard_enabled", enabled);
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await loadLeaderboardSettings();
                      }
                    });
                  }}
                />
              </div>
            </div>
          </AdminToolCard>

          <AdminToolCard
            title="Projected leaderboard audit"
            storageKey="admin-players:projected-leaderboard-audit:v1"
            badge={<ManagementBadge label="fairness check" tone="warning" />}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[14rem] flex-1">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">Inspect player</span>
                  <select
                    value={selectedProjectedAuditUserId}
                    onChange={(event) => setSelectedProjectedAuditUserId(event.target.value)}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  >
                    <option value="">Top 10 only</option>
                    {players
                      .slice()
                      .sort((left, right) => left.displayName.localeCompare(right.displayName))
                      .map((player) =>
                        player.appUserId ? (
                          <option key={player.appUserId} value={player.appUserId}>
                            {player.displayName} · {player.email}
                          </option>
                        ) : null
                      )}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    void withAction("projected-leaderboard-audit", async () => {
                      await loadProjectedAudit(selectedProjectedAuditUserId);
                    });
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:opacity-60"
                  disabled={activeActionKey === "projected-leaderboard-audit"}
                >
                  {activeActionKey === "projected-leaderboard-audit" ? "Refreshing..." : "Refresh audit"}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ManagementDatum label="Projection key" value={projectedAudit?.projectionKey ?? "—"} />
                <ManagementDatum label="Generated" value={projectedAudit ? formatDate(projectedAudit.generatedAt) : "—"} />
                <ManagementDatum label="Top row" value={projectedAudit?.topRows[0] ? `${projectedAudit.topRows[0].name} #${projectedAudit.topRows[0].rank}` : "—"} />
                <ManagementDatum
                  label="Selected"
                  value={projectedAudit?.selectedRow ? `${projectedAudit.selectedRow.name} #${projectedAudit.selectedRow.rank}` : "Top 10 only"}
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.16em] text-gray-500">Top projected rows</p>
                    <p className="mt-1 text-sm font-semibold text-gray-600">
                      Raw points drive rank. Rounded points are display only. Third-place credit is isolated here to spot bias quickly.
                    </p>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs font-black uppercase tracking-[0.16em] text-gray-500">
                      <tr>
                        <th className="pb-2 pr-3">Rank</th>
                        <th className="pb-2 pr-3">Player</th>
                        <th className="pb-2 pr-3">Raw</th>
                        <th className="pb-2 pr-3">Shown</th>
                        <th className="pb-2 pr-3">Round diff</th>
                        <th className="pb-2 pr-3">3rd qual</th>
                        <th className="pb-2 pr-3">Top 2 bonus</th>
                        <th className="pb-2">Ladder bonus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(projectedAudit?.topRows ?? []).map((row) => (
                        <tr key={row.userId} className="border-t border-gray-100 align-top">
                          <td className="py-2 pr-3 font-black text-gray-950">#{row.rank}</td>
                          <td className="py-2 pr-3">
                            <div className="font-black text-gray-950">{row.name}</div>
                            <div className="text-xs font-semibold text-gray-500">{row.email}</div>
                          </td>
                          <td className="py-2 pr-3 font-semibold text-gray-800">{row.rawProjectedPoints.toFixed(3)}</td>
                          <td className="py-2 pr-3 font-semibold text-gray-800">{row.projectedPoints.toFixed(1)}</td>
                          <td className="py-2 pr-3 font-semibold text-amber-700">{row.displayRoundDelta.toFixed(3)}</td>
                          <td className="py-2 pr-3 font-semibold text-gray-800">{row.thirdPlaceQualificationPoints.toFixed(3)}</td>
                          <td className="py-2 pr-3 font-semibold text-gray-800">{row.topTwoBonus.toFixed(3)}</td>
                          <td className="py-2 font-semibold text-gray-800">{row.fullLadderBonus.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {projectedAudit?.selectedRow && projectedAudit.selectedBreakdown ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-amber-900">{projectedAudit.selectedRow.name}</p>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Raw {projectedAudit.selectedRow.rawProjectedPoints.toFixed(3)} · shown {projectedAudit.selectedRow.projectedPoints.toFixed(1)} · rank #{projectedAudit.selectedRow.rank}
                      </p>
                    </div>
                    <ManagementBadge label={projectedAudit.selectedRow.hasSnapshot ? "Has snapshot" : "No snapshot"} tone={projectedAudit.selectedRow.hasSnapshot ? "success" : "warning"} />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ManagementDatum label="Winner points" value={projectedAudit.selectedBreakdown.winnerPoints.toFixed(3)} />
                    <ManagementDatum label="Runner-up points" value={projectedAudit.selectedBreakdown.runnerUpPoints.toFixed(3)} />
                    <ManagementDatum label="Third-place exact" value={projectedAudit.selectedBreakdown.thirdPoints.toFixed(3)} />
                    <ManagementDatum label="Third-place qual" value={projectedAudit.selectedBreakdown.thirdPlaceQualificationPoints.toFixed(3)} />
                    <ManagementDatum label="Top two bonus" value={projectedAudit.selectedBreakdown.topTwoBonus.toFixed(3)} />
                    <ManagementDatum label="Full ladder bonus" value={projectedAudit.selectedBreakdown.fullLadderBonus.toFixed(3)} />
                    <ManagementDatum label="Projected total" value={projectedAudit.selectedBreakdown.totalProjectedPoints.toFixed(3)} />
                    <ManagementDatum label="Display delta" value={projectedAudit.selectedRow.displayRoundDelta.toFixed(3)} />
                  </div>

                  <div className="mt-4 space-y-2">
                    {projectedAudit.selectedBreakdown.groups
                      .slice()
                      .sort((left, right) => right.totalProjectedPoints - left.totalProjectedPoints)
                      .map((group) => (
                        <div key={group.groupName} className="rounded-md border border-amber-200 bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-black text-gray-950">Group {group.groupName}</p>
                            <ManagementBadge label={`${group.totalProjectedPoints.toFixed(3)} pts`} tone="neutral" />
                          </div>
                          <p className="mt-1 text-xs font-semibold text-gray-600">
                            Winner {group.winnerPoints.toFixed(3)} · Runner-up {group.runnerUpPoints.toFixed(3)} · Third {group.thirdPoints.toFixed(3)} · Top 2 bonus {group.topTwoBonus.toFixed(3)} · 3rd qual {group.thirdPlaceQualificationPoints.toFixed(3)} · Ladder {group.fullLadderBonus.toFixed(3)}
                          </p>
                          {group.predictedThirdTeamId ? (
                            <p className="mt-1 text-xs font-semibold text-amber-700">
                              Predicted third: {group.predictedThirdTeamId.toUpperCase()} · live third-place qualification probability {(group.thirdQualificationProbability * 100).toFixed(1)}%
                            </p>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          </AdminToolCard>
        </div>
      ) : null}

      {activeTab === "users" ? (
        <>
          <ManagementToolbar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            filterValue={filterValue}
            onFilterChange={(value) => setFilterValue(value as (typeof FILTERS)[number]["value"])}
            filters={FILTERS.map((filter) => ({ ...filter }))}
            className="md:sticky md:top-20 md:z-10 md:shadow-sm"
            trailing={
              <SignupDateFilterControl
                mode={signupDateFilterMode}
                value={signupDateFilterValue}
                onModeChange={(mode) => {
                  setSignupDateFilterMode(mode);
                  if (mode === "any") {
                    setSignupDateFilterValue("");
                  }
                }}
                onValueChange={setSignupDateFilterValue}
                onClear={() => {
                  setSignupDateFilterMode("any");
                  setSignupDateFilterValue("");
                }}
                secondaryAction={!isLoading ? (
                  <button
                    type="button"
                    onClick={() => void refreshPlayers()}
                    className="min-w-[6rem] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                  >
                    Refresh
                  </button>
                ) : null}
              />
            }
          />

          <ManagementSection
            title="Users / Members"
            description="Collapsed-by-default player cards that keep role, tier, counts, and warning chips visible while moving the heavier controls into the expanded state."
            storageKey="admin-players:users-section:v2"
            defaultOpen={false}
            badge={
              <>
                <ManagementBadge label={`${filteredPlayers.length} shown`} tone="neutral" />
                {attentionPlayerCount > 0 ? <ManagementBadge label={`${attentionPlayerCount} attention`} tone="warning" /> : null}
              </>
            }
          >
            {isLoading ? <ManagementEmptyState message="Loading players..." /> : null}
            {!isLoading && filteredPlayers.length === 0 ? (
              <ManagementEmptyState message="No players match the current search or filter." />
            ) : null}

            {!isLoading
              ? filteredPlayers.map((player) => {
              const activeManagerEditor = managerEditor?.userId === player.appUserId ? managerEditor : null;

              return (
                <PlayerSummaryCard
                  key={player.key}
                  player={player}
                  activeManagerEditor={activeManagerEditor}
                  activeActionKey={activeActionKey}
                  sendingResetForUserId={sendingResetForUserId}
                  onRename={() => {
                    const currentName = player.displayName;
                    const nextName = window.prompt(`Update display name for ${currentName}`, currentName);
                    if (!nextName || nextName.trim() === currentName || !player.appUserId) {
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
                  onManageManager={() => handleManagerAccess(player)}
                  onChangeTier={(targetAccessLevel) => {
                    if (!player.appUserId) {
                      setMessage({ tone: "error", text: "This row does not have an app user profile to update yet." });
                      return;
                    }

                    void withAction(`tier-${player.appUserId}`, async () => {
                      const result = await updateUserCommercialTierAction({
                        userId: player.appUserId!,
                        targetAccessLevel
                      });
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await loadPlayers();
                      }
                    });
                  }}
                  onPasswordReset={() => void handleResetUserAccess(player)}
                  onSendNudge={() => {
                    void withAction(`nudge-${player.email}`, async () => {
                      const result = await resendConfirmationOrOnboardingNudgeAction(player.email);
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await loadPlayers();
                      }
                    });
                  }}
                  onResetOnboarding={() => {
                    if (!player.appUserId) {
                      return;
                    }
                    void withAction(`reset-onboarding-${player.appUserId}`, async () => {
                      const result = await resetOnboardingStateAction(player.appUserId!);
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await loadPlayers();
                      }
                    });
                  }}
                  onRepairInvite={() => {
                    void withAction(`repair-invite-${player.email}`, async () => {
                      const result = await repairPendingInviteAction(player.email);
                      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
                      if (result.ok) {
                        await loadPlayers();
                      }
                    });
                  }}
                  onOpenDelete={() => {
                    setDeleteConfirmation({
                      key: `delete-start-over-${player.email}`,
                      email: player.email,
                      displayName: player.displayName
                    });
                    setDeleteConfirmationValue("");
                  }}
                  onNotify={(tone, text) => setMessage({ tone, text })}
                  onReload={loadPlayers}
                  setManagerEditor={setManagerEditor}
                  onSaveManagerLimits={() => {
                    if (!activeManagerEditor) {
                      return;
                    }
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
                />
              );
            })
              : null}
          </ManagementSection>
        </>
      ) : null}

      {activeTab === "groups" ? (
        <section className="space-y-3">
          <div className="ui-card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-black">Group management</h3>
              <ManagementBadge label="group tools" tone="neutral" />
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              Add existing players to groups, adjust group limits, and repair ownership without leaving this admin surface.
            </p>
          </div>
          <AdminGroupsSection showIntro={false} showPlayerManagementLink={false} />
        </section>
      ) : null}
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
      maxMembersPerGroup: String(player.maxMembersPerGroup ?? 30)
    });
  }
}

function AdminManagementTabs({
  activeTab,
  tabs,
  onChange
}: {
  activeTab: AdminManagementTab;
  tabs: Array<{ value: AdminManagementTab; label: string; badge: string }>;
  onChange: (value: AdminManagementTab) => void;
}) {
  return (
    <div className="ui-card flex gap-2 overflow-x-auto p-1.5">
      {tabs.map((tab) => {
        const isActive = tab.value === activeTab;

        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`flex min-w-[8.5rem] flex-1 items-center justify-between gap-3 rounded-[0.9rem] px-3 py-2 text-left transition ${
              isActive ? "bg-accent text-accent-text shadow-sm" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="text-sm font-black uppercase tracking-[0.14em]">{tab.label}</span>
            <span className={`ui-chip-sm shrink-0 font-bold ${isActive ? "bg-white/90 text-gray-900" : "bg-gray-100 text-gray-700"}`}>
              {tab.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SignupDateFilterControl({
  mode,
  value,
  onModeChange,
  onValueChange,
  onClear,
  secondaryAction
}: {
  mode: SignupDateFilterMode;
  value: string;
  onModeChange: (mode: SignupDateFilterMode) => void;
  onValueChange: (value: string) => void;
  onClear: () => void;
  secondaryAction?: ReactNode;
}) {
  const isDateDisabled = mode === "any";
  const canClear = mode !== "any" || Boolean(value);

  return (
    <div className="grid min-w-0 grid-cols-2 items-end gap-2 sm:min-w-[22rem] sm:grid-cols-[minmax(0,11rem)_minmax(0,9rem)_auto]">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-700">Signup date</span>
        <select
          value={mode}
          onChange={(event) => onModeChange(event.target.value as SignupDateFilterMode)}
          className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
        >
          {SIGNUP_DATE_FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-700">Date</span>
        <input
          type="date"
          value={value}
          disabled={isDateDisabled}
          onChange={(event) => onValueChange(event.target.value)}
          className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        />
      </label>
      <div className="col-span-2 flex min-w-0 gap-2 sm:col-span-1">
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          className="min-w-[5rem] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        >
          Clear
        </button>
        {secondaryAction}
      </div>
    </div>
  );
}

function matchesSignupDateFilter(
  createdAt: string | null | undefined,
  mode: SignupDateFilterMode,
  selectedDate: string
) {
  if (mode === "any" || !selectedDate) {
    return true;
  }

  const createdDate = getIsoDateKey(createdAt);
  if (!createdDate) {
    return false;
  }

  if (mode === "on") {
    return createdDate === selectedDate;
  }

  if (mode === "since") {
    return createdDate >= selectedDate;
  }

  return createdDate <= selectedDate;
}

function getIsoDateKey(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const directIsoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (directIsoDate) {
    return directIsoDate;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().slice(0, 10);
}

function AdminToolCard({
  title,
  storageKey,
  badge,
  children
}: {
  title: string;
  storageKey: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState(storageKey, false);

  return (
    <ManagementCard
      title={<span className="text-base font-black text-gray-950">{title}</span>}
      badges={badge}
      headerActions={
        <InlineDisclosureButton
          isOpen={isOpen}
          variant="subtle"
          onClick={() => setIsOpen((current) => !current)}
        />
      }
    >
      {isOpen ? children : null}
    </ManagementCard>
  );
}

function PlayerSummaryCard({
  player,
  activeManagerEditor,
  activeActionKey,
  sendingResetForUserId,
  onRename,
  onManageManager,
  onPasswordReset,
  onSendNudge,
  onResetOnboarding,
  onRepairInvite,
  onOpenDelete,
  onNotify,
  onReload,
  setManagerEditor,
  onSaveManagerLimits,
  onChangeTier
}: {
  player: AdminPlayerHealthRow;
  activeManagerEditor: {
    userId: string;
    displayName: string;
    maxGroups: string;
    maxMembersPerGroup: string;
  } | null;
  activeActionKey: string | null;
  sendingResetForUserId: string | null;
  onRename: () => void;
  onManageManager: () => void;
  onPasswordReset: () => void;
  onSendNudge: () => void;
  onResetOnboarding: () => void;
  onRepairInvite: () => void;
  onOpenDelete: () => void;
  onNotify: (tone: "success" | "error", text: string) => void;
  onReload: () => Promise<void>;
  onChangeTier: (targetAccessLevel: AccessLevel) => void;
  setManagerEditor: Dispatch<
    SetStateAction<{
      userId: string;
      displayName: string;
      maxGroups: string;
      maxMembersPerGroup: string;
    } | null>
  >;
  onSaveManagerLimits: () => void;
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState(`admin-players:card:${player.key}`, false);
  const [isDemotionPanelOpen, setIsDemotionPanelOpen] = useState(false);
  const demotionOptions = useMemo(
    () =>
      ADMIN_ASSIGNABLE_ACCESS_LEVELS.filter(
        (accessLevel) =>
          accessLevel !== "super_admin" &&
          compareAccessLevels(accessLevel, player.accessLevel) < 0
      ),
    [player.accessLevel]
  );
  const [demotionTargetAccessLevel, setDemotionTargetAccessLevel] = useState<AccessLevel>(demotionOptions[0] ?? "player");
  const [demotionImpact, setDemotionImpact] = useState<DemotionImpactSummary | null>(null);
  const [demotionImpactError, setDemotionImpactError] = useState<string | null>(null);
  const [isLoadingDemotionImpact, setIsLoadingDemotionImpact] = useState(false);
  const [isApplyingDemotion, setIsApplyingDemotion] = useState(false);
  const [isApplyingDeactivateOrganizer, setIsApplyingDeactivateOrganizer] = useState(false);
  const [demotionReason, setDemotionReason] = useState("");
  const [demotionConfirmationValue, setDemotionConfirmationValue] = useState("");
  const [cleanupSelections, setCleanupSelections] = useState<Partial<Record<DemotionCleanupOption, boolean>>>({});
  const [quickTierMessage, setQuickTierMessage] = useState<string | null>(null);
  const showDemotionTools = player.roleLabel !== "admin" && player.accessLevel !== "player" && Boolean(player.appUserId);
  const quickTierOptions = useMemo(
    () => ADMIN_ASSIGNABLE_ACCESS_LEVELS.filter((accessLevel) => accessLevel !== "super_admin"),
    []
  );

  useEffect(() => {
    if (!demotionOptions.length) {
      return;
    }

    setDemotionTargetAccessLevel((current) =>
      demotionOptions.includes(current) ? current : demotionOptions[0]
    );
  }, [demotionOptions]);

  useEffect(() => {
    if (!isDemotionPanelOpen || !player.appUserId || !demotionTargetAccessLevel) {
      return;
    }

    let isActive = true;
    setIsLoadingDemotionImpact(true);
    setDemotionImpactError(null);

    getUserDemotionImpactAction(player.appUserId, demotionTargetAccessLevel)
      .then((result) => {
        if (!isActive) {
          return;
        }

        if (!result.ok) {
          setDemotionImpact(null);
          setDemotionImpactError(result.message);
          return;
        }

        setDemotionImpact(result.impact);
        setCleanupSelections(
          result.impact.cleanupOptions.reduce<Partial<Record<DemotionCleanupOption, boolean>>>((next, option) => {
            next[option.key] = option.selectedByDefault;
            return next;
          }, {})
        );
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setDemotionImpact(null);
        setDemotionImpactError(error instanceof Error ? error.message : "Could not inspect that demotion right now.");
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingDemotionImpact(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [demotionTargetAccessLevel, isDemotionPanelOpen, player.appUserId]);

  return (
    <ManagementCard
      title={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((current) => !current)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <Avatar name={player.displayName} avatarUrl={player.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-base font-black text-gray-950">{player.displayName}</p>
              <p className="truncate text-sm font-semibold text-gray-600">{player.email}</p>
            </div>
          </button>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <ManagementBadge label={getRoleBadgeLabel(player.roleLabel === "admin" ? "super admin" : "player")} tone={player.roleLabel === "admin" ? "accent" : "neutral"} />
            <TierIconBadge accessLevel={player.accessLevel} size={22} />
            <ManagementBadge label={formatStateLabel(player.healthBadge)} tone={getHealthTone(player.healthBadge)} />
            {player.groupMembershipCount > 0 ? <ManagementBadge label={`${player.groupMembershipCount} groups`} tone="neutral" /> : null}
            {player.isManager ? <ManagementBadge label={`${player.currentGroupsUsed}/${player.maxGroups ?? 0} managed`} tone="warning" /> : null}
          </div>
        </div>
      }
    >
      {isOpen ? (
        <>
          <div className="-mt-1 flex justify-end">
            <InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen(false)} />
          </div>

          <ManagementGrid>
            <ManagementDatum label="Role" value={player.roleLabel === "admin" ? "Super Admin" : "Player"} />
            <ManagementDatum label="Plan tier" value={player.planTier ?? "player"} />
            <ManagementDatum label="Groups count" value={player.groupMembershipCount} />
            <ManagementDatum label="Managed groups" value={player.isManager ? player.currentGroupsUsed : "—"} />
            <ManagementDatum label="Seat usage" value={player.isManager ? `${player.currentMembersUsed} / ${player.maxMembersPerGroup ?? 0}` : "—"} />
            <ManagementDatum label="Invite state" value={formatStateLabel(player.inviteState)} />
            <ManagementDatum label="Delivery" value={formatDeliveryState(player)} />
            <ManagementDatum label="Warnings" value={player.troubleshootingNotes.length > 0 ? `${player.troubleshootingNotes.length} notes` : "Clear"} />
          </ManagementGrid>

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,15rem)] sm:items-end">
              <div>
                <p className="text-sm font-black text-gray-950">Tier access</p>
                <p className="mt-1 text-sm font-semibold text-gray-600">
                  Promote organizers here. Lower tiers open the guarded review below.
                </p>
              </div>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-700">Change tier</span>
                <select
                  value={player.roleLabel === "admin" ? "super_admin" : player.accessLevel}
                  disabled={!player.appUserId || activeActionKey === `tier-${player.appUserId}` || player.roleLabel === "admin"}
                  onChange={(event) => {
                    const targetAccessLevel = event.target.value as AccessLevel;
                    setQuickTierMessage(null);

                    if (targetAccessLevel === player.accessLevel) {
                      return;
                    }

                    if (compareAccessLevels(targetAccessLevel, player.accessLevel) < 0) {
                      setDemotionTargetAccessLevel(targetAccessLevel);
                      setIsDemotionPanelOpen(true);
                      setQuickTierMessage("Review impact below before lowering this user's tier.");
                      return;
                    }

                    onChangeTier(targetAccessLevel);
                  }}
                  className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm font-bold text-gray-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                >
                  {player.roleLabel === "admin" ? <option value="super_admin">Super Admin</option> : null}
                  {quickTierOptions.map((option) => (
                    <option key={option} value={option}>
                      {getAccessLevelDisplayLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {quickTierMessage ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-800">
                {quickTierMessage}
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {player.appUserId ? (
              <ActionButton onClick={onRename} disabled={activeActionKey === `rename-${player.appUserId}`}>
                {activeActionKey === `rename-${player.appUserId}` ? "Saving..." : "Edit Display Name"}
              </ActionButton>
            ) : null}
            {player.appUserId ? (
              <ActionButton onClick={onManageManager} disabled={activeActionKey === `manager-${player.appUserId}`}>
                {player.roleLabel === "admin"
                  ? "Super Admin"
                  : activeActionKey === `manager-${player.appUserId}`
                    ? "Saving..."
                    : player.isManager
                      ? "Edit Manager Limits"
                      : "Make Manager"}
              </ActionButton>
            ) : null}
            <ActionButton onClick={onPasswordReset} disabled={sendingResetForUserId === player.appUserId || !player.appUserId}>
              {sendingResetForUserId === player.appUserId ? "Sending..." : "Send Password Reset"}
            </ActionButton>
            {player.authUserId ? (
              <ActionButton onClick={onSendNudge} disabled={activeActionKey === `nudge-${player.email}`}>
                {activeActionKey === `nudge-${player.email}`
                  ? "Sending..."
                  : player.emailConfirmedAt
                    ? "Send Onboarding Reminder"
                    : "Resend Confirmation"}
              </ActionButton>
            ) : null}
            {player.appUserId ? (
              <ActionButton onClick={onResetOnboarding} disabled={activeActionKey === `reset-onboarding-${player.appUserId}`}>
                {activeActionKey === `reset-onboarding-${player.appUserId}` ? "Resetting..." : "Reset Profile Setup"}
              </ActionButton>
            ) : null}
            {canRepairInvite(player) ? (
              <ActionButton onClick={onRepairInvite} disabled={activeActionKey === `repair-invite-${player.email}`}>
                {activeActionKey === `repair-invite-${player.email}`
                  ? "Repairing..."
                  : player.inviteDeliveryState === "not_sent"
                    ? "Repair Invite"
                    : "Resend Invite"}
              </ActionButton>
            ) : null}
            {showDemotionTools ? (
              <ActionButton tone="danger" onClick={() => setIsDemotionPanelOpen((current) => !current)}>
                {isDemotionPanelOpen ? "Hide Demote / Remove Access" : "Demote / Remove Access"}
              </ActionButton>
            ) : null}
          </div>

          <ManagementGrid>
            <ManagementDatum label="Auth confirmed?" value={player.emailConfirmedAt ? "Yes" : "No"} />
            <ManagementDatum label="Profile exists?" value={player.hasProfile ? "Yes" : "No"} />
            <ManagementDatum label="Username set?" value={player.usernameSet ? "Yes" : "No"} />
            <ManagementDatum label="App" value={`${formatStateLabel(player.appState)}${player.userStatus ? ` (${player.userStatus})` : ""}`} />
            <ManagementDatum label="Auth" value={formatStateLabel(player.authState)} />
            <ManagementDatum label="App invite status" value={formatStateLabel(player.inviteState)} />
            <ManagementDatum label="Group invite status" value={player.groupInviteStatus} />
            <ManagementDatum label="Onboarding" value={player.onboardingIncomplete ? "Incomplete" : player.appUserId ? "Complete" : "Waiting for auth"} />
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
                <ActionButton onClick={onSaveManagerLimits} disabled={activeActionKey === `manager-${activeManagerEditor.userId}`} tone="accent">
                  {activeActionKey === `manager-${activeManagerEditor.userId}` ? "Saving..." : "Save Manager Limits"}
                </ActionButton>
                <ActionButton onClick={() => setManagerEditor(null)} disabled={activeActionKey === `manager-${activeManagerEditor.userId}`}>
                  Cancel
                </ActionButton>
              </div>
            </div>
          ) : null}

          {showDemotionTools && isDemotionPanelOpen ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black text-gray-950">Demote / Remove Access</p>
                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    Promotions stay in the invite/access card. Downward changes run through impact checks, blocking rules,
                    cleanup, and audit logging here.
                  </p>
                </div>
                <ManagementBadge label="Super Admin only" tone="warning" />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-gray-800">Target access level</span>
                  <select
                    value={demotionTargetAccessLevel}
                    onChange={(event) => setDemotionTargetAccessLevel(event.target.value as AccessLevel)}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  >
                    {demotionOptions.map((option) => (
                      <option key={option} value={option}>
                        {getAccessLevelDisplayLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-bold text-gray-800">Reason</span>
                  <input
                    value={demotionReason}
                    onChange={(event) => setDemotionReason(event.target.value)}
                    placeholder="Explain why this access change is needed"
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>
              </div>

              {isLoadingDemotionImpact ? (
                <p className="mt-4 rounded-md border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-600">
                  Checking ownership, limits, invite codes, and organization blockers...
                </p>
              ) : null}

              {demotionImpactError ? (
                <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">
                  {demotionImpactError}
                </p>
              ) : null}

              {demotionImpact ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ManagementDatum label="Current access" value={getAccessLevelDisplayLabel(demotionImpact.currentAccessLevel)} />
                    <ManagementDatum label="Target access" value={getAccessLevelDisplayLabel(demotionImpact.targetAccessLevel)} />
                    <ManagementDatum label="Owned groups" value={demotionImpact.ownedGroupCount} />
                    <ManagementDatum label="Managed groups" value={demotionImpact.managedGroupCount} />
                    <ManagementDatum label="Legacy manager groups" value={demotionImpact.legacyManagedGroupCount} />
                    <ManagementDatum label="Active invite codes" value={demotionImpact.activeInviteCodeCount} />
                    <ManagementDatum label="Codes created by user" value={demotionImpact.activeCreatedAccessCodeCount} />
                    <ManagementDatum label="Pending invites" value={demotionImpact.pendingInviteCount} />
                    <ManagementDatum label="Manager limits" value={demotionImpact.hasManagerLimits ? "Present" : "None"} />
                    <ManagementDatum label="Organizations" value={demotionImpact.organizationOwnershipCount} />
                    <ManagementDatum label="Branding" value={demotionImpact.organizationBrandingCount} />
                    <ManagementDatum label="Custom trophies" value={demotionImpact.customTrophyOwnershipCount} />
                    <ManagementDatum label="Side-pick ownership" value={demotionImpact.sidePickOwnershipCount} />
                    <ManagementDatum label="Impact status" value={demotionImpact.status.replace(/_/g, " ")} />
                  </div>

                  {demotionImpact.blockers.length > 0 ? (
                    <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-3">
                      <p className="text-sm font-black text-red-900">Blocking issues</p>
                      <div className="mt-2 space-y-1 text-sm font-semibold text-red-800">
                        {demotionImpact.blockers.map((blocker) => (
                          <p key={blocker}>{blocker}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {demotionImpact.cleanupActions.length > 0 ? (
                    <div className="mt-4 rounded-md border border-amber-200 bg-white px-3 py-3">
                      <p className="text-sm font-black text-gray-900">Cleanup required before applying</p>
                      <div className="mt-2 space-y-1 text-sm font-semibold text-gray-700">
                        {demotionImpact.cleanupActions.map((action) => (
                          <p key={action}>{action}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {demotionImpact.cleanupOptions.length > 0 ? (
                    <div className="mt-4 rounded-md border border-amber-200 bg-white px-3 py-3">
                      <p className="text-sm font-black text-gray-900">Select cleanup steps</p>
                      <div className="mt-3 space-y-3">
                        {demotionImpact.cleanupOptions.map((option) => (
                          <label key={option.key} className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-3">
                            <input
                              type="checkbox"
                              checked={Boolean(cleanupSelections[option.key])}
                              onChange={(event) =>
                                setCleanupSelections((current) => ({
                                  ...current,
                                  [option.key]: event.target.checked
                                }))
                              }
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                            />
                            <div>
                              <p className="text-sm font-black text-gray-950">{option.label}</p>
                              <p className="mt-1 text-sm font-semibold text-gray-600">{option.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {demotionImpact.ownedGroups.length > 0 ? (
                    <div className="mt-4 rounded-md border border-gray-200 bg-white px-3 py-3">
                      <p className="text-sm font-black text-gray-900">Owned groups</p>
                      <div className="mt-2 space-y-2">
                        {demotionImpact.ownedGroups.map((group) => (
                          <div key={group.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-black text-gray-950">{group.name}</p>
                              <ManagementBadge
                                label={`${group.memberCount} / ${group.membershipLimit} members`}
                                tone={group.exceedsTargetMemberLimit ? "warning" : "neutral"}
                              />
                            </div>
                            <p className="mt-1 text-xs font-semibold text-gray-600">
                              {group.activeInviteCodeCount} active code{group.activeInviteCodeCount === 1 ? "" : "s"} ·{" "}
                              {group.pendingInviteCount} pending invite{group.pendingInviteCount === 1 ? "" : "s"}
                            </p>
                            {group.blockerReason ? (
                              <p className="mt-1 text-xs font-semibold text-red-700">{group.blockerReason}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-800">Type {player.email} to confirm</span>
                    <input
                      value={demotionConfirmationValue}
                      onChange={(event) => setDemotionConfirmationValue(event.target.value)}
                      placeholder={player.email}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton
                      tone="neutral"
                      disabled={
                        demotionImpact.status === "blocked" ||
                        isApplyingDemotion ||
                        !demotionReason.trim() ||
                        demotionConfirmationValue.trim().toLowerCase() !== player.email.toLowerCase()
                      }
                      onClick={async () => {
                        if (!player.appUserId) {
                          return;
                        }

                        setIsApplyingDemotion(true);
                        try {
                          const result = await demoteUserWithImpactResolutionAction({
                            userId: player.appUserId,
                            targetAccessLevel: demotionTargetAccessLevel,
                            expectedEmail: demotionConfirmationValue,
                            reason: demotionReason,
                            resolutionPlan: cleanupSelections
                          });
                          onNotify(result.ok ? "success" : "error", result.message);
                          if (result.ok) {
                            setIsDemotionPanelOpen(false);
                            setDemotionReason("");
                            setDemotionConfirmationValue("");
                            setCleanupSelections({});
                            await onReload();
                          }
                        } finally {
                          setIsApplyingDemotion(false);
                        }
                      }}
                    >
                      {isApplyingDemotion
                        ? "Applying..."
                        : `Demote to ${getAccessLevelDisplayLabel(demotionTargetAccessLevel)}`}
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      disabled={
                        demotionTargetAccessLevel !== "player" ||
                        demotionImpact.status === "blocked" ||
                        isApplyingDeactivateOrganizer ||
                        !demotionReason.trim() ||
                        demotionConfirmationValue.trim().toLowerCase() !== player.email.toLowerCase()
                      }
                      onClick={async () => {
                        if (!player.appUserId) {
                          return;
                        }

                        setIsApplyingDeactivateOrganizer(true);
                        try {
                          const result = await deactivateOrganizerAccessAction({
                            userId: player.appUserId,
                            expectedEmail: demotionConfirmationValue,
                            reason: demotionReason,
                            resolutionPlan: cleanupSelections
                          });
                          onNotify(result.ok ? "success" : "error", result.message);
                          if (result.ok) {
                            setIsDemotionPanelOpen(false);
                            setDemotionReason("");
                            setDemotionConfirmationValue("");
                            setCleanupSelections({});
                            await onReload();
                          }
                        } finally {
                          setIsApplyingDeactivateOrganizer(false);
                        }
                      }}
                    >
                      {isApplyingDeactivateOrganizer ? "Deactivating..." : "Deactivate Organizer Access"}
                    </ActionButton>
                  </div>
                  {demotionTargetAccessLevel !== "player" ? (
                    <p className="mt-2 text-xs font-semibold text-gray-600">
                      Select <span className="font-black">Player</span> above to preview and apply organizer deactivation.
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs font-semibold text-gray-600">
                    Use the admin group tools below to transfer ownership or archive groups before retrying a blocked demotion.
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-red-200 bg-red-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-red-900">Danger Zone</p>
                <p className="mt-1 text-sm font-semibold text-red-800">
                  Destructive reset stays hidden here and requires typing the user email to continue.
                </p>
              </div>
              <ManagementBadge label="Super Admin only" tone="danger" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton tone="danger" onClick={onOpenDelete} disabled={activeActionKey === `delete-start-over-${player.email}`}>
                {activeActionKey === `delete-start-over-${player.email}` ? "Deleting..." : "Delete and Start Over"}
              </ActionButton>
            </div>
          </div>
        </>
      ) : null}
    </ManagementCard>
  );
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
