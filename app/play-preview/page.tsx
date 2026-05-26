import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PlayModePreviewClient } from "@/components/PlayModePreviewClient";
import { shouldHideStrategyModeForLaunch } from "@/lib/group-prediction-mode";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlayPreviewPage({
  searchParams
}: {
  searchParams?: Promise<{ mode?: string; onboarding?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const mode = resolvedSearchParams?.mode;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Fstart-playing&mode=signup");
  }

  if (mode === "full_scoring") {
    redirect(resolvedSearchParams?.onboarding === "1" ? "/bracket-builder?onboarding=1" : "/bracket-builder");
  }

  if (mode !== "full_scoring" && mode !== "easy_bracket" && mode !== "strategy_mode" && mode !== "groups") {
    redirect("/start-playing");
  }

  if (shouldHideStrategyModeForLaunch() && mode === "strategy_mode") {
    redirect("/start-playing");
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-4">
        <PlayModePreviewClient mode={mode} />
      </div>
    </AppShell>
  );
}
