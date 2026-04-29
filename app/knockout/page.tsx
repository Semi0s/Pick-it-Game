import { KnockoutBracketBuilder } from "@/components/KnockoutBracketBuilder";
import { KnockoutGroupComparison } from "@/components/KnockoutGroupComparison";
import { AppShell } from "@/components/AppShell";
import { ManagementIntro } from "@/components/player-management/Shared";
import {
  fetchGroupBracketComparisonView,
  fetchKnockoutBracketEditorView,
  fetchKnockoutStructureStatus
} from "@/lib/bracket-predictions";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function KnockoutPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedGroupId = typeof resolvedSearchParams.group === "string" ? resolvedSearchParams.group : undefined;
  const selectedPlayerId = typeof resolvedSearchParams.player === "string" ? resolvedSearchParams.player : undefined;
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
      ? await fetchKnockoutBracketEditorView(user.id).catch(() => ({
        isSeeded: false,
        isLocked: true,
        lockReason: "not_seeded" as const,
        firstRoundOf32Kickoff: null,
        bracketPoints: 0,
        correctPicks: 0,
        stages: [],
        champion: null,
        thirdPlace: null,
        predictions: []
      }))
    : null;
  const comparisonView =
    user
      ? await fetchGroupBracketComparisonView(user.id, selectedGroupId, selectedPlayerId).catch(() => ({
          groups: [],
          selectedGroupId: null,
          selectedGroupName: null,
          selectedPlayerId: null,
          mostPickedChampion: null,
          members: [],
          selectedPlayerBracket: null
        }))
      : {
          groups: [],
          selectedGroupId: null,
          selectedGroupName: null,
          selectedPlayerId: null,
          mostPickedChampion: null,
          members: [],
          selectedPlayerBracket: null
      };
  const isSeeded = knockoutStatus.isFullySeeded;
  const phaseChip = getKnockoutPhaseChip(knockoutStatus.counts);

  return (
    <AppShell>
      <ManagementIntro
        eyebrow="Knockout Picks"
        title={isSeeded ? "Create a bracket to stay in the game until the end" : "Knockout picks coming soon"}
        description={
          isSeeded
            ? "Swipe through the phases, then tap to select the winning team."
            : "We will open knockout picks once the full Round of 32 through Final bracket has been seeded."
        }
        secondaryNote={isSeeded ? "Picks unlock as teams are confirmed" : null}
        statusChip={phaseChip}
      />

      {bracketEditorView ? (
        <div className="mt-5">
          <KnockoutBracketBuilder initialView={bracketEditorView}>
            <KnockoutGroupComparison view={comparisonView} />
          </KnockoutBracketBuilder>
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
