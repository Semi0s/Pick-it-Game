import { redirect } from "next/navigation";
import { FinaleRecapClient } from "@/components/finale/FinaleRecapClient";
import { fetchChampionshipFinaleSummary } from "@/lib/championship-finale";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function FinalePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Ffinale");
  }

  const summary = await fetchChampionshipFinaleSummary(user.id);

  if (!summary) {
    redirect("/dashboard");
  }

  return <FinaleRecapClient summary={summary} />;
}
