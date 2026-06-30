"use client";

import Link from "next/link";
import { formatDate } from "@/lib/i18n-format";
import { TeamFlag } from "@/components/TeamFlag";
import type { DashboardKnockoutProgressMatchup, DashboardKnockoutProgressSlot, DashboardKnockoutProgressSummary } from "@/lib/knockout-progress";

export function KnockoutProgressMiniBracket({
  summary,
  language
}: {
  summary: DashboardKnockoutProgressSummary;
  language?: string | null;
}) {
  const visibleMatchups = summary.matchups.slice(0, 4);
  const hiddenMatchupCount = Math.max(summary.matchups.length - visibleMatchups.length, 0);

  return (
    <div className="space-y-3">
      <div className="ui-card space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {summary.currentRoundLabel}: {summary.currentRoundDecided}/{summary.currentRoundTotal} decided
            </p>
            <p className="text-sm font-semibold text-gray-500">{summary.nextRoundLabel}</p>
          </div>
          <span className="rounded-full border border-accent/25 bg-accent-light px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-accent-dark">
            {summary.matchupCount} paths
          </span>
        </div>

        {visibleMatchups.length > 0 ? (
          <div className="space-y-2">
            {visibleMatchups.map((matchup) => (
              <KnockoutProgressMatchupRow key={matchup.matchId} matchup={matchup} language={language} />
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-gray-500">Waiting for the bracket to populate.</p>
        )}

        {hiddenMatchupCount > 0 ? (
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            +{hiddenMatchupCount} more matchups in the full bracket
          </p>
        ) : null}
      </div>
    </div>
  );
}

function KnockoutProgressMatchupRow({
  matchup,
  language
}: {
  matchup: DashboardKnockoutProgressMatchup;
  language?: string | null;
}) {
  return (
    <Link
      href={`/knockout?stage=${matchup.stage}&matchId=${matchup.matchId}`}
      className="block rounded-[1.1rem] border border-gray-200 bg-white/90 px-3 py-3 transition hover:border-accent hover:bg-accent-light/20"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-500">{matchup.label}</span>
        {matchup.kickoffTime ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            {formatDate(matchup.kickoffTime, language, { month: "short", day: "numeric", timeZone: "UTC" })}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <KnockoutProgressSlotCard slot={matchup.homeSlot} align="left" />
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-400">vs</span>
        <KnockoutProgressSlotCard slot={matchup.awaySlot} align="right" />
      </div>
    </Link>
  );
}

function KnockoutProgressSlotCard({
  slot,
  align
}: {
  slot: DashboardKnockoutProgressSlot;
  align: "left" | "right";
}) {
  const justifyClassName = align === "right" ? "items-end text-right" : "items-start text-left";

  if (slot.state === "advanced" && slot.primaryTeam) {
    return (
      <div className={`flex min-w-0 flex-col ${justifyClassName}`}>
        <div className="flex min-w-0 items-center gap-1">
          <span className={`inline-flex min-w-0 items-center gap-1 ${align === "right" ? "flex-row-reverse self-end" : ""}`}>
            <TeamToken
              flagEmoji={slot.primaryTeam.flagEmoji}
              teamId={slot.primaryTeam.teamId}
              shortName={slot.primaryTeam.shortName}
              teamName={slot.primaryTeam.name}
              className="text-sm font-black text-gray-950"
            />
          </span>
          {slot.scoreLabel ? (
            <span className="shrink-0 rounded-full bg-accent-light px-1.5 py-0.5 text-[10px] font-bold text-accent-dark">
              {slot.scoreLabel}
            </span>
          ) : null}
        </div>
        {slot.secondaryTeam ? (
          <TeamToken
            flagEmoji={slot.secondaryTeam.flagEmoji}
            teamId={slot.secondaryTeam.teamId}
            shortName={slot.secondaryTeam.shortName}
            teamName={slot.secondaryTeam.name}
            className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400"
          />
        ) : null}
      </div>
    );
  }

  if (slot.state === "live") {
    return (
      <div className={`flex min-w-0 flex-col ${justifyClassName}`}>
        <TeamTokenGroup candidates={slot.candidates} className="text-sm font-black text-gray-950" />
        <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-rose-600 ${align === "right" ? "self-end" : ""}`}>
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
          {slot.scoreLabel ? `${slot.scoreLabel} live` : "Live"}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 flex-col ${justifyClassName}`}>
      <TeamTokenGroup candidates={slot.candidates} className="text-sm font-black text-gray-700" />
      <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        {slot.state === "pending" ? "Pending" : "Waiting"}
      </span>
    </div>
  );
}

function TeamToken({
  flagEmoji,
  teamId,
  shortName,
  teamName,
  className
}: {
  flagEmoji: string | null;
  teamId: string;
  shortName: string;
  teamName: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className ?? ""}`}>
      <TeamFlag
        flagEmoji={flagEmoji}
        teamId={teamId}
        shortName={shortName}
        teamName={teamName}
        className="h-[0.95em] w-[1.35em]"
        emojiClassName="text-[1em]"
      />
      <span className="truncate">{shortName}</span>
    </span>
  );
}

function TeamTokenGroup({
  candidates,
  className
}: {
  candidates: DashboardKnockoutProgressSlot["candidates"];
  className?: string;
}) {
  if (candidates.length === 0) {
    return <span className={className}>TBD</span>;
  }

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 ${className ?? ""}`}>
      {candidates.map((team, index) => (
        <span key={team.teamId} className="inline-flex min-w-0 items-center gap-1">
          {index > 0 ? <span className="text-gray-400">/</span> : null}
          <TeamToken
            flagEmoji={team.flagEmoji}
            teamId={team.teamId}
            shortName={team.shortName}
            teamName={team.name}
          />
        </span>
      ))}
    </span>
  );
}
