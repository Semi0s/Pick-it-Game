"use client";

import { useEffect, useState } from "react";
import { TrophyBadge } from "@/components/TrophyBadge";

type TrophyCelebrationProps = {
  open: boolean;
  trophy: {
    name: string;
    icon: string;
    tier?: "bronze" | "silver" | "gold" | "special" | null;
  } | null;
  onDismiss: () => void;
};

export function TrophyCelebration({ open, trophy, onDismiss }: TrophyCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !trophy) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    const timeout = window.setTimeout(() => {
      setIsVisible(false);
      onDismiss();
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [open, trophy, onDismiss]);

  if (!open || !trophy) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onDismiss}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-5 text-left"
      aria-label="Dismiss trophy celebration"
    >
      <div
        className={`relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/20 bg-white/95 px-6 py-7 text-center shadow-2xl backdrop-blur ${
          prefersReducedMotion
            ? ""
            : `transition-all duration-300 ease-out ${isVisible ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"}`
        }`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-8 h-24 w-24 -translate-x-1/2 rounded-full bg-accent-light/70 blur-2xl"
        />
        <div className="relative">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-accent-dark">Trophy earned</p>
          <div className="mt-5 flex justify-center">
            <TrophyBadge icon={trophy.icon} tier={trophy.tier} size="lg" />
          </div>
          <p className="mt-5 text-2xl font-black text-gray-950">{trophy.name}</p>
        </div>
      </div>
    </button>
  );
}
