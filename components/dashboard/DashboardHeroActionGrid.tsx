"use client";

import Link from "next/link";
import { Network, Sparkles, SquareCheckBig, Trophy } from "lucide-react";

export const DASHBOARD_AUTO_PICK_LABEL_COPY = {
  en: "Auto Pick Next Match",
  es: "Auto Elegir Próximo Partido"
} as const;

export const DASHBOARD_AUTO_PICK_LOADING_COPY = {
  en: "Auto Picking...",
  es: "Eligiendo..."
} as const;

export const DASHBOARD_AUTO_PICK_EMPTY_COPY = {
  en: "No open matches available right now.",
  es: "No hay partidos disponibles en este momento."
} as const;

export const DASHBOARD_ACTION_COPY = {
  en: {
    myPicks: "My Picks",
    myNextPick: "My Next Pick",
    myKnockoutPicks: "My Knockout Picks",
    mySidePicks: "My Side Picks"
  },
  es: {
    myPicks: "Mis Picks",
    myNextPick: "Mi Próximo Pick",
    myKnockoutPicks: "Picks Knockout",
    mySidePicks: "Picks Extra"
  }
} as const;

type DashboardHeroActionGridProps = {
  ctaLabel: string;
  onPrimaryAction: () => void;
  autoPickLabel: string;
  autoPickLoadingLabel: string;
  knockoutLabel: string;
  sidePicksLabel: string;
  isAutoPicking: boolean;
  onAutoPick: () => void;
  className?: string;
};

export function DashboardHeroActionGrid({
  ctaLabel,
  onPrimaryAction,
  autoPickLabel,
  autoPickLoadingLabel,
  knockoutLabel,
  sidePicksLabel,
  isAutoPicking,
  onAutoPick,
  className
}: DashboardHeroActionGridProps) {
  return (
    <div className={className ?? ""}>
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
          <span className="text-center leading-tight normal-case tracking-normal text-[11px]">{knockoutLabel}</span>
        </Link>
        <Link
          href="/trophies"
          className="inline-flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-3 text-[10px] font-bold uppercase tracking-wide text-gray-800 transition hover:border-accent hover:bg-accent-light"
        >
          <Trophy aria-hidden className="h-5 w-5 shrink-0 text-accent-dark" />
          <span className="text-center leading-tight normal-case tracking-normal text-[11px]">{sidePicksLabel}</span>
        </Link>
      </div>
    </div>
  );
}
