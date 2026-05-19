import { AppShell } from "@/components/AppShell";
import { ProfileSummary } from "@/components/ProfileSummary";
import { fetchDashboardGroupAccessDataForCurrentUser } from "@/app/my-groups/actions";
import { isSelfServiceTestResetEnabled } from "@/lib/admin/destructive-tools";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { getLegalLanguageForUser } from "@/lib/i18n";
import { DEFAULT_LEGAL_DOCUMENT_TYPE, getRequiredLegalDocument } from "@/lib/legal";
import { isLikelySchemaDriftError, logSafeSupabaseError } from "@/lib/supabase-errors";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let preferredLanguage = getLegalLanguageForUser({ preferredLanguage: null });
  let initialLegalDocument = null;
  let managedGroupCount = 0;

  if (user) {
    await redirectIfLegacyScoringSetupRequired({ userId: user.id, pathname: "/profile" });
    try {
      const [{ data: profile }, groupAccessResult] = await Promise.all([
        supabase.from("users").select("preferred_language").eq("id", user.id).maybeSingle(),
        fetchDashboardGroupAccessDataForCurrentUser()
      ]);
      preferredLanguage = getLegalLanguageForUser({
        preferredLanguage: (profile as { preferred_language?: string | null } | null)?.preferred_language ?? null
      });
      initialLegalDocument = await getRequiredLegalDocument(DEFAULT_LEGAL_DOCUMENT_TYPE, preferredLanguage);
      if (groupAccessResult.ok) {
        managedGroupCount = groupAccessResult.groupAccess.managedGroupCount;
      }
    } catch (error) {
      logSafeSupabaseError("profile-page-load", error, { userId: user.id });
      if (!isLikelySchemaDriftError(error, ["users", "legal_documents", "user_legal_acceptances"])) {
        throw error;
      }
    }
  }
  const selfServiceTestResetEnabled = isSelfServiceTestResetEnabled();
  const showSelfServiceTestResetHint = process.env.NODE_ENV !== "production" && !selfServiceTestResetEnabled;

  return (
    <AppShell>
      <ProfileSummary
        initialLegalDocument={initialLegalDocument}
        managedGroupCount={managedGroupCount}
        selfServiceTestResetEnabled={selfServiceTestResetEnabled}
        showSelfServiceTestResetHint={showSelfServiceTestResetHint}
      />
    </AppShell>
  );
}
