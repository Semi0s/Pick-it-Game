"use client";

import { useEffect, useState } from "react";
import { fetchCurrentProfile, onAuthStateChange } from "@/lib/auth-client";
import { CURRENT_USER_PROFILE_CHANGED_EVENT, type CurrentUserProfileChangedDetail } from "@/lib/current-user-events";
import { normalizeLanguage } from "@/lib/i18n";
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

    const handleProfileChanged = (event: Event) => {
      const detail = (event as CustomEvent<CurrentUserProfileChangedDetail>).detail;
      if (detail) {
        setUser((current) =>
          current
            ? {
                ...current,
                ...(typeof detail.preferredLanguage !== "undefined"
                  ? { preferredLanguage: normalizeLanguage(detail.preferredLanguage) }
                  : {}),
                ...(detail.dismissedMessageIds ? { dismissedMessageIds: detail.dismissedMessageIds } : {})
              }
            : current
        );
      }

      void loadProfile();
    };

    loadProfile();
    const subscription = onAuthStateChange(loadProfile);
    window.addEventListener(CURRENT_USER_PROFILE_CHANGED_EVENT, handleProfileChanged);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener(CURRENT_USER_PROFILE_CHANGED_EVENT, handleProfileChanged);
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
