"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Trophy, Medal, Share2, Printer, Sparkles } from "lucide-react";
import { useAppLanguage } from "@/lib/app-language";
import type {
  ChampionshipFinaleRoundKey,
  ChampionshipFinaleSummary
} from "@/lib/championship-finale-types";
import { formatDateTime, formatNumber, formatRank } from "@/lib/i18n-format";
import { t } from "@/lib/strings";

export function FinaleRecapClient({ summary }: { summary: ChampionshipFinaleSummary }) {
  const { activeLanguage: language } = useAppLanguage();
  const [shareFeedback, setShareFeedback] = useState<"idle" | "copied" | "error">("idle");
  const primaryBadge = summary.user.badges[0] ?? "survivor";
  const shareText = useMemo(() => buildShareText(summary, language), [summary, language]);
  const shouldCelebrateBigWin = primaryBadge === "champion" || primaryBadge === "poolWinner";

  async function handleShare() {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "/finale";

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: t(language, "finale.shareResult"),
          text: shareText,
          url: shareUrl
        });
        setShareFeedback("idle");
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        setShareFeedback("copied");
        return;
      }

      setShareFeedback("error");
    } catch {
      setShareFeedback("error");
    }
  }

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.22),_transparent_55%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_62%)] px-4 py-6 print:bg-white print:px-0">
      <div className="mx-auto max-w-4xl space-y-5 print:max-w-none print:space-y-3">
        <header className="print:hidden">
          <Link href="/dashboard" className="inline-flex rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-black text-gray-700">
            {t(language, "common.back")}
          </Link>
        </header>

        <section className="relative overflow-hidden rounded-[1.6rem] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 px-5 py-6 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.35)] print:shadow-none">
          {shouldCelebrateBigWin ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 hidden justify-center gap-3 motion-safe:flex print:hidden">
              <span className="text-xl motion-safe:animate-bounce">🎉</span>
              <span className="text-xl motion-safe:animate-pulse">✨</span>
              <span className="text-xl motion-safe:animate-bounce">🏆</span>
            </div>
          ) : null}
          <div className="relative space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-accent-dark">
                  {t(language, "finale.finalRecapTitle")}
                </p>
                <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
                  {t(language, "finale.yourStoryReady")}
                </h1>
                <p className="max-w-2xl text-base font-semibold leading-7 text-gray-600">
                  {t(language, "finale.youFinished", {
                    rank: formatNumber(summary.user.finalRank, language),
                    totalPlayers: formatNumber(summary.user.totalPlayers, language)
                  })}
                </p>
                <p className="text-sm font-semibold text-gray-500">
                  {t(language, "finale.youBeatPlayers", { count: summary.user.playersBeaten })}
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-[1.2rem] border border-white/90 bg-white/92 px-4 py-3 shadow-sm print:border-gray-200 print:shadow-none">
                <div
                  className={`rounded-full p-3 ${
                    shouldCelebrateBigWin
                      ? "bg-amber-100 text-amber-700 motion-safe:animate-bounce"
                      : "bg-accent-light text-accent-dark motion-safe:animate-pulse"
                  }`}
                >
                  {shouldCelebrateBigWin ? <Trophy className="h-6 w-6" aria-hidden /> : <Medal className="h-6 w-6" aria-hidden />}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">{t(language, "finale.badgeEarned")}</p>
                  <p className="mt-1 text-lg font-black text-gray-950">{t(language, `badges.${primaryBadge}`)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RecapStat label={t(language, "finale.finalRank")} value={formatRank(summary.user.finalRank, language)} />
              <RecapStat label={t(language, "finale.finalScore")} value={formatNumber(summary.user.finalScore, language)} />
              <RecapStat
                label={t(language, "finale.playersBeaten")}
                value={formatNumber(summary.user.playersBeaten, language)}
              />
              <RecapStat
                label={t(language, "finale.percentile")}
                value={
                  typeof summary.user.topPercent === "number"
                    ? t(language, "finale.topPercent", {
                        percent: formatNumber(summary.user.topPercent, language)
                      })
                    : "—"
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
              <section className="rounded-[1.4rem] border border-white/80 bg-white/90 p-4 shadow-sm print:border-gray-200 print:shadow-none">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-gray-500">
                    {t(language, "finale.recapsHeadline")}
                  </p>
                </div>
                <div className="mt-4 space-y-3 text-sm font-semibold text-gray-700">
                  <p>{t(language, "finale.notBadChaos")}</p>
                  {summary.user.bestGroupRank && summary.user.bestGroupName ? (
                    <p>
                      {t(language, "finale.groupRankLine", {
                        groupName: summary.user.bestGroupName,
                        rank: formatRank(summary.user.bestGroupRank, language),
                        totalPlayers: summary.user.bestGroupTotalPlayers
                          ? formatNumber(summary.user.bestGroupTotalPlayers, language)
                          : "—"
                      })}
                    </p>
                  ) : null}
                  {summary.user.bestRound ? (
                    <p>
                      {t(language, "finale.bestRoundLine", {
                        round: getRoundLabel(summary.user.bestRound.key, language),
                        points: formatNumber(summary.user.bestRound.points, language)
                      })}
                    </p>
                  ) : null}
                  {summary.user.biggestPick ? (
                    <p>
                      {t(language, "finale.biggestPickLine", {
                        match: summary.user.biggestPick.label,
                        points: formatNumber(summary.user.biggestPick.points, language)
                      })}
                    </p>
                  ) : null}
                  <p>
                    {t(language, "finale.overallChampionLine", {
                      champion: summary.champion?.name ?? "—"
                    })}
                  </p>
                  {summary.finalizedAt ? (
                    <p>
                      {t(language, "finale.finalizedOn", {
                        timestamp: formatDateTime(summary.finalizedAt, language, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit"
                        })
                      })}
                    </p>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {summary.user.badges.map((badge) => (
                    <span key={badge} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-amber-900">
                      {t(language, `badges.${badge}`)}
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.4rem] border border-white/80 bg-slate-950 p-4 text-white shadow-sm print:border-gray-200 print:bg-white print:text-gray-950 print:shadow-none">
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-300 print:text-gray-500">
                  {t(language, "finale.shareCardTitle")}
                </p>
                <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/5 p-4 print:border-gray-200 print:bg-white">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-300 print:text-gray-500">
                    {t(language, "finale.branding")}
                  </p>
                  <p className="mt-3 text-2xl font-black">{formatRank(summary.user.finalRank, language)}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-200 print:text-gray-700">
                    {t(language, "finale.youBeatPlayers", { count: summary.user.playersBeaten })}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-200 print:text-gray-700">
                    {t(language, "finale.finalScoreLine", {
                      score: formatNumber(summary.user.finalScore, language)
                    })}
                  </p>
                  <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-amber-300 print:text-amber-700">
                    {t(language, `badges.${primaryBadge}`)}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 print:hidden">
                  <ActionButton onClick={handleShare} icon={<Share2 className="h-4 w-4" aria-hidden />}>
                    {t(language, "finale.shareResult")}
                  </ActionButton>
                  <ActionButton
                    onClick={handlePrint}
                    tone="secondary"
                    icon={<Printer className="h-4 w-4" aria-hidden />}
                  >
                    {t(language, "finale.printRecap")}
                  </ActionButton>
                  <Link
                    href="/leaderboard?view=global&phase=global_top10"
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-black text-white transition hover:border-white/40 print:hidden"
                  >
                    {t(language, "finale.viewLeaderboard")}
                  </Link>
                </div>
                {shareFeedback !== "idle" ? (
                  <p className="mt-3 text-sm font-semibold text-slate-200 print:hidden">
                    {shareFeedback === "copied" ? t(language, "finale.linkCopied") : t(language, "finale.shareUnavailable")}
                  </p>
                ) : null}
              </section>
            </div>
          </div>
        </section>

        <section className="rounded-[1.4rem] border border-gray-200 bg-white px-5 py-4 print:border-none print:px-0">
          <p className="text-sm font-semibold text-gray-600">{t(language, "finale.thanksForPlaying")}</p>
        </section>
      </div>
    </main>
  );
}

function RecapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/80 bg-white/92 px-4 py-3 shadow-sm print:border-gray-200 print:shadow-none">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-gray-950">{value}</p>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  tone = "primary",
  children
}: {
  onClick: () => void | Promise<void>;
  icon: ReactNode;
  tone?: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${
        tone === "primary"
          ? "bg-accent text-accent-text shadow-[0_10px_24px_-18px_rgba(15,23,42,0.4)] hover:bg-accent-dark"
          : "border border-white/20 text-white hover:border-white/40 print:border-gray-300 print:text-gray-900"
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function getRoundLabel(round: ChampionshipFinaleRoundKey, language: string) {
  switch (round) {
    case "roundOf32":
      return t(language, "bracket.roundOf32");
    case "roundOf16":
      return t(language, "bracket.roundOf16");
    case "quarterfinals":
      return t(language, "bracket.quarterfinals");
    case "semifinals":
      return t(language, "bracket.semifinals");
    case "thirdPlaceMatch":
      return t(language, "finale.thirdPlaceMatchLabel");
    case "finalAndChampion":
      return t(language, "bracket.finalAndChampion");
    default:
      return "";
  }
}

function buildShareText(summary: ChampionshipFinaleSummary, language: string) {
  if (summary.user.finalRank === 1) {
    return t(language, "finale.shareChampion", {
      totalPlayers: formatNumber(summary.user.totalPlayers, language)
    });
  }

  if (summary.user.bestGroupRank === 1) {
    return t(language, "finale.sharePoolWinner");
  }

  if (typeof summary.user.topPercent === "number") {
    return t(language, "finale.shareTopPercent", {
      percent: formatNumber(summary.user.topPercent, language)
    });
  }

  return t(language, "finale.shareBeatBrackets", {
    count: summary.user.playersBeaten,
    rank: formatNumber(summary.user.finalRank, language),
    totalPlayers: formatNumber(summary.user.totalPlayers, language)
  });
}
