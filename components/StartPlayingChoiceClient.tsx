"use client";

import { useRouter } from "next/navigation";
import { Network, PenSquare } from "lucide-react";

export function StartPlayingChoiceClient() {
  const router = useRouter();

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Get started</p>
        <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Choose how you want to start</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
          Start simple now and upgrade later. Your bracket build and your full match predictions live in the same shared tournament account.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => router.push("/bracket-builder")}
          className="rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-accent hover:bg-accent-light/10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent-dark">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent-dark">Option 1</p>
              <h2 className="text-xl font-black text-gray-950">Bracket Builder</h2>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold leading-6 text-gray-600">
            Pick the qualifying order in each group to build your projected bracket.
          </p>
          <p className="mt-4 text-sm font-black text-gray-950">Faster/Easier • Lower point upside</p>
        </button>

        <button
          type="button"
          onClick={() => router.push("/groups")}
          className="rounded-2xl border border-gray-200 bg-white p-5 text-left transition hover:border-accent hover:bg-accent-light/10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-900">
              <PenSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">Option 2</p>
              <h2 className="text-xl font-black text-gray-950">Full Scoring Predictions</h2>
            </div>
          </div>
          <p className="mt-4 text-sm font-semibold leading-6 text-gray-600">
            Add exact match predictions for more ways to score points.
          </p>
          <p className="mt-4 text-sm font-black text-gray-950">72 Match Scores • Bigger point upside</p>
        </button>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-900">
        Start simple now — you can always add full predictions later before matches lock.
      </div>
    </section>
  );
}
