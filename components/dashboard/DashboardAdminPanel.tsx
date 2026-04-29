"use client";

import { AdminStatsSection, AdminToolsSection, AdminMessage } from "@/components/admin/AdminHomeClient";
import { AdminUpdatesManager } from "@/components/admin/AdminUpdatesManager";
import type { AdminCounts } from "@/lib/admin-data";

type DashboardAdminPanelProps = {
  adminCounts: AdminCounts | null;
  adminError: string | null;
  isSuperAdmin: boolean;
};

export function DashboardAdminPanel({ adminCounts, adminError, isSuperAdmin }: DashboardAdminPanelProps) {
  return (
    <section className="space-y-3 rounded-lg border border-accent-light bg-accent-light/40 p-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Admin</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">Manage the challenge.</h3>
      </div>
      {adminError ? <AdminMessage tone="error" message={adminError} /> : null}
      <AdminToolsSection />
      <AdminStatsSection counts={adminCounts} />
      {isSuperAdmin ? <AdminUpdatesManager /> : null}
    </section>
  );
}
