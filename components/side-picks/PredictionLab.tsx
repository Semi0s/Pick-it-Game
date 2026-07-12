"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { savePredictionLabSettingsAction } from "@/app/side-picks/actions";
import { TeamFlag } from "@/components/TeamFlag";
import { showAppToast } from "@/lib/app-toast";
import { useAppLanguage } from "@/lib/app-language";
import type { PredictionLabPublicMatchPulse } from "@/lib/prediction-lab-public-pulse";
import {
  PREDICTION_LAB_ATTENTION_PRESETS,
  PREDICTION_LAB_DEFAULT_SETTINGS,
  PREDICTION_LAB_LOCAL_STORAGE_KEY,
  buildPredictionLabPreferredMatchId,
  buildPredictionLabViewModel,
  normalizePredictionLabSettings,
  type PredictionLabAverageSummary,
  type PredictionLabBracketPick,
  type PredictionLabMatchInput,
  type PredictionLabMatchLensView,
  type PredictionLabSettings,
  type PredictionLabSignalControlId,
  type PredictionLabSignalRow,
  type PredictionLabTeamHealthSummary,
  type PredictionLabTeamInput
} from "@/lib/prediction-lab";
import { t } from "@/lib/strings";

type PredictionLabProps = {
  tournamentId: string;
  groupId: string | null;
  groupName: string | null;
  activeTeams: PredictionLabTeamInput[];
  teamHealthSummary: PredictionLabTeamHealthSummary;
  publicMatchPulseRows: Array<PredictionLabPublicMatchPulse & { matchId: string }>;
  upcomingMatches: PredictionLabMatchInput[];
  userBracketPicks: PredictionLabBracketPick[];
  initialSettings: PredictionLabSettings;
  initialAverageSummary: PredictionLabAverageSummary;
  canPersist?: boolean;
};

type SavePredictionLabResult =
  | {
      ok: true;
      messageKey: string;
      settings: PredictionLabSettings;
      averageSummary: PredictionLabAverageSummary;
    }
  | {
      ok: false;
      messageKey?: string;
      message: string;
    };

type PredictionLabSaveState = "preview" | "saved" | "dirty" | "saving" | "error";

function predictionLabLabel(language: string | null | undefined, key: string, params: Record<string, string | number> = {}) {
  return t(language, `predictionLab.${key}`, params);
}

const PREDICTION_LAB_AUTOSAVE_DELAY_MS = 900;

const SIGNAL_SCOPE_TONES: Record<
  PredictionLabSignalRow["id"],
  {
    accent: string;
    beam: string;
    beamSoft: string;
    fill: string;
    dot: string;
  }
> = {
  scheduleLoad: {
    accent: "#7dd3fc",
    beam: "rgba(125,211,252,0.84)",
    beamSoft: "rgba(125,211,252,0.18)",
    fill: "rgba(56,189,248,0.88)",
    dot: "#e0f2fe"
  },
  availability: {
    accent: "#94a3b8",
    beam: "rgba(148,163,184,0.58)",
    beamSoft: "rgba(148,163,184,0.15)",
    fill: "rgba(148,163,184,0.76)",
    dot: "#e2e8f0"
  },
  formQuality: {
    accent: "#fbbf24",
    beam: "rgba(251,191,36,0.82)",
    beamSoft: "rgba(251,191,36,0.18)",
    fill: "rgba(245,158,11,0.9)",
    dot: "#fef3c7"
  },
  crowdPulse: {
    accent: "#c084fc",
    beam: "rgba(192,132,252,0.8)",
    beamSoft: "rgba(192,132,252,0.18)",
    fill: "rgba(168,85,247,0.86)",
    dot: "#f3e8ff"
  },
  publicPulse: {
    accent: "#fda4af",
    beam: "rgba(253,164,175,0.78)",
    beamSoft: "rgba(253,164,175,0.18)",
    fill: "rgba(244,63,94,0.84)",
    dot: "#ffe4e6"
  }
};

