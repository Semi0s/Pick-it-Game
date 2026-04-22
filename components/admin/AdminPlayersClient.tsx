"use client";

import { useEffect, useState } from "react";
import { sendAdminPasswordResetAction } from "@/app/admin/actions";
import { fetchAdminPlayers, type AdminPlayer } from "@/lib/admin-data";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { AdminHeader, formatDate } from "@/components/admin/AdminInvitesClient";

export function AdminPlayersClient() {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sendingResetForUserId, setSendingResetForUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminPlayers()
      .then(setPlayers)
      .catch((caughtError: Error) => setMessage({ tone: "error", text: caughtError.message }))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSendPasswordReset(player: AdminPlayer) {
    setSendingResetForUserId(player.id);
    setMessage(null);

    try {
      const result = await sendAdminPasswordResetAction({ userId: player.id });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setSendingResetForUserId(null);
    }
  }

  return (
    <div className="space-y-5">
      <AdminHeader eyebrow="Players" title="View registered players." />
      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}
      {isLoading ? <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading players...</p> : null}

      <section className="space-y-3">
        {players.map((player) => (
          <div key={player.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-gray-950">{player.name}</p>
                <p className="truncate text-sm font-semibold text-gray-600">{player.email}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold uppercase text-gray-700">
                  {player.role}
                </span>
                <span className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${getUserStatusClassName(player.status)}`}>
                  {player.status}
                </span>
              </div>
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
            <button
              type="button"
              onClick={() => handleSendPasswordReset(player)}
              disabled={sendingResetForUserId === player.id}
              className="mt-4 w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {sendingResetForUserId === player.id ? "Sending..." : "Send password reset"}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function getUserStatusClassName(status: AdminPlayer["status"]) {
  if (status === "active") {
    return "bg-green-50 text-green-700";
  }

  if (status === "suspended") {
    return "bg-red-50 text-red-700";
  }

  return "bg-gray-100 text-gray-700";
}
