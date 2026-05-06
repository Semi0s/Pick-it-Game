"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAdminMatches, type AdminMatch } from "@/lib/admin-data";
import {
  batchFinalizeMatchResultsAction,
  type BatchFinalizeMatchOverwriteMode,
  type BatchFinalizeMatchResultStyle,
  type BatchFinalizeMatchScope,
  getDestructiveAdminToolStatusAction,
  repairKnockoutAdvancementAction,
  resetGroupStageTestingDataAction,
  resetKnockoutTestingDataAction,
  rescoreKnockoutScoresAction,
  scoreFinalizedGroupMatch,
  syncMatchesNowAction,
  seedKnockoutFromGroupStageAction,
  updateAdminMatchResultAction,
  type DestructiveAdminToolStatusResult
} from "@/app/admin/actions";
import { showAppToast } from "@/lib/app-toast";
import { getAccessLevel } from "@/lib/access-levels";
import { formatMatchStage } from "@/lib/match-stage";
import { getPredictionStateLabel } from "@/lib/prediction-state";
import type { MatchStage, MatchStatus } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminInvitesClient";
import { useCurrentUser } from "@/lib/use-current-user";

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

const KNOCKOUT_RESET_CONFIRMATION_PHRASE = "RESET KNOCKOUT TEST DATA";
const GROUP_RESET_CONFIRMATION_PHRASE = "RESET GROUP TEST DATA";
const BATCH_FINALIZE_CONFIRMATION_PHRASE = "FINALIZE TEST MATCHES";

