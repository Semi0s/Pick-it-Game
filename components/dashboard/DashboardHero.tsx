"use client";

import Link from "next/link";
import { CircleHelp, SquareCheckBig } from "lucide-react";

type DashboardHeroProps = {
  name: string;
  ctaHref: string;
  ctaLabel: string;
  dashboardCopy: { hello: string; help: string };
};

export function DashboardHero({
  name,
  ctaHref,
  ctaLabel,
  dashboardCopy
}: DashboardHeroProps) {
  return (
    <section className="rounded-lg bg-gray-100 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-4xl font-black uppercase leading-none tracking-wide text-accent-dark">{dashboardCopy.hello}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/help"
            className="inline-flex h-10 items-center gap-2 px-2 py-2 text-sm font-bold text-gray-800 transition hover:text-accent-dark"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-accent-dark">
              <CircleHelp aria-hidden className="h-4 w-4" />
            </span>
            {dashboardCopy.help}
          </Link>
        </div>
      </div>
      <div className="mt-2">
        <h2 className="mt-2 text-xl font-black leading-tight text-gray-950 sm:text-2xl">{name}</h2>
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-6 text-gray-600">
            Pick the match scores and earn points the more accurate you predict them.
          </p>
          <p className="text-sm leading-6 text-gray-600">
            Don&apos;t get left on the bench! Get your first set of picks in before June 11.
          </p>
        </div>
        <div className="mt-5 mx-auto max-w-xl">
          <Link
            href={ctaHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark"
          >
            <SquareCheckBig aria-hidden className="h-4 w-4 shrink-0 text-white" />
            {ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
