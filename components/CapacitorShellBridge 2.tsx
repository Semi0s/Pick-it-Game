"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Keyboard } from "@capacitor/keyboard";

const APP_HOSTS = new Set(["pick-it-game2026.vercel.app"]);

export function CapacitorShellBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const platformClass = `capacitor-${Capacitor.getPlatform()}`;

    document.body.classList.add("capacitor-native");
    document.body.classList.add(platformClass);

    const openAppUrl = (url: string) => {
      const internalPath = getInternalPathFromUrl(url);
      if (internalPath) {
        router.push(internalPath);
      }
    };

    const appUrlListener = App.addListener("appUrlOpen", ({ url }) => {
      openAppUrl(url);
    });

    const backButtonListener = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back();
        return;
      }

      void App.exitApp();
    });

    const keyboardShowListener = Keyboard.addListener("keyboardWillShow", () => {
      document.body.classList.add("capacitor-keyboard-open");
    });
    const keyboardHideListener = Keyboard.addListener("keyboardWillHide", () => {
      document.body.classList.remove("capacitor-keyboard-open");
    });

    const clickHandler = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || event.defaultPrevented || shouldLetWebHandle(anchor)) {
        return;
      }

      event.preventDefault();
      void Browser.open({ url: anchor.href });
    };

    document.addEventListener("click", clickHandler);

    return () => {
      document.body.classList.remove("capacitor-native", platformClass, "capacitor-keyboard-open");
      document.removeEventListener("click", clickHandler);
      void appUrlListener.then((listener) => listener.remove());
      void backButtonListener.then((listener) => listener.remove());
      void keyboardShowListener.then((listener) => listener.remove());
      void keyboardHideListener.then((listener) => listener.remove());
    };
  }, [router]);

  return null;
}

function getInternalPathFromUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol === "pickit:") {
      const pathSegments = [url.hostname, url.pathname.replace(/^\//, "")].filter(Boolean);
      return `/${pathSegments.join("/")}${url.search}${url.hash}`;
    }

    if ((url.protocol === "https:" || url.protocol === "http:") && APP_HOSTS.has(url.hostname)) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return null;
  }

  return null;
}

function shouldLetWebHandle(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute("href") ?? "";
  if (!href || href.startsWith("#") || href.startsWith("/") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return true;
  }

  try {
    const url = new URL(anchor.href);
    return url.origin === window.location.origin || APP_HOSTS.has(url.hostname);
  } catch {
    return true;
  }
}
