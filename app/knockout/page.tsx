import { KnockoutBracketBuilder } from "@/components/KnockoutBracketBuilder";
import { AppShell } from "@/components/AppShell";
import { ManagementIntro } from "@/components/player-management/Shared";
import {
  fetchKnockoutBracketEditorView,
  fetchProjectedKnockoutBracketPreview,
  fetchKnockoutStructureStatus
} from "@/lib/bracket-predictions";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { normalizeLanguage } from "@/lib/i18n";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { t } from "@/lib/strings";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function KnockoutPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (user) {
    await redirectIfLaunchOnboardingRequired({ userId: user.id });
    await redirectIfLegacyScoringSetupRequired({ userId: user.id, pathname: "/knockout" });
  }
  let language = normalizeLanguage(null);
  if (user) {
    const { data: profile } = await supabase.from("users").select("preferred_language").eq("id", user.id).maybeSingle();
    language = normalizeLanguage((profile as { preferred_language?: string | null } | null)?.preferred_language);
  }
  const knockoutStatus = await fetchKnockoutStructureStatus().catch(() => ({
    counts: { r32: 0, r16: 0, qf: 0, sf: 0, third: 0, final: 0 },
    isFullySeeded: false,
    firstRoundOf32Kickoff: null
  }));
  const isOfficialSeeded = knockoutStatus.isFullySeeded;
  const officialBracketView = user && isOfficialSeeded
    ? await fetchKnockoutBracketEditorView(user.id).catch(() => ({
        mode: "official" as const,
        isSeeded: false,
        isLocked: true,
        lockReason: "not_seeded" as const,
        firstRoundOf32Kickoff: null,
        bracketPoints: 0,
        correctPicks: 0,
        stages: [],
        champion: null,
        thirdPlace: null,
        predictions: [],
        title: t(language, "knockout.officialBracketTitle"),
        description: t(language, "knockout.officialBracketAvailable"),
        secondaryNote: null
      }))
    : null;
  const projectedChallengeView = user && !isOfficialSeeded
    ? await fetchProjectedKnockoutBracketPreview(user.id).catch(() => null)
    : null;
  const projectedComparisonView = user && isOfficialSeeded
    ? await fetchProjectedKnockoutBracketPreview(user.id, { comparisonOnly: true }).catch(() => null)
    : null;
  const shouldShowEditableProjected = Boolean(projectedChallengeView && !projectedChallengeView.isLocked && !isOfficialSeeded);
  const shouldShowLockedProjected = Boolean(projectedChallengeView && projectedChallengeView.isLocked && !isOfficialSeeded);
  const shouldShowOfficialBracket = Boolean(officialBracketView && isOfficialSeeded);
  const showingProjectedChallengeOnly = shouldShowEditableProjected || shouldShowLockedProjected;
  const introTitleKey = showingProjectedChallengeOnly || !isOfficialSeeded
    ? "knockout.waitingOnQualifiers"
    : "knockout.predictScoresForWinner";
  const introDescription = (shouldShowEditableProjected || shouldShowLockedProjected)
    ? shouldShowLockedProjected
      ? t(language, "knockout.projectedLockedDescription")
      : t(language, "knockout.projectedEditableDescription")
    : isOfficialSeeded
      ? t(language, "knockout.officialSeededDescription")
      : t(language, "knockout.officialPendingDescription");
  const introSecondaryNote = (shouldShowEditableProjected || shouldShowLockedProjected)
    ? shouldShowLockedProjected
      ? t(language, "knockout.projectionStatusNote")
      : t(language, "knockout.officialPicksOpenAfterSeeded")
    : isOfficialSeeded
      ? null
      : null;
  const knockoutStatusChipKey =
    !isOfficialSeeded || getKnockoutPhaseChip(knockoutStatus.counts, language) === t(language, "knockout.groupStageChip")
      ? "knockout.groupStageChip"
      : getKnockoutPhaseChip(knockoutStatus.counts, language) === t(language, "knockout.final")
        ? "knockout.final"
        : undefined;
  const knockoutStatusChip = knockoutStatusChipKey ? undefined : getKnockoutPhaseChip(knockoutStatus.counts, language);
  const primaryBracketView = shouldShowOfficialBracket ? officialBracketView : projectedChallengeView;

  return (
    <AppShell>
      <ManagementIntro
        eyebrowKey="knockout.knockoutPhase"
        titleKey={introTitleKey}
        description={introDescription}
        secondaryNote={introSecondaryNote}
        statusChip={knockoutStatusChip}
        statusChipKey={knockoutStatusChipKey}
        disclosurePlacement="bottom-right"
        statusChipPlacement="top-right"
        collapseBodyWhenClosed
      />

      {primaryBracketView ? (
        <div className="-mx-4 mt-5 sm:mx-0">
          <KnockoutBracketBuilder
            initialView={primaryBracketView}
            projectedComparisonView={shouldShowOfficialBracket ? projectedComparisonView : null}
            language={language}
          />
        </div>
      ) : user && !isOfficialSeeded ? (
        <div className="mt-5 rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm font-semibold text-gray-600">
          {t(language, "knockout.makeGroupPicksForPreview")}
        </div>
      ) : null}
    </AppShell>
  );
}

function getKnockoutPhaseChip(counts: {
  r32: number;
  r16: number;
  qf: number;
  sf: number;
  third: number;
  final: number;
}, language: string) {
  if (counts.final > 0) {
    return t(language, "knockout.final");
  }

  if (counts.third > 0 || counts.sf > 0) {
    return "SF";
  }

  if (counts.qf > 0) {
    return "QF";
  }

  if (counts.r16 > 0) {
    return "R16";
  }

  if (counts.r32 > 0) {
    return "R32";
  }

  return t(language, "knockout.groupStageChip");
}
