import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupScoringSetupClient } from "@/components/GroupScoringSetupClient";
import { ManagementIntro } from "@/components/player-management/Shared";
import { fetchManagedLegacyScoringGroups } from "@/lib/group-scoring-setup-gate";
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
        title="Lock scoring settings for your legacy groups"
        description="Choose the scoring lens for each legacy group before returning to the rest of the app."
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
  const [groupDeadlineResult, knockoutPhaseStartResult] = await Promise.all([
    adminSupabase
      .from("matches")
      .select("kickoff_time")
      .eq("stage", "group")
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
    adminSupabase
      .from("matches")
      .select("kickoff_time")
      .in("stage", ["r32", "round_of_32"])
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle()
  ]);

  if (groupDeadlineResult.error) {
    throw new Error(groupDeadlineResult.error.message);
  }

  if (knockoutPhaseStartResult.error) {
    throw new Error(knockoutPhaseStartResult.error.message);
  }

  const groupStageDates = buildMidnightGmtDateOptions("2026-06-13T00:00:00.000Z");
  const knockoutDates = buildMidnightGmtDateOptions(
    (knockoutPhaseStartResult.data as { kickoff_time?: string | null } | null)?.kickoff_time ?? null
  );

  return {
    groupStageDates,
    knockoutDates
  };
}

function buildMidnightGmtDateOptions(deadlineIso: string | null) {
  if (!deadlineIso) {
    return [];
  }

  const now = new Date();
  const startUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const deadline = new Date(deadlineIso);
  const endUtc = new Date(Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate()));
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });

  const options: Array<{ value: string; label: string }> = [];
  for (let cursor = startUtc.getTime(); cursor <= endUtc.getTime(); cursor += 24 * 60 * 60 * 1000) {
    const date = new Date(cursor);
    const value = date.toISOString().slice(0, 10);
    options.push({
      value,
      label: formatter.format(date)
    });
  }

  return options;
}
