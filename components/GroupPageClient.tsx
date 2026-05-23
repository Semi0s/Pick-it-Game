"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { acknowledgeEasyBracketMyPicksGateAction } from "@/app/groups/actions";
import { GroupPredictions } from "@/components/GroupPredictions";
import { ActionButton } from "@/components/player-management/Shared";
import { showAppToast } from "@/lib/app-toast";
import type { LightSeedBuilderSnapshot, UserGroupProjectionSource } from "@/lib/group-stage-modes";
import { useCurrentUser } from "@/lib/use-current-user";
import type { MatchWithTeams, Prediction, UserProfile } from "@/lib/types";

type GroupPageClientProps = {
  initialUser?: UserProfile | null;
  initialMatches?: MatchWithTeams[];
  initialPredictions?: Prediction[];
  initialKnockoutSeeded?: boolean;
  scoringSetupNotice?: string | null;
  initialBracketBuilderSnapshot?: LightSeedBuilderSnapshot | null;
  initialGroupProjectionSources?: Record<string, UserGroupProjectionSource>;
  myPicksAcknowledgedAt?: string | null;
  shouldGateMyPicks?: boolean;
  groupStageMatchCount?: number;
  fullScoresHiddenForLaunch?: boolean;
};

export function GroupPageClient({
  initialUser = null,
  initialMatches,
  initialPredictions,
  initialKnockoutSeeded,
  scoringSetupNotice = null,
  initialBracketBuilderSnapshot = null,
  initialGroupProjectionSources = {},
  myPicksAcknowledgedAt = null,
  shouldGateMyPicks = false,
  groupStageMatchCount = 72,
  fullScoresHiddenForLaunch = false
}: GroupPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldUseFallbackUserLoad = !initialUser;
  const { user: fallbackUser, isLoading } = useCurrentUser();
  const user = initialUser ?? fallbackUser;
  const [hasAcknowledgedGate, setHasAcknowledgedGate] = useState(Boolean(myPicksAcknowledgedAt));
  const [isAcknowledgingGate, setIsAcknowledgingGate] = useState(false);
  const onboardingQuery = searchParams.get("onboarding") === "1" ? "?onboarding=1" : "";

  if ((shouldUseFallbackUserLoad && isLoading) || !user) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        Loading your group picks...
      </div>
    );
  }

  const shouldShowMyPicksGate = shouldGateMyPicks && !hasAcknowledgedGate;

  async function handleContinueToMyPicks() {
    setIsAcknowledgingGate(true);
    const result = await acknowledgeEasyBracketMyPicksGateAction();
    setIsAcknowledgingGate(false);

    if (!result.ok) {
      showAppToast({ tone: "error", text: result.message });
      return;
    }

    setHasAcknowledgedGate(true);
  }

  if (fullScoresHiddenForLaunch) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white px-5 py-8 text-center shadow-soft">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-accent-dark">Group Stage</p>
          <p className="mt-5 text-base font-semibold leading-7 text-gray-700">
            For launch, regular scoring starts from your Group Stage ladder picks. Match-by-match group score picks are
            staying behind the scenes for a later league version.
          </p>
          <div className="mt-8">
            <ActionButton fullWidth tone="accent" onClick={() => router.push(`/bracket-builder${onboardingQuery}`)}>
              Open Group Stage
            </ActionButton>
          </div>
        </section>
      </div>
    );
  }

  if (shouldShowMyPicksGate) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white px-5 py-8 text-center shadow-soft">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-accent-dark">Keep in mind!</p>
          <p className="mt-5 text-base font-semibold leading-7 text-gray-700">
            You started with “Group Stage” mode. If you want more points, you have to predict all {groupStageMatchCount || 72} games. This could change your original bracket choices.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <ActionButton fullWidth onClick={() => router.push(`/bracket-builder${onboardingQuery}`)}>
              Group Stage
            </ActionButton>
            <ActionButton fullWidth tone="accent" disabled={isAcknowledgingGate} onClick={() => void handleContinueToMyPicks()}>
              Continue to My Picks
            </ActionButton>
          </div>
        </section>
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
          href={`/bracket-builder${onboardingQuery}`}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-black text-gray-800 transition hover:border-accent hover:text-accent-dark"
        >
          Open Group Stage
        </Link>
      </div>

      <GroupPredictions
        user={user}
        initialMatches={initialMatches}
        initialPredictions={initialPredictions}
        initialKnockoutSeeded={initialKnockoutSeeded}
        initialBracketBuilderSnapshot={initialBracketBuilderSnapshot}
        initialGroupProjectionSources={initialGroupProjectionSources}
      />
    </div>
  );
}
