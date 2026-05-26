"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createPromoManagerInviteCodeAction,
  fetchAdminPromoManagerInviteCodesAction,
  fetchPromoManagerInviteGroupsAction,
  setPromoManagerInviteCodeStatusAction,
  type AdminPromoManagerInviteCode,
  type PromoManagerInviteGroupOption
} from "@/app/admin/promo-manager-invite-codes/actions";
import { formatDateTimeWithZone } from "@/lib/date-time";
import { showAppToast } from "@/lib/app-toast";
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

export function AdminPromoManagerInviteCodesSection() {
  const [codes, setCodes] = useState<AdminPromoManagerInviteCode[]>([]);
  const [groups, setGroups] = useState<PromoManagerInviteGroupOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [code, setCode] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [publicTitle, setPublicTitle] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [targetGroupId, setTargetGroupId] = useState("");
  const [sourceCampaign, setSourceCampaign] = useState("");
  const [notes, setNotes] = useState("");

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
      fetchAdminPromoManagerInviteCodesAction(),
      fetchPromoManagerInviteGroupsAction()
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

    const result = await createPromoManagerInviteCodeAction({
      code,
      campaignName,
      publicTitle,
      publicDescription,
      maxRedemptions: Number(maxRedemptions),
      startsAt: startsAt.trim() ? startsAt : null,
      expiresAt: expiresAt.trim() ? expiresAt : null,
      targetGroupId: targetGroupId || null,
      sourceCampaign,
      notes
    });

    setIsSubmitting(false);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });

    if (!result.ok) {
      return;
    }

    setCode("");
    setCampaignName("");
    setPublicTitle("");
    setPublicDescription("");
    setMaxRedemptions("");
    setStartsAt("");
    setExpiresAt("");
    setTargetGroupId("");
    setSourceCampaign("");
    setNotes("");
    await load();
  }

  async function handleStatusChange(id: string, status: "active" | "paused" | "archived") {
    setActiveKey(`${id}:${status}`);
    setMessage(null);
    const result = await setPromoManagerInviteCodeStatusAction(id, status);
    setActiveKey(null);
    setMessage({ tone: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      await load();
    }
  }

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showAppToast({ tone: "success", text: `Copied ${label}.` });
    } catch (error) {
      console.error("Could not copy promo invite value.", error);
      showAppToast({ tone: "error", text: "Could not copy right now." });
    }
  }

  const filteredCodes = useMemo(() => {
    const normalizedQuery = searchValue.trim().toLowerCase();
    if (!normalizedQuery) {
      return codes;
    }

    return codes.filter((promoCode) =>
      [
        promoCode.code,
        promoCode.campaignName,
        promoCode.publicTitle ?? "",
        promoCode.sourceCampaign ?? "",
        promoCode.targetGroupName ?? "",
        ...promoCode.redemptions.map((redemption) => redemption.email)
      ].some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [codes, searchValue]);

  const activeCodes = filteredCodes.filter((promoCode) => promoCode.status === "active");
  const inactiveCodes = filteredCodes.filter((promoCode) => promoCode.status !== "active");

  return (
    <div className="space-y-5">
      <ManagementCard
        title="Promo Manager Invite Codes"
        subtitle="Create social-shareable manager access giveaways with capacity, dates, and auditable redemptions."
        badges={
          <>
            <ManagementBadge label="Manager only" tone="accent" />
            <ManagementBadge label="Capacity guarded" tone="warning" />
            <ManagementBadge label="Super Admin" tone="neutral" />
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Code / slug</span>
              <input
                required
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base font-bold uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="WORLD26"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Campaign name</span>
              <input
                required
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="World Cup manager giveaway"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Public title</span>
              <input
                value={publicTitle}
                onChange={(event) => setPublicTitle(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="Claim manager access"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Source / campaign label</span>
              <input
                value={sourceCampaign}
                onChange={(event) => setSourceCampaign(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="instagram-manager-giveaway"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-gray-800">Public description</span>
            <textarea
              value={publicDescription}
              onChange={(event) => setPublicDescription(event.target.value)}
              rows={2}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              placeholder="Use this code to claim manager access while spots are available."
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-4">
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Max redemptions</span>
              <input
                required
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={(event) => setMaxRedemptions(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
                placeholder="100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Starts</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Expires</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-gray-800">Target group capacity</span>
              <select
                value={targetGroupId}
                onChange={(event) => setTargetGroupId(event.target.value)}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              >
                <option value="">No target group limit</option>
                {groups
                  .filter((group) => group.status === "active")
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} · {group.memberCount}/{group.membershipLimit}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-gray-800">Internal notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
              placeholder="Optional notes for the admin team"
            />
          </label>

          <p className="text-sm font-semibold text-gray-500">
            These codes only grant manager-tier capability. They never grant Super Admin, and the database redemption function enforces capacity under a row lock.
          </p>

          <ActionButton type="submit" disabled={isSubmitting} tone="accent" fullWidth>
            {isSubmitting ? "Creating..." : "Create Promo Manager Code"}
          </ActionButton>
        </form>
      </ManagementCard>

      <ManagementToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        filterValue="all"
        onFilterChange={() => {}}
        filters={[{ value: "all", label: "All promo manager codes" }]}
        className="sticky top-20 z-10 shadow-sm"
      />

      <ManagementSection
        title="Active Promo Codes"
        description="Live social links that can still be claimed."
        storageKey="admin-promo-manager-codes:active"
        defaultOpen
        badge={<ManagementBadge label={`${activeCodes.length} active`} tone="accent" />}
      >
        {isLoading ? <ManagementEmptyState message="Loading promo manager codes..." /> : null}
        {!isLoading && activeCodes.length === 0 ? <ManagementEmptyState message="No active promo manager codes match the current search." /> : null}
        {!isLoading
          ? activeCodes.map((promoCode) => (
              <PromoManagerCodeCard
                key={promoCode.id}
                promoCode={promoCode}
                activeKey={activeKey}
                onCopy={handleCopy}
                onStatusChange={handleStatusChange}
              />
            ))
          : null}
      </ManagementSection>

      <ManagementSection
        title="Paused, Full, Expired, Archived"
        description="Inactive campaigns and redemption history."
        storageKey="admin-promo-manager-codes:inactive"
        defaultOpen={false}
        badge={<ManagementBadge label={`${inactiveCodes.length} inactive`} tone="neutral" />}
      >
        {isLoading ? <ManagementEmptyState message="Loading promo manager codes..." /> : null}
        {!isLoading && inactiveCodes.length === 0 ? <ManagementEmptyState message="No inactive promo manager codes match the current search." /> : null}
        {!isLoading
          ? inactiveCodes.map((promoCode) => (
              <PromoManagerCodeCard
                key={promoCode.id}
                promoCode={promoCode}
                activeKey={activeKey}
                onCopy={handleCopy}
                onStatusChange={handleStatusChange}
              />
            ))
          : null}
      </ManagementSection>
    </div>
  );
}

function PromoManagerCodeCard({
  promoCode,
  activeKey,
  onCopy,
  onStatusChange
}: {
  promoCode: AdminPromoManagerInviteCode;
  activeKey: string | null;
  onCopy: (value: string, label: string) => Promise<void>;
  onStatusChange: (id: string, status: "active" | "paused" | "archived") => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState(`admin-promo-manager-code:${promoCode.id}`, false);
  const statusTone = promoCode.status === "active" ? "success" : promoCode.status === "paused" ? "warning" : "neutral";

  return (
    <ManagementCard
      title={
        <div className="min-w-0">
          <p className="truncate text-base font-black text-gray-950">{promoCode.campaignName}</p>
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">{promoCode.code}</p>
        </div>
      }
      subtitle={`${promoCode.redemptionCount}/${promoCode.maxRedemptions} redeemed · ${promoCode.remainingSlots} remaining`}
      badges={
        <>
          <ManagementBadge label={promoCode.status} tone={statusTone} />
          <ManagementBadge label={`${promoCode.redemptionCount}/${promoCode.maxRedemptions}`} tone="warning" />
          {promoCode.targetGroupName ? <ManagementBadge label={promoCode.targetGroupName} tone="neutral" /> : null}
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
        <SummaryDatum label="Share link" value={promoCode.shareLink} />
        <SummaryDatum label="Starts" value={promoCode.startsAt ? formatDateTimeWithZone(promoCode.startsAt) : "Immediately"} />
        <SummaryDatum label="Expires" value={promoCode.expiresAt ? formatDateTimeWithZone(promoCode.expiresAt) : "No expiration"} />
        <SummaryDatum label="Source" value={promoCode.sourceCampaign ?? "Untracked"} />
      </div>

      {isOpen ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCopy(promoCode.shareLink, "share link")}
              className="inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => void onCopy(promoCode.code, "code")}
              className="inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
            >
              Copy code
            </button>
            {promoCode.status === "active" ? (
              <button
                type="button"
                onClick={() => void onStatusChange(promoCode.id, "paused")}
                disabled={activeKey === `${promoCode.id}:paused`}
                className="inline-flex rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {activeKey === `${promoCode.id}:paused` ? "Saving..." : "Pause"}
              </button>
            ) : promoCode.status === "paused" ? (
              <button
                type="button"
                onClick={() => void onStatusChange(promoCode.id, "active")}
                disabled={activeKey === `${promoCode.id}:active`}
                className="inline-flex rounded-md border border-accent bg-accent-light px-3 py-2 text-sm font-bold text-accent-dark transition hover:bg-accent-light/80 disabled:opacity-60"
              >
                {activeKey === `${promoCode.id}:active` ? "Saving..." : "Reactivate"}
              </button>
            ) : null}
            {promoCode.status !== "archived" ? (
              <button
                type="button"
                onClick={() => void onStatusChange(promoCode.id, "archived")}
                disabled={activeKey === `${promoCode.id}:archived`}
                className="inline-flex rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800 transition hover:bg-gray-100 disabled:opacity-60"
              >
                {activeKey === `${promoCode.id}:archived` ? "Saving..." : "Archive"}
              </button>
            ) : null}
          </div>

          <div className="mt-3 space-y-1 text-sm font-semibold text-gray-600">
            {promoCode.publicTitle ? <p>Public title: {promoCode.publicTitle}</p> : null}
            {promoCode.publicDescription ? <p>Public description: {promoCode.publicDescription}</p> : null}
            {promoCode.notes ? <p>Notes: {promoCode.notes}</p> : null}
            <p>Created by: {promoCode.createdByName ?? promoCode.createdByEmail ?? "Unknown"}</p>
            <p>Created: {formatDateTimeWithZone(promoCode.createdAt)}</p>
            <p>Updated: {formatDateTimeWithZone(promoCode.updatedAt)}</p>
          </div>

          {promoCode.redemptions.length > 0 ? (
            <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Redemption history</p>
              <div className="mt-2 space-y-2">
                {promoCode.redemptions.map((redemption) => (
                  <div key={redemption.id} className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{redemption.email}</span>
                      <span className="text-xs text-gray-500">{formatDateTimeWithZone(redemption.redeemedAt)}</span>
                    </div>
                    {redemption.utmSource || redemption.utmCampaign ? (
                      <p className="mt-1 text-xs text-gray-500">
                        {[redemption.utmSource, redemption.utmMedium, redemption.utmCampaign, redemption.utmContent]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    ) : null}
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

function SummaryDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-gray-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
