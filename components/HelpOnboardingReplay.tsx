"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { t } from "@/lib/strings";

const OnboardingReplayCarousel = dynamic(
  () => import("@/components/StartPlayingChoiceClient").then((module) => module.OnboardingReplayCarousel),
  { ssr: false }
);

export function HelpOnboardingReplay({ language = "en" }: { language?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [replayEpoch, setReplayEpoch] = useState(0);

  function handleReplay() {
    setIsOpen(true);
    setReplayEpoch((value) => value + 1);
  }

  return (
    <section className="ui-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{t(language, "help.replayOnboardingTitle")}</p>
          <p className="mt-1 text-sm font-normal leading-5 text-gray-600">{t(language, "help.replayOnboardingBody")}</p>
        </div>
        <button
          type="button"
          onClick={handleReplay}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[0.95rem] bg-accent px-4 py-2 text-sm font-black text-accent-text transition hover:bg-accent/95 focus:outline-none focus:ring-2 focus:ring-accent-dark focus:ring-offset-2"
        >
          {isOpen ? t(language, "help.replayAgain") : t(language, "help.replayOnboardingButton")}
        </button>
      </div>

      {isOpen ? (
        <OnboardingReplayCarousel language={language} replayEpoch={replayEpoch} onClose={() => setIsOpen(false)} />
      ) : null}
    </section>
  );
}
