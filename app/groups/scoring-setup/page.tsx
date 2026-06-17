import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupScoringSetupClient } from "@/components/GroupScoringSetupClient";
import { ManagementIntro } from "@/components/player-management/Shared";
import { fetchManagedLegacyScoringGroups } from "@/lib/group-scoring-setup-gate";
import {
  buildScoringSetupDateOptions,
  LEGACY_GROUP_STAGE_MAX_DUE_DATE,
  LEGACY_KNOCKOUT_DEFAULT_DUE_DATE
} from "@/lib/group-scoring-setup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GroupScoringSetupPage({
  searchParams
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fgroups%2Fscoring-setup");
  }

  const legacyGroups = await fetchManagedLegacyScoringGroups(user.id);
  const nextPath = resolvedSearchParams?.next?.startsWith("/") ? resolvedSearchParams.next : "/dashboard";
  const dateOptions = await fetchScoringSetupDateOptions();

  if (legacyGroups.length === 0) {
    redirect(nextPath);
  }

  return (
    <AppShell>
      <ManagementIntro
        eyebrow="Required Setup"
        title="Lock standard scoring for your legacy groups"
        description="Review the standard group scoring contract and lock each legacy group before returning to the rest of the app."
        secondaryNote="This affects group leaderboard scoring only. Global leaderboard points remain unchanged."
        statusChip={`${legacyGroups.length} group${legacyGroups.length === 1 ? "" : "s"} left`}
      />

      <div className="mt-5">
        <GroupScoringSetupClient
          groups={legacyGroups.map((group) => ({
            groupId: group.groupId,
            groupName: group.groupName,
            latestVersion: group.latestVersion
          }))}
          nextPath={nextPath}
          availableGroupStageDates={dateOptions.groupStageDates}
          availableKnockoutDates={dateOptions.knockoutDates}
        />
      </div>
    </AppShell>
  );
}

async function fetchScoringSetupDateOptions() {
  const adminSupabase = createAdminClient();
  const knockoutPhaseStartResult = await adminSupabase
      .from("matches")
      .select("kickoff_time")
      .in("stage", ["r32", "round_of_32"])
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (knockoutPhaseStartResult.error) {
    throw new Error(knockoutPhaseStartResult.error.message);
  }

  const groupStageDates = buildMidnightGmtDateOptions(LEGACY_GROUP_STAGE_MAX_DUE_DATE);
  const knockoutDates = buildMidnightGmtDateOptions(
    (knockoutPhaseStartResult.data as { kickoff_time?: string | null } | null)?.kickoff_time ??
      LEGACY_KNOCKOUT_DEFAULT_DUE_DATE
  );

  return {
    groupStageDates,
    knockoutDates
  };
}

function buildMidnightGmtDateOptions(deadlineIso: string | null) {
  return buildScoringSetupDateOptions(deadlineIso, new Date());
}
