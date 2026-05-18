"use client";

import Link from "next/link";
import { GroupPredictions } from "@/components/GroupPredictions";
import { useCurrentUser } from "@/lib/use-current-user";
import type { MatchWithTeams, Prediction, UserProfile } from "@/lib/types";

type GroupPageClientProps = {
  initialUser?: UserProfile | null;
  initialMatches?: MatchWithTeams[];
  initialPredictions?: Prediction[];
  initialKnockoutSeeded?: boolean;
  scoringSetupNotice?: string | null;
};

export function GroupPageClient({
  initialUser = null,
  initialMatches,
  initialPredictions,
  initialKnockoutSeeded,
  scoringSetupNotice = null
}: GroupPageClientProps) {
  const shouldUseFallbackUserLoad = !initialUser;
  const { user: fallbackUser, isLoading } = useCurrentUser();
  const user = initialUser ?? fallbackUser;

  if ((shouldUseFallbackUserLoad && isLoading) || !user) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        Loading your group picks...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scoringSetupNotice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {scoringSetupNotice}
        </div>
      ) : null}

      <div className="flex justify-center">
        <Link
          href="/bracket-builder"
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-black text-gray-800 transition hover:border-accent hover:text-accent-dark"
        >
          Open Bracket Builder
        </Link>
      </div>

      <GroupPredictions
        user={user}
        initialMatches={initialMatches}
        initialPredictions={initialPredictions}
        initialKnockoutSeeded={initialKnockoutSeeded}
      />
    </div>
  );
}
