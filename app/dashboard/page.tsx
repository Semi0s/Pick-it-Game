import { AppShell } from "@/components/AppShell";
import { DashboardOverview } from "@/components/DashboardOverview";
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

  return (
    <AppShell>
      <DashboardOverview initialGlobalChallengeSummary={globalChallengeSummary} />
    </AppShell>
  );
}
