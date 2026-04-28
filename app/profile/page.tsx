import { AppShell } from "@/components/AppShell";
import { ProfileSummary } from "@/components/ProfileSummary";
import { getLegalLanguageForUser } from "@/lib/i18n";
import { DEFAULT_LEGAL_DOCUMENT_TYPE, getRequiredLegalDocument } from "@/lib/legal";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("users").select("preferred_language").eq("id", user.id).maybeSingle()
    : { data: null };
  const preferredLanguage = getLegalLanguageForUser({
    preferredLanguage: (profile as { preferred_language?: string | null } | null)?.preferred_language ?? null
  });
  const initialLegalDocument = await getRequiredLegalDocument(DEFAULT_LEGAL_DOCUMENT_TYPE, preferredLanguage);

  return (
    <AppShell>
      <ProfileSummary initialLegalDocument={initialLegalDocument} />
    </AppShell>
  );
}
