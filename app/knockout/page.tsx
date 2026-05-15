import { KnockoutBracketBuilder } from "@/components/KnockoutBracketBuilder";
import { AppShell } from "@/components/AppShell";
import { ManagementIntro } from "@/components/player-management/Shared";
import {
  fetchKnockoutBracketEditorView,
  fetchProjectedKnockoutBracketPreview,
  fetchKnockoutStructureStatus
} from "@/lib/bracket-predictions";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function KnockoutPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const knockoutStatus = await fetchKnockoutStructureStatus().catch(() => ({
    counts: { r32: 0, r16: 0, qf: 0, sf: 0, third: 0, final: 0 },
    isFullySeeded: false,
    firstRoundOf32Kickoff: null
  }));
  const bracketEditorView = user
    ? knockoutStatus.isFullySeeded
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
      : await fetchProjectedKnockoutBracketPreview(user.id).catch(() => null)
    : null;
  const projectedComparisonView = user && knockoutStatus.isFullySeeded
    ? await fetchProjectedKnockoutBracketPreview(user.id, { comparisonOnly: true }).catch(() => null)
    : null;
  const isSeeded = knockoutStatus.isFullySeeded;
  const phaseChip = getKnockoutPhaseChip(knockoutStatus.counts);
  const isProjected = bracketEditorView?.mode === "projected";
  const introEyebrow = isProjected ? "Projected Bracket" : isSeeded ? "Official knockout bracket" : "Knockout Picks";
  const introTitle = isProjected
    ? "Projected Bracket — built from your group-stage predictions"
    : isSeeded
      ? "Official knockout bracket"
      : "Knockout picks coming soon";
  const introDescription = isProjected
    ? "Build your projected knockout bracket from your group-stage picks. Official knockout picks open after the real bracket is seeded."
    : isSeeded
      ? "The official knockout bracket is now available."
      : "We will open knockout picks once the full Round of 32 through Final bracket has been seeded.";
  const introSecondaryNote = isProjected
    ? "Official knockout picks open after the real bracket is seeded."
    : isSeeded
      ? "Picks unlock as teams are confirmed"
      : null;

  return (
    <AppShell>
      <ManagementIntro
        eyebrow={introEyebrow}
        title={introTitle}
        description={introDescription}
        secondaryNote={introSecondaryNote}
        statusChip={phaseChip}
      />

      {bracketEditorView ? (
        <div className="mt-5">
          <KnockoutBracketBuilder initialView={bracketEditorView} />
        </div>
      ) : user && !isSeeded ? (
        <div className="mt-5 rounded-lg border border-gray-200 bg-white px-4 py-4 text-sm font-semibold text-gray-600">
          Make more group-stage picks to build your projected bracket preview.
        </div>
      ) : null}

      {projectedComparisonView &&
      (projectedComparisonView.predictions.length > 0 ||
        Boolean(projectedComparisonView.secondaryNote?.includes("need review"))) ? (
        <section className="mt-8">
          <ManagementIntro
            eyebrow="Projected Bracket"
            title="Projected Bracket"
            description="Built from your group-stage picks before the real bracket was seeded. This stays separate from your official knockout picks."
            secondaryNote="Official knockout picks and scoring remain separate."
            statusChip="Comparison"
          />
          <div className="mt-5">
            <KnockoutBracketBuilder initialView={projectedComparisonView} />
          </div>
        </section>
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
    return "Semi-finals";
  }

  if (counts.qf > 0) {
    return "Quarter-finals";
  }

  if (counts.r16 > 0) {
    return "Round of 16";
  }

  if (counts.r32 > 0) {
    return "Round of 32";
  }

  return "Not seeded";
}
