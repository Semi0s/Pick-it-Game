"use client";

import Link from "next/link";
import { CalendarDays, ListOrdered, LockKeyhole, Network, Sparkles, Trophy } from "lucide-react";
import { getGroupMatches } from "@/lib/mock-data";
import { getStoredPredictions } from "@/lib/prediction-store";
import { isPredictionLocked } from "@/lib/scoring";
import { useCurrentUser } from "@/lib/use-current-user";

export function DashboardOverview() {
  const { user } = useCurrentUser();
  const groupMatches = getGroupMatches();
  const predictions = user ? getStoredPredictions(user.id) : [];
  const openMatches = groupMatches.filter((match) => !isPredictionLocked(match));
  const completedCount = groupMatches.filter((match) =>
    predictions.some((prediction) => prediction.matchId === match.id)
  ).length;
  const ctaLabel = completedCount > 0 ? "Continue Group Picks" : "Start Group Picks";

  return (
    <div className="space-y-5">
      <section
        className="relative overflow-hidden rounded-lg bg-gray-100 bg-cover bg-center p-5"
        style={{ backgroundImage: "url('/images/pickit-pattern.png')" }}
      >
        <div className="absolute inset-0 bg-gray-100/70" />
        <div className="relative">
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

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={CalendarDays} label="Group matches" value={String(groupMatches.length)} />
        <StatCard icon={Sparkles} label="Picks saved" value={`${completedCount}/${groupMatches.length}`} />
        <StatCard icon={LockKeyhole} label="Still open" value={String(openMatches.length)} />
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
          Group-stage picks will score 3 points for the correct outcome, plus 5 more for an exact score once
          result entry arrives in Phase 2.
        </p>
      </section>
    </div>
  );
}

type StatCardProps = {
  icon: typeof CalendarDays;
  label: string;
  value: string;
};

function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <Icon aria-hidden className="h-5 w-5 text-accent-dark" />
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
