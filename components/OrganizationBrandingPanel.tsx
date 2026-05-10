"use client";

import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  approveOrganizationBrandingAction,
  disableOrganizationBrandingAction,
  fetchOrganizationBrandingWorkspaceAction,
  rejectOrganizationBrandingAction,
  removeOrganizationBrandingAssetAction,
  revertOrganizationBrandingAction,
  saveOrganizationBrandingCopyAction,
  submitOrganizationBrandingForReviewAction,
  uploadOrganizationBrandingAssetAction,
  type FetchOrganizationBrandingWorkspaceResult
} from "@/app/my-groups/organization-branding-actions";
import { OrganizationPortalPreview } from "@/components/OrganizationPortalPreview";
import { showAppToast } from "@/lib/app-toast";
import {
  ORGANIZATION_REVIEW_NOTE_MAX_LENGTH,
  ORGANIZATION_SPONSOR_MESSAGE_MAX_LENGTH,
  ORGANIZATION_WELCOME_HEADLINE_MAX_LENGTH,
  ORGANIZATION_WELCOME_MESSAGE_MAX_LENGTH,
  getOrganizationBrandingLabel,
  getOrganizationBrandingTone
} from "@/lib/organization-branding";
import {
  ActionButton,
  InlineDisclosureButton,
  ManagementBadge,
  ManagementCard,
  ManagementEmptyState,
  useSessionDisclosureState
} from "@/components/player-management/Shared";

type WorkspaceState = Extract<FetchOrganizationBrandingWorkspaceResult, { ok: true }>;

const ORGANIZATION_BRANDING_DISCLOSURE_STORAGE_KEY = "my-groups-organization-branding";

