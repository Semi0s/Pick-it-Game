import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StartPlayingChoiceClient } from "@/components/StartPlayingChoiceClient";
import { markLaunchOnboardingSeen } from "@/lib/launch-onboarding-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StartPlayingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fstart-playing&mode=signup");
  }

  await markLaunchOnboardingSeen(createAdminClient(), user.id).catch(() => undefined);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-4">
        <StartPlayingChoiceClient />
      </div>
    </AppShell>
  );
}
