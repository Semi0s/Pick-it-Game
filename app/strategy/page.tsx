import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StrategyModeClient } from "@/components/StrategyModeClient";
import { shouldHideStrategyModeForLaunch } from "@/lib/group-prediction-mode";
import { teams as demoTeams } from "@/lib/mock-data.ts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchTournamentEntrySettings } from "@/lib/tournament-entry";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  if (shouldHideStrategyModeForLaunch()) {
    redirect("/bracket-builder");
  }

  const adminSupabase = createAdminClient();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fstrategy&mode=signup");
  }

  const [settings, teamsResult, profileResult] = await Promise.all([
    fetchTournamentEntrySettings(adminSupabase, user.id).catch(() => ({
      tournamentEntryMode: null,
      tournamentEntryState: null,
      tournamentEntrySubmittedAt: null,
      groupStrategyAdjustments: {},
      groupStrategyHeartPickTeamId: null
    })),
    adminSupabase
      .from("teams")
      .select("id,name,short_name,group_name,fifa_rank,flag_emoji")
      .order("group_name", { ascending: true })
      .order("fifa_rank", { ascending: true }),
    adminSupabase.from("users").select("home_team_id").eq("id", user.id).maybeSingle()
  ]);

  const teams: Team[] = teamsResult.error
    ? demoTeams
    : (((teamsResult.data as Array<{
        id: string;
        name: string;
        short_name: string;
        group_name: string;
        fifa_rank: number;
        flag_emoji: string;
      }> | null) ?? []).map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        groupName: team.group_name,
        fifaRank: team.fifa_rank,
        flagEmoji: team.flag_emoji
      })));

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl py-4">
        <StrategyModeClient
          teams={teams}
          initialAdjustments={settings.groupStrategyAdjustments}
          initialHeartPickTeamId={settings.groupStrategyHeartPickTeamId ?? profileResult.data?.home_team_id ?? null}
          tournamentEntryMode={settings.tournamentEntryMode}
          tournamentEntryState={settings.tournamentEntryState}
        />
      </div>
    </AppShell>
  );
}
