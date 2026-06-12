import { AppShell } from "@/components/AppShell";
import { DashboardOverview } from "@/components/DashboardOverview";
import { fetchDashboardGroupAccessForUser } from "@/lib/dashboard-group-access";
import { fetchDashboardCommandCenterData } from "@/lib/dashboard-home-data";
import { fetchGlobalChallengeSummaryForUser } from "@/lib/global-challenge-data";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { fetchUserLightSeedBuilderSnapshot, type LightSeedBuilderSnapshot } from "@/lib/group-stage-modes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchTournamentTransitionSettings } from "@/lib/tournament-transition";

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
    ? await fetchDashboardGroupAccessForUser(user.id).catch(() => null)
    : null;
  const lightSeedSnapshot: LightSeedBuilderSnapshot | null = user
    ? await fetchUserLightSeedBuilderSnapshot(createAdminClient(), user.id).catch(() => null)
    : null;
  const tournamentTransitionSettings = await fetchTournamentTransitionSettings().catch(() => null);

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
          progressViews: {
            group_stage_progress: {
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
            knockout_progress: {
              phase: "knockout_stage",
              label: "Knockout",
              completedUnits: 0,
              totalUnits: 16,
              headline: "Knockout picks open next.",
              detail: "0 of 16 knockout matches saved",
              deadlineAt: null,
              deadlineLabel: "Deadline coming soon",
              urgencyTone: "neutral",
              isComplete: false,
              isLocked: false
            },
            side_picks_progress: null
          },
          performance: {
            globalPoints: null,
            globalRank: null,
            invitedGroups: 0,
            managedGroups: 0,
            totalGroups: 0,
            totalPlayers: 0
          },
          scoring: {
            mode: "empty",
            scoreKind: "official",
            score: {
              currentPoints: null,
              currentRank: null,
              currentPacePoints: null,
              previousPoints: null,
              previousRank: null,
              previousPacePoints: null,
              pointsChange: null,
              rankChange: null,
              deltaFromPace: null,
              latestSnapshotAt: null,
              previousSnapshotAt: null,
              comparisonMode: "none",
              history: []
            },
            activity: null
          },
          reminder: {
            followedTeamCount: 0,
            nextMatch: null,
            upcomingMatches: [],
            liveMatches: []
          }
        }}
        initialGroupAccess={groupAccessResult?.ok ? {
          hasAnyGroups: groupAccessResult.groupAccess.hasAnyGroups,
          joinedGroupCount: groupAccessResult.groupAccess.joinedGroupCount,
          managedGroupCount: groupAccessResult.groupAccess.managedGroupCount,
          dashboardUiResetEpoch: groupAccessResult.dashboardUiResetEpoch
        } : null}
        initialLightSeedSnapshot={lightSeedSnapshot}
        tournamentTransitionSettings={tournamentTransitionSettings}
      />
    </AppShell>
  );
}