export function OrganizationBrandingPanel() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>("");
  const [welcomeHeadline, setWelcomeHeadline] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [sponsorPrizeMessage, setSponsorPrizeMessage] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const [isOpen, setIsOpen] = useSessionDisclosureState(ORGANIZATION_BRANDING_DISCLOSURE_STORAGE_KEY, false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);

  const loadWorkspace = useCallback(async (organizationId?: string | null) => {
    setIsLoading(true);
    const result = await fetchOrganizationBrandingWorkspaceAction(organizationId);
    if (!result.ok) {
      showAppToast({ tone: "error", text: result.message });
      setWorkspace(null);
      setSelectedOrganizationId("");
      setIsLoading(false);
      return;
    }

    setWorkspace(result);
    setSelectedOrganizationId(result.selectedOrganizationId ?? "");
    setModerationReason("");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void loadWorkspace(selectedOrganizationId || undefined);
  }, [isOpen, loadWorkspace, selectedOrganizationId]);

  useEffect(() => {
    if (!workspace?.organization) {
      setWelcomeHeadline("");
      setWelcomeMessage("");
      setSponsorPrizeMessage("");
      return;
    }

    setWelcomeHeadline(workspace.organization.welcomeHeadline);
    setWelcomeMessage(workspace.organization.welcomeMessage);
    setSponsorPrizeMessage(workspace.organization.sponsorPrizeMessage);
  }, [workspace?.organization]);

  async function withAction<T>(
    key: string,
    task: () => Promise<T>
  ) {
    setActionKey(key);
    try {
      return await task();
    } finally {
      setActionKey(null);
    }
  }

  function syncOrganization(result: Extract<Awaited<ReturnType<typeof saveOrganizationBrandingCopyAction>>, { ok: true }>["organization"]) {
    setWorkspace((current) =>
      current
        ? {
            ...current,
            organization: result
          }
        : current
    );
  }

  function resolvePreviewCopyValue(currentValue: string, persistedValue: string) {
    return currentValue.trim() ? currentValue : persistedValue;
  }

  async function handleSaveDraft() {
    const organization = workspace?.organization;
    if (!organization) {
      return;
    }

    const result = await withAction("save-copy", () =>
      saveOrganizationBrandingCopyAction({
        organizationId: organization.organizationId,
        welcomeHeadline,
        welcomeMessage,
        sponsorPrizeMessage
      })
    );
    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      syncOrganization(result.organization);
    }
  }

  async function handleSubmitForReview() {
    const organization = workspace?.organization;
    if (!organization) {
      return;
    }

    const result = await withAction("submit-review", () =>
      submitOrganizationBrandingForReviewAction(organization.organizationId)
    );
    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      syncOrganization(result.organization);
    }
  }

  async function handleUpload(assetKind: "logo" | "background", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const organization = workspace?.organization;
    if (!file || !organization) {
      return;
    }

    const formData = new FormData();
    formData.set("organizationId", organization.organizationId);
    formData.set("assetKind", assetKind);
    formData.set("file", file);

    const result = await withAction(`upload-${assetKind}`, () => uploadOrganizationBrandingAssetAction(formData));
    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      syncOrganization(result.organization);
    }

    event.target.value = "";
  }

  async function handleRemoveAsset(assetKind: "logo" | "background") {
    const organization = workspace?.organization;
    if (!organization) {
      return;
    }

    const result = await withAction(`remove-${assetKind}`, () =>
      removeOrganizationBrandingAssetAction(organization.organizationId, assetKind)
    );
    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      syncOrganization(result.organization);
    }
  }

  async function handleModeration(action: "approve" | "reject" | "disable" | "revert") {
    const organization = workspace?.organization;
    if (!organization) {
      return;
    }

    const organizationId = organization.organizationId;
    const result = await withAction(action, async () => {
      if (action === "approve") {
        return approveOrganizationBrandingAction({ organizationId });
      }

      if (action === "reject") {
        return rejectOrganizationBrandingAction({ organizationId, reason: moderationReason });
      }

      if (action === "disable") {
        return disableOrganizationBrandingAction({ organizationId, reason: moderationReason });
      }

      return revertOrganizationBrandingAction(organizationId);
    });

    showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      syncOrganization(result.organization);
      if (action !== "approve") {
        setModerationReason("");
      }
    }
  }

  return (
    <ManagementCard
      title="Organization Branding"
      subtitle="Scoped portal branding for Managing Directors and Super Admins."
      badges={
        workspace?.organization ? (
          <ManagementBadge
            label={getOrganizationBrandingLabel(workspace.organization.status)}
            tone={getOrganizationBrandingTone(workspace.organization.status)}
          />
        ) : undefined
      }
      headerActions={
        <InlineDisclosureButton isOpen={isOpen} variant="subtle" onClick={() => setIsOpen((current) => !current)} />
      }
    >
      {isOpen ? (
        isLoading ? (
          <ManagementEmptyState message="Loading organization branding..." />
        ) : !workspace?.organization ? (
          <ManagementEmptyState message="No organization branding scope is available yet." />
        ) : (
          <div className="space-y-4">
            {workspace.organizations.length > 1 ? (
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Organization</span>
                <select
                  value={selectedOrganizationId}
                  onChange={(event) => {
                    const nextOrganizationId = event.target.value;
                    setSelectedOrganizationId(nextOrganizationId);
                    void loadWorkspace(nextOrganizationId);
                  }}
                  className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                >
                  {workspace.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {workspace.organization.reviewNote ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-900">
                {workspace.organization.reviewNote}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Welcome headline</span>
                  <input
                    value={welcomeHeadline}
                    onChange={(event) => setWelcomeHeadline(event.target.value)}
                    maxLength={ORGANIZATION_WELCOME_HEADLINE_MAX_LENGTH}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Welcome message</span>
                  <textarea
                    value={welcomeMessage}
                    onChange={(event) => setWelcomeMessage(event.target.value)}
                    rows={4}
                    maxLength={ORGANIZATION_WELCOME_MESSAGE_MAX_LENGTH}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Sponsor / prize message</span>
                  <textarea
                    value={sponsorPrizeMessage}
                    onChange={(event) => setSponsorPrizeMessage(event.target.value)}
                    rows={3}
                    maxLength={ORGANIZATION_SPONSOR_MESSAGE_MAX_LENGTH}
                    className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Logo</p>
                        <p className="mt-1 text-sm font-semibold text-gray-600">JPG, PNG, or WebP up to 2 MB.</p>
                      </div>
                      <ManagementBadge label={workspace.organization.logo.signedUrl ? "set" : "default"} tone="neutral" />
                    </div>
                    <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={workspace.organization.logo.signedUrl ?? "/images/pickit-signin-logo.png"}
                        alt={`${workspace.organization.organizationName} logo preview`}
                        className="h-28 w-full object-contain p-3"
                      />
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => void handleUpload("logo", event)}
                    />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <ActionButton
                        onClick={() => logoInputRef.current?.click()}
                        disabled={Boolean(actionKey)}
                        fullWidth
                      >
                        {actionKey === "upload-logo" ? "Uploading..." : "Upload / replace"}
                      </ActionButton>
                      <ActionButton
                        onClick={() => void handleRemoveAsset("logo")}
                        disabled={Boolean(actionKey)}
                        tone="danger"
                        fullWidth
                      >
                        Remove
                      </ActionButton>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Background</p>
                        <p className="mt-1 text-sm font-semibold text-gray-600">JPG, PNG, or WebP up to 5 MB.</p>
                      </div>
                      <ManagementBadge label={workspace.organization.background.signedUrl ? "set" : "default"} tone="neutral" />
                    </div>
                    <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={workspace.organization.background.signedUrl ?? "/images/signin-stadium.jpeg"}
                        alt={`${workspace.organization.organizationName} background preview`}
                        className="h-28 w-full object-cover"
                      />
                    </div>
                    <input
                      ref={backgroundInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => void handleUpload("background", event)}
                    />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <ActionButton
                        onClick={() => backgroundInputRef.current?.click()}
                        disabled={Boolean(actionKey)}
                        fullWidth
                      >
                        {actionKey === "upload-background" ? "Uploading..." : "Upload / replace"}
                      </ActionButton>
                      <ActionButton
                        onClick={() => void handleRemoveAsset("background")}
                        disabled={Boolean(actionKey)}
                        tone="danger"
                        fullWidth
                      >
                        Remove
                      </ActionButton>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ActionButton onClick={() => void handleSaveDraft()} disabled={Boolean(actionKey)}>
                    {actionKey === "save-copy" ? "Saving..." : "Save draft"}
                  </ActionButton>
                  <ActionButton onClick={() => void handleSubmitForReview()} disabled={Boolean(actionKey)} tone="accent">
                    {actionKey === "submit-review" ? "Submitting..." : "Submit for review"}
                  </ActionButton>
                  <Link
                    href={workspace.organization.previewPath}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                  >
                    Open preview
                  </Link>
                </div>
              </div>

              <div className="space-y-4">
                <OrganizationPortalPreview
                  organizationName={workspace.organization.organizationName}
                  welcomeHeadline={resolvePreviewCopyValue(welcomeHeadline, workspace.organization.welcomeHeadline)}
                  welcomeMessage={resolvePreviewCopyValue(welcomeMessage, workspace.organization.welcomeMessage)}
                  sponsorPrizeMessage={resolvePreviewCopyValue(
                    sponsorPrizeMessage,
                    workspace.organization.sponsorPrizeMessage
                  )}
                  logoUrl={workspace.organization.logo.signedUrl}
                  backgroundUrl={workspace.organization.background.signedUrl}
                  previewLabel="Portal preview"
                />

                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Live portal</p>
                  <p className="mt-2 text-sm font-semibold text-gray-700">
                    Approved branding appears at{" "}
                    <Link href={`/o/${workspace.organization.organizationSlug}`} target="_blank" rel="noreferrer" className="text-accent-dark underline underline-offset-2">
                      /o/{workspace.organization.organizationSlug}
                    </Link>
                    .
                  </p>
                </div>

                {workspace.canModerate ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Super Admin moderation</p>
                    <label className="mt-3 block">
                      <span className="text-sm font-semibold text-gray-700">Reason / note</span>
                      <textarea
                        value={moderationReason}
                        onChange={(event) => setModerationReason(event.target.value)}
                        rows={3}
                        maxLength={ORGANIZATION_REVIEW_NOTE_MAX_LENGTH}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                      />
                    </label>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <ActionButton onClick={() => void handleModeration("approve")} disabled={Boolean(actionKey)} tone="accent">
                        {actionKey === "approve" ? "Approving..." : "Approve"}
                      </ActionButton>
                      <ActionButton onClick={() => void handleModeration("reject")} disabled={Boolean(actionKey)} tone="danger">
                        {actionKey === "reject" ? "Rejecting..." : "Reject"}
                      </ActionButton>
                      <ActionButton onClick={() => void handleModeration("disable")} disabled={Boolean(actionKey)} tone="danger">
                        {actionKey === "disable" ? "Disabling..." : "Disable"}
                      </ActionButton>
                      <ActionButton onClick={() => void handleModeration("revert")} disabled={Boolean(actionKey)}>
                        {actionKey === "revert" ? "Reverting..." : "Revert"}
                      </ActionButton>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )
      ) : (
        <p className="text-sm font-semibold text-gray-600">
          Add a private logo, background, and welcome copy for your organization portal.
        </p>
      )}
    </ManagementCard>
  );
}
