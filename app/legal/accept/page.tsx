import { redirect } from "next/navigation";
import { LegalAcceptanceForm } from "@/components/LegalAcceptanceForm";
import { DEFAULT_LEGAL_DOCUMENT_TYPE, getRequiredLegalDocument, getUserLegalAcceptanceStatus } from "@/lib/legal";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LegalAcceptPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const nextPath = typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : undefined;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/legal/accept")}`);
  }

  const [document, acceptanceStatus] = await Promise.all([
    getRequiredLegalDocument(DEFAULT_LEGAL_DOCUMENT_TYPE),
    getUserLegalAcceptanceStatus(user.id, DEFAULT_LEGAL_DOCUMENT_TYPE)
  ]);

  if (!document) {
    return (
      <main className="min-h-screen bg-white px-4 py-8">
        <section className="mx-auto max-w-2xl space-y-5">
          <div className="rounded-lg bg-gray-100 p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Terms</p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">Terms are not configured yet.</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
              Ask a super admin to finish the legal setup before using this screen.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <section className="mx-auto max-w-2xl">
        <LegalAcceptanceForm
          documentType={document.documentType}
          currentVersion={document.requiredVersion}
          title={document.title}
          body={document.body}
          nextPath={nextPath}
          alreadyAccepted={!acceptanceStatus.needsAcceptance}
        />
      </section>
    </main>
  );
}
