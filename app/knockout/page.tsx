import { KnockoutBracketBuilder } from "@/components/KnockoutBracketBuilder";
import { KnockoutGroupComparison } from "@/components/KnockoutGroupComparison";
import { AppShell } from "@/components/AppShell";
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
      <section className="relative rounded-lg bg-gray-100 p-5">
        <div className="pr-20 sm:pr-24">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Picks</p>
            <h2 className="mt-2 text-3xl font-black leading-tight">
              {isSeeded ? "Build your bracket, then compare it." : "Knockout picks coming soon."}
            </h2>
            <p className="mt-3 text-base leading-7 text-gray-600">
              {isSeeded
                ? "Make one winner pick per knockout match, watch your path advance forward, and stack your bracket against the rest of the group."
                : "We will open knockout picks once the full Round of 32 through Final bracket has been seeded."}
            </p>
          </div>
        </div>
        <div className="absolute right-5 top-5 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:py-2">
          {phaseChip}
        </div>
      </section>

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
