import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StrategyModeClient } from "@/components/StrategyModeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchTournamentEntrySettings } from "@/lib/tournament-entry";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fstrategy&mode=signup");
  }

  const settings = await fetchTournamentEntrySettings(createAdminClient(), user.id).catch(() => ({
    tournamentEntryMode: null,
    tournamentEntryState: null,
    tournamentEntrySubmittedAt: null,
    strategyModePresetKey: "balanced" as const,
    strategyModeLevers: {
      favoriteTrust: 2,
      pathSensitivity: 2,
      chaos: 2,
      heartFactor: 2,
      contrarianEdge: 2
    }
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-4">
        <StrategyModeClient
          initialPresetKey={settings.strategyModePresetKey}
          initialLevers={settings.strategyModeLevers}
          tournamentEntryMode={settings.tournamentEntryMode}
          tournamentEntryState={settings.tournamentEntryState}
        />
      </div>
    </AppShell>
  );
}
