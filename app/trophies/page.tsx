import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ManagementIntro } from "@/components/player-management/Shared";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function TrophiesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    await redirectIfLaunchOnboardingRequired({ userId: user.id });
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <ManagementIntro
          eyebrow="Additional Trophies"
          title="Side picks are coming."
          description="Tournament winner, Golden Boot, and MVP picks will join the game in a later phase."
          disclosureStorageKey="trophies-top-card-disclosure"
        />
        <Link
          href="/groups"
          className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-bold text-gray-800 sm:w-auto"
        >
          Back to Groups
        </Link>
      </div>
    </AppShell>
  );
}
