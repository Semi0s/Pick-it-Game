"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createAdminInvite, fetchAdminInvites, type AdminInvite } from "@/lib/admin-data";
import type { UserRole } from "@/lib/types";
import { AdminMessage } from "@/components/admin/AdminHomeClient";

export function AdminInvitesClient() {
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("player");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadInvites();
  }, []);

  async function loadInvites() {
    setIsLoading(true);
    try {
      setInvites(await fetchAdminInvites());
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const result = await createAdminInvite({ email, displayName, role });
      setMessage({ tone: result.created ? "success" : "error", text: result.message });
      if (result.created) {
        setEmail("");
        setDisplayName("");
        setRole("player");
        await loadInvites();
      }
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminHeader eyebrow="Invites" title="Create and track invites." />

      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <label className="block">
          <span className="text-sm font-bold text-gray-800">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-gray-800">Display name</span>
          <input
            required
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-gray-800">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
          >
            <option value="player">Player</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-accent px-4 py-3 text-base font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
        >
          {isSubmitting ? "Creating..." : "Create Invite"}
        </button>
      </form>

      <section className="space-y-3">
        <h3 className="text-xl font-black">All invites</h3>
        {isLoading ? <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading invites...</p> : null}
        {invites.map((invite) => (
          <div key={invite.email} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-gray-950">{invite.displayName}</p>
                <p className="truncate text-sm font-semibold text-gray-600">{invite.email}</p>
              </div>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold uppercase text-gray-700">
                {invite.role}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-600">
              Status: {invite.acceptedAt ? `Accepted ${formatDate(invite.acceptedAt)}` : "Pending"}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

export function AdminHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <section className="rounded-lg bg-gray-100 p-5">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black leading-tight">{title}</h2>
      <Link
        href="/admin"
        className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700"
      >
        Admin Home
      </Link>
    </section>
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
