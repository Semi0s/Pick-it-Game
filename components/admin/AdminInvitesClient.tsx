"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createAdminInviteAction } from "@/app/admin/actions";
import { fetchInviteAutocompleteAction, type InviteAutocompleteOption } from "@/app/invites/actions";
import { fetchAdminInvites, type AdminInvite } from "@/lib/admin-data";
import { getRoleBadgeLabel } from "@/lib/access-levels";
import { formatDateOnly, formatDateTimeWithZone } from "@/lib/date-time";
import { normalizeLanguage, type SupportedLanguage } from "@/lib/i18n";
import { showAppToast } from "@/lib/app-toast";
import type { UserRole } from "@/lib/types";
import { AdminMessage } from "@/components/admin/AdminHomeClient";
import {
  ActionButton,
  ManagementBadge,
  ManagementCard,
  ManagementEmptyState
} from "@/components/player-management/Shared";
import { useCurrentUser } from "@/lib/use-current-user";

type InviteAccessLevel = "player" | "manager" | "super_admin";

export function AdminInvitesClient() {
  return <AdminInvitesSection />;
}

export function AdminInvitesSection({
  showHeader = true,
  showInviteList = true
}: {
  showHeader?: boolean;
  showInviteList?: boolean;
}) {
  const { user } = useCurrentUser();
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [email, setEmail] = useState("");
  const [accessLevel, setAccessLevel] = useState<InviteAccessLevel>("player");
  const [inviteLanguage, setInviteLanguage] = useState<SupportedLanguage>("en");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [emailSuggestions, setEmailSuggestions] = useState<InviteAutocompleteOption[]>([]);
  const canInviteSuperAdmin = user?.role === "admin";
  const canInviteManager = user?.role === "admin";
  const accessLevelOptions: Array<{ value: InviteAccessLevel; label: string }> = [
    { value: "player", label: "Player" },
    ...(canInviteManager ? [{ value: "manager" as const, label: "Manager" }] : []),
    ...(canInviteSuperAdmin ? [{ value: "super_admin" as const, label: "Super Admin" }] : [])
  ];

  useEffect(() => {
    loadInvites();
  }, []);

  useEffect(() => {
    if (message) {
      showAppToast(message);
    }
  }, [message]);

  useEffect(() => {
    if (user?.preferredLanguage) {
      setInviteLanguage((current) => (current === "en" ? normalizeLanguage(user.preferredLanguage) : current));
    }
  }, [user?.preferredLanguage]);

  useEffect(() => {
    let isActive = true;

    async function loadSuggestions() {
      const normalized = email.trim().toLowerCase();
      if (normalized.length < 2) {
        if (isActive) {
          setEmailSuggestions([]);
        }
        return;
      }

      const results = await fetchInviteAutocompleteAction(normalized);
      if (isActive) {
        setEmailSuggestions(results);
      }
    }

    void loadSuggestions();

    return () => {
      isActive = false;
    };
  }, [email]);

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
      const inviteRole: UserRole = accessLevel === "super_admin" ? "admin" : "player";
      const result = await createAdminInviteAction({ email, role: inviteRole, language: inviteLanguage });
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setEmail("");
        setAccessLevel("player");
        setInviteLanguage(normalizeLanguage(user?.preferredLanguage));
        await loadInvites();
        if (accessLevel === "manager") {
          setMessage({
            tone: "success",
            text: "Invite sent. This user will join as a player first, then you can appoint manager access after activation."
          });
        }
      }
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {showHeader ? <AdminHeader eyebrow="Invites" title="Create and track invites." /> : null}

      {message ? <AdminMessage tone={message.tone} message={message.text} /> : null}

      <ManagementCard
        title="Invite access level"
        subtitle="Use the same role hierarchy the rest of the management system uses."
        badges={
          <>
            <ManagementBadge label="Player" tone="neutral" />
            <ManagementBadge label="Manager" tone="warning" />
            <ManagementBadge label="Super Admin" tone="accent" />
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold text-gray-700">
            <p>Hierarchy:</p>
            <p className="mt-1">Player {"->"} Manager {"->"} Super Admin</p>
            <p className="mt-2 text-gray-600">
              Invite as <span className="font-black text-gray-900">Player</span> for normal access or as <span className="font-black text-gray-900">Super Admin</span> for unlimited access. <span className="font-black text-gray-900">Managers</span> are appointed after activation by setting manager limits.
            </p>
          </div>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            />
            {emailSuggestions.length > 0 ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-semibold text-gray-500">Suggestions include existing players and previous app invites.</p>
                <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                  {emailSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.email}
                      type="button"
                      onClick={() => setEmail(suggestion.email)}
                      className="block w-full rounded-md bg-white px-3 py-2 text-left text-sm font-semibold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Access level</span>
            <select
              value={accessLevel}
              onChange={(event) => setAccessLevel(event.target.value as InviteAccessLevel)}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              {accessLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-gray-800">Invite language</span>
            <select
              value={inviteLanguage}
              onChange={(event) => setInviteLanguage(normalizeLanguage(event.target.value))}
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
            </select>
            <p className="mt-2 text-xs font-semibold text-gray-500">
              Choose the language your invitee will see during signup.
            </p>
          </label>
          <p className="text-sm font-semibold text-gray-500">
            {accessLevel === "player"
              ? "Player keeps the standard gameplay experience."
              : accessLevel === "manager"
                ? "Manager starts as a player, then gains manager access when a super admin assigns manager limits."
                : "Super Admin gives this user unlimited administrative access."}
          </p>
          <p className="text-xs font-semibold text-gray-500">
            This language will be used for the invitation email and first signup experience.
          </p>
          {accessLevel === "manager" ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Managers are invited in as players first, then promoted by assigning manager limits after they activate.
            </p>
          ) : null}
          {accessLevel === "super_admin" ? (
            <p className="rounded-md border border-accent-light bg-accent-light px-3 py-2 text-sm font-semibold text-accent-dark">
              Super Admin gives this user unlimited administrative access.
            </p>
          ) : null}
          <ActionButton type="submit" disabled={isSubmitting} tone="accent" fullWidth>
            {isSubmitting ? "Sending..." : "Send Access Email"}
          </ActionButton>
        </form>
      </ManagementCard>

      {showInviteList ? (
        <section className="space-y-3">
          <h3 className="text-xl font-black">All invites</h3>
          {isLoading ? <ManagementEmptyState message="Loading invites..." /> : null}
          {!isLoading && invites.length === 0 ? <ManagementEmptyState message="No invites yet." /> : null}
          {invites.map((invite) => (
            <ManagementCard
              key={invite.email}
              title={invite.displayName}
              subtitle={invite.email}
              badges={
                <>
                  <ManagementBadge label={getRoleBadgeLabel(invite.role)} tone={invite.role === "admin" ? "accent" : "neutral"} />
                  <ManagementBadge label={formatInviteStatus(invite.status)} tone={getInviteStatusTone(invite.status)} />
                </>
              }
            >
              <div className="mt-3 flex items-center justify-between gap-3">
                {invite.lastSentAt ? (
                  <p className="text-xs font-semibold text-gray-500">Last sent {formatDateTime(invite.lastSentAt)}</p>
                ) : null}
              </div>
              <p className="mt-3 text-sm font-semibold text-gray-600">
                Status: {invite.status === "accepted" && invite.acceptedAt ? `Accepted ${formatDate(invite.acceptedAt)}` : formatInviteStatus(invite.status)}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-600">Send attempts: {invite.sendAttempts}</p>
              {invite.lastError ? (
                <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {invite.lastError}
                </p>
              ) : null}
            </ManagementCard>
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function AdminHeader({
  eyebrow,
  title,
  backHref = "/dashboard",
  backLabel = "Dashboard"
}: {
  eyebrow: string;
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <section className="rounded-lg bg-gray-100 p-5">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black leading-tight">{title}</h2>
      <Link
        href={backHref}
        className="mt-4 inline-flex rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700"
      >
        {backLabel}
      </Link>
    </section>
  );
}

export function formatDate(value: string) {
  return formatDateOnly(value);
}

function formatDateTime(value: string) {
  return formatDateTimeWithZone(value, { includeYear: true });
}

function formatInviteStatus(status: AdminInvite["status"]) {
  return status.replace("_", " ");
}

function getInviteStatusTone(status: AdminInvite["status"]) {
  if (status === "accepted") {
    return "success";
  }

  if (status === "failed" || status === "revoked" || status === "expired") {
    return "danger";
  }

  return "neutral";
}
