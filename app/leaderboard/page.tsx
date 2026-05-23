import { AppShell } from "@/components/AppShell";
import { LeaderboardClient } from "@/components/LeaderboardClient";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    await redirectIfLaunchOnboardingRequired({ userId: user.id });
    await redirectIfLegacyScoringSetupRequired({ userId: user.id, pathname: "/leaderboard" });
  }

  return (
    <AppShell>
      <LeaderboardClient />
    </AppShell>
  );
}
