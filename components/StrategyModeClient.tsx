"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Heart, TrendingDown, TrendingUp } from "lucide-react";
import { saveStrategyModeEntryAction } from "@/app/strategy/actions";
import { TeamFlag } from "@/components/TeamFlag";
import { showAppToast } from "@/lib/app-toast";
import {
  clampGroupStrategyAdjustments,
  countUsedFades,
  countUsedStrategyPoints,
  getGroupStrategyBucket,
  getGroupStrategyProbabilityMessage,
  summarizeGroupStrategyReceipt,
  type GroupStrategyAdjustmentMap,
  type GroupStrategyBucket
} from "@/lib/global-challenge";
import {
  getModePreviewConflictMessage,
  getTournamentLockMessage,
  hasGroupPhaseStarted,
  GROUP_STRATEGY_MAX_FADES,
  GROUP_STRATEGY_MAX_POINTS_PER_TEAM,
  STRATEGY_TOTAL_BELIEF_POINTS,
  type TournamentEntryMode,
  type TournamentEntryState
} from "@/lib/play-mode";
import type { Team } from "@/lib/types";

const BUCKET_COPY: Record<GroupStrategyBucket, { title: string; description: string }> = {
  favorites: {
    title: "Favorites to qualify",
    description: "Teams the baseline already trusts."
  },
  contenders: {
    title: "Contenders",
    description: "Strong teams that still need a good group phase."
  },
  bubble: {
    title: "Bubble teams",
    description: "Likely fight for the last safe spots."
  },
  longshots: {
    title: "Longshots",
    description: "Need a real outperforming run to get through."
  }
};

