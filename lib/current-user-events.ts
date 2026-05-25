"use client";

export const CURRENT_USER_PROFILE_CHANGED_EVENT = "pickit:current-user-profile-changed";

export function notifyCurrentUserProfileChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(CURRENT_USER_PROFILE_CHANGED_EVENT));
}
