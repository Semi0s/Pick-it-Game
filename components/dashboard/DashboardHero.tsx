"use client";

import Link from "next/link";
import { LocalizedCardBackground } from "@/components/localized-card/LocalizedCardBackground";
import { getLocalizedCardCssVars, getLocalizedCardThemeForUserSurface } from "@/lib/localized-card-themes";

type DashboardHeroProps = {
  userId?: string | null;
  name: string;
  compactSummary?: string;
  dashboardCopy: { hello: string; help: string };
  visualThemeId?: string | null;
  homeTeamId?: string | null;
  preferredLanguage?: string | null;
};

export function DashboardHero({
  compactSummary,
  dashboardCopy,
  name,
  visualThemeId,
  homeTeamId,
  preferredLanguage
}: DashboardHeroProps) {
  const localizedTheme = getLocalizedCardThemeForUserSurface({ visualThemeId, homeTeamId, preferredLanguage });
  const localizedCardVars = getLocalizedCardCssVars(localizedTheme);

  return (
    <section
      className="dashboard-top-card overflow-hidden rounded-lg bg-white"
      style={{
        ...localizedCardVars,
        borderColor: "var(--localized-card-border)"
      }}
    >
      <div className="dashboard-top-card-inner relative overflow-hidden px-5 py-4 text-[color:var(--localized-card-text)]">
        <LocalizedCardBackground theme={localizedTheme} />
        <div className="relative flex items-start justify-between gap-3">
          <p className="dashboard-top-card-large-copy text-[1.9rem] font-black uppercase leading-none tracking-[0.08em] text-[color:var(--localized-card-text)] sm:text-[2.35rem]">
            {dashboardCopy.hello}
          </p>
          <p className="dashboard-top-card-compact-summary hidden min-w-0 truncate text-[0.82rem] font-black uppercase leading-none tracking-[0.06em] text-[color:var(--localized-card-text)]">
            {compactSummary ?? name}
          </p>
          <div className="dashboard-top-card-action -mr-1 flex shrink-0 items-center">
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
        <div className="relative -mt-1.5">
          <h2 className="dashboard-top-card-name text-xl font-black leading-none text-[color:var(--localized-card-text)] sm:text-2xl">{name}</h2>
        </div>
      </div>
    </section>
  );
}
