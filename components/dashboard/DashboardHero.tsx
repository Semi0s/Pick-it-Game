"use client";

import Link from "next/link";
import { CircleHelp, Network, Sparkles, SquareCheckBig, Trophy } from "lucide-react";

type DashboardHeroProps = {
  name: string;
  ctaHref: string;
  ctaLabel: string;
  autoPickLabel: string;
  autoPickLoadingLabel: string;
  isAutoPicking: boolean;
  onAutoPick: () => void;
  dashboardCopy: { hello: string; help: string };
};

export function DashboardHero({
  name,
  ctaHref,
  ctaLabel,
  autoPickLabel,
  autoPickLoadingLabel,
  isAutoPicking,
  onAutoPick,
  dashboardCopy
}: DashboardHeroProps) {
  return (
    <section className="rounded-lg bg-gray-100 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-4xl font-black uppercase leading-none tracking-wide text-accent-dark">{dashboardCopy.hello}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/help"
            className="inline-flex h-14 w-14 items-center justify-center rounded-md text-gray-800 transition hover:text-accent-dark"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-accent-dark">
              <CircleHelp aria-hidden className="h-5 w-5" />
            </span>
          </Link>
        </div>
      </div>
      <div className="mt-2">
        <h2 className="mt-2 text-xl font-black leading-tight text-gray-950 sm:text-2xl">{name}</h2>
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-6 text-gray-600">
            Predict scores. Earn points. Advance through knockout rounds, side picks, and live group play.
          </p>
          <p className="text-sm leading-6 text-gray-600">
            <span className="font-bold text-gray-950">Don&apos;t get left on the bench!</span>
            <br />
            Get your first set of picks in before June 11 and earn a BONUS!
          </p>
        </div>
        <div className="mx-auto mt-5 max-w-xl">
          <div className="space-y-2">
            <Link
              href={ctaHref}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-3 text-sm font-bold text-white transition hover:border-accent-dark hover:bg-accent-dark"
            >
              <SquareCheckBig aria-hidden className="h-4 w-4 shrink-0 text-white" />
              {ctaLabel}
            </Link>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onAutoPick}
                disabled={isAutoPicking}
                className="inline-flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-accent-dark" />
                <span className="text-center leading-tight normal-case tracking-normal text-[11px]">
                  {isAutoPicking ? autoPickLoadingLabel : autoPickLabel}
                </span>
              </button>
              <Link
                href="/knockout"
                className="inline-flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
              >
                <Network aria-hidden className="h-4 w-4 shrink-0 text-accent-dark" />
                <span className="text-center leading-tight normal-case tracking-normal text-[11px]">My Knockout Picks</span>
              </Link>
              <Link
                href="/trophies"
                className="inline-flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
              >
                <Trophy aria-hidden className="h-4 w-4 shrink-0 text-accent-dark" />
                <span className="text-center leading-tight normal-case tracking-normal text-[11px]">My Side Picks</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
