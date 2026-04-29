"use client";

export type AppToastTone = "success" | "error" | "tip";

export type AppToastDetail = {
  tone: AppToastTone;
  text: string;
  durationMs?: number;
};

export const APP_TOAST_EVENT = "pickit:toast";

export function showAppToast(detail: AppToastDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail }));
}
