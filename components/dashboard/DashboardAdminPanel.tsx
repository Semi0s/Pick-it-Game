"use client";

import Link from "next/link";
import { Images, Trophy, UsersRound } from "lucide-react";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import type { AdminCounts } from "@/lib/admin-data";

type DashboardAdminPanelProps = {
  adminCounts: AdminCounts | null;
  adminError: string | null;
  isSuperAdmin: boolean;
};

export function DashboardAdminPanel({ adminError }: DashboardAdminPanelProps) {
  return (
    <section className="space-y-3 rounded-lg border border-accent-light bg-accent-light/40 p-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Admin</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">Manage the challenge.</h3>
      </div>
      {adminError ? <AdminMessage tone="error" message={adminError} /> : null}
      <div className="grid grid-cols-2 gap-2">
        <DashboardAdminButton href="/admin/players" icon={UsersRound} label="Players" />
        <DashboardAdminButton href="/admin/matches" icon={Trophy} label="Matches" />
        <DashboardAdminButton href="/admin/media" icon={Images} label="Media" />
      </div>
    </section>
  );
}

function DashboardAdminButton({
  href,
  icon: Icon,
  label
}: {
  href: string;
  icon: typeof Trophy;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-gray-200 bg-white px-3 py-3 text-sm font-black text-gray-950 transition hover:border-accent hover:bg-accent-light"
    >
      <Icon aria-hidden className="h-4.5 w-4.5 text-accent-dark" />
      <span>{label}</span>
    </Link>
  );
}
