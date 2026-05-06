"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, CircleHelp, Network, Sparkles, SquareCheckBig, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

type DashboardHeroProps = {
  userId?: string | null;
  name: string;
  ctaLabel: string;
  onPrimaryAction: () => void;
  autoPickLabel: string;
  autoPickLoadingLabel: string;
  isAutoPicking: boolean;
  onAutoPick: () => void;
  dashboardCopy: { hello: string; help: string };
  homeTeamId?: string | null;
};

export function DashboardHero({
  name,
  ctaLabel,
  onPrimaryAction,
  autoPickLabel,
  autoPickLoadingLabel,
  isAutoPicking,
  onAutoPick,
  dashboardCopy,
  homeTeamId,
  userId
}: DashboardHeroProps) {
  const hasEcuadorBackground = homeTeamId === "ecu";
  const disclosureStorageKey = `pickit:dashboard-hero-disclosure:${userId ?? "guest"}`;
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasHydratedDisclosure, setHasHydratedDisclosure] = useState(false);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(disclosureStorageKey);
      if (storedValue) {
        setIsExpanded(storedValue === "open");
      }
    } catch (error) {
      console.warn("Could not restore dashboard hero disclosure state.", error);
    } finally {
      setHasHydratedDisclosure(true);
    }
  }, [disclosureStorageKey]);

  useEffect(() => {
    if (!hasHydratedDisclosure) {
      return;
    }

    try {
      window.localStorage.setItem(disclosureStorageKey, isExpanded ? "open" : "closed");
    } catch (error) {
      console.warn("Could not persist dashboard hero disclosure state.", error);
    }
  }, [disclosureStorageKey, hasHydratedDisclosure, isExpanded]);

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div
        className={`relative px-5 py-4 ${hasEcuadorBackground ? "bg-slate-950 text-white" : "bg-gray-100 text-gray-950"}`}
        style={
          hasEcuadorBackground
            ? {
                backgroundImage:
                  "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.30) 52%, rgba(0,0,0,0.38) 100%), url('/home-team-backgrounds/ecu-background.jpg')",
                backgroundPosition: "center",
                backgroundSize: "cover"
              }
            : undefined
        }
      >
        <div className="relative flex items-start justify-between gap-3">
          <p className={`text-5xl font-black uppercase leading-none tracking-wide sm:text-[3.4rem] ${hasEcuadorBackground ? "text-white" : "text-accent-dark"}`}>
            {dashboardCopy.hello}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/help"
              className={`inline-flex h-14 w-14 items-center justify-center rounded-md transition ${hasEcuadorBackground ? "text-white/90 hover:text-white" : "text-gray-800 hover:text-accent-dark"}`}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-accent-dark shadow-sm">
                <CircleHelp aria-hidden className="h-5 w-5" />
              </span>
            </Link>
          </div>
        </div>
        <div className="relative mt-1">
          <h2 className={`text-xl font-black leading-tight sm:text-2xl ${hasEcuadorBackground ? "text-white" : "text-gray-950"}`}>{name}</h2>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              aria-expanded={isExpanded}
              className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide transition ${
                hasEcuadorBackground ? "text-white/90 hover:text-white" : "text-gray-700 hover:text-accent-dark"
              }`}
            >
              {isExpanded ? <ChevronUp aria-hidden className="h-3 w-3" /> : <ChevronDown aria-hidden className="h-3 w-3" />}
              <span>{isExpanded ? "Less" : "More"}</span>
            </button>
          </div>
        </div>
      </div>
      {isExpanded ? (
        <div className="border-t border-gray-200 px-5 py-4">
          <div className="space-y-2">
          <p className="text-sm leading-6 text-gray-600">
            Predict scores. Earn points. Advance through knockout rounds, side picks, and live group play.{" "}
            <span className="font-bold text-gray-950">Don&apos;t get left on the bench!</span>
          </p>
          <p className="text-sm leading-6 text-gray-600">
            Get your first set of picks in before June 11 and earn a BONUS!
          </p>
        </div>
          <div className="mx-auto mt-5 max-w-xl">
          <div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={onPrimaryAction}
                className="inline-flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-accent bg-accent px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-white transition hover:border-accent-dark hover:bg-accent-dark"
              >
                <SquareCheckBig aria-hidden className="h-5 w-5 shrink-0 text-white" />
                <span className="text-center leading-tight normal-case tracking-normal text-[11px]">{ctaLabel}</span>
              </button>
              <button
                type="button"
                onClick={onAutoPick}
                disabled={isAutoPicking}
                className="inline-flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-3 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Sparkles aria-hidden className="h-5 w-5 shrink-0 text-accent-dark" />
                <span className="text-center leading-tight normal-case tracking-normal text-[11px]">
                  {isAutoPicking ? autoPickLoadingLabel : autoPickLabel}
                </span>
              </button>
              <Link
                href="/knockout"
                className="inline-flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-3 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
              >
                <Network aria-hidden className="h-5 w-5 shrink-0 text-accent-dark" />
                <span className="text-center leading-tight normal-case tracking-normal text-[11px]">My Knockout Picks</span>
              </Link>
              <Link
                href="/trophies"
                className="inline-flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-3 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
              >
                <Trophy aria-hidden className="h-5 w-5 shrink-0 text-accent-dark" />
                <span className="text-center leading-tight normal-case tracking-normal text-[11px]">My Side Picks</span>
              </Link>
            </div>
          </div>
        </div>
        </div>
      ) : null}
    </section>
  );
}
