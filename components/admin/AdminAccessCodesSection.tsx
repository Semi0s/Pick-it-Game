"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  createAccessCodeAction,
  fetchAccessCodeGroupsAction,
  fetchAdminAccessCodesAction,
  setAccessCodeActiveStateAction,
  type AccessCodeGroupOption,
  type AdminAccessCode
} from "@/app/admin/access-codes/actions";
import { formatDateTimeWithZone } from "@/lib/date-time";
import { showAppToast } from "@/lib/app-toast";
import { COMMERCIAL_TIER_DEFINITIONS, type CommercialTier } from "@/lib/tier-access";
import { SUPER_LINK_GRANT_TIERS, type AccessCodeType } from "@/lib/super-link-access";
import {
  ActionButton,
  InlineDisclosureButton,
  ManagementBadge,
  ManagementCard,
  ManagementEmptyState,
  ManagementSection,
  ManagementToolbar,
  useSessionDisclosureState
} from "@/components/player-management/Shared";

export function AdminAccessCodesSection() {
  const [codes, setCodes] = useState<AdminAccessCode[]>([]);
  const [groups, setGroups] = useState<AccessCodeGroupOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [groupId, setGroupId] = useState("");
  const [codeType, setCodeType] = useState<AccessCodeType>("standard");
  const [grantsPlanTier, setGrantsPlanTier] = useState<CommercialTier>("captain");
  const [language, setLanguage] = useState<"en" | "es">("en");
  const [searchValue, setSearchValue] = useState("");

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
    const [codesResult, groupsResult] = await Promise.all([
      fetchAdminAccessCodesAction(),
      fetchAccessCodeGroupsAction()
    ]);

    if (!codesResult.ok) {
      setMessage({ tone: "error", text: codesResult.message });
      setIsLoading(false);
      return;
    }

    if (!groupsResult.ok) {
      setMessage({ tone: "error", text: groupsResult.message });
      setIsLoading(false);
      return;
    }

    setCodes(codesResult.codes);
    setGroups(groupsResult.groups);
    setIsLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const result = await createAccessCodeAction({
      code,
      label,
      notes,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      expiresAt: expiresAt.trim() ? expiresAt : null,
      groupId: groupId || null,
      codeType,
      grantsPlanTier,
      grantsGroupMembership: true,
      defaultLanguage: language
    });

    setIsSubmitting(false);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });

    if (!result.ok) {
      return;
    }

    setCode("");
    setLabel("");
    setNotes("");
    setMaxUses("");
    setExpiresAt("");
    setGroupId("");
    setCodeType("standard");
    setGrantsPlanTier("captain");
    setLanguage("en");
    await load();
  }

  async function handleToggle(codeId: string, nextActive: boolean) {
    setActiveKey(codeId);
    setMessage(null);
    const result = await setAccessCodeActiveStateAction(codeId, nextActive);
    setActiveKey(null);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      await load();
    }
  }

  async function handleCopy(accessCode: AdminAccessCode) {
    const copyValue = accessCode.codeType === "super_link" ? buildSuperLinkUrl(accessCode.code) : accessCode.code;
    try {
      await navigator.clipboard.writeText(copyValue);
      showAppToast({ tone: "success", text: accessCode.codeType === "super_link" ? "Super Link copied." : `Copied ${accessCode.code}.` });
    } catch (error) {
      console.error("Could not copy access code.", error);
      showAppToast({ tone: "error", text: "Could not copy that code right now." });
    }
  }

  const normalizedQuery = searchValue.trim().toLowerCase();
  const filteredCodes = codes.filter((accessCode) => {
    if (!normalizedQuery) {
      return true;
    }

    return (
      accessCode.code.toLowerCase().includes(normalizedQuery) ||
      accessCode.label.toLowerCase().includes(normalizedQuery) ||
      (accessCode.groupName ?? "").toLowerCase().includes(normalizedQuery) ||
      accessCode.redemptions.some((redemption) => redemption.email.toLowerCase().includes(normalizedQuery))
    );
  });
  const activeCodes = filteredCodes.filter((accessCode) => accessCode.active);
  const recentCodes = filteredCodes.filter((accessCode) => !accessCode.active);

  return (
    <div className="space-y-5">
      <ManagementCard
        title="Access codes & Super Links"
        subtitle="Create reusable signup codes and Super Admin promotional links."
        badges={
          <>
            <ManagementBadge label="Invite-only" tone="accent" />
            <ManagementBadge label="Reusable" tone="neutral" />
            <ManagementBadge label="Super Admin" tone="warning" />
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Access code</span>
              <input
                required
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base font-bold uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder={codeType === "super_link" ? "FIFA2026CAPTAIN" : "TEST2026"}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Label</span>
              <input
                required
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="June waitlist batch"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Type</span>
              <select
                value={codeType}
                onChange={(event) => {
                  const nextType = event.target.value === "super_link" ? "super_link" : "standard";
                  setCodeType(nextType);
                  if (nextType === "super_link" && grantsPlanTier === "player") {
                    setGrantsPlanTier("captain");
                  }
                }}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="standard">Standard access code</option>
                <option value="super_link">Super Link</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-bold text-gray-800">Grant tier</span>
              <select
                value={codeType === "super_link" ? grantsPlanTier : "player"}
                onChange={(event) => setGrantsPlanTier(event.target.value as CommercialTier)}
                disabled={codeType !== "super_link"}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light disabled:bg-gray-100 disabled:text-gray-500"
              >
                {SUPER_LINK_GRANT_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {COMMERCIAL_TIER_DEFINITIONS[tier].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-gray-800">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              placeholder="Optional internal notes"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Max uses</span>
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="Unlimited"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Expiration</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value === "es" ? "es" : "en")}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-gray-800">{codeType === "super_link" ? "Target group" : "Assign group"}</span>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              <option value="">{codeType === "super_link" ? "Choose a group" : "No automatic group assignment"}</option>
              {groups
                .filter((group) => group.status === "active")
                .map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} · {group.memberCount}/{group.membershipLimit}
                  </option>
                ))}
            </select>
          </label>

          <p className="text-sm font-semibold text-gray-500">
            {codeType === "super_link"
              ? "Anyone with an active Super Link can join the target group at the selected tier. Higher existing access levels are preserved."
              : "New signups stay invite-only. Access codes create players, can join one default group, and stop working when inactive, expired, full, or assigned to a full group."}
          </p>

          {codeType === "super_link" && code.trim() ? (
            <div className="rounded-md border border-accent/25 bg-accent-light/40 p-3 text-sm font-semibold text-accent-dark">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-dark/70">Super Link preview</p>
              <p className="mt-1 break-all">{buildSuperLinkUrl(code)}</p>
            </div>
          ) : null}

          <ActionButton type="submit" disabled={isSubmitting} tone="accent" fullWidth>
            {isSubmitting ? "Creating..." : codeType === "super_link" ? "Create Super Link" : "Create Access Code"}
          </ActionButton>
        </form>
      </ManagementCard>

      <ManagementToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filterValue="all"
        onFilterChange={() => {}}
        filters={[{ value: "all", label: "All access codes" }]}
        className="sticky top-20 z-10 shadow-sm"
      />

      <ManagementSection
        title="Active Access Codes"
        description="Compact live codes for quick copy, review, and deactivation."
        storageKey="admin-access-codes:active-section"
        defaultOpen
        badge={<ManagementBadge label={`${activeCodes.length} active`} tone="accent" />}
      >
        {isLoading ? <ManagementEmptyState message="Loading access codes..." /> : null}
        {!isLoading && activeCodes.length === 0 ? <ManagementEmptyState message="No active access codes match the current search." /> : null}
        {!isLoading
          ? activeCodes.map((accessCode) => (
              <AccessCodeSummaryCard
                key={accessCode.id}
                accessCode={accessCode}
                isPending={activeKey === accessCode.id}
                onCopy={() => void handleCopy(accessCode)}
                onToggle={() => void handleToggle(accessCode.id, !accessCode.active)}
              />
            ))
          : null}
      </ManagementSection>

      <ManagementSection
        title="Recent Access Codes"
        description="Inactive or older codes stay compact until you need the full context."
        storageKey="admin-access-codes:recent-section"
        defaultOpen={false}
        badge={<ManagementBadge label={`${recentCodes.length} recent`} tone="neutral" />}
      >
        {isLoading ? <ManagementEmptyState message="Loading access codes..." /> : null}
        {!isLoading && recentCodes.length === 0 ? <ManagementEmptyState message="No recent inactive codes match the current search." /> : null}
        {!isLoading
          ? recentCodes.map((accessCode) => (
              <AccessCodeSummaryCard
                key={accessCode.id}
                accessCode={accessCode}
                isPending={activeKey === accessCode.id}
                onCopy={() => void handleCopy(accessCode)}
                onToggle={() => void handleToggle(accessCode.id, !accessCode.active)}
              />
            ))
          : null}
      </ManagementSection>
    </div>
  );
}

