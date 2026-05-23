"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Brackets, Dices, PenSquare, Users } from "lucide-react";
import { shouldHideStrategyModeForLaunch } from "@/lib/group-prediction-mode";

type PreviewMode = "full_scoring" | "easy_bracket" | "strategy_mode" | "groups";

const PREVIEW_CONTENT: Record<
  PreviewMode,
  {
    title: string;
    description: string;
    detail: string;
    nextPath: string;
    icon: typeof PenSquare;
    accentClass: string;
  }
> = {
  full_scoring: {
    title: "My Picks",
    description: "Predict each match as it happens.",
    detail: "Best if you want full control and full match-by-match upside.",
    nextPath: "/groups",
    icon: PenSquare,
    accentClass: "bg-accent/10 text-accent-dark"
  },
  easy_bracket: {
    title: "Group Stage",
    description: "Start with the Group Stage and pick the qualifying teams.",
    detail: "This is the launch starting point for regular players.",
    nextPath: "/bracket-builder",
    icon: Brackets,
    accentClass: "bg-emerald-100 text-emerald-700"
  },
  strategy_mode: {
    title: "Global Challenge",
    description: "Build your Group Strategy before kickoff, then predict knockout matches when the bracket opens.",
    detail: "You choose outcomes from probabilities rather than predicting scores.",
    nextPath: "/strategy",
    icon: Dices,
    accentClass: "bg-amber-100 text-amber-700"
  },
  groups: {
    title: "Groups",
    description: "Play with friends using your rules.",
    detail: "Best if you want a social layer with private rules and invite flow.",
    nextPath: "/my-groups",
    icon: Users,
    accentClass: "bg-sky-100 text-sky-700"
  }
};

export function PlayModePreviewClient({ mode }: { mode: PreviewMode }) {
  const searchParams = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const content = PREVIEW_CONTENT[shouldHideStrategyModeForLaunch() && mode === "strategy_mode" ? "easy_bracket" : mode];
  const Icon = content.icon;
  const nextPath = `${content.nextPath}${isOnboarding ? "?onboarding=1" : ""}`;

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center text-sm font-semibold text-amber-900">
        Preview only. This will not count toward leaderboards.
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${content.accentClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-3xl font-black text-gray-950">{content.title}</h1>
        <p className="mt-3 text-base font-semibold text-gray-700">{content.description}</p>
        <p className="mt-3 text-sm font-medium leading-6 text-gray-600">{content.detail}</p>

        <div className="mt-6 grid gap-2 sm:grid-cols-[auto_auto] sm:justify-start">
          <Link
            href={isOnboarding ? "/start-playing" : "/dashboard"}
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
          >
            {isOnboarding ? "Back" : "Close Preview"}
          </Link>
          <Link
            href={nextPath}
            className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-3 text-sm font-black text-white transition hover:bg-accent/95"
          >
            Open {content.title}
          </Link>
        </div>
      </div>
    </section>
  );
}
