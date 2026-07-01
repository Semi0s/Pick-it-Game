import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SidePicksClient } from "@/components/SidePicksClient";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { fetchPredictionLabPageData } from "@/lib/prediction-lab-data";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SidePicksPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fside-picks&mode=signup");
  }

  await redirectIfLaunchOnboardingRequired({ userId: user.id });
  const data = await fetchPredictionLabPageData(user.id);

  return (
    <AppShell>
      <SidePicksClient {...data} />
    </AppShell>
  );
}
