"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { useAppLanguage } from "@/lib/app-language";
import type { ChampionshipFinaleSummary } from "@/lib/championship-finale-types";
import { formatDateTime, formatNumber, formatRank } from "@/lib/i18n-format";
import { t } from "@/lib/strings";

export function ChampionshipFinaleBanner({
  summary,
  leaderboardHref = "/leaderboard?view=global&phase=global_top10",
  recapHref = "/finale",
  jumpToRankHref
}: {
  summary: ChampionshipFinaleSummary | null | undefined;
  leaderboardHref?: string;
  recapHref?: string;
  jumpToRankHref?: string | null;
}) {
  const { activeLanguage: language } = useAppLanguage();

  if (!summary?.isFinalized) {
    return null;
  }

  const topPercentLabel =
    typeof summary.user.topPercent === "number"
      ? t(language, "finale.topPercent", {
          percent: formatNumber(summary.user.topPercent, language)
        })
      : null;

  return (
    <section
      className={`relative overflow-hidden rounded-[1.35rem] border px-4 py-4 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.4)] sm:px-5 ${
        summary.isFinalized
          ? "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50"
          : "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white"
      }`}
    >
      <div className="absolute right-4 top-4 opacity-15">
        <Trophy className="h-14 w-14 text-amber-500" aria-hidden />
      </div>
      <div className="relative space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-accent-dark">
              {t(language, "finale.title")}
            </p>
            <h2 className="text-lg font-black leading-tight text-gray-950 sm:text-[1.4rem]">
              {t(language, "finale.championshipComplete")}
            </h2>
            <p className="max-w-2xl text-sm font-semibold leading-6 text-gray-600">
              {t(language, "finale.scoresLocked")}
            </p>
          </div>
          {summary.champion ? (
            <div className="rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-gray-700 shadow-sm">
              {t(language, "finale.overallChampion")}: {summary.champion.name}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <StatChip
            label={t(language, "finale.finalRank")}
            value={t(language, "finale.rankOfTotal", {
              rank: formatRank(summary.user.finalRank, language),
              totalPlayers: formatNumber(summary.user.totalPlayers, language)
            })}
          />
          <StatChip
            label={t(language, "finale.finalScore")}
            value={formatNumber(summary.user.finalScore, language)}
          />
          {topPercentLabel ? <StatChip label={t(language, "finale.percentile")} value={topPercentLabel} /> : null}
          {summary.finalizedAt ? (
            <StatChip
              label={t(language, "finale.finalizedOnLabel")}
              value={formatDateTime(summary.finalizedAt, language, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit"
              })}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionLink href={leaderboardHref}>{t(language, "finale.viewLeaderboard")}</ActionLink>
          <ActionLink href={recapHref} tone="secondary">{t(language, "finale.viewRecap")}</ActionLink>
          {jumpToRankHref ? <ActionLink href={jumpToRankHref} tone="secondary">{t(language, "finale.jumpToMyRank")}</ActionLink> : null}
        </div>
      </div>
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/92 px-3 py-2 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}

function ActionLink({
  href,
  tone = "primary",
  children
}: {
  href: string;
  tone?: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-black transition ${
        tone === "primary"
          ? "bg-accent text-accent-text shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] hover:bg-accent-dark"
          : "border border-gray-300 bg-white text-gray-700 hover:border-accent hover:text-accent-dark"
      }`}
    >
      {children}
    </Link>
  );
}
