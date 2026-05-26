import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BracketBuilderClient } from "@/components/BracketBuilderClient";
import { ManagementIntro } from "@/components/player-management/Shared";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import {
  fetchKnockoutStructureStatus,
  fetchProjectedKnockoutBracketPreview,
  safeFetchKnockoutStructureStatusFallback
} from "@/lib/bracket-predictions";
import {
  fetchUserGroupProjectionSourceMap,
  fetchUserLightSeedBuilderSnapshot,
  type LightSeedBuilderSnapshot,
  type UserGroupProjectionSource
} from "@/lib/group-stage-modes";
import { getRequiredThirdPlaceQualifierCount, type KnockoutPlaceholderMatch } from "@/lib/knockout-seeding";
import { getConfiguredGroupPredictionMode, isFullScoresModeEnabled } from "@/lib/group-prediction-mode";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
import { GROUP_PHASE_START_AT } from "@/lib/play-mode";
import { normalizeLanguage } from "@/lib/i18n";
import { t } from "@/lib/strings";
import { logSafeSupabaseError } from "@/lib/supabase-errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { MatchWithTeams } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BracketBuilderPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: authUser }
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/login?next=%2Fbracket-builder&mode=signup");
  }

  await redirectIfLaunchOnboardingRequired({ userId: authUser.id });
  await redirectIfLegacyScoringSetupRequired({ userId: authUser.id, pathname: "/bracket-builder" });

  const adminSupabase = createAdminClient();
  const fullScoresEnabled = isFullScoresModeEnabled(getConfiguredGroupPredictionMode());
  let preferredLanguage = normalizeLanguage(null);
  try {
    const { data: userProfile } = await adminSupabase
      .from("users")
      .select("preferred_language")
      .eq("id", authUser.id)
      .maybeSingle();
    preferredLanguage = normalizeLanguage((userProfile as { preferred_language?: string | null } | null)?.preferred_language);
  } catch (error) {
    logSafeSupabaseError("bracket-builder-language-load", error, { userId: authUser.id, recoverable: true });
  }
  const localMatches = getGroupMatches().map((match) => ({
    ...match,
    homeTeam: getTeam(match.homeTeamId),
    awayTeam: getTeam(match.awayTeamId)
  })) as MatchWithTeams[];
  let initialSnapshot: LightSeedBuilderSnapshot | null = null;
  let hasSavedSnapshot = false;
  let initialGroupProjectionSources: Record<string, UserGroupProjectionSource> = {};
  try {
    const [savedSnapshot, sourceMap] = await Promise.all([
      fetchUserLightSeedBuilderSnapshot(adminSupabase, authUser.id),
      fetchUserGroupProjectionSourceMap(adminSupabase, authUser.id)
    ]);
    hasSavedSnapshot = savedSnapshot.groupRankings.length > 0;
    initialSnapshot = hasSavedSnapshot ? savedSnapshot : null;
    initialGroupProjectionSources = Object.fromEntries(sourceMap.entries());
  } catch (error) {
    logSafeSupabaseError("bracket-builder-snapshot-load", error, { userId: authUser.id, recoverable: true });
    initialSnapshot = null;
    hasSavedSnapshot = false;
    initialGroupProjectionSources = {};
  }

  let knockoutStatus = safeFetchKnockoutStructureStatusFallback();
  try {
    knockoutStatus = await fetchKnockoutStructureStatus();
  } catch (error) {
    logSafeSupabaseError("bracket-builder-knockout-status", error, {
      userId: authUser.id,
      recoverable: true
    });
  }

  const projectedKnockoutComparisonView = await fetchProjectedKnockoutBracketPreview(
    authUser.id,
    knockoutStatus.isFullySeeded ? { comparisonOnly: true } : undefined
  ).catch(() => null);

  const { data: roundOf32Rows, error: roundOf32Error } = await adminSupabase
    .from("matches")
    .select("id,stage,status,home_source,away_source,home_team_id,away_team_id")
    .in("stage", ["r32", "round_of_32"])
    .order("kickoff_time", { ascending: true });

  if (roundOf32Error) {
    throw new Error(roundOf32Error.message);
  }

  const roundOf32Placeholders = ((roundOf32Rows ?? []) as Array<{
    id: string;
    stage: string;
    status: "scheduled" | "locked" | "live" | "final";
    home_source?: string | null;
    away_source?: string | null;
    home_team_id?: string | null;
    away_team_id?: string | null;
  }>).map((match) => ({
    id: match.id,
    stage: match.stage,
    status: match.status,
    homeSource: match.home_source ?? null,
    awaySource: match.away_source ?? null,
    homeTeamId: match.home_team_id ?? null,
    awayTeamId: match.away_team_id ?? null
  })) satisfies KnockoutPlaceholderMatch[];

  const requiredThirdPlaceQualifierCount = getRequiredThirdPlaceQualifierCount(roundOf32Placeholders);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 pb-4 pt-0">
        <ManagementIntro
          eyebrowKey="bracket.startHere"
          titleKey="bracket.groupStage"
          description={t(preferredLanguage, "bracket.pickQualifyingTeamsOnly")}
          secondaryNote={fullScoresEnabled ? t(preferredLanguage, "bracket.pickScoresEarnMorePoints") : t(preferredLanguage, "bracket.finishGroupThenKnockout")}
          statusChipKey={knockoutStatus.isFullySeeded ? "common.locked" : "common.open"}
          disclosureStorageKey="group-stage-top-card"
          disclosurePlacement="bottom-right"
          collapseBodyWhenClosed
        />
        <BracketBuilderClient
          initialMatches={localMatches}
          initialKnockoutSeeded={knockoutStatus.isFullySeeded}
          initialSnapshot={initialSnapshot}
        hasSavedSnapshot={hasSavedSnapshot}
        initialGroupProjectionSources={initialGroupProjectionSources}
        requiredThirdPlaceQualifierCount={requiredThirdPlaceQualifierCount}
        roundOf32Placeholders={roundOf32Placeholders}
        groupStageDueAt={GROUP_PHASE_START_AT}
        knockoutProjectedPreview={projectedKnockoutComparisonView}
        fullScoresEnabled={fullScoresEnabled || authUser.role === "admin"}
        language={preferredLanguage}
        />
      </div>
    </AppShell>
  );
}