function AccessCodeSummaryCard({
  accessCode,
  isPending,
  onCopy,
  onToggle
}: {
  accessCode: AdminAccessCode;
  isPending: boolean;
  onCopy: () => void;
  onToggle: () => void;
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState(`admin-access-code:${accessCode.id}`, false);
  const recentActivity = accessCode.redemptions[0]?.redeemedAt ?? accessCode.updatedAt;

  return (
    <ManagementCard
      title={
        <div className="min-w-0">
          <p className="truncate text-base font-black text-gray-950">{accessCode.label}</p>
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">{maskCode(accessCode.code)}</p>
        </div>
      }
      subtitle={`${accessCode.groupName ?? "No group"} · ${accessCode.redemptions.length} redeemed`}
      badges={
        <>
          <ManagementBadge label={accessCode.codeType === "super_link" ? "Super Link" : "Access Code"} tone={accessCode.codeType === "super_link" ? "accent" : "neutral"} />
          {accessCode.codeType === "super_link" ? (
            <ManagementBadge label={COMMERCIAL_TIER_DEFINITIONS[accessCode.grantsPlanTier].label} tone="warning" />
          ) : null}
          <ManagementBadge label={accessCode.active ? "active" : "inactive"} tone={accessCode.active ? "success" : "neutral"} />
          <ManagementBadge
            label={accessCode.maxUses != null ? `${accessCode.usedCount}/${accessCode.maxUses} uses` : `${accessCode.usedCount} uses`}
            tone="warning"
          />
          {accessCode.expiresAt ? <ManagementBadge label={`Expires ${formatDateTimeWithZone(accessCode.expiresAt)}`} tone="neutral" /> : null}
        </>
      }
      headerActions={
        <InlineDisclosureButton
          isOpen={isOpen}
          variant="subtle"
          onClick={() => setIsOpen((current) => !current)}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryDatum label="Code" value={maskCode(accessCode.code)} />
        <SummaryDatum label="Type" value={accessCode.codeType === "super_link" ? "Super Link" : "Standard"} />
        <SummaryDatum label="Group" value={accessCode.groupName ?? "Unassigned"} />
        <SummaryDatum
          label="Grants"
          value={accessCode.codeType === "super_link" ? COMMERCIAL_TIER_DEFINITIONS[accessCode.grantsPlanTier].label : "Player"}
        />
        <SummaryDatum label="Recent activity" value={formatDateTimeWithZone(recentActivity)} />
      </div>

      {isOpen ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
            >
              {accessCode.codeType === "super_link" ? "Copy Super Link" : "Copy code"}
            </button>
            <button
              type="button"
              onClick={onToggle}
              disabled={isPending}
              className="inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:opacity-60"
            >
              {isPending ? "Saving..." : accessCode.active ? "Deactivate" : "Activate"}
            </button>
            {accessCode.groupId ? (
              <Link
                href="/admin/groups"
                className="inline-flex rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
              >
                View group
              </Link>
            ) : null}
          </div>

          <div className="mt-3 space-y-1 text-sm font-semibold text-gray-600">
            {accessCode.notes ? <p>{accessCode.notes}</p> : null}
            {accessCode.codeType === "super_link" ? (
              <p className="break-all">Super Link: {buildSuperLinkUrl(accessCode.code)}</p>
            ) : null}
            <p>Owner: {accessCode.ownerName ?? accessCode.ownerEmail ?? "Unknown"}</p>
            <p>Language: {accessCode.defaultLanguage.toUpperCase()}</p>
            <p>Created: {formatDateTimeWithZone(accessCode.createdAt)}</p>
            <p>Updated: {formatDateTimeWithZone(accessCode.updatedAt)}</p>
          </div>

          {accessCode.redemptions.length > 0 ? (
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Redeemed by</p>
              <div className="mt-2 space-y-2">
                {accessCode.redemptions.map((redemption) => (
                  <div key={redemption.id} className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-gray-700">
                    <span>{redemption.email}</span>
                    <span className="text-xs text-gray-500">{formatDateTimeWithZone(redemption.redeemedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </ManagementCard>
  );
}

function buildSuperLinkUrl(code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const params = new URLSearchParams({ code: code.trim() });
  return `${origin}/join?${params.toString()}`;
}

function maskCode(code: string) {
  if (code.length <= 6) {
    return code;
  }

  return `${code.slice(0, 4)}••${code.slice(-2)}`;
}

function SummaryDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
