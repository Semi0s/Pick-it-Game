import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function TrophiesPage() {
  return (
    <AppShell>
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Additional Trophies</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Side picks are coming.</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Tournament winner, Golden Boot, and MVP picks will join the game in a later phase.
        </p>
        <Link
          href="/groups"
          className="mt-5 inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-bold text-gray-800 sm:w-auto"
        >
          Back to Groups
        </Link>
      </section>
    </AppShell>
  );
}
