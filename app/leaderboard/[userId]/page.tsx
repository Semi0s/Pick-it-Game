import { AppShell } from "@/components/AppShell";
import { UserPredictionsClient } from "@/components/UserPredictionsClient";

type UserPredictionsPageProps = {
  params: Promise<{
    userId: string;
  }>;
};

export default async function UserPredictionsPage({ params }: UserPredictionsPageProps) {
  const { userId } = await params;

  return (
    <AppShell>
      <UserPredictionsClient userId={userId} />
    </AppShell>
  );
}
