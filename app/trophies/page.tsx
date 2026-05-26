import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { normalizeLanguage } from "@/lib/i18n";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { t } from "@/lib/strings";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function TrophiesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    await redirectIfLaunchOnboardingRequired({ userId: user.id });
  }
  const { data: profile } = user
    ? await supabase.from("users").select("preferred_language").eq("id", user.id).maybeSingle()
    : { data: null };
  const language = normalizeLanguage((profile as { preferred_language?: string | null } | null)?.preferred_language);

  return (
    <AppShell>
      <div className="flex min-h-[55vh] items-center justify-center px-1">
        <section className="ui-card w-full max-w-md p-6 text-center">
          <h1 className="text-3xl font-black leading-none tracking-[-0.04em] text-gray-950">
            {t(language, "dashboard.comingSoon")}
          </h1>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-bold text-gray-800 transition hover:border-accent hover:bg-accent-soft sm:w-auto"
          >
            {t(language, "common.back")}
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
