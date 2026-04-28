import { AppShell } from "@/components/AppShell";
import { MyGroupsClient } from "@/components/MyGroupsClient";

export default async function MyGroupsPage({
  searchParams
}: {
  searchParams?: Promise<{ invite?: string; lang?: string }>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <AppShell>
      <MyGroupsClient inviteToken={resolvedSearchParams?.invite} inviteLanguage={resolvedSearchParams?.lang} />
    </AppShell>
  );
}
