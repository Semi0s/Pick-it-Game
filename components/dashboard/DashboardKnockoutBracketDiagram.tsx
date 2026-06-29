"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { TeamFlag } from "@/components/TeamFlag";
import type {
  BracketTeamOption,
  KnockoutBracketEditorView,
  KnockoutBracketMatchView
} from "@/lib/bracket-predictions";
import { t } from "@/lib/strings";

type StageKey = KnockoutBracketMatchView["stage"];

type StageSummary = {
  stage: StageKey;
  label: string;
  matches: KnockoutBracketMatchView[];
  resolvedCount: number;
  totalCount: number;
};

type MatchSide = "home" | "away";

const STAGE_ORDER = ["r32", "r16", "qf", "sf", "final"] as const;
const STAGE_SHORT_LABELS: Partial<Record<StageKey, string>> = {
  r32: "R32",
  r16: "R16",
  qf: "QF",
  sf: "SF",
  final: "Final"
};

const STAGE_DESCRIPTIONS: Partial<Record<StageKey, string>> = {
  r32: "Official teams start here",
  r16: "Winners feed in",
  qf: "Bracket narrows",
  sf: "Final four",
  final: "Champion path"
};

export function DashboardKnockoutBracketDiagram({
  bracketView,
  language,
  className
}: {
  bracketView?: KnockoutBracketEditorView | null;
  language?: string | null;
  className?: string;
}) {
  const stages = useMemo(() => buildStageSummaries(bracketView), [bracketView]);
  const [activeStageKey, setActiveStageKey] = useState<StageKey>("r32");
  const activeStage = stages.find((stage) => stage.stage === activeStageKey) ?? stages[0] ?? null;
  const activeStageIndex = Math.max(0, stages.findIndex((stage) => stage.stage === activeStage?.stage));
  const resolvedCount = stages.reduce((sum, stage) => sum + stage.resolvedCount, 0);
  const totalCount = stages.reduce((sum, stage) => sum + stage.totalCount, 0);
  const championName = bracketView?.champion?.shortName ?? bracketView?.champion?.name ?? null;

  if (!bracketView?.isSeeded || stages.length === 0) {
    return (
      <section className={`ui-card overflow-hidden p-4 ${className ?? ""}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Official knockout bracket</p>
            <h2 className="mt-2 text-xl font-black text-gray-950">Bracket diagram coming here</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-gray-600">
              Once the official Round of 32 is seeded, this dashboard spot will show the bracket with real teams instead of the group-stage standings table.
            </p>
          </div>
          <Link
            href="/knockout"
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-black text-accent-text transition hover:bg-accent/95"
          >
            Open bracket
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={`ui-card overflow-hidden p-4 ${className ?? ""}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Official knockout bracket</p>
          <h2 className="mt-2 text-xl font-black text-gray-950">How the bracket evolves</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-gray-600">
            Official teams start in the Round of 32. As winners are saved or results go final, the next columns fill in so the path to the final stays visible.
          </p>
        </div>
        <Link
          href="/knockout"
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-black text-gray-800 transition hover:border-accent hover:bg-accent-light"
        >
          Open picks
        </Link>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <DashboardBracketStat label="Rounds" value={stages.length.toString()} />
        <DashboardBracketStat label="Resolved" value={`${resolvedCount}/${totalCount}`} />
        <DashboardBracketStat label="Champion" value={championName ?? t(language, "common.pending")} />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {stages.map((stage, index) => {
          const isActive = activeStage?.stage === stage.stage;
          const isPast = index < activeStageIndex;
          return (
            <button
              key={stage.stage}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveStageKey(stage.stage)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${
                isActive
                  ? "border-accent bg-accent text-accent-text"
                  : isPast
                    ? "border-accent-light bg-accent-light/35 text-accent-dark hover:border-accent"
                    : "border-gray-300 bg-white text-gray-700 hover:border-accent hover:bg-accent-light"
              }`}
            >
              <span>{STAGE_SHORT_LABELS[stage.stage] ?? stage.label}</span>
              <span className="rounded-full bg-white/55 px-1.5 py-0.5 text-[10px] leading-none text-inherit">
                {stage.resolvedCount}/{stage.totalCount}
              </span>
            </button>
          );
        })}
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1">
        <div
          className="grid min-w-[58rem] items-start gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(10.75rem, 1fr))` }}
        >
          {stages.map((stage, index) => (
            <StageColumn
              key={stage.stage}
              stage={stage}
              isActive={activeStage?.stage === stage.stage}
              isPast={index < activeStageIndex}
              onSelect={() => setActiveStageKey(stage.stage)}
            />
          ))}
        </div>
      </div>

      {activeStage ? (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-accent-dark">
                {STAGE_SHORT_LABELS[activeStage.stage] ?? activeStage.label}
              </p>
              <h3 className="text-base font-black text-gray-950">{activeStage.label}</h3>
            </div>
            <p className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-gray-600">
              {activeStage.resolvedCount}/{activeStage.totalCount} resolved
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {activeStage.matches.map((match) => (
              <MatchDetailCard key={match.matchId} match={match} language={language} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function buildStageSummaries(bracketView: KnockoutBracketEditorView | null | undefined): StageSummary[] {
  if (!bracketView?.isSeeded) {
    return [];
  }

  return STAGE_ORDER
    .map((stageKey) => {
      const stage = bracketView.stages.find((candidate) => candidate.stage === stageKey);
      if (!stage || stage.matches.length === 0) {
        return null;
      }

      const resolvedCount = stage.matches.filter((match) => Boolean(getWinnerTeamId(match))).length;
      return {
        stage: stage.stage,
        label: stage.label || STAGE_SHORT_LABELS[stage.stage] || stage.stage.toUpperCase(),
        matches: stage.matches,
        resolvedCount,
        totalCount: stage.matches.length
      };
    })
    .filter((stage): stage is StageSummary => Boolean(stage));
}

function StageColumn({
  stage,
  isActive,
  isPast,
  onSelect
}: {
  stage: StageSummary;
  isActive: boolean;
  isPast: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full rounded-xl border p-2 text-left transition ${
        isActive
          ? "border-accent bg-accent-light/30 shadow-[0_8px_22px_rgba(15,23,42,0.08)]"
          : isPast
            ? "border-accent-light bg-white"
            : "border-gray-200 bg-white hover:border-accent-light"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-accent-dark">
            {STAGE_SHORT_LABELS[stage.stage] ?? stage.label}
          </p>
          <p className="mt-0.5 text-[11px] font-bold leading-4 text-gray-500">
            {STAGE_DESCRIPTIONS[stage.stage] ?? "Next round"}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600">
          {stage.resolvedCount}/{stage.totalCount}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {stage.matches.map((match) => (
          <MatchCondensedCard key={match.matchId} match={match} />
        ))}
      </div>
    </button>
  );
}

function MatchCondensedCard({ match }: { match: KnockoutBracketMatchView }) {
  const winnerTeamId = getWinnerTeamId(match);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.1em] text-gray-400">{match.title}</p>
      <CondensedTeamRow match={match} side="home" winnerTeamId={winnerTeamId} />
      <CondensedTeamRow match={match} side="away" winnerTeamId={winnerTeamId} />
    </div>
  );
}

function CondensedTeamRow({
  match,
  side,
  winnerTeamId
}: {
  match: KnockoutBracketMatchView;
  side: MatchSide;
  winnerTeamId: string | null;
}) {
  const team = getSideTeam(match, side);
  const label = getSideLabel(match, side);
  const isWinner = Boolean(team?.id && team.id === winnerTeamId);

  return (
    <div className={`mt-1 flex min-w-0 items-center gap-1.5 ${isWinner ? "text-accent-dark" : team ? "text-gray-800" : "text-gray-400"}`}>
      <TeamFlag
        flagEmoji={team?.flagEmoji ?? null}
        teamId={team?.id ?? null}
        shortName={label}
        className="shrink-0 text-xs"
        emojiClassName="text-[1em]"
      />
      <span className="truncate text-[10px] font-black uppercase tracking-wide">{label}</span>
      {isWinner ? <span className="ml-auto text-[10px] font-black">✓</span> : null}
    </div>
  );
}

function MatchDetailCard({ match, language }: { match: KnockoutBracketMatchView; language?: string | null }) {
  const winnerTeamId = getWinnerTeamId(match);
  const statusLabel = match.status === "final"
    ? t(language, "common.final")
    : match.status === "live"
      ? t(language, "common.live")
      : match.isLocked
        ? t(language, "common.locked")
        : t(language, "common.pending");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">{match.title}</p>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-gray-600">
          {statusLabel}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        <DetailTeamRow match={match} side="home" winnerTeamId={winnerTeamId} />
        <DetailTeamRow match={match} side="away" winnerTeamId={winnerTeamId} />
      </div>
    </div>
  );
}

function DetailTeamRow({
  match,
  side,
  winnerTeamId
}: {
  match: KnockoutBracketMatchView;
  side: MatchSide;
  winnerTeamId: string | null;
}) {
  const team = getSideTeam(match, side);
  const label = getSideLabel(match, side);
  const score = getSideScore(match, side);
  const isWinner = Boolean(team?.id && team.id === winnerTeamId);

  return (
    <div
      className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2 py-2 ${
        isWinner
          ? "border-accent bg-accent-light/30 text-accent-dark"
          : team
            ? "border-gray-200 bg-gray-50 text-gray-900"
            : "border-dashed border-gray-200 bg-gray-50 text-gray-400"
      }`}
    >
      <TeamFlag
        flagEmoji={team?.flagEmoji ?? null}
        teamId={team?.id ?? null}
        shortName={label}
        className="text-sm"
        emojiClassName="text-[1em]"
      />
      <span className="truncate text-sm font-black">{team?.name ?? label}</span>
      <span className="text-sm font-black tabular-nums">
        {typeof score === "number" ? score : isWinner ? "✓" : "—"}
      </span>
    </div>
  );
}

function DashboardBracketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-gray-950">{value}</p>
    </div>
  );
}

function getSideTeam(match: KnockoutBracketMatchView, side: MatchSide): BracketTeamOption | null {
  return side === "home"
    ? match.homeTeam ?? match.seededHomeTeam ?? null
    : match.awayTeam ?? match.seededAwayTeam ?? null;
}

function getSideLabel(match: KnockoutBracketMatchView, side: MatchSide) {
  const team = getSideTeam(match, side);
  if (team) {
    return team.shortName || team.name;
  }

  const sourceLabel = side === "home"
    ? match.projectedHomeSourceLabel ?? match.homeSourceLabel
    : match.projectedAwaySourceLabel ?? match.awaySourceLabel;

  return formatSeedLabel(sourceLabel);
}

function getSideScore(match: KnockoutBracketMatchView, side: MatchSide) {
  if (side === "home") {
    return match.homeScore ?? match.predictedHomeScore ?? null;
  }

  return match.awayScore ?? match.predictedAwayScore ?? null;
}

function getWinnerTeamId(match: KnockoutBracketMatchView) {
  return match.actualWinnerTeamId ?? match.predictedWinnerTeamId ?? match.savedWinnerTeamId ?? null;
}

function formatSeedLabel(sourceLabel: string | null | undefined) {
  if (!sourceLabel) {
    return "TBD";
  }

  const normalized = sourceLabel.trim();
  const compactSourceMatch = normalized.match(/^([123])([A-L])$/i);
  if (compactSourceMatch) {
    const rank = compactSourceMatch[1] === "1" ? "1st" : compactSourceMatch[1] === "2" ? "2nd" : "3rd";
    return `${compactSourceMatch[2].toUpperCase()}-${rank}`;
  }

  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return `${groupMatch[1].toUpperCase()}-${groupMatch[2].toLowerCase() === "winner" ? "1st" : "2nd"}`;
  }

  const bestThirdFromMatch = normalized.match(/^Best\s+3(?:rd)?\s+from\s+([A-L](?:\/[A-L])*)$/i);
  if (bestThirdFromMatch) {
    return `3rd ${bestThirdFromMatch[1].toUpperCase()}`;
  }

  return normalized;
}