export function StrategyModeClient({
  teams,
  initialAdjustments,
  initialHeartPickTeamId,
  tournamentEntryMode
}: {
  teams: Team[];
  initialAdjustments: GroupStrategyAdjustmentMap;
  initialHeartPickTeamId?: string | null;
  tournamentEntryMode: TournamentEntryMode | null;
  tournamentEntryState: TournamentEntryState | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const [isPending, startTransition] = useTransition();
  const [adjustments, setAdjustments] = useState<GroupStrategyAdjustmentMap>(() => clampGroupStrategyAdjustments(initialAdjustments));
  const [heartPickTeamId, setHeartPickTeamId] = useState<string | null>(initialHeartPickTeamId ?? null);
  const isLocked = hasGroupPhaseStarted();
  const conflictMessage = getModePreviewConflictMessage(
    tournamentEntryMode === "easy_bracket" || tournamentEntryMode === "strategy_mode" ? tournamentEntryMode : null,
    "strategy_mode"
  );
  const usedPoints = countUsedStrategyPoints(adjustments);
  const usedFades = countUsedFades(adjustments);
  const remainingPoints = Math.max(0, STRATEGY_TOTAL_BELIEF_POINTS - usedPoints);
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const bucketedTeams = useMemo(() => {
    const buckets = new Map<GroupStrategyBucket, Team[]>([
      ["favorites", []],
      ["contenders", []],
      ["bubble", []],
      ["longshots", []]
    ]);

    for (const team of teams) {
      buckets.get(getGroupStrategyBucket(team))?.push(team);
    }

    return buckets;
  }, [teams]);
  const receipt = useMemo(
    () => summarizeGroupStrategyReceipt({ teamsById, adjustments, heartPickTeamId }),
    [teamsById, adjustments, heartPickTeamId]
  );
  const probabilityMessage = getGroupStrategyProbabilityMessage(false);

  function updateAdjustment(teamId: string, nextMode: "about_right" | "trust_more" | "high_upside" | "fade", points = 1) {
    setAdjustments((current) => {
      const draft = { ...current };
      if (nextMode === "about_right") {
        delete draft[teamId];
        return clampGroupStrategyAdjustments(draft);
      }

      draft[teamId] = nextMode === "fade" ? { mode: "fade" } : { mode: nextMode, points };
      return clampGroupStrategyAdjustments(draft);
    });
  }

  function handleSave(activate: boolean) {
    startTransition(async () => {
      const result = await saveStrategyModeEntryAction({
        adjustments,
        heartPickTeamId,
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
    <section className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-2xl border border-accent-light bg-accent-light/20 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Global Challenge</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Build your Group Strategy</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">
          Show us which teams you believe are strong enough to reach the knockout stage.
        </p>
        <p className="mt-3 text-sm font-medium leading-6 text-gray-600">
          Start with the model&apos;s view, then adjust the teams you think are stronger, weaker, underrated, or overrated.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-gray-700">
            Group Strategy first
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-gray-700">
            Knockout Picks later
          </span>
        </div>
        <div className="mt-4">
          <a
            href="#team-strength-board"
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-black text-accent-text transition hover:bg-accent/95"
          >
            Build My Strategy
          </a>
        </div>
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

      <div id="team-strength-board" className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-gray-950">Team Strength Board</h2>
            <p className="mt-2 text-sm font-semibold text-gray-600">
              You can&apos;t be high on everyone. Use your Strategy Points on teams you believe in.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-gray-700">
              Strategy Points: {remainingPoints} / {STRATEGY_TOTAL_BELIEF_POINTS} remaining
            </span>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-gray-700">
              {usedFades}/{GROUP_STRATEGY_MAX_FADES} fades
            </span>
          </div>
        </div>
      </div>

      {(["favorites", "contenders", "bubble", "longshots"] as GroupStrategyBucket[]).map((bucket) => {
        const bucketTeams = bucketedTeams.get(bucket) ?? [];
        if (bucketTeams.length === 0) {
          return null;
        }

        return (
          <div key={bucket} className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-gray-950">{BUCKET_COPY[bucket].title}</h2>
                <p className="mt-2 text-sm font-semibold text-gray-600">{BUCKET_COPY[bucket].description}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-gray-700">
                {bucketTeams.length} teams
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {bucketTeams.map((team) => {
                const adjustment = adjustments[team.id];
                const mode = adjustment?.mode ?? "about_right";
                const points = adjustment?.points ?? 1;
                const isHeartPick = heartPickTeamId === team.id;

                return (
                  <div key={team.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-gray-950">
                          <span className="inline-flex items-center gap-1.5">
                            <TeamFlag
                              flagEmoji={team.flagEmoji}
                              teamId={team.id}
                              shortName={team.shortName}
                              teamName={team.name}
                              className="h-[1em] w-[1.45em]"
                            />
                            <span>{team.name}</span>
                          </span>
                        </p>
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                          {BUCKET_COPY[bucket].title} · Group {team.groupName} · FIFA Rank {team.fifaRank}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHeartPickTeamId((current) => (current === team.id ? null : team.id))}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide transition ${
                          isHeartPick
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-gray-300 bg-white text-gray-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        }`}
                      >
                        <Heart className="h-3.5 w-3.5" />
                        Heart Pick
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        { value: "about_right", label: "About Right", icon: Sparkles },
                        { value: "trust_more", label: "Trust More", icon: TrendingUp },
                        { value: "high_upside", label: "High Upside", icon: Sparkles },
                        { value: "fade", label: "Fade", icon: TrendingDown }
                      ].map((option) => {
                        const Icon = option.icon;
                        const isActive = mode === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={
                              isLocked ||
                              (option.value === "fade" && !isActive && usedFades >= GROUP_STRATEGY_MAX_FADES)
                            }
                            onClick={() => updateAdjustment(team.id, option.value as "about_right" | "trust_more" | "high_upside" | "fade", points)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-wide transition ${
                              isActive
                                ? "border-accent-light bg-accent-light text-accent-dark"
                                : "border-gray-300 bg-white text-gray-700 hover:border-accent hover:bg-accent-light"
                            } disabled:opacity-50`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    {mode === "trust_more" || mode === "high_upside" ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Points</span>
                        {Array.from({ length: GROUP_STRATEGY_MAX_POINTS_PER_TEAM }, (_, index) => index + 1).map((value) => {
                          const wouldUse = usedPoints - (adjustment?.mode === "fade" ? 0 : adjustment?.points ?? 0) + value;
                          const isDisabled = !isLocked && wouldUse > STRATEGY_TOTAL_BELIEF_POINTS;
                          return (
                            <button
                              key={value}
                              type="button"
                              disabled={isLocked || isDisabled}
                              onClick={() => updateAdjustment(team.id, mode, value)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                                points === value
                                  ? "border-accent bg-accent text-white"
                                  : "border-gray-300 bg-white text-gray-700 hover:border-accent hover:bg-accent-light"
                              } disabled:opacity-50`}
                            >
                              +{value}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-black text-gray-950">Here&apos;s what your Group Strategy believes.</h2>
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {probabilityMessage}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Trust More</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">
              {receipt.trustMore.length > 0 ? receipt.trustMore.join(", ") : "No extra trust added yet."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">High Upside</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">
              {receipt.highUpside.length > 0 ? receipt.highUpside.join(", ") : "No upside swings yet."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Fades</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">
              {receipt.fades.length > 0 ? receipt.fades.join(", ") : "No fades yet."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Heart Pick</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">
              {receipt.heartPick ?? "No Heart Pick selected."}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Strategy Points Used</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">{usedPoints}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-gray-500">Strategy Points Remaining</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">{remainingPoints}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={isPending || isLocked}
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
          {isPending ? "Saving..." : "Submit Group Strategy"}
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
