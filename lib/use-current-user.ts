"use client";

import { useEffect, useState } from "react";
import { fetchCurrentProfile, onAuthStateChange } from "@/lib/auth-client";
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

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
