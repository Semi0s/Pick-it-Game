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
  const isSeeded = knockoutStatus.isFullySeeded;
  const phaseChip = getKnockoutPhaseChip(knockoutStatus.counts);
  const isProjected = bracketEditorView?.mode === "projected";
  const introEyebrow = isProjected ? "Knockout Phase" : isSeeded ? "Official knockout bracket" : "Knockout Picks";
  const introTitle = isProjected
    ? "Fill your bracket and stay in the game until the end"
    : isSeeded
      ? "Official knockout bracket"
      : "Knockout picks coming soon";
  const introDescription = isProjected
    ? "Compare your group predictions with actual tournament wins. Swipe through the knockout phases and tap to select the winning teams until you reach the final."
    : isSeeded
      ? "The official knockout bracket is now available."
      : "We will open knockout picks once the full Round of 32 through Final bracket has been seeded.";
  const introSecondaryNote = isProjected
    ? "PICKS UNLOCK AS TEAMS ARE CONFIRMED."
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
          Make more group-stage picks to preview your projected knockout.
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