export function PredictionLab({
  tournamentId,
  groupId,
  groupName,
  activeTeams,
  teamHealthSummary,
  publicMatchPulseRows,
  upcomingMatches,
  userBracketPicks,
  initialSettings,
  initialAverageSummary,
  canPersist = true
}: PredictionLabProps) {
  const { activeLanguage } = useAppLanguage();
  const normalizedInitialSettings = useMemo(() => normalizePredictionLabSettings(initialSettings), [initialSettings]);
  const [settings, setSettings] = useState(() => normalizedInitialSettings);
  const [lastSavedSettings, setLastSavedSettings] = useState(() => normalizedInitialSettings);
  const [averageSummary, setAverageSummary] = useState(initialAverageSummary);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<PredictionLabSaveState>(canPersist ? "saved" : "preview");
  const [hasHydratedSettings, setHasHydratedSettings] = useState(false);
  const [, startTransition] = useTransition();
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    let restoredSettings: PredictionLabSettings | null = null;

    try {
      const stored = window.localStorage.getItem(PREDICTION_LAB_LOCAL_STORAGE_KEY);
      if (!stored) {
        setHasHydratedSettings(true);
        setSaveState(canPersist ? "saved" : "preview");
        return;
      }

      const parsed = JSON.parse(stored) as Partial<PredictionLabSettings>;
      restoredSettings = normalizePredictionLabSettings(parsed);
      setSettings(restoredSettings);
    } catch {
      // Ignore stale local settings.
    }

    setHasHydratedSettings(true);
    if (!canPersist) {
      setSaveState("preview");
      return;
    }

    setSaveState(
      restoredSettings && !arePredictionLabSettingsEqual(restoredSettings, normalizedInitialSettings) ? "dirty" : "saved"
    );
  }, [canPersist, normalizedInitialSettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PREDICTION_LAB_LOCAL_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Some embedded browsers can block localStorage writes.
    }
  }, [settings]);

  const preferredMatchId = useMemo(
    () =>
      buildPredictionLabPreferredMatchId({
        upcomingMatches,
        bracketPicks: userBracketPicks
      }),
    [upcomingMatches, userBracketPicks]
  );
  const publicMatchPulseByMatchId = useMemo(
    () => new Map(publicMatchPulseRows.map((row) => [row.matchId, { homePercent: row.homePercent, awayPercent: row.awayPercent, provider: row.provider }])),
    [publicMatchPulseRows]
  );
  useEffect(() => {
    const nextSelectedMatchId =
      selectedMatchId && upcomingMatches.some((match) => match.id === selectedMatchId) ? selectedMatchId : preferredMatchId;
    if (nextSelectedMatchId !== selectedMatchId) {
      setSelectedMatchId(nextSelectedMatchId);
    }
  }, [preferredMatchId, upcomingMatches, selectedMatchId]);

  useEffect(() => {
    if (!hasHydratedSettings) {
      return;
    }

    if (!canPersist) {
      setSaveState("preview");
      return;
    }

    if (arePredictionLabSettingsEqual(settings, lastSavedSettings)) {
      setSaveState("saved");
      return;
    }

    setSaveState("dirty");
    const snapshot = settings;
    const timeoutId = window.setTimeout(() => {
      setSaveState("saving");
      startTransition(async () => {
        const result = (await savePredictionLabSettingsAction({
          tournamentId,
          groupId,
          settings: snapshot
        })) as SavePredictionLabResult;

        if (!result.ok) {
          showAppToast({
            tone: "error",
            text: result.messageKey
              ? predictionLabLabel(activeLanguage, result.messageKey.replace(/^predictionLab\./, ""))
              : result.message
          });

          setSaveState(arePredictionLabSettingsEqual(settingsRef.current, snapshot) ? "error" : "dirty");
          return;
        }

        setAverageSummary(result.averageSummary);
        if (arePredictionLabSettingsEqual(settingsRef.current, snapshot)) {
          setLastSavedSettings(result.settings);
          setSaveState("saved");
          return;
        }

        setSaveState("dirty");
      });
    }, PREDICTION_LAB_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeLanguage, canPersist, groupId, hasHydratedSettings, lastSavedSettings, settings, tournamentId]);

  const viewModel = useMemo(
    () =>
      buildPredictionLabViewModel({
        activeTeams,
        upcomingMatches,
        settings,
        averageSummary,
        teamHealthSummary,
        publicMatchPulseByMatchId,
        focusMatchId: selectedMatchId,
        bracketPicks: userBracketPicks,
        topCount: 8,
        language: activeLanguage
      }),
    [
      activeLanguage,
      activeTeams,
      averageSummary,
      publicMatchPulseByMatchId,
      selectedMatchId,
      settings,
      teamHealthSummary,
      upcomingMatches,
      userBracketPicks
    ]
  );

  function updateAttention(signalId: PredictionLabSignalControlId, storedValue: number) {
    setSettings((current) => ({
      ...current,
      [signalId]: storedValue
    }));
  }

  function resetSettings() {
    setSettings({ ...PREDICTION_LAB_DEFAULT_SETTINGS });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sky-700">
            <Sparkles aria-hidden className="h-4 w-4" />
          </span>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-900">
            {predictionLabLabel(activeLanguage, "title")}
          </p>
        </div>

        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-sky-900">
          {predictionLabLabel(activeLanguage, "nonScoring")}
        </span>
      </div>

      <MatchLensCard
        lens={viewModel.matchLens}
        matchOptions={viewModel.matchOptions}
        selectedMatchId={viewModel.selectedMatchId}
        onSelectMatch={setSelectedMatchId}
        onResetSettings={resetSettings}
        onUpdateAttention={updateAttention}
        canPersist={canPersist}
        saveState={saveState}
        groupName={groupName}
        language={activeLanguage}
      />

      <SupplementalSignalsCard
        signals={viewModel.matchLens?.signals.filter((signal) => signal.status !== "active") ?? []}
        groupName={groupName}
        canShowAverage={viewModel.canShowAverage}
        language={activeLanguage}
      />
    </section>
  );
}

