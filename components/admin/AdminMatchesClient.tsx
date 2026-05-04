"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAdminMatches, type AdminMatch } from "@/lib/admin-data";
import {
  repairKnockoutAdvancementAction,
  rescoreKnockoutScoresAction,
  scoreFinalizedGroupMatch,
  seedKnockoutFromGroupStageAction,
  updateAdminMatchResultAction
} from "@/app/admin/actions";
import { showAppToast } from "@/lib/app-toast";
import { formatMatchStage } from "@/lib/match-stage";
import { getPredictionStateLabel } from "@/lib/prediction-state";
import type { MatchStage, MatchStatus } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminInvitesClient";

const stageSortOrder: Record<MatchStage, number> = {
  group: 0,
  round_of_32: 1,
  r32: 2,
  round_of_16: 3,
  r16: 4,
  quarterfinal: 5,
  qf: 6,
  semifinal: 7,
  sf: 8,
  third: 9,
  final: 10
};

export function AdminMatchesClient() {
  const expectedGroupMatchCount = 72;
  const router = useRouter();
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<"all" | MatchStage>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [isSeedingKnockout, setIsSeedingKnockout] = useState(false);
  const [isConfirmingReseed, setIsConfirmingReseed] = useState(false);
  const [isRescoringKnockout, setIsRescoringKnockout] = useState(false);
  const [isRepairingKnockout, setIsRepairingKnockout] = useState(false);

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadMatches() {
    setIsLoading(true);
    try {
      setMatches(await fetchAdminMatches());
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }

  const stageOptions = useMemo(
    () =>
      ["all", ...Array.from(new Set(matches.map((match) => match.stage))).sort(compareStageValues)] as Array<
        "all" | MatchStage
      >,
    [matches]
  );
  const dateOptions = useMemo(
    () => Array.from(new Set(matches.map((match) => getLocalMatchDateKey(match.kickoffTime)))).sort(),
    [matches]
  );
  const filteredMatches = useMemo(() => {
    const nextMatches = matches
      .filter((match) => {
        const stageMatches = stageFilter === "all" || match.stage === stageFilter;
        const dateMatches = dateFilter === "all" || getLocalMatchDateKey(match.kickoffTime) === dateFilter;
        return stageMatches && dateMatches;
      })
      .sort(compareAdminMatches);

    if (process.env.NODE_ENV !== "production") {
      console.debug("[admin-matches:filters]", {
        selectedStage: stageFilter,
        selectedDate: dateFilter,
        query: {
          stage: stageFilter === "all" ? null : stageFilter,
          localDate: dateFilter === "all" ? null : dateFilter
        },
        returnedRowCount: nextMatches.length
      });
    }

    return nextMatches;
  }, [dateFilter, matches, stageFilter]);
  const knockoutSeedStatus = useMemo(() => {
    const groupMatches = matches.filter((match) => match.stage === "group");
    const finalGroupMatchCount = groupMatches.filter((match) => match.status === "final").length;
    const roundOf32Matches = matches.filter((match) => match.stage === "r32" || match.stage === "round_of_32");
    const seededRoundOf32Count = roundOf32Matches.filter((match) => match.homeTeamId && match.awayTeamId).length;
    const hasAnySeeds = roundOf32Matches.some((match) => match.homeTeamId || match.awayTeamId);
    const hasKnockoutStarted = roundOf32Matches.some((match) => match.status !== "scheduled");
    const isReady = finalGroupMatchCount >= expectedGroupMatchCount;

    return {
      finalGroupMatchCount,
      expectedGroupMatchCount,
      roundOf32Count: roundOf32Matches.length,
      seededRoundOf32Count,
      hasAnySeeds,
      hasKnockoutStarted,
      isReady,
      canSeed: roundOf32Matches.length > 0 && isReady && !hasKnockoutStarted
    };
  }, [matches]);
  const finalizedKnockoutCount = useMemo(
    () => matches.filter((match) => match.stage !== "group" && match.status === "final").length,
    [matches]
  );

  useEffect(() => {
    if (!knockoutSeedStatus.hasAnySeeds || knockoutSeedStatus.hasKnockoutStarted || !knockoutSeedStatus.isReady) {
      setIsConfirmingReseed(false);
    }
  }, [
    knockoutSeedStatus.hasAnySeeds,
    knockoutSeedStatus.hasKnockoutStarted,
    knockoutSeedStatus.isReady
  ]);

  async function handleSeedKnockout(force = false) {
    setIsSeedingKnockout(true);

    try {
      const result = await seedKnockoutFromGroupStageAction(force);
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });

      if (result.ok) {
        setIsConfirmingReseed(false);
        await loadMatches();
        router.refresh();
        return;
      }

      if (result.alreadySeeded) {
        setIsConfirmingReseed(true);
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsSeedingKnockout(false);
    }
  }

  async function handleRescoreKnockout() {
    setIsRescoringKnockout(true);

    try {
      const result = await rescoreKnockoutScoresAction();
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });

      if (result.ok) {
        await loadMatches();
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsRescoringKnockout(false);
    }
  }

  async function handleRepairKnockout() {
    setIsRepairingKnockout(true);

    try {
      const result = await repairKnockoutAdvancementAction();
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });

      if (result.ok) {
        await loadMatches();
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsRepairingKnockout(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminHeader eyebrow="Matches" title="Update match results." />

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Seeding</p>
            <h3 className="text-lg font-black text-gray-950">Seed knockout from group results</h3>
            <p className="text-sm font-semibold text-gray-600">
              {knockoutSeedStatus.hasKnockoutStarted
                ? "Round of 32 matches have already started. Automatic seeding is locked."
                : !knockoutSeedStatus.isReady
                  ? `Finalize all ${knockoutSeedStatus.expectedGroupMatchCount} group-stage matches before seeding the Round of 32.`
                  : knockoutSeedStatus.hasAnySeeds
                    ? "Group-stage results are complete and knockout matches already exist. Re-seeding may overwrite current Round of 32 team assignments."
                    : `All ${knockoutSeedStatus.expectedGroupMatchCount} group-stage matches are final. Round of 32 can now be seeded.`}
            </p>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              disabled={isSeedingKnockout || !knockoutSeedStatus.canSeed}
              onClick={() => void handleSeedKnockout(isConfirmingReseed)}
              className="rounded-md bg-accent px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
            >
              {isSeedingKnockout
                ? isConfirmingReseed || knockoutSeedStatus.hasAnySeeds
                  ? "Reseeding..."
                  : "Seeding..."
                : knockoutSeedStatus.hasKnockoutStarted
                  ? "Knockout seeding locked"
                  : !knockoutSeedStatus.isReady
                    ? "Knockout seeding not ready"
                    : knockoutSeedStatus.hasAnySeeds
                      ? "Re-seed knockout?"
                      : "Seed knockout"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Advancement</p>
            <h3 className="text-lg font-black text-gray-950">Repair knockout bracket</h3>
            <p className="text-sm font-semibold text-gray-600">
              Rebuild downstream knockout slots from finalized winners so admin tools and the player bracket read the
              same populated teams.
            </p>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              disabled={isRepairingKnockout}
              onClick={() => void handleRepairKnockout()}
              className="rounded-md bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
            >
              {isRepairingKnockout ? "Repairing..." : "Repair knockout bracket"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Scoring</p>
            <h3 className="text-lg font-black text-gray-950">Rescore finalized knockout matches</h3>
            <p className="text-sm font-semibold text-gray-600">
              Recalculate bracket scores for all finalized knockout matches using the current knockout scoring rules.
              This updates saved bracket points without changing predictions or match results.
            </p>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {finalizedKnockoutCount} finalized knockout {finalizedKnockoutCount === 1 ? "match" : "matches"} ready
            </p>
          </div>
          <div className="shrink-0">
            <button
              type="button"
              disabled={isRescoringKnockout || finalizedKnockoutCount === 0}
              onClick={() => void handleRescoreKnockout()}
              className="rounded-md bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
            >
              {isRescoringKnockout ? "Rescoring..." : "Rescore knockout"}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
        <label>
          <span className="text-sm font-bold text-gray-700">Stage</span>
          <select
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as "all" | MatchStage)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base"
          >
            {stageOptions.map((stage) => (
              <option key={stage} value={stage}>
                {stage === "all" ? "All stages" : formatStage(stage)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-bold text-gray-700">Date</span>
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base"
          >
            <option value="all">All dates</option>
            {dateOptions.map((date) => (
              <option key={date} value={date}>
                {formatDateTime(`${date}T12:00:00Z`, false)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading ? <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading matches...</p> : null}

      <section className="space-y-3">
        {filteredMatches.map((match) => (
          <MatchResultCard
            key={match.id}
            match={match}
            onSaved={(updatedMatch) => {
              setMatches((currentMatches) =>
                currentMatches.map((currentMatch) => (currentMatch.id === updatedMatch.id ? updatedMatch : currentMatch))
              );
              showAppToast({ tone: "success", text: "Match updated." });
            }}
            onScored={(text) => showAppToast({ tone: "success", text })}
            onError={(text) => showAppToast({ tone: "error", text })}
          />
        ))}
      </section>
    </div>
  );
}

type MatchResultCardProps = {
  match: AdminMatch;
  onSaved: (match: AdminMatch) => void;
  onScored: (message: string) => void;
  onError: (message: string) => void;
};

function MatchResultCard({ match, onSaved, onScored, onError }: MatchResultCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [homeScore, setHomeScore] = useState(match.homeScore?.toString() ?? "0");
  const [awayScore, setAwayScore] = useState(match.awayScore?.toString() ?? "0");
  const [isSaving, setIsSaving] = useState(false);
  const isFinalized = status === "final";
  const isLive = status === "live";
  const predictionStateLabel = getPredictionStateLabel(status);
  const homeLabel = getSideLabel(match, "home");
  const awayLabel = getSideLabel(match, "away");
  const resolvedWinnerTeamId = getResolvedWinnerTeamId(match, homeScore, awayScore);
  const resolvedWinnerLabel = getResolvedWinnerLabel(match, resolvedWinnerTeamId);
  const hasUnsavedChanges =
    status !== match.status ||
    homeScore !== (match.homeScore?.toString() ?? "0") ||
    awayScore !== (match.awayScore?.toString() ?? "0");

  useEffect(() => {
    setStatus(match.status);
    setHomeScore(match.homeScore === undefined ? "0" : String(match.homeScore));
    setAwayScore(match.awayScore === undefined ? "0" : String(match.awayScore));
  }, [match]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const updateResult = await updateAdminMatchResultAction({
        id: match.id,
        status,
        homeScore: homeScore === "" ? undefined : Number(homeScore),
        awayScore: awayScore === "" ? undefined : Number(awayScore),
        winnerTeamId: resolvedWinnerTeamId
      });

      if (!updateResult.ok) {
        onError(updateResult.message);
        return;
      }

      const updatedMatch: AdminMatch = {
        ...match,
        ...updateResult.match,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam
      };

      onSaved(updatedMatch);

      if (updatedMatch.status === "final") {
        const scoringResult = await scoreFinalizedGroupMatch(updatedMatch.id);
        if (!scoringResult.ok) {
          onError(scoringResult.message);
          return;
        }

        onScored(scoringResult.message);
        router.refresh();
      }
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-lg border p-4 transition-colors ${
        isFinalized
          ? "border-gray-300 bg-gray-100"
          : isLive
            ? "border-amber-200 bg-amber-50"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-700" : "text-gray-500"
            }`}
          >
            {formatStage(match.stage)} {match.groupName ? `- Group ${match.groupName}` : ""}
          </p>
          {isFinalized ? (
            <span className="mt-2 inline-flex items-center rounded-md bg-gray-200 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-gray-700">
              Finalized
            </span>
          ) : null}
          <h3
            className={`mt-1 text-lg font-black ${
              isFinalized ? "text-gray-800" : isLive ? "text-amber-950" : "text-gray-950"
            }`}
          >
            {homeLabel.short} vs {awayLabel.short}
          </h3>
          <p
            className={`mt-1 text-sm font-semibold ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-900" : "text-gray-700"
            }`}
          >
            {homeLabel.full} vs {awayLabel.full}
          </p>
          <p
            className={`mt-1 text-sm font-semibold ${
              isFinalized ? "text-gray-500" : isLive ? "text-amber-800" : "text-gray-500"
            }`}
          >
            {formatDateTime(match.kickoffTime)}
          </p>
          <div
            className={`mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold ${
              isFinalized ? "text-gray-500" : isLive ? "text-amber-800" : "text-gray-500"
            }`}
          >
            <span>
              Match ID: {match.id}
              {match.updatedAt ? ` / Updated ${formatDateTime(match.updatedAt)}` : ""}
            </span>
            {isFinalized ? (
              <span className="inline-flex items-center rounded-md bg-gray-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-gray-700">
                Finalized
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${
              isFinalized
                ? "bg-gray-200 text-gray-700"
                : isLive
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {formatMatchStatus(status)}
          </span>
          <span
            className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${
              isFinalized
                ? "bg-gray-700 text-gray-100"
                : isLive
                  ? "bg-amber-200 text-amber-900"
                  : "bg-accent-light text-accent-dark"
            }`}
          >
            {predictionStateLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label>
          <span
            className={`text-sm font-bold ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-900" : "text-gray-700"
            }`}
          >
            Status
          </span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as MatchStatus)}
            className={`mt-2 w-full rounded-md border px-3 py-3 text-base ${
              isFinalized
                ? "border-gray-300 bg-gray-50 text-gray-800"
                : isLive
                  ? "border-amber-200 bg-white text-gray-900"
                  : "border-gray-300 bg-white"
            }`}
          >
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
            <option value="final">Final</option>
          </select>
        </label>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <ScoreInput label={homeLabel.short} value={homeScore} onChange={setHomeScore} isFinalized={isFinalized} />
          <span
            className={`pb-3 text-sm font-black ${
              isFinalized ? "text-gray-500" : isLive ? "text-amber-700" : "text-gray-400"
            }`}
          >
            vs
          </span>
          <ScoreInput label={awayLabel.short} value={awayScore} onChange={setAwayScore} isFinalized={isFinalized} />
        </div>

        <div
          className={`rounded-md px-3 py-2 ${
            isFinalized ? "bg-gray-200" : isLive ? "bg-amber-100" : "bg-gray-50"
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wide ${
              isFinalized ? "text-gray-600" : isLive ? "text-amber-800" : "text-gray-500"
            }`}
          >
            Winner
          </p>
          <p
            className={`mt-1 text-sm font-black ${
              isFinalized ? "text-gray-800" : isLive ? "text-amber-950" : "text-gray-900"
            }`}
          >
            {resolvedWinnerLabel}
          </p>
          {homeScore !== "" && awayScore !== "" && resolvedWinnerTeamId === null ? (
            <p
              className={`mt-1 text-xs font-semibold ${
                isFinalized ? "text-gray-600" : isLive ? "text-amber-800" : "text-gray-500"
              }`}
            >
              Scores are equal. Winner will be saved as blank for a group-stage draw.
            </p>
          ) : null}
          </div>

        <button
          type="submit"
          disabled={isSaving || !hasUnsavedChanges}
          className={`w-full rounded-md px-4 py-3 text-base font-bold ${
            isSaving || !hasUnsavedChanges
              ? "bg-gray-300 text-gray-600"
              : "bg-accent text-white"
          }`}
        >
          {isSaving ? "Saving..." : "Save Match"}
        </button>
      </div>
    </form>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
  isFinalized
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isFinalized?: boolean;
}) {
  return (
    <label>
      <span className={`text-xs font-bold uppercase tracking-wide ${isFinalized ? "text-gray-600" : "text-gray-500"}`}>
        {label}
      </span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full rounded-md border px-3 py-3 text-center text-xl font-black ${
          isFinalized ? "border-gray-300 bg-white text-gray-800" : "border-gray-300 bg-white"
        }`}
      />
    </label>
  );
}

function getResolvedWinnerTeamId(match: AdminMatch, homeScore: string, awayScore: string) {
  if (homeScore === "" || awayScore === "") {
    return undefined;
  }

  const home = Number(homeScore);
  const away = Number(awayScore);

  if (home === away) {
    return null;
  }

  if (home > away) {
    return match.homeTeamId;
  }

  return match.awayTeamId;
}

function getResolvedWinnerLabel(match: AdminMatch, winnerTeamId: string | null | undefined) {
  if (winnerTeamId === undefined) {
    return "Enter scores to calculate winner";
  }

  if (winnerTeamId === null) {
    return "Draw";
  }

  if (winnerTeamId === match.homeTeamId) {
    return getSideLabel(match, "home").full;
  }

  if (winnerTeamId === match.awayTeamId) {
    return getSideLabel(match, "away").full;
  }

  return "Winner unavailable";
}

function getSideLabel(match: AdminMatch, side: "home" | "away") {
  const team = side === "home" ? match.homeTeam : match.awayTeam;
  const source = side === "home" ? match.homeSource : match.awaySource;
  const fallback = side === "home" ? "Home Team" : "Away Team";

  if (team) {
    const shortName = team.shortName || source || fallback;
    const fullName = team.name || shortName;

    return {
      short: `${team.flagEmoji ? `${team.flagEmoji} ` : ""}${shortName}`,
      full: fullName
    };
  }

  const label = source || fallback;

  return {
    short: label,
    full: label
  };
}

function formatStage(stage: MatchStage) {
  return formatMatchStage(stage);
}

function getLocalMatchDateKey(kickoffTime: string) {
  const kickoffDate = new Date(kickoffTime);
  const year = kickoffDate.getFullYear();
  const month = String(kickoffDate.getMonth() + 1).padStart(2, "0");
  const day = String(kickoffDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareStageValues(left: MatchStage, right: MatchStage) {
  return (stageSortOrder[left] ?? 999) - (stageSortOrder[right] ?? 999);
}

function compareAdminMatches(left: AdminMatch, right: AdminMatch) {
  const kickoffCompare = left.kickoffTime.localeCompare(right.kickoffTime);
  if (kickoffCompare !== 0) {
    return kickoffCompare;
  }

  const stageCompare = compareStageValues(left.stage, right.stage);
  if (stageCompare !== 0) {
    return stageCompare;
  }

  const groupCompare = (left.groupName ?? "").localeCompare(right.groupName ?? "", undefined, {
    numeric: true,
    sensitivity: "base"
  });
  if (groupCompare !== 0) {
    return groupCompare;
  }

  return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" });
}

function formatMatchStatus(status: MatchStatus) {
  if (status === "live") {
    return "Live";
  }

  if (status === "final") {
    return "Final";
  }

  return "Scheduled";
}

function formatDateTime(value: string, includeTime = true) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {})
  }).format(date);
}
