"use client";

import Link from "next/link";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { InviteEntryForm } from "@/components/player-management/Shared";

type DashboardNoGroupsPanelProps = {
  inviteEntryValue: string;
  inviteEntryError: string | null;
  onInviteEntryChange: (value: string) => void;
  onInviteEntrySubmit: () => void;
};

export function DashboardNoGroupsPanel({
  inviteEntryValue,
  inviteEntryError,
  onInviteEntryChange,
  onInviteEntrySubmit
}: DashboardNoGroupsPanelProps) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-amber-800">Group Access</p>
      <h3 className="mt-1 text-xl font-black text-gray-950">You are not in any groups right now.</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
        Your account and predictions are still here. Ask a manager for a new invite link to join another group, or jump back into scoring while you wait.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/my-groups"
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
        >
          Open My Groups
        </Link>
        <Link
          href="/groups"
          className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-dark"
        >
          Go to Score Picks
        </Link>
      </div>
      <div className="mt-4">
        <InviteEntryForm
          value={inviteEntryValue}
          onValueChange={onInviteEntryChange}
          onSubmit={onInviteEntrySubmit}
          submitLabel="Open Invite"
          description="Paste a fresh group invite link or token to jump straight back into signup or joining."
        />
      </div>
      {inviteEntryError ? (
        <div className="mt-3">
          <AdminMessage tone="error" message={inviteEntryError} />
        </div>
      ) : null}
    </section>
  );
}
