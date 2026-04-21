"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchLeaderboardUsers } from "@/lib/social-predictions";
import type { UserProfile } from "@/lib/types";
import { useCurrentUser } from "@/lib/use-current-user";

export function LeaderboardClient() {
  const { user } = useCurrentUser();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    function loadLeaderboard(showLoading = false) {
      if (showLoading) {
        setIsLoading(true);
      }

      fetchLeaderboardUsers().then((items) => {
        if (isMounted) {
          setUsers(items);
          setIsLoading(false);
        }
      });
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        loadLeaderboard();
      }
    }

    loadLeaderboard(true);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Leaderboard</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Tap a name to see picks.</h2>
      </section>

      <section className="space-y-2">
        {isLoading ? (
          <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
            Loading leaderboard...
          </p>
        ) : null}

        {users.map((profile, index) => (
          <Link
            key={profile.id}
            href={`/leaderboard/${profile.id}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-gray-200 bg-white p-4"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 text-sm font-black text-gray-700">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-black text-gray-950">
                {profile.name}
                {profile.id === user?.id ? " (You)" : ""}
              </span>
              <span className="block text-xs font-semibold text-gray-500">View read-only picks</span>
            </span>
            <span className="rounded-md bg-accent-light px-2 py-1 text-sm font-black text-accent-dark">
              {profile.totalPoints}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
