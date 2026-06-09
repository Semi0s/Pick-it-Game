import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SidePicksClient } from "@/components/SidePicksClient";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { fetchSidePicksPageData } from "@/lib/side-picks-data";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SidePicksPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fside-picks&mode=signup");
  }

  await redirectIfLaunchOnboardingRequired({ userId: user.id });
  const data = await fetchSidePicksPageData(user.id);

  return (
    <AppShell>
      <SidePicksClient
        isEnabled={data.isEnabled}
        isLocked={data.isLocked}
        lockAt={data.lockAt}
        group={data.group}
        teams={data.teams}
        tournamentPlayers={data.tournamentPlayers}
        definitions={data.definitions}
        initialPicks={data.picks}
        scores={data.scores}
      />
    </AppShell>
  );
}
