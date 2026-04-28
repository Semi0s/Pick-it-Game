"use client";

import { GroupPredictions } from "@/components/GroupPredictions";
import { useCurrentUser } from "@/lib/use-current-user";
import type { MatchWithTeams, Prediction, UserProfile } from "@/lib/types";

type GroupPageClientProps = {
  initialUser?: UserProfile | null;
  initialMatches?: MatchWithTeams[];
  initialPredictions?: Prediction[];
  initialKnockoutSeeded?: boolean;
};

export function GroupPageClient({
  initialUser = null,
  initialMatches,
  initialPredictions,
  initialKnockoutSeeded
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
    <GroupPredictions
      user={user}
      initialMatches={initialMatches}
      initialPredictions={initialPredictions}
      initialKnockoutSeeded={initialKnockoutSeeded}
    />
  );
}
