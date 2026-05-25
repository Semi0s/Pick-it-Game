"use client";

import { useEffect, useState } from "react";
import { fetchCurrentProfile, onAuthStateChange } from "@/lib/auth-client";
import { CURRENT_USER_PROFILE_CHANGED_EVENT } from "@/lib/current-user-events";
import type { UserProfile } from "@/lib/types";

export function useCurrentUser() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const profile = await fetchCurrentProfile();
      if (isMounted) {
        setUser(profile);
        setIsLoading(false);
      }
    }

    loadProfile();
    const subscription = onAuthStateChange(loadProfile);
    window.addEventListener(CURRENT_USER_PROFILE_CHANGED_EVENT, loadProfile);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener(CURRENT_USER_PROFILE_CHANGED_EVENT, loadProfile);
    };
  }, []);

  async function refresh() {
    setIsLoading(true);
    const profile = await fetchCurrentProfile();
    setUser(profile);
    setIsLoading(false);
  }

  return { user, isLoading, refresh };
}
