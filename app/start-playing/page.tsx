import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StartPlayingChoiceClient } from "@/components/StartPlayingChoiceClient";
import { normalizeLanguage } from "@/lib/i18n";
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

  const { data: profile } = await supabase
    .from("users")
    .select("preferred_language")
    .eq("id", user.id)
    .maybeSingle();
  const language = normalizeLanguage((profile as { preferred_language?: string | null } | null)?.preferred_language);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl py-4">
        <StartPlayingChoiceClient language={language} />
      </div>
    </AppShell>
  );
}
