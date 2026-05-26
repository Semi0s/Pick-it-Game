"use client";

import Link from "next/link";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { InviteEntryForm } from "@/components/player-management/Shared";
import { t } from "@/lib/strings";

type DashboardNoGroupsPanelProps = {
  language?: string | null;
  inviteEntryValue: string;
  inviteEntryError: string | null;
  onInviteEntryChange: (value: string) => void;
  onInviteEntrySubmit: () => void;
};

export function DashboardNoGroupsPanel({
  language,
  inviteEntryValue,
  inviteEntryError,
  onInviteEntryChange,
  onInviteEntrySubmit
}: DashboardNoGroupsPanelProps) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-amber-800">{t(language, "dashboard.groupAccess")}</p>
      <h3 className="mt-1 text-xl font-black text-gray-950">{t(language, "dashboard.noGroupsTitle")}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
        {t(language, "dashboard.noGroupsBody")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/my-groups"
          className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
        >
          {t(language, "dashboard.openMyGroups")}
        </Link>
        <Link
          href="/groups"
          className="inline-flex items-center justify-center rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-dark"
        >
          {t(language, "dashboard.goToScorePicks")}
        </Link>
      </div>
      <div className="mt-4">
        <InviteEntryForm
          language={language}
          value={inviteEntryValue}
          onValueChange={onInviteEntryChange}
          onSubmit={onInviteEntrySubmit}
          submitLabel={t(language, "groups.openInvite")}
          description={t(language, "groups.inviteDescription")}
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
