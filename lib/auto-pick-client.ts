"use client";

import { AUTO_PICK_DRAFT_STORAGE_KEY, buildAutoPickDraft } from "@/lib/auto-pick";
import type { AutoPickDraft, AutoPickResult } from "@/lib/types";

type AutoPickApiResult =
  | {
      ok: true;
      suggestion: AutoPickResult;
    }
  | {
      ok: false;
      message: string;
    };

export async function fetchNextAutoPick(): Promise<AutoPickResult> {
  const response = await fetch("/api/auto-pick/next", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  const result = (await response.json()) as AutoPickApiResult;
  if (!response.ok || !result.ok) {
    throw new Error(result.ok ? "Could not create an auto pick." : result.message);
  }

  return result.suggestion;
}

export function storeAutoPickDraft(result: AutoPickResult) {
  if (typeof window === "undefined") {
    return;
  }

  const draft = buildAutoPickDraft(result);
  window.sessionStorage.setItem(AUTO_PICK_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function restoreStoredAutoPickDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(AUTO_PICK_DRAFT_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const draft = JSON.parse(rawValue) as AutoPickDraft;
    window.sessionStorage.removeItem(AUTO_PICK_DRAFT_STORAGE_KEY);
    return draft;
  } catch (error) {
    console.warn("Could not restore auto-pick draft.", error);
    return null;
  }
}
