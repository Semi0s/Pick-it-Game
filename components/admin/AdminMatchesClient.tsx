"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAdminMatches, type AdminMatch } from "@/lib/admin-data";
import {
  batchClearMatchResultsAction,
  batchFinalizeMatchResultsAction,
  clearBracketBuilderSnapshotsAction,
  fullPreLaunchTestResetAction,
  fetchKnockoutSeedingStatusAction,
  type BatchFinalizeMatchOverwriteMode,
  type BatchFinalizeMatchResultStyle,
  type BatchFinalizeMatchScope,
  getDestructiveAdminToolStatusAction,
  repairLeaderboardStateAction,
  repairKnockoutAdvancementAction,
  resetMatchToOpenAction,
  resetGroupStageTestingDataAction,
  resetKnockoutTestingDataAction,
  resetTestingSocialStateAction,
  rescoreKnockoutScoresAction,
  runAdminScoringAuditAction,
  scoreFinalizedGroupMatch,
  syncMatchesNowAction,
  seedKnockoutFromGroupStageAction,
  updateAdminMatchResultAction,
  type DestructiveAdminToolStatusResult
} from "@/app/admin/actions";
import { showAppToast } from "@/lib/app-toast";
import { getAccessLevel } from "@/lib/access-levels";
import {
  hasAdminWinnerScoreConflict,
  isKnockoutStage,
  requiresAdminKnockoutTiebreakWinner,
  resolveAdminMatchWinnerTeamId
} from "@/lib/admin-match-winner";
import { formatMatchStage } from "@/lib/match-stage";
import { getPredictionStateLabel } from "@/lib/prediction-state";
import {
  ADMIN_UI_RESET_SIGNAL_STORAGE_KEY,
  DASHBOARD_STANDINGS_HISTORY_STORAGE_KEY,
  LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY
} from "@/lib/ui-storage-keys";
import type { MatchStage, MatchStatus } from "@/lib/types";
import type { AdminScoringAuditReport } from "@/lib/admin-scoring-audit";
import { AdminHeader } from "@/components/admin/AdminInvitesClient";
import { InlineDisclosureButton, useSessionDisclosureState } from "@/components/player-management/Shared";
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
const BRACKET_BUILDER_RESET_CONFIRMATION_PHRASE = "CLEAR EASY BRACKET SNAPSHOTS";
const BATCH_FINALIZE_CONFIRMATION_PHRASE = "FINALIZE TEST MATCHES";
const BATCH_CLEAR_CONFIRMATION_PHRASE = "CLEAR TEST MATCH RESULTS";
const FULL_TEST_RESET_CONFIRMATION_PHRASE = "FULL PRE-LAUNCH TEST RESET";
const ADMIN_MATCH_FILTERS_DISCLOSURE_KEY = "admin-matches-filters-open";
const ADMIN_MATCH_OPERATIONS_DISCLOSURE_KEY = "admin-matches-operations-open";
const ADMIN_TOURNAMENT_PROGRESS_DISCLOSURE_KEY = "admin-matches-tournament-progress-open";
const ADMIN_DANGER_ZONE_DISCLOSURE_KEY = "admin-matches-danger-zone-open";

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
  const [isOperationsOpen, setIsOperationsOpen] = useSessionDisclosureState(ADMIN_MATCH_OPERATIONS_DISCLOSURE_KEY, true);
  const [isFiltersOpen, setIsFiltersOpen] = useSessionDisclosureState(ADMIN_MATCH_FILTERS_DISCLOSURE_KEY, false);
  const [isTournamentProgressOpen, setIsTournamentProgressOpen] = useSessionDisclosureState(
    ADMIN_TOURNAMENT_PROGRESS_DISCLOSURE_KEY,
    false
  );
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useSessionDisclosureState(ADMIN_DANGER_ZONE_DISCLOSURE_KEY, false);
  const [isKnockoutResetAcknowledged, setIsKnockoutResetAcknowledged] = useState(false);
  const [knockoutResetConfirmationText, setKnockoutResetConfirmationText] = useState("");
  const [isResettingKnockout, setIsResettingKnockout] = useState(false);
  const [isGroupResetAcknowledged, setIsGroupResetAcknowledged] = useState(false);
  const [groupResetConfirmationText, setGroupResetConfirmationText] = useState("");
  const [isResettingGroup, setIsResettingGroup] = useState(false);
  const [isBracketBuilderResetAcknowledged, setIsBracketBuilderResetAcknowledged] = useState(false);
  const [bracketBuilderResetConfirmationText, setBracketBuilderResetConfirmationText] = useState("");
  const [isResettingBracketBuilder, setIsResettingBracketBuilder] = useState(false);
  const [isResettingTestingSocial, setIsResettingTestingSocial] = useState(false);
  const [batchFinalizeFromDate, setBatchFinalizeFromDate] = useState("");
  const [batchFinalizeToDate, setBatchFinalizeToDate] = useState("");
  const [batchFinalizeScope, setBatchFinalizeScope] = useState<BatchFinalizeMatchScope>("group-only");
  const [batchFinalizeResultStyle, setBatchFinalizeResultStyle] = useState<BatchFinalizeMatchResultStyle>("realistic");
  const [batchFinalizeOverwriteMode, setBatchFinalizeOverwriteMode] =
    useState<BatchFinalizeMatchOverwriteMode>("skip-finalized");
  const [isBatchFinalizeAcknowledged, setIsBatchFinalizeAcknowledged] = useState(false);
  const [batchFinalizeConfirmationText, setBatchFinalizeConfirmationText] = useState("");
  const [isBatchFinalizingMatches, setIsBatchFinalizingMatches] = useState(false);
  const [isBatchClearAcknowledged, setIsBatchClearAcknowledged] = useState(false);
  const [batchClearConfirmationText, setBatchClearConfirmationText] = useState("");
  const [isBatchClearingMatches, setIsBatchClearingMatches] = useState(false);
  const [destructiveToolStatus, setDestructiveToolStatus] = useState<DestructiveAdminToolStatusResult | null>(null);
  const [knockoutSeedingStatusText, setKnockoutSeedingStatusText] = useState<string>("");
  const [knockoutSeedingStatusTone, setKnockoutSeedingStatusTone] = useState<"neutral" | "amber" | "emerald" | "rose">("neutral");
  const [resetReasonByScope, setResetReasonByScope] = useState<Record<string, string>>({
    knockout: "",
    group_stage: "",
    bracket_builder: "",
    match: "",
    leaderboard: "",
    full_test: ""
  });
  const [selectedResetMatchId, setSelectedResetMatchId] = useState("");
  const [matchResetConfirmationText, setMatchResetConfirmationText] = useState("");
  const [isResettingMatch, setIsResettingMatch] = useState(false);
  const [isRepairingLeaderboard, setIsRepairingLeaderboard] = useState(false);
  const [selectedOperationsMatchId, setSelectedOperationsMatchId] = useState("");
  const [operationsReason, setOperationsReason] = useState("");
  const [isScoringSelectedMatch, setIsScoringSelectedMatch] = useState(false);
  const [isRepairingOperationsLeaderboard, setIsRepairingOperationsLeaderboard] = useState(false);
  const [isRunningScoringAudit, setIsRunningScoringAudit] = useState(false);
  const [scoringAuditReport, setScoringAuditReport] = useState<AdminScoringAuditReport | null>(null);
  const [fullResetConfirmationText, setFullResetConfirmationText] = useState("");
  const [isFullResetAcknowledged, setIsFullResetAcknowledged] = useState(false);
  const [isRunningFullReset, setIsRunningFullReset] = useState(false);
  const [selectedReviewMatchId, setSelectedReviewMatchId] = useState("");
  const conflictQueueRef = useRef<HTMLDivElement | null>(null);
  const needsReviewQueueRef = useRef<HTMLDivElement | null>(null);
  const manualOverrideQueueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadMatches() {
    setIsLoading(true);
    try {
      setMatches(await fetchAdminMatches());
      const seedingStatusResult = await fetchKnockoutSeedingStatusAction();
      if (seedingStatusResult.ok) {
        setKnockoutSeedingStatusText(seedingStatusResult.status.detail);
        setKnockoutSeedingStatusTone(
          seedingStatusResult.status.state === "failed"
            ? "rose"
            : seedingStatusResult.status.state === "ready"
              ? "amber"
              : seedingStatusResult.status.state === "auto_seeded" || seedingStatusResult.status.state === "manual_seeded"
                ? "emerald"
                : "neutral"
        );
      }
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
  const matchOperationSummary = useMemo(() => buildMatchOperationSummary(matches), [matches]);
  const scoreableOperationMatches = useMemo(
    () => matches.filter((match) => match.status === "final").sort(compareAdminMatches),
    [matches]
  );
  const selectedOperationsMatch = useMemo(
    () => matches.find((match) => match.id === selectedOperationsMatchId) ?? null,
    [matches, selectedOperationsMatchId]
  );
  const scopeAvailability = destructiveToolStatus?.ok ? destructiveToolStatus.scopes : null;
  const knockoutAvailability = scopeAvailability?.knockout ?? null;
  const groupAvailability = scopeAvailability?.group_stage ?? null;
  const bracketBuilderAvailability = scopeAvailability?.bracket_builder ?? null;
  const matchAvailability = scopeAvailability?.match ?? null;
  const leaderboardAvailability = scopeAvailability?.leaderboard ?? null;
  const socialAvailability = scopeAvailability?.social ?? null;
  const fullResetAvailability = scopeAvailability?.full_test ?? null;
  const batchFinalizeAvailability = scopeAvailability?.batch_finalize ?? null;
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
  const isBracketBuilderResetPhraseValid =
    bracketBuilderResetConfirmationText === BRACKET_BUILDER_RESET_CONFIRMATION_PHRASE;
  const isBracketBuilderResetPhraseClose =
    !isBracketBuilderResetPhraseValid &&
    bracketBuilderResetConfirmationText.trim().length > 0 &&
    bracketBuilderResetConfirmationText.replace(/\s+/g, "").toUpperCase() ===
      BRACKET_BUILDER_RESET_CONFIRMATION_PHRASE.replace(/\s+/g, "");
  const isBatchFinalizePhraseValid = batchFinalizeConfirmationText === BATCH_FINALIZE_CONFIRMATION_PHRASE;
  const isBatchFinalizePhraseClose =
    !isBatchFinalizePhraseValid &&
    batchFinalizeConfirmationText.trim().length > 0 &&
    batchFinalizeConfirmationText.replace(/\s+/g, "").toUpperCase() ===
      BATCH_FINALIZE_CONFIRMATION_PHRASE.replace(/\s+/g, "");
  const isBatchClearPhraseValid = batchClearConfirmationText === BATCH_CLEAR_CONFIRMATION_PHRASE;
  const isBatchClearPhraseClose =
    !isBatchClearPhraseValid &&
    batchClearConfirmationText.trim().length > 0 &&
    batchClearConfirmationText.replace(/\s+/g, "").toUpperCase() ===
      BATCH_CLEAR_CONFIRMATION_PHRASE.replace(/\s+/g, "");
  const canSubmitKnockoutReset =
    canUseDangerZone &&
    Boolean(knockoutAvailability?.environmentResetAllowed) &&
    Boolean(resetReasonByScope.knockout.trim()) &&
    isKnockoutResetAcknowledged &&
    isKnockoutResetPhraseValid &&
    !isResettingKnockout;
  const canSubmitGroupReset =
    canUseDangerZone &&
    Boolean(groupAvailability?.environmentResetAllowed) &&
    Boolean(resetReasonByScope.group_stage.trim()) &&
    isGroupResetAcknowledged &&
    isGroupResetPhraseValid &&
    !isResettingGroup;
  const canSubmitBracketBuilderReset =
    canUseDangerZone &&
    Boolean(bracketBuilderAvailability?.environmentResetAllowed) &&
    Boolean(resetReasonByScope.bracket_builder.trim()) &&
    isBracketBuilderResetAcknowledged &&
    isBracketBuilderResetPhraseValid &&
    !isResettingBracketBuilder;
  const canSubmitBatchFinalize =
    canUseDangerZone &&
    Boolean(batchFinalizeAvailability?.environmentResetAllowed) &&
    Boolean(batchFinalizeFromDate) &&
    Boolean(batchFinalizeToDate) &&
    isBatchFinalizeAcknowledged &&
    isBatchFinalizePhraseValid &&
    !isBatchFinalizingMatches;
  const canSubmitBatchClear =
    canUseDangerZone &&
    Boolean(batchFinalizeAvailability?.environmentResetAllowed) &&
    Boolean(batchFinalizeFromDate) &&
    Boolean(batchFinalizeToDate) &&
    isBatchClearAcknowledged &&
    isBatchClearPhraseValid &&
    !isBatchClearingMatches;
  const isFullResetPhraseValid = fullResetConfirmationText === FULL_TEST_RESET_CONFIRMATION_PHRASE;
  const resettableMatches = useMemo(
    () =>
      matches.filter(
        (match) =>
          match.status !== "scheduled" ||
          match.homeScore !== undefined ||
          match.awayScore !== undefined ||
          Boolean(match.winnerTeamId) ||
          Boolean(match.finalizedAt) ||
          Boolean(match.isManualOverride) ||
          Boolean(match.lastSyncedAt)
      ),
    [matches]
  );

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
    if (resettableMatches.length === 0) {
      setSelectedResetMatchId("");
      return;
    }

    setSelectedResetMatchId((current) =>
      current && resettableMatches.some((match) => match.id === current) ? current : resettableMatches[0]?.id ?? ""
    );
  }, [resettableMatches]);

  useEffect(() => {
    if (scoreableOperationMatches.length === 0) {
      setSelectedOperationsMatchId("");
      return;
    }

    setSelectedOperationsMatchId((current) =>
      current && scoreableOperationMatches.some((match) => match.id === current)
        ? current
        : scoreableOperationMatches[0]?.id ?? ""
    );
  }, [scoreableOperationMatches]);

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

  function handleOperationQueueJump(targetRef: { current: HTMLDivElement | null }) {
    setIsOperationsOpen(true);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = targetRef.current;
        if (!target) {
          return;
        }

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start"
        });
        target.focus({ preventScroll: true });
      });
    });
  }

  function handleReviewMatchFromQueue(match: AdminMatch) {
    setIsFiltersOpen(true);
    setStageFilter(match.stage);
    setDateFilter("all");
    setSelectedReviewMatchId(match.id);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(getAdminMatchEditorId(match.id));
        if (!target) {
          return;
        }

        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "center"
        });
      });
    });
  }

  async function handleScoreSelectedMatch() {
    if (!selectedOperationsMatch || selectedOperationsMatch.status !== "final" || isScoringSelectedMatch) {
      return;
    }

    const confirmed = window.confirm(
      "Rerun scoring for this finalized match? This may clear/rebuild canonical score rows for the match, recompute leaderboard totals, rebuild affected leaderboard cache, and revalidate affected pages. User predictions will not be changed."
    );
    if (!confirmed) {
      return;
    }

    setIsScoringSelectedMatch(true);
    try {
      const result = await scoreFinalizedGroupMatch(selectedOperationsMatch.id);
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        await loadMatches();
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsScoringSelectedMatch(false);
    }
  }

  async function handleRepairOperationsLeaderboard() {
    if (!operationsReason.trim() || isRepairingOperationsLeaderboard) {
      return;
    }

    const confirmed = window.confirm(
      "Rebuild leaderboard cache and canonical totals? This does not change predictions or match results, but it may update users.total_points, leaderboard entries, snapshots, and affected cached pages."
    );
    if (!confirmed) {
      return;
    }

    setIsRepairingOperationsLeaderboard(true);
    try {
      const result = await repairLeaderboardStateAction({
        reason: operationsReason
      });
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setOperationsReason("");
        setResetReasonByScope((current) => ({ ...current, leaderboard: "" }));
        await loadMatches();
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsRepairingOperationsLeaderboard(false);
    }
  }

  async function handleRunScoringAudit() {
    if (isRunningScoringAudit) {
      return;
    }

    setIsRunningScoringAudit(true);
    try {
      const result = await runAdminScoringAuditAction();
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setScoringAuditReport(result.report);
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsRunningScoringAudit(false);
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
        scope: "knockout-only",
        reason: resetReasonByScope.knockout
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
        scope: "group-only",
        reason: resetReasonByScope.group_stage
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

  function emitTestingUiResetSignal(type: "social" | "bracket_builder" | "full_test") {
    if (typeof window === "undefined") {
      return;
    }

    if (type === "social" || type === "full_test") {
      window.localStorage.removeItem(DASHBOARD_STANDINGS_HISTORY_STORAGE_KEY);
      window.localStorage.removeItem(LEADERBOARD_DAILY_WINNER_DISMISS_STORAGE_KEY);
    }

    window.localStorage.setItem(
      ADMIN_UI_RESET_SIGNAL_STORAGE_KEY,
      JSON.stringify({ type, at: Date.now() })
    );
  }

  async function handleResetTestingSocialData() {
    if (!socialAvailability?.environmentResetAllowed || isResettingTestingSocial) {
      return;
    }

    const confirmed = window.confirm(
      "You are about to clear testing social and movement data. This removes trophies, perfect-pick and daily-winner activity, comments, reactions, notifications, leaderboard events, and leaderboard movement history. Scoring, predictions, and match results stay intact. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setIsResettingTestingSocial(true);
    try {
      const result = await resetTestingSocialStateAction();
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        emitTestingUiResetSignal("social");
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsResettingTestingSocial(false);
    }
  }

  async function handleResetBracketBuilderSnapshots() {
    if (!canSubmitBracketBuilderReset) {
      return;
    }

    const confirmed = window.confirm(
      "You are about to clear Easy Bracket snapshot data across the app. This removes saved group seed rankings and best-third selections, which will blank projected bracket paths until players rebuild them. Match results, score predictions, knockout picks, and leaderboard totals stay intact. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setIsResettingBracketBuilder(true);
    try {
      const result = await clearBracketBuilderSnapshotsAction({
        confirmationText: bracketBuilderResetConfirmationText,
        scope: "bracket-builder-only",
        reason: resetReasonByScope.bracket_builder
      });

      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setIsBracketBuilderResetAcknowledged(false);
        setBracketBuilderResetConfirmationText("");
        setResetReasonByScope((current) => ({ ...current, bracket_builder: "" }));
        emitTestingUiResetSignal("bracket_builder");
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsResettingBracketBuilder(false);
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

  async function handleResetMatchToOpen() {
    if (!selectedResetMatchId || !matchAvailability?.environmentResetAllowed) {
      return;
    }

    const confirmed = window.confirm(
      "You are about to reset this match to open. This clears actual scores, finalization state, sync/manual-override flags, dependent score rows, and stale knockout advancement derived from this match. Continue?"
    );
    if (!confirmed) {
      return;
    }

    setIsResettingMatch(true);
    try {
      const result = await resetMatchToOpenAction({
        matchId: selectedResetMatchId,
        expectedMatchId: matchResetConfirmationText,
        reason: resetReasonByScope.match
      });

      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setMatchResetConfirmationText("");
        setResetReasonByScope((current) => ({ ...current, match: "" }));
        await loadMatches();
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsResettingMatch(false);
    }
  }

  async function handleBatchClearMatches() {
    if (!canSubmitBatchClear) {
      return;
    }

    const confirmed = window.confirm(
      "You are about to batch clear test match results. This resets scores, winners, finalized state, and derived scoring for the selected matches. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setIsBatchClearingMatches(true);
    try {
      const result = await batchClearMatchResultsAction({
        fromDate: batchFinalizeFromDate,
        toDate: batchFinalizeToDate,
        scope: batchFinalizeScope,
        confirmationText: batchClearConfirmationText
      });

      showAppToast({
        tone: result.ok ? "success" : "error",
        text: result.message || "Batch clear finished without a message. Check server logs."
      });

      if (result.ok) {
        setIsBatchClearAcknowledged(false);
        setBatchClearConfirmationText("");
        await loadMatches();
        window.setTimeout(() => {
          router.refresh();
        }, 150);
      }
    } catch (error) {
      showAppToast({
        tone: "error",
        text: (error as Error).message || "Batch clear failed. Check server logs."
      });
    } finally {
      setIsBatchClearingMatches(false);
    }
  }

  async function handleRepairLeaderboard() {
    if (!leaderboardAvailability?.environmentResetAllowed) {
      return;
    }

    setIsRepairingLeaderboard(true);
    try {
      const result = await repairLeaderboardStateAction({
        reason: resetReasonByScope.leaderboard
      });
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setResetReasonByScope((current) => ({ ...current, leaderboard: "" }));
        await loadMatches();
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsRepairingLeaderboard(false);
    }
  }

  async function handleFullPreLaunchReset() {
    if (!fullResetAvailability?.environmentResetAllowed || !isFullResetAcknowledged || !isFullResetPhraseValid) {
      return;
    }

    const confirmed = window.confirm(
      "You are about to run the full pre-launch test reset. This clears group-stage test state, knockout test state, social/movement state, and derived leaderboard state across the app. Accounts, groups, tier access, and branding stay intact. Continue?"
    );
    if (!confirmed) {
      return;
    }

    setIsRunningFullReset(true);
    try {
      const result = await fullPreLaunchTestResetAction({
        confirmationText: fullResetConfirmationText,
        reason: resetReasonByScope.full_test
      });
      showAppToast({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setFullResetConfirmationText("");
        setIsFullResetAcknowledged(false);
        setResetReasonByScope((current) => ({ ...current, full_test: "" }));
        await loadMatches();
        emitTestingUiResetSignal("full_test");
        router.refresh();
      }
    } catch (error) {
      showAppToast({ tone: "error", text: (error as Error).message });
    } finally {
      setIsRunningFullReset(false);
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

      {canUseDangerZone ? (
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Match Operations / Scoring Control</p>
              <h3 className="text-lg font-black text-gray-950">Publish safety, scoring recovery, and audit</h3>
              <p className="text-sm font-semibold text-gray-600">
                Use automatic publish when imported result matches official match/team IDs and no validation warnings exist.
                Use manual review when team IDs, winner, score, or final status conflict.
              </p>
            </div>
            <InlineDisclosureButton
              isOpen={isOperationsOpen}
              variant="subtle"
              onClick={() => setIsOperationsOpen((current) => !current)}
            />
          </div>

          {isOperationsOpen ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <OperationMetric label="Automatic OK" value={matchOperationSummary.automaticOk} tone="emerald" />
                <OperationMetric
                  label="Needs review"
                  value={matchOperationSummary.needsReview}
                  tone="amber"
                  onClick={() => handleOperationQueueJump(needsReviewQueueRef)}
                  actionLabel="View needs review queue"
                />
                <OperationMetric
                  label="Manual override"
                  value={matchOperationSummary.manualOverride}
                  tone="slate"
                  onClick={() => handleOperationQueueJump(manualOverrideQueueRef)}
                  actionLabel="View manual override queue"
                />
                <OperationMetric
                  label="Conflict"
                  value={matchOperationSummary.conflict}
                  tone="rose"
                  onClick={() => handleOperationQueueJump(conflictQueueRef)}
                  actionLabel="View conflict queue"
                />
                <OperationMetric label="Finalized" value={matchOperationSummary.finalized} tone="gray" />
              </div>

              {matchOperationSummary.reviewQueue.length > 0 ? (
                <div className="space-y-3">
                  {matchOperationSummary.conflictQueue.length > 0 ? (
                    <div ref={conflictQueueRef} tabIndex={-1} className="scroll-mt-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300">
                      <MatchReviewQueueSection
                        title="Conflicts"
                        items={matchOperationSummary.conflictQueue}
                        tone="rose"
                        onReviewMatch={handleReviewMatchFromQueue}
                      />
                    </div>
                  ) : null}
                  {matchOperationSummary.needsReviewQueue.length > 0 ? (
                    <div ref={needsReviewQueueRef} tabIndex={-1} className="scroll-mt-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300">
                      <MatchReviewQueueSection
                        title="Needs review"
                        items={matchOperationSummary.needsReviewQueue}
                        tone="amber"
                        onReviewMatch={handleReviewMatchFromQueue}
                      />
                    </div>
                  ) : null}
                  {matchOperationSummary.manualOverrideQueue.length > 0 ? (
                    <div ref={manualOverrideQueueRef} tabIndex={-1} className="scroll-mt-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300">
                      <MatchReviewQueueSection
                        title="Manual overrides"
                        items={matchOperationSummary.manualOverrideQueue}
                        tone="slate"
                        onReviewMatch={handleReviewMatchFromQueue}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                  No match validation warnings are currently detected.
                </div>
              )}

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Selected match recovery</p>
                    <h4 className="text-base font-black text-gray-950">Rerun scoring for one finalized match</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Reuses the existing scoring path for one final match. It preserves predictions and rebuilds affected totals.
                    </p>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Finalized match</span>
                    <select
                      value={selectedOperationsMatchId}
                      onChange={(event) => setSelectedOperationsMatchId(event.target.value)}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    >
                      <option value="">Select a finalized match</option>
                      {scoreableOperationMatches.map((match) => (
                        <option key={`ops-match-${match.id}`} value={match.id}>
                          {match.id} · {formatStage(match.stage)} · {getSideLabel(match, "home").short} vs {getSideLabel(match, "away").short}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedOperationsMatch ? (
                    <MatchOperationSnapshot match={selectedOperationsMatch} />
                  ) : (
                    <p className="mt-3 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-600">
                      No finalized matches are currently available for rerun scoring.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!selectedOperationsMatch || selectedOperationsMatch.status !== "final" || isScoringSelectedMatch}
                      onClick={() => void handleScoreSelectedMatch()}
                      className="rounded-md bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                    >
                      {isScoringSelectedMatch ? "Rerunning scoring..." : "Rerun match scoring"}
                    </button>
                    <button
                      type="button"
                      disabled={isSyncingMatches}
                      onClick={() => void handleSyncMatchesNow()}
                      className="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      {isSyncingMatches ? "Syncing..." : "Sync imported results"}
                    </button>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Canonical recovery</p>
                    <h4 className="text-base font-black text-gray-950">Audit and rebuild leaderboard cache</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Run read-only checks first. Repair only rebuilds derived totals and cache rows; it does not change predictions.
                    </p>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Repair reason</span>
                    <input
                      type="text"
                      value={operationsReason}
                      onChange={(event) => setOperationsReason(event.target.value)}
                      placeholder="Required before rebuilding leaderboard cache"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isRunningScoringAudit}
                      onClick={() => void handleRunScoringAudit()}
                      className="rounded-md bg-accent px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                    >
                      {isRunningScoringAudit ? "Running audit..." : "Run read-only audit"}
                    </button>
                    <button
                      type="button"
                      disabled={!operationsReason.trim() || isRepairingOperationsLeaderboard}
                      onClick={() => void handleRepairOperationsLeaderboard()}
                      className="rounded-md bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                    >
                      {isRepairingOperationsLeaderboard ? "Rebuilding..." : "Rebuild leaderboard cache"}
                    </button>
                  </div>

                  {scoringAuditReport ? <ScoringAuditSummary report={scoringAuditReport} /> : null}
                </section>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm font-semibold text-gray-600">
                <p className="font-black uppercase tracking-wide text-gray-700">Backend coverage</p>
                <p className="mt-1">
                  Available now: manual finalize/unfinalize, one-match scoring rerun, knockout rescoring, knockout advancement repair,
                  leaderboard cache rebuild, match sync, read-only scoring audit, and explicit advanced reset tools.
                </p>
                <p className="mt-1">
                  Missing as UI-backed safe repair: full `scripts/scoring-audit.ts --apply` extraction and per-match change-history viewer.
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Match filters and search</p>
            <h3 className="text-lg font-black text-gray-950">Find the matches you want to manage</h3>
            <p className="text-sm font-semibold text-gray-600">
              Narrow the list by stage or date, then update scores and statuses below.
            </p>
          </div>
          <InlineDisclosureButton
            isOpen={isFiltersOpen}
            variant="subtle"
            onClick={() => setIsFiltersOpen((current) => !current)}
          />
        </div>
        {isFiltersOpen ? (
          <>
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
            {isLoading ? <p className="mt-4 rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold">Loading matches...</p> : null}

            <div className="mt-5 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Match list / match editing</p>
                <h3 className="text-lg font-black text-gray-950">Update statuses, scores, and final results</h3>
              </div>
              {filteredMatches.map((match) => (
                <MatchResultCard
                  key={match.id}
                  match={match}
                  isReviewTarget={match.id === selectedReviewMatchId}
                  onSaved={(updatedMatch) => {
                    setMatches((currentMatches) =>
                      currentMatches.map((currentMatch) => (currentMatch.id === updatedMatch.id ? updatedMatch : currentMatch))
                    );
                    setSelectedReviewMatchId("");
                    showAppToast({ tone: "success", text: "Match updated." });
                  }}
                  onScored={(text) => showAppToast({ tone: "success", text })}
                  onError={(text) => showAppToast({ tone: "error", text })}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Tournament progression</p>
            <h3 className="text-lg font-black text-gray-950">Knockout seeding, repair, and rescoring</h3>
            <p className="text-sm font-semibold text-gray-600">
              Use these tools after group-stage results are complete or when repairing knockout advancement during testing.
            </p>
          </div>
          <InlineDisclosureButton
            isOpen={isTournamentProgressOpen}
            variant="subtle"
            onClick={() => setIsTournamentProgressOpen((current) => !current)}
          />
        </div>
        {isTournamentProgressOpen ? (
        <div className="mt-4 space-y-3">
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Seeding</p>
                <h3 className="text-lg font-black text-gray-950">Seed knockout from group results</h3>
                <p className="text-sm font-semibold text-gray-600">
                  {knockoutSeedingStatusText ||
                    (knockoutSeedStatus.hasKnockoutStarted
                      ? "Round of 32 matches have already started. Automatic seeding is locked."
                      : !knockoutSeedStatus.isReady
                        ? `Finalize all ${knockoutSeedStatus.expectedGroupMatchCount} group-stage matches before seeding the Round of 32.`
                        : knockoutSeedStatus.hasAnySeeds
                          ? "Group-stage results are complete and knockout matches already exist. Re-seeding may overwrite current Round of 32 team assignments."
                          : `All ${knockoutSeedStatus.expectedGroupMatchCount} group-stage matches are final. Round of 32 can now be seeded.`)}
                </p>
                {knockoutSeedingStatusText ? (
                  <p
                    className={`text-xs font-bold uppercase tracking-wide ${
                      knockoutSeedingStatusTone === "rose"
                        ? "text-rose-700"
                        : knockoutSeedingStatusTone === "amber"
                          ? "text-amber-700"
                          : knockoutSeedingStatusTone === "emerald"
                            ? "text-emerald-700"
                            : "text-gray-500"
                    }`}
                  >
                    {knockoutSeedingStatusTone === "rose"
                      ? "Needs admin attention"
                      : knockoutSeedingStatusTone === "amber"
                        ? "Ready to seed"
                        : knockoutSeedingStatusTone === "emerald"
                          ? "Seed status recorded"
                          : "Waiting for group completion"}
                  </p>
                ) : null}
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
        ) : null}
      </section>

      {canUseDangerZone ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-wide text-rose-700">Advanced</p>
              <h3 className="text-lg font-black text-gray-950">Testing and destructive recovery tools</h3>
              <p className="text-sm font-semibold text-gray-600">
                These tools were built for pre-launch QA and emergency recovery. Keep normal match publishing and scoring
                repair in the operations panel above.
              </p>
              <p className="text-sm font-semibold text-rose-700">
                Production deployments require explicit reset environment variables before either action can run.
              </p>
            </div>
            <InlineDisclosureButton
              isOpen={isDangerZoneOpen}
              variant="subtle"
              onClick={() => setIsDangerZoneOpen((current) => !current)}
            />
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
                      ENABLE_DESTRUCTIVE_ADMIN_TOOLS present:{" "}
                      {diagnostics.enableDestructiveAdminToolsPresent ? "yes" : "no"}
                    </p>
                    <p>
                      ENABLE_DESTRUCTIVE_ADMIN_TOOLS equals &quot;true&quot;:{" "}
                      {diagnostics.enableDestructiveAdminToolsIsTrue ? "yes" : "no"}
                    </p>
                    <p>
                      ALLOW_PRODUCTION_ADMIN_RESETS present:{" "}
                      {diagnostics.allowProductionAdminResetsPresent ? "yes" : "no"}
                    </p>
                    <p>
                      ALLOW_PRODUCTION_ADMIN_RESETS equals &quot;true&quot;:{" "}
                      {diagnostics.allowProductionAdminResetsIsTrue ? "yes" : "no"}
                    </p>
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
                    <h4 className="text-base font-black text-gray-950">Batch Create Pretend Match Results</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Create pretend finalized results for testing. This triggers scoring through the normal app flow and
                      can overwrite only existing pretend/manual-override results when overwrite mode is enabled.
                    </p>
                    <p className="text-sm font-semibold text-gray-500">Preserves player picks. Rebuilds scoring only.</p>
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
                        <option value="skip-finalized">Create only where no final result exists</option>
                        <option value="overwrite-test-results">Overwrite existing pretend test results only</option>
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
                      I understand this will create pretend finalized match results for testing.
                    </span>
                  </label>

                  {renderResetReadiness({
                    title: "Finalize readiness",
                    availability: batchFinalizeAvailability,
                    checkboxChecked: isBatchFinalizeAcknowledged,
                    phraseMatches: isBatchFinalizePhraseValid,
                    productionBlockedMessage:
                      "Production testing tools are blocked. Enable ALLOW_PRODUCTION_KNOCKOUT_RESET=true or ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={!canSubmitBatchFinalize}
                    onClick={() => void handleBatchFinalizeMatches()}
                    className="mt-4 rounded-md bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isBatchFinalizingMatches ? "Creating pretend results..." : "Batch Create Pretend Results"}
                  </button>

                  <div className="mt-5 border-t border-rose-100 pt-4">
                    <div className="space-y-1">
                      <h5 className="text-sm font-black text-gray-950">Batch Clear Pretend Match Results</h5>
                      <p className="text-sm font-semibold text-gray-600">
                        Clear only pretend/manual-override results for the same date range and scope, then repair derived scoring state.
                      </p>
                      <p className="text-sm font-semibold text-gray-500">Preserves player picks. Rebuilds scoring only.</p>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-sm font-bold text-gray-700">Type confirmation exactly</span>
                      <input
                        type="text"
                        value={batchClearConfirmationText}
                        onChange={(event) => setBatchClearConfirmationText(event.target.value)}
                        placeholder={BATCH_CLEAR_CONFIRMATION_PHRASE}
                        className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                      />
                      {isBatchClearPhraseClose ? (
                        <p className="mt-2 text-sm font-semibold text-rose-700">
                          Type exactly: {BATCH_CLEAR_CONFIRMATION_PHRASE}
                        </p>
                      ) : null}
                    </label>

                    <label className="mt-4 flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isBatchClearAcknowledged}
                        onChange={(event) => setIsBatchClearAcknowledged(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                      />
                      <span className="text-sm font-semibold text-gray-700">
                        I understand this will clear pretend/manual-override match results and dependent scoring state for the selected matches.
                      </span>
                    </label>

                    {renderResetReadiness({
                      title: "Clear readiness",
                      availability: batchFinalizeAvailability,
                      checkboxChecked: isBatchClearAcknowledged,
                      phraseMatches: isBatchClearPhraseValid,
                      productionBlockedMessage:
                        "Production testing tools are blocked. Enable ALLOW_PRODUCTION_KNOCKOUT_RESET=true or ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
                    })}

                    <button
                      type="button"
                      disabled={!canSubmitBatchClear}
                      onClick={() => void handleBatchClearMatches()}
                      className="mt-4 rounded-md border border-rose-300 bg-white px-4 py-3 text-sm font-bold text-rose-700 disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-600"
                    >
                      {isBatchClearingMatches ? "Clearing pretend results..." : "Batch Clear Pretend Results"}
                    </button>
                  </div>
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
                    <span className="text-sm font-bold text-gray-700">Reason</span>
                    <input
                      type="text"
                      value={resetReasonByScope.knockout}
                      onChange={(event) =>
                        setResetReasonByScope((current) => ({ ...current, knockout: event.target.value }))
                      }
                      placeholder="Explain why this knockout recovery reset is needed"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
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
                      "Production knockout reset is disabled. Enable ALLOW_PRODUCTION_KNOCKOUT_RESET=true or ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
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
                    <span className="text-sm font-bold text-gray-700">Reason</span>
                    <input
                      type="text"
                      value={resetReasonByScope.group_stage}
                      onChange={(event) =>
                        setResetReasonByScope((current) => ({ ...current, group_stage: event.target.value }))
                      }
                      placeholder="Explain why this group-stage recovery reset is needed"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
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
                      "Production group-stage reset is disabled. Enable ALLOW_PRODUCTION_GROUP_RESET=true or ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
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

                <section className="rounded-lg border border-rose-200 bg-white p-4">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Clear Easy Bracket snapshots</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Clears saved Easy Bracket seed rankings and best-third selections across the app. This blanks projected bracket paths until players rebuild them, without changing score predictions, match results, knockout picks, or leaderboard totals.
                    </p>
                  </div>

                  <label className="mt-4 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isBracketBuilderResetAcknowledged}
                      onChange={(event) => setIsBracketBuilderResetAcknowledged(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      I understand this will remove saved Easy Bracket snapshot data for all users.
                    </span>
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Reason</span>
                    <input
                      type="text"
                      value={resetReasonByScope.bracket_builder}
                      onChange={(event) =>
                        setResetReasonByScope((current) => ({ ...current, bracket_builder: event.target.value }))
                      }
                      placeholder="Explain why this Easy Bracket snapshot reset is needed"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Type confirmation exactly</span>
                    <input
                      type="text"
                      value={bracketBuilderResetConfirmationText}
                      onChange={(event) => setBracketBuilderResetConfirmationText(event.target.value)}
                      placeholder={BRACKET_BUILDER_RESET_CONFIRMATION_PHRASE}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                    {isBracketBuilderResetPhraseClose ? (
                      <p className="mt-2 text-sm font-semibold text-rose-700">
                        Type exactly: {BRACKET_BUILDER_RESET_CONFIRMATION_PHRASE}
                      </p>
                    ) : null}
                  </label>

                  {renderResetReadiness({
                    availability: bracketBuilderAvailability,
                    checkboxChecked: isBracketBuilderResetAcknowledged,
                    phraseMatches: isBracketBuilderResetPhraseValid,
                    productionBlockedMessage:
                      "Production Easy Bracket snapshot reset is disabled. Enable ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={!canSubmitBracketBuilderReset}
                    onClick={() => void handleResetBracketBuilderSnapshots()}
                    className="mt-4 rounded-md bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isResettingBracketBuilder ? "Clearing Easy Bracket snapshots..." : "Clear Easy Bracket snapshots"}
                  </button>
                </section>

                <section className="rounded-lg border border-rose-200 bg-white p-4">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Clear testing social + movement data</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Clears trophies, perfect-pick and daily-winner activity, comments, reactions, notifications, leaderboard events, and movement history created during testing. Scoring, predictions, and match results stay untouched.
                    </p>
                  </div>

                  {renderResetReadiness({
                    availability: socialAvailability,
                    checkboxChecked: true,
                    phraseMatches: true,
                    productionBlockedMessage:
                      "Production social/activity reset is disabled. Enable ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={!socialAvailability?.environmentResetAllowed || isResettingTestingSocial}
                    onClick={() => void handleResetTestingSocialData()}
                    className="mt-4 rounded-md border border-rose-300 bg-white px-4 py-3 text-sm font-bold text-rose-700 disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-600"
                  >
                    {isResettingTestingSocial ? "Clearing testing social data..." : "Clear Testing Social + Movement Data"}
                  </button>
                </section>

                <section className="rounded-lg border border-rose-200 bg-white p-4">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Reset match to open</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Restore one test match to a clean editable open state. This clears actual scores, finalization,
                      manual override and sync flags, dependent scoring rows, and stale knockout advancement derived from
                      that match.
                    </p>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Match</span>
                    <select
                      value={selectedResetMatchId}
                      onChange={(event) => setSelectedResetMatchId(event.target.value)}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    >
                      <option value="">Select a match</option>
                      {resettableMatches.map((match) => (
                        <option key={`reset-match-${match.id}`} value={match.id}>
                          {match.id} · {formatStage(match.stage)} · {formatMatchStatus(match.status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Reason</span>
                    <input
                      type="text"
                      value={resetReasonByScope.match}
                      onChange={(event) =>
                        setResetReasonByScope((current) => ({ ...current, match: event.target.value }))
                      }
                      placeholder="Explain why this match recovery reset is needed"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Type match id exactly</span>
                    <input
                      type="text"
                      value={matchResetConfirmationText}
                      onChange={(event) => setMatchResetConfirmationText(event.target.value)}
                      placeholder={selectedResetMatchId || "Select a match first"}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                  </label>

                  {renderResetReadiness({
                    title: "Match reset readiness",
                    availability: matchAvailability,
                    checkboxChecked: Boolean(selectedResetMatchId) && Boolean(resetReasonByScope.match.trim()),
                    phraseMatches: Boolean(selectedResetMatchId) && matchResetConfirmationText === selectedResetMatchId,
                    productionBlockedMessage:
                      "Production match reset is disabled. Enable ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={
                      !matchAvailability?.environmentResetAllowed ||
                      !selectedResetMatchId ||
                      !resetReasonByScope.match.trim() ||
                      matchResetConfirmationText !== selectedResetMatchId ||
                      isResettingMatch
                    }
                    onClick={() => void handleResetMatchToOpen()}
                    className="mt-4 rounded-md bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isResettingMatch ? "Resetting match..." : "Reset Match to Open"}
                  </button>
                </section>

                <section className="rounded-lg border border-rose-200 bg-white p-4">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Recalculate leaderboards</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Rebuild persisted leaderboard totals and snapshots from saved scoring rows without changing
                      predictions or match results.
                    </p>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Reason</span>
                    <input
                      type="text"
                      value={resetReasonByScope.leaderboard}
                      onChange={(event) =>
                        setResetReasonByScope((current) => ({ ...current, leaderboard: event.target.value }))
                      }
                      placeholder="Explain why this leaderboard repair is needed"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                  </label>

                  {renderResetReadiness({
                    title: "Leaderboard repair readiness",
                    availability: leaderboardAvailability,
                    checkboxChecked: Boolean(resetReasonByScope.leaderboard.trim()),
                    phraseMatches: true,
                    productionBlockedMessage:
                      "Production leaderboard repair is disabled. Enable ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={
                      !leaderboardAvailability?.environmentResetAllowed ||
                      !resetReasonByScope.leaderboard.trim() ||
                      isRepairingLeaderboard
                    }
                    onClick={() => void handleRepairLeaderboard()}
                    className="mt-4 rounded-md bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isRepairingLeaderboard ? "Rebuilding..." : "Recalculate Leaderboards"}
                  </button>
                </section>

                <section className="rounded-lg border border-rose-200 bg-white p-4 xl:col-span-2">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-gray-950">Full pre-launch test reset</h4>
                    <p className="text-sm font-semibold text-gray-600">
                      Return the app to a clean pre-launch test state. This clears group-stage test data, knockout seeds,
                      picks, and scores, social/movement history, and derived leaderboard state. Accounts, groups, tier
                      access, and branding stay intact.
                    </p>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Reason</span>
                    <input
                      type="text"
                      value={resetReasonByScope.full_test}
                      onChange={(event) =>
                        setResetReasonByScope((current) => ({ ...current, full_test: event.target.value }))
                      }
                      placeholder="Explain why the full pre-launch recovery reset is needed"
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                  </label>

                  <label className="mt-4 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isFullResetAcknowledged}
                      onChange={(event) => setIsFullResetAcknowledged(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      I understand this will clear all platform-wide test state and force clients to drop stale resettable UI state.
                    </span>
                  </label>

                  <label className="mt-4 block">
                    <span className="text-sm font-bold text-gray-700">Type confirmation exactly</span>
                    <input
                      type="text"
                      value={fullResetConfirmationText}
                      onChange={(event) => setFullResetConfirmationText(event.target.value)}
                      placeholder={FULL_TEST_RESET_CONFIRMATION_PHRASE}
                      className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm font-semibold text-gray-900"
                    />
                  </label>

                  {renderResetReadiness({
                    title: "Full reset readiness",
                    availability: fullResetAvailability,
                    checkboxChecked: isFullResetAcknowledged && Boolean(resetReasonByScope.full_test.trim()),
                    phraseMatches: isFullResetPhraseValid,
                    productionBlockedMessage:
                      "Production full reset is disabled. Enable ALLOW_PRODUCTION_ADMIN_RESETS=true and redeploy."
                  })}

                  <button
                    type="button"
                    disabled={
                      !fullResetAvailability?.environmentResetAllowed ||
                      !resetReasonByScope.full_test.trim() ||
                      !isFullResetAcknowledged ||
                      !isFullResetPhraseValid ||
                      isRunningFullReset
                    }
                    onClick={() => void handleFullPreLaunchReset()}
                    className="mt-4 rounded-md bg-rose-700 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300 disabled:text-gray-600"
                  >
                    {isRunningFullReset ? "Running full reset..." : "Full Pre-Launch Test Reset"}
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

function OperationMetric({
  label,
  value,
  tone,
  onClick,
  actionLabel
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "slate" | "rose" | "gray";
  onClick?: () => void;
  actionLabel?: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : tone === "slate"
            ? "border-slate-200 bg-slate-50 text-slate-800"
            : "border-gray-200 bg-gray-50 text-gray-800";
  const content = (
    <>
      <p className="text-[11px] font-black uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {onClick && value > 0 ? <p className="mt-1 text-[10px] font-black uppercase tracking-wide opacity-75">View</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        disabled={value === 0}
        onClick={onClick}
        aria-label={actionLabel ?? `View ${label}`}
        className={`rounded-lg border px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-default ${toneClass}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClass}`}>
      {content}
    </div>
  );
}

function MatchReviewQueueSection({
  title,
  items,
  tone,
  onReviewMatch
}: {
  title: string;
  items: Array<{ match: AdminMatch; issues: string[] }>;
  tone: "amber" | "rose" | "slate";
  onReviewMatch: (match: AdminMatch) => void;
}) {
  const toneClass =
    tone === "rose"
      ? {
          wrapper: "border-rose-200 bg-rose-50",
          title: "text-rose-800",
          card: "border-rose-100",
          issue: "text-rose-800"
        }
      : tone === "slate"
        ? {
            wrapper: "border-slate-200 bg-slate-50",
            title: "text-slate-800",
            card: "border-slate-100",
            issue: "text-slate-700"
          }
        : {
            wrapper: "border-amber-200 bg-amber-50",
            title: "text-amber-800",
            card: "border-amber-100",
            issue: "text-amber-800"
          };
  const visibleItems = items.slice(0, 6);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className={`rounded-lg border p-3 ${toneClass.wrapper}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs font-black uppercase tracking-wide ${toneClass.title}`}>
          {title} · {items.length}
        </p>
        {hiddenCount > 0 ? (
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Showing first {visibleItems.length}; use filters below for all
          </p>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {visibleItems.map((item) => (
          <div key={`${title}-${item.match.id}`} className={`rounded-md border bg-white px-3 py-2 ${toneClass.card}`}>
            <p className="text-sm font-black text-gray-950">
              {item.match.id} · {getSideLabel(item.match, "home").short} vs {getSideLabel(item.match, "away").short}
            </p>
            <p className={`mt-1 text-xs font-semibold ${toneClass.issue}`}>{item.issues.join(" · ")}</p>
            <p className="mt-1 text-xs font-semibold text-gray-600">
              {formatMatchStatus(item.match.status)} · Score {formatScore(item.match)} · Winner{" "}
              {getResolvedWinnerLabel(item.match, item.match.winnerTeamId)}
            </p>
            <p className="mt-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-700">
              Fix: {getMatchIssueRecommendation(item.match, item.issues)}
            </p>
            <button
              type="button"
              onClick={() => onReviewMatch(item.match)}
              className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-800"
            >
              Review match
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchOperationSnapshot({ match }: { match: AdminMatch }) {
  const issues = getMatchValidationIssues(match);
  const operationState = getMatchOperationState(match);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-black text-gray-950">
            {match.id} · {getSideLabel(match, "home").short} vs {getSideLabel(match, "away").short}
          </p>
          <p className="mt-1 text-xs font-semibold text-gray-500">
            Score: {formatScore(match)} · Winner: {getResolvedWinnerLabel(match, match.winnerTeamId)}
          </p>
        </div>
        <span className={`rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-wide ${operationState.className}`}>
          {operationState.label}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-xs font-semibold text-gray-600 sm:grid-cols-2">
        <div>
          <dt className="font-black uppercase tracking-wide text-gray-500">Source</dt>
          <dd>{match.externalId ? `External ${match.externalId}` : match.syncStatus ? `Sync ${match.syncStatus}` : "Manual/app state"}</dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-wide text-gray-500">Imported / updated</dt>
          <dd>
            {match.lastSyncedAt ? `Imported ${formatDateTime(match.lastSyncedAt)}` : "No import timestamp"} ·{" "}
            {match.updatedAt ? `Updated ${formatDateTime(match.updatedAt)}` : "No update timestamp"}
          </dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-wide text-gray-500">Status</dt>
          <dd>{formatMatchStatus(match.status)}</dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-wide text-gray-500">Validation</dt>
          <dd>{issues.length === 0 ? "Automatic OK" : issues.join(" · ")}</dd>
        </div>
      </dl>
    </div>
  );
}

function ScoringAuditSummary({ report }: { report: AdminScoringAuditReport }) {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-gray-950">Read-only audit report</p>
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{formatDateTime(report.generatedAt)}</p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {report.checks.map((check) => (
          <div
            key={check.key}
            className={`rounded-md border px-3 py-2 ${
              check.tone === "ok"
                ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                : check.tone === "danger"
                  ? "border-rose-100 bg-rose-50 text-rose-800"
                  : "border-amber-100 bg-amber-50 text-amber-800"
            }`}
          >
            <p className="text-xs font-black uppercase tracking-wide">{check.label}</p>
            <p className="mt-1 text-lg font-black">{check.count}</p>
            <p className="mt-1 text-xs font-semibold">{check.description}</p>
          </div>
        ))}
      </div>

      {report.warnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {report.warnings.slice(0, 3).join(" · ")}
        </div>
      ) : null}

      {report.terminalOnlyInterventions.length > 0 ? (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
          {report.terminalOnlyInterventions[0]}
        </div>
      ) : null}
    </div>
  );
}

type MatchResultCardProps = {
  match: AdminMatch;
  isReviewTarget?: boolean;
  onSaved: (match: AdminMatch) => void;
  onScored: (message: string) => void;
  onError: (message: string) => void;
};

function MatchResultCard({ match, isReviewTarget = false, onSaved, onScored, onError }: MatchResultCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [homeScore, setHomeScore] = useState(getAdminInitialScoreInput(match.homeScore));
  const [awayScore, setAwayScore] = useState(getAdminInitialScoreInput(match.awayScore));
  const [tiedWinnerTeamId, setTiedWinnerTeamId] = useState(match.winnerTeamId ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const isFinalized = status === "final";
  const isLive = status === "live" || status === "locked";
  const isKnockout = isKnockoutStage(match.stage);
  const predictionStateLabel = getPredictionStateLabel(status);
  const homeLabel = getSideLabel(match, "home");
  const awayLabel = getSideLabel(match, "away");
  const validationIssues = getMatchValidationIssues(match);
  const operationState = getMatchOperationState(match, validationIssues);
  const resolvedWinnerTeamId = resolveAdminMatchWinnerTeamId({
    stage: match.stage,
    homeScore,
    awayScore,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    tiedWinnerTeamId: tiedWinnerTeamId || null
  });
  const hasBothScores = homeScore !== "" && awayScore !== "";
  const hasTiedScore = hasBothScores && Number(homeScore) === Number(awayScore);
  const needsTieWinnerSelection = isKnockout && hasTiedScore;
  const isSubmitBlockedByMissingKnockoutWinner = requiresAdminKnockoutTiebreakWinner({
    stage: match.stage,
    status,
    homeScore,
    awayScore,
    winnerTeamId: resolvedWinnerTeamId
  });
  const resolvedWinnerLabel =
    needsTieWinnerSelection && !resolvedWinnerTeamId
      ? "Select tie-break winner"
      : getResolvedWinnerLabel(match, resolvedWinnerTeamId);
  const hasUnsavedChanges =
    status !== match.status ||
    homeScore !== getAdminInitialScoreInput(match.homeScore) ||
    awayScore !== getAdminInitialScoreInput(match.awayScore) ||
    (match.winnerTeamId ?? null) !== (resolvedWinnerTeamId ?? null);

  useEffect(() => {
    setStatus(match.status);
    setHomeScore(getAdminInitialScoreInput(match.homeScore));
    setAwayScore(getAdminInitialScoreInput(match.awayScore));
    setTiedWinnerTeamId(match.winnerTeamId ?? "");
  }, [match]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const affectsScoresOrLeaderboard = status === "final" || match.status === "final";
    if (affectsScoresOrLeaderboard) {
      const confirmed = window.confirm(
        "Save this match operation? Match status may change, bracket scores may be cleared or rebuilt, canonical totals may be recomputed, leaderboard cache may be rebuilt, and affected pages may be revalidated. User predictions will not be changed."
      );
      if (!confirmed) {
        return;
      }
    }

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
      id={getAdminMatchEditorId(match.id)}
      onSubmit={handleSubmit}
      className={`scroll-mt-6 rounded-lg border p-4 transition-colors ${
        isReviewTarget
          ? "border-accent bg-white ring-2 ring-accent/30"
          : isFinalized
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
          <span className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${operationState.className}`}>
            {operationState.label}
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
          {needsTieWinnerSelection ? (
            <label className="mt-3 block">
              <span
                className={`text-xs font-bold uppercase tracking-wide ${
                  isFinalized ? "text-gray-600" : isLive ? "text-amber-800" : "text-gray-500"
                }`}
              >
                Tie-break winner
              </span>
              <select
                value={tiedWinnerTeamId}
                onChange={(event) => setTiedWinnerTeamId(event.target.value)}
                className={`mt-2 w-full rounded-md border px-3 py-3 text-sm font-semibold ${
                  isFinalized
                    ? "border-gray-300 bg-gray-50 text-gray-800"
                    : isLive
                      ? "border-amber-200 bg-white text-gray-900"
                      : "border-gray-300 bg-white text-gray-900"
                }`}
              >
                <option value="">Select winner after penalties / tie-break</option>
                {match.homeTeamId ? <option value={match.homeTeamId}>{homeLabel.full}</option> : null}
                {match.awayTeamId ? <option value={match.awayTeamId}>{awayLabel.full}</option> : null}
              </select>
              <p
                className={`mt-2 text-xs font-semibold ${
                  isFinalized ? "text-gray-600" : isLive ? "text-amber-800" : "text-gray-500"
                }`}
              >
                Save the official score as a draw and choose the advancing team separately.
              </p>
            </label>
          ) : homeScore !== "" && awayScore !== "" && resolvedWinnerTeamId === null ? (
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
          {validationIssues.length > 0 ? <span className="text-amber-700">{validationIssues.join(" · ")}</span> : null}
        </div>

        <button
          type="submit"
          disabled={isSaving || !hasUnsavedChanges || isSubmitBlockedByMissingKnockoutWinner}
          className={`w-full rounded-md px-4 py-3 text-base font-bold ${
            isSaving || !hasUnsavedChanges || isSubmitBlockedByMissingKnockoutWinner
              ? "bg-gray-300 text-gray-600"
              : "bg-accent text-white"
          }`}
        >
          {isSaving ? "Saving..." : "Save Match"}
        </button>
        {isSubmitBlockedByMissingKnockoutWinner ? (
          <p className="text-sm font-semibold text-rose-700">
            Choose the tie-break winner before finalizing a knockout draw.
          </p>
        ) : null}
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

function buildMatchOperationSummary(matches: AdminMatch[]) {
  const summary = {
    automaticOk: 0,
    needsReview: 0,
    manualOverride: 0,
    conflict: 0,
    finalized: 0,
    reviewQueue: [] as Array<{ match: AdminMatch; issues: string[] }>,
    conflictQueue: [] as Array<{ match: AdminMatch; issues: string[] }>,
    needsReviewQueue: [] as Array<{ match: AdminMatch; issues: string[] }>,
    manualOverrideQueue: [] as Array<{ match: AdminMatch; issues: string[] }>
  };

  for (const match of matches) {
    const issues = getMatchValidationIssues(match);
    const state = getMatchOperationState(match, issues);

    if (state.key === "automatic_ok") {
      summary.automaticOk += 1;
    }
    if (state.key === "needs_review") {
      summary.needsReview += 1;
    }
    if (state.key === "manual_override") {
      summary.manualOverride += 1;
    }
    if (state.key === "conflict") {
      summary.conflict += 1;
    }
    if (match.status === "final") {
      summary.finalized += 1;
    }
    if (issues.length > 0 || match.isManualOverride) {
      const queueItem = {
        match,
        issues: issues.length > 0 ? issues : ["Manual override active"]
      };

      summary.reviewQueue.push(queueItem);

      if (state.key === "conflict") {
        summary.conflictQueue.push(queueItem);
      } else if (state.key === "needs_review") {
        summary.needsReviewQueue.push(queueItem);
      } else if (state.key === "manual_override") {
        summary.manualOverrideQueue.push(queueItem);
      }
    }
  }

  return summary;
}

function getAdminMatchEditorId(matchId: string) {
  return `admin-match-editor-${matchId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getMatchIssueRecommendation(match: AdminMatch, issues: string[]) {
  if (issues.includes("winner/score conflict")) {
    return "Make the saved winner match the score, or correct the score before publishing.";
  }
  if (issues.includes("winner/team ID mismatch")) {
    return "Clear the winner or choose one of the two teams shown in this match.";
  }
  if (issues.includes("knockout draw conflict")) {
    return "Knockout matches need an official winner; enter the tie-break winner before finalizing.";
  }
  if (issues.includes("missing score")) {
    return "Enter both scores before marking this match final.";
  }
  if (issues.includes("missing team")) {
    return match.stage === "group"
      ? "Assign both teams before publishing this group match."
      : "Seed the knockout teams first; do not publish this match until both teams are known.";
  }
  if (issues.includes("impossible score")) {
    return "Use non-negative scores only.";
  }
  if (issues.includes("sync conflict detected")) {
    return "Compare the imported result with the published result, then sync or keep the manual override intentionally.";
  }
  if (issues.includes("published result newer than import")) {
    return "Keep the manual result if intentional, or sync imported results after confirming the official feed.";
  }
  if (match.isManualOverride) {
    return "Leave this alone if the override is intentional; otherwise review and clear the test result.";
  }

  return "Review status, teams, score, and winner before publishing.";
}

function getMatchValidationIssues(match: AdminMatch) {
  const issues: string[] = [];
  const hasHomeScore = typeof match.homeScore === "number";
  const hasAwayScore = typeof match.awayScore === "number";

  if ((!match.homeTeamId || !match.awayTeamId) && (match.stage === "group" || match.status !== "scheduled")) {
    issues.push("missing team");
  }
  if (match.status === "final" && (!hasHomeScore || !hasAwayScore)) {
    issues.push("missing score");
  }
  if ((hasHomeScore && match.homeScore! < 0) || (hasAwayScore && match.awayScore! < 0)) {
    issues.push("impossible score");
  }
  if (match.winnerTeamId && match.winnerTeamId !== match.homeTeamId && match.winnerTeamId !== match.awayTeamId) {
    issues.push("winner/team ID mismatch");
  }
  if (hasHomeScore && hasAwayScore) {
    if (
      hasAdminWinnerScoreConflict({
        stage: match.stage,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        winnerTeamId: match.winnerTeamId
      })
    ) {
      issues.push("winner/score conflict");
    }
    if (
      requiresAdminKnockoutTiebreakWinner({
        stage: match.stage,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        winnerTeamId: match.winnerTeamId
      })
    ) {
      issues.push("knockout draw conflict");
    }
  }
  if (match.syncStatus === "error") {
    issues.push("sync conflict detected");
  }
  if (match.lastSyncedAt && match.updatedAt && new Date(match.updatedAt).getTime() > new Date(match.lastSyncedAt).getTime()) {
    issues.push("published result newer than import");
  }

  return issues;
}

function getMatchOperationState(match: AdminMatch, knownIssues = getMatchValidationIssues(match)) {
  const hasConflict = knownIssues.some((issue) => issue.includes("conflict") || issue.includes("mismatch"));

  if (hasConflict) {
    return {
      key: "conflict",
      label: "Conflict detected",
      className: "bg-rose-100 text-rose-800"
    };
  }
  if (match.isManualOverride) {
    return {
      key: "manual_override",
      label: "Manual override active",
      className: "bg-slate-900 text-white"
    };
  }
  if (knownIssues.length > 0) {
    return {
      key: "needs_review",
      label: "Needs review",
      className: "bg-amber-100 text-amber-800"
    };
  }
  if (match.status === "final") {
    return {
      key: "published",
      label: "Published / Finalized",
      className: "bg-gray-200 text-gray-800"
    };
  }

  return {
    key: "automatic_ok",
    label: "Automatic OK",
    className: "bg-emerald-100 text-emerald-800"
  };
}

function formatScore(match: AdminMatch) {
  return typeof match.homeScore === "number" && typeof match.awayScore === "number"
    ? `${match.homeScore}-${match.awayScore}`
    : "not set";
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
