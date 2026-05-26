"use client";

import Link from "next/link";
import { AlarmClock, BellRing, ThumbsUp } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  getDeadlineUrgency,
  type DashboardCommandCenterSummary,
  type DashboardMatchSummary,
  type DashboardUrgencyTone
} from "@/lib/dashboard-home";
import { formatDate, formatNumber, formatRank as formatLocalizedRank, formatTime } from "@/lib/i18n-format";
import { t } from "@/lib/strings";

type DashboardCommandCenterProps = {
  summary: DashboardCommandCenterSummary;
  language?: string | null;
};

export function DashboardCommandCenter({ summary, language }: DashboardCommandCenterProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section className="grid grid-cols-3 gap-2">
      <ProgressPanel progress={summary.progress} nowMs={nowMs} language={language} />
      <PerformancePanel performance={summary.performance} language={language} />
      <ReminderPanel reminder={summary.reminder} nowMs={nowMs} language={language} />
    </section>
  );
}

function ProgressPanel({
  progress,
  nowMs,
  language
}: {
  progress: DashboardCommandCenterSummary["progress"];
  nowMs: number;
  language?: string | null;
}) {
  const tone = getProgressDisplayTone(progress, nowMs);
  const percentage = progress.totalUnits > 0 ? Math.round((progress.completedUnits / progress.totalUnits) * 100) : 0;
  const statusLabel = progress.isComplete
    ? (progress.isLocked ? t(language, "common.locked") : t(language, "common.ready"))
    : getLocalizedDeadlineLabel(progress.deadlineAt, language, nowMs);

  return (
    <PanelShell accentTone={tone} header={<UrgencyIconChip tone={tone} isComplete={progress.isComplete} language={language} />}>
      <div className="flex h-full flex-col items-center justify-center text-center">
        <DigitalWatchRing percentage={percentage} tone={tone} />
        <div className="mt-1.5 space-y-0.5">
          <p className="max-w-full truncate text-center text-[9px] font-black tracking-[-0.03em] text-slate-950">{progress.label}</p>
          <p className={`max-w-full truncate text-[6.5px] font-semibold uppercase tracking-[0.1em] ${getToneMetaTextClasses(tone, progress.isComplete, progress.isLocked)}`}>
            {statusLabel}
          </p>
        </div>
      </div>
    </PanelShell>
  );
}

function PerformancePanel({
  performance,
  language
}: {
  performance: DashboardCommandCenterSummary["performance"];
  language?: string | null;
}) {
  return (
    <PanelShell accentTone="neutral" className="triptych-compact-type">
      <div className="flex h-full w-full flex-col justify-center divide-y divide-slate-200/80">
        <MetricRow label="Pts" value={formatPoints(performance.globalPoints, language)} />
        <MetricRow label={t(language, "leaderboard.rank")} value={formatRank(performance.globalRank, language)} />
        <MetricRow label={t(language, "dashboard.groupsCompact")} value={String(performance.totalGroups)} />
      </div>
    </PanelShell>
  );
}

