"use client";

export const CURRENT_USER_PROFILE_CHANGED_EVENT = "pickit:current-user-profile-changed";

export type CurrentUserProfileChangedDetail = {
  preferredLanguage?: string | null;
  dismissedMessageIds?: string[];
};

export function notifyCurrentUserProfileChanged(detail?: CurrentUserProfileChangedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<CurrentUserProfileChangedDetail>(CURRENT_USER_PROFILE_CHANGED_EVENT, { detail }));
}
