"use client";

const GROUPS_ENTRY_INTENT_STORAGE_KEY = "pickit:groups-entry-intent";

export type GroupsEntryIntent = {
  source: "dashboard";
  target: "next-pick" | "next-auto-pick";
  matchId?: string | null;
  groupKey?: string | null;
};

export function storeGroupsEntryIntent(intent: GroupsEntryIntent) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(GROUPS_ENTRY_INTENT_STORAGE_KEY, JSON.stringify(intent));
}

export function readGroupsEntryIntent() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(GROUPS_ENTRY_INTENT_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue) as GroupsEntryIntent;
  } catch (error) {
    console.warn("Could not restore groups entry intent.", error);
    window.sessionStorage.removeItem(GROUPS_ENTRY_INTENT_STORAGE_KEY);
    return null;
  }
}

export function clearGroupsEntryIntent() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(GROUPS_ENTRY_INTENT_STORAGE_KEY);
}
