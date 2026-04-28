import { KnockoutGroupComparison } from "@/components/KnockoutGroupComparison";
import { AppShell } from "@/components/AppShell";
import { fetchGroupBracketComparisonView, fetchKnockoutStructureStatus } from "@/lib/bracket-predictions";
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
        <div className="pr-28 sm:pr-36">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Picks</p>
            <h2 className="mt-2 text-3xl font-black leading-tight">
              {isSeeded ? "Compare your group’s bracket futures." : "Knockout picks coming soon."}
            </h2>
            <p className="mt-3 text-base leading-7 text-gray-600">
              {isSeeded
                ? "See who picked the same champion, whose bracket is still alive, and where the pressure is building inside your group."
                : "We will open knockout picks once the full Round of 32 through Final bracket has been seeded."}
            </p>
          </div>
        </div>
        <div className="absolute right-5 top-5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700">
          {phaseChip}
        </div>
        <div className="mt-5 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Bracket status</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            Round of 32: {knockoutStatus.counts.r32}/16 · Round of 16: {knockoutStatus.counts.r16}/8 · Quarter-finals:{" "}
            {knockoutStatus.counts.qf}/4
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            Semi-finals: {knockoutStatus.counts.sf}/2 · Third Place: {knockoutStatus.counts.third}/1 · Final:{" "}
            {knockoutStatus.counts.final}/1
          </p>
        </div>
      </section>

      <div className="mt-5">
        <KnockoutGroupComparison view={comparisonView} />
      </div>
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
