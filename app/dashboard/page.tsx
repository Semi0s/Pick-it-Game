import { AppShell } from "@/components/AppShell";
import { DashboardOverview } from "@/components/DashboardOverview";
import { fetchDashboardGroupAccessDataForCurrentUser } from "@/app/my-groups/actions";
import { fetchDashboardCommandCenterData } from "@/lib/dashboard-home-data";
import { fetchGlobalChallengeSummaryForUser } from "@/lib/global-challenge-data";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    await redirectIfLaunchOnboardingRequired({ userId: user.id });
    await redirectIfLegacyScoringSetupRequired({ userId: user.id, pathname: "/dashboard" });
  }

  const globalChallengeSummary = user
    ? await fetchGlobalChallengeSummaryForUser(user.id).catch(() => null)
    : null;
  const commandCenterSummary = user
    ? await fetchDashboardCommandCenterData(user.id).catch(() => null)
    : null;
  const groupAccessResult = user
    ? await fetchDashboardGroupAccessDataForCurrentUser().catch(() => null)
    : null;

  return (
    <AppShell>
      <DashboardOverview
        initialGlobalChallengeSummary={globalChallengeSummary}
        initialCommandCenterSummary={commandCenterSummary ?? {
          progress: {
            phase: "group_stage",
            label: "Group picks",
            completedUnits: 0,
            totalUnits: 12,
            headline: "Keep ranking the groups.",
            detail: "0 of 12 groups complete",
            deadlineAt: null,
            deadlineLabel: "Deadline coming soon",
            urgencyTone: "neutral",
            isComplete: false,
            isLocked: false
          },
          performance: {
            globalPoints: null,
            globalRank: null,
            totalGroups: 0
          },
          reminder: {
            followedTeamCount: 0,
            nextMatch: null,
            liveMatches: []
          }
        }}
        initialGroupAccess={groupAccessResult?.ok ? {
          hasAnyGroups: groupAccessResult.groupAccess.hasAnyGroups,
          joinedGroupCount: groupAccessResult.groupAccess.joinedGroupCount,
          managedGroupCount: groupAccessResult.groupAccess.managedGroupCount,
          dashboardUiResetEpoch: groupAccessResult.dashboardUiResetEpoch
        } : null}
      />
    </AppShell>
  );
}
