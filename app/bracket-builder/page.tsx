import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BracketBuilderClient } from "@/components/BracketBuilderClient";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { fetchKnockoutStructureStatus, safeFetchKnockoutStructureStatusFallback } from "@/lib/bracket-predictions";
import {
  buildDefaultLightSeedBuilderSnapshot,
  fetchUserLightSeedBuilderSnapshot,
  type LightSeedBuilderSnapshot
} from "@/lib/group-stage-modes";
import { fetchActiveGroupRulesets } from "@/lib/scoped-scoring";
import { getRequiredThirdPlaceQualifierCount, type KnockoutPlaceholderMatch } from "@/lib/knockout-seeding";
import { getGroupMatches, getTeam } from "@/lib/mock-data";
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

  await redirectIfLegacyScoringSetupRequired({ userId: authUser.id, pathname: "/bracket-builder" });

  const adminSupabase = createAdminClient();
  const localMatches = getGroupMatches().map((match) => ({
    ...match,
    homeTeam: getTeam(match.homeTeamId),
    awayTeam: getTeam(match.awayTeamId)
  })) as MatchWithTeams[];
  const localTeams = Array.from(
    new Map(
      localMatches.flatMap((match) => {
        const entries: Array<[string, NonNullable<MatchWithTeams["homeTeam"]>]> = [];
        if (match.homeTeam?.id) {
          entries.push([match.homeTeam.id, match.homeTeam]);
        }
        if (match.awayTeam?.id) {
          entries.push([match.awayTeam.id, match.awayTeam]);
        }
        return entries;
      })
    ).values()
  );

  let initialSnapshot: LightSeedBuilderSnapshot | null = null;
  try {
    const savedSnapshot = await fetchUserLightSeedBuilderSnapshot(adminSupabase, authUser.id);
    initialSnapshot = savedSnapshot.groupRankings.length > 0
      ? savedSnapshot
      : buildDefaultLightSeedBuilderSnapshot(localTeams);
  } catch (error) {
    logSafeSupabaseError("bracket-builder-snapshot-load", error, { userId: authUser.id, recoverable: true });
    initialSnapshot = buildDefaultLightSeedBuilderSnapshot(localTeams);
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

  const [{ data: memberRows, error: memberError }, { data: ownedRows, error: ownedError }] = await Promise.all([
    adminSupabase.from("group_members").select("group_id").eq("user_id", authUser.id),
    adminSupabase.from("groups").select("id").eq("owner_user_id", authUser.id)
  ]);

  if (memberError || ownedError) {
    throw new Error(memberError?.message ?? ownedError?.message ?? "Could not load group deadlines.");
  }

  const visibleGroupIds = Array.from(
    new Set([
      ...((memberRows ?? []) as Array<{ group_id: string }>).map((row) => row.group_id),
      ...((ownedRows ?? []) as Array<{ id: string }>).map((row) => row.id)
    ])
  );

  let earliestGroupStageDueAt: string | null = null;
  if (visibleGroupIds.length > 0) {
    const rulesets = await fetchActiveGroupRulesets(adminSupabase, visibleGroupIds);
    earliestGroupStageDueAt = Array.from(rulesets.values())
      .map((ruleset) => ruleset.groupStagePicksDueAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-4">
        <BracketBuilderClient
          initialMatches={localMatches}
          initialKnockoutSeeded={knockoutStatus.isFullySeeded}
          initialSnapshot={initialSnapshot}
          requiredThirdPlaceQualifierCount={requiredThirdPlaceQualifierCount}
          roundOf32Placeholders={roundOf32Placeholders}
          groupStageDueAt={earliestGroupStageDueAt}
        />
      </div>
    </AppShell>
  );
}
