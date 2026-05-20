"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brackets, Dices, PenSquare, Users } from "lucide-react";
import { savePlayerStartModeAction } from "@/app/start-playing/actions";
import { showAppToast } from "@/lib/app-toast";

type StartModeCard = {
  key: "full_scoring" | "easy_bracket" | "strategy_mode" | "groups";
  title: string;
  description: string;
  cta: string;
  nextPath: string;
  previewPath: string;
  icon: typeof PenSquare;
  accentClass: string;
};

const START_MODE_CARDS: StartModeCard[] = [
  {
    key: "full_scoring",
    title: "My Picks",
    description: "Predict each match as it happens.",
    cta: "Make Picks",
    nextPath: "/groups?onboarding=1",
    previewPath: "/play-preview?mode=full_scoring&onboarding=1",
    icon: PenSquare,
    accentClass: "bg-accent/10 text-accent-dark"
  },
  {
    key: "easy_bracket",
    title: "Easy Bracket",
    description: "Focus on the knockout phase.",
    cta: "Just Build a Bracket",
    nextPath: "/bracket-builder?onboarding=1",
    previewPath: "/play-preview?mode=easy_bracket&onboarding=1",
    icon: Brackets,
    accentClass: "bg-emerald-100 text-emerald-700"
  },
  {
    key: "strategy_mode",
    title: "Strategy Mode",
    description: "Choose outcomes from probabilities.",
    cta: "Use Probabilities",
    nextPath: "/strategy?onboarding=1",
    previewPath: "/play-preview?mode=strategy_mode&onboarding=1",
    icon: Dices,
    accentClass: "bg-amber-100 text-amber-700"
  },
  {
    key: "groups",
    title: "Groups",
    description: "Play with friends using your rules.",
    cta: "Create or Join Groups",
    nextPath: "/my-groups?onboarding=1&create=1",
    previewPath: "/play-preview?mode=groups&onboarding=1",
    icon: Users,
    accentClass: "bg-sky-100 text-sky-700"
  }
];

export function StartPlayingChoiceClient() {
  const router = useRouter();
  const [isSavingMode, setIsSavingMode] = useState<StartModeCard["key"] | null>(null);

  async function handleSelectStartMode(card: StartModeCard) {
    setIsSavingMode(card.key);
    const result = await savePlayerStartModeAction(card.key);
    setIsSavingMode(null);

    if (!result.ok) {
      showAppToast({ tone: "error", text: result.message });
      return;
    }

    router.push(card.nextPath);
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Get started</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Choose how you want to play</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          Pick the style that feels right now. You can preview any mode before you commit.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {START_MODE_CARDS.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.key} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-full ${card.accentClass}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-950">{card.title}</h2>
                  <p className="mt-1 text-sm font-semibold text-gray-600">{card.description}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <button
                  type="button"
                  disabled={isSavingMode !== null}
                  onClick={() => {
                    void handleSelectStartMode(card);
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-black text-white transition hover:bg-accent/95 disabled:opacity-60"
                >
                  {isSavingMode === card.key ? "Opening..." : card.cta}
                </button>
                <Link
                  href={card.previewPath}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
                >
                  Preview
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900">
        Preview only. This will not count toward leaderboards.
      </div>
    </section>
  );
}
