"use client";

import { X } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

type DismissibleHelperTextProps = {
  storageKey: string;
  children: ReactNode;
  dismissLabel?: string;
};

export function DismissibleHelperText({
  storageKey,
  children,
  dismissLabel = "Hide tip"
}: DismissibleHelperTextProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      setIsDismissed(window.localStorage.getItem(storageKey) === "hidden");
    } catch (error) {
      console.warn(`Could not restore helper text state for ${storageKey}.`, error);
    } finally {
      setHasHydrated(true);
    }
  }, [storageKey]);

  if (hasHydrated && isDismissed) {
    return null;
  }

  return (
    <div className="relative min-w-0 pr-8">
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(storageKey, "hidden");
          } catch (error) {
            console.warn(`Could not persist helper text state for ${storageKey}.`, error);
          }
          setIsDismissed(true);
        }}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="absolute right-0 top-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white/80 text-gray-400 transition hover:border-gray-300 hover:text-gray-600"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>

      <div className="min-w-0 text-sm leading-6 text-gray-600">{children}</div>
    </div>
  );
}
