import { AppShell } from "@/components/AppShell";
import { MyGroupsClient } from "@/components/MyGroupsClient";
import { redirectIfLegacyScoringSetupRequired } from "@/lib/group-scoring-setup-gate";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MyGroupsPage({
  searchParams
}: {
  searchParams?: Promise<{ invite?: string; lang?: string; helperLang?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const searchParamsString = resolvedSearchParams
      ? new URLSearchParams(
          Object.entries(resolvedSearchParams).flatMap(([key, value]) => (value ? [[key, value]] : []))
        ).toString()
      : "";
    const search = searchParamsString ? `?${searchParamsString}` : "";
    await redirectIfLegacyScoringSetupRequired({ userId: user.id, pathname: "/my-groups", search });
  }

  return (
    <AppShell>
      <MyGroupsClient
        inviteToken={resolvedSearchParams?.invite}
        inviteLanguage={resolvedSearchParams?.lang}
        inviteHelperLanguage={resolvedSearchParams?.helperLang}
      />
    </AppShell>
  );
}
