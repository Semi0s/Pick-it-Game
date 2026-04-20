"use client";

import { GroupPredictions } from "@/components/GroupPredictions";
import { useCurrentUser } from "@/lib/use-current-user";

export function GroupPageClient() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
    return (
      <div className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
        Loading your group picks...
      </div>
    );
  }

  return <GroupPredictions user={user} />;
}
