"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { saveStrategyModeEntryAction } from "@/app/strategy/actions";
import { showAppToast } from "@/lib/app-toast";
import {
  getModePreviewConflictMessage,
  getStrategyPresetByKey,
  getStrategyReceiptRows,
  getTournamentLockMessage,
  hasGroupPhaseStarted,
  rebalanceStrategyLevers,
  STRATEGY_PRESETS,
  STRATEGY_TOTAL_BELIEF_POINTS,
  type StrategyLeverKey,
  type StrategyLeverState,
  type StrategyPresetKey,
  type TournamentEntryMode,
  type TournamentEntryState
} from "@/lib/play-mode";

export function StrategyModeClient({
  initialPresetKey,
  initialLevers,
  tournamentEntryMode
}: {
  initialPresetKey: StrategyPresetKey;
  initialLevers: StrategyLeverState;
  tournamentEntryMode: TournamentEntryMode | null;
  tournamentEntryState: TournamentEntryState | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const [isPending, startTransition] = useTransition();
  const [selectedPresetKey, setSelectedPresetKey] = useState<StrategyPresetKey>(initialPresetKey);
  const [levers, setLevers] = useState<StrategyLeverState>(initialLevers);
  const isLocked = hasGroupPhaseStarted();
  const conflictMessage = getModePreviewConflictMessage(
    tournamentEntryMode === "easy_bracket" || tournamentEntryMode === "strategy_mode" ? tournamentEntryMode : null,
    "strategy_mode"
  );
  const selectedPreset = getStrategyPresetByKey(selectedPresetKey);
  const totalPoints = useMemo(() => Object.values(levers).reduce((sum, value) => sum + value, 0), [levers]);

  function handlePresetSelect(presetKey: StrategyPresetKey) {
    const preset = getStrategyPresetByKey(presetKey);
    setSelectedPresetKey(preset.key);
    setLevers(preset.levers);
  }

  function handleLeverChange(key: StrategyLeverKey, nextValue: number) {
    const nextState = rebalanceStrategyLevers({
      ...levers,
      [key]: Math.max(0, nextValue)
    });
    setLevers(nextState);
  }

  function handleSave(activate: boolean) {
    startTransition(async () => {
      const result = await saveStrategyModeEntryAction({
        presetKey: selectedPresetKey,
        levers,
        activate
      });

      if (!result.ok) {
        showAppToast({ tone: "error", text: result.message });
        return;
      }

      showAppToast({ tone: "success", text: result.message });
      router.refresh();
    });
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Strategy Mode</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Strategy Mode</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          You choose outcomes from probabilities rather than predicting scores.
        </p>
      </div>

      {isLocked ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
          {getTournamentLockMessage()}
        </div>
      ) : null}

      {conflictMessage && tournamentEntryMode === "easy_bracket" ? (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm font-semibold text-cyan-900">
          {conflictMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-black text-gray-950">Pick a preset</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {STRATEGY_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => handlePresetSelect(preset.key)}
              className={`rounded-2xl border p-4 text-left transition ${
                selectedPresetKey === preset.key
                  ? "border-accent bg-accent-light/20"
                  : "border-gray-200 bg-white hover:border-accent hover:bg-accent-light/10"
              }`}
            >
              <p className="text-base font-black text-gray-950">{preset.title}</p>
              <p className="mt-2 text-sm font-semibold text-gray-600">{preset.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-gray-950">Belief levers</h2>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-gray-700">
            {totalPoints}/{STRATEGY_TOTAL_BELIEF_POINTS} points
          </span>
        </div>
        <div className="mt-4 space-y-4">
          {(
            [
              ["favoriteTrust", "Favorite Trust"],
              ["pathSensitivity", "Path Sensitivity"],
              ["chaos", "Chaos"],
              ["heartFactor", "Heart Factor"],
              ["contrarianEdge", "Contrarian Edge"]
            ] as Array<[StrategyLeverKey, string]>
          ).map(([key, label]) => (
            <label key={key} className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-gray-900">{label}</span>
                <span className="text-sm font-black text-accent-dark">{levers[key]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={levers[key]}
                onChange={(event) => handleLeverChange(key, Number(event.target.value))}
                className="w-full accent-accent"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-black text-gray-950">Here&apos;s what your strategy believes.</h2>
        <p className="mt-2 text-sm font-semibold text-gray-600">{selectedPreset.description}</p>
        <div className="mt-4 space-y-3">
          {getStrategyReceiptRows().map((row) => (
            <div key={row.label} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-black text-gray-900">{row.label}</p>
              <p className="mt-1 text-sm font-medium text-gray-600">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSave(false)}
          className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save Draft"}
        </button>
        <button
          type="button"
          disabled={isPending || isLocked}
          onClick={() => handleSave(true)}
          className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-black text-white transition hover:bg-accent/95 disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Submit Strategy Mode"}
        </button>
        {isOnboarding ? (
          <Link
            href="/start-playing"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
          >
            Back
          </Link>
        ) : null}
      </div>
    </section>
  );
}
