import { AppShell } from "@/components/AppShell";
import { UserPredictionsClient } from "@/components/UserPredictionsClient";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type UserPredictionsPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export default async function UserPredictionsPage({ params }: UserPredictionsPageProps) {
  const { userId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user?.id === userId) {
    redirect("/leaderboard");
  }

  return (
    <AppShell>
      <UserPredictionsClient userId={userId} />
    </AppShell>
  );
}
