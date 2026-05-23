"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Brackets, ListOrdered, Trophy, Users } from "lucide-react";
import { savePlayerStartModeAction } from "@/app/start-playing/actions";
import { showAppToast } from "@/lib/app-toast";

type OnboardingStep = {
  eyebrow: string;
  title: string;
  body: string;
  helper?: string | null;
  icon: typeof Brackets;
  accentClass: string;
};

export function StartPlayingChoiceClient() {
  const router = useRouter();
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo<OnboardingStep[]>(
    () => [
      {
        eyebrow: "Start here",
        title: "Choose how you want to play",
        body: "Start with the Group Stage. Pick the qualifying teams.",
        helper: "↘ Start Here",
        icon: Brackets,
        accentClass: "bg-emerald-100 text-emerald-700"
      },
      {
        eyebrow: "Step 2",
        title: "Rank each group",
        body: "Rank each group and predict who reaches the Round of 32.",
        icon: Trophy,
        accentClass: "bg-cyan-100 text-cyan-800"
      },
      {
        eyebrow: "Step 3",
        title: "Keep playing in Knockout",
        body: "When the knockout bracket is official, keep playing match by match.",
        helper: "Knockout opens when the bracket is set.",
        icon: ArrowRight,
        accentClass: "bg-amber-100 text-amber-700"
      },
      {
        eyebrow: "Step 4",
        title: "Check leaderboards",
        body: "Check Leaderboards to see where you and your friends rank.",
        icon: ListOrdered,
        accentClass: "bg-violet-100 text-violet-700"
      },
      {
        eyebrow: "Step 5",
        title: "Make groups and invite friends",
        body: "Make groups and invite friends from your account.",
        icon: Users,
        accentClass: "bg-sky-100 text-sky-700"
      }
    ],
    []
  );

  async function handleStartGroupPhase() {
    setIsSavingMode(true);
    const result = await savePlayerStartModeAction("easy_bracket");
    setIsSavingMode(false);

    if (!result.ok) {
      showAppToast({ tone: "error", text: result.message });
      return;
    }

    router.push("/bracket-builder?onboarding=1");
  }

  const step = steps[stepIndex]!;
  const StepIcon = step.icon;

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Get started</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Choose how you want to play</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          We’ll walk you through the launch flow and get you into the Group Stage quickly.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${step.accentClass}`}>
            <StepIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{step.eyebrow}</p>
            <h2 className="mt-2 text-2xl font-black text-gray-950">{step.title}</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-gray-700">{step.body}</p>
            {step.helper ? (
              <p className="mt-4 text-sm font-black uppercase tracking-[0.12em] text-emerald-700">{step.helper}</p>
            ) : null}
          </div>
        </div>

        {stepIndex === 0 ? (
          <div className="mt-6">
            <button
              type="button"
              disabled={isSavingMode}
              onClick={() => {
                void handleStartGroupPhase();
              }}
              className="inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 text-sm font-black text-white transition hover:bg-accent/95 disabled:opacity-60"
            >
              {isSavingMode ? "Opening..." : "Start Group Stage"}
            </button>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={stepIndex === 0}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:opacity-40"
          >
            Back
          </button>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-gray-400">
            {stepIndex + 1} / {steps.length}
          </p>
          <button
            type="button"
            onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
            disabled={stepIndex === steps.length - 1}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
