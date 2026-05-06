"use client";

import { FormEvent, useEffect, useState } from "react";
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
import {
  ActionButton,
  ManagementBadge,
  ManagementCard,
  ManagementEmptyState
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
  const [language, setLanguage] = useState<"en" | "es">("en");

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

  async function handleCopy(rawCode: string) {
    try {
      await navigator.clipboard.writeText(rawCode);
      showAppToast({ tone: "success", text: `Copied ${rawCode}.` });
    } catch (error) {
      console.error("Could not copy access code.", error);
      showAppToast({ tone: "error", text: "Could not copy that code right now." });
    }
  }

  return (
    <div className="space-y-5">
      <ManagementCard
        title="Access codes"
        subtitle="Create reusable invite-only signup codes for faster onboarding."
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
                placeholder="TEST2026"
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
            <span className="text-sm font-bold text-gray-800">Assign group</span>
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              <option value="">No automatic group assignment</option>
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
            New signups stay invite-only. Access codes create players, can join one default group, and stop working when inactive, expired, full, or assigned to a full group.
          </p>

          <ActionButton type="submit" disabled={isSubmitting} tone="accent" fullWidth>
            {isSubmitting ? "Creating..." : "Create Access Code"}
          </ActionButton>
        </form>
      </ManagementCard>

      <section className="space-y-3">
        <h3 className="text-xl font-black">Active and recent access codes</h3>
        {isLoading ? <ManagementEmptyState message="Loading access codes..." /> : null}
        {!isLoading && codes.length === 0 ? <ManagementEmptyState message="No access codes yet." /> : null}
        {!isLoading
          ? codes.map((accessCode) => (
              <ManagementCard
                key={accessCode.id}
                title={accessCode.label}
                subtitle={accessCode.code}
                badges={
                  <>
                    <ManagementBadge label={accessCode.active ? "active" : "inactive"} tone={accessCode.active ? "success" : "neutral"} />
                    <ManagementBadge
                      label={
                        accessCode.maxUses != null
                          ? `${accessCode.usedCount}/${accessCode.maxUses} uses`
                          : `${accessCode.usedCount} uses`
                      }
                      tone="warning"
                    />
                    {accessCode.groupName ? <ManagementBadge label={accessCode.groupName} tone="accent" /> : null}
                  </>
                }
              >
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopy(accessCode.code)}
                    className="inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                  >
                    Copy code
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggle(accessCode.id, !accessCode.active)}
                    disabled={activeKey === accessCode.id}
                    className="inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:opacity-60"
                  >
                    {activeKey === accessCode.id
                      ? "Saving..."
                      : accessCode.active
                        ? "Deactivate"
                        : "Activate"}
                  </button>
                </div>

                <div className="mt-3 space-y-1 text-sm font-semibold text-gray-600">
                  {accessCode.notes ? <p>{accessCode.notes}</p> : null}
                  <p>Role: Player</p>
                  <p>Language: {accessCode.defaultLanguage.toUpperCase()}</p>
                  <p>
                    Expires:{" "}
                    {accessCode.expiresAt ? formatDateTimeWithZone(accessCode.expiresAt) : "No expiration"}
                  </p>
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
              </ManagementCard>
            ))
          : null}
      </section>
    </div>
  );
}
