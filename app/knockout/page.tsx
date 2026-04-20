import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function KnockoutPage() {
  return (
    <AppShell>
      <section className="rounded-lg bg-gray-100 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Knockout Stage</p>
        <h2 className="mt-2 text-3xl font-black leading-tight">Bracket picks are next.</h2>
        <p className="mt-3 text-base leading-7 text-gray-600">
          Round of 32 through the Final will be added after the group prediction flow is locked in.
        </p>
        <Link
          href="/groups"
          className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-3 text-base font-bold text-white sm:w-auto"
        >
          Review Group Picks
        </Link>
      </section>
    </AppShell>
  );
}