function ReminderPanel({
  reminder,
  nowMs,
  language
}: {
  reminder: DashboardCommandCenterSummary["reminder"];
  nowMs: number;
  language?: string | null;
}) {
  if (reminder.followedTeamCount === 0) {
    return (
      <Link
        href="/profile#followed-teams"
        className={`relative flex h-[166px] min-w-0 flex-col items-center justify-center overflow-hidden rounded-[1.15rem] border px-2.5 py-3 text-center transition hover:border-accent/50 hover:bg-accent-light/20 ${getPanelShellClasses("green")}`}
      >
        <div className={`pointer-events-none absolute inset-px rounded-[1.05rem] ${getPanelInnerSurfaceClasses("green")}`} />
        <div className={`pointer-events-none absolute -right-10 top-0 h-20 w-20 rounded-full blur-2xl ${getPanelGlowClasses("green")}`} />
        <div className="relative flex h-full flex-col items-center justify-center">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/85 text-accent-dark shadow-[0_1px_0_rgba(255,255,255,0.9)]">
            <BellRing aria-hidden className="h-4 w-4" />
          </span>
          <p className="mt-2 max-w-full truncate text-[6.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">{t(language, "dashboard.reminders")}</p>
          <p className="mt-1 max-w-full text-[10px] font-black leading-3 tracking-[-0.03em] text-slate-950">{t(language, "dashboard.pickTeamsToFollow")}</p>
        </div>
      </Link>
    );
  }

  const hasLiveMatches = reminder.liveMatches.length > 0;
  const tone = hasLiveMatches ? "red" : getDeadlineUrgency(reminder.nextMatch?.kickoffTime ?? null, nowMs);
  const chipLabel = hasLiveMatches
    ? t(language, "common.live")
    : getLocalizedReminderLabel(reminder.nextMatch?.kickoffTime ?? null, language, nowMs, t(language, "dashboard.noMatch"));

  return (
    <PanelShell
      accentTone={tone}
      headerAlign="center"
      header={<div className="flex justify-center"><ReminderChip tone={tone} label={chipLabel} /></div>}
    >
      <div className="flex h-full min-h-0 w-full overflow-y-auto">
        {hasLiveMatches ? (
          <div className="flex w-full flex-col justify-center gap-2">
            {reminder.liveMatches.slice(0, 2).map((match) => (
              <CompactLiveMatch key={match.id} match={match} language={language} />
            ))}
          </div>
        ) : reminder.nextMatch ? (
          <div className="flex w-full flex-col items-center justify-center text-center">
            <p className="max-w-full truncate text-[6.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              {formatReminderStageLabel(reminder.nextMatch, language)}
            </p>
            <p className="mt-1.5 flex max-w-full items-center gap-1.5 text-[15px] font-black leading-3 tracking-[-0.03em] text-slate-950">
              <MatchFlag
                flagEmoji={reminder.nextMatch.homeTeamFlagEmoji}
                fallback={reminder.nextMatch.homeTeamShortName}
                teamName={reminder.nextMatch.homeTeamName}
              />
              <span className="px-1 text-slate-300">v</span>
              <MatchFlag
                flagEmoji={reminder.nextMatch.awayTeamFlagEmoji}
                fallback={reminder.nextMatch.awayTeamShortName}
                teamName={reminder.nextMatch.awayTeamName}
              />
            </p>
            <div className="mt-1.5 flex flex-col items-center gap-0.5">
              <p className="text-[8.5px] font-semibold leading-3 text-slate-700">{formatShortDate(reminder.nextMatch.kickoffTime, language)}</p>
              <p className="text-[6.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">{formatShortTime(reminder.nextMatch.kickoffTime, language)}</p>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-center px-1 text-center">
            <p className="text-[8px] font-semibold leading-3 text-slate-500">{t(language, "dashboard.noUpcomingMatch")}</p>
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function PanelShell({
  header,
  accentTone = "neutral",
  headerAlign = "right",
  className = "",
  children
}: {
  header?: ReactNode;
  accentTone?: DashboardUrgencyTone;
  headerAlign?: "right" | "center";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`relative flex h-[166px] min-w-0 flex-col overflow-hidden rounded-[1.15rem] border px-2.5 py-3 ${getPanelShellClasses(accentTone)} ${className}`.trim()}>
      <div className={`pointer-events-none absolute inset-px rounded-[1.05rem] ${getPanelInnerSurfaceClasses(accentTone)}`} />
      <div className={`pointer-events-none absolute -right-8 top-0 h-20 w-20 rounded-full blur-2xl ${getPanelGlowClasses(accentTone)}`} />
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-white/75" />
      {header ? (
        <div className={`absolute left-2.5 right-2.5 top-3 z-10 flex ${headerAlign === "center" ? "justify-center" : "justify-end"}`}>
          {header}
        </div>
      ) : null}
      <div className="relative flex flex-1 items-center justify-center">{children}</div>
    </section>
  );
}

function UrgencyIconChip({
  tone,
  isComplete,
  language
}: {
  tone: DashboardUrgencyTone;
  isComplete: boolean;
  language?: string | null;
}) {
  const Icon = isComplete ? ThumbsUp : tone === "red" ? BellRing : AlarmClock;

  return (
    <span
      aria-label={getUrgencyAriaLabel(tone, isComplete, language)}
      className={`ui-chip-icon-sm border font-bold ${getToneIconChipClasses(tone)}`}
    >
      <Icon
        aria-hidden
        className={`h-3.5 w-3.5 ${!isComplete && tone === "red" ? "motion-safe:animate-pulse" : ""}`}
      />
    </span>
  );
}

function ReminderChip({
  tone,
  label
}: {
  tone: DashboardUrgencyTone;
  label: string;
}) {
  return (
    <span className={`ui-chip-sm max-w-full border px-1 font-bold tracking-[-0.02em] ${getToneLabelChipClasses(tone)}`}>
      <BellRing aria-hidden className={`h-2.5 w-2.5 ${tone === "red" ? "motion-safe:animate-pulse" : ""}`} />
      <span className="truncate leading-none tabular-nums">{label}</span>
    </span>
  );
}

function DigitalWatchRing({
  percentage,
  tone
}: {
  percentage: number;
  tone: DashboardUrgencyTone;
}) {
  const gradientId = useId();
  const clampedPercentage = Math.max(0, Math.min(percentage, 100));
  const totalSegments = 30;
  const filledSegments = Math.round((clampedPercentage / 100) * totalSegments);
  const radius = 35;
  const gapDegrees = 4.3;
  const stepDegrees = 360 / totalSegments;
  const segmentDegrees = stepDegrees - gapDegrees;

  const segments = useMemo(
    () =>
      Array.from({ length: totalSegments }, (_, index) => {
        const start = -90 + index * stepDegrees + gapDegrees / 2;
        const end = start + segmentDegrees;
        return {
          d: describeArc(radius, start, end),
          filled: index < filledSegments
        };
      }),
    [filledSegments, segmentDegrees, stepDegrees]
  );

  return (
    <div className="relative h-[104px] w-[104px]">
      <div className={`absolute inset-4 rounded-full blur-xl ${getRingGlowClasses(tone)}`} />
      <svg viewBox="-52 -52 104 104" className="relative h-full w-full drop-shadow-[0_3px_8px_rgba(15,23,42,0.06)]" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {getRingGradientStops(tone).map((stop) => (
              <stop key={`${gradientId}-${stop.offset}`} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
        <circle cx="0" cy="0" r="31" fill={`url(#${gradientId})`} opacity="0.08" />
        <circle cx="0" cy="0" r="27.5" fill="rgba(255,255,255,0.94)" stroke="rgba(255,255,255,0.92)" strokeWidth="1" />
        <circle cx="0" cy="0" r="38.5" fill="none" className="stroke-white/70" strokeWidth="1" />
        {segments.map((segment, index) => (
          <path
            key={`segment-${index}`}
            d={segment.d}
            fill="none"
            strokeLinecap="round"
            strokeWidth="3.2"
            stroke={segment.filled ? `url(#${gradientId})` : undefined}
            className={segment.filled ? "" : "stroke-slate-200/90"}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="tabular-nums text-[20px] font-black leading-none tracking-[-0.04em] text-slate-950">
          <span>{clampedPercentage}</span>
          <sup className="ml-0.5 align-super text-[7px] font-black tracking-normal text-slate-500">%</sup>
        </p>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 py-2.5">
      <span className="min-w-0 truncate text-[6.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      <span className="min-w-0 max-w-[3.3rem] truncate text-right text-[13px] font-black leading-none tracking-[-0.04em] text-slate-950 tabular-nums">{value}</span>
    </div>
  );
}

function CompactLiveMatch({ match, language }: { match: DashboardMatchSummary; language?: string | null }) {
  return (
    <div className="rounded-[0.95rem] border border-rose-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(255,241,242,0.94))] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[7px] font-semibold uppercase tracking-[0.2em] text-rose-700">{compactStageLabel(match.stage, language)}</p>
        <span className="ui-chip-sm border border-rose-200/80 bg-white/85 text-[7px] font-bold uppercase tracking-[0.18em] text-rose-700">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 motion-safe:animate-pulse" />
          {t(language, "common.live")}
        </span>
      </div>
      <div className="mt-1.5 space-y-1.5">
        <CompactLiveRow
          team={match.homeTeamShortName}
          flagEmoji={match.homeTeamFlagEmoji}
          score={match.homeScore}
          yellowCards={match.homeYellowCards}
          redCards={match.homeRedCards}
        />
        <CompactLiveRow
          team={match.awayTeamShortName}
          flagEmoji={match.awayTeamFlagEmoji}
          score={match.awayScore}
          yellowCards={match.awayYellowCards}
          redCards={match.awayRedCards}
        />
      </div>
    </div>
  );
}

function CompactLiveRow({
  team,
  flagEmoji,
  score,
  yellowCards,
  redCards
}: {
  team: string;
  flagEmoji?: string | null;
  score: number | null;
  yellowCards?: number | null;
  redCards?: number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <MatchFlag flagEmoji={flagEmoji} fallback={team} teamName={team} className="text-[14px]" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="min-w-4 text-center text-[11px] font-black tracking-[-0.03em] text-slate-950 tabular-nums">{score ?? "—"}</span>
        {typeof yellowCards === "number" ? <TinyCardStat label="🟨" value={yellowCards} /> : null}
        {typeof redCards === "number" ? <TinyCardStat label="🟥" value={redCards} /> : null}
      </div>
    </div>
  );
}

function TinyCardStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="ui-chip-sm border border-white/80 bg-white/90 text-[7px] font-semibold text-slate-700">
      <span aria-hidden>{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

function MatchFlag({
  flagEmoji,
  fallback,
  teamName,
  className = ""
}: {
  flagEmoji?: string | null;
  fallback: string;
  teamName: string;
  className?: string;
}) {
  if (flagEmoji) {
    return (
      <span aria-label={teamName} title={teamName} className={`inline-flex items-center leading-none ${className}`}>
        <span aria-hidden className="text-[1.7em]">{flagEmoji}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center truncate text-[11px] font-black leading-none tracking-[-0.02em] text-slate-950 ${className}`}>
      {fallback}
    </span>
  );
}

function describeArc(radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(radius, endAngle);
  const end = polarToCartesian(radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: radius * Math.cos(angleInRadians),
    y: radius * Math.sin(angleInRadians)
  };
}

function getToneIconChipClasses(tone: DashboardUrgencyTone) {
  switch (tone) {
    case "red":
      return "border-rose-200/80 bg-rose-50/90 text-rose-700";
    case "orange":
      return "border-amber-200/80 bg-amber-50/90 text-amber-700";
    case "green":
      return "border-accent/30 bg-accent-light/40 text-accent-dark";
    default:
      return "border-slate-200/80 bg-white/85 text-slate-500";
  }
}

function getToneLabelChipClasses(tone: DashboardUrgencyTone) {
  switch (tone) {
    case "red":
      return "border-rose-200/80 bg-rose-50/90 text-rose-700";
    case "orange":
      return "border-amber-200/80 bg-amber-50/90 text-amber-700";
    case "green":
      return "border-accent/30 bg-accent-light/40 text-accent-dark";
    default:
      return "border-slate-200/80 bg-white/85 text-slate-500";
  }
}

function getToneMetaTextClasses(tone: DashboardUrgencyTone, isComplete: boolean, isLocked: boolean) {
  if (isLocked && isComplete) {
    return "text-slate-500";
  }

  if (isComplete) {
    return "text-accent-dark";
  }

  switch (tone) {
    case "red":
      return "text-rose-700";
    case "orange":
      return "text-amber-700";
    case "green":
      return "text-accent-dark";
    default:
      return "text-slate-500";
  }
}

function getProgressDisplayTone(
  progress: DashboardCommandCenterSummary["progress"],
  nowMs: number
): DashboardUrgencyTone {
  if (progress.deadlineAt && new Date(progress.deadlineAt).getTime() <= nowMs) {
    return progress.isComplete ? "neutral" : "red";
  }

  if (progress.isComplete) {
    return "green";
  }

  return getDeadlineUrgency(progress.deadlineAt, nowMs);
}

function getPanelShellClasses(tone: DashboardUrgencyTone) {
  return `border-stone-200/85 bg-[linear-gradient(180deg,rgba(255,252,248,0.98)_0%,rgba(247,242,235,0.98)_100%)] shadow-[0_10px_24px_rgba(38,28,20,0.06),0_1px_2px_rgba(38,28,20,0.03)] ${getPanelRingClasses(tone)}`;
}

function getPanelInnerSurfaceClasses(tone: DashboardUrgencyTone) {
  const accent =
    tone === "green"
      ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.7),transparent)]"
      : tone === "orange"
        ? "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.11),transparent_42%),linear-gradient(180deg,rgba(255,250,240,0.55),transparent)]"
        : tone === "red"
          ? "bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.1),transparent_42%),linear-gradient(180deg,rgba(255,248,248,0.55),transparent)]"
          : "bg-[radial-gradient(circle_at_top_right,rgba(217,119,6,0.08),transparent_42%),linear-gradient(180deg,rgba(255,253,249,0.7),transparent)]";

  return `${accent} shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]`;
}

function getPanelGlowClasses(tone: DashboardUrgencyTone) {
  switch (tone) {
    case "green":
      return "bg-accent-light/40";
    case "orange":
      return "bg-amber-200/32";
    case "red":
      return "bg-rose-200/28";
    default:
      return "bg-amber-100/28";
  }
}

function getPanelRingClasses(tone: DashboardUrgencyTone) {
  switch (tone) {
    case "green":
      return "ring-1 ring-accent-light";
    case "orange":
      return "ring-1 ring-amber-100/80";
    case "red":
      return "ring-1 ring-rose-100/80";
    default:
      return "ring-1 ring-stone-100/85";
  }
}

function getRingGlowClasses(tone: DashboardUrgencyTone) {
  switch (tone) {
    case "green":
      return "bg-accent-light/40";
    case "orange":
      return "bg-amber-200/20";
    case "red":
      return "bg-rose-200/18";
    default:
      return "bg-amber-100/22";
  }
}

function getRingGradientStops(tone: DashboardUrgencyTone) {
  switch (tone) {
    case "red":
      return [
        { offset: "0%", color: "#fb7185" },
        { offset: "100%", color: "#e11d48" }
      ];
    case "orange":
      return [
        { offset: "0%", color: "#fbbf24" },
        { offset: "100%", color: "#f59e0b" }
      ];
    case "green":
      return [
        { offset: "0%", color: "var(--app-accent-ring)" },
        { offset: "100%", color: "var(--app-accent)" }
      ];
    default:
      return [
        { offset: "0%", color: "#cbbba6" },
        { offset: "100%", color: "#8f7b66" }
      ];
  }
}

function getUrgencyAriaLabel(tone: DashboardUrgencyTone, isComplete: boolean, language?: string | null) {
  if (isComplete) {
    return tone === "neutral" ? `${t(language, "common.done")} ${t(language, "common.locked")}` : t(language, "common.done");
  }

  switch (tone) {
    case "red":
      return `${t(language, "common.locked")} status`;
    case "orange":
      return `${t(language, "common.pending")} status`;
    case "green":
      return `${t(language, "common.ready")} status`;
    default:
      return "Status";
  }
}

function compactStageLabel(stage: string, language?: string | null) {
  if (stage === "group") {
    return t(language, "dashboard.groupLabel");
  }

  if (stage === "r32" || stage === "round_of_32") {
    return "R32";
  }

  if (stage === "r16" || stage === "round_of_16") {
    return "R16";
  }

  if (stage === "qf" || stage === "quarterfinal") {
    return "QF";
  }

  if (stage === "sf" || stage === "semifinal") {
    return "SF";
  }

  if (stage === "third") {
    return t(language, "knockout.thirdPlace");
  }

  if (stage === "final") {
    return t(language, "common.final");
  }

  return stage;
}

function formatReminderStageLabel(match: DashboardMatchSummary, language?: string | null) {
  if (match.stage === "group") {
    const groupSuffix = match.groupLabel?.trim();
    return groupSuffix ? `${t(language, "dashboard.groupLabel")} ${groupSuffix}` : t(language, "dashboard.groupLabel");
  }

  return compactStageLabel(match.stage, language);
}

function formatShortDate(value: string | null, language?: string | null) {
  if (!value) {
    return t(language, "dashboard.noUpcomingMatch");
  }

  const kickoff = new Date(value);
  if (Number.isNaN(kickoff.getTime())) {
    return t(language, "dashboard.noUpcomingMatch");
  }

  return formatDate(kickoff, language, { month: "short", day: "numeric" });
}

function formatShortTime(value: string | null, language?: string | null) {
  if (!value) {
    return "";
  }

  const kickoff = new Date(value);
  if (Number.isNaN(kickoff.getTime())) {
    return "";
  }

  return formatTime(kickoff, language, { hour: "numeric", minute: "2-digit" });
}

function formatPoints(value: number | null, language?: string | null) {
  return typeof value === "number" ? formatNumber(value, language) : "—";
}

function formatRank(value: number | null, language?: string | null) {
  return typeof value === "number" ? formatLocalizedRank(value, language) : "—";
}

function getLocalizedDeadlineLabel(deadlineAt: string | null, language?: string | null, now = Date.now()) {
  if (!deadlineAt) {
    return t(language, "common.pending");
  }

  const diffMs = new Date(deadlineAt).getTime() - now;
  if (diffMs <= 0) {
    return t(language, "common.locked");
  }
  if (diffMs <= 2 * 24 * 60 * 60 * 1000) {
    return t(language, "common.pending");
  }
  return t(language, "common.open");
}

function getLocalizedReminderLabel(
  targetTime: string | null,
  language?: string | null,
  now = Date.now(),
  emptyLabel?: string
) {
  if (!targetTime) {
    return emptyLabel ?? t(language, "dashboard.noMatch");
  }

  const diffMs = new Date(targetTime).getTime() - now;
  if (diffMs <= 0) {
    return t(language, "common.locked");
  }
  const dayMs = 24 * 60 * 60 * 1000;
  if (diffMs <= dayMs) {
    const halfHours = Math.max(1, Math.ceil(diffMs / (30 * 60 * 1000)));
    const hours = halfHours / 2;
    return `in ${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }
  const days = Math.max(1, Math.ceil(diffMs / dayMs));
  return `in ${days}d`;
}
