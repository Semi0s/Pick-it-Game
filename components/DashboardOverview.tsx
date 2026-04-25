"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CircleHelp, ListOrdered, Network, Sparkles, Trophy } from "lucide-react";
import { fetchMyGroupsAction } from "@/app/my-groups/actions";
import { AdminStatsSection, AdminToolsSection, AdminMessage } from "@/components/admin/AdminHomeClient";
import { fetchGroupMatchesForPredictions, getLocalGroupMatches } from "@/lib/group-matches";
import { fetchAdminCounts, type AdminCounts } from "@/lib/admin-data";
import { InviteEntryForm, normalizeInviteTokenInput } from "@/components/player-management/Shared";
import { canEditPrediction } from "@/lib/prediction-state";
import { getStoredPredictions } from "@/lib/prediction-store";
import type { MatchWithTeams } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";

export function DashboardOverview() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [groupMatches, setGroupMatches] = useState<MatchWithTeams[]>(() => getLocalGroupMatches());
  const [adminCounts, setAdminCounts] = useState<AdminCounts | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [groupAccess, setGroupAccess] = useState<{ hasAnyGroups: boolean; joinedGroupCount: number } | null>(null);
  const [inviteEntryValue, setInviteEntryValue] = useState("");
  const [inviteEntryError, setInviteEntryError] = useState<string | null>(null);
  const predictions = user ? getStoredPredictions(user.id) : [];

  useEffect(() => {
    let isMounted = true;

    fetchGroupMatchesForPredictions()
      .then((items) => {
        if (isMounted) {
          setGroupMatches(items);
        }
      })
      .catch(() => {
        if (isMounted) {
          setGroupMatches(getLocalGroupMatches());
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setGroupAccess(null);
      return;
    }

    let isMounted = true;
    fetchMyGroupsAction()
      .then((result) => {
        if (!isMounted || !result.ok) {
          return;
        }

        setGroupAccess({
          hasAnyGroups: result.groupAccess.hasAnyGroups,
          joinedGroupCount: result.groupAccess.joinedGroupCount
        });
      })
      .catch(() => {
        if (isMounted) {
          setGroupAccess(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (user?.role !== "admin") {
      return;
    }

    let isMounted = true;
    fetchAdminCounts()
      .then((counts) => {
        if (isMounted) {
          setAdminCounts(counts);
        }
      })
      .catch((error: Error) => {
        if (isMounted) {
          setAdminError(error.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user?.role]);

  const openMatches = groupMatches.filter((match) => canEditPrediction(match.status));
  const completedCount = groupMatches.filter((match) =>
    predictions.some((prediction) => prediction.matchId === match.id)
  ).length;
  const ctaLabel = "Score Picks";

  function handleInviteEntrySubmit() {
    const token = normalizeInviteTokenInput(inviteEntryValue);
    if (!token) {
      setInviteEntryError("Paste a valid invite link or token first.");
      return;
    }

    setInviteEntryError(null);
    router.push(`/my-groups?invite=${encodeURIComponent(token)}`);
  }

  return (
    <div className="space-y-5">
      <section
        className="relative overflow-hidden rounded-lg bg-gray-100 bg-cover bg-center p-5"
        style={{ backgroundImage: "url('/images/pickit-pattern.png')" }}
      >
        <div className="absolute inset-0 bg-gray-100/70" />
        <div className="relative">
          <Link
            href="/help"
            className="absolute right-0 top-0 inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white/90 px-3 py-2 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-accent-dark">
              <CircleHelp aria-hidden className="h-4 w-4" />
            </span>
            Help
          </Link>
          <p className="text-4xl font-black uppercase leading-none tracking-wide text-accent-dark">Hello</p>
          <h2 className="mt-2 text-4xl font-black leading-tight text-gray-950 sm:text-5xl">
            {user?.name ?? "Player"}
          </h2>
          <Link
            href="/groups"
            className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-base font-bold text-white sm:w-auto"
        >
            {ctaLabel}
          </Link>
        </div>
      </section>

      {user?.role === "admin" ? (
        <section className="space-y-3 rounded-lg border border-accent-light bg-accent-light/40 p-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Admin</p>
            <h3 className="mt-1 text-xl font-black text-gray-950">Manage the challenge.</h3>
          </div>
          {adminError ? <AdminMessage tone="error" message={adminError} /> : null}
          <AdminToolsSection />
          <AdminStatsSection counts={adminCounts} />
        </section>
      ) : null}

      {user && groupAccess && !groupAccess.hasAnyGroups ? (
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
              onValueChange={(value) => {
                setInviteEntryValue(value);
                if (inviteEntryError) {
                  setInviteEntryError(null);
                }
              }}
              onSubmit={handleInviteEntrySubmit}
              submitLabel="Open Invite"
              description="Paste a fresh group invite link or token to jump straight back into signup or joining."
            />
          </div>
          {inviteEntryError ? <div className="mt-3"><AdminMessage tone="error" message={inviteEntryError} /></div> : null}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<CalendarDays className="h-5 w-5" />} label="Group matches" value={String(groupMatches.length)} />
        <StatCard icon={<Sparkles className="h-5 w-5" />} label="Picks saved" value={`${completedCount}/${groupMatches.length}`} />
        <StatCard icon={<span className="text-xl leading-none">⚽</span>} label="Editable matches" value={String(openMatches.length)} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <DashboardLinkCard
          href="/leaderboard"
          icon={ListOrdered}
          title="Leaderboard"
          copy="Tap a player to compare group picks."
        />
        <DashboardLinkCard
          href="/knockout"
          icon={Network}
          title="Knockout Stage"
          copy="Bracket picks from the Round of 32 to the Final."
        />
        <DashboardLinkCard
          href="/trophies"
          icon={Trophy}
          title="Additional Trophies"
          copy="Tournament winner, Golden Boot, and MVP picks."
        />
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-lg font-bold">Phase 1 scoring preview</h3>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Group-stage picks score 3 points for the correct outcome, plus 1 more for the exact goal difference,
          or 5 more for the exact score once results are entered.
        </p>
      </section>
    </div>
  );
}

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <span className="inline-flex h-5 w-5 items-center justify-center text-accent-dark">{icon}</span>
      <p className="mt-4 text-2xl font-black">{value}</p>
      <p className="mt-1 text-sm font-semibold text-gray-600">{label}</p>
    </div>
  );
}

type DashboardLinkCardProps = {
  href: string;
  icon: typeof CalendarDays;
  title: string;
  copy: string;
};

function DashboardLinkCard({ href, icon: Icon, title, copy }: DashboardLinkCardProps) {
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
