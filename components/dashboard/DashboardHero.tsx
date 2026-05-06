"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import { DismissibleHelperText } from "@/components/DismissibleHelperText";
import { DashboardHeroActionGrid } from "@/components/dashboard/DashboardHeroActionGrid";

type DashboardHeroProps = {
  userId?: string | null;
  name: string;
  ctaLabel: string;
  onPrimaryAction: () => void;
  autoPickLabel: string;
  autoPickLoadingLabel: string;
  knockoutLabel: string;
  sidePicksLabel: string;
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
  knockoutLabel,
  sidePicksLabel,
  isAutoPicking,
  onAutoPick,
  dashboardCopy,
  homeTeamId,
  userId
}: DashboardHeroProps) {
  const hasEcuadorBackground = homeTeamId === "ecu";
  const disclosureStorageKey = `pickit:dashboard-hero-disclosure:${userId ?? "guest"}`;
  const helperTextStorageKey = `pickit:tip:dashboard-hero-intro:${userId ?? "guest"}`;
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
          <div className="-mr-1 flex shrink-0 items-center">
            <Link
              href="/help"
              className={`inline-flex h-12 w-12 items-center justify-center rounded-md transition ${hasEcuadorBackground ? "text-white/90 hover:text-white" : "text-gray-800 hover:text-accent-dark"}`}
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
          <DismissibleHelperText storageKey={helperTextStorageKey} dismissLabel="Hide dashboard tip">
            <div className="space-y-2">
              <p>
                Predict scores. Earn points. Advance through knockout rounds, side picks, and live group play.{" "}
                <span className="font-bold text-gray-950">Don&apos;t get left on the bench!</span>
              </p>
              <p>Get your first set of picks in before June 11 and earn a BONUS!</p>
            </div>
          </DismissibleHelperText>
          <div className="mx-auto mt-5 max-w-xl">
            <DashboardHeroActionGrid
              ctaLabel={ctaLabel}
              onPrimaryAction={onPrimaryAction}
              autoPickLabel={autoPickLabel}
              autoPickLoadingLabel={autoPickLoadingLabel}
              knockoutLabel={knockoutLabel}
              sidePicksLabel={sidePicksLabel}
              isAutoPicking={isAutoPicking}
              onAutoPick={onAutoPick}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
