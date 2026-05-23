import { KnockoutBracketBuilder } from "@/components/KnockoutBracketBuilder";
import { AppShell } from "@/components/AppShell";
import { ManagementIntro } from "@/components/player-management/Shared";
import {
  fetchKnockoutBracketEditorView,
  fetchProjectedKnockoutBracketPreview,
  fetchKnockoutStructureStatus
} from "@/lib/bracket-predictions";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
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
        title: "Official knockout bracket",
        description: "The official knockout bracket is now available.",
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
  const introEyebrow = "Knockout Phase";
  const introTitle = showingProjectedChallengeOnly || !isOfficialSeeded
    ? "Waiting on qualifiers."
    : "Predict all the match scores for a winner.";
  const introDescription = (shouldShowEditableProjected || shouldShowLockedProjected)
    ? shouldShowLockedProjected
      ? "Your projected bracket challenge is locked for this phase. It will stay visible as its own archived side-pick once the official Round of 32 is seeded."
      : "Build your projected bracket challenge from your group-stage picks. Official knockout picks open after the real Round of 32 is seeded."
    : isOfficialSeeded
      ? "Round of 32 keeps your early Group Stage path beside the official bracket. Later rounds use standard knockout cards."
      : "We will open official knockout picks once the full group stage is complete and the real Round of 32 is seeded.";
  const introSecondaryNote = (shouldShowEditableProjected || shouldShowLockedProjected)
    ? shouldShowLockedProjected
      ? "Projection status updates as matches become final."
      : "Official knockout picks open after the real Round of 32 is seeded."
    : isOfficialSeeded
      ? null
      : null;
  const primaryBracketView = shouldShowOfficialBracket ? officialBracketView : projectedChallengeView;

  return (
    <AppShell>
      <ManagementIntro
        eyebrow={introEyebrow}
        title={introTitle}
        description={introDescription}
        secondaryNote={introSecondaryNote}
        statusChip={isOfficialSeeded ? getKnockoutPhaseChip(knockoutStatus.counts) : "Group Stage"}
        disclosurePlacement="bottom-right"
        statusChipPlacement="top-right"
        collapseBodyWhenClosed
      />

      {primaryBracketView ? (
        <div className="-mx-4 mt-5 sm:mx-0">
          <KnockoutBracketBuilder
            initialView={primaryBracketView}
            projectedComparisonView={shouldShowOfficialBracket ? projectedComparisonView : null}
          />
        </div>
      ) : user && !isOfficialSeeded ? (
        <div className="mt-5 rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm font-semibold text-gray-600">
          Make more group-stage picks to build your projected bracket preview.
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
}) {
  if (counts.final > 0) {
    return "Final";
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

  return "Group Stage";
}
