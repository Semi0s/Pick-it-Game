"use client";

import { useEffect, useState } from "react";
import { fetchAdminPlayers, type AdminPlayer } from "@/lib/admin-data";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { AdminHeader, formatDate } from "@/components/admin/AdminInvitesClient";

export function AdminPlayersClient() {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminPlayers()
      .then(setPlayers)
      .catch((caughtError: Error) => setError(caughtError.message))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <AdminHeader eyebrow="Players" title="View registered players." />
      {error ? <AdminMessage tone="error" message={error} /> : null}
      {isLoading ? <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading players...</p> : null}

      <section className="space-y-3">
        {players.map((player) => (
          <div key={player.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-gray-950">{player.name}</p>
                <p className="truncate text-sm font-semibold text-gray-600">{player.email}</p>
              </div>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold uppercase text-gray-700">
                {player.role}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="font-bold text-gray-500">Joined</dt>
                <dd className="font-semibold text-gray-900">{formatDate(player.createdAt)}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Points</dt>
                <dd className="font-semibold text-gray-900">{player.totalPoints}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-bold text-gray-500">Invite</dt>
                <dd className="font-semibold text-gray-900">
                  {player.acceptedInvite ? "Accepted invite" : "No accepted invite found"}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}
