"use client";

import { useEffect, useState } from "react";
import { fetchAdminPlayerHealthAction, resetUserAccess } from "@/app/admin/actions";
import type { AdminPlayerHealthRow } from "@/lib/admin-player-health";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import { AdminInvitesSection, AdminHeader, formatDate } from "@/components/admin/AdminInvitesClient";

export function AdminPlayersClient() {
  const [players, setPlayers] = useState<AdminPlayerHealthRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sendingResetForUserId, setSendingResetForUserId] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers().finally(() => setIsLoading(false));
  }, []);

  async function loadPlayers() {
    const result = await fetchAdminPlayerHealthAction();
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }

    setPlayers(result.players);
  }

  async function handleResetUserAccess(player: AdminPlayerHealthRow) {
    if (!player.appUserId) {
      setMessage({ tone: "error", text: "This row does not have an app user profile to reset yet." });
      return;
    }

    setSendingResetForUserId(player.appUserId);
    setMessage(null);

    try {
      const result = await resetUserAccess({ userId: player.appUserId, email: player.email });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        await loadPlayers();
      }
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setSendingResetForUserId(null);
    }
  }

  return (
    <div className="space-y-5">
      <AdminHeader eyebrow="Players" title="Manage invites and player access." />
      <AdminInvitesSection showHeader={false} showInviteList={false} />
      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}
      {isLoading ? <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading players...</p> : null}

      {!isLoading ? (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setIsLoading(true);
            loadPlayers().finally(() => setIsLoading(false));
          }}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
        >
          Refresh Auth Status
        </button>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-xl font-black">Player and auth status</h3>
          <p className="mt-1 text-sm font-semibold text-gray-600">
            See and manage all your players here
          </p>
        </div>
        {players.map((player) => (
          <div key={player.key} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-gray-950">{player.displayName}</p>
                <p className="truncate text-sm font-semibold text-gray-600">{player.email}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold uppercase text-gray-700">
                  {player.roleLabel}
                </span>
                <span className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${getHealthBadgeClassName(player.healthBadge)}`}>
                  {formatStateLabel(player.healthBadge)}
                </span>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="font-bold text-gray-500">App</dt>
                <dd className="font-semibold text-gray-900">
                  {formatStateLabel(player.appState)}
                  {player.userStatus ? ` (${player.userStatus})` : ""}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Auth</dt>
                <dd className="font-semibold text-gray-900">{formatStateLabel(player.authState)}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Invite</dt>
                <dd className="font-semibold text-gray-900">{formatStateLabel(player.inviteState)}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Points</dt>
                <dd className="font-semibold text-gray-900">{player.totalPoints}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Created</dt>
                <dd className="font-semibold text-gray-900">{player.createdAt ? formatDate(player.createdAt) : "—"}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Last sign in</dt>
                <dd className="font-semibold text-gray-900">
                  {player.lastSignInAt ? formatDate(player.lastSignInAt) : "Never"}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Email confirmed</dt>
                <dd className="font-semibold text-gray-900">
                  {player.emailConfirmedAt ? formatDate(player.emailConfirmedAt) : "Not yet"}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Invite accepted</dt>
                <dd className="font-semibold text-gray-900">
                  {player.acceptedAt ? formatDate(player.acceptedAt) : "No"}
                </dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Send attempts</dt>
                <dd className="font-semibold text-gray-900">{player.inviteSendAttempts}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-500">Last invite send</dt>
                <dd className="font-semibold text-gray-900">
                  {player.inviteLastSentAt ? formatDate(player.inviteLastSentAt) : "Not sent"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="font-bold text-gray-500">Ids</dt>
                <dd className="space-y-1 text-xs font-semibold text-gray-700">
                  <p>App: {player.appUserId ? truncateId(player.appUserId) : "—"}</p>
                  <p>Auth: {player.authUserId ? truncateId(player.authUserId) : "—"}</p>
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="font-bold text-gray-500">Notes</dt>
                <dd className="space-y-1 text-sm font-semibold text-gray-900">
                  {player.troubleshootingNotes.length > 0 ? (
                    player.troubleshootingNotes.map((note) => <p key={note}>{note}</p>)
                  ) : (
                    <p>No obvious auth or invite mismatch detected.</p>
                  )}
                  {player.inviteLastError ? <p>{player.inviteLastError}</p> : null}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => handleResetUserAccess(player)}
              disabled={sendingResetForUserId === player.appUserId || !player.appUserId}
              className="mt-4 w-full rounded-md border border-gray-300 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
            >
              {sendingResetForUserId === player.appUserId ? "Resetting..." : "Reset User Access"}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function getHealthBadgeClassName(status: AdminPlayerHealthRow["healthBadge"]) {
  if (status === "healthy") {
    return "bg-green-50 text-green-700";
  }

  if (status === "mismatch" || status === "needs_attention") {
    return "bg-red-50 text-red-700";
  }

  return "bg-amber-50 text-amber-700";
}

function formatStateLabel(value: string) {
  return value.replace(/_/g, " ");
}

function truncateId(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
