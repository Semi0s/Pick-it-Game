import { ProfileSetupForm } from "@/components/ProfileSetupForm";

export default async function ProfileSetupPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const nextPath = typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : undefined;

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center">
        <ProfileSetupForm nextPath={nextPath} />
      </div>
    </main>
  );
}