export function AdminMatchesClient() {
  const expectedGroupMatchCount = 72;
  const router = useRouter();
  const { user } = useCurrentUser();
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<"all" | MatchStage>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [isSeedingKnockout, setIsSeedingKnockout] = useState(false);
  const [isConfirmingReseed, setIsConfirmingReseed] = useState(false);
  const [isRescoringKnockout, setIsRescoringKnockout] = useState(false);
  const [isRepairingKnockout, setIsRepairingKnockout] = useState(false);
  const [isSyncingMatches, setIsSyncingMatches] = useState(false);
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);
  const [isKnockoutResetAcknowledged, setIsKnockoutResetAcknowledged] = useState(false);
  const [knockoutResetConfirmationText, setKnockoutResetConfirmationText] = useState("");
  const [isResettingKnockout, setIsResettingKnockout] = useState(false);
  const [isGroupResetAcknowledged, setIsGroupResetAcknowledged] = useState(false);
  const [groupResetConfirmationText, setGroupResetConfirmationText] = useState("");
  const [isResettingGroup, setIsResettingGroup] = useState(false);
  const [batchFinalizeFromDate, setBatchFinalizeFromDate] = useState("");
  const [batchFinalizeToDate, setBatchFinalizeToDate] = useState("");
  const [batchFinalizeScope, setBatchFinalizeScope] = useState<BatchFinalizeMatchScope>("group-only");
  const [batchFinalizeResultStyle, setBatchFinalizeResultStyle] = useState<BatchFinalizeMatchResultStyle>("realistic");
  const [batchFinalizeOverwriteMode, setBatchFinalizeOverwriteMode] =
    useState<BatchFinalizeMatchOverwriteMode>("skip-finalized");
  const [isBatchFinalizeAcknowledged, setIsBatchFinalizeAcknowledged] = useState(false);
  const [batchFinalizeConfirmationText, setBatchFinalizeConfirmationText] = useState("");
  const [isBatchFinalizingMatches, setIsBatchFinalizingMatches] = useState(false);
  const [destructiveToolStatus, setDestructiveToolStatus] = useState<DestructiveAdminToolStatusResult | null>(null);

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

  function applyGroupResetPreview(currentMatches: AdminMatch[]): AdminMatch[] {
    return currentMatches.map((match) => {
      if (match.stage === "group") {
        return {
          ...match,
          status: "scheduled" as MatchStatus,
          homeScore: undefined,
          awayScore: undefined,
          winnerTeamId: undefined,
          finalizedAt: null,
          lastSyncedAt: null,
          isManualOverride: false,
          syncStatus: null,
          syncError: null
        };
      }

      return {
        ...match,
        homeTeamId: undefined,
        awayTeamId: undefined,
        homeScore: undefined,
        awayScore: undefined,
        winnerTeamId: undefined,
        status: "scheduled" as MatchStatus,
        finalizedAt: null,
        lastSyncedAt: null,
        isManualOverride: false,
        syncStatus: null,
        syncError: null
      };
    });
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
  const latestSyncedAt = useMemo(() => {
    const syncedTimestamps = matches.map((match) => match.lastSyncedAt).filter(Boolean) as string[];
    if (syncedTimestamps.length === 0) {
      return null;
    }

    return syncedTimestamps.sort().at(-1) ?? null;
  }, [matches]);
  const hasSyncErrors = useMemo(() => matches.some((match) => match.syncStatus === "error"), [matches]);
  const canUseDangerZone = user ? getAccessLevel(user) === "super_admin" : false;
  const knockoutAvailability = destructiveToolStatus?.ok ? destructiveToolStatus.knockout : null;
  const groupAvailability = destructiveToolStatus?.ok ? destructiveToolStatus.group : null;
  const diagnostics = destructiveToolStatus?.ok ? destructiveToolStatus.diagnostics : null;
  const isKnockoutResetPhraseValid = knockoutResetConfirmationText === KNOCKOUT_RESET_CONFIRMATION_PHRASE;
  const isKnockoutResetPhraseClose =
    !isKnockoutResetPhraseValid &&
    knockoutResetConfirmationText.trim().length > 0 &&
    knockoutResetConfirmationText.replace(/\s+/g, "").toUpperCase() ===
      KNOCKOUT_RESET_CONFIRMATION_PHRASE.replace(/\s+/g, "");
  const isGroupResetPhraseValid = groupResetConfirmationText === GROUP_RESET_CONFIRMATION_PHRASE;
  const isGroupResetPhraseClose =
    !isGroupResetPhraseValid &&
    groupResetConfirmationText.trim().length > 0 &&
    groupResetConfirmationText.replace(/\s+/g, "").toUpperCase() === GROUP_RESET_CONFIRMATION_PHRASE.replace(/\s+/g, "");
  const isBatchFinalizePhraseValid = batchFinalizeConfirmationText === BATCH_FINALIZE_CONFIRMATION_PHRASE;
  const isBatchFinalizePhraseClose =
    !isBatchFinalizePhraseValid &&
    batchFinalizeConfirmationText.trim().length > 0 &&
    batchFinalizeConfirmationText.replace(/\s+/g, "").toUpperCase() ===
      BATCH_FINALIZE_CONFIRMATION_PHRASE.replace(/\s+/g, "");
  const canSubmitKnockoutReset =
    canUseDangerZone &&
    Boolean(knockoutAvailability?.environmentResetAllowed) &&
    isKnockoutResetAcknowledged &&
    isKnockoutResetPhraseValid &&
    !isResettingKnockout;
  const canSubmitGroupReset =
    canUseDangerZone &&
    Boolean(groupAvailability?.environmentResetAllowed) &&
    isGroupResetAcknowledged &&
    isGroupResetPhraseValid &&
    !isResettingGroup;
  const canSubmitBatchFinalize =
    canUseDangerZone &&
    Boolean(knockoutAvailability?.environmentResetAllowed) &&
    Boolean(batchFinalizeFromDate) &&
    Boolean(batchFinalizeToDate) &&
    isBatchFinalizeAcknowledged &&
    isBatchFinalizePhraseValid &&
    !isBatchFinalizingMatches;

  useEffect(() => {
    if (!canUseDangerZone) {
      setDestructiveToolStatus(null);
      return;
    }

    let cancelled = false;

    async function loadDestructiveToolStatus() {
      try {
        const result = await getDestructiveAdminToolStatusAction();
        if (!cancelled) {
          setDestructiveToolStatus(result);
        }
      } catch (error) {
        if (!cancelled) {
          setDestructiveToolStatus({
            ok: false,
            message: (error as Error).message
          });
        }
      }
    }

    void loadDestructiveToolStatus();

    return () => {
      cancelled = true;
    };
  }, [canUseDangerZone]);

  useEffect(() => {
    if (dateOptions.length === 0) {
      return;
    }

    setBatchFinalizeFromDate((current) => current || dateOptions[0]);
    setBatchFinalizeToDate((current) => current || dateOptions[dateOptions.length - 1]);
  }, [dateOptions]);

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

  async function handleSyncMatchesNow() {
    setIsSyncingMatches(true);

    try {
      const result = await syncMatchesNowAction();
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });

      if (result.ok) {
        await loadMatches();
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsSyncingMatches(false);
    }
  }

  async function handleResetKnockoutTestingData() {
    if (!canUseDangerZone || !isKnockoutResetAcknowledged || !isKnockoutResetPhraseValid) {
      return;
    }

    const confirmed = window.confirm(
      "You are about to reset knockout testing data. This will clear seeded knockout teams, knockout scores, knockout winners, knockout predictions, and knockout scoring. Group-stage data will not be changed. This cannot be undone from the UI. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setIsResettingKnockout(true);
    try {
      const result = await resetKnockoutTestingDataAction({
        confirmationText: knockoutResetConfirmationText,
        scope: "knockout-only"
      });

      if (result.ok) {
        setIsKnockoutResetAcknowledged(false);
        setKnockoutResetConfirmationText("");
        await loadMatches();
      }

      showAppToast({
        tone: result.ok ? (result.warning ? "tip" : "success") : "error",
        text: result.message || "Group reset finished without a message. Check the server logs."
      });
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsResettingKnockout(false);
    }
  }

  async function handleResetGroupTestingData() {
    if (!canUseDangerZone || !isGroupResetAcknowledged || !isGroupResetPhraseValid) {
      return;
    }

    console.info("[group-reset:client] button clicked", {
      checkboxChecked: isGroupResetAcknowledged,
      phraseMatches: isGroupResetPhraseValid
    });

    const confirmed = window.confirm(
      "You are about to reset group-stage testing data. This will clear group-stage scores, statuses, player predictions, scoring, and seeded knockout artifacts created from group testing. This cannot be undone from the UI. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setIsResettingGroup(true);
    try {
      const result = await resetGroupStageTestingDataAction({
        confirmationText: groupResetConfirmationText,
        scope: "group-only"
      });
      console.info("[group-reset:client] action returned result", result);

      showAppToast({
        tone: result.ok ? (result.warning ? "tip" : "success") : "error",
        text: result.message
      });
      console.info("[group-reset:client] toast fired", {
        ok: result.ok,
        warning: result.ok ? result.warning ?? false : false,
        deletedCounts: result.ok ? result.deletedCounts : undefined
      });

      if (result.ok) {
        setIsGroupResetAcknowledged(false);
        setGroupResetConfirmationText("");
        setMatches((currentMatches) => applyGroupResetPreview(currentMatches));
        await loadMatches();
        console.info("[group-reset:client] match list reloaded", {
          resetMatchCount: result.resetMatchCount,
          deletedCounts: result.deletedCounts
        });
        window.setTimeout(() => {
          router.refresh();
          console.info("[group-reset:client] router refreshed");
        }, 150);
      }
    } catch (error) {
      console.error("[group-reset:client] action threw", error);
      showAppToast({ tone: "error", text: (error as Error).message || "Group reset failed. Check the server logs." });
    } finally {
      setIsResettingGroup(false);
    }
  }

  async function handleBatchFinalizeMatches() {
    if (!canSubmitBatchFinalize) {
      return;
    }

    const confirmed = window.confirm(
      "You are about to batch finalize test match results. This updates actual match results and finalizes matches for testing. It will trigger scoring through the normal app flow. Use only in test environments or controlled admin QA. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setIsBatchFinalizingMatches(true);
    try {
      const result = await batchFinalizeMatchResultsAction({
        fromDate: batchFinalizeFromDate,
        toDate: batchFinalizeToDate,
        scope: batchFinalizeScope,
        resultStyle: batchFinalizeResultStyle,
        overwriteMode: batchFinalizeOverwriteMode,
        confirmationText: batchFinalizeConfirmationText
      });

      console.info("[batch-finalize:client] action returned result", result);

      showAppToast({
        tone: result.ok ? "success" : "error",
        text: result.message || "Batch finalization finished without a message. Check server logs."
      });

      if (result.ok) {
        setIsBatchFinalizeAcknowledged(false);
        setBatchFinalizeConfirmationText("");
        await loadMatches();
        window.setTimeout(() => {
          router.refresh();
        }, 150);
      }
    } catch (error) {
      showAppToast({
        tone: "error",
        text: (error as Error).message || "Batch finalization failed. Check server logs."
      });
    } finally {
      setIsBatchFinalizingMatches(false);
    }
  }

  function renderResetReadiness({
    title = "Reset readiness",
    availability,
    checkboxChecked,
    phraseMatches,
    productionBlockedMessage
  }: {
    title?: string;
    availability:
      | {
          environmentResetAllowed: boolean;
          productionResetRequired: boolean;
          productionResetAllowed: boolean;
          disabledReason: string | null;
        }
      | null;
    checkboxChecked: boolean;
    phraseMatches: boolean;
    productionBlockedMessage: string;
  }) {
    if (!availability) {
      return (
        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-bold uppercase tracking-wide text-gray-700">{title}</p>
          <p className="mt-2 text-sm font-semibold text-gray-600">Checking reset availability...</p>
        </div>
      );
    }

    return (
      <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm font-bold uppercase tracking-wide text-gray-700">{title}</p>
        <div className="mt-2 space-y-1 text-sm font-semibold text-gray-700">
          <p>
            Environment reset allowed:{" "}
            <span className={availability.environmentResetAllowed ? "text-emerald-700" : "text-rose-700"}>
              {availability.environmentResetAllowed ? "yes" : "no"}
            </span>
          </p>
          <p>
            Production reset required:{" "}
            <span className={availability.productionResetRequired ? "text-rose-700" : "text-emerald-700"}>
              {availability.productionResetRequired ? "yes" : "no"}
            </span>
          </p>
          <p>
            Production reset allowed:{" "}
            <span
              className={
                !availability.productionResetRequired || availability.productionResetAllowed
                  ? "text-emerald-700"
                  : "text-rose-700"
              }
            >
              {availability.productionResetRequired
                ? availability.productionResetAllowed
                  ? "yes"
                  : "no"
                : "not required"}
            </span>
          </p>
          <p>
            Confirmation checkbox checked:{" "}
            <span className={checkboxChecked ? "text-emerald-700" : "text-rose-700"}>
              {checkboxChecked ? "yes" : "no"}
            </span>
          </p>
          <p>
            Confirmation phrase matches:{" "}
            <span className={phraseMatches ? "text-emerald-700" : "text-rose-700"}>
              {phraseMatches ? "yes" : "no"}
            </span>
          </p>
        </div>

        {availability.productionResetRequired && !availability.productionResetAllowed ? (
          <p className="mt-3 text-sm font-semibold text-rose-700">{productionBlockedMessage}</p>
        ) : null}

        {availability.disabledReason ? (
          <p className="mt-3 text-sm font-semibold text-rose-700">{availability.disabledReason}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AdminHeader eyebrow="Matches" title="Update match results." />

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="space-y-1">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Match filters and search</p>
          <h3 className="text-lg font-black text-gray-950">Find the matches you want to manage</h3>
          <p className="text-sm font-semibold text-gray-600">
            Narrow the list by stage or date, then update scores and statuses below.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-900">
              {latestSyncedAt ? `Results synced ${formatRelativeMinutes(latestSyncedAt)}` : "Waiting for results"}
            </p>
            <p className={`text-xs font-semibold ${hasSyncErrors ? "text-rose-700" : "text-gray-500"}`}>
              {hasSyncErrors ? "One or more synced matches reported errors." : "Automatic locking and result sync share the same safe-mode pipeline."}
            </p>
          </div>
          <button
            type="button"
            disabled={isSyncingMatches}
            onClick={() => void handleSyncMatchesNow()}
            className="rounded-md bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
          >
            {isSyncingMatches ? "Syncing..." : "Sync Now"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
        </div>
      </section>

      {isLoading ? <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading matches...</p> : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Match list / match editing</p>
          <h3 className="text-lg font-black text-gray-950">Update statuses, scores, and final results</h3>
        </div>
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

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="space-y-1">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Tournament progression</p>
          <h3 className="text-lg font-black text-gray-950">Knockout seeding, repair, and rescoring</h3>
          <p className="text-sm font-semibold text-gray-600">
            Use these tools after group-stage results are complete or when repairing knockout advancement during testing.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <section className="rounded-lg border border-gray-200 bg-white p-4">
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

          <section className="rounded-lg border border-gray-200 bg-white p-4">
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

          <section className="rounded-lg border border-gray-200 bg-white p-4">
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
        </div>
      </section>

      {canUseDangerZone ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-wide text-rose-700">Maintenance / Danger Zone</p>
              <h3 className="text-lg font-black text-gray-950">Testing-only recovery tools</h3>
              <p className="text-sm font-semibold text-gray-600">
                These tools are intended for testing and recovery. They can remove tournament data and should not be used
                during normal play.
              </p>
              <p className="text-sm font-semibold text-rose-700">
                Production deployments require explicit reset environment variables before either action can run.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDangerZoneOpen((current) => !current)}
              className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-bold text-rose-700"
            >
              {isDangerZoneOpen ? "Hide danger tools" : "Show danger tools"}
            </button>
          </div>

          {isDangerZoneOpen ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-white p-4">
              <div className="rounded-md border border-rose-100 bg-rose-50/60 p-3">
                <p className="text-sm font-bold uppercase tracking-wide text-rose-700">Environment diagnostics</p>
                {diagnostics ? (
                  <div className="mt-2 space-y-1 text-sm font-semibold text-gray-700">
                    <p>NODE_ENV: {diagnostics.nodeEnv}</p>
                    <p>VERCEL_ENV: {diagnostics.vercelEnv}</p>
                    <p>Is production deployment: {diagnostics.isProductionDeployment ? "yes" : "no"}</p>
                    <p>
                      ALLOW_PRODUCTION_KNOCKOUT_RESET present:{" "}
                      {diagnostics.allowProductionKnockoutResetPresent ? "yes" : "no"}
                    </p>
                    <p>
                      ALLOW_PRODUCTION_KNOCKOUT_RESET equals &quot;true&quot;:{" "}
                      {diagnostics.allowProductionKnockoutResetIsTrue ? "yes" : "no"}
                    </p>
                    <p>
                      ALLOW_PRODUCTION_GROUP_RESET present:{" "}
                      {diagnostics.allowProductionGroupResetPresent ? "yes" : "no"}
                    </p>
                    <p>
                      ALLOW_PRODUCTION_GROUP_RESET equals &quot;true&quot;:{" "}
                      {diagnostics.allowProductionGroupResetIsTrue ? "yes" : "no"}
                    </p>
                  </div>
                ) : destructiveToolStatus?.ok === false ? (
                  <p className="mt-2 text-sm font-semibold text-rose-700">{destructiveToolStatus.message}</p>
                ) : (
                  <p className="mt-2 text-sm font-semibold text-gray-600">Checking server environment status...</p>
                )}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="rounded-lg border border-rose-200 bg-white p-4 xl:col-span-2">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Batch Finalize Match Results</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      This updates actual match results and finalizes matches for testing. It will trigger scoring through
                      the normal app flow. Use only in test environments or controlled admin QA.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <label className="block">
                      <span className="text-sm font-bold text-gray-700">From date</span>
                      <select
                        value={batchFinalizeFromDate}
                        onChange={(event) => setBatchFinalizeFromDate(event.target.value)}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                      >
                        <option value="">Select date</option>
                        {dateOptions.map((date) => (
                          <option key={`batch-from-${date}`} value={date}>
                            {formatDateTime(`${date}T12:00:00Z`, false)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-bold text-gray-700">To date</span>
                      <select
                        value={batchFinalizeToDate}
                        onChange={(event) => setBatchFinalizeToDate(event.target.value)}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                      >
                        <option value="">Select date</option>
                        {dateOptions.map((date) => (
                          <option key={`batch-to-${date}`} value={date}>
                            {formatDateTime(`${date}T12:00:00Z`, false)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-bold text-gray-700">Scope</span>
                      <select
                        value={batchFinalizeScope}
                        onChange={(event) => setBatchFinalizeScope(event.target.value as BatchFinalizeMatchScope)}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                      >
                        <option value="group-only">Group stage only</option>
                        <option value="knockout-only">Knockout only</option>
                        <option value="all">All matches in date range</option>
                        <option value="open-only">Open matches only</option>
                        <option value="locked-live-only">Locked/live test matches only</option>
                        <option value="open-locked-live">Open + locked/live test matches</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-bold text-gray-700">Result style</span>
                      <select
                        value={batchFinalizeResultStyle}
                        onChange={(event) => setBatchFinalizeResultStyle(event.target.value as BatchFinalizeMatchResultStyle)}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                      >
                        <option value="realistic">Realistic soccer scores</option>
                        <option value="fun">Random fun scores</option>
                        <option value="favorites">Mostly favorites win</option>
                        <option value="draw-heavy">Draw-heavy for group testing</option>
                        <option value="knockout-no-draw">No draws for knockout</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-bold text-gray-700">Overwrite behavior</span>
                      <select
                        value={batchFinalizeOverwriteMode}
                        onChange={(event) => setBatchFinalizeOverwriteMode(event.target.value as BatchFinalizeMatchOverwriteMode)}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                      >
                        <option value="skip-finalized">Finalize only matches without final scores</option>
                        <option value="overwrite-test-results">Overwrite existing test results</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-sm font-bold text-gray-700">Type confirmation exactly</span>
                      <input
                        type="text"
                        value={batchFinalizeConfirmationText}
                        onChange={(event) => setBatchFinalizeConfirmationText(event.target.value)}
                        placeholder={BATCH_FINALIZE_CONFIRMATION_PHRASE}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                      />
                      {isBatchFinalizePhraseClose ? (
                        <p className="mt-2 text-sm font-semibold text-rose-700">
                          Type exactly: {BATCH_FINALIZE_CONFIRMATION_PHRASE}
                        </p>
                      ) : null}
                    </label>
                  </div>

                  <label className="mt-4 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isBatchFinalizeAcknowledged}
                      onChange={(event) => setIsBatchFinalizeAcknowledged(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      I understand this will update actual match results and finalize matches for testing.
                    </span>
                  </label>

                  {renderResetReadiness({
                    title: "Finalize readiness",
                    availability: knockoutAvailability,
                    checkboxChecked: isBatchFinalizeAcknowledged,
                    phraseMatches: isBatchFinalizePhraseValid,
                    productionBlockedMessage:
                      "Production testing tools are blocked. Set ALLOW_PRODUCTION_KNOCKOUT_RESET=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={!canSubmitBatchFinalize}
                    onClick={() => void handleBatchFinalizeMatches()}
                    className="mt-4 rounded-md bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isBatchFinalizingMatches ? "Finalizing test matches..." : "Batch Finalize Matches"}
                  </button>
                </section>

                <section className="rounded-lg border border-rose-200 bg-white p-4">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Reset knockout test data</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Clears seeded knockout teams, knockout scores, knockout winners, knockout predictions, and knockout
                      scoring. Group-stage data will not be changed.
                    </p>
                    <p className="text-sm font-semibold text-gray-600">
                      After changing environment variables, restart the local dev server or redeploy Vercel.
                    </p>
                  </div>

                  <label className="mt-4 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isKnockoutResetAcknowledged}
                      onChange={(event) => setIsKnockoutResetAcknowledged(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      I understand this will clear knockout seeded teams, test scores, picks, and scoring.
                    </span>
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Type confirmation exactly</span>
                    <input
                      type="text"
                      value={knockoutResetConfirmationText}
                      onChange={(event) => setKnockoutResetConfirmationText(event.target.value)}
                      placeholder={KNOCKOUT_RESET_CONFIRMATION_PHRASE}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                    {isKnockoutResetPhraseClose ? (
                      <p className="mt-2 text-sm font-semibold text-rose-700">
                        Type exactly: {KNOCKOUT_RESET_CONFIRMATION_PHRASE}
                      </p>
                    ) : null}
                  </label>

                  {renderResetReadiness({
                    availability: knockoutAvailability,
                    checkboxChecked: isKnockoutResetAcknowledged,
                    phraseMatches: isKnockoutResetPhraseValid,
                    productionBlockedMessage:
                      "Production knockout reset is disabled. Set ALLOW_PRODUCTION_KNOCKOUT_RESET=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={!canSubmitKnockoutReset}
                    onClick={() => void handleResetKnockoutTestingData()}
                    className="mt-4 rounded-md bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isResettingKnockout ? "Resetting knockout test data..." : "Reset knockout test data"}
                  </button>
                </section>

                <section className="rounded-lg border border-rose-200 bg-white p-4">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Reset group-stage test data</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Clears group-stage scores, statuses, player predictions, scoring, and generated group standings/seed
                      test artifacts. Official group-stage match teams and schedule are preserved. Seeded knockout artifacts
                      created from group testing will also be cleared.
                    </p>
                    <p className="text-sm font-semibold text-gray-600">
                      After changing environment variables, restart the local dev server or redeploy Vercel.
                    </p>
                  </div>

                  <label className="mt-4 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isGroupResetAcknowledged}
                      onChange={(event) => setIsGroupResetAcknowledged(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      I understand this will clear group-stage test scores, player predictions, scoring, and seeded knockout
                      artifacts created from group testing.
                    </span>
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Type confirmation exactly</span>
                    <input
                      type="text"
                      value={groupResetConfirmationText}
                      onChange={(event) => setGroupResetConfirmationText(event.target.value)}
                      placeholder={GROUP_RESET_CONFIRMATION_PHRASE}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                    {isGroupResetPhraseClose ? (
                      <p className="mt-2 text-sm font-semibold text-rose-700">
                        Type exactly: {GROUP_RESET_CONFIRMATION_PHRASE}
                      </p>
                    ) : null}
                  </label>

                  {renderResetReadiness({
                    availability: groupAvailability,
                    checkboxChecked: isGroupResetAcknowledged,
                    phraseMatches: isGroupResetPhraseValid,
                    productionBlockedMessage:
                      "Production group-stage reset is disabled. Set ALLOW_PRODUCTION_GROUP_RESET=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={!canSubmitGroupReset}
                    onClick={() => void handleResetGroupTestingData()}
                    className="mt-4 rounded-md bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isResettingGroup ? "Resetting group-stage test data..." : "Reset group-stage test data"}
                  </button>
                </section>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
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
  const [homeScore, setHomeScore] = useState(getAdminInitialScoreInput(match.homeScore));
  const [awayScore, setAwayScore] = useState(getAdminInitialScoreInput(match.awayScore));
  const [isSaving, setIsSaving] = useState(false);
  const isFinalized = status === "final";
  const isLive = status === "live" || status === "locked";
  const predictionStateLabel = getPredictionStateLabel(status);
  const homeLabel = getSideLabel(match, "home");
  const awayLabel = getSideLabel(match, "away");
  const resolvedWinnerTeamId = getResolvedWinnerTeamId(match, homeScore, awayScore);
  const resolvedWinnerLabel = getResolvedWinnerLabel(match, resolvedWinnerTeamId);
  const hasUnsavedChanges =
    status !== match.status ||
    homeScore !== getAdminInitialScoreInput(match.homeScore) ||
    awayScore !== getAdminInitialScoreInput(match.awayScore);

  useEffect(() => {
    setStatus(match.status);
    setHomeScore(getAdminInitialScoreInput(match.homeScore));
    setAwayScore(getAdminInitialScoreInput(match.awayScore));
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

      if (updatedMatch.status === "final" && updatedMatch.stage === "group") {
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
            <option value="scheduled">Open</option>
            <option value="locked">Locked</option>
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

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
          {match.isManualOverride ? (
            <span className="rounded-md bg-gray-900 px-2 py-1 text-white">Manual override</span>
          ) : null}
          {match.syncStatus ? (
            <span
              className={`rounded-md px-2 py-1 ${
                match.syncStatus === "error"
                  ? "bg-rose-100 text-rose-800"
                  : match.syncStatus === "skipped"
                    ? "bg-gray-100 text-gray-700"
                    : "bg-emerald-100 text-emerald-800"
              }`}
            >
              Sync {match.syncStatus}
            </span>
          ) : null}
          <span>{match.lastSyncedAt ? `Results synced ${formatRelativeMinutes(match.lastSyncedAt)}` : "Waiting for results"}</span>
          {match.syncError ? <span className="text-rose-700">{match.syncError}</span> : null}
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

function getAdminInitialScoreInput(score?: number) {
  return score === undefined ? "0" : String(score);
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
  if (status === "locked") {
    return "Locked";
  }

  if (status === "live") {
    return "Live";
  }

  if (status === "final") {
    return "Final";
  }

  return "Open";
}

function formatRelativeMinutes(value: string) {
  const millis = new Date(value).getTime();
  if (Number.isNaN(millis)) {
    return "recently";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - millis) / 60000));
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes === 1) {
    return "1 minute ago";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) {
    return "1 hour ago";
  }

  return `${diffHours} hours ago`;
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