function MatchLensCard({
  lens,
  matchOptions,
  selectedMatchId,
  onSelectMatch,
  onResetSettings,
  onUpdateAttention,
  canPersist,
  saveState,
  groupName,
  language
}: {
  lens: PredictionLabMatchLensView | null;
  matchOptions: Array<{ id: string; label: string }>;
  selectedMatchId: string | null;
  onSelectMatch: (matchId: string | null) => void;
  onResetSettings: () => void;
  onUpdateAttention: (signalId: PredictionLabSignalControlId, storedValue: number) => void;
  canPersist: boolean;
  saveState: PredictionLabSaveState;
  groupName: string | null;
  language: string;
}) {
  const primarySignals = lens?.signals.filter((signal) => signal.status === "active") ?? [];
  const selectedMatchLabel = matchOptions.find((option) => option.id === selectedMatchId)?.label ?? "—";
  const footerLines = [
    lens?.crowdPairLabel ? `${predictionLabLabel(language, "matchLens.crowd")}: ${lens.crowdPairLabel}` : null,
    lens?.publicPairLabel ? `${predictionLabLabel(language, "signals.publicPulse.label")}: ${lens.publicPairLabel}` : null,
    lens?.bracketPickLabel
  ].filter((line): line is string => Boolean(line));
  const saveStateLabel =
    saveState === "saving"
      ? predictionLabLabel(language, "matchLens.saving")
      : saveState === "dirty"
        ? predictionLabLabel(language, "matchLens.pending")
        : saveState === "error"
          ? predictionLabLabel(language, "matchLens.needsSave")
          : saveState === "preview"
            ? predictionLabLabel(language, "matchLens.preview")
            : predictionLabLabel(language, "matchLens.saved");

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-800 bg-[linear-gradient(180deg,#031424_0%,#06192b_48%,#03101d_100%)] p-4 text-white shadow-[0_26px_60px_-34px_rgba(2,8,23,0.92)] sm:p-5">
      <label className="block text-[11px] font-black uppercase tracking-[0.16em] text-white/54">
        {predictionLabLabel(language, "matchLens.matchup")}
        <div className="relative mt-2">
          <div className="pointer-events-none flex min-h-[3.35rem] w-full items-center justify-between gap-3 rounded-[1rem] border border-white/12 bg-[rgba(8,20,34,0.94)] px-3 py-3 text-sm font-bold text-white shadow-[0_12px_24px_-20px_rgba(56,189,248,0.45)]">
            <span className="min-w-0 truncate">{selectedMatchLabel}</span>
            <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-white/56" />
          </div>
          <select
            value={selectedMatchId ?? ""}
            onChange={(event) => onSelectMatch(event.target.value || null)}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[1rem] opacity-0"
          >
            {matchOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </label>

      {lens ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.55),rgba(2,8,23,0.24))] p-3 sm:p-4">
            <div className="space-y-1">
              <h2 className="text-lg font-black tracking-[-0.04em] text-white sm:text-[1.35rem]">{lens.title}</h2>
              {lens.kickoffLabel ? <p className="text-sm font-semibold text-white/58">{lens.kickoffLabel}</p> : null}
              <p className="text-sm font-semibold text-sky-100/92">{buildLensHeadline(lens, language)}</p>
            </div>

            <div className="mt-4">
              <MatchScopeDisplay lens={lens} activeSignals={primarySignals} language={language} />
            </div>

            {footerLines.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-white/62">
                {footerLines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="divide-y divide-white/10 border-t border-white/10">
            {primarySignals.map((signal) => (
              <SignalLensRow
                key={signal.id}
                signal={signal}
                onUpdate={(storedValue) => {
                  if (signal.controlId) {
                    onUpdateAttention(signal.controlId, storedValue);
                  }
                }}
                language={language}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-white/10 pt-4">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/46">
                {predictionLabLabel(language, "matchLens.title")}
              </p>
              <p className="text-sm font-semibold text-white/68">
                {groupName
                  ? predictionLabLabel(language, "matchLens.crowdGroup", { groupName })
                  : predictionLabLabel(language, "matchLens.crowdFallback")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onResetSettings}
                className="inline-flex items-center gap-1 rounded-full border border-white/14 bg-white/6 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/78 transition hover:border-sky-300/50 hover:text-white"
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                {predictionLabLabel(language, "matchLens.reset")}
              </button>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${
                  saveState === "error"
                    ? "border-rose-300/40 bg-rose-500/14 text-rose-100"
                    : saveState === "saving"
                      ? "border-sky-300/35 bg-sky-500/16 text-sky-100"
                      : saveState === "dirty"
                        ? "border-amber-300/35 bg-amber-500/12 text-amber-100"
                        : "border-white/14 bg-white/6 text-white/72"
                }`}
                aria-live="polite"
              >
                {canPersist ? saveStateLabel : predictionLabLabel(language, "matchLens.preview")}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-4 text-sm font-semibold leading-6 text-white/78">
          {predictionLabLabel(language, "matchLens.empty")}
        </div>
      )}
    </section>
  );
}

function MatchScopeDisplay({
  lens,
  activeSignals,
  language
}: {
  lens: PredictionLabMatchLensView;
  activeSignals: PredictionLabSignalRow[];
  language: string;
}) {
  const compositePercent = leanToPercent(lens.compositeLean ?? 0);
  const crowdPercent = lens.crowdLean === null ? null : leanToPercent(lens.crowdLean);
  const publicPercent = lens.publicLean === null ? null : leanToPercent(lens.publicLean);
  const bandWidth = Math.max(16, lens.compositeBandWidth);
  const outerCloudWidth = Math.max(18, bandWidth * 0.68);
  const innerCloudWidth = Math.max(10, bandWidth * 0.42);
  const bracketPickPercent =
    lens.bracketPickTeamId === lens.homeTeam.teamId
      ? 16
      : lens.bracketPickTeamId === lens.awayTeam.teamId
        ? 84
        : null;
  const beamRows = [22, 40, 58, 74];

  return (
    <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(14,116,144,0.22),transparent_46%),linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,8,23,0.96))] p-3 sm:p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.05),transparent_38%),linear-gradient(180deg,transparent,rgba(2,8,23,0.34))]" />
      <div className="absolute left-1/2 top-[56%] h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/8 sm:h-36 sm:w-36" />
      <div className="absolute left-1/2 top-[56%] h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/6 sm:h-60 sm:w-60" />
      <div className="absolute left-1/2 top-4 bottom-4 w-px -translate-x-1/2 bg-white/8" />
      <div className="absolute inset-x-4 top-[56%] h-px -translate-y-1/2 bg-white/8" />

      <div className="relative z-10 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/48">
        <span className="min-w-0 truncate">
          <span className="inline-flex items-center gap-1">
            <TeamFlag
              flagEmoji={lens.homeTeam.flagEmoji}
              teamId={lens.homeTeam.teamId}
              shortName={lens.homeTeam.shortName}
              teamName={lens.homeTeam.name}
              className="h-[1em] w-[1.45em]"
            />
            <span>{lens.homeTeam.shortName}</span>
          </span>
        </span>
        <span>{predictionLabLabel(language, "matchLens.even")}</span>
        <span className="min-w-0 truncate text-right">
          <span className="inline-flex items-center gap-1">
            <span>{lens.awayTeam.shortName}</span>
            <TeamFlag
              flagEmoji={lens.awayTeam.flagEmoji}
              teamId={lens.awayTeam.teamId}
              shortName={lens.awayTeam.shortName}
              teamName={lens.awayTeam.name}
              className="h-[1em] w-[1.45em]"
            />
          </span>
        </span>
      </div>

      <svg
        viewBox="0 0 100 100"
        className="relative z-10 mt-2 h-[240px] w-full sm:h-[280px]"
        aria-label={predictionLabLabel(language, "matchLens.landingZone")}
      >
        {activeSignals.map((signal, index) => {
          const tone = SIGNAL_SCOPE_TONES[signal.id];
          const targetX = leanToPercent(signal.lean ?? 0);
          const sourceX = (signal.lean ?? 0) <= 0 ? 7 : 93;
          const sourceY = beamRows[index] ?? 82;
          const intensity = Math.max(0.18, Math.min(1, signal.attentionWeight / 2.2));
          const confidence = Math.max(0.28, signal.confidence);

          return (
            <g key={signal.id}>
              <line
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={56}
                stroke={tone.beamSoft}
                strokeWidth={12 + intensity * 6}
                strokeLinecap="round"
              />
              <line
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={56}
                stroke={tone.beam}
                strokeWidth={3 + intensity * 1.8}
                strokeOpacity={0.56 + confidence * 0.24}
                strokeLinecap="round"
              />
              <circle cx={sourceX} cy={sourceY} r={1.5 + intensity * 0.8} fill={tone.dot} fillOpacity={0.95} />
            </g>
          );
        })}

        <ellipse cx={compositePercent} cy="56" rx={outerCloudWidth} ry="16" fill="rgba(125,211,252,0.08)" />
        <ellipse cx={compositePercent} cy="56" rx={innerCloudWidth + 8} ry="11" fill="rgba(125,211,252,0.18)" />
        <ellipse cx={compositePercent} cy="56" rx={innerCloudWidth} ry="7" fill="rgba(224,242,254,0.72)" />
        <circle cx={compositePercent} cy="56" r="2.7" fill="#f8fafc" />

        {crowdPercent !== null ? (
          <>
            <circle
              cx={crowdPercent}
              cy="78"
              r="3.4"
              fill="rgba(2,6,23,0.95)"
              stroke="rgba(226,232,240,0.72)"
              strokeWidth="1.6"
            />
            <circle
              cx={crowdPercent}
              cy="78"
              r="6.1"
              fill="none"
              stroke="rgba(226,232,240,0.18)"
              strokeWidth="0.9"
              strokeDasharray="1.6 1.7"
            />
          </>
        ) : null}

        {publicPercent !== null ? (
          <>
            <circle
              cx={publicPercent}
              cy="68"
              r="3.1"
              fill="rgba(2,6,23,0.96)"
              stroke="rgba(253,164,175,0.92)"
              strokeWidth="1.5"
            />
            <circle
              cx={publicPercent}
              cy="68"
              r="5.6"
              fill="none"
              stroke="rgba(253,164,175,0.2)"
              strokeWidth="0.9"
              strokeDasharray="1.5 1.7"
            />
          </>
        ) : null}

        {bracketPickPercent !== null ? (
          <path
            d={`M ${bracketPickPercent} 18 l -2.5 -4.2 h 5 z`}
            fill="#fbbf24"
            stroke="rgba(255,255,255,0.88)"
            strokeWidth="0.7"
          />
        ) : null}

        <line x1="4" y1="90" x2="96" y2="90" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

function SignalLensRow({
  signal,
  onUpdate,
  language
}: {
  signal: PredictionLabSignalRow;
  onUpdate: (storedValue: number) => void;
  language: string;
}) {
  const tone = SIGNAL_SCOPE_TONES[signal.id];

  return (
    <section className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              backgroundColor: tone.accent,
              boxShadow: `0 0 18px ${tone.beamSoft}`
            }}
          />
          <p className="text-sm font-black text-white">{signal.label}</p>
        </div>
        <p className="mt-1 text-xs font-semibold leading-5 text-white/62">{signal.evidence}</p>
      </div>

      <AttentionLever signal={signal} tone={tone} onUpdate={onUpdate} language={language} />
    </section>
  );
}

function AttentionLever({
  signal,
  tone,
  onUpdate,
  language
}: {
  signal: PredictionLabSignalRow;
  tone: (typeof SIGNAL_SCOPE_TONES)[PredictionLabSignalRow["id"]];
  onUpdate: (storedValue: number) => void;
  language: string;
}) {
  const selectedIndex = Math.max(
    0,
    PREDICTION_LAB_ATTENTION_PRESETS.findIndex((preset) => preset.id === signal.attentionLevel)
  );
  const maxIndex = Math.max(1, PREDICTION_LAB_ATTENTION_PRESETS.length - 1);
  const fillRatio = selectedIndex / maxIndex;
  const leverStyle = {
    "--prediction-lab-lever-accent": tone.accent
  } as CSSProperties;

  return (
    <div className="min-w-0 space-y-1.5" style={leverStyle}>
      <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/46">
        <span className="truncate">{signal.sourceLabel}</span>
        <span>{predictionLabLabel(language, `attention.${signal.attentionLevel}`)}</span>
      </div>

      <div className="relative h-9">
        <span className="absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-white/12" />
        <span
          className="absolute left-1 top-1/2 h-[2px] -translate-y-1/2 rounded-full"
          style={{
            width: `calc((100% - 0.5rem) * ${fillRatio})`,
            background: tone.fill
          }}
        />

        {PREDICTION_LAB_ATTENTION_PRESETS.map((preset, index) => (
          <span
            key={`${signal.id}-${preset.id}`}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/28 bg-[#031424] shadow-[0_8px_18px_-16px_rgba(255,255,255,0.5)]"
            style={{
              left: `calc(0.25rem + (100% - 0.5rem) * ${index / maxIndex})`,
              backgroundColor: index <= selectedIndex ? tone.dot : "#031424",
              opacity: 1
            }}
          />
        ))}

        <input
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={selectedIndex}
          onChange={(event) => {
            const nextPreset = PREDICTION_LAB_ATTENTION_PRESETS[Number(event.currentTarget.value)];
            if (nextPreset) {
              onUpdate(nextPreset.stored);
            }
          }}
          aria-label={signal.label}
          className="prediction-lab-lever absolute inset-0"
        />
      </div>

      <div className="flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-white/36">
        <span>0</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
      </div>
    </div>
  );
}

function SupplementalSignalsCard({
  signals,
  groupName,
  canShowAverage,
  language
}: {
  signals: PredictionLabSignalRow[];
  groupName: string | null;
  canShowAverage: boolean;
  language: string;
}) {
  if (signals.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[1.2rem] border border-gray-200 bg-white p-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">
          {predictionLabLabel(language, "matchLens.moreSignals")}
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-700">
          {groupName && !canShowAverage
            ? predictionLabLabel(language, "matchLens.moreSignalsHint", { groupName })
            : predictionLabLabel(language, "matchLens.moreSignalsFallback")}
        </p>
      </div>

      <div className="mt-4 divide-y divide-gray-200">
        {[...signals]
          .sort((left, right) => Number(right.id === "publicPulse") - Number(left.id === "publicPulse"))
          .map((signal) => (
          <div key={signal.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SIGNAL_SCOPE_TONES[signal.id].accent }} />
                <p className="text-sm font-black text-gray-950">{signal.label}</p>
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-gray-600">{signal.evidence}</p>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-500 sm:text-right">
              {signal.sourceLabel}
            </p>
          </div>
          ))}
      </div>
    </section>
  );
}

function buildLensHeadline(lens: PredictionLabMatchLensView, language: string) {
  const lean = lens.compositeLean;
  if (lean === null) {
    return predictionLabLabel(language, "matchLens.noSignals");
  }

  const subject = predictionLabLabel(language, "matchLens.title");
  const favoredTeam = lean < 0 ? lens.homeTeam.shortName : lens.awayTeam.shortName;
  const magnitude = Math.abs(lean);
  const leanLabel =
    magnitude < 8
      ? predictionLabLabel(language, "lean.even", { subject })
      : magnitude < 20
        ? predictionLabLabel(language, "lean.slight", { subject, team: favoredTeam })
        : magnitude < 40
          ? predictionLabLabel(language, "lean.lean", { subject, team: favoredTeam })
          : predictionLabLabel(language, "lean.strong", { subject, team: favoredTeam });

  return `${leanLabel} · ${lens.agreementLabel}`;
}

function leanToPercent(lean: number) {
  return Math.max(0, Math.min(100, 50 + lean / 2));
}

function arePredictionLabSettingsEqual(left: PredictionLabSettings, right: PredictionLabSettings) {
  return (
    left.scheduleLoad === right.scheduleLoad &&
    left.availability === right.availability &&
    left.formQuality === right.formQuality &&
    left.crowdPulse === right.crowdPulse
  );
}
