"use client";

export type AppToastTone = "success" | "error" | "tip";

export type AppToastDetail = {
  id?: string;
  tone: AppToastTone;
  text: string;
  durationMs?: number | null;
  dismissLabel?: string;
  dismissStorageKey?: string;
};

export type AppToastEventDetail =
  | AppToastDetail
  | {
      action: "dismiss";
      id: string;
    };

export const APP_TOAST_EVENT = "pickit:toast";
const PENDING_APP_TOASTS_KEY = "__pickit_pending_toasts__";
const APP_TOASTS_READY_KEY = "__pickit_toasts_ready__";

type ToastWindow = Window & {
  [PENDING_APP_TOASTS_KEY]?: AppToastDetail[];
  [APP_TOASTS_READY_KEY]?: boolean;
};

export function showAppToast(detail: AppToastDetail) {
  if (typeof window === "undefined") {
    return;
  }

  const toastWindow = window as ToastWindow;

  if (!toastWindow[APP_TOASTS_READY_KEY]) {
    toastWindow[PENDING_APP_TOASTS_KEY] = [...(toastWindow[PENDING_APP_TOASTS_KEY] ?? []), detail];
    return;
  }

  window.dispatchEvent(new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail }));
}

export function dismissAppToast(id: string) {
  if (typeof window === "undefined") {
    return;
  }

  const toastWindow = window as ToastWindow;
  toastWindow[PENDING_APP_TOASTS_KEY] = (toastWindow[PENDING_APP_TOASTS_KEY] ?? []).filter((toast) => toast.id !== id);

  if (!toastWindow[APP_TOASTS_READY_KEY]) {
    return;
  }

  window.dispatchEvent(new CustomEvent<AppToastEventDetail>(APP_TOAST_EVENT, { detail: { action: "dismiss", id } }));
}

export function markAppToastsReady() {
  if (typeof window === "undefined") {
    return [];
  }

  const toastWindow = window as ToastWindow;
  toastWindow[APP_TOASTS_READY_KEY] = true;
  const pendingToasts = toastWindow[PENDING_APP_TOASTS_KEY] ?? [];
  toastWindow[PENDING_APP_TOASTS_KEY] = [];
  return pendingToasts;
}
