"use client";

import Link from "next/link";
import { Trophy, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAdminCounts, type AdminCounts } from "@/lib/admin-data";

export function AdminHomeClient() {
  const [counts, setCounts] = useState<AdminCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminCounts()
      .then(setCounts)
      .catch((caughtError: Error) => setError(caughtError.message));
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Admin</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Manage the pool.</h2>
      </section>

      {error ? <AdminMessage tone="error" message={error} /> : null}

      <AdminToolsSection />
      <AdminStatsSection counts={counts} />
    </div>
  );
}

type AdminCardProps = {
  href: string;
  icon: typeof Trophy;
  title: string;
  copy: string;
};

export function AdminToolsSection() {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <AdminCard href="/admin/players" icon={UsersRound} title="Players" copy="Manage invites and review auth state." />
      <AdminCard href="/admin/matches" icon={Trophy} title="Matches" copy="Enter scores and winners." />
    </section>
  );
}

function AdminCard({ href, icon: Icon, title, copy }: AdminCardProps) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-accent hover:bg-accent-light"
    >
      <Icon aria-hidden className="h-5 w-5 text-accent-dark" />
      <h3 className="mt-4 text-lg font-black">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600">{copy}</p>
    </Link>
  );
}

export function AdminStatsSection({ counts }: { counts: AdminCounts | null }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <Stat label="Pending invites" value={counts ? String(counts.pendingInvites) : "-"} />
      <Stat label="Accepted invites" value={counts ? String(counts.acceptedInvites) : "-"} />
      <Stat label="Total players" value={counts ? String(counts.totalPlayers) : "-"} />
      <Stat
        label="Matches by status"
        value={
          counts
            ? `${counts.matchesByStatus.scheduled} open / ${counts.matchesByStatus.locked} locked / ${counts.matchesByStatus.final} final`
            : "-"
        }
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-bold text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-gray-950">{value}</p>
    </div>
  );
}

export function AdminMessage({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <p
      className={`rounded-md border px-3 py-2 text-sm font-semibold ${
        tone === "success"
          ? "border-accent-light bg-accent-light text-accent-dark"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {message}
    </p>
  );
}
