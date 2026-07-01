"use client";

import { PredictionLab } from "@/components/side-picks/PredictionLab";
import { SidePicksVoidedNotice } from "@/components/side-picks/SidePicksVoidedNotice";
import type { PredictionLabPageData } from "@/lib/prediction-lab-data";

type SidePicksClientProps = PredictionLabPageData & {
  previewMode?: boolean;
};

export function SidePicksClient({
  tournamentId,
  group,
  initialSettings,
  averageSummary,
  activeTeams,
  teamHealthSummary,
  publicMatchPulseRows,
  upcomingMatches,
  userBracketPicks,
  previewMode = false
}: SidePicksClientProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 py-4">
      <SidePicksVoidedNotice />
      <PredictionLab
        tournamentId={tournamentId}
        groupId={group?.id ?? null}
        groupName={group?.name ?? null}
        activeTeams={activeTeams}
        teamHealthSummary={teamHealthSummary}
        publicMatchPulseRows={publicMatchPulseRows}
        upcomingMatches={upcomingMatches}
        userBracketPicks={userBracketPicks}
        initialSettings={initialSettings}
        initialAverageSummary={averageSummary}
        canPersist={!previewMode}
      />
    </div>
  );
}
