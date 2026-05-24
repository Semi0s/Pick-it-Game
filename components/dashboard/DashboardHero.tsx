"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { DismissibleHelperText } from "@/components/DismissibleHelperText";
import { LocalizedCardBackground } from "@/components/localized-card/LocalizedCardBackground";
import { getLocalizedCardCssVars, getLocalizedCardTheme } from "@/lib/localized-card-themes";

type DashboardHeroProps = {
  userId?: string | null;
  name: string;
  dashboardCopy: { hello: string; help: string };
  homeTeamId?: string | null;
  preferredLanguage?: string | null;
};

export function DashboardHero({
  name,
  dashboardCopy,
  homeTeamId,
  userId,
  preferredLanguage
}: DashboardHeroProps) {
  const localizedTheme = getLocalizedCardTheme({ homeTeamId, preferredLanguage });
  const localizedCardVars = getLocalizedCardCssVars(localizedTheme);
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
    <section
      className="overflow-hidden rounded-lg border bg-white"
      style={{
        ...localizedCardVars,
        borderColor: "var(--localized-card-border)"
      }}
    >
      <div className="relative overflow-hidden px-5 py-4 text-[color:var(--localized-card-text)]">
        <LocalizedCardBackground theme={localizedTheme} />
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-5xl font-black uppercase leading-none tracking-wide text-[color:var(--localized-card-text)] sm:text-[3.4rem]">
            {dashboardCopy.hello}
          </p>
          <div className="-mr-1 flex shrink-0 items-center">
            <Link
              href="/help"
              className="inline-flex h-12 w-12 items-center justify-center rounded-md text-[color:var(--localized-card-secondary-text)] transition hover:text-[color:var(--localized-card-text)]"
            >
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full shadow-sm"
                style={{
                  backgroundColor: "var(--localized-card-control-surface)",
                  color: "var(--localized-card-control-text)"
                }}
              >
                <span aria-hidden className="text-[1.45rem] font-black leading-none">
                  ?
                </span>
              </span>
            </Link>
          </div>
        </div>
        <div className="relative mt-1">
          <h2 className="text-xl font-black leading-tight text-[color:var(--localized-card-text)] sm:text-2xl">{name}</h2>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              aria-expanded={isExpanded}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--localized-card-secondary-text)] transition hover:text-[color:var(--localized-card-text)]"
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
        </div>
      ) : null}
    </section>
  );
}
